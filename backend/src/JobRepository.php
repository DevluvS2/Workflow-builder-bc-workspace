<?php
declare(strict_types=1);

require_once __DIR__ . '/BackendConfig.php';

final class JobCapacityException extends DomainException {}
final class JobStorageCorruptionException extends RuntimeException {}

final class JobRepository
{
    private const ID_PATTERN = '/^[a-f0-9]{32}$/D';
    private const TERMINAL = ['finished', 'failed', 'cancelled'];
    private const STATUSES = ['queued', 'running', 'finished', 'failed', 'cancelled'];

    public static function create(array $workflow, array $execution): array
    {
        self::ensureDirectory();
        self::cleanupOldJobs();

        return self::withGlobalLock(static function () use ($workflow, $execution): array {
            if (self::countActiveJobsUnlocked() >= BackendConfig::maxActiveJobs()) {
                throw new JobCapacityException('The local execution service already has the maximum number of active runs.');
            }

            $id = bin2hex(random_bytes(16));
            $now = gmdate('c');
            $job = [
                'schemaVersion' => 1,
                'jobId' => $id,
                'status' => 'queued',
                'createdAt' => $now,
                'updatedAt' => $now,
                'startedAt' => null,
                'completedAt' => null,
                'cancelRequested' => false,
                'workerPid' => null,
                'request' => ['workflow' => $workflow, 'execution' => $execution],
                'progress' => [
                    'executionOrder' => [],
                    'totalNodes' => 0,
                    'completedNodeIds' => [],
                    'currentWidgetId' => null,
                    'completedNodes' => [],
                ],
                'result' => null,
                'error' => null,
            ];
            self::withLock($id, static function () use ($id, $job): void {
                self::writeUnlocked($id, $job);
            });
            return $job;
        });
    }

    public static function read(string $id): ?array
    {
        if (!self::validId($id)) return null;
        return self::withLock($id, static fn() => self::readUnlocked($id));
    }

    public static function mutate(string $id, callable $mutator): ?array
    {
        if (!self::validId($id)) return null;
        return self::withLock($id, static function () use ($id, $mutator) {
            $job = self::readUnlocked($id);
            if ($job === null) return null;
            $next = $mutator($job);
            if (is_array($next)) $job = $next;
            $job['updatedAt'] = gmdate('c');
            self::assertRecord($id, $job);
            self::writeUnlocked($id, $job);
            return $job;
        });
    }

    public static function claim(string $id): ?array
    {
        return self::mutate($id, static function (array $job): array {
            if (($job['status'] ?? null) !== 'queued') return $job;
            if (($job['cancelRequested'] ?? false) === true) {
                $job['status'] = 'cancelled';
                $job['completedAt'] = gmdate('c');
                return $job;
            }
            $job['status'] = 'running';
            $job['startedAt'] = gmdate('c');
            $job['workerPid'] = getmypid();
            return $job;
        });
    }

    public static function requestCancel(string $id): ?array
    {
        return self::mutate($id, static function (array $job): array {
            if (in_array(($job['status'] ?? ''), self::TERMINAL, true)) return $job;
            $job['cancelRequested'] = true;
            if (($job['status'] ?? null) === 'queued') {
                $job['status'] = 'cancelled';
                $job['completedAt'] = gmdate('c');
            }
            return $job;
        });
    }

    public static function shouldCancel(string $id): bool
    {
        try {
            $job = self::read($id);
        } catch (JobStorageCorruptionException $exception) {
            return true;
        }
        return $job === null || ($job['cancelRequested'] ?? false) === true;
    }

    public static function markLaunchFailure(string $id, string $message = ''): void
    {
        self::mutate($id, static function (array $job): array {
            $job['status'] = 'failed';
            $job['completedAt'] = gmdate('c');
            $job['error'] = ['code' => 'WORKER_LAUNCH_FAILED', 'message' => 'The local background worker could not be launched.'];
            return $job;
        });
    }

    public static function publicView(array $job): array
    {
        self::assertRecord((string)($job['jobId'] ?? ''), $job);
        $status = (string)$job['status'];
        $progress = $job['progress'];
        $view = [
            'ok' => true,
            'jobId' => $job['jobId'],
            'status' => $status,
            'createdAt' => $job['createdAt'] ?? null,
            'updatedAt' => $job['updatedAt'] ?? null,
            'startedAt' => $job['startedAt'] ?? null,
            'completedAt' => $job['completedAt'] ?? null,
            'cancelRequested' => $job['cancelRequested'] === true,
            'progress' => [
                'executionOrder' => array_values($progress['executionOrder'] ?? []),
                'totalNodes' => (int)($progress['totalNodes'] ?? 0),
                'completedNodeIds' => array_values($progress['completedNodeIds'] ?? []),
                'currentWidgetId' => $progress['currentWidgetId'] ?? null,
                'completedCount' => count($progress['completedNodeIds'] ?? []),
            ],
        ];
        if ($status === 'finished') $view['result'] = $job['result'];
        if ($status === 'failed') $view['error'] = $job['error'];
        if ($status === 'cancelled') {
            $view['partialNodes'] = array_values($progress['completedNodes'] ?? []);
            $view['message'] = 'Run cancelled. Completed node results are available as partialNodes.';
        }
        return $view;
    }

    public static function storageDirectory(): string
    {
        $custom = getenv('WORKFLOW_JOB_DIR');
        if (is_string($custom) && trim($custom) !== '') return rtrim($custom, "\\/");
        return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'jobs';
    }

    private static function validId(string $id): bool
    {
        return preg_match(self::ID_PATTERN, $id) === 1;
    }

