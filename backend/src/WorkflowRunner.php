<?php
declare(strict_types=1);

/**
 * Batch 7B: synchronous, allowlisted PHP-only operations. This is NOT a script
 * sandbox or a persistent job runner. Never evaluate user-provided source text.
 */
final class WorkflowRunner
{
    public static function execute(array $workflow, array $options = []): array
    {
        $started = hrtime(true);
        $widgets = $workflow['widgets'];
        $edges = $workflow['connections'];
        if (count($widgets) > 100 || count($edges) > 400) {
            throw new DomainException('Batch 7B allows at most 100 widgets and 400 connections per synchronous run.');
        }
        $byId = [];
        foreach ($widgets as $widget) $byId[$widget['id']] = $widget;
        $mode = $options['mode'] ?? 'workflow';
        if (!in_array($mode, ['workflow', 'selected', 'multi-selected', 'from-selected'], true)) {
            throw new DomainException('Unsupported execution mode.');
        }
        $selected = $options['selectedWidgetIds'] ?? [];
        if (!is_array($selected) || !array_is_list($selected) || count($selected) > 100) {
            throw new DomainException('selectedWidgetIds must be an array of at most 100 widget IDs.');
        }
        foreach ($selected as $id) {
            if (!is_string($id) || !isset($byId[$id])) throw new DomainException('Unknown selected widget.');
        }
        if ($mode === 'workflow') {
            $chosen = array_fill_keys(array_keys($byId), true);
        } else {
            $unique = array_unique($selected);
            if ($unique === [] || (in_array($mode, ['selected', 'from-selected'], true) && count($unique) !== 1)) {
                throw new DomainException('This execution mode requires the appropriate selected widget ID(s).');
            }
            $chosen = array_fill_keys($unique, true);
            if ($mode === 'from-selected') {
                $queue = array_values($unique);
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
        }
        if ($chosen === []) throw new DomainException('The workflow has no widgets to execute.');
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
        foreach ($widgets as $widget) if (isset($chosen[$widget['id']]) && $indegree[$widget['id']] === 0) $queue[] = $widget['id'];
        $order = [];
        for ($i = 0; $i < count($queue); $i++) {
            $id = $queue[$i];
            $order[] = $id;
            foreach ($outgoing[$id] ?? [] as $target) {
                if (--$indegree[$target] === 0) $queue[] = $target;
            }
        }
        if (count($order) !== count($chosen)) throw new DomainException('Execution graph contains a cycle.');

        // Reject the entire request BEFORE executing any node or modifying client data.
        foreach ($order as $id) {
            $node = $byId[$id];
            $type = $node['type'] ?? 'Process';
            $language = $node['language'] ?? 'Pass-through';
            if ($type === 'Decision') throw new DomainException("Widget '$id' uses Decision branching, which is not supported until the isolated runner phase.");
            if (!in_array($language, ['Pass-through', 'Expression'], true) || trim((string)($node['source'] ?? '')) !== '') {
                throw new DomainException("Widget '$id' contains script source or unsupported language. Batch 7B never executes scripts.");
            }
            $operation = $node['serverOperation'] ?? 'pass-through';
            if (!in_array($operation, ['pass-through', 'sum'], true)) {
                throw new DomainException("Widget '$id' requests an unsupported server operation.");
            }
            if ($type === 'Start' && $operation !== 'pass-through') {
                throw new DomainException("Start widget '$id' cannot perform a server operation.");
            }
        }

        $resolvedOutputs = [];
        $nodes = [];
        $usesCachedInputs = false;
        foreach ($order as $id) {
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
                        // Partial runs may reuse explicitly saved upstream outputs.
                        $output = self::findPort($byId[$source]['outputs'] ?? [], $outId);
                        if ($output === null || !array_key_exists('value', $output) || $output['value'] === '') {
                            throw new DomainException("Widget '$id' needs a prior output from unselected widget '$source'. Run upstream first.");
                        }
                        $values[] = $output['value'];
                        $usesCachedInputs = true;
                    }
                }
                $value = $sources === [] ? ($port['manualValue'] ?? $port['value'] ?? '') : (count($values) === 1 ? $values[0] : $values);
                if (($port['required'] ?? false) && ($value === '' || $value === [])) {
                    throw new DomainException("Widget '$id' has a missing required input '{$port['id']}'.");
                }
                $inputs[] = ['id' => $port['id'], 'value' => $value];
            }
            $outputs = [];
            if (($node['type'] ?? '') === 'Start') {
                foreach (($node['outputs'] ?? []) as $output) $outputs[$output['id']] = $output['value'] ?? '';
            } else {
                $first = $inputs[0]['value'] ?? ($node['outputs'][0]['value'] ?? '');
                if (($node['serverOperation'] ?? 'pass-through') === 'sum') {
                    $numbers = [];
                    foreach ($inputs as $input) {
                        foreach ((is_array($input['value']) && array_is_list($input['value']) ? $input['value'] : [$input['value']]) as $value) {
                            if (!is_int($value) && !is_float($value) && !(is_string($value) && $value !== '' && is_numeric($value))) {
                                throw new DomainException("Widget '$id' sum operation requires numeric inputs.");
                            }
                            $numeric = $value + 0;
                            if (!is_finite((float)$numeric)) {
                                throw new DomainException("Widget '$id' sum operation requires finite numbers.");
                            }
                            $numbers[] = $numeric;
                        }
                    }
                    if ($numbers === []) throw new DomainException("Widget '$id' sum operation requires inputs.");
                    $first = array_sum($numbers);
                    if (!is_finite((float)$first)) {
                        throw new DomainException("Widget '$id' sum operation exceeded the supported numeric range.");
                    }
                }
                foreach (($node['outputs'] ?? []) as $output) $outputs[$output['id']] = $first;
            }
            $resolvedOutputs[$id] = $outputs;
            $nodes[] = [
                'widgetId' => $id,
                'status' => 'finished',
                'inputs' => $inputs,
                'outputs' => array_map(static fn($portId, $value) => ['id' => $portId, 'value' => $value], array_keys($outputs), array_values($outputs)),
                'metrics' => [
                    'wallTimeMs' => round((hrtime(true) - $nodeStarted) / 1000000, 4),
                    'phpAllocatedDeltaBytes' => max(0, memory_get_usage(true) - $nodeMemoryStart),
                ],
            ];
        }
        return [
            'ok' => true,
            'status' => 'finished',
            'executionMode' => $mode,
            'executionOrder' => $order,
            'nodes' => $nodes,
            'usesCachedInputs' => $usesCachedInputs,
            'metrics' => [
                'wallTimeMs' => round((hrtime(true) - $started) / 1000000, 4),
                'phpPeakMemoryBytes' => memory_get_peak_usage(true),
                'measurementScope' => 'PHP workflow orchestration only; no external script execution',
            ],
            'message' => 'Controlled PHP operations completed. No user scripts were executed. No persistent job was created.',
        ];
    }

    private static function findPort(array $ports, string $id): ?array
    {
        foreach ($ports as $port) if (($port['id'] ?? null) === $id) return $port;
        return null;
    }
}
