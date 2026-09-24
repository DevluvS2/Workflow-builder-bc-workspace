<?php
declare(strict_types=1);

require_once __DIR__ . '/RuntimeLocator.php';

final class ScriptExecutionException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $language,
        public readonly string $stdout = '',
        public readonly string $stderr = '',
        public readonly ?int $exitCode = null,
        public readonly bool $timedOut = false,
        public readonly bool $cancelled = false
    ) {
        parent::__construct($message);
    }
}

/**
 * Batch 7D local-development process runner with cooperative cancellation.
 *
 * Security boundary: NONE. This limits time/output and removes most inherited
 * environment variables, but it does not isolate filesystem/network/process
 * access. Replace this class behind the same interface with a real sandbox
 * before any untrusted or public deployment.
 */
final class ScriptRunner
{
    private const DEFAULT_TIMEOUT_MS = 5000;
    private const MAX_TIMEOUT_MS = 15000;
    private const MAX_SOURCE_BYTES = 30000;
    private const MAX_STREAM_BYTES = 262144; // 256 KiB each for stdout/stderr.

    public static function runtimeAvailability(): array
    {
        return RuntimeLocator::availability();
    }

    public static function assertRuntimeAvailable(string $language): void
    {
        if (RuntimeLocator::locate($language) === null) {
            $hint = $language === 'Bash' && PHP_OS_FAMILY === 'Windows'
                ? ' Install Git Bash or set WORKFLOW_BASH to a bash.exe path. The Windows WSL launcher alone is not enough without a Linux distribution.'
                : '';
            throw new DomainException("$language runtime is not available to PHP.$hint");
        }
    }

