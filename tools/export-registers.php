<?php
// Dump every register config (fields + options + flags) as JSON, using the app's own definitions.
chdir('/home/claude/src/parish_records_php/includes');
function e($s){return $s;} 
require_once 'field_specs.php';
require_once 'parish_registers.php';
$types = ['baptism','communion','confirmation','death','parish_priests','holy_orders','catechesis_teachers','counsellors'];
$out = [];
foreach ($types as $t) { $out[$t] = register_config($t); }
foreach (parish_register_configs() as $k => $v) { $out[$k] = $v; }
// strip non-serialisable items
echo json_encode($out, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_PARTIAL_OUTPUT_ON_ERROR);
