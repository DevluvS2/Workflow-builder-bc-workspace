<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/WorkflowValidator.php';
require_once dirname(__DIR__) . '/src/RuntimeLocator.php';
require_once dirname(__DIR__) . '/src/ScriptRunner.php';
require_once dirname(__DIR__) . '/src/WorkflowRunner.php';
require_once dirname(__DIR__) . '/src/JobRepository.php';
require_once dirname(__DIR__) . '/src/JobLauncher.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $data): never {
    http_response_code($status);
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function readJsonBody(): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 1048576) {
        respond(413, ['ok' => false, 'errors' => ['Request exceeds 1 MiB.']]);
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        respond(415, ['ok' => false, 'errors' => ['Content-Type must be application/json.']]);
    }
    $raw = file_get_contents('php://input', false, null, 0, 1048577);
    if ($raw === false || strlen($raw) > 1048576) {
        respond(413, ['ok' => false, 'errors' => ['Request exceeds 1 MiB.']]);
    }
    try {
        $request = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        respond(400, ['ok' => false, 'errors' => ['Invalid JSON.']]);
    }
    if (!is_array($request) || array_is_list($request) || ($request['apiVersion'] ?? null) !== 1) {
        respond(400, ['ok' => false, 'errors' => ['apiVersion must equal 1.']]);
    }
    return $request;
}

function validateExecutionRequest(array $request): array {
    $errors = WorkflowValidator::validate($request['workflow'] ?? null);
    if ($errors !== []) respond(422, ['ok' => false, 'code' => 'INVALID_WORKFLOW', 'errors' => $errors]);
    if (isset($request['execution']) && (!is_array($request['execution']) || array_is_list($request['execution']))) {
        respond(422, ['ok' => false, 'code' => 'INVALID_EXECUTION', 'message' => 'execution must be an object.']);
    }
    return $request['execution'] ?? [];
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($path === '/api/health' && $method === 'GET') {
    respond(200, [
        'apiVersion' => 1,
        'status' => 'ok',
        'executionEnabled' => true,
        'executionScope' => 'local-background-job-runner',
        'scriptExecutionEnabled' => true,
        'runtimes' => ScriptRunner::runtimeAvailability(),
        'persistentJobsEnabled' => true,
        'jobCancellationEnabled' => true,
        'jobStorage' => 'local-file-store',
        'warning' => 'Batch 7D uses local child processes and file-backed jobs. It is for local development and is not a production sandbox.'
    ]);
}

if ($path === '/api/validate' && $method === 'POST') {
    $request = readJsonBody();
    $errors = WorkflowValidator::validate($request['workflow'] ?? null);
    if ($errors !== []) respond(422, ['ok' => false, 'errors' => $errors]);
    respond(200, [
        'ok' => true,
        'status' => 'validated_only',
        'executionEnabled' => true,
        'executionScope' => 'local-background-job-runner',
        'scriptExecutionEnabled' => true,
        'runtimes' => ScriptRunner::runtimeAvailability(),
        'widgetCount' => count($request['workflow']['widgets']),
        'connectionCount' => count($request['workflow']['connections']),
        'message' => 'Workflow schema validated. No job or script was started.'
    ]);
}

if ($path === '/api/execute' && $method === 'POST') {
    $request = readJsonBody();
    $execution = validateExecutionRequest($request);
    try {
        respond(200, WorkflowRunner::execute($request['workflow'], $execution));
    } catch (ScriptExecutionException $exception) {
        respond(422, [
            'ok' => false,
            'code' => 'SCRIPT_EXECUTION_FAILED',
            'language' => $exception->language,
            'message' => $exception->getMessage(),
            'exitCode' => $exception->exitCode,
            'timedOut' => $exception->timedOut,
            'cancelled' => $exception->cancelled,
            'stdout' => substr($exception->stdout, 0, 4000),
            'stderr' => substr($exception->stderr, 0, 4000),
        ]);
    } catch (WorkflowCancelledException $exception) {
        respond(409, ['ok' => false, 'code' => 'RUN_CANCELLED', 'message' => $exception->getMessage()]);
    } catch (DomainException $exception) {
        respond(422, ['ok' => false, 'code' => 'UNSUPPORTED_OR_INVALID_EXECUTION', 'message' => $exception->getMessage()]);
    } catch (RuntimeException $exception) {
        respond(500, ['ok' => false, 'code' => 'RUNNER_FAILURE', 'message' => 'The local execution service could not start or complete the requested process.']);
    }
}

if ($path === '/api/execute') respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'message' => 'Use POST.']);

if ($path === '/api/runs' && $method === 'POST') {
    $request = readJsonBody();
    $execution = validateExecutionRequest($request);
    try {
        $job = JobRepository::create($request['workflow'], $execution);
        try {
            JobLauncher::launch($job['jobId']);
        } catch (Throwable $exception) {
            JobRepository::markLaunchFailure($job['jobId'], $exception->getMessage());
            respond(500, ['ok' => false, 'code' => 'WORKER_LAUNCH_FAILED', 'message' => 'The local background worker could not be launched.']);
        }
        respond(202, [
            'ok' => true,
            'jobId' => $job['jobId'],
            'status' => 'queued',
            'pollAfterMs' => 250,
            'message' => 'Run accepted by the local background worker.'
        ]);
    } catch (RuntimeException $exception) {
        respond(500, ['ok' => false, 'code' => 'JOB_STORAGE_FAILURE', 'message' => 'The local job store could not create this run.']);
    }
}

if ($path === '/api/runs') respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'message' => 'Use POST to create a run.']);

if (is_string($path) && preg_match('#^/api/runs/([a-f0-9]{32})$#D', $path, $match) === 1) {
    if ($method !== 'GET') respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'message' => 'Use GET.']);
    try {
        $job = JobRepository::read($match[1]);
    } catch (RuntimeException $exception) {
        respond(500, ['ok' => false, 'code' => 'JOB_STORAGE_FAILURE', 'message' => 'The local job store could not read this run.']);
    }
    if ($job === null) respond(404, ['ok' => false, 'code' => 'RUN_NOT_FOUND', 'message' => 'Run not found or expired.']);
    respond(200, JobRepository::publicView($job));
}

if (is_string($path) && preg_match('#^/api/runs/([a-f0-9]{32})/cancel$#D', $path, $match) === 1) {
    if ($method !== 'POST') respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'message' => 'Use POST.']);
    try {
        $job = JobRepository::requestCancel($match[1]);
    } catch (RuntimeException $exception) {
        respond(500, ['ok' => false, 'code' => 'JOB_STORAGE_FAILURE', 'message' => 'The local job store could not update this run.']);
    }
    if ($job === null) respond(404, ['ok' => false, 'code' => 'RUN_NOT_FOUND', 'message' => 'Run not found or expired.']);
    $view = JobRepository::publicView($job);
    $view['message'] = in_array($job['status'], ['finished', 'failed', 'cancelled'], true)
        ? 'Run is already in a terminal state.'
        : 'Cancellation requested.';
    respond(($job['status'] ?? '') === 'cancelled' ? 200 : 202, $view);
}

respond(404, ['ok' => false, 'code' => 'NOT_FOUND', 'message' => 'Unknown API endpoint.']);
