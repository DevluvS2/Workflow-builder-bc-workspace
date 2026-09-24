<?php
declare(strict_types=1);
require_once __DIR__ . '/../backend/src/WorkflowValidator.php';
require_once __DIR__ . '/../backend/src/WorkflowRunner.php';

function ensure(bool $ok, string $name): void {
    if (!$ok) { fwrite(STDERR, "FAIL $name\n"); exit(1); }
    echo "PASS $name\n";
}
function rejected(callable $f, string $name): void {
    try { $f(); }
    catch (DomainException|ScriptExecutionException $e) { echo "PASS $name (rejected)\n"; return; }
    ensure(false, $name);
}

$workflow = ['widgets' => [
    ['id'=>'sum','type'=>'Process','language'=>'Pass-through','source'=>'','serverOperation'=>'sum', 'inputs'=>[['id'=>'numbers','name'=>'numbers','required'=>true,'manualValue'=>'']], 'outputs'=>[['id'=>'result','name'=>'result','value'=>'']]],
    ['id'=>'b','type'=>'Start','language'=>'Pass-through','source'=>'','outputs'=>[['id'=>'value','name'=>'value','value'=>7]]],
    ['id'=>'end','type'=>'End','language'=>'Pass-through','source'=>'','inputs'=>[['id'=>'in','name'=>'in','required'=>true]],'outputs'=>[]],
    ['id'=>'a','type'=>'Start','language'=>'Pass-through','source'=>'','outputs'=>[['id'=>'value','name'=>'value','value'=>5]]]
], 'connections'=>[
    ['sourceWidgetId'=>'a','sourcePortId'=>'value','targetWidgetId'=>'sum','targetPortId'=>'numbers'],
    ['sourceWidgetId'=>'b','sourcePortId'=>'value','targetWidgetId'=>'sum','targetPortId'=>'numbers'],
    ['sourceWidgetId'=>'sum','sourcePortId'=>'result','targetWidgetId'=>'end','targetPortId'=>'in'],
]];

ensure(WorkflowValidator::validate($workflow) === [], 'graph validates');
$r = WorkflowRunner::execute($workflow);
ensure($r['executionOrder'] === ['b','a','sum','end'] && $r['nodes'][2]['outputs'][0]['value'] === 12, 'topological order and server sum 5+7=12');
ensure($r['nodes'][2]['inputs'][0]['value'] === [5,7], 'connection insertion order preserved across 2 sources');
ensure($r['nodes'][3]['inputs'][0]['value'] === 12 && $r['metrics']['measurementScope'] !== '', 'downstream result and labeled metrics');

// Regression: the editor also allows Start widgets with a manual input and a
// blank output. The server must pass that manual input through instead of
// propagating an empty output value.
$startInputWorkflow = $workflow;
foreach ($startInputWorkflow['widgets'] as &$node) {
    if (($node['id'] ?? '') === 'a') {
        $node['inputs'] = [['id'=>'input','name'=>'input','required'=>false,'manualValue'=>'5','value'=>'5']];
        $node['outputs'][0]['value'] = '';
    }
    if (($node['id'] ?? '') === 'b') {
        $node['inputs'] = [['id'=>'input','name'=>'input','required'=>false,'manualValue'=>'7','value'=>'7']];
        $node['outputs'][0]['value'] = '';
    }
}
unset($node);
$r = WorkflowRunner::execute($startInputWorkflow);
ensure($r['nodes'][2]['inputs'][0]['value'] === ['5','7'] && $r['nodes'][2]['outputs'][0]['value'] === 12, 'Start manual inputs pass through to connected workflow');

if (ScriptRunner::runtimeAvailability()['Python']) {
    $pythonStartInputWorkflow = $startInputWorkflow;
    $pythonStartInputWorkflow['widgets'][0]['language'] = 'Python';
    $pythonStartInputWorkflow['widgets'][0]['source'] = "print('Received values:', value)\nresult = sum(int(x) for x in value)";
    $pythonStartInputWorkflow['widgets'][0]['serverOperation'] = 'pass-through';
    $r = WorkflowRunner::execute($pythonStartInputWorkflow);
    ensure($r['nodes'][2]['outputs'][0]['value'] === 12, 'Python sums manual Start input values 5+7=12');
} else echo "SKIP Python Start-input regression runtime unavailable\n";

$pass = $workflow; $pass['widgets'][0]['serverOperation'] = 'pass-through';
ensure(WorkflowRunner::execute($pass)['nodes'][2]['outputs'][0]['value'] === [5,7], 'pass through multi-source array');

