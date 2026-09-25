<?php
declare(strict_types=1);

require_once __DIR__ . '/../backend/src/BackendConfig.php';
require_once __DIR__ . '/../backend/src/WorkflowValidator.php';
require_once __DIR__ . '/../backend/src/ErrorSanitizer.php';
require_once __DIR__ . '/../backend/src/ExecutionBackendFactory.php';
require_once __DIR__ . '/../backend/src/JobRepository.php';

function ensureHardening(bool $ok, string $name): void {
    if (!$ok) { fwrite(STDERR, "FAIL $name\n"); exit(1); }
    echo "PASS $name\n";
}

function removeTree(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $name) {
        if ($name === '.' || $name === '..') continue;
        $path = $dir . DIRECTORY_SEPARATOR . $name;
        if (is_dir($path)) removeTree($path); else @unlink($path);
    }
    @rmdir($dir);
}

ensureHardening(BackendConfig::requestMaxBytes() <= 4194304, 'request limit has a hard ceiling');
ensureHardening(BackendConfig::scriptMaxTimeoutMs() <= 60000, 'script timeout has a hard ceiling');
ensureHardening(BackendConfig::allowedScriptLanguages() === ['Python','JavaScript','Bash'], 'default runtime allowlist is explicit');

$sample = "Traceback at C:\\Users\\devlu\\AppData\\Local\\Temp\\workflow-run-deadbeef\\user.py line 4";
$clean = ErrorSanitizer::text($sample);
ensureHardening(!str_contains($clean, 'C:\\Users\\devlu') && str_contains($clean, '[script]/user.py'), 'public errors redact temporary local paths');

putenv('WORKFLOW_ALLOWED_RUNTIMES=Python');
$availability = RuntimeLocator::availability();
ensureHardening(($availability['JavaScript'] ?? true) === false && ($availability['Bash'] ?? true) === false, 'runtime allowlist disables non-allowed runtimes');
putenv('WORKFLOW_ALLOWED_RUNTIMES');

putenv('WORKFLOW_EXECUTION_BACKEND=does-not-exist');
try {
    ExecutionBackendFactory::create();
    ensureHardening(false, 'unknown execution backend rejected');
} catch (RuntimeException $exception) {
    ensureHardening(true, 'unknown execution backend rejected');
}
putenv('WORKFLOW_EXECUTION_BACKEND');

putenv('WORKFLOW_SCRIPT_MAX_SOURCE_BYTES=1024');
$tooLarge = ['widgets' => [[
    'id'=>'w','type'=>'Process','language'=>'Python','source'=>str_repeat('x', 1025),
    'inputs'=>[],'outputs'=>[['id'=>'out']]
]], 'connections'=>[]];
$errors = WorkflowValidator::validate($tooLarge);
ensureHardening($errors !== [] && str_contains(implode(' ', $errors), 'source exceeds'), 'validator rejects oversized script source');
putenv('WORKFLOW_SCRIPT_MAX_SOURCE_BYTES');

putenv('WORKFLOW_MAX_WIDGETS=2');
$tooManyWidgets = ['widgets' => [
    ['id'=>'a','inputs'=>[],'outputs'=>[]],
    ['id'=>'b','inputs'=>[],'outputs'=>[]],
    ['id'=>'c','inputs'=>[],'outputs'=>[]],
], 'connections'=>[]];
ensureHardening(WorkflowValidator::validate($tooManyWidgets) !== [], 'workflow widget limit enforced by validator');
putenv('WORKFLOW_MAX_WIDGETS');

if (RuntimeLocator::availability()['Python']) {
    putenv('WORKFLOW_SCRIPT_MAX_INPUT_BYTES=16384');
    try {
        ScriptRunner::run('Python', 'result = value', [['id'=>'x','value'=>str_repeat('x', 20000)]]);
        ensureHardening(false, 'script input payload limit enforced');
    } catch (DomainException $exception) {
        ensureHardening(str_contains($exception->getMessage(), 'input payload exceeds'), 'script input payload limit enforced');
    }
    putenv('WORKFLOW_SCRIPT_MAX_INPUT_BYTES');

    putenv('WORKFLOW_SCRIPT_MAX_RESULT_BYTES=4096');
    try {
        ScriptRunner::run('Python', 'result = "x" * 5000', []);
        ensureHardening(false, 'script result size limit enforced');
    } catch (ScriptExecutionException $exception) {
        ensureHardening(str_contains($exception->getMessage(), 'result exceeded'), 'script result size limit enforced');
    }
    putenv('WORKFLOW_SCRIPT_MAX_RESULT_BYTES');

    putenv('WORKFLOW_SCRIPT_MAX_STREAM_BYTES=4096');
    try {
        ScriptRunner::run('Python', "print('x' * 5000)\nresult = 1", []);
        ensureHardening(false, 'script stdout limit enforced');
    } catch (ScriptExecutionException $exception) {
        ensureHardening(str_contains($exception->getMessage(), 'stdout/stderr limit'), 'script stdout limit enforced');
    }
    putenv('WORKFLOW_SCRIPT_MAX_STREAM_BYTES');
}


$jobDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'workflow-hardening-' . bin2hex(random_bytes(5));
putenv('WORKFLOW_JOB_DIR=' . $jobDir);
putenv('WORKFLOW_MAX_ACTIVE_JOBS=2');
$workflow = ['widgets' => [['id'=>'a','type'=>'Start','language'=>'Pass-through','source'=>'','outputs'=>[['id'=>'out','value'=>1]]]], 'connections'=>[]];
try {
    $one = JobRepository::create($workflow, ['mode'=>'workflow']);
    $two = JobRepository::create($workflow, ['mode'=>'workflow']);
    try {
        JobRepository::create($workflow, ['mode'=>'workflow']);
        ensureHardening(false, 'active job concurrency limit enforced');
    } catch (JobCapacityException $exception) {
        ensureHardening(true, 'active job concurrency limit enforced');
    }

    $path = JobRepository::storageDirectory() . DIRECTORY_SEPARATOR . $one['jobId'] . '.json';
    file_put_contents($path, '{broken-json');
    try {
        JobRepository::read($one['jobId']);
        ensureHardening(false, 'corrupt job record quarantined');
    } catch (JobStorageCorruptionException $exception) {
        $matches = glob(JobRepository::storageDirectory() . DIRECTORY_SEPARATOR . $one['jobId'] . '.corrupt.*.json') ?: [];
        ensureHardening(count($matches) === 1, 'corrupt job record quarantined');
    }
} finally {
    putenv('WORKFLOW_MAX_ACTIVE_JOBS');
    putenv('WORKFLOW_JOB_DIR');
    removeTree($jobDir);
}

echo "Hardening unit tests complete.\n";