    /**
     * @param array<int,array{id:string,name?:string,value:mixed}> $inputs
     */
    public static function run(string $language, string $source, array $inputs, array $options = []): array
    {
        $language = self::normalizeLanguage($language);
        $sourceBytes = strlen($source);
        if ($sourceBytes === 0) throw new DomainException("$language source cannot be empty.");
        if ($sourceBytes > self::MAX_SOURCE_BYTES) throw new DomainException("$language source exceeds " . self::MAX_SOURCE_BYTES . ' bytes.');

        $executable = RuntimeLocator::locate($language);
        if ($executable === null) self::assertRuntimeAvailable($language);

        $timeoutMs = (int)($options['timeoutMs'] ?? self::DEFAULT_TIMEOUT_MS);
        $shouldCancel = isset($options['shouldCancel']) && is_callable($options['shouldCancel'])
            ? $options['shouldCancel']
            : static fn(): bool => false;
        if ($shouldCancel()) {
            throw new ScriptExecutionException("$language script cancelled before start.", $language, '', '', null, false, true);
        }
        $timeoutMs = max(100, min(self::MAX_TIMEOUT_MS, $timeoutMs));
        $tempDir = self::makeTempDir();

        try {
            $payload = self::buildPayload($inputs);
            $payloadJson = json_encode($payload, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
            $resultFile = $tempDir . DIRECTORY_SEPARATOR . 'result.json';
            $env = self::baseEnvironment();
            $command = [];
            $resultMode = 'file';

            if ($language === 'Python') {
                $userFile = $tempDir . DIRECTORY_SEPARATOR . 'user.py';
                $wrapperFile = $tempDir . DIRECTORY_SEPARATOR . 'runner.py';
                file_put_contents($userFile, $source, LOCK_EX);
                file_put_contents($wrapperFile, self::pythonWrapper(), LOCK_EX);
                $command = [$executable, '-I', $wrapperFile, $userFile, $resultFile];
            } elseif ($language === 'JavaScript') {
                $userFile = $tempDir . DIRECTORY_SEPARATOR . 'user.js';
                $wrapperFile = $tempDir . DIRECTORY_SEPARATOR . 'runner.js';
                file_put_contents($userFile, $source, LOCK_EX);
                file_put_contents($wrapperFile, self::javascriptWrapper(), LOCK_EX);
                $command = [$executable, $wrapperFile, $userFile, $resultFile];
            } else { // Bash
                $userFile = $tempDir . DIRECTORY_SEPARATOR . 'user.sh';
                file_put_contents($userFile, $source, LOCK_EX);
                $command = [$executable, $userFile];
                $resultMode = 'stdout';
                $env += self::bashInputEnvironment($payload);
            }

            $process = self::runProcess($command, $payloadJson, $tempDir, $env, $timeoutMs, $shouldCancel);
            if ($process['cancelled']) {
                throw new ScriptExecutionException(
                    "$language script cancelled.",
                    $language,
                    $process['stdout'],
                    $process['stderr'],
                    $process['exitCode'],
                    false,
                    true
                );
            }
            if ($process['timedOut']) {
                throw new ScriptExecutionException(
                    "$language script exceeded the {$timeoutMs} ms limit.",
                    $language,
                    $process['stdout'],
                    $process['stderr'],
                    $process['exitCode'],
                    true
                );
            }
            if ($process['outputLimitExceeded']) {
                throw new ScriptExecutionException(
                    "$language script exceeded the 256 KiB stdout/stderr limit.",
                    $language,
                    $process['stdout'],
                    $process['stderr'],
                    $process['exitCode']
                );
            }
            if (($process['exitCode'] ?? 1) !== 0) {
                $detail = trim($process['stderr']);
                $suffix = $detail !== '' ? ' ' . self::firstLine($detail) : '';
                throw new ScriptExecutionException(
                    "$language script exited with code {$process['exitCode']}.$suffix",
                    $language,
                    $process['stdout'],
                    $process['stderr'],
                    $process['exitCode']
                );
            }

            $memoryBytes = null;
            $memoryMetric = 'unavailable';
            if ($resultMode === 'file') {
                if (!is_file($resultFile)) {
                    throw new ScriptExecutionException(
                        "$language script finished without producing the runner result envelope.",
                        $language,
                        $process['stdout'],
                        $process['stderr'],
                        $process['exitCode']
                    );
                }
                try {
                    $envelope = json_decode((string)file_get_contents($resultFile), true, 128, JSON_THROW_ON_ERROR);
                } catch (JsonException $exception) {
                    throw new ScriptExecutionException(
                        "$language runner returned invalid result JSON.",
                        $language,
                        $process['stdout'],
                        $process['stderr'],
                        $process['exitCode']
                    );
                }
                if (!is_array($envelope) || !array_key_exists('ok', $envelope)) {
                    throw new ScriptExecutionException("$language runner result envelope is malformed.", $language, $process['stdout'], $process['stderr'], $process['exitCode']);
                }
                if ($envelope['ok'] !== true) {
                    $message = is_string($envelope['error'] ?? null) ? $envelope['error'] : "$language script failed.";
                    throw new ScriptExecutionException($message, $language, $process['stdout'], $process['stderr'], $process['exitCode']);
                }
                $result = $envelope['result'] ?? null;
                if (isset($envelope['memoryBytes']) && is_numeric($envelope['memoryBytes'])) {
                    $memoryBytes = max(0, (int)$envelope['memoryBytes']);
                }
                if (is_string($envelope['memoryMetric'] ?? null)) $memoryMetric = $envelope['memoryMetric'];
            } else {
                $stdout = rtrim($process['stdout'], "\r\n");
                if ($stdout === '') {
                    $result = null;
                } else {
                    try {
                        $result = json_decode($stdout, true, 128, JSON_THROW_ON_ERROR);
                    } catch (JsonException $exception) {
                        $result = $stdout;
                    }
                }
            }

            return [
                'result' => $result,
                'stdout' => $process['stdout'],
                'stderr' => $process['stderr'],
                'metrics' => [
                    'wallTimeMs' => $process['wallTimeMs'],
                    'exitCode' => $process['exitCode'],
                    'memoryBytes' => $memoryBytes,
                    'memoryMetric' => $memoryMetric,
                    'stdoutBytes' => strlen($process['stdout']),
                    'stderrBytes' => strlen($process['stderr']),
                    'timeoutLimitMs' => $timeoutMs,
                ],
                'runtime' => [
                    'language' => $language,
                    'executable' => basename($executable),
                ],
            ];
        } finally {
            self::removeDirectory($tempDir);
        }
    }

    private static function normalizeLanguage(string $language): string
    {
        return match (strtolower(trim($language))) {
            'python' => 'Python',
            'javascript', 'node', 'nodejs' => 'JavaScript',
            'bash' => 'Bash',
            default => throw new DomainException("Unsupported script language '$language'."),
        };
    }

    private static function buildPayload(array $inputs): array
    {
        $byId = [];
        $byName = [];
        $values = [];
        foreach ($inputs as $input) {
            $id = (string)($input['id'] ?? '');
            $name = trim((string)($input['name'] ?? $id));
            $value = $input['value'] ?? null;
            $byId[$id] = $value;
            if ($name !== '') $byName[$name] = $value;
            $values[] = $value;
        }
        return [
            'inputs' => $byName,
            'inputsById' => $byId,
            'inputValues' => $values,
            'firstInput' => $values[0] ?? null,
        ];
    }

    private static function baseEnvironment(): array
    {
        $keep = PHP_OS_FAMILY === 'Windows'
            ? ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE']
            : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
        $env = [];
        foreach ($keep as $key) {
            $value = getenv($key);
            if (is_string($value) && $value !== '') $env[$key] = $value;
        }
        $env['WORKFLOW_RUNNER'] = '1';
        return $env;
    }

    private static function bashInputEnvironment(array $payload): array
    {
        $env = [
            'WF_INPUT_JSON' => json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE),
            'WF_INPUT_VALUES_JSON' => json_encode($payload['inputValues'], JSON_INVALID_UTF8_SUBSTITUTE),
            'value' => self::environmentValue($payload['firstInput']),
        ];
        foreach ($payload['inputs'] as $name => $value) {
            $safe = strtoupper((string)preg_replace('/[^A-Za-z0-9_]+/', '_', (string)$name));
            $safe = trim($safe, '_');
            if ($safe !== '') $env['WF_INPUT_' . $safe] = self::environmentValue($value);
        }
        return $env;
    }

