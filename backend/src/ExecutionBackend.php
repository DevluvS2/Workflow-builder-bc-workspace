<?php
declare(strict_types=1);

interface ExecutionBackend
{
    public function name(): string;
    public function runtimeAvailability(): array;
    public function assertRuntimeAvailable(string $language): void;

    /**
     * @param array<int,array{id:string,name?:string,value:mixed}> $inputs
     */
    public function run(string $language, string $source, array $inputs, array $options = []): array;
}
