<?php
require dirname(__DIR__, 3) . '/config.core.php';
require MODX_CORE_PATH . 'config/' . MODX_CONFIG_KEY . '.inc.php';
require MODX_CORE_PATH . 'model/modx/modx.class.php';

$modx = new modX();
$modx->initialize('mgr');

$service = $modx->getService(
    'criticalcss',
    'CriticalCssService',
    MODX_CORE_PATH . 'components/criticalcss/model/criticalcss/',
    []
);

$mode = $argv[1] ?? 'all';

if ($mode === 'all') {
    $service->regenerateAll();
} else {
    $service->regenerateResource((int)$mode);
}
