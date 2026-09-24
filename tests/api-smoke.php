<?php
declare(strict_types=1);
// Run while the dev server is running: php tests/api-smoke.php
$base = 'http://127.0.0.1:8000';

function requestJson(string $name, string $url, string $method, ?array $body, int $status): array {
    $headers = $method === 'GET' ? '' : "Content-Type: application/json\r\n";
    $options = ['http' => [
        'method' => $method,
        'ignore_errors' => true,
        'header' => $headers,
        'content' => $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR),
        'timeout' => 20,
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

$valid = ['apiVersion' => 1, 'workflow' => ['widgets' => [
    ['id' => 'a', 'outputs' => [['id' => 'out']]],
    ['id' => 'b', 'inputs' => [['id' => 'in']]]
], 'connections' => [['sourceWidgetId' => 'a', 'sourcePortId' => 'out', 'targetWidgetId' => 'b', 'targetPortId' => 'in']]]];

$health = requestJson('health', "$base/api/health", 'GET', null, 200);
if (($health['scriptExecutionEnabled'] ?? false) !== true || !is_array($health['runtimes'] ?? null)) {
    fwrite(STDERR, "FAIL health does not advertise Batch 7C runtimes\n"); exit(1);
}
echo 'Detected runtimes: ' . json_encode($health['runtimes']) . PHP_EOL;
requestJson('valid workflow', "$base/api/validate", 'POST', $valid, 200);
$invalid = $valid; $invalid['workflow']['connections'][0]['targetPortId'] = 'missing';
requestJson('invalid port rejected', "$base/api/validate", 'POST', $invalid, 422);
requestJson('persistent jobs are not implemented', "$base/api/runs", 'POST', $valid, 501);
echo 'Check backend file protection separately: curl.exe -I http://127.0.0.1:8000/backend/src/WorkflowValidator.php (expect 404).' . PHP_EOL;

function workflowFor(string $language = 'Pass-through', string $source = '', string $operation = 'sum', bool $twoSources = true): array {
    $connections = [
        ['sourceWidgetId'=>'one','sourcePortId'=>'out','targetWidgetId'=>'work','targetPortId'=>'in'],
    ];
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
        'apiVersion'=>1,
        'workflow'=>$workflow,
        'execution'=>['mode'=>'workflow']
    ], $expectedStatus);
}

$result = executeWorkflow('PHP executes multi-source sum', workflowFor(), 200);
$node = end($result['nodes']);
if (($node['outputs'][0]['value'] ?? null) !== 12) { fwrite(STDERR, "FAIL PHP sum result\n"); exit(1); }

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
