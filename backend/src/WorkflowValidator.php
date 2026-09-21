<?php
declare(strict_types=1);

final class WorkflowValidator
{
    public static function validate(mixed $workflow): array
    {
        $errors = [];
        if (!is_array($workflow) || array_is_list($workflow)) {
            return ['Workflow must be a JSON object.'];
        }
        $widgets = $workflow['widgets'] ?? null;
        $connections = $workflow['connections'] ?? null;
        if (!is_array($widgets) || !array_is_list($widgets) || count($widgets) > 500) {
            $errors[] = 'widgets must be an array with at most 500 elements.';
        }
        if (!is_array($connections) || !array_is_list($connections) || count($connections) > 2000) {
            $errors[] = 'connections must be an array with at most 2000 elements.';
        }
        if ($errors !== []) return $errors;
        $ids = [];
        $ports = [];
        foreach ($widgets as $index => $widget) {
            if (!is_array($widget) || array_is_list($widget)) {
                $errors[] = "widgets[$index] must be an object.";
                continue;
            }
            $id = $widget['id'] ?? null;
            if (!is_string($id) || $id === '' || strlen($id) > 128 || isset($ids[$id])) {
                $errors[] = "widgets[$index] must have a unique nonempty id (max 128 bytes).";
                continue;
            }
            $ids[$id] = true;
            foreach (['inputs', 'outputs'] as $direction) {
                $items = $widget[$direction] ?? [];
                if (!is_array($items) || !array_is_list($items) || count($items) > 100) {
                    $errors[] = "widgets[$index].$direction must be an array of at most 100 ports.";
                    continue;
                }
                foreach ($items as $portIndex => $port) {
                    $portId = is_array($port) ? ($port['id'] ?? null) : null;
                    if (!is_string($portId) || $portId === '' || strlen($portId) > 128 || isset($ports[$id][$direction][$portId])) {
                        $errors[] = "widgets[$index].$direction[$portIndex] has invalid/duplicate port id.";
                    } else {
                        $ports[$id][$direction][$portId] = true;
                    }
                }
            }
        }
        foreach ($connections as $index => $edge) {
            if (!is_array($edge) || array_is_list($edge)) {
                $errors[] = "connections[$index] must be an object.";
                continue;
            }
            foreach ([['sourceWidgetId', 'sourcePortId', 'outputs'], ['targetWidgetId', 'targetPortId', 'inputs']] as [$widgetKey, $portKey, $direction]) {
                $widgetId = $edge[$widgetKey] ?? null;
                $portId = $edge[$portKey] ?? null;
                if (!is_string($widgetId) || !isset($ids[$widgetId]) || !is_string($portId) || !isset($ports[$widgetId][$direction][$portId])) {
                    $errors[] = "connections[$index] references an unknown $direction widget/port.";
                }
            }
        }
        return array_slice($errors, 0, 30);
    }
}
