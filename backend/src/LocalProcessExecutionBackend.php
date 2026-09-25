<?php
declare(strict_types=1);

require_once __DIR__ . '/ExecutionBackend.php';
require_once __DIR__ . '/ScriptRunner.php';

/**
 * Local-development execution backend. This is intentionally isolated behind
 * ExecutionBackend so a container/remote sandbox can replace it later without
 * changing WorkflowRunner.
 */
final class LocalProcessExecutionBackend implements ExecutionBackend
{
    public function name(): string { return 'local-process'; }
    public function runtimeAvailability(): array { return ScriptRunner::runtimeAvailability(); }
    public function assertRuntimeAvailable(string $language): void { ScriptRunner::assertRuntimeAvailable($language); }
    public function run(string $language, string $source, array $inputs, array $options = []): array
    {
        return ScriptRunner::run($language, $source, $inputs, $options);
    }
}
