<?php
declare(strict_types=1);

require_once __DIR__ . '/BackendConfig.php';
require_once __DIR__ . '/ExecutionBackendFactory.php';

/**
 * Workflow engine used by synchronous compatibility calls and persistent background jobs.
 *
 * Pass-through/sum execute inside PHP. Python, JavaScript and Bash execute in
 * short-lived LOCAL DEVELOPMENT child processes through ScriptRunner. Background
 * jobs add persistence/cancellation, but ScriptRunner is still not a production security sandbox.
 */
final class WorkflowCancelledException extends RuntimeException {}

final class WorkflowRunner
{
    public static function execute(array $workflow, array $options = [], array $hooks = []): array
    {
        $started = hrtime(true);
        $widgets = $workflow['widgets'];
        $edges = $workflow['connections'];
        if (count($widgets) > BackendConfig::executionMaxWidgets() || count($edges) > BackendConfig::executionMaxConnections()) {
            throw new DomainException(
                'Execution allows at most ' . BackendConfig::executionMaxWidgets() .
                ' widgets and ' . BackendConfig::executionMaxConnections() . ' connections per run.'
            );
        }
        $executionBackend = ExecutionBackendFactory::create();

        $byId = [];
        foreach ($widgets as $widget) $byId[$widget['id']] = $widget;
        $mode = $options['mode'] ?? 'workflow';
        if (!in_array($mode, ['workflow', 'selected', 'multi-selected', 'from-selected'], true)) {
            throw new DomainException('Unsupported execution mode.');
        }
        $selected = $options['selectedWidgetIds'] ?? [];
        if (!is_array($selected) || !array_is_list($selected) || count($selected) > BackendConfig::selectedMaxWidgets()) {
            throw new DomainException('selectedWidgetIds must be an array of at most ' . BackendConfig::selectedMaxWidgets() . ' widget IDs.');
        }
        foreach ($selected as $id) {
            if (!is_string($id) || !isset($byId[$id])) throw new DomainException('Unknown selected widget.');
        }

        $chosen = self::chooseWidgets($mode, $selected, $byId, $edges);
        if ($chosen === []) throw new DomainException('The workflow has no widgets to execute.');
        [$order, $incoming] = self::executionOrder($widgets, $edges, $chosen);

        $shouldCancel = isset($hooks['shouldCancel']) && is_callable($hooks['shouldCancel'])
            ? $hooks['shouldCancel']
            : static fn(): bool => false;
        $onPlan = isset($hooks['onPlan']) && is_callable($hooks['onPlan']) ? $hooks['onPlan'] : null;
        $onNodeStarted = isset($hooks['onNodeStarted']) && is_callable($hooks['onNodeStarted']) ? $hooks['onNodeStarted'] : null;
        $onNodeFinished = isset($hooks['onNodeFinished']) && is_callable($hooks['onNodeFinished']) ? $hooks['onNodeFinished'] : null;
        if ($shouldCancel()) throw new WorkflowCancelledException('Workflow run cancelled.');
        if ($onPlan) $onPlan($order);

        // Reject the whole request before starting any user process.
        foreach ($order as $id) {
            if ($shouldCancel()) throw new WorkflowCancelledException('Workflow run cancelled.');
            self::preflightNode($byId[$id], $executionBackend);
        }

        $resolvedOutputs = [];
        $nodes = [];
        $usesCachedInputs = false;
        $maxNodeMemoryBytes = null;
        $scriptNodeCount = 0;

        foreach ($order as $id) {
            if ($shouldCancel()) throw new WorkflowCancelledException('Workflow run cancelled.');
            if ($onNodeStarted) $onNodeStarted($id);
            $nodeStarted = hrtime(true);
            $nodeMemoryStart = memory_get_usage(true);
            $node = $byId[$id];
            $inputs = [];

            foreach (($node['inputs'] ?? []) as $port) {
                $sources = $incoming[$id][$port['id']] ?? [];
                $values = [];
                foreach ($sources as $edge) {
                    $source = $edge['sourceWidgetId'];
                    $outId = $edge['sourcePortId'];
                    if (isset($chosen[$source])) {
                        if (!array_key_exists($outId, $resolvedOutputs[$source] ?? [])) {
                            throw new DomainException("Widget '$id' has an unresolved upstream output.");
                        }
                        $values[] = $resolvedOutputs[$source][$outId];
                    } else {
                        $output = self::findPort($byId[$source]['outputs'] ?? [], $outId);
                        if ($output === null || !array_key_exists('value', $output) || $output['value'] === '') {
                            throw new DomainException("Widget '$id' needs a prior output from unselected widget '$source'. Run upstream first.");
                        }
                        $values[] = $output['value'];
                        $usesCachedInputs = true;
                    }
                }
                $value = $sources === []
                    ? ($port['manualValue'] ?? $port['value'] ?? '')
                    : (count($values) === 1 ? $values[0] : $values);
                if (($port['required'] ?? false) && ($value === '' || $value === [])) {
                    throw new DomainException("Widget '$id' has a missing required input '{$port['id']}'.");
                }
                $inputs[] = [
                    'id' => $port['id'],
                    'name' => (string)($port['name'] ?? $port['id']),
                    'value' => $value,
                ];
            }

            $logs = ['stdout' => '', 'stderr' => ''];
            $runtime = null;
            $language = (string)($node['language'] ?? 'Pass-through');
            $metrics = [];

            if (($node['type'] ?? '') === 'Start') {
                /*
                 * Start widgets can be used in either of the two shapes the
                 * editor currently allows:
                 *   1) a configured output value, or
                 *   2) a manual input value that is passed through to output.
                 *
                 * Batch 7C previously handled only (1), so a Start widget with
                 * `In input: 5` and a blank output propagated an empty string.
                 * Real scripts then received values such as ["", ""].
                 */
                if ($inputs !== []) {
                    $startResult = self::runBuiltInOperation($node, $inputs);
                    $outputs = self::mapResultToOutputs($node, $startResult);
                    $executionKind = 'start-pass-through';
                } else {
                    $outputs = [];
                    foreach (($node['outputs'] ?? []) as $output) {
                        $outputs[$output['id']] = $output['value'] ?? '';
                    }
                    $executionKind = 'start-value';
                }
                $metrics = [
                    'wallTimeMs' => round((hrtime(true) - $nodeStarted) / 1000000, 4),
                    'memoryBytes' => max(0, memory_get_usage(true) - $nodeMemoryStart),
                    'memoryMetric' => 'php-allocated-delta',
                    'exitCode' => 0,
                    'stdoutBytes' => 0,
                    'stderrBytes' => 0,
                    'executionKind' => $executionKind,
                ];
            } elseif (in_array($language, ['Python', 'JavaScript', 'Bash'], true)) {
                $scriptNodeCount++;
                try {
                    $script = $executionBackend->run($language, (string)($node['source'] ?? ''), $inputs, ['shouldCancel' => $shouldCancel]);
                } catch (ScriptExecutionException $exception) {
                    if ($exception->cancelled) throw new WorkflowCancelledException('Workflow run cancelled.');
                    throw new ScriptExecutionException(
                        "Widget '$id': " . $exception->getMessage(),
                        $exception->language,
                        $exception->stdout,
                        $exception->stderr,
                        $exception->exitCode,
                        $exception->timedOut
                    );
                }
                $outputs = self::mapResultToOutputs($node, $script['result']);
                $logs = ['stdout' => $script['stdout'], 'stderr' => $script['stderr']];
                $runtime = $script['runtime'];
                $metrics = $script['metrics'] + ['executionKind' => $executionBackend->name()];
            } else {
                $result = self::runBuiltInOperation($node, $inputs);
                $outputs = self::mapResultToOutputs($node, $result);
                $metrics = [
                    'wallTimeMs' => round((hrtime(true) - $nodeStarted) / 1000000, 4),
                    'memoryBytes' => max(0, memory_get_usage(true) - $nodeMemoryStart),
                    'memoryMetric' => 'php-allocated-delta',
                    'exitCode' => 0,
                    'stdoutBytes' => 0,
                    'stderrBytes' => 0,
                    'executionKind' => 'php-operation',
                ];
            }

            if (isset($metrics['memoryBytes']) && is_numeric($metrics['memoryBytes'])) {
                $bytes = max(0, (int)$metrics['memoryBytes']);
                $maxNodeMemoryBytes = $maxNodeMemoryBytes === null ? $bytes : max($maxNodeMemoryBytes, $bytes);
            }

            $resolvedOutputs[$id] = $outputs;
            $nodeResult = [
                'widgetId' => $id,
                'status' => 'finished',
                'inputs' => array_map(static fn(array $input) => ['id' => $input['id'], 'value' => $input['value']], $inputs),
                'outputs' => array_map(static fn($portId, $value) => ['id' => $portId, 'value' => $value], array_keys($outputs), array_values($outputs)),
                'metrics' => $metrics,
                'logs' => $logs,
                'runtime' => $runtime,
            ];
            $nodes[] = $nodeResult;
            if ($onNodeFinished) $onNodeFinished($id, $nodeResult);
            if ($shouldCancel()) throw new WorkflowCancelledException('Workflow run cancelled.');
        }

        return [
            'ok' => true,
            'status' => 'finished',
            'executionMode' => $mode,
            'executionOrder' => $order,
            'nodes' => $nodes,
            'usesCachedInputs' => $usesCachedInputs,
            'scriptNodeCount' => $scriptNodeCount,
            'metrics' => [
                'wallTimeMs' => round((hrtime(true) - $started) / 1000000, 4),
                'phpPeakMemoryBytes' => memory_get_peak_usage(true),
                'maxNodeMemoryBytes' => $maxNodeMemoryBytes,
                'measurementScope' => 'Workflow wall time is measured by PHP. Script-node memory is runtime-specific and labeled per node.',
            ],
            'message' => $scriptNodeCount > 0
                ? 'Workflow completed using the configured script execution backend. The current local-process backend is not a production sandbox.'
                : 'Workflow completed using PHP built-in operations.',
        ];
    }