    private static function environmentValue(mixed $value): string
    {
        if ($value === null) return '';
        if (is_bool($value)) return $value ? 'true' : 'false';
        if (is_scalar($value)) return (string)$value;
        return json_encode($value, JSON_INVALID_UTF8_SUBSTITUTE) ?: '';
    }

    private static function makeTempDir(): string
    {
        $base = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR);
        for ($i = 0; $i < 5; $i++) {
            $path = $base . DIRECTORY_SEPARATOR . 'workflow-run-' . bin2hex(random_bytes(8));
            if (@mkdir($path, 0700, false)) return $path;
        }
        throw new RuntimeException('Could not create a temporary script working directory.');
    }

    private static function runProcess(array $command, string $stdin, string $cwd, array $env, int $timeoutMs, callable $shouldCancel): array
    {
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $options = PHP_OS_FAMILY === 'Windows' ? ['bypass_shell' => true, 'blocking_pipes' => false] : [];
        $process = @proc_open($command, $descriptors, $pipes, $cwd, $env, $options);
        if (!is_resource($process)) throw new RuntimeException('Unable to start the script runtime process.');

        fwrite($pipes[0], $stdin);
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $started = hrtime(true);
        $stdout = '';
        $stderr = '';
        $timedOut = false;
        $outputLimitExceeded = false;
        $cancelled = false;
        $lastStatus = proc_get_status($process);

        while (true) {
            $stdout .= (string)stream_get_contents($pipes[1]);
            $stderr .= (string)stream_get_contents($pipes[2]);
            if ($shouldCancel()) {
                $cancelled = true;
                self::terminateProcess($process, (int)($lastStatus['pid'] ?? 0));
                break;
            }
            if (strlen($stdout) > self::MAX_STREAM_BYTES || strlen($stderr) > self::MAX_STREAM_BYTES) {
                $outputLimitExceeded = true;
                self::terminateProcess($process, (int)($lastStatus['pid'] ?? 0));
                break;
            }
            if ((hrtime(true) - $started) / 1000000 > $timeoutMs) {
                $timedOut = true;
                self::terminateProcess($process, (int)($lastStatus['pid'] ?? 0));
                break;
            }
            $lastStatus = proc_get_status($process);
            if (!$lastStatus['running']) break;
            usleep(10000);
        }

        // Drain any bytes already written before the process stopped.
        $stdout .= (string)stream_get_contents($pipes[1]);
        $stderr .= (string)stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $statusAfter = proc_get_status($process);
        $cachedExitCode = $statusAfter['exitcode'] >= 0
            ? (int)$statusAfter['exitcode']
            : (($lastStatus['exitcode'] ?? -1) >= 0 ? (int)$lastStatus['exitcode'] : null);
        $closeCode = proc_close($process);
        $exitCode = $cachedExitCode ?? ($closeCode >= 0 ? $closeCode : null);

        return [
            'stdout' => substr($stdout, 0, self::MAX_STREAM_BYTES),
            'stderr' => substr($stderr, 0, self::MAX_STREAM_BYTES),
            'wallTimeMs' => round((hrtime(true) - $started) / 1000000, 4),
            'exitCode' => $exitCode,
            'timedOut' => $timedOut,
            'outputLimitExceeded' => $outputLimitExceeded,
            'cancelled' => $cancelled,
        ];
    }

    private static function terminateProcess($process, int $pid): void
    {
        @proc_terminate($process);
        if (PHP_OS_FAMILY !== 'Windows' || $pid <= 0) return;
        $root = getenv('SystemRoot') ?: 'C:\\Windows';
        $taskkill = rtrim($root, "\\/") . '\\System32\\taskkill.exe';
        if (!is_file($taskkill)) return;
        $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $killer = @proc_open([$taskkill, '/PID', (string)$pid, '/T', '/F'], $descriptors, $pipes, null, self::baseEnvironment(), ['bypass_shell' => true]);
        if (is_resource($killer)) {
            foreach ($pipes as $pipe) @fclose($pipe);
            @proc_close($killer);
        }
    }

    private static function pythonWrapper(): string
    {
        return <<<'PY'
import json, os, runpy, sys, traceback

def memory_metric():
    try:
        if os.name == "nt":
            import ctypes
            from ctypes import wintypes
            class PMC(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ]
            counters = PMC(); counters.cb = ctypes.sizeof(PMC)
            handle = ctypes.windll.kernel32.GetCurrentProcess()
            ok = ctypes.windll.psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb)
            if ok:
                return int(counters.PeakWorkingSetSize), "process-peak-working-set"
        else:
            import resource
            rss = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
            if sys.platform != "darwin": rss *= 1024
            return rss, "process-peak-rss"
    except Exception:
        pass
    return None, "unavailable"

