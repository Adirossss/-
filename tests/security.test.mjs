// Security regression tests. No dependencies — run with:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const promo = readFileSync(new URL('promo/index.html', root), 'utf8');

// pull a single-line `const name = ...;` helper out of index.html and run it
function extract(name) {
  const line = html.split('\n').find(l => l.trim().startsWith(`const ${name} =`));
  assert.ok(line, `${name} not found in index.html`);
  return new Function(`${line.trim()} return ${name};`)();
}

test('escapeHtml neutralises HTML/attribute injection', () => {
  const escapeHtml = extract('escapeHtml');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
  assert.equal(escapeHtml(42), '42');
});

test('isSafeSyncUrl only accepts https', () => {
  const isSafeSyncUrl = extract('isSafeSyncUrl');
  assert.equal(isSafeSyncUrl('https://script.google.com/macros/s/abc/exec'), true);
  for (const bad of ['http://script.google.com/x', 'javascript:alert(1)', 'data:text/html,x', 'not a url', '']) {
    assert.equal(isSafeSyncUrl(bad), false, bad);
  }
});

test('sync paths refuse non-https URLs', () => {
  assert.match(html, /if \(!url \|\| !isSafeSyncUrl\(url\)\) return;/);
  assert.match(html, /if \(!url \|\| !isSafeSyncUrl\(url\) \|\| !pendingSync\.length/);
  assert.match(html, /if \(url && !isSafeSyncUrl\(url\)\)/);
});

test('CSP meta is present and blocks foreign scripts', () => {
  const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(m, 'CSP meta missing');
  const csp = m[1];
  assert.match(csp, /script-src 'self' 'unsafe-inline';/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.doesNotMatch(csp, /'unsafe-eval'/);
});

test('every user-sourced field rendered via innerHTML is escaped', () => {
  // note / category / emoji / custom names must never reach an HTML template
  // raw. Lines that assign via textContent (or build a custom-select label,
  // which is rendered with textContent) are safe and allowed.
  const raw = /\$\{(e\.note|e\.category|e\.emoji|c\.key|c\.emoji|b\.name|b\.emoji|r\.note)\}/;
  const offenders = html.split('\n').filter(l => raw.test(l) && !/textContent|label:/.test(l));
  assert.deepEqual(offenders, [], 'user field interpolated without escapeHtml');
});

test('external scripts on the promo page carry SRI', () => {
  const tags = promo.match(/<script[^>]*\ssrc="https?:[^>]*>/g) || [];
  assert.ok(tags.length > 0);
  for (const tag of tags) {
    assert.match(tag, /integrity="sha(256|384|512)-/, tag);
    assert.match(tag, /crossorigin="anonymous"/, tag);
  }
});

test('no hard-coded secrets', () => {
  const patterns = [/sk-[A-Za-z0-9]{20,}/, /AIza[0-9A-Za-z_-]{35}/, /ghp_[A-Za-z0-9]{36}/, /AKfycb[A-Za-z0-9_-]{20,}/];
  for (const src of [html, promo]) for (const p of patterns) assert.doesNotMatch(src, p);
});
