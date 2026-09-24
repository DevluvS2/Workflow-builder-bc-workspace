<?php
declare(strict_types=1);
// Run while the dev server is running: php tests/api-smoke.php
$base = 'http://127.0.0.1:8000';

function requestJson(string $name, string $url, string $method, ?array $body, int $status, int $timeout = 20): array {
    $headers = $method === 'GET' ? '' : "Content-Type: application/json\r\n";
    $options = ['http' => [
        'method' => $method,
        'ignore_errors' => true,
        'header' => $headers,
        'content' => $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR),
        'timeout' => $timeout,
    ]];
    $response = @file_get_contents($url, false, stream_context_create($options));
    $statusLine = $http_response_header[0] ?? '';
    $decoded = json_decode((string)$response, true);
    if (!preg_match('/\s' . $status . '\s/', $statusLine) || !is_array($decoded)) {
        fwrite(STDERR, "FAIL $name: $statusLine $response\n"); exit(1);
    }
    echo "PASS $name ($status)\n";
    return $decoded;
}

function workflowFor(string $language = 'Pass-through', string $source = '', string $operation = 'sum', bool $twoSources = true): array {
    $connections = [['sourceWidgetId'=>'one','sourcePortId'=>'out','targetWidgetId'=>'work','targetPortId'=>'in']];
    if ($twoSources) $connections[] = ['sourceWidgetId'=>'two','sourcePortId'=>'out','targetWidgetId'=>'work','targetPortId'=>'in'];
    return ['widgets' => [
        ['id'=>'work','type'=>'Process','language'=>$language,'source'=>$source,'serverOperation'=>$operation,
            'inputs'=>[['id'=>'in','name'=>'numbers','required'=>true]], 'outputs'=>[['id'=>'out','name'=>'result']]],
        ['id'=>'one','type'=>'Start','language'=>'Pass-through','source'=>'','outputs'=>[['id'=>'out','name'=>'value','value'=>5]]],
        ['id'=>'two','type'=>'Start','language'=>'Pass-through','source'=>'','outputs'=>[['id'=>'out','name'=>'value','value'=>7]]],
    ], 'connections' => $connections];
}

function executeWorkflow(string $name, array $workflow, int $expectedStatus): array {
    return requestJson($name, 'http://127.0.0.1:8000/api/execute', 'POST', [
        'apiVersion'=>1, 'workflow'=>$workflow, 'execution'=>['mode'=>'workflow']
    ], $expectedStatus);
}

function createRun(string $name, array $workflow): array {
    return requestJson($name, 'http://127.0.0.1:8000/api/runs', 'POST', [
        'apiVersion'=>1, 'workflow'=>$workflow, 'execution'=>['mode'=>'workflow']
    ], 202);
}

function waitForRun(string $jobId, array $terminal = ['finished','failed','cancelled'], int $tries = 120): array {
    for ($i = 0; $i < $tries; $i++) {
        $job = requestJson('poll persistent run', "http://127.0.0.1:8000/api/runs/$jobId", 'GET', null, 200);
        if (in_array($job['status'] ?? '', $terminal, true)) return $job;
        usleep(100000);
    }
    fwrite(STDERR, "FAIL persistent run did not reach terminal state\n"); exit(1);
}

function waitUntilRunning(string $jobId, int $tries = 80): array {
    for ($i = 0; $i < $tries; $i++) {
        $job = requestJson('poll run until running', "http://127.0.0.1:8000/api/runs/$jobId", 'GET', null, 200);
        if (($job['status'] ?? '') === 'running') return $job;
        if (in_array(($job['status'] ?? ''), ['finished','failed','cancelled'], true)) {
            fwrite(STDERR, 'FAIL run reached terminal state before cancellation: ' . json_encode($job) . PHP_EOL); exit(1);
        }
        usleep(100000);
    }
    fwrite(STDERR, "FAIL run did not start before cancellation test\n"); exit(1);
}

$valid = ['apiVersion' => 1, 'workflow' => ['widgets' => [
    ['id' => 'a', 'outputs' => [['id' => 'out']]],
    ['id' => 'b', 'inputs' => [['id' => 'in']]]
], 'connections' => [['sourceWidgetId' => 'a', 'sourcePortId' => 'out', 'targetWidgetId' => 'b', 'targetPortId' => 'in']]]];

