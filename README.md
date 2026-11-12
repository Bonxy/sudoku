# 🧩 Daily Sudoku

A personal daily sudoku page. One puzzle a day from a fixed pool, with a timer, notes, a helper and cell checks. Your times are kept so you can compare them every time a puzzle comes back around. Progress syncs across devices.

No database: PHP 8 + JSON files.

## Files

| File | What it does |
|---|---|
| `index.php` | Login form and the game page |
| `api.php` | JSON API: `state`, `save`, `finish`, `bonus`, `history`, `export` (CSV) |
| `lib.php` | Login cookie, file locking, puzzle rotation |
| `config.sample.php` | Settings template → copy to `config.php` |
| `app.js` | The game (grid, notes, timer, helper, check, sync, stats, confetti) |
| `solver.js` | Human-style solver, used by the helper and by the generator |
| `style.css` | Styles (light/dark) |
| `data/puzzles.json` | The puzzle pool |
| `data/current.json` | Today's game in progress (created automatically, git-ignored) |
| `data/log.json` | Every play: date, puzzle, time, helper/checks used (created automatically, git-ignored) |
| `tools/generate.js` | Makes more graded puzzles |

## Install (Cloud628)

1. Upload the folder, e.g. to `public_html/sudoku`.
2. `cp config.sample.php config.php` and fill it in:
   - `$BASE_URL`: the full URL of the folder, no trailing slash
   - `$PASSWORD_HASH`: `php -r 'echo password_hash("your-password", PASSWORD_DEFAULT), "\n";'`
   - `$SECRET`: `php -r 'echo bin2hex(random_bytes(32)), "\n";'`
3. Make `data/` writable by PHP (`chmod 755` is usually enough on cPanel/suPHP; use `775` if saves fail).
4. Check that `https://…/sudoku/data/puzzles.json` returns **403**. `data/.htaccess` should block it.
5. Visit the page and log in once per device. The login lasts a year.

## How it works

- **Daily puzzle:** the first visit of the day picks a random puzzle that isn't in your last 10 plays (`$NO_REPEAT`). Days you don't visit aren't logged.
- **Rollover:** at midnight (UK time), an unfinished puzzle is logged as *unsolved* and a new one is picked.
- **Bonus:** once today's puzzle is solved, 🎲 Bonus puzzle picks another one for the same day.
- **Sync:** saves 2s after each move, every 30s while the timer runs, and when the tab is hidden. When you come back to the tab it reloads the latest state, so you can switch devices mid-puzzle.
- **Timer:** starts when the page opens. It pauses when the tab is hidden or when you press ⏸ (which hides the grid), and stops on the last correct number.
- **Helper:** while switched on, it highlights the next cell that can be solved by logic (singles after locked candidates, pairs, X-Wing, etc.). It ignores your wrong entries rather than pointing at them. Each time you switch it on counts as one use.
- **Check:** marks the selected cell's number green or red. Each check is counted.

## Keyboard (Chromebook)

`1–9` place · `Shift+1–9` note · arrows move · `Backspace` erase · `N` notes mode · `C` check · `H` helper · `P` pause · `Ctrl+Z` undo

## More puzzles

```
node tools/generate.js 10 5          # adds 10 medium + 5 hard to data/puzzles.json
```

Grading is by the hardest technique needed: **medium** needs locked candidates, **hard** needs pairs/triples/X-Wing/Y-Wing/Swordfish. Every puzzle has exactly one solution and can be solved without guessing.
