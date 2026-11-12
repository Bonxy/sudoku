<?php
require __DIR__ . '/lib.php';

$error = '';
if (isset($_GET['logout'])) {
    clear_login_cookie();
    header('Location: ' . $BASE_URL . '/');
    exit;
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if (password_verify($_POST['password'], $PASSWORD_HASH)) {
        set_login_cookie();
        header('Location: ' . $BASE_URL . '/');
        exit;
    }
    sleep(2);
    $error = 'Wrong password';
}
$logged = is_logged_in();
$v = fn($f) => $BASE_URL . '/' . $f . '?v=' . filemtime(__DIR__ . '/' . $f);
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#1e2a3a">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Daily Sudoku</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧩</text></svg>">
<link rel="stylesheet" href="https://www.w3schools.com/w3css/5/w3.css">
<link rel="stylesheet" href="<?= htmlspecialchars($v('style.css')) ?>">
<script>
  (function () { try { var t = localStorage.getItem('sudoku-theme'); if (t && t !== 'auto') document.documentElement.setAttribute('data-theme', t); } catch (e) {} })();
</script>
</head>
<body>
<?php if (!$logged): ?>
  <div class="login w3-card w3-round-large">
    <h2>🧩 Daily Sudoku</h2>
    <form method="post">
      <input class="w3-input w3-border w3-round" type="password" name="password" placeholder="Password" autofocus autocomplete="current-password">
      <?php if ($error): ?><p class="bad"><?= htmlspecialchars($error) ?></p><?php endif; ?>
      <button class="w3-button btn-primary w3-round w3-block" style="margin-top:12px">Log in</button>
    </form>
  </div>
<?php else: ?>
  <div class="app">
    <header class="top">
      <div class="title">
        <div class="h">🧩 Daily Sudoku</div>
        <div class="sub" id="sub">Loading…</div>
      </div>
      <div class="icons">
        <button class="icon" id="btnHistory" title="History">📊</button>
        <button class="icon" id="btnTheme" title="Theme">🌓</button>
      </div>
    </header>

    <div class="bar">
      <span class="badge" id="diff">–</span>
      <span class="timer" id="timer">0:00</span>
      <button class="icon" id="btnPause" title="Pause">⏸</button>
    </div>

    <div class="board-wrap">
      <div class="board" id="board"></div>
      <div class="paused" id="paused" hidden><div>⏸ Paused<br><small>tap to resume</small></div></div>
    </div>

    <div class="tools">
      <button class="tool" id="btnUndo"><span>↶</span>Undo</button>
      <button class="tool" id="btnErase"><span>⌫</span>Erase</button>
      <button class="tool" id="btnNotes"><span>✏️</span>Notes <b id="notesState">off</b></button>
      <button class="tool" id="btnCheck"><span>✔︎</span>Check</button>
      <label class="tool switch" title="Helper">
        <input type="checkbox" id="helper"><span class="slider"></span>Helper
      </label>
    </div>

    <div class="pad" id="pad"></div>

    <div class="done" id="done" hidden>
      <p>✅ Solved in <b id="doneTime"></b></p>
      <button class="w3-button btn-primary w3-round" id="btnSummary">Summary</button>
      <button class="w3-button btn-ghost w3-round" id="btnBonus">🎲 Bonus puzzle</button>
    </div>

    <footer class="foot"><a href="<?= htmlspecialchars($BASE_URL) ?>/?logout=1">Log out</a></footer>
  </div>

  <!-- finish modal -->
  <div class="modal" id="finishModal" hidden>
    <div class="sheet">
      <button class="close" data-close>×</button>
      <div id="finishBody"></div>
      <div class="chart-box"><canvas id="finishChart"></canvas></div>
      <div id="finishTable"></div>
    </div>
  </div>

  <!-- history modal -->
  <div class="modal" id="historyModal" hidden>
    <div class="sheet wide">
      <button class="close" data-close>×</button>
      <h3>📊 History</h3>
      <div class="tiles" id="tiles"></div>
      <h4>Solve times</h4>
      <div class="chart-box"><canvas id="timesChart"></canvas></div>
      <h4>Hints &amp; checks per solve</h4>
      <div class="chart-box small"><canvas id="assistChart"></canvas></div>
      <h4>Puzzles</h4>
      <div class="scroll" id="puzzleTable"></div>
      <h4>Recent plays</h4>
      <div class="scroll" id="recentTable"></div>
      <p><a class="w3-button btn-ghost w3-round" href="<?= htmlspecialchars($BASE_URL) ?>/api.php?action=export">⬇ Export CSV</a></p>
    </div>
  </div>

  <div class="toast" id="toast" hidden></div>

  <script>window.SUDOKU_API = <?= json_encode($BASE_URL . '/api.php') ?>;</script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script src="<?= htmlspecialchars($v('solver.js')) ?>"></script>
  <script src="<?= htmlspecialchars($v('app.js')) ?>"></script>
<?php endif; ?>
</body>
</html>