$legacyExpression = $workflow;
$legacyExpression['widgets'][0]['language'] = 'Expression';
$legacyExpression['widgets'][0]['source'] = '';
ensure(WorkflowRunner::execute($legacyExpression)['nodes'][2]['outputs'][0]['value'] === 12, 'empty legacy Expression remains compatible with built-in operation');

$selected = $workflow; $selected['widgets'][1]['outputs'][0]['value'] = 8;
$r = WorkflowRunner::execute($selected,['mode'=>'selected','selectedWidgetIds'=>['sum']]);
ensure($r['usesCachedInputs'] && $r['nodes'][0]['outputs'][0]['value'] === 13, 'selected mode reuses saved upstream values');

$r = WorkflowRunner::execute($workflow,['mode'=>'from-selected','selectedWidgetIds'=>['a']]);
ensure($r['executionOrder'] === ['a','sum','end'] && $r['nodes'][1]['outputs'][0]['value'] === 12, 'downstream run includes reachable nodes');

$available = ScriptRunner::runtimeAvailability();
if ($available['Python']) {
    $python = $workflow;
    $python['widgets'][0]['language'] = 'Python';
    $python['widgets'][0]['source'] = "print('workflow-python')\nresult = sum(value)";
    $python['widgets'][0]['serverOperation'] = 'pass-through';
    $r = WorkflowRunner::execute($python);
    ensure($r['nodes'][2]['outputs'][0]['value'] === 12 && $r['scriptNodeCount'] === 1, 'workflow executes real Python');
    ensure(str_contains($r['nodes'][2]['logs']['stdout'], 'workflow-python'), 'workflow returns Python stdout');
} else echo "SKIP workflow Python runtime unavailable\n";

if ($available['JavaScript']) {
    $js = $workflow;
    $js['widgets'][0]['language'] = 'JavaScript';
    $js['widgets'][0]['source'] = "console.log('workflow-js'); return value.reduce((a,b)=>Number(a)+Number(b),0);";
    $js['widgets'][0]['serverOperation'] = 'pass-through';
    $r = WorkflowRunner::execute($js);
    ensure($r['nodes'][2]['outputs'][0]['value'] === 12 && $r['scriptNodeCount'] === 1, 'workflow executes real JavaScript');
} else echo "SKIP workflow JavaScript runtime unavailable\n";

if ($available['Bash']) {
    $bash = $workflow;
    // Use one upstream source so the Bash convenience variable is a scalar.
    $bash['connections'] = array_values(array_filter($bash['connections'], fn($edge) => !($edge['sourceWidgetId'] === 'b' && $edge['targetWidgetId'] === 'sum')));
    $bash['widgets'][0]['language'] = 'Bash';
    $bash['widgets'][0]['source'] = 'echo "$value"';
    $bash['widgets'][0]['serverOperation'] = 'pass-through';
    $r = WorkflowRunner::execute($bash);
    ensure($r['nodes'][2]['outputs'][0]['value'] === 5 && $r['scriptNodeCount'] === 1, 'workflow executes real Bash');
} else echo "SKIP workflow Bash runtime unavailable\n";

$bad = $workflow; $bad['widgets'][0]['language'] = 'Expression'; $bad['widgets'][0]['source'] = '1+2';
rejected(fn()=>WorkflowRunner::execute($bad), 'Expression source disallowed');
$bad = $workflow; $bad['widgets'][0]['type'] = 'Decision';
rejected(fn()=>WorkflowRunner::execute($bad), 'Decision execution disallowed');
$bad = $workflow; $bad['connections'][] = ['sourceWidgetId'=>'end','sourcePortId'=>'x','targetWidgetId'=>'sum','targetPortId'=>'numbers'];
$bad['widgets'][2]['outputs'] = [['id'=>'x','name'=>'x','value'=>'']];
rejected(fn()=>WorkflowRunner::execute($bad), 'cycle disallowed');
$bad = $workflow; $bad['widgets'][0]['serverOperation'] = 'system';
rejected(fn()=>WorkflowRunner::execute($bad), 'unknown operation disallowed');
$bad = $workflow; $bad['widgets'][1]['outputs'][0]['value'] = 'not-a-number';
rejected(fn()=>WorkflowRunner::execute($bad), 'sum rejects nonnumeric input');
$bad = $workflow; $bad['widgets'][1]['outputs'][0]['value'] = '';
rejected(fn()=>WorkflowRunner::execute($bad, ['mode'=>'selected', 'selectedWidgetIds'=>['sum']]), 'missing partial upstream value disallowed');

echo "Runner unit tests complete.\n";
