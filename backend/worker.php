<?php
declare(strict_types=1);

require_once __DIR__ . '/src/JobRepository.php';
require_once __DIR__ . '/src/ErrorSanitizer.php';
require_once __DIR__ . '/src/WorkflowRunner.php';

$jobId = $argv[1] ?? '';
if (!is_string($jobId) || preg_match('/^[a-f0-9]{32}$/D', $jobId) !== 1) exit(2);

try {
    $job = JobRepository::claim($jobId);
    if ($job === null) exit(3);
    if (($job['status'] ?? null) === 'cancelled') exit(0);
    if (($job['status'] ?? null) !== 'running') exit(0);

    $request = $job['request'] ?? [];
    $workflow = $request['workflow'] ?? null;
    $execution = $request['execution'] ?? [];
    if (!is_array($workflow) || !is_array($execution)) throw new RuntimeException('Stored job request is malformed.');

    $result = WorkflowRunner::execute($workflow, $execution, [
        'shouldCancel' => static fn(): bool => JobRepository::shouldCancel($jobId),
        'onPlan' => static function (array $order) use ($jobId): void {
            JobRepository::mutate($jobId, static function (array $job) use ($order): array {
                $job['progress']['executionOrder'] = array_values($order);
                $job['progress']['totalNodes'] = count($order);
                return $job;
            });
        },
        'onNodeStarted' => static function (string $widgetId) use ($jobId): void {
            JobRepository::mutate($jobId, static function (array $job) use ($widgetId): array {
                $job['progress']['currentWidgetId'] = $widgetId;
                return $job;
            });
        },
        'onNodeFinished' => static function (string $widgetId, array $nodeResult) use ($jobId): void {
            JobRepository::mutate($jobId, static function (array $job) use ($widgetId, $nodeResult): array {
                $ids = $job['progress']['completedNodeIds'] ?? [];
                if (!in_array($widgetId, $ids, true)) $ids[] = $widgetId;
                $job['progress']['completedNodeIds'] = $ids;
                $nodes = $job['progress']['completedNodes'] ?? [];
                $nodes[] = $nodeResult;
                $job['progress']['completedNodes'] = $nodes;
                $job['progress']['currentWidgetId'] = null;
                return $job;
            });
        },
    ]);

    JobRepository::mutate($jobId, static function (array $job) use ($result): array {
        if (($job['cancelRequested'] ?? false) === true) {
            $job['status'] = 'cancelled';
            $job['result'] = null;
        } else {
            $job['status'] = 'finished';
            $job['result'] = $result;
        }
        $job['progress']['currentWidgetId'] = null;
        $job['completedAt'] = gmdate('c');
        return $job;
    });
    exit(0);
} catch (WorkflowCancelledException $exception) {
    JobRepository::mutate($jobId, static function (array $job): array {
        $job['status'] = 'cancelled';
        $job['progress']['currentWidgetId'] = null;
        $job['completedAt'] = gmdate('c');
        return $job;
    });
    exit(0);
} catch (ScriptExecutionException $exception) {
    JobRepository::mutate($jobId, static function (array $job) use ($exception): array {
        if ($exception->cancelled || ($job['cancelRequested'] ?? false) === true) {
            $job['status'] = 'cancelled';
            $job['error'] = null;
        } else {
            $job['status'] = 'failed';
            $job['error'] = ErrorSanitizer::scriptException($exception);
        }
        $job['progress']['currentWidgetId'] = null;
        $job['completedAt'] = gmdate('c');
        return $job;
    });
    exit(1);
} catch (Throwable $exception) {
    try {
        JobRepository::mutate($jobId, static function (array $job) use ($exception): array {
            if (($job['cancelRequested'] ?? false) === true) {
                $job['status'] = 'cancelled';
                $job['error'] = null;
            } else {
                $job['status'] = 'failed';
                $job['error'] = [
                    'code' => $exception instanceof DomainException ? 'UNSUPPORTED_OR_INVALID_EXECUTION' : 'RUNNER_FAILURE',
                    'message' => $exception instanceof DomainException
                        ? ErrorSanitizer::text($exception->getMessage())
                        : 'The local background worker could not complete this run.',
                ];
            }
            $job['progress']['currentWidgetId'] = null;
            $job['completedAt'] = gmdate('c');
            return $job;
        });
    } catch (Throwable $ignored) {
        // If the job record itself is corrupted/unwritable there is no safe state to persist.
    }
    exit(1);
}
