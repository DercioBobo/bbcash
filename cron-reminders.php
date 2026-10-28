<?php
/**
 * BB Cash — daily payment reminders.
 *
 * Run it every hour from cPanel → Cron Jobs:
 *     0 * * * *  php /home/USER/public_html/bbcash/cron-reminders.php
 *
 * Once a day, at the hour chosen in the app (Settings → Reminders), it sends one notification to
 * every device that turned reminders on, listing the unpaid expenses planned for today
 * (and tomorrow, if "Also the day before" is on), plus notes set to remind today.
 * Nothing planned → nothing sent.
 *
 * Test it by hand:  php cron-reminders.php --now   (sends right away, ignores the hour)
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit;
}

define('BBCASH_LIB', true);
require __DIR__ . '/api.php';

$force = in_array('--now', $argv ?? [], true);

$data = readJson(DATA_FILE)['data'] ?? null;
$push = withLock('pushStore');
if (!$data || !$push['subs']) {
    exit("Nothing to do: no data or no devices with reminders on.\n");
}

$settings = $data['settings'] ?? [];
date_default_timezone_set($push['tz'] ?? 'Africa/Maputo');
$today = date('Y-m-d');
$hour = (int)($settings['remindHour'] ?? 8);

if (!$force && ((int)date('G') < $hour || ($push['lastSent'] ?? '') === $today)) {
    exit("Not time yet (reminders at {$hour}:00, last sent " . ($push['lastSent'] ?? 'never') . ").\n");
}

$tomorrow = date('Y-m-d', strtotime('+1 day'));
$pending = pendingExpenses($data, substr($today, 0, 7));
if (substr($tomorrow, 0, 7) !== substr($today, 0, 7)) {
    $pending = array_merge($pending, pendingExpenses($data, substr($tomorrow, 0, 7)));
}

$due = array_values(array_filter($pending, function ($p) use ($today) { return $p['date'] === $today; }));
$next = !empty($settings['remindDayBefore'])
    ? array_values(array_filter($pending, function ($p) use ($tomorrow) { return $p['date'] === $tomorrow; }))
    : [];
$earlier = array_values(array_filter($pending, function ($p) use ($today) { return $p['date'] < $today; }));
$notes = array_values(array_filter($data['notes'] ?? [], function ($n) use ($today) {
    return empty($n['done']) && ($n['remind'] ?? '') === $today;
}));

$message = reminderMessage($due, $next, $earlier, $notes, $settings);
$sent = $message ? pushToAll($message + ['url' => './', 'tag' => 'bbcash-' . $today]) : 0;

withLock(function () use ($today) {
    $store = pushStore();
    $store['lastSent'] = $today;
    writeJson(PUSH_FILE, $store);
});

echo $message ? "Sent to {$sent} device(s): {$message['title']}\n" : "Nothing planned for today.\n";

/* ---------------------------------------------------------------------- */

/** Same rules as pendingFor() in js/app.js, expenses only: unpaid one-offs + fixed payments not yet paid. */
function pendingExpenses(array $data, string $ym): array
{
    $cats = [];
    foreach ($data['categories'] ?? [] as $c) {
        $cats[$c['id']] = $c['name'];
    }
    $linked = [];
    foreach ($data['transactions'] ?? [] as $t) {
        if (!empty($t['recurringId']) && substr($t['date'], 0, 7) === $ym) {
            $linked[$t['recurringId']] = true;
        }
    }
    $days = (int)date('t', strtotime($ym . '-01'));
    $items = [];
    foreach ($data['recurring'] ?? [] as $r) {
        $active = ($r['type'] ?? '') === 'expense' && $r['start'] <= $ym && (empty($r['end']) || $r['end'] >= $ym)
            && !in_array($ym, $r['skips'] ?? [], true) && empty($linked[$r['id']]);
        if (!$active) {
            continue;
        }
        $day = min((int)($r['days'][$ym] ?? $r['day']), $days);
        $items[] = ['name' => $r['name'], 'amount' => (float)($r['overrides'][$ym] ?? $r['amount']), 'date' => sprintf('%s-%02d', $ym, $day)];
    }
    foreach ($data['transactions'] ?? [] as $t) {
        if (empty($t['paid']) && ($t['type'] ?? '') === 'expense' && substr($t['date'], 0, 7) === $ym) {
            $name = trim((string)($t['note'] ?? '')) ?: ($cats[$t['category'] ?? ''] ?? 'Expense');
            $items[] = ['name' => $name, 'amount' => (float)$t['amount'], 'date' => $t['date']];
        }
    }
    usort($items, function ($a, $b) { return $b['amount'] <=> $a['amount']; });
    return $items;
}

/** What a note still holds: starting amount + every movement (negative = given back). */
function noteLeft(array $n): float
{
    return (float)($n['amount'] ?? 0) + array_sum(array_column($n['log'] ?? [], 'amount'));
}

function reminderMessage(array $due, array $next, array $earlier, array $notes, array $settings): ?array
{
    if (!$due && !$next && !$notes) {
        return null;
    }
    $money = function (float $n) use ($settings): string {
        return number_format($n, (int)($settings['decimals'] ?? 2)) . ' ' . ($settings['currency'] ?? 'MT');
    };
    $list = function (array $items, int $max) use ($money): array {
        $lines = array_map(function ($p) use ($money) { return $p['name'] . ' · ' . $money($p['amount']); }, array_slice($items, 0, $max));
        if (count($items) > $max) {
            $lines[] = '+' . (count($items) - $max) . ' more';
        }
        return $lines;
    };
    $total = function (array $items): float { return array_sum(array_column($items, 'amount')); };

    if ($due) {
        $title = count($due) === 1
            ? 'To pay today: ' . $due[0]['name']
            : count($due) . ' payments planned today · ' . $money($total($due));
        $lines = count($due) === 1 ? [$money($due[0]['amount'])] : $list($due, 4);
    } elseif ($next) {
        $title = 'Tomorrow: ' . (count($next) === 1 ? $next[0]['name'] : count($next) . ' payments planned');
        $lines = count($next) === 1 ? [$money($next[0]['amount'])] : $list($next, 4);
    } else {
        $title = count($notes) === 1 ? 'Note: ' . $notes[0]['title'] : count($notes) . ' notes to remember today';
        $lines = array_map(function ($n) use ($money, $notes) {
            $held = !empty($n['amount']) || !empty($n['log']) ? $money(noteLeft($n)) . ' left' : '';
            $text = trim(explode("\n", (string)($n['text'] ?? ''))[0]);
            if (count($notes) === 1) {
                return implode(' · ', array_filter([$text, $held]));
            }
            return $n['title'] . ($held ? ' · ' . $held : '');
        }, array_slice($notes, 0, 4));
        $lines = array_values(array_filter($lines));
        $notes = [];
    }
    if ($due && $next) {
        $lines[] = 'Tomorrow: ' . implode(', ', array_column(array_slice($next, 0, 3), 'name')) . (count($next) > 3 ? '…' : '');
    }
    if ($earlier) {
        $lines[] = count($earlier) . ' earlier this month still unpaid';
    }
    if ($notes) {
        $lines[] = 'Notes: ' . implode(', ', array_column(array_slice($notes, 0, 3), 'title')) . (count($notes) > 3 ? '…' : '');
    }
    return ['title' => $title, 'body' => implode("\n", $lines)];
}