    private static function chooseWidgets(string $mode, array $selected, array $byId, array $edges): array
    {
        if ($mode === 'workflow') return array_fill_keys(array_keys($byId), true);

        $unique = array_values(array_unique($selected));
        if ($unique === [] || (in_array($mode, ['selected', 'from-selected'], true) && count($unique) !== 1)) {
            throw new DomainException('This execution mode requires the appropriate selected widget ID(s).');
        }
        $chosen = array_fill_keys($unique, true);
        if ($mode === 'from-selected') {
            $queue = $unique;
            for ($i = 0; $i < count($queue); $i++) {
                foreach ($edges as $edge) {
                    if ($edge['sourceWidgetId'] === $queue[$i] && !isset($chosen[$edge['targetWidgetId']])) {
                        $target = $edge['targetWidgetId'];
                        $chosen[$target] = true;
                        $queue[] = $target;
                    }
                }
            }
        }
        return $chosen;
    }

    private static function executionOrder(array $widgets, array $edges, array $chosen): array
    {
        $indegree = array_fill_keys(array_keys($chosen), 0);
        $outgoing = [];
        $incoming = [];
        foreach ($edges as $edge) {
            $target = $edge['targetWidgetId'];
            $source = $edge['sourceWidgetId'];
            $incoming[$target][$edge['targetPortId']][] = $edge;
            if (isset($chosen[$source], $chosen[$target])) {
                $indegree[$target]++;
                $outgoing[$source][] = $target;
            }
        }
        $queue = [];
        foreach ($widgets as $widget) {
            if (isset($chosen[$widget['id']]) && $indegree[$widget['id']] === 0) $queue[] = $widget['id'];
        }
        $order = [];
        for ($i = 0; $i < count($queue); $i++) {
            $id = $queue[$i];
            $order[] = $id;
            foreach ($outgoing[$id] ?? [] as $target) {
                if (--$indegree[$target] === 0) $queue[] = $target;
            }
        }
        if (count($order) !== count($chosen)) throw new DomainException('Execution graph contains a cycle.');
        return [$order, $incoming];
    }

