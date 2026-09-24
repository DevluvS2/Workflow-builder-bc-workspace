<?php
declare(strict_types=1);

$jobDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'workflow-job-test-' . bin2hex(random_bytes(5));
putenv('WORKFLOW_JOB_DIR=' . $jobDir);
require_once __DIR__ . '/../backend/src/JobRepository.php';

function ensureJob(bool $ok, string $name): void {
    if (!$ok) { fwrite(STDERR, "FAIL $name\n"); exit(1); }
    echo "PASS $name\n";
}

function cleanupJobDir(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*') ?: [] as $file) @unlink($file);
    @rmdir($dir);
}

function runWorker(string $jobId): int {
    $worker = __DIR__ . '/../backend/worker.php';
    $process = proc_open([PHP_BINARY, $worker, $jobId], [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes);
    if (!is_resource($process)) return 99;
    fclose($pipes[0]);
    stream_get_contents($pipes[1]); fclose($pipes[1]);
    stream_get_contents($pipes[2]); fclose($pipes[2]);
    return proc_close($process);
}

$workflow = ['widgets' => [
    ['id'=>'sum','type'=>'Process','language'=>'Pass-through','source'=>'','serverOperation'=>'sum','inputs'=>[['id'=>'numbers','name'=>'numbers','required'=>true]],'outputs'=>[['id'=>'result','name'=>'result','value'=>'']]],
    ['id'=>'a','type'=>'Start','language'=>'Pass-through','source'=>'','outputs'=>[['id'=>'value','name'=>'value','value'=>5]]],
    ['id'=>'b','type'=>'Start','language'=>'Pass-through','source'=>'','outputs'=>[['id'=>'value','name'=>'value','value'=>7]]],
], 'connections' => [
    ['sourceWidgetId'=>'a','sourcePortId'=>'value','targetWidgetId'=>'sum','targetPortId'=>'numbers'],
    ['sourceWidgetId'=>'b','sourcePortId'=>'value','targetWidgetId'=>'sum','targetPortId'=>'numbers'],
]];

try {
    $job = JobRepository::create($workflow, ['mode'=>'workflow']);
    ensureJob(($job['status'] ?? '') === 'queued', 'job created queued');
    ensureJob(runWorker($job['jobId']) === 0, 'worker process exits successfully');
    $done = JobRepository::read($job['jobId']);
    ensureJob(($done['status'] ?? '') === 'finished', 'worker marks job finished');
    $nodes = $done['result']['nodes'] ?? [];
    $sum = end($nodes);
    ensureJob(($sum['outputs'][0]['value'] ?? null) === 12, 'persistent job returns server sum 5+7=12');
    ensureJob(count($done['progress']['completedNodeIds'] ?? []) === 3, 'job progress records completed nodes');

    $cancel = JobRepository::create($workflow, ['mode'=>'workflow']);
    JobRepository::requestCancel($cancel['jobId']);
    runWorker($cancel['jobId']);
    $cancelled = JobRepository::read($cancel['jobId']);
    ensureJob(($cancelled['status'] ?? '') === 'cancelled', 'queued job cancellation persists');
} finally {
    cleanupJobDir($jobDir);
}

echo "Job unit tests complete.\n";
