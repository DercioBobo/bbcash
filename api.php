<?php
/**
 * BB Cash — tiny JSON storage API (no database).
 *
 * Actions (all responses are JSON):
 *   GET  ?action=status    -> { setup: bool, authed: bool }
 *   POST ?action=setup     { password }            first run only
 *   POST ?action=login     { password }
 *   POST ?action=logout
 *   GET  ?action=load      -> { rev, data }
 *   POST ?action=save      { rev, data }           409 if rev is stale
 *   POST ?action=password  { current, next }
 *
 * Works on PHP 7.4+ (typical cPanel hosting).
 */

declare(strict_types=1);

// Where your data lives. For extra safety on cPanel you can move it outside
// public_html, e.g.  dirname(__DIR__, 2) . '/bbcash-data'
define('DATA_DIR', __DIR__ . '/data');

const DATA_FILE = DATA_DIR . '/cashflow.json';
const CONFIG_FILE = DATA_DIR . '/config.json';
const BACKUP_DIR = DATA_DIR . '/backups';
const BACKUPS_KEPT = 60;          // at most one backup per hour
const TOKEN_TTL = 60 * 60 * 24 * 60; // stay logged in for 60 days
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_SECONDS = 300;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const COOKIE = 'bbcash_token';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

ensureDataDir();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
    // Custom header can't be sent cross-site without CORS, which we never allow.
    if (($_SERVER['HTTP_X_BBCASH'] ?? '') !== '1') {
        respond(403, ['error' => 'Forbidden']);
    }
}

