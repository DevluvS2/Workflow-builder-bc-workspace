<?php
declare(strict_types=1);

require_once __DIR__ . '/BackendConfig.php';

/**
 * Locates local development runtimes without invoking a shell.
 * The local-process backend is for development only, not a production sandbox.
 */
final class RuntimeLocator
{
    public static function locate(string $language): ?string
    {
        $canonical = self::canonicalLanguage($language);
        if ($canonical === null || !in_array($canonical, BackendConfig::allowedScriptLanguages(), true)) return null;
        return match ($canonical) {
            'Python' => self::findPython(),
            'JavaScript' => self::findNode(),
            'Bash' => self::findBash(),
        };
    }

    public static function availability(): array
    {
        return [
            'Python' => self::locate('Python') !== null,
            'JavaScript' => self::locate('JavaScript') !== null,
            'Bash' => self::locate('Bash') !== null,
        ];
    }

    public static function isAllowed(string $language): bool
    {
        $canonical = self::canonicalLanguage($language);
        return $canonical !== null && in_array($canonical, BackendConfig::allowedScriptLanguages(), true);
    }

    private static function canonicalLanguage(string $language): ?string
    {
        return match (strtolower(trim($language))) {
            'python' => 'Python',
            'javascript', 'node', 'nodejs' => 'JavaScript',
            'bash' => 'Bash',
            default => null,
        };
    }

    private static function findPython(): ?string
    {
        $override = self::envExecutable('WORKFLOW_PYTHON');
        if ($override !== null) return $override;

        foreach (PHP_OS_FAMILY === 'Windows'
            ? ['python.exe', 'python3.exe']
            : ['python3', 'python'] as $name) {
            $found = self::findOnPath($name);
            if ($found !== null) return $found;
        }
        return null;
    }

    private static function findNode(): ?string
    {
        $override = self::envExecutable('WORKFLOW_NODE');
        if ($override !== null) return $override;
        return self::findOnPath(PHP_OS_FAMILY === 'Windows' ? 'node.exe' : 'node');
    }

    private static function findBash(): ?string
    {
        $override = self::envExecutable('WORKFLOW_BASH');
        if ($override !== null) return $override;

        if (PHP_OS_FAMILY === 'Windows') {
            $roots = array_filter([
                getenv('ProgramFiles') ?: null,
                getenv('ProgramFiles(x86)') ?: null,
                getenv('LOCALAPPDATA') ?: null,
            ]);
            $candidates = [];
            foreach ($roots as $root) {
                $candidates[] = rtrim($root, "\\/") . '\\Git\\bin\\bash.exe';
                $candidates[] = rtrim($root, "\\/") . '\\Programs\\Git\\bin\\bash.exe';
            }

            // If Git's cmd directory is on PATH, derive its sibling bin directory.
            $path = getenv('PATH') ?: '';
            foreach (explode(PATH_SEPARATOR, $path) as $entry) {
                $entry = trim($entry, " \t\n\r\0\x0B\"");
                if ($entry === '') continue;
                if (preg_match('~[\\\\/]Git[\\\\/]cmd$~i', $entry)) {
                    $candidates[] = dirname($entry) . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'bash.exe';
                }
            }

            foreach (array_unique($candidates) as $candidate) {
                if (is_file($candidate) && is_readable($candidate)) return $candidate;
            }

            // Avoid C:\Windows\System32\bash.exe here: on current Windows that is
            // the WSL launcher and fails when no Linux distribution is installed.
            $pathBash = self::findOnPath('bash.exe');
            if ($pathBash !== null) {
                $normalized = strtolower(str_replace('/', '\\', $pathBash));
                $windows = strtolower(str_replace('/', '\\', (getenv('WINDIR') ?: 'C:\\Windows')));
                $localApp = strtolower(str_replace('/', '\\', (getenv('LOCALAPPDATA') ?: '')));
                if (!str_starts_with($normalized, $windows . '\\system32\\') &&
                    ($localApp === '' || !str_starts_with($normalized, $localApp . '\\microsoft\\windowsapps\\'))) {
                    return $pathBash;
                }
            }
            return null;
        }

        foreach (['bash', '/bin/bash', '/usr/bin/bash'] as $candidate) {
            $found = str_contains($candidate, '/')
                ? (is_file($candidate) && is_executable($candidate) ? $candidate : null)
                : self::findOnPath($candidate);
            if ($found !== null) return $found;
        }
        return null;
    }

    private static function envExecutable(string $name): ?string
    {
        $value = getenv($name);
        if (!is_string($value) || trim($value) === '') return null;
        $value = trim($value, " \t\n\r\0\x0B\"");
        return is_file($value) && is_readable($value) ? $value : null;
    }

    private static function findOnPath(string $name): ?string
    {
        $path = getenv('PATH') ?: '';
        $extensions = [''];
        if (PHP_OS_FAMILY === 'Windows' && pathinfo($name, PATHINFO_EXTENSION) === '') {
            $extensions = array_filter(array_map('trim', explode(';', getenv('PATHEXT') ?: '.EXE;.CMD;.BAT;.COM')));
        }

        foreach (explode(PATH_SEPARATOR, $path) as $entry) {
            $entry = trim($entry, " \t\n\r\0\x0B\"");
            if ($entry === '') continue;
            foreach ($extensions as $extension) {
                $candidate = rtrim($entry, "\\/") . DIRECTORY_SEPARATOR . $name . $extension;
                if (is_file($candidate) && is_readable($candidate)) return $candidate;
            }
        }
        return null;
    }
}
