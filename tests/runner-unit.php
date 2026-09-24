<?php
declare(strict_types=1);
require_once __DIR__ . '/../backend/src/WorkflowValidator.php';
require_once __DIR__ . '/../backend/src/WorkflowRunner.php';

function ensure(bool $ok, string $name): void {
    if (!$ok) { fwrite(STDERR, "FAIL $name\n"); exit(1); }
    echo "PASS $name\n";
}
function rejected(callable $f, string $name): void {
    try { $f(); } catch (DomainException $e) { echo "PASS $name (rejected)\n"; return; }
    ensure(false, $name);
}
$workflow = ['widgets' => [
    ['id'=>'sum','type'=>'Process','language'=>'Pass-through','source'=>'','serverOperation'=>'sum', 'inputs'=>[['id'=>'numbers','required'=>true,'manualValue'=>'']], 'outputs'=>[['id'=>'result','value'=>'']]],
    ['id'=>'b','type'=>'Start','language'=>'Pass-through','outputs'=>[['id'=>'value','value'=>7]]],
    ['id'=>'end','type'=>'End','language'=>'Pass-through','inputs'=>[['id'=>'in','required'=>true]],'outputs'=>[]],
    ['id'=>'a','type'=>'Start','language'=>'Pass-through','outputs'=>[['id'=>'value','value'=>5]]]
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
$pass = $workflow; $pass['widgets'][0]['serverOperation'] = 'pass-through';
ensure(WorkflowRunner::execute($pass)['nodes'][2]['outputs'][0]['value'] === [5,7], 'pass through multi-source array');
$selected = $workflow; $selected['widgets'][1]['outputs'][0]['value'] = 8;
$r = WorkflowRunner::execute($selected,['mode'=>'selected','selectedWidgetIds'=>['sum']]);
ensure($r['usesCachedInputs'] && $r['nodes'][0]['outputs'][0]['value'] === 13, 'selected mode reuses saved upstream values');
$r = WorkflowRunner::execute($workflow,['mode'=>'from-selected','selectedWidgetIds'=>['a']]);
ensure($r['executionOrder'] === ['a','sum','end'] && $r['nodes'][1]['outputs'][0]['value'] === 12, 'downstream run includes reachable nodes');
$bad = $workflow; $bad['widgets'][0]['language'] = 'Python';
rejected(fn()=>WorkflowRunner::execute($bad), 'Python execution disallowed');
$bad = $workflow; $bad['widgets'][0]['source'] = '1+2';
rejected(fn()=>WorkflowRunner::execute($bad), 'non-empty Expression source disallowed');
$bad = $workflow; $bad['widgets'][0]['type'] = 'Decision';
rejected(fn()=>WorkflowRunner::execute($bad), 'Decision execution disallowed');
$bad = $workflow; $bad['connections'][] = ['sourceWidgetId'=>'end','sourcePortId'=>'x','targetWidgetId'=>'sum','targetPortId'=>'numbers'];
// Direct runner cycle test with valid output port.
$bad['widgets'][2]['outputs'] = [['id'=>'x','value'=>'']];
rejected(fn()=>WorkflowRunner::execute($bad), 'cycle disallowed');
$bad = $workflow; $bad['widgets'][0]['serverOperation'] = 'system';
rejected(fn()=>WorkflowRunner::execute($bad), 'unknown operation disallowed');
$bad = $workflow; $bad['widgets'][1]['outputs'][0]['value'] = 'not-a-number';
rejected(fn()=>WorkflowRunner::execute($bad), 'sum rejects nonnumeric input');
$bad = $workflow; $bad['widgets'][1]['outputs'][0]['value'] = '';
rejected(fn()=>WorkflowRunner::execute($bad, ['mode'=>'selected', 'selectedWidgetIds'=>['sum']]), 'missing partial upstream value disallowed');
echo "Runner unit tests complete.\n";