    private static function ensureDirectory(): void
    {
        $dir = self::storageDirectory();
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException('Could not create the local job storage directory.');
        }
    }

    private static function jobPath(string $id): string
    {
        return self::storageDirectory() . DIRECTORY_SEPARATOR . $id . '.json';
    }

    private static function lockPath(string $id): string
    {
        return self::storageDirectory() . DIRECTORY_SEPARATOR . $id . '.lock';
    }

    private static function globalLockPath(): string
    {
        return self::storageDirectory() . DIRECTORY_SEPARATOR . 'repository.lock';
    }

    private static function withGlobalLock(callable $callback): mixed
    {
        self::ensureDirectory();
        $handle = @fopen(self::globalLockPath(), 'c+');
        if ($handle === false) throw new RuntimeException('Could not open the job repository lock.');
        try {
            if (!flock($handle, LOCK_EX)) throw new RuntimeException('Could not lock the job repository.');
            return $callback();
        } finally {
            @flock($handle, LOCK_UN);
            @fclose($handle);
        }
    }

    private static function withLock(string $id, callable $callback): mixed
    {
        self::ensureDirectory();
        $handle = @fopen(self::lockPath($id), 'c+');
        if ($handle === false) throw new RuntimeException('Could not open the job lock.');
        try {
            if (!flock($handle, LOCK_EX)) throw new RuntimeException('Could not lock the job record.');
            return $callback();
        } finally {
            @flock($handle, LOCK_UN);
            @fclose($handle);
        }
    }

    private static function readUnlocked(string $id): ?array
    {
        $path = self::jobPath($id);
        if (!is_file($path)) return null;
        $size = @filesize($path);
        if ($size === false || $size > BackendConfig::maxJobRecordBytes()) {
            self::quarantineUnlocked($id, $path);
            throw new JobStorageCorruptionException('Job record is invalid or too large.');
        }
        $raw = @file_get_contents($path);
        if ($raw === false) throw new RuntimeException('Could not read the job record.');
        try {
            $job = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            self::quarantineUnlocked($id, $path);
            throw new JobStorageCorruptionException('Job record contains invalid JSON.');
        }
        if (!is_array($job)) {
            self::quarantineUnlocked($id, $path);
            throw new JobStorageCorruptionException('Job record is malformed.');
        }
        try {
            self::assertRecord($id, $job);
        } catch (JobStorageCorruptionException $exception) {
            self::quarantineUnlocked($id, $path);
            throw $exception;
        }
        return $job;
    }

    private static function assertRecord(string $id, array $job): void
    {
        if (!self::validId($id) || ($job['jobId'] ?? null) !== $id) throw new JobStorageCorruptionException('Job record identity is invalid.');
        if (($job['schemaVersion'] ?? 1) !== 1) throw new JobStorageCorruptionException('Job record schema is unsupported.');
        if (!in_array(($job['status'] ?? null), self::STATUSES, true)) throw new JobStorageCorruptionException('Job record status is invalid.');
        if (!is_bool($job['cancelRequested'] ?? null)) throw new JobStorageCorruptionException('Job cancellation state is invalid.');
        if (!is_array($job['request'] ?? null) || !is_array($job['request']['workflow'] ?? null) || !is_array($job['request']['execution'] ?? null)) {
            throw new JobStorageCorruptionException('Job request is malformed.');
        }
        if (!is_array($job['progress'] ?? null)) throw new JobStorageCorruptionException('Job progress is malformed.');
        foreach (['createdAt', 'updatedAt'] as $key) {
            if (!is_string($job[$key] ?? null) || $job[$key] === '') throw new JobStorageCorruptionException('Job timestamps are invalid.');
        }
    }

    private static function writeUnlocked(string $id, array $job): void
    {
        self::assertRecord($id, $job);
        $dir = self::storageDirectory();
        $target = self::jobPath($id);
        $tmp = $dir . DIRECTORY_SEPARATOR . $id . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $json = json_encode($job, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        if (strlen($json) > BackendConfig::maxJobRecordBytes()) throw new RuntimeException('Job record exceeds the configured storage limit.');
        if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
            @unlink($tmp);
            throw new RuntimeException('Could not write the job record.');
        }
        if (PHP_OS_FAMILY === 'Windows' && is_file($target)) @unlink($target);
        if (!@rename($tmp, $target)) {
            @unlink($tmp);
            throw new RuntimeException('Could not finalize the job record.');
        }
    }

    private static function countActiveJobsUnlocked(): int
    {
        $count = 0;
        foreach (glob(self::storageDirectory() . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
            if (str_contains(basename($path), '.corrupt.')) continue;
            $raw = @file_get_contents($path);
            if ($raw === false || strlen($raw) > BackendConfig::maxJobRecordBytes()) continue;
            $job = json_decode($raw, true);
            if (is_array($job) && in_array(($job['status'] ?? null), ['queued', 'running'], true)) $count++;
        }
        return $count;
    }

    private static function quarantineUnlocked(string $id, string $path): void
    {
        if (!is_file($path)) return;
        $target = self::storageDirectory() . DIRECTORY_SEPARATOR . $id . '.corrupt.' . time() . '.json';
        @rename($path, $target);
    }

    private static function cleanupOldJobs(): void
    {
        $dir = self::storageDirectory();
        if (!is_dir($dir)) return;
        $cutoff = time() - BackendConfig::jobRetentionSeconds();
        foreach (glob($dir . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
            $mtime = @filemtime($path);
            if ($mtime !== false && $mtime < $cutoff) {
                $name = basename($path);
                @unlink($path);
                if (preg_match('/^([a-f0-9]{32})\.json$/D', $name, $match) === 1) @unlink(self::lockPath($match[1]));
            }
        }
    }
}
