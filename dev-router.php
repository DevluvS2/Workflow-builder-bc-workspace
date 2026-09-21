<?php
declare(strict_types=1);
// Development-only single-origin router. Start from the project root:
// php -S 127.0.0.1:8000 dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($path)) { http_response_code(400); exit; }
if (str_starts_with($path, '/api/')) {
    require __DIR__ . '/backend/public/index.php';
    exit;
}
if ($path === '/') $path = '/index.html';
// Allow only known frontend assets; never expose backend source, storage, router, or tests.
if (!preg_match('#^/(?:index\.html|css/styles\.css|js/(?:app|board|widget|connection|executionClient)\.js)$#D', $path)) {
    http_response_code(404);
    exit('Not found');
}
$file = __DIR__ . $path;
if (!is_file($file)) { http_response_code(404); exit('Not found'); }
$extension = pathinfo($file, PATHINFO_EXTENSION);
header('Content-Type: ' . match ($extension) { 'js' => 'text/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8', default => 'text/html; charset=utf-8' });
readfile($file);
