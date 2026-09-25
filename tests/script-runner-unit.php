<?php
declare(strict_types=1);
require_once __DIR__ . '/../backend/src/ScriptRunner.php';

function ensureScript(bool $ok, string $name): void {
    if (!$ok) { fwrite(STDERR, "FAIL $name\n"); exit(1); }
    echo "PASS $name\n";
}


function ensureMetricContract(array $result, string $name): void {
    $metrics = $result['metrics'] ?? [];
    foreach (['wallTimeMs','exitCode','memoryBytes','memoryMetric','stdoutBytes','stderrBytes','timeoutLimitMs'] as $key) {
        ensureScript(array_key_exists($key, $metrics), "$name metric $key present");
    }
    ensureScript(($result['runtime']['backend'] ?? '') === 'local-process', "$name runtime backend labeled");
    ensureScript(is_string($result['runtime']['language'] ?? null), "$name runtime language labeled");
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
    ensureMetricContract($r, 'Python');
} else {
    echo "SKIP Python runtime unavailable\n";
}

if ($availability['JavaScript']) {
    $r = ScriptRunner::run('JavaScript', "console.log('js-log'); return inputValues.reduce((a, b) => Number(a) + Number(b), 0);", $inputs);
    ensureScript($r['result'] === 12, 'JavaScript returns 12 from two inputs');
    ensureScript(str_contains($r['stdout'], 'js-log'), 'JavaScript stdout captured as log');
    ensureScript(($r['metrics']['exitCode'] ?? null) === 0 && ($r['metrics']['wallTimeMs'] ?? 0) > 0, 'JavaScript metrics returned');
    ensureMetricContract($r, 'JavaScript');
} else {
    echo "SKIP JavaScript runtime unavailable\n";
}

if ($availability['Bash']) {
    $r = ScriptRunner::run('Bash', 'echo "$value"', [['id' => 'a', 'name' => 'A', 'value' => 5]]);
    ensureScript($r['result'] === 5, 'Bash stdout JSON/number becomes result');
    ensureScript(($r['metrics']['exitCode'] ?? null) === 0, 'Bash exit code captured');
    ensureMetricContract($r, 'Bash');
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


if ($availability['Python']) {
    $cancelAt = hrtime(true) + 150000000;
    try {
        ScriptRunner::run('Python', "import time\ntime.sleep(5)\nresult = 1", [], [
            'timeoutMs' => 5000,
            'shouldCancel' => static fn(): bool => hrtime(true) >= $cancelAt,
        ]);
        ensureScript(false, 'Python cancellation enforced');
    } catch (ScriptExecutionException $e) {
        ensureScript($e->cancelled && !$e->timedOut, 'Python cancellation enforced');
    }
}

echo "Script runner unit tests complete.\n";
