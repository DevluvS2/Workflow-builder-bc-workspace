<?php
declare(strict_types=1);
// Run while the dev server is running: php tests/api-smoke.php
$base = 'http://127.0.0.1:8000';
function check(string $name, string $url, string $method, ?array $body, int $status): void {
    $options = ['http' => ['method' => $method, 'ignore_errors' => true, 'header' => "Content-Type: application/json\r\n", 'content' => $body === null ? '' : json_encode($body)]];
    $response = file_get_contents($url, false, stream_context_create($options));
    $statusLine = $http_response_header[0] ?? '';
    if (!preg_match('/\s' . $status . '\s/', $statusLine) || !is_array(json_decode((string)$response, true))) {
        fwrite(STDERR, "FAIL $name: $statusLine $response\n"); exit(1);
    }
    echo "PASS $name ($status)\n";
}
$valid = ['apiVersion' => 1, 'workflow' => ['widgets' => [
    ['id' => 'a', 'outputs' => [['id' => 'out']]],
    ['id' => 'b', 'inputs' => [['id' => 'in']]]
], 'connections' => [['sourceWidgetId' => 'a', 'sourcePortId' => 'out', 'targetWidgetId' => 'b', 'targetPortId' => 'in']]]];
check('health', "$base/api/health", 'GET', null, 200);
check('valid workflow', "$base/api/validate", 'POST', $valid, 200);
$invalid = $valid; $invalid['workflow']['connections'][0]['targetPortId'] = 'missing';
check('invalid port rejected', "$base/api/validate", 'POST', $invalid, 422);
check('persistent jobs are not implemented', "$base/api/runs", 'POST', $valid, 501);
echo 'Check backend file protection separately: curl -I http://127.0.0.1:8000/backend/src/WorkflowValidator.php (expect 404).'.PHP_EOL;
// Batch 7B: verify the synchronous controlled engine over actual HTTP.
$workflow = ['widgets' => [
    ['id'=>'sum','type'=>'Process','language'=>'Pass-through','serverOperation'=>'sum', 'inputs'=>[['id'=>'in','required'=>true]], 'outputs'=>[['id'=>'out']]],
    ['id'=>'one','type'=>'Start','language'=>'Pass-through', 'outputs'=>[['id'=>'out','value'=>5]]],
    ['id'=>'two','type'=>'Start','language'=>'Pass-through', 'outputs'=>[['id'=>'out','value'=>7]]],
], 'connections' => [
    ['sourceWidgetId'=>'one','sourcePortId'=>'out','targetWidgetId'=>'sum','targetPortId'=>'in'],
    ['sourceWidgetId'=>'two','sourcePortId'=>'out','targetWidgetId'=>'sum','targetPortId'=>'in'],
]];
function executeCheck(string $name, array $workflow, int $expectedStatus, ?int $expectedResult = null): void {
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'ignore_errors' => true,
        'header' => "Content-Type: application/json\r\n",
        'content' => json_encode(['apiVersion'=>1, 'workflow'=>$workflow, 'execution'=>['mode'=>'workflow']], JSON_THROW_ON_ERROR),
    ]]);
    $response = file_get_contents('http://127.0.0.1:8000/api/execute', false, $context);
    $status = $http_response_header[0] ?? '';
    $decoded = json_decode((string)$response, true);
    $ok = preg_match('/\\s' . $expectedStatus . '\\s/', $status) && is_array($decoded);
    if ($ok && $expectedResult !== null) {
        $node = end($decoded['nodes']);
        $ok = $node['outputs'][0]['value'] === $expectedResult && $decoded['executionOrder'] === ['one','two','sum'];
    }
    if (!$ok) { fwrite(STDERR, "FAIL $name: $status $response\n"); exit(1); }
    echo "PASS $name ($expectedStatus)\n";
}
executeCheck('PHP executes multi-source sum', $workflow, 200, 12);
$unsupported = $workflow;
$unsupported['widgets'][0]['language'] = 'Python';
executeCheck('PHP refuses unsandboxed Python', $unsupported, 422);
$bad = $workflow;
$bad['connections'][0]['targetPortId'] = 'not-a-port';
executeCheck('PHP rejects invalid graph before running', $bad, 422);