    private static function preflightNode(array $node, ExecutionBackend $executionBackend): void
    {
        $id = (string)$node['id'];
        $type = (string)($node['type'] ?? 'Process');
        $language = (string)($node['language'] ?? 'Pass-through');
        $source = trim((string)($node['source'] ?? ''));

        if ($type === 'Decision') {
            throw new DomainException("Widget '$id' uses Decision branching, which is not implemented in the server engine yet.");
        }
        if ($type === 'Start') {
            if ($language !== 'Pass-through' || $source !== '') throw new DomainException("Start widget '$id' must use Pass-through with empty source.");
            return;
        }
        if ($type === 'End' && ($language !== 'Pass-through' || $source !== '')) {
            throw new DomainException("End widget '$id' must use Pass-through with empty source.");
        }
        if ($language === 'Expression') {
            // Backward compatibility for older saved Process widgets whose
            // language defaulted to Expression but had no expression source.
            // Empty Expression nodes use the allowlisted built-in operation;
            // non-empty expression text is never evaluated.
            if ($source !== '') {
                throw new DomainException("Widget '$id' contains Expression source. Batch 7C does not evaluate expression text; choose Python, JavaScript, Bash, or Pass-through.");
            }
            $operation = $node['serverOperation'] ?? 'pass-through';
            if (!in_array($operation, ['pass-through', 'sum'], true)) {
                throw new DomainException("Widget '$id' requests an unsupported server operation.");
            }
            return;
        }
        if (in_array($language, ['Python', 'JavaScript', 'Bash'], true)) {
            if ($type !== 'Process') throw new DomainException("Only Process widgets may execute $language scripts.");
            if ($source === '') throw new DomainException("Widget '$id' has empty $language source.");
            $executionBackend->assertRuntimeAvailable($language);
            return;
        }
        if ($language !== 'Pass-through') throw new DomainException("Widget '$id' uses unsupported language '$language'.");
        if ($source !== '') throw new DomainException("Pass-through widget '$id' must have empty source.");
        $operation = $node['serverOperation'] ?? 'pass-through';
        if (!in_array($operation, ['pass-through', 'sum'], true)) {
            throw new DomainException("Widget '$id' requests an unsupported server operation.");
        }
        if ($type !== 'Process' && $operation !== 'pass-through') {
            throw new DomainException("Widget '$id' cannot perform the '$operation' server operation.");
        }
    }

