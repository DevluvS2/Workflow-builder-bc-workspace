<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/BackendConfig.php';
require_once dirname(__DIR__) . '/src/WorkflowValidator.php';
require_once dirname(__DIR__) . '/src/ExecutionBackendFactory.php';
require_once dirname(__DIR__) . '/src/ErrorSanitizer.php';
require_once dirname(__DIR__) . '/src/WorkflowRunner.php';
require_once dirname(__DIR__) . '/src/JobRepository.php';
require_once dirname(__DIR__) . '/src/JobLauncher.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function respond(int $status, array $data): never {
    http_response_code($status);
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function readJsonBody(): array {
    $limit = BackendConfig::requestMaxBytes();
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) {
        respond(413, ['ok' => false, 'code' => 'REQUEST_TOO_LARGE', 'errors' => ['Request exceeds the configured limit.']]);
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        respond(415, ['ok' => false, 'code' => 'UNSUPPORTED_MEDIA_TYPE', 'errors' => ['Content-Type must be application/json.']]);
    }
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false || strlen($raw) > $limit) {
        respond(413, ['ok' => false, 'code' => 'REQUEST_TOO_LARGE', 'errors' => ['Request exceeds the configured limit.']]);
    }
    try {
        $request = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        respond(400, ['ok' => false, 'code' => 'INVALID_JSON', 'errors' => ['Invalid JSON.']]);
    }
    if (!is_array($request) || array_is_list($request) || ($request['apiVersion'] ?? null) !== 1) {
        respond(400, ['ok' => false, 'code' => 'INVALID_API_VERSION', 'errors' => ['apiVersion must equal 1.']]);
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

function executionBackend(): ExecutionBackend {
    try {
        return ExecutionBackendFactory::create();
    } catch (RuntimeException $exception) {
        respond(503, ['ok' => false, 'code' => 'EXECUTION_BACKEND_UNAVAILABLE', 'message' => 'The configured execution backend is unavailable.']);
    }
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($path === '/api/health' && $method === 'GET') {
    $backend = executionBackend();
    respond(200, [
        'apiVersion' => 1,
        'status' => 'ok',
        'executionEnabled' => true,
        'executionBackend' => $backend->name(),
        'executionScope' => 'local-background-job-runner',
        'scriptExecutionEnabled' => true,
        'allowedRuntimes' => BackendConfig::allowedScriptLanguages(),
        'runtimes' => $backend->runtimeAvailability(),
        'persistentJobsEnabled' => true,
        'jobCancellationEnabled' => true,
        'jobStorage' => 'local-file-store',
        'limits' => BackendConfig::publicLimits(),
        'warning' => 'The local-process backend has resource limits but is not a production security sandbox.'
    ]);
}

if ($path === '/api/validate' && $method === 'POST') {
    $request = readJsonBody();
    $errors = WorkflowValidator::validate($request['workflow'] ?? null);
    if ($errors !== []) respond(422, ['ok' => false, 'code' => 'INVALID_WORKFLOW', 'errors' => $errors]);
    $backend = executionBackend();
    respond(200, [
        'ok' => true,
        'status' => 'validated_only',
        'executionEnabled' => true,
        'executionBackend' => $backend->name(),
        'scriptExecutionEnabled' => true,
        'allowedRuntimes' => BackendConfig::allowedScriptLanguages(),
        'runtimes' => $backend->runtimeAvailability(),
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
        respond(422, ['ok' => false] + ErrorSanitizer::scriptException($exception));
    } catch (WorkflowCancelledException $exception) {
        respond(409, ['ok' => false, 'code' => 'RUN_CANCELLED', 'message' => 'Run cancelled.']);
    } catch (DomainException $exception) {
        respond(422, ['ok' => false, 'code' => 'UNSUPPORTED_OR_INVALID_EXECUTION', 'message' => ErrorSanitizer::text($exception->getMessage())]);
    } catch (RuntimeException $exception) {
        respond(500, ['ok' => false, 'code' => 'RUNNER_FAILURE', 'message' => 'The execution service could not start or complete the requested process.']);
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
            JobRepository::markLaunchFailure($job['jobId']);
            respond(500, ['ok' => false, 'code' => 'WORKER_LAUNCH_FAILED', 'message' => 'The local background worker could not be launched.']);
        }
        respond(202, [
            'ok' => true,
            'jobId' => $job['jobId'],
            'status' => 'queued',
            'pollAfterMs' => 250,
            'message' => 'Run accepted by the local background worker.'
        ]);
    } catch (JobCapacityException $exception) {
        respond(429, ['ok' => false, 'code' => 'TOO_MANY_ACTIVE_RUNS', 'message' => 'Too many runs are already active. Wait for one to finish or stop an existing run.']);
    } catch (RuntimeException $exception) {
        respond(500, ['ok' => false, 'code' => 'JOB_STORAGE_FAILURE', 'message' => 'The local job store could not create this run.']);
    }
}

if ($path === '/api/runs') respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'message' => 'Use POST to create a run.']);

if (is_string($path) && preg_match('#^/api/runs/([a-f0-9]{32})$#D', $path, $match) === 1) {
    if ($method !== 'GET') respond(405, ['ok' => false, 'code' => 'METHOD_NOT_ALLOWED', 'message' => 'Use GET.']);
    try {
        $job = JobRepository::read($match[1]);
    } catch (JobStorageCorruptionException $exception) {
        respond(500, ['ok' => false, 'code' => 'JOB_RECORD_CORRUPT', 'message' => 'This run record is corrupted and has been quarantined.']);
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
    } catch (JobStorageCorruptionException $exception) {
        respond(500, ['ok' => false, 'code' => 'JOB_RECORD_CORRUPT', 'message' => 'This run record is corrupted and has been quarantined.']);
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