try {
    switch ($action) {
        case 'status':
            $cfg = readJson(CONFIG_FILE);
            respond(200, ['setup' => $cfg !== null, 'authed' => $cfg !== null && isAuthed($cfg)]);

        case 'setup':
            requirePost($method);
            $body = body();
            $password = (string)($body['password'] ?? '');
            if (strlen($password) < 6) {
                respond(422, ['error' => 'Password must be at least 6 characters.']);
            }
            withLock(function () use ($password) {
                if (readJson(CONFIG_FILE) !== null) {
                    respond(403, ['error' => 'Already set up.']);
                }
                $cfg = ['passwordHash' => password_hash($password, PASSWORD_DEFAULT), 'tokens' => [], 'failed' => 0, 'lockedUntil' => 0];
                issueToken($cfg);
                writeJson(CONFIG_FILE, $cfg);
            });
            respond(200, ['ok' => true]);

        case 'login':
            requirePost($method);
            $password = (string)(body()['password'] ?? '');
            $result = withLock(function () use ($password) {
                $cfg = readJson(CONFIG_FILE);
                if ($cfg === null) {
                    return [409, ['error' => 'Not set up yet.']];
                }
                if (($cfg['lockedUntil'] ?? 0) > time()) {
                    $wait = (int)ceil(($cfg['lockedUntil'] - time()) / 60);
                    return [429, ['error' => "Too many attempts. Try again in {$wait} min."]];
                }
                if (!password_verify($password, $cfg['passwordHash'])) {
                    $cfg['failed'] = ($cfg['failed'] ?? 0) + 1;
                    if ($cfg['failed'] >= MAX_FAILED_LOGINS) {
                        $cfg['failed'] = 0;
                        $cfg['lockedUntil'] = time() + LOCKOUT_SECONDS;
                    }
                    writeJson(CONFIG_FILE, $cfg);
                    usleep(400000);
                    return [401, ['error' => 'Wrong password.']];
                }
                $cfg['failed'] = 0;
                $cfg['lockedUntil'] = 0;
                if (password_needs_rehash($cfg['passwordHash'], PASSWORD_DEFAULT)) {
                    $cfg['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                }
                issueToken($cfg);
                writeJson(CONFIG_FILE, $cfg);
                return [200, ['ok' => true]];
            });
            respond($result[0], $result[1]);

        case 'logout':
            requirePost($method);
            withLock(function () {
                $cfg = readJson(CONFIG_FILE);
                $token = $_COOKIE[COOKIE] ?? '';
                if ($cfg !== null && $token !== '') {
                    $hash = hash('sha256', $token);
                    $cfg['tokens'] = array_values(array_filter($cfg['tokens'] ?? [], function ($t) use ($hash) {
                        return !hash_equals($t['h'], $hash);
                    }));
                    writeJson(CONFIG_FILE, $cfg);
                }
            });
            setTokenCookie('', time() - 3600);
            respond(200, ['ok' => true]);

        case 'load':
            requireAuth();
            $store = readJson(DATA_FILE);
            respond(200, ['rev' => (int)($store['rev'] ?? 0), 'data' => $store['data'] ?? null]);

        case 'save':
            requirePost($method);
            requireAuth();
            $body = body();
            if (!isset($body['data']) || !is_array($body['data']) || !isset($body['rev'])) {
                respond(422, ['error' => 'Invalid payload.']);
            }
            $result = withLock(function () use ($body) {
                $store = readJson(DATA_FILE) ?? ['rev' => 0, 'data' => null];
                $current = (int)($store['rev'] ?? 0);
                if ((int)$body['rev'] !== $current) {
                    return [409, ['error' => 'Changed on another device.', 'rev' => $current, 'data' => $store['data']]];
                }
                backupIfDue();
                $next = ['rev' => $current + 1, 'savedAt' => date('c'), 'data' => $body['data']];
                writeJson(DATA_FILE, $next);
                return [200, ['rev' => $next['rev']]];
            });
            respond($result[0], $result[1]);

        case 'password':
            requirePost($method);
            requireAuth();
            $body = body();
            $current = (string)($body['current'] ?? '');
            $next = (string)($body['next'] ?? '');
            if (strlen($next) < 6) {
                respond(422, ['error' => 'New password must be at least 6 characters.']);
            }
            $result = withLock(function () use ($current, $next) {
                $cfg = readJson(CONFIG_FILE);
                if (!password_verify($current, $cfg['passwordHash'])) {
                    return [401, ['error' => 'Current password is wrong.']];
                }
                $cfg['passwordHash'] = password_hash($next, PASSWORD_DEFAULT);
                $cfg['tokens'] = []; // log out every other device
                issueToken($cfg);
                writeJson(CONFIG_FILE, $cfg);
                return [200, ['ok' => true]];
            });
            respond($result[0], $result[1]);

        default:
            respond(404, ['error' => 'Unknown action.']);
    }
} catch (Throwable $e) {
    error_log('[bbcash] ' . $e->getMessage());
    respond(500, ['error' => 'Server error.']);
}

/* ---------------------------------------------------------------------- */

function respond(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requirePost(string $method): void
{
    if ($method !== 'POST') {
        respond(405, ['error' => 'Use POST.']);
    }
}

function requireAuth(): void
{
    $cfg = readJson(CONFIG_FILE);
    if ($cfg === null || !isAuthed($cfg)) {
        respond(401, ['error' => 'Please log in.']);
    }
}

function body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        respond(413, ['error' => 'Payload too large.']);
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function isAuthed(array $cfg): bool
{
    $token = $_COOKIE[COOKIE] ?? '';
    if ($token === '' || empty($cfg['tokens'])) {
        return false;
    }
    $hash = hash('sha256', $token);
    foreach ($cfg['tokens'] as $t) {
        if ($t['exp'] > time() && hash_equals($t['h'], $hash)) {
            return true;
        }
    }
    return false;
}

function issueToken(array &$cfg): void
{
    $token = bin2hex(random_bytes(32));
    $now = time();
    $cfg['tokens'] = array_values(array_filter($cfg['tokens'] ?? [], function ($t) use ($now) {
        return $t['exp'] > $now;
    }));
    $cfg['tokens'][] = ['h' => hash('sha256', $token), 'exp' => $now + TOKEN_TTL];
    $cfg['tokens'] = array_slice($cfg['tokens'], -10); // max 10 devices
    setTokenCookie($token, $now + TOKEN_TTL);
}

function setTokenCookie(string $value, int $expires): void
{
    $path = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    setcookie(COOKIE, $value, [
        'expires' => $expires,
        'path' => rtrim($path, '/') . '/',
        'secure' => isHttps(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function isHttps(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function ensureDataDir(): void
{
    foreach ([DATA_DIR, BACKUP_DIR] as $dir) {
        if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
            respond(500, ['error' => 'Cannot create data folder. Check permissions.']);
        }
    }
    $htaccess = DATA_DIR . '/.htaccess';
    if (!file_exists($htaccess)) {
        file_put_contents($htaccess, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
    }
}

function readJson(string $path): ?array
{
    if (!is_file($path)) {
        return null;
    }
    $data = json_decode((string)file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

/** Atomic write: temp file + rename, so a crash never leaves half a file. */
function writeJson(string $path, array $data): void
{
    $tmp = $path . '.tmp';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false || file_put_contents($tmp, $json) === false || !rename($tmp, $path)) {
        throw new RuntimeException('Could not write ' . basename($path));
    }
    @chmod($path, 0600);
}

function withLock(callable $fn)
{
    $fp = fopen(DATA_DIR . '/.lock', 'c');
    if ($fp === false) {
        throw new RuntimeException('Could not open lock file');
    }
    flock($fp, LOCK_EX);
    try {
        return $fn();
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function backupIfDue(): void
{
    if (!is_file(DATA_FILE)) {
        return;
    }
    $files = glob(BACKUP_DIR . '/cashflow-*.json') ?: [];
    sort($files);
    $latest = end($files);
    if ($latest && filemtime($latest) > time() - 3600) {
        return;
    }
    copy(DATA_FILE, BACKUP_DIR . '/cashflow-' . date('Ymd-His') . '.json');
    $files[] = 'new';
    foreach (array_slice($files, 0, max(0, count($files) - BACKUPS_KEPT)) as $old) {
        @unlink($old);
    }
}
