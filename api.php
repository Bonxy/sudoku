<?php
require __DIR__ . '/lib.php';
header('Cache-Control: no-store');

if (!is_logged_in()) {
    http_response_code(401);
    header('Content-Type: application/json');
    exit(json_encode(['error' => 'login']));
}

$action = $_GET['action'] ?? 'state';
$in = json_decode(file_get_contents('php://input'), true) ?: [];

function clean_ints($arr, int $max): array {
    $out = array_fill(0, 81, 0);
    if (is_array($arr)) for ($i = 0; $i < 81; $i++) {
        $v = (int)($arr[$i] ?? 0);
        $out[$i] = ($v >= 0 && $v <= $max) ? $v : 0;
    }
    return $out;
}
function same_game(array $in, array $cur): bool {
    return ($in['date'] ?? '') === $cur['date'] && (int)($in['puzzle_id'] ?? 0) === (int)$cur['puzzle_id'];
}

if ($action === 'export') {
    $log = read_json('log.json', []);
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="sudoku-history.csv"');
    $f = fopen('php://output', 'w');
    fputcsv($f, ['date', 'puzzle', 'difficulty', 'status', 'time', 'seconds', 'hints', 'checks', 'bonus', 'finished']);
    foreach ($log as $e) {
        $s = intdiv($e['time_ms'], 1000);
        fputcsv($f, [$e['date'], $e['puzzle_id'], $e['difficulty'], $e['status'],
            sprintf('%d:%02d:%02d', intdiv($s, 3600), intdiv($s % 3600, 60), $s % 60), $s,
            $e['hints'], $e['checks'], $e['bonus'] ? 'yes' : '', $e['finished']]);
    }
    exit;
}

header('Content-Type: application/json');

$result = with_lock(function () use ($action, $in) {
    $log = read_json('log.json', []);

    switch ($action) {
    case 'state':
        return payload(load_current($log), $log);

    case 'save':
        $cur = load_current($log);
        if (!same_game($in, $cur) || $cur['status'] !== 'playing' || (int)($in['rev'] ?? 0) < $cur['rev']) {
            return ['conflict' => true] + payload($cur, $log);
        }
        $givens = puzzles()[$cur['puzzle_id']]['givens'];
        $board = preg_match('/^[0-9]{81}$/', $in['board'] ?? '') ? $in['board'] : $cur['board'];
        for ($i = 0; $i < 81; $i++) if ($givens[$i] !== '0') $board[$i] = $givens[$i];
        $cur['board']   = $board;
        $cur['notes']   = clean_ints($in['notes'] ?? null, 1022);
        $cur['checked'] = clean_ints($in['checked'] ?? null, 2);
        $cur['elapsed'] = max(0, (int)($in['elapsed'] ?? $cur['elapsed']));
        $cur['checks']  = max($cur['checks'], (int)($in['checks'] ?? 0));
        $cur['hints']   = max($cur['hints'], (int)($in['hints'] ?? 0));
        $cur['rev']++;
        $cur['updated'] = now_ms();
        write_json('current.json', $cur);
        return ['ok' => true, 'rev' => $cur['rev']];

    case 'finish':
        $cur = load_current($log);
        if (!same_game($in, $cur) || $cur['status'] !== 'playing') return ['ok' => false, 'error' => 'That puzzle is no longer active'] + payload($cur, $log);
        $p = puzzles()[$cur['puzzle_id']];
        if (($in['board'] ?? '') !== $p['solution']) return ['ok' => false, 'error' => 'Not solved yet'];
        $cur['board']   = $p['solution'];
        $cur['notes']   = array_fill(0, 81, 0);
        $cur['checked'] = array_fill(0, 81, 0);
        $cur['elapsed'] = max(0, (int)($in['elapsed'] ?? $cur['elapsed']));
        $cur['checks']  = max($cur['checks'], (int)($in['checks'] ?? 0));
        $cur['hints']   = max($cur['hints'], (int)($in['hints'] ?? 0));
        $before = payload($cur, $log);          // averages/attempts before this solve
        $entry = log_entry($cur, 'solved');
        $log[] = $entry;
        write_json('log.json', $log);
        $cur['status'] = 'solved';
        $cur['rev']++;
        $cur['updated'] = now_ms();
        write_json('current.json', $cur);
        $before['current'] = $cur;
        return ['ok' => true, 'entry' => $entry] + $before;

    case 'bonus':
        $cur = load_current($log);
        if ($cur['status'] === 'solved') {
            $cur = new_current(pick_puzzle($log, [$cur['puzzle_id']]), true);
            write_json('current.json', $cur);
        }
        return payload($cur, $log);

    case 'history':
        $meta = [];
        foreach (puzzles() as $p) $meta[] = ['id' => $p['id'], 'difficulty' => $p['difficulty']];
        return ['log' => $log, 'puzzles' => $meta, 'today' => today()];

    default:
        http_response_code(400);
        return ['error' => 'unknown action'];
    }
});

echo json_encode($result);
