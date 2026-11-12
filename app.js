/* Daily Sudoku – front end */
(function () {
  'use strict';
  var API = window.SUDOKU_API || 'api.php';
  var $ = function (s) { return document.querySelector(s); };

  // ---------- state ----------
  var P = null;              // puzzle {id, difficulty, givens[], solution[]}
  var S = null;              // current game from server
  var attempts = [], avgDiff = null;
  var board = [], notes = [], checked = [];
  var selected = -1, notesMode = false, helperOn = false, hintCell = -1;
  var undoStack = [];
  var elapsedBase = 0, runningSince = null, manualPause = false;
  var rev = 0, dirty = false, saveTimer = null, finishing = false, lastFinish = null;
  var cells = [], padBtns = [];
  var charts = {};


  // ---------- helpers ----------
  function fmt(ms) {
    if (ms == null) return '–';
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  }
  function fmtDiff(ms) { return (ms < 0 ? '−' : '+') + fmt(Math.abs(ms)); }
  function niceDate(d) {
    var dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function shortDate(d) {
    var dt = new Date(d + 'T12:00:00');
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function api(action, body) {
    var opt = { credentials: 'same-origin', cache: 'no-store' };
    if (body) { opt.method = 'POST'; opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return fetch(API + '?action=' + action, opt).then(function (r) {
      if (r.status === 401) { location.reload(); throw new Error('login'); }
      return r.json();
    });
  }
  function playing() { return S && S.status === 'playing'; }

  // ---------- timer ----------
  function elapsed() { return elapsedBase + (runningSince ? Date.now() - runningSince : 0); }
  function startTimer() { if (!runningSince && playing() && !manualPause && !document.hidden) runningSince = Date.now(); }
  function stopTimer() { if (runningSince) { elapsedBase += Date.now() - runningSince; runningSince = null; } }
  setInterval(function () { if (S) $('#timer').textContent = fmt(elapsed()); }, 250);

  function setPaused(p) {
    if (!playing()) p = false;
    manualPause = p;
    if (p) { stopTimer(); markDirty(); } else startTimer();
    $('#paused').hidden = !p;
    $('#btnPause').textContent = p ? '▶️' : '⏸';
  }

  // ---------- load / save ----------
  function loadPayload(d) {
    var sameGame = S && S.date === d.current.date && S.puzzle_id === d.current.puzzle_id;
    S = d.current;
    P = { id: d.puzzle.id, difficulty: d.puzzle.difficulty,
          givens: d.puzzle.givens.split('').map(Number), solution: d.puzzle.solution.split('').map(Number) };
    attempts = d.attempts || [];
    avgDiff = d.avg_for_difficulty;
    board = S.board.split('').map(Number);
    notes = S.notes.slice();
    checked = S.checked.slice();
    rev = S.rev;
    runningSince = null;
    elapsedBase = S.elapsed;
    if (!sameGame) { undoStack = []; selected = -1; helperOn = false; notesMode = false; }
    dirty = false;
    $('#sub').textContent = niceDate(S.date) + ' · Puzzle #' + P.id + (S.bonus ? ' · Bonus' : '');
    var badge = $('#diff'); badge.textContent = P.difficulty; badge.className = 'badge ' + P.difficulty;
    $('#done').hidden = playing();
    if (!playing()) { $('#doneTime').textContent = fmt(S.elapsed); manualPause = false; $('#paused').hidden = true; }
    updateHint();
    render();
    startTimer();
  }

  function refresh() {
    return api('state').then(loadPayload).catch(function (e) { if (e.message !== 'login') toast('Couldn’t reach the server'); });
  }

  function stateBody() {
    return { date: S.date, puzzle_id: S.puzzle_id, rev: rev, board: board.join(''), notes: notes, checked: checked,
             elapsed: Math.round(elapsed()), checks: S.checks, hints: S.hints };
  }
  function markDirty() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 2000); }
  function save() {
    clearTimeout(saveTimer);
    if (!dirty || !playing() || finishing) return;
    dirty = false;
    api('save', stateBody()).then(function (d) {
      if (d.conflict) { loadPayload(d); toast('Synced from another device'); }
      else if (d.ok) rev = d.rev;
    }).catch(function () { dirty = true; });
  }
  setInterval(function () { if (runningSince) { dirty = true; save(); } }, 30000);

  function beaconSave() {
    if (!playing() || finishing) return;
    clearTimeout(saveTimer);
    try {
      navigator.sendBeacon(API + '?action=save', new Blob([JSON.stringify(stateBody())], { type: 'application/json' }));
      dirty = false;
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stopTimer(); beaconSave(); }
    else setTimeout(refresh, 300);   // let the beacon land first
  });
  window.addEventListener('pagehide', function () { stopTimer(); beaconSave(); });

  // ---------- board ----------
  function buildBoard() {
    var el = $('#board');
    for (var i = 0; i < 81; i++) {
      var c = document.createElement('div');
      var r = Math.floor(i / 9), col = i % 9;
      c.className = 'cell';
      c.dataset.i = i;
      cells.push(c); el.appendChild(c);
    }
    el.addEventListener('pointerdown', function (e) {
      var t = e.target.closest('.cell'); if (!t) return;
      selected = +t.dataset.i; autoNotes(); render();
    });
    var pad = $('#pad');
    for (var d = 1; d <= 9; d++) {
      var b = document.createElement('button');
      b.className = 'num'; b.dataset.d = d;
      b.innerHTML = '<b>' + d + '</b><small></small>';
      b.addEventListener('click', function () { inputDigit(+this.dataset.d); });
      padBtns.push(b); pad.appendChild(b);
    }
  }

  function render() {
    if (!P) return;
    var sv = selected >= 0 ? board[selected] : 0;
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 81; i++) {
      var c = cells[i], r = Math.floor(i / 9), col = i % 9, v = board[i];
      if (v) counts[v]++;
      var cls = 'cell';
      if (col === 2 || col === 5) cls += ' br';
      if (r === 2 || r === 5) cls += ' bb';
      if (col === 8) cls += ' c8';
      if (r === 8) cls += ' r8';
      if (P.givens[i]) cls += ' given';
      if (selected >= 0 && i !== selected && (Solver.ROW[i] === Solver.ROW[selected] || Solver.COL[i] === Solver.COL[selected] || Solver.BOX[i] === Solver.BOX[selected])) cls += ' peer';
      if (sv && v === sv && i !== selected) cls += ' same';
      if (i === selected) cls += ' sel';
      if (!P.givens[i] && checked[i] === 1) cls += ' ok';
      if (!P.givens[i] && checked[i] === 2) cls += ' wrong';
      if (helperOn && playing() && i === hintCell) cls += ' hint';
      c.className = cls;
      if (v) c.textContent = v;
      else if (notes[i]) {
        var h = '<div class="notes">';
        for (var d = 1; d <= 9; d++) h += '<span' + (d === sv && (notes[i] & (1 << d)) ? ' class="hl"' : '') + '>' + ((notes[i] & (1 << d)) ? d : '') + '</span>';
        c.innerHTML = h + '</div>';
      } else c.textContent = '';
    }
    padBtns.forEach(function (b, k) {
      var left = 9 - counts[k + 1];
      b.classList.toggle('used', left <= 0);
      b.querySelector('small').textContent = left > 0 ? left : '';
    });
    $('#pad').classList.toggle('notes-mode', notesMode);
    $('#btnNotes').classList.toggle('on', notesMode);
    $('#notesState').textContent = notesMode ? 'on' : 'off';
    $('#helper').checked = helperOn;
  }

  // ---------- input ----------
  function editable() { return playing() && !manualPause && selected >= 0 && !P.givens[selected]; }
  function pushUndo() {
    undoStack.push({ board: board.slice(), notes: notes.slice(), checked: checked.slice() });
    if (undoStack.length > 300) undoStack.shift();
  }
  function inputDigit(d, asNote) {
    if (!editable()) return;
    var i = selected, note = asNote || notesMode;
    if (note) {
      if (board[i]) return;
      pushUndo(); notes[i] ^= (1 << d);
    } else {
      pushUndo();
      if (board[i] === d) board[i] = 0;
      else {
        board[i] = d; notes[i] = 0;
        Solver.PEERS[i].forEach(function (p) { notes[p] &= ~(1 << d); });
      }
      checked[i] = 0;
    }
    afterChange();
  }
  function erase() {
    if (!editable() || (!board[selected] && !notes[selected])) return;
    pushUndo(); board[selected] = 0; notes[selected] = 0; checked[selected] = 0;
    afterChange();
  }
  function undo() {
    if (!playing() || manualPause) return;
    var u = undoStack.pop(); if (!u) return;
    board = u.board; notes = u.notes; checked = u.checked;
    afterChange();
  }
  function checkCell() {
    if (!editable()) return;
    if (!board[selected]) { toast('Pick a cell with a number in it'); return; }
    checked[selected] = board[selected] === P.solution[selected] ? 1 : 2;
    S.checks++;
    render(); markDirty();
  }
  function toggleNotes() { notesMode = !notesMode; autoNotes(); render(); }
  // notes mode + empty cell with no notes yet: fill in every digit not already in its row/col/box
  function autoNotes() {
    if (!notesMode || !editable() || board[selected] || notes[selected]) return;
    var m = 0x3FE;
    Solver.PEERS[selected].forEach(function (p) { if (board[p]) m &= ~(1 << board[p]); });
    if (!m) return;
    pushUndo(); notes[selected] = m; markDirty();
  }
  function setHelper(on) {
    if (on && !helperOn && playing()) { S.hints++; markDirty(); }
    helperOn = on;
    updateHint(); render();
  }
  function updateHint() {
    hintCell = -1;
    if (!helperOn || !P || !playing()) return;
    var known = [], avoid = [];
    for (var i = 0; i < 81; i++) {
      var ok = P.givens[i] || (board[i] && board[i] === P.solution[i]);
      known[i] = ok ? board[i] : 0;
      avoid[i] = !!board[i] && !ok;     // wrong number there – don't give it away
    }
    var h = Solver.findHint(known, avoid);
    hintCell = h ? h.cell : -1;
  }
  function afterChange() {
    updateHint(); render(); markDirty();
    if (board.every(function (v) { return v; })) tryFinish();
  }

  // ---------- finishing ----------
  function tryFinish() {
    if (finishing) return;
    for (var i = 0; i < 81; i++) if (board[i] !== P.solution[i]) { toast('Not quite — something’s not right'); return; }
    finishing = true;
    stopTimer();
    var body = stateBody();
    api('finish', body).then(function (d) {
      finishing = false;
      if (!d.ok) { toast(d.error || 'Couldn’t save'); if (d.current) loadPayload(d); else startTimer(); return; }
      lastFinish = d;
      loadPayload(d);
      confetti();
      showFinish(d);
    }).catch(function () {
      finishing = false; startTimer(); toast('Couldn’t reach the server — try again');
      setTimeout(tryFinish, 5000);
    });
  }

  function showFinish(d) {
    var e = d.entry, prev = d.attempts.filter(function (a) { return a.status === 'solved'; });
    var h = '<div class="center">🎉 <b>Solved!</b> · Puzzle #' + d.puzzle.id + ' · ' + cap(d.puzzle.difficulty) + '</div>';
    h += '<div class="big-time">' + fmt(e.time_ms) + '</div>';
    h += '<div class="center"><span class="pill">💡 ' + e.hints + ' helper</span><span class="pill">✔︎ ' + e.checks + ' checks</span></div>';
    var lines = [];
    if (!prev.length) lines.push(d.attempts.length ? 'First time you’ve finished this one' : 'First time playing this puzzle');
    else {
      var best = Math.min.apply(null, prev.map(function (a) { return a.time_ms; }));
      if (e.time_ms < best) lines.push('🏆 <b>New best</b> on this puzzle — previous ' + fmt(best) + ' (' + fmtDiff(e.time_ms - best) + ')');
      else lines.push('Best on this puzzle: ' + fmt(best) + ' (' + fmtDiff(e.time_ms - best) + ')');
      var last = prev[prev.length - 1];
      lines.push('Last time (' + shortDate(last.date) + '): ' + fmt(last.time_ms) + ' · ' + last.hints + ' helper, ' + last.checks + ' checks');
    }
    if (d.avg_for_difficulty) {
      var diff = e.time_ms - d.avg_for_difficulty;
      lines.push('Your ' + d.puzzle.difficulty + ' average: ' + fmt(d.avg_for_difficulty) +
        ' — <span class="' + (diff <= 0 ? 'good' : 'bad') + '">' + fmt(Math.abs(diff)) + (diff <= 0 ? ' faster' : ' slower') + '</span>');
    }
    h += '<p class="center">' + lines.join('<br>') + '</p>';
    $('#finishBody').innerHTML = h;

    var all = d.attempts.concat([e]);
    var solved = all.filter(function (a) { return a.status === 'solved'; });
    $('#finishChart').parentNode.style.display = solved.length > 1 ? '' : 'none';
    if (solved.length > 1) {
      lineChart('finishChart', solved.map(function (a) { return shortDate(a.date); }),
        [{ label: 'Time (min)', data: solved.map(function (a) { return +(a.time_ms / 60000).toFixed(2); }), color: cssVar('--primary') }]);
    }
    var t = '<table class="t"><tr><th>Date</th><th>Time</th><th>Helper</th><th>Checks</th><th></th></tr>';
    all.slice().reverse().forEach(function (a) {
      t += '<tr' + (a === e ? ' class="me"' : '') + '><td>' + shortDate(a.date) + '</td><td>' + (a.status === 'solved' ? fmt(a.time_ms) : '–') +
        '</td><td>' + a.hints + '</td><td>' + a.checks + '</td><td>' + (a.status === 'solved' ? '' : '<span class="muted">unsolved</span>') + '</td></tr>';
    });
    $('#finishTable').innerHTML = all.length > 1 ? '<h4>All attempts</h4>' + t + '</table>' : '';
    $('#finishModal').hidden = false;
  }

  // ---------- history ----------
  function showHistory() {
    $('#historyModal').hidden = false;
    $('#tiles').innerHTML = '<p class="muted">Loading…</p>';
    api('history').then(function (d) {
      var log = d.log, solved = log.filter(function (e) { return e.status === 'solved'; });
      function stats(diff) {
        var s = solved.filter(function (e) { return e.difficulty === diff; });
        if (!s.length) return { avg: null, best: null, n: 0 };
        var t = s.map(function (e) { return e.time_ms; });
        return { avg: t.reduce(function (a, b) { return a + b; }, 0) / t.length, best: Math.min.apply(null, t), n: s.length };
      }
      // streak: consecutive days with a solve, ending today (or yesterday if today isn't done yet)
      var days = {}; solved.forEach(function (e) { days[e.date] = true; });
      var streak = 0, dt = new Date(d.today + 'T12:00:00');
      if (!days[d.today]) dt.setDate(dt.getDate() - 1);
      while (days[dt.toISOString().slice(0, 10)]) { streak++; dt.setDate(dt.getDate() - 1); }
      var m = stats('medium'), h = stats('hard');
      var assists = solved.length ? solved.reduce(function (a, e) { return a + e.hints + e.checks; }, 0) / solved.length : null;
      function tile(v, l) { return '<div class="tile"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
      $('#tiles').innerHTML =
        tile(solved.length, 'Solved') + tile(streak + (streak ? ' 🔥' : ''), 'Day streak') +
        tile(fmt(m.avg), 'Medium avg') + tile(fmt(m.best), 'Medium best') +
        tile(fmt(h.avg), 'Hard avg') + tile(fmt(h.best), 'Hard best') +
        tile(assists == null ? '–' : assists.toFixed(1), 'Helper+checks / solve') +
        tile(log.length - solved.length, 'Unsolved');

      var labels = solved.map(function (e) { return shortDate(e.date) + ' #' + e.puzzle_id; });
      lineChart('timesChart', labels, [
        { label: 'Medium', data: solved.map(function (e) { return e.difficulty === 'medium' ? +(e.time_ms / 60000).toFixed(2) : null; }), color: cssVar('--primary') },
        { label: 'Hard', data: solved.map(function (e) { return e.difficulty === 'hard' ? +(e.time_ms / 60000).toFixed(2) : null; }), color: cssVar('--bad') }
      ], 'min');
      lineChart('assistChart', labels, [
        { label: 'Helper', data: solved.map(function (e) { return e.hints; }), color: cssVar('--hint') },
        { label: 'Checks', data: solved.map(function (e) { return e.checks; }), color: cssVar('--good') }
      ]);

      // per-puzzle table
      var t = '<table class="t"><tr><th>#</th><th>Level</th><th>Plays</th><th>Best</th><th>Avg</th><th>Last played</th></tr>';
      d.puzzles.forEach(function (p) {
        var plays = log.filter(function (e) { return e.puzzle_id == p.id; });
        var s = plays.filter(function (e) { return e.status === 'solved'; }).map(function (e) { return e.time_ms; });
        t += '<tr><td>' + p.id + '</td><td>' + cap(p.difficulty) + '</td><td>' + plays.length + '</td><td>' +
          (s.length ? fmt(Math.min.apply(null, s)) : '–') + '</td><td>' +
          (s.length ? fmt(s.reduce(function (a, b) { return a + b; }, 0) / s.length) : '–') + '</td><td>' +
          (plays.length ? shortDate(plays[plays.length - 1].date) : '<span class="muted">never</span>') + '</td></tr>';
      });
      $('#puzzleTable').innerHTML = t + '</table>';

      var r = '<table class="t"><tr><th>Date</th><th>#</th><th>Level</th><th>Time</th><th>Helper</th><th>Checks</th></tr>';
      log.slice(-60).reverse().forEach(function (e) {
        r += '<tr><td>' + shortDate(e.date) + (e.bonus ? ' 🎲' : '') + '</td><td>' + e.puzzle_id + '</td><td>' + cap(e.difficulty) + '</td><td>' +
          (e.status === 'solved' ? fmt(e.time_ms) : '<span class="muted">unsolved</span>') + '</td><td>' + e.hints + '</td><td>' + e.checks + '</td></tr>';
      });
      $('#recentTable').innerHTML = log.length ? r + '</table>' : '<p class="muted">Nothing yet — finish a puzzle!</p>';
    });
  }

  function lineChart(id, labels, series, unit) {
    if (!window.Chart) return;
    if (charts[id]) charts[id].destroy();
    var grid = cssVar('--line'), txt = cssVar('--muted');
    charts[id] = new Chart(document.getElementById(id), {
      type: 'line',
      data: { labels: labels, datasets: series.map(function (s) {
        return { label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.color, spanGaps: true, tension: 0.25, pointRadius: 3, borderWidth: 2 };
      }) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: series.length > 1, labels: { color: txt, boxWidth: 12 } },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + (unit === 'min' || series[0].label.indexOf('min') >= 0 ? fmt(c.parsed.y * 60000) : c.parsed.y); } } } },
        scales: { x: { ticks: { color: txt, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { color: grid } },
                  y: { beginAtZero: true, ticks: { color: txt, precision: 0 }, grid: { color: grid } } }
      }
    });
  }

  // ---------- confetti ----------
  function confetti() {
    var cv = document.createElement('canvas'); cv.className = 'confetti'; document.body.appendChild(cv);
    var dpr = window.devicePixelRatio || 1, W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr, ctx = cv.getContext('2d');
    var cols = ['#f44336', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0', '#ff9800', '#00bcd4'];
    var ps = [];
    for (var k = 0; k < 200; k++) ps.push({ x: W / 2 + (Math.random() - .5) * W * .2, y: H * .45, vx: (Math.random() - .5) * W * .025,
      vy: -(Math.random() * H * .022 + H * .006), s: (6 + Math.random() * 7) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .35, c: cols[k % cols.length] });
    var g = H * .0005, frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) {
        p.vy += g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (++frame < 260) requestAnimationFrame(tick); else cv.remove();
    })();
  }

  // ---------- theme ----------
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('sudoku-theme', t); } catch (e) {}
  }
  function cycleTheme() {
    var cur; try { cur = localStorage.getItem('sudoku-theme') || 'auto'; } catch (e) { cur = 'auto'; }
    var next = { auto: 'light', light: 'dark', dark: 'auto' }[cur] || 'auto';
    applyTheme(next);
    toast('Theme: ' + next);
  }

  // ---------- wiring ----------
  function closeModals() { document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; }); }
  function modalOpen() { return !!document.querySelector('.modal:not([hidden])'); }

  buildBoard();
  $('#btnUndo').addEventListener('click', undo);
  $('#btnErase').addEventListener('click', erase);
  $('#btnNotes').addEventListener('click', toggleNotes);
  $('#btnCheck').addEventListener('click', checkCell);
  $('#helper').addEventListener('change', function () { setHelper(this.checked); });
  $('#btnPause').addEventListener('click', function () { setPaused(!manualPause); });
  $('#paused').addEventListener('click', function () { setPaused(false); });
  $('#btnTheme').addEventListener('click', cycleTheme);
  $('#btnHistory').addEventListener('click', showHistory);
  $('#btnSummary').addEventListener('click', function () {
    if (lastFinish && lastFinish.current.puzzle_id === S.puzzle_id) showFinish(lastFinish); else showHistory();
  });
  $('#btnBonus').addEventListener('click', function () {
    api('bonus').then(function (d) { closeModals(); loadPayload(d); toast('Bonus puzzle — go!'); });
  });
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.hasAttribute('data-close')) m.hidden = true; });
  });

  document.addEventListener('keydown', function (e) {
    if (modalOpen()) { if (e.key === 'Escape') closeModals(); return; }
    var dg = /^Digit([1-9])$|^Numpad([1-9])$/.exec(e.code);
    if (dg && !e.ctrlKey && !e.metaKey) { inputDigit(+(dg[1] || dg[2]), e.shiftKey); e.preventDefault(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { erase(); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); return; }
    var mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (mv) {
      if (selected < 0) selected = 40;
      else {
        var r = Math.floor(selected / 9), c = selected % 9;
        if (mv === -9) r = (r + 8) % 9; if (mv === 9) r = (r + 1) % 9;
        if (mv === -1) c = (c + 8) % 9; if (mv === 1) c = (c + 1) % 9;
        selected = r * 9 + c;
      }
      autoNotes(); render(); e.preventDefault(); return;
    }
    var k = e.key.toLowerCase();
    if (k === 'n') toggleNotes();
    else if (k === 'c') checkCell();
    else if (k === 'h') setHelper(!helperOn);
    else if (k === 'p' || k === ' ') { setPaused(!manualPause); e.preventDefault(); }
  });

  refresh();
})();
