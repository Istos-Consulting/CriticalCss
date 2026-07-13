<?php
/** @var modX $modx */

$service = $modx->getService(
    'criticalcss',
    'CriticalCssService',
    $modx->getOption('criticalcss.core_path') . 'model/criticalcss/',
    []
);

if (!$service) return;

switch ($modx->event->name) {

    case 'OnDocFormSave':
        if ($resource->get('published')) {
            $service->regenerateResource((int)$resource->get('id'));
        }
        break;

    case 'OnSiteRefresh':
        // Optional full rebuild
        // $service->regenerateAll();
        break;

    case 'OnCacheUpdate':
        // Optional: detect CSS bundle changes
        break;
}
