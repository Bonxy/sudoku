/*
 * Sudoku solver shared by the browser (helper) and Node (puzzle generator).
 * Boards are arrays of 81 ints, 0 = empty. Candidates are bitmasks (bit d = digit d).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Solver = factory();
})(this, function () {
  'use strict';

  var ALL = 0x3FE;
  var UNITS = [];
  var r, c, i, b;
  for (r = 0; r < 9; r++) { var row = []; for (c = 0; c < 9; c++) row.push(r * 9 + c); UNITS.push(row); }
  for (c = 0; c < 9; c++) { var col = []; for (r = 0; r < 9; r++) col.push(r * 9 + c); UNITS.push(col); }
  for (b = 0; b < 9; b++) {
    var box = [], br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
    for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) box.push((br + r) * 9 + bc + c);
    UNITS.push(box);
  }
  var ROW = [], COL = [], BOX = [], PEERS = [];
  for (i = 0; i < 81; i++) {
    ROW[i] = Math.floor(i / 9); COL[i] = i % 9;
    BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
  }
  for (i = 0; i < 81; i++) {
    var p = [];
    for (var j = 0; j < 81; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
    }
    PEERS.push(p);
  }
  var PEER_SET = PEERS.map(function (list) { var s = {}; list.forEach(function (x) { s[x] = true; }); return s; });

  function bit(d) { return 1 << d; }
  function popcount(m) { var n = 0; while (m) { m &= m - 1; n++; } return n; }
  function digitsOf(m) { var a = []; for (var d = 1; d <= 9; d++) if (m & (1 << d)) a.push(d); return a; }
  function firstDigit(m) { for (var d = 1; d <= 9; d++) if (m & (1 << d)) return d; return 0; }
  function combos(arr, k) {
    var out = [];
    (function rec(start, acc) {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (var x = start; x < arr.length; x++) { acc.push(arr[x]); rec(x + 1, acc); acc.pop(); }
    })(0, []);
    return out;
  }

  function computeCands(board) {
    var cands = new Array(81);
    for (var i = 0; i < 81; i++) {
      if (board[i]) { cands[i] = 0; continue; }
      var m = ALL;
      for (var k = 0; k < PEERS[i].length; k++) { var v = board[PEERS[i][k]]; if (v) m &= ~bit(v); }
      cands[i] = m;
    }
    return cands;
  }

  function place(board, cands, i, d) {
    board[i] = d; cands[i] = 0;
    for (var k = 0; k < PEERS[i].length; k++) cands[PEERS[i][k]] &= ~bit(d);
  }

  // ---- placements ----
  function nakedSingle(board, cands) {
    for (var i = 0; i < 81; i++) if (!board[i] && popcount(cands[i]) === 1) return { cell: i, digit: firstDigit(cands[i]), technique: 'Naked single' };
    return null;
  }
  function hiddenSingle(board, cands) {
    // boxes first: those are the easiest for a human to spot
    var order = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    for (var o = 0; o < order.length; o++) {
      var unit = UNITS[order[o]];
      for (var d = 1; d <= 9; d++) {
        var count = 0, pos = -1, placed = false;
        for (var k = 0; k < 9; k++) {
          var x = unit[k];
          if (board[x] === d) { placed = true; break; }
          if (!board[x] && (cands[x] & bit(d))) { count++; pos = x; }
        }
        if (!placed && count === 1) return { cell: pos, digit: d, technique: 'Hidden single' };
      }
    }
    return null;
  }

  // ---- eliminations: each returns [[cell, mask], ...] that actually removes something, or null ----
  function addElim(list, cands, i, m) { if (cands[i] & m) list.push([i, cands[i] & m]); }

  function lockedCandidates(board, cands) {
    for (var u = 0; u < 27; u++) {
      for (var d = 1; d <= 9; d++) {
        var cells = UNITS[u].filter(function (x) { return !board[x] && (cands[x] & bit(d)); });
        if (cells.length < 2) continue;
        var targets = [];
        if (u >= 18) { // pointing: box -> row/col
          var sameRow = cells.every(function (x) { return ROW[x] === ROW[cells[0]]; });
          var sameCol = cells.every(function (x) { return COL[x] === COL[cells[0]]; });
          if (sameRow) targets = UNITS[ROW[cells[0]]];
          else if (sameCol) targets = UNITS[9 + COL[cells[0]]];
        } else { // claiming: row/col -> box
          var sameBox = cells.every(function (x) { return BOX[x] === BOX[cells[0]]; });
          if (sameBox) targets = UNITS[18 + BOX[cells[0]]];
        }
        var el = [];
        for (var t = 0; t < targets.length; t++) {
          var x = targets[t];
          if (!board[x] && cells.indexOf(x) < 0) addElim(el, cands, x, bit(d));
        }
        if (el.length) return el;
      }
    }
    return null;
  }

  function nakedSubset(size) {
    return function (board, cands) {
      for (var u = 0; u < 27; u++) {
        var empties = UNITS[u].filter(function (x) { return !board[x]; });
        if (empties.length <= size) continue;
        var small = empties.filter(function (x) { var n = popcount(cands[x]); return n >= 2 && n <= size; });
        var cs = combos(small, size);
        for (var k = 0; k < cs.length; k++) {
          var m = 0; cs[k].forEach(function (x) { m |= cands[x]; });
          if (popcount(m) !== size) continue;
          var el = [];
          empties.forEach(function (x) { if (cs[k].indexOf(x) < 0) addElim(el, cands, x, m); });
          if (el.length) return el;
        }
      }
      return null;
    };
  }

  function hiddenSubset(size) {
    return function (board, cands) {
      for (var u = 0; u < 27; u++) {
        var unit = UNITS[u];
        var empties = unit.filter(function (x) { return !board[x]; });
        if (empties.length <= size) continue;
        var free = [];
        for (var d = 1; d <= 9; d++) {
          var placed = unit.some(function (x) { return board[x] === d; });
          if (!placed) free.push(d);
        }
        var cs = combos(free, size);
        for (var k = 0; k < cs.length; k++) {
          var m = 0; cs[k].forEach(function (d) { m |= bit(d); });
          var cells = empties.filter(function (x) { return cands[x] & m; });
          if (cells.length !== size) continue;
          var ok = cs[k].every(function (d) { return cells.some(function (x) { return cands[x] & bit(d); }); });
          if (!ok) continue;
          var el = [];
          cells.forEach(function (x) { addElim(el, cands, x, ALL & ~m); });
          if (el.length) return el;
        }
      }
      return null;
    };
  }

  function fish(size) {
    return function (board, cands) {
      for (var d = 1; d <= 9; d++) {
        for (var orient = 0; orient < 2; orient++) {
          var base = orient === 0 ? 0 : 9, cover = orient === 0 ? 9 : 0;
          var lines = [];
          for (var l = 0; l < 9; l++) {
            var pos = [];
            UNITS[base + l].forEach(function (x) { if (!board[x] && (cands[x] & bit(d))) pos.push(orient === 0 ? COL[x] : ROW[x]); });
            if (pos.length >= 2 && pos.length <= size) lines.push({ line: l, pos: pos });
          }
          var cs = combos(lines, size);
          for (var k = 0; k < cs.length; k++) {
            var set = {};
            cs[k].forEach(function (o) { o.pos.forEach(function (p) { set[p] = true; }); });
            var coverLines = Object.keys(set).map(Number);
            if (coverLines.length !== size) continue;
            var baseLines = cs[k].map(function (o) { return o.line; });
            var el = [];
            coverLines.forEach(function (cl) {
              UNITS[cover + cl].forEach(function (x) {
                var bl = orient === 0 ? ROW[x] : COL[x];
                if (!board[x] && baseLines.indexOf(bl) < 0) addElim(el, cands, x, bit(d));
              });
            });
            if (el.length) return el;
          }
        }
      }
      return null;
    };
  }

  function yWing(board, cands) {
    for (var pv = 0; pv < 81; pv++) {
      if (board[pv] || popcount(cands[pv]) !== 2) continue;
      var ab = digitsOf(cands[pv]), a = ab[0], bb = ab[1];
      var wings = PEERS[pv].filter(function (x) { return !board[x] && popcount(cands[x]) === 2; });
      for (var w1 = 0; w1 < wings.length; w1++) {
        var x1 = wings[w1];
        if (!(cands[x1] & bit(a)) || (cands[x1] & bit(bb))) continue;
        var cMask = cands[x1] & ~bit(a);
        for (var w2 = 0; w2 < wings.length; w2++) {
          var x2 = wings[w2];
          if (x2 === x1 || cands[x2] !== (bit(bb) | cMask)) continue;
          var el = [];
          for (var t = 0; t < 81; t++) {
            if (t === pv || t === x1 || t === x2 || board[t]) continue;
            if (PEER_SET[x1][t] && PEER_SET[x2][t]) addElim(el, cands, t, cMask);
          }
          if (el.length) return el;
        }
      }
    }
    return null;
  }

  var TECHNIQUES = [
    { name: 'Locked candidates', level: 2, fn: lockedCandidates },
    { name: 'Naked pair', level: 3, fn: nakedSubset(2) },
    { name: 'Hidden pair', level: 3, fn: hiddenSubset(2) },
    { name: 'Naked triple', level: 4, fn: nakedSubset(3) },
    { name: 'Hidden triple', level: 4, fn: hiddenSubset(3) },
    { name: 'X-Wing', level: 4, fn: fish(2) },
    { name: 'Y-Wing', level: 4, fn: yWing },
    { name: 'Swordfish', level: 5, fn: fish(3) }
  ];

  function applyElims(cands, el) { el.forEach(function (e) { cands[e[0]] &= ~e[1]; }); }

  // Solve using human techniques only. Returns {solved, maxLevel, used}
  function solveLogical(board0) {
    var board = board0.slice(), cands = computeCands(board), maxLevel = 0, used = {};
    for (;;) {
      if (board.every(function (v) { return v; })) return { solved: true, maxLevel: maxLevel, used: used, board: board };
      for (var z = 0; z < 81; z++) if (!board[z] && !cands[z]) return { solved: false, maxLevel: maxLevel, used: used };
      var s = nakedSingle(board, cands) || hiddenSingle(board, cands);
      if (s) { place(board, cands, s.cell, s.digit); if (maxLevel < 1) maxLevel = 1; continue; }
      var progressed = false;
      for (var t = 0; t < TECHNIQUES.length; t++) {
        var el = TECHNIQUES[t].fn(board, cands);
        if (el && el.length) {
          applyElims(cands, el);
          if (TECHNIQUES[t].level > maxLevel) maxLevel = TECHNIQUES[t].level;
          used[TECHNIQUES[t].name] = (used[TECHNIQUES[t].name] || 0) + 1;
          progressed = true; break;
        }
      }
      if (!progressed) return { solved: false, maxLevel: maxLevel, used: used };
    }
  }

  // Next cell a human could fill. `board` must contain only correct digits.
  // `avoid[i]` true = don't point at that cell (e.g. user has a wrong number there).
  function findHint(board0, avoid) {
    avoid = avoid || [];
    var board = board0.slice(), cands = computeCands(board);
    for (var guard = 0; guard < 400; guard++) {
      var s = hiddenSingle(board, cands) || nakedSingle(board, cands);
      if (s) {
        if (!avoid[s.cell]) return s;
        place(board, cands, s.cell, s.digit);
        continue;
      }
      var progressed = false;
      for (var t = 0; t < TECHNIQUES.length; t++) {
        var el = TECHNIQUES[t].fn(board, cands);
        if (el && el.length) { applyElims(cands, el); progressed = true; break; }
      }
      if (!progressed) break;
    }
    var best = -1, bestN = 10;
    for (var i = 0; i < 81; i++) {
      if (!board[i] && !avoid[i]) { var n = popcount(cands[i]); if (n < bestN) { bestN = n; best = i; } }
    }
    return best >= 0 ? { cell: best, digit: 0, technique: 'Fewest candidates' } : null;
  }

  // Backtracking solution counter (stops at `limit`)
  function countSolutions(board0, limit, randomise) {
    limit = limit || 2;
    var board = board0.slice(), rowM = [0,0,0,0,0,0,0,0,0], colM = rowM.slice(), boxM = rowM.slice();
    for (var i = 0; i < 81; i++) {
      var v = board[i]; if (!v) continue;
      var m = bit(v);
      if ((rowM[ROW[i]] | colM[COL[i]] | boxM[BOX[i]]) & m) return { count: 0 };
      rowM[ROW[i]] |= m; colM[COL[i]] |= m; boxM[BOX[i]] |= m;
    }
    var count = 0, first = null;
    (function rec() {
      var best = -1, bestMask = 0, bestN = 10;
      for (var i = 0; i < 81; i++) {
        if (board[i]) continue;
        var m = ALL & ~(rowM[ROW[i]] | colM[COL[i]] | boxM[BOX[i]]);
        var n = popcount(m);
        if (n < bestN) { bestN = n; best = i; bestMask = m; if (n === 0) return; }
      }
      if (best < 0) { count++; if (!first) first = board.slice(); return; }
      var ds = digitsOf(bestMask);
      if (randomise) ds.sort(function () { return Math.random() - 0.5; });
      for (var k = 0; k < ds.length; k++) {
        var d = ds[k], mm = bit(d);
        board[best] = d; rowM[ROW[best]] |= mm; colM[COL[best]] |= mm; boxM[BOX[best]] |= mm;
        rec();
        board[best] = 0; rowM[ROW[best]] &= ~mm; colM[COL[best]] &= ~mm; boxM[BOX[best]] &= ~mm;
        if (count >= limit) return;
      }
    })();
    return { count: count, solution: first };
  }

  function generateFull() {
    return countSolutions(new Array(81).fill(0), 1, true).solution;
  }

  return {
    UNITS: UNITS, PEERS: PEERS, ROW: ROW, COL: COL, BOX: BOX,
    computeCands: computeCands, solveLogical: solveLogical, findHint: findHint,
    countSolutions: countSolutions, generateFull: generateFull, popcount: popcount
  };
});