    private static function runBuiltInOperation(array $node, array $inputs): mixed
    {
        $operation = $node['serverOperation'] ?? 'pass-through';
        $first = $inputs[0]['value'] ?? ($node['outputs'][0]['value'] ?? '');
        if ($operation === 'pass-through') return $first;

        $numbers = [];
        foreach ($inputs as $input) {
            $items = is_array($input['value']) && array_is_list($input['value']) ? $input['value'] : [$input['value']];
            foreach ($items as $value) {
                if (!is_int($value) && !is_float($value) && !(is_string($value) && $value !== '' && is_numeric($value))) {
                    throw new DomainException("Widget '{$node['id']}' sum operation requires numeric inputs.");
                }
                $numeric = $value + 0;
                if (!is_finite((float)$numeric)) throw new DomainException("Widget '{$node['id']}' sum operation requires finite numbers.");
                $numbers[] = $numeric;
            }
        }
        if ($numbers === []) throw new DomainException("Widget '{$node['id']}' sum operation requires inputs.");
        $sum = array_sum($numbers);
        if (!is_finite((float)$sum)) throw new DomainException("Widget '{$node['id']}' sum operation exceeded the supported numeric range.");
        return $sum;
    }

    private static function mapResultToOutputs(array $node, mixed $result): array
    {
        $ports = $node['outputs'] ?? [];
        if ($ports === []) return [];
        $outputs = [];

        // Preserve Batch 7B pass-through semantics: one output receives the
        // entire incoming value, including an ordered multi-source array.
        if (in_array(($node['language'] ?? ''), ['Pass-through', 'Expression'], true) && trim((string)($node['source'] ?? '')) === '' && count($ports) === 1) {
            $outputs[$ports[0]['id']] = $result;
            return $outputs;
        }

        if (is_array($result) && array_is_list($result)) {
            foreach ($ports as $index => $port) {
                if (array_key_exists($index, $result)) $outputs[$port['id']] = $result[$index];
            }
            if ($outputs !== []) return $outputs;
        }

        if (is_array($result) && !array_is_list($result)) {
            $matched = false;
            foreach ($ports as $port) {
                if (array_key_exists($port['id'], $result)) {
                    $outputs[$port['id']] = $result[$port['id']];
                    $matched = true;
                } elseif (isset($port['name']) && array_key_exists((string)$port['name'], $result)) {
                    $outputs[$port['id']] = $result[(string)$port['name']];
                    $matched = true;
                }
            }
            if ($matched) return $outputs;
        }

        if (($node['language'] ?? '') === 'Pass-through' && count($ports) > 1) {
            foreach ($ports as $port) $outputs[$port['id']] = $result;
            return $outputs;
        }

        $outputs[$ports[0]['id']] = $result;
        return $outputs;
    }

    private static function findPort(array $ports, string $id): ?array
    {
        foreach ($ports as $port) if (($port['id'] ?? null) === $id) return $port;
        return null;
    }
}
