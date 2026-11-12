<?php
// Copy this file to config.php and fill it in. config.php is git-ignored.

// Where the page lives (no trailing slash). Change this if you move it to a subdomain etc.
$BASE_URL = 'https://bonxystuff.com/sudoku';

// Login password hash. Make one with:
//   php -r 'echo password_hash("your-password", PASSWORD_DEFAULT), "\n";'
$PASSWORD_HASH = 'PASTE_HASH_HERE';

// Random secret used to sign the "remember me" cookie. Make one with:
//   php -r 'echo bin2hex(random_bytes(32)), "\n";'
// Changing it logs out every device.
$SECRET = 'PASTE_SECRET_HERE';

$TIMEZONE  = 'Europe/London';
$NO_REPEAT = 10;                  // a puzzle can't come back until it's outside your last N plays
$DATA_DIR  = __DIR__ . '/data';   // must be writable by PHP
