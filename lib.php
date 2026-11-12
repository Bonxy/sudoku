<?php
if (!is_file(__DIR__ . '/config.php')) {
    http_response_code(500);
    exit('Copy config.sample.php to config.php and fill it in.');
}
require __DIR__ . '/config.php';
date_default_timezone_set($TIMEZONE);

const AUTH_COOKIE = 'sudoku_auth';

// ---------- auth ----------
function base_path(): string {
    global $BASE_URL;
    $p = parse_url($BASE_URL, PHP_URL_PATH);
    return $p ? rtrim($p, '/') . '/' : '/';
}
function auth_sign(string $exp): string {
    global $SECRET;
    return hash_hmac('sha256', 'sudoku|' . $exp, $SECRET);
}
function cookie_opts(int $exp): array {
    return ['expires' => $exp, 'path' => base_path(), 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => true, 'samesite' => 'Lax'];
}
function is_logged_in(): bool {
    $parts = explode('.', $_COOKIE[AUTH_COOKIE] ?? '');
    if (count($parts) !== 2 || !ctype_digit($parts[0]) || (int)$parts[0] < time()) return false;
    return hash_equals(auth_sign($parts[0]), $parts[1]);
}
function set_login_cookie(): void {
    $exp = time() + 365 * 86400;
    setcookie(AUTH_COOKIE, $exp . '.' . auth_sign((string)$exp), cookie_opts($exp));
}
function clear_login_cookie(): void {
    setcookie(AUTH_COOKIE, '', cookie_opts(time() - 3600));
}

// ---------- files ----------
function data_file(string $name): string { global $DATA_DIR; return $DATA_DIR . '/' . $name; }

function with_lock(callable $fn) {
    $fh = fopen(data_file('.lock'), 'c');
    flock($fh, LOCK_EX);
    try { return $fn(); }
    finally { flock($fh, LOCK_UN); fclose($fh); }
}
function read_json(string $name, $default) {
    $f = data_file($name);
    if (!is_file($f)) return $default;
    $d = json_decode(file_get_contents($f), true);
    return $d === null ? $default : $d;
}
function write_json(string $name, $data): void {
    $f = data_file($name);
    $tmp = $f . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    rename($tmp, $f);
}

// ---------- game ----------
function puzzles(): array {
    static $p = null;
    if ($p === null) {
        $p = [];
        foreach (read_json('puzzles.json', []) as $x) $p[$x['id']] = $x;
    }
    return $p;
}
function today(): string { return date('Y-m-d'); }
function now_ms(): int { return (int)round(microtime(true) * 1000); }

// random puzzle that isn't in your last $NO_REPEAT plays
function pick_puzzle(array $log, array $exclude = []): int {
    global $NO_REPEAT;
    $all = array_keys(puzzles());
    $recent = array_map(fn($e) => $e['puzzle_id'], array_slice($log, -$NO_REPEAT));
    $pool = array_values(array_diff($all, $recent, $exclude));
    if ($pool) return $pool[array_rand($pool)];
    // pool too small: least recently played
    $last = [];
    foreach ($log as $k => $e) $last[$e['puzzle_id']] = $k;
    $c = array_values(array_diff($all, $exclude)) ?: $all;
    usort($c, fn($a, $b) => ($last[$a] ?? -1) <=> ($last[$b] ?? -1));
    return $c[0];
}

function new_current(int $pid, bool $bonus): array {
    $p = puzzles()[$pid];
    return [
        'date' => today(), 'puzzle_id' => $pid, 'bonus' => $bonus,
        'board' => $p['givens'], 'notes' => array_fill(0, 81, 0), 'checked' => array_fill(0, 81, 0),
        'elapsed' => 0, 'checks' => 0, 'hints' => 0,
        'status' => 'playing', 'started' => now_ms(), 'updated' => now_ms(), 'rev' => 1,
    ];
}

function log_entry(array $cur, string $status): array {
    $p = puzzles()[$cur['puzzle_id']] ?? ['difficulty' => '?'];
    return [
        'date' => $cur['date'], 'puzzle_id' => $cur['puzzle_id'], 'difficulty' => $p['difficulty'],
        'status' => $status, 'time_ms' => (int)$cur['elapsed'],
        'checks' => (int)$cur['checks'], 'hints' => (int)$cur['hints'],
        'bonus' => (bool)$cur['bonus'], 'finished' => date('c'),
    ];
}

// today's game; rolls over (logging yesterday's unfinished puzzle as unsolved) when the date changes
function load_current(array &$log): array {
    $cur = read_json('current.json', null);
    if ($cur && ($cur['date'] !== today() || !isset(puzzles()[$cur['puzzle_id']]))) {
        if ($cur['status'] === 'playing' && isset(puzzles()[$cur['puzzle_id']])) {
            $log[] = log_entry($cur, 'unsolved');
            write_json('log.json', $log);
        }
        $cur = null;
    }
    if (!$cur) {
        $cur = new_current(pick_puzzle($log), false);
        write_json('current.json', $cur);
    }
    return $cur;
}

function payload(array $cur, array $log): array {
    $p = puzzles()[$cur['puzzle_id']];
    $attempts = array_values(array_filter($log, fn($e) => $e['puzzle_id'] == $cur['puzzle_id']));
    $same = array_filter($log, fn($e) => $e['status'] === 'solved' && $e['difficulty'] === $p['difficulty']);
    $avg = $same ? (int)round(array_sum(array_column($same, 'time_ms')) / count($same)) : null;
    return [
        'today' => today(),
        'current' => $cur,
        'puzzle' => ['id' => $p['id'], 'difficulty' => $p['difficulty'], 'givens' => $p['givens'], 'solution' => $p['solution']],
        'attempts' => $attempts,
        'avg_for_difficulty' => $avg,
    ];
}
