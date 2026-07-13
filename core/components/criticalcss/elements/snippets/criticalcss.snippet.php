<?php
$id = $modx->resource->get('id');
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
$isMobile = preg_match('/Mobile|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i', $ua);

$record = $modx->getObject('CriticalCss', ['resource_id' => $id]);
if (!$record) return '';

$css = $isMobile ? $record->get('mobile_css') : $record->get('desktop_css');
if (!$css) return '';

return "<style>{$css}</style>";
