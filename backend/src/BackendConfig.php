<?php
declare(strict_types=1);

/**
 * Centralized backend limits for the local development service.
 *
 * Environment variables may lower/raise limits only within the hard ceilings
 * below. This prevents a typo in local configuration from effectively removing
 * the safety rails. These are resource controls, not a security sandbox.
 */
final class BackendConfig
{
    public static function requestMaxBytes(): int { return self::boundedInt('WORKFLOW_MAX_REQUEST_BYTES', 1048576, 65536, 4194304); }
    public static function workflowMaxWidgets(): int { return self::boundedInt('WORKFLOW_MAX_WIDGETS', 500, 1, 1000); }
    public static function workflowMaxConnections(): int { return self::boundedInt('WORKFLOW_MAX_CONNECTIONS', 2000, 0, 5000); }
    public static function maxPortsPerWidget(): int { return self::boundedInt('WORKFLOW_MAX_PORTS_PER_WIDGET', 100, 1, 250); }
    public static function executionMaxWidgets(): int { return self::boundedInt('WORKFLOW_EXECUTION_MAX_WIDGETS', 100, 1, 250); }
    public static function executionMaxConnections(): int { return self::boundedInt('WORKFLOW_EXECUTION_MAX_CONNECTIONS', 400, 0, 1000); }
    public static function selectedMaxWidgets(): int { return self::boundedInt('WORKFLOW_SELECTED_MAX_WIDGETS', 100, 1, 250); }
    public static function scriptDefaultTimeoutMs(): int { return self::boundedInt('WORKFLOW_SCRIPT_TIMEOUT_MS', 5000, 100, self::scriptMaxTimeoutMs()); }
    public static function scriptMaxTimeoutMs(): int { return self::boundedInt('WORKFLOW_SCRIPT_MAX_TIMEOUT_MS', 15000, 1000, 60000); }
    public static function scriptMaxSourceBytes(): int { return self::boundedInt('WORKFLOW_SCRIPT_MAX_SOURCE_BYTES', 30000, 1024, 131072); }
    public static function scriptMaxInputBytes(): int { return self::boundedInt('WORKFLOW_SCRIPT_MAX_INPUT_BYTES', 524288, 16384, 2097152); }
    public static function scriptMaxStreamBytes(): int { return self::boundedInt('WORKFLOW_SCRIPT_MAX_STREAM_BYTES', 262144, 4096, 1048576); }
    public static function scriptMaxResultBytes(): int { return self::boundedInt('WORKFLOW_SCRIPT_MAX_RESULT_BYTES', 524288, 4096, 2097152); }
    public static function publicErrorBytes(): int { return self::boundedInt('WORKFLOW_PUBLIC_ERROR_BYTES', 4000, 256, 16384); }
    public static function maxActiveJobs(): int { return self::boundedInt('WORKFLOW_MAX_ACTIVE_JOBS', 4, 1, 16); }
    public static function jobRetentionSeconds(): int { return self::boundedInt('WORKFLOW_JOB_RETENTION_SECONDS', 604800, 3600, 2592000); }
    public static function maxJobRecordBytes(): int { return self::boundedInt('WORKFLOW_MAX_JOB_RECORD_BYTES', 2097152, 65536, 8388608); }
    public static function tempRetentionSeconds(): int { return self::boundedInt('WORKFLOW_TEMP_RETENTION_SECONDS', 3600, 300, 86400); }

    /** @return list<string> */
    public static function allowedScriptLanguages(): array
    {
        $allowed = ['Python', 'JavaScript', 'Bash'];
        $raw = getenv('WORKFLOW_ALLOWED_RUNTIMES');
        if (!is_string($raw) || trim($raw) === '') return $allowed;

        $requested = [];
        foreach (preg_split('/[,;\s]+/', $raw) ?: [] as $value) {
            $normalized = match (strtolower(trim($value))) {
                'python' => 'Python',
                'javascript', 'node', 'nodejs' => 'JavaScript',
                'bash' => 'Bash',
                default => null,
            };
            if ($normalized !== null && !in_array($normalized, $requested, true)) $requested[] = $normalized;
        }
        return $requested;
    }

    public static function executionBackend(): string
    {
        $value = strtolower(trim((string)(getenv('WORKFLOW_EXECUTION_BACKEND') ?: 'local-process')));
        return $value === '' ? 'local-process' : $value;
    }

    public static function publicLimits(): array
    {
        return [
            'requestBytes' => self::requestMaxBytes(),
            'workflowWidgets' => self::workflowMaxWidgets(),
            'workflowConnections' => self::workflowMaxConnections(),
            'executionWidgets' => self::executionMaxWidgets(),
            'executionConnections' => self::executionMaxConnections(),
            'scriptSourceBytes' => self::scriptMaxSourceBytes(),
            'scriptInputBytes' => self::scriptMaxInputBytes(),
            'scriptOutputBytesPerStream' => self::scriptMaxStreamBytes(),
            'scriptResultBytes' => self::scriptMaxResultBytes(),
            'scriptTimeoutMs' => self::scriptDefaultTimeoutMs(),
            'scriptMaxTimeoutMs' => self::scriptMaxTimeoutMs(),
            'activeJobs' => self::maxActiveJobs(),
        ];
    }

    private static function boundedInt(string $name, int $default, int $minimum, int $maximum): int
    {
        $raw = getenv($name);
        if (!is_string($raw) || trim($raw) === '' || filter_var($raw, FILTER_VALIDATE_INT) === false) return $default;
        return max($minimum, min($maximum, (int)$raw));
    }
}
