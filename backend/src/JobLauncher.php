<?php
declare(strict_types=1);

final class JobLauncher
{
    public static function launch(string $jobId): void
    {
        if (preg_match('/^[a-f0-9]{32}$/D', $jobId) !== 1) throw new InvalidArgumentException('Invalid job ID.');
        $worker = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'worker.php';
        if (!is_file($worker)) throw new RuntimeException('Background worker entry point is missing.');
        $php = PHP_BINARY;

        if (PHP_OS_FAMILY === 'Windows') {
            $root = getenv('SystemRoot') ?: 'C:\\Windows';
            $powershell = rtrim($root, "\\/") . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
            if (!is_file($powershell)) throw new RuntimeException('Windows PowerShell is required to launch local background jobs.');
            $quote = static fn(string $value): string => "'" . str_replace("'", "''", $value) . "'";
            $script = 'Start-Process -FilePath ' . $quote($php) .
                ' -ArgumentList @(' . $quote($worker) . ',' . $quote($jobId) . ')' .
                ' -WindowStyle Hidden';
            $process = @proc_open(
                [$powershell, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', $script],
                [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                $pipes,
                dirname(__DIR__)
            );
            if (!is_resource($process)) throw new RuntimeException('Could not start the Windows background worker launcher.');
            foreach ($pipes as $pipe) if (is_resource($pipe)) @fclose($pipe);
            $code = proc_close($process);
            if ($code !== 0) throw new RuntimeException('Windows background worker launcher returned a failure status.');
            return;
        }

        $command = 'nohup ' . escapeshellarg($php) . ' ' . escapeshellarg($worker) . ' ' . escapeshellarg($jobId) . ' >/dev/null 2>&1 &';
        $process = @proc_open(['/bin/sh', '-c', $command], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__));
        if (!is_resource($process)) throw new RuntimeException('Could not start the background worker launcher.');
        foreach ($pipes as $pipe) if (is_resource($pipe)) @fclose($pipe);
        $code = proc_close($process);
        if ($code !== 0) throw new RuntimeException('Background worker launcher returned a failure status.');
    }
}
