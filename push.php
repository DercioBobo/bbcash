<?php
/**
 * BB Cash — Web Push without Composer (RFC 8291 aes128gcm + RFC 8292 VAPID).
 * Needs PHP 7.4+ with the openssl and curl extensions (standard on cPanel).
 * Included by api.php and cron-reminders.php; does nothing on its own.
 */

declare(strict_types=1);

if (!defined('DATA_DIR')) {
    http_response_code(403);
    exit;
}

const PUSH_FILE = DATA_DIR . '/push.json';

/** Push settings: VAPID keys, subscribed devices, timezone, last reminder sent. */
function pushStore(): array
{
    $store = readJson(PUSH_FILE) ?? [];
    if (empty($store['vapid']['private']) || empty($store['vapid']['public'])) {
        $key = newEcKey();
        if (!openssl_pkey_export($key, $pem)) {
            throw new RuntimeException('Could not create push keys (openssl).');
        }
        $store['vapid'] = ['private' => $pem, 'public' => b64url(rawPublicKey($key))];
        $store['subs'] = $store['subs'] ?? [];
        writeJson(PUSH_FILE, $store);
    }
    $store['subs'] = $store['subs'] ?? [];
    return $store;
}

function newEcKey()
{
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if ($key === false) {
        throw new RuntimeException('Could not create a P-256 key (openssl): ' . openssl_error_string());
    }
    return $key;
}

function b64url(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64urlDecode(string $s): string
{
    return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

/** Uncompressed P-256 point: 0x04 || X || Y (65 bytes). */
function rawPublicKey($key): string
{
    $ec = openssl_pkey_get_details($key)['ec'];
    return "\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);
}

/** Wrap a raw P-256 public point in a PEM so openssl can use it. */
function publicKeyFromRaw(string $raw)
{
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    return openssl_pkey_get_public($pem);
}

function hkdf(string $salt, string $ikm, string $info, int $length): string
{
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    return substr(hash_hmac('sha256', $info . "\x01", $prk, true), 0, $length);
}

/** Encrypt a payload for one subscription (single aes128gcm record). */
function encryptPayload(string $payload, string $uaPublic, string $authSecret): string
{
    $uaKey = publicKeyFromRaw($uaPublic);
    if ($uaKey === false || strlen($uaPublic) !== 65) {
        throw new RuntimeException('Invalid subscription key.');
    }
    $asKey = newEcKey();
    $asPublic = rawPublicKey($asKey);
    $shared = openssl_pkey_derive($uaKey, $asKey, 32);
    if ($shared === false) {
        throw new RuntimeException('Key agreement failed.');
    }
    $salt = random_bytes(16);
    $ikm = hkdf($authSecret, $shared, "WebPush: info\0" . $uaPublic . $asPublic, 32);
    $cek = hkdf($salt, $ikm, "Content-Encoding: aes128gcm\0", 16);
    $nonce = hkdf($salt, $ikm, "Content-Encoding: nonce\0", 12);

    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($cipher === false) {
        throw new RuntimeException('Encryption failed.');
    }
    return $salt . pack('N', 4096) . chr(65) . $asPublic . $cipher . $tag;
}

/** VAPID Authorization header value for the push service behind $endpoint. */
function vapidHeader(string $endpoint, array $store): string
{
    $url = parse_url($endpoint);
    $claims = [
        'aud' => $url['scheme'] . '://' . $url['host'],
        'exp' => time() + 12 * 3600,
        'sub' => $store['subject'] ?? 'mailto:bbcash@example.com',
    ];
    $data = b64url('{"typ":"JWT","alg":"ES256"}') . '.' . b64url(json_encode($claims, JSON_UNESCAPED_SLASHES));
    $key = openssl_pkey_get_private($store['vapid']['private']);
    if (!openssl_sign($data, $der, $key, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Could not sign VAPID token.');
    }
    return 'vapid t=' . $data . '.' . b64url(derToJose($der)) . ', k=' . $store['vapid']['public'];
}

/** openssl gives a DER ECDSA signature; JWT wants raw r || s (64 bytes). */
function derToJose(string $der): string
{
    $offset = 2 + (ord($der[1]) & 0x80 ? ord($der[1]) & 0x7f : 0);
    $parts = '';
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$offset + 1]);
        $int = ltrim(substr($der, $offset + 2, $len), "\0");
        $parts .= str_pad($int, 32, "\0", STR_PAD_LEFT);
        $offset += 2 + $len;
    }
    return $parts;
}

/**
 * Send one notification to one subscription.
 * Returns the HTTP status (201 = delivered; 404/410 = the device unsubscribed).
 */
function sendPush(array $sub, array $message, array $store): int
{
    $body = encryptPayload(
        json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        b64urlDecode($sub['keys']['p256dh'] ?? ''),
        b64urlDecode($sub['keys']['auth'] ?? '')
    );
    $ch = curl_init($sub['endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . vapidHeader($sub['endpoint'], $store),
            'Content-Encoding: aes128gcm',
            'Content-Type: application/octet-stream',
            'TTL: 86400',
            'Urgency: high',
        ],
    ]);
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($status >= 400) {
        error_log('[bbcash] push ' . $status . ': ' . substr((string)$response, 0, 200));
    }
    curl_close($ch);
    return $status;
}

/** Send to every subscribed device; drops devices that unsubscribed. Returns how many got it. */
function pushToAll(array $message): int
{
    return withLock(function () use ($message) {
        $store = pushStore();
        $sent = 0;
        $keep = [];
        foreach ($store['subs'] as $sub) {
            $status = sendPush($sub, $message, $store);
            if ($status >= 200 && $status < 300) {
                $sent++;
            }
            if ($status !== 404 && $status !== 410) {
                $keep[] = $sub;
            }
        }
        if (count($keep) !== count($store['subs'])) {
            $store['subs'] = $keep;
            writeJson(PUSH_FILE, $store);
        }
        return $sent;
    });
}
