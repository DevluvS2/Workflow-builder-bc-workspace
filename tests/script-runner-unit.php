<?php
declare(strict_types=1);
require_once __DIR__ . '/../backend/src/ScriptRunner.php';

function ensureScript(bool $ok, string $name): void {
    if (!$ok) { fwrite(STDERR, "FAIL $name\n"); exit(1); }
    echo "PASS $name\n";
}

$availability = ScriptRunner::runtimeAvailability();
echo 'Runtime availability: ' . json_encode($availability) . "\n";
$inputs = [
    ['id' => 'a', 'name' => 'A', 'value' => 5],
    ['id' => 'b', 'name' => 'B', 'value' => 7],
];

if ($availability['Python']) {
    $r = ScriptRunner::run('Python', "print('python-log')\nresult = sum(inputValues)", $inputs);
    ensureScript($r['result'] === 12, 'Python returns 12 from two inputs');
    ensureScript(str_contains($r['stdout'], 'python-log'), 'Python stdout captured as log');
    ensureScript(($r['metrics']['exitCode'] ?? null) === 0 && ($r['metrics']['wallTimeMs'] ?? 0) > 0, 'Python metrics returned');
} else {
    echo "SKIP Python runtime unavailable\n";
}

if ($availability['JavaScript']) {
    $r = ScriptRunner::run('JavaScript', "console.log('js-log'); return inputValues.reduce((a, b) => Number(a) + Number(b), 0);", $inputs);
    ensureScript($r['result'] === 12, 'JavaScript returns 12 from two inputs');
    ensureScript(str_contains($r['stdout'], 'js-log'), 'JavaScript stdout captured as log');
    ensureScript(($r['metrics']['exitCode'] ?? null) === 0 && ($r['metrics']['wallTimeMs'] ?? 0) > 0, 'JavaScript metrics returned');
} else {
    echo "SKIP JavaScript runtime unavailable\n";
}

if ($availability['Bash']) {
    $r = ScriptRunner::run('Bash', 'echo "$value"', [['id' => 'a', 'name' => 'A', 'value' => 5]]);
    ensureScript($r['result'] === 5, 'Bash stdout JSON/number becomes result');
    ensureScript(($r['metrics']['exitCode'] ?? null) === 0, 'Bash exit code captured');
} else {
    echo "SKIP Bash runtime unavailable (Windows users: Git Bash or WORKFLOW_BASH is required)\n";
}

if ($availability['Python']) {
    try {
        ScriptRunner::run('Python', "raise RuntimeError('expected-boom')", []);
        ensureScript(false, 'Python failures rejected');
    } catch (ScriptExecutionException $e) {
        ensureScript(str_contains($e->getMessage(), 'expected-boom') || str_contains($e->stderr, 'expected-boom'), 'Python failure returned safely');
    }
}


if ($availability['Python']) {
    try {
        ScriptRunner::run('Python', "import time\ntime.sleep(1)\nresult = 1", [], ['timeoutMs' => 150]);
        ensureScript(false, 'Python timeout enforced');
    } catch (ScriptExecutionException $e) {
        ensureScript($e->timedOut, 'Python timeout enforced');
    }
}

echo "Script runner unit tests complete.\n";