user_file, result_file = sys.argv[1], sys.argv[2]
payload = json.load(sys.stdin)
context = {
    "inputs": payload.get("inputs", {}),
    "inputsById": payload.get("inputsById", {}),
    "inputValues": payload.get("inputValues", []),
    "value": payload.get("firstInput"),
    "result": None,
}
try:
    globals_after = runpy.run_path(user_file, init_globals=context)
    result = globals_after.get("result")
    memory_bytes, memory_metric_name = memory_metric()
    with open(result_file, "w", encoding="utf-8") as handle:
        json.dump({"ok": True, "result": result, "memoryBytes": memory_bytes, "memoryMetric": memory_metric_name}, handle, ensure_ascii=False)
except BaseException as exc:
    traceback.print_exc()
    try:
        with open(result_file, "w", encoding="utf-8") as handle:
            json.dump({"ok": False, "error": f"{type(exc).__name__}: {exc}"}, handle, ensure_ascii=False)
    finally:
        sys.exit(1)
PY;
    }

    private static function javascriptWrapper(): string
    {
        return <<<'JS'
'use strict';
const fs = require('fs');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const [userFile, resultFile] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const source = fs.readFileSync(userFile, 'utf8');
(async () => {
  try {
    const fn = new AsyncFunction('inputs', 'inputsById', 'inputValues', 'value', source);
    let result = await fn(payload.inputs || {}, payload.inputsById || {}, payload.inputValues || [], payload.firstInput);
    if (result === undefined) result = null;
    const memory = process.memoryUsage();
    fs.writeFileSync(resultFile, JSON.stringify({
      ok: true,
      result,
      memoryBytes: Number(memory.rss) || null,
      memoryMetric: 'process-rss-at-completion'
    }), 'utf8');
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    try {
      fs.writeFileSync(resultFile, JSON.stringify({ok: false, error: String(error && error.message ? error.message : error)}), 'utf8');
    } finally {
      process.exitCode = 1;
    }
  }
})();
JS;
    }

    private static function firstLine(string $text): string
    {
        $line = preg_split('/\R/', trim($text))[0] ?? '';
        return substr($line, 0, 300);
    }

    private static function removeDirectory(string $directory): void
    {
        if ($directory === '' || !is_dir($directory)) return;
        $items = @scandir($directory);
        if (is_array($items)) {
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') continue;
                $path = $directory . DIRECTORY_SEPARATOR . $item;
                if (is_dir($path)) self::removeDirectory($path);
                else @unlink($path);
            }
        }
        @rmdir($directory);
    }
}
