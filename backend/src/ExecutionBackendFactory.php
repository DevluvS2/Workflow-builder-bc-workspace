<?php
declare(strict_types=1);

require_once __DIR__ . '/BackendConfig.php';
require_once __DIR__ . '/ExecutionBackend.php';
require_once __DIR__ . '/LocalProcessExecutionBackend.php';

final class ExecutionBackendFactory
{
    public static function create(): ExecutionBackend
    {
        return match (BackendConfig::executionBackend()) {
            'local-process' => new LocalProcessExecutionBackend(),
            default => throw new RuntimeException('Configured execution backend is unavailable.'),
        };
    }
}
