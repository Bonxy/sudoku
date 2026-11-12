#!/usr/bin/env node
/*
 * Generate graded puzzles.
 *   node tools/generate.js <medium> <hard> [file]
 * Appends to [file] (default data/puzzles.json), continuing the id numbers.
 *
 * Grading (techniques needed, from solver.js):
 *   medium = needs locked candidates, nothing harder
 *   hard   = needs pairs / triples / X-Wing / Y-Wing / Swordfish
 * Puzzles that need guessing or only singles are thrown away.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'solver.js'));

const want = { medium: parseInt(process.argv[2] || '20', 10), hard: parseInt(process.argv[3] || '10', 10) };
const file = process.argv[4] || path.join(__dirname, '..', 'data', 'puzzles.json');

const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const seen = new Set(existing.map(p => p.givens));
let nextId = existing.reduce((m, p) => Math.max(m, p.id), 0) + 1;
const got = { medium: 0, hard: 0 };
const out = [];

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let tries = 0;
while (got.medium < want.medium || got.hard < want.hard) {
  tries++;
  const solution = S.generateFull();
  const puzzle = solution.slice();
  // remove cells in symmetric pairs while the solution stays unique
  for (const i of shuffle([...Array(41).keys()])) {
    const j = 80 - i;
    const a = puzzle[i], b = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    if (S.countSolutions(puzzle, 2).count !== 1) { puzzle[i] = a; puzzle[j] = b; }
  }
  const g = S.solveLogical(puzzle);
  if (!g.solved) continue;
  const difficulty = g.maxLevel >= 3 ? 'hard' : g.maxLevel === 2 ? 'medium' : null;
  if (!difficulty || got[difficulty] >= want[difficulty]) continue;
  const givens = puzzle.join('');
  if (seen.has(givens)) continue;
  seen.add(givens);
  got[difficulty]++;
  out.push({
    id: nextId++,
    difficulty,
    clues: puzzle.filter(Boolean).length,
    techniques: Object.keys(g.used),
    givens,
    solution: solution.join('')
  });
  process.stderr.write(`#${nextId - 1} ${difficulty} (${Object.keys(g.used).join(', ')})\n`);
}

// mix the order so ids don't group by difficulty
const all = existing.concat(shuffle(out).map((p, k) => ({ ...p, id: existing.length ? p.id : k + 1 })));
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
console.log(`Added ${out.length} puzzles (${got.medium} medium, ${got.hard} hard) after ${tries} tries -> ${file}`);