$health = requestJson('health', "$base/api/health", 'GET', null, 200);
if (($health['scriptExecutionEnabled'] ?? false) !== true || ($health['persistentJobsEnabled'] ?? false) !== true || ($health['jobCancellationEnabled'] ?? false) !== true) {
    fwrite(STDERR, "FAIL health does not advertise Batch 7D jobs/runtimes\n"); exit(1);
}
echo 'Detected runtimes: ' . json_encode($health['runtimes']) . PHP_EOL;
requestJson('valid workflow', "$base/api/validate", 'POST', $valid, 200);
$invalid = $valid; $invalid['workflow']['connections'][0]['targetPortId'] = 'missing';
requestJson('invalid port rejected', "$base/api/validate", 'POST', $invalid, 422);

echo 'Check backend file protection separately: curl.exe -I http://127.0.0.1:8000/backend/src/JobRepository.php (expect 404).' . PHP_EOL;

$result = executeWorkflow('compat synchronous PHP sum', workflowFor(), 200);
$node = end($result['nodes']);
if (($node['outputs'][0]['value'] ?? null) !== 12) { fwrite(STDERR, "FAIL PHP sum result\n"); exit(1); }

$accepted = createRun('persistent run accepted', workflowFor());
if (!preg_match('/^[a-f0-9]{32}$/', $accepted['jobId'] ?? '')) { fwrite(STDERR, "FAIL persistent job ID\n"); exit(1); }
$job = waitForRun($accepted['jobId']);
if (($job['status'] ?? '') !== 'finished' || ($job['result']['nodes'][2]['outputs'][0]['value'] ?? null) !== 12) {
    fwrite(STDERR, 'FAIL persistent job result: ' . json_encode($job) . PHP_EOL); exit(1);
}
echo "PASS persistent background job finishes with 12\n";

if (!empty($health['runtimes']['Python'])) {
    $slow = workflowFor('Python', "import time\ntime.sleep(4)\nresult = sum(int(x) for x in value)", 'pass-through');
    $accepted = createRun('cancellable Python run accepted', $slow);
    waitUntilRunning($accepted['jobId']);
    $cancelResponse = requestJson('cancel persistent run', "$base/api/runs/{$accepted['jobId']}/cancel", 'POST', ['apiVersion'=>1], 202);
    $cancelled = waitForRun($accepted['jobId']);
    if (($cancelled['status'] ?? '') !== 'cancelled') {
        fwrite(STDERR, 'FAIL persistent cancellation: ' . json_encode($cancelled) . PHP_EOL); exit(1);
    }
    echo "PASS running Python job cancelled\n";
} else echo "SKIP persistent cancellation Python runtime unavailable\n";

if (!empty($health['runtimes']['Python'])) {
    $result = executeWorkflow('PHP launches real Python', workflowFor('Python', "print('api-python')\nresult = sum(value)", 'pass-through'), 200);
    $node = end($result['nodes']);
    if (($node['outputs'][0]['value'] ?? null) !== 12 || !str_contains($node['logs']['stdout'] ?? '', 'api-python')) {
        fwrite(STDERR, "FAIL Python API result/log\n"); exit(1);
    }
} else echo "SKIP Python API runtime unavailable\n";

if (!empty($health['runtimes']['JavaScript'])) {
    $result = executeWorkflow('PHP launches real JavaScript', workflowFor('JavaScript', 'return value.reduce((a,b)=>Number(a)+Number(b),0);', 'pass-through'), 200);
    $node = end($result['nodes']);
    if (($node['outputs'][0]['value'] ?? null) !== 12) { fwrite(STDERR, "FAIL JavaScript API result\n"); exit(1); }
} else echo "SKIP JavaScript API runtime unavailable\n";

if (!empty($health['runtimes']['Bash'])) {
    $result = executeWorkflow('PHP launches real Bash', workflowFor('Bash', 'echo "$value"', 'pass-through', false), 200);
    $node = end($result['nodes']);
    if (($node['outputs'][0]['value'] ?? null) !== 5) { fwrite(STDERR, "FAIL Bash API result\n"); exit(1); }
} else echo "SKIP Bash API runtime unavailable; install Git Bash or set WORKFLOW_BASH\n";

$bad = workflowFor('Expression', '1+2', 'pass-through');
executeWorkflow('Expression execution rejected', $bad, 422);
$bad = workflowFor();
$bad['connections'][0]['targetPortId'] = 'not-a-port';
executeWorkflow('invalid graph rejected before running', $bad, 422);
