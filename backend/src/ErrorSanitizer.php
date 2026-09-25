<?php
declare(strict_types=1);

require_once __DIR__ . '/BackendConfig.php';

final class ErrorSanitizer
{
    public static function text(string $text, ?int $maxBytes = null): string
    {
        $text = str_replace("\0", '', $text);

        // Hide temporary runner directories while preserving useful filenames/line numbers.
        $text = (string)preg_replace(
            '~(?:[A-Za-z]:\\\\|/)[^\r\n]*?workflow-run-[a-f0-9]+[\\\\/]~i',
            '[script]/',
            $text
        );
        $text = (string)preg_replace(
            '~[A-Za-z]:\\\\(?:[^\r\n\\\\]+\\\\)+(?=(?:user|runner)\.(?:py|js|sh)\b)~i',
            '[script]/',
            $text
        );

        $limit = $maxBytes ?? BackendConfig::publicErrorBytes();
        if (strlen($text) > $limit) $text = substr($text, 0, $limit) . '…';
        return $text;
    }

    public static function scriptException(ScriptExecutionException $exception): array
    {
        return [
            'code' => 'SCRIPT_EXECUTION_FAILED',
            'language' => $exception->language,
            'message' => self::text($exception->getMessage()),
            'exitCode' => $exception->exitCode,
            'timedOut' => $exception->timedOut,
            'cancelled' => $exception->cancelled,
            'stdout' => self::text($exception->stdout),
            'stderr' => self::text($exception->stderr),
        ];
    }
}
