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
check('execution is disabled', "$base/api/runs", 'POST', $valid, 501);
echo 'Check backend file protection separately: curl -I http://127.0.0.1:8000/backend/src/WorkflowValidator.php (expect 404).'.PHP_EOL;
