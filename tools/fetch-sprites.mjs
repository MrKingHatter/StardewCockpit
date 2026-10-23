// Downloads sprite PNGs directly from the Stardew Valley Wiki (static image
// path derived from the md5 of the filename — works even when the wiki's PHP
// pages are down) and merges them into js/images-extra.js as base64 data URIs.
// Supplements the split js/images-*.js chunks; survives re-splitting.
// Usage: node tools/fetch-sprites.mjs "Parrot_Egg.png" "AppKey.png::Wiki_File.png"
// An arg "AppKey.png::Wiki_File.png" stores the wiki image under a different
// lookup key (when the app's name-derived key differs from the wiki filename).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'js/images-extra.js';
const names = process.argv.slice(2);
if (!names.length) { console.error('no filenames given'); process.exit(1); }

function wikiUrl(name) {
  const h = createHash('md5').update(name).digest('hex');
  return `https://stardewvalleywiki.com/mediawiki/images/${h[0]}/${h[0]}${h[1]}/${name}`;
}

// node fetch() is blocked by the wiki (403); download via PowerShell instead.
function download(url) {
  const ps = `$ErrorActionPreference='Stop';$r=Invoke-WebRequest -Uri '${url}' -UseBasicParsing;[Convert]::ToBase64String($r.Content)+'|'+$r.Headers['Content-Type']`;
  const out = execFileSync('pwsh', ['-NoProfile', '-Command', ps], { maxBuffer: 1 << 28 }).toString().trim();
  const sep = out.lastIndexOf('|');
  return { b64: out.slice(0, sep), type: (out.slice(sep + 1) || 'image/png').trim() };
}

// Load existing extra sprites so repeated runs accumulate.
const IMAGES = {};
if (existsSync(OUT)) {
  new Function('window', readFileSync(OUT, 'utf8'))({ IMAGES });
}

for (const arg of names) {
  const [key, wikiFile = key] = arg.split('::');
  try {
    const { b64, type } = download(wikiUrl(wikiFile));
    IMAGES[key] = `data:${type};base64,${b64}`;
    console.log(`OK ${key}${wikiFile !== key ? ' (from ' + wikiFile + ')' : ''}: ${Math.round(b64.length * 0.75)} bytes`);
  } catch (e) {
    console.error(`FAIL ${key}: ${e.message.split('\n')[0]}`);
  }
}

let body = 'window.IMAGES = Object.assign(window.IMAGES || {}, {\n';
for (const k of Object.keys(IMAGES).sort()) body += JSON.stringify(k) + ':' + JSON.stringify(IMAGES[k]) + ',\n';
body += '});\n';
writeFileSync(OUT, body);
console.log(`wrote ${OUT} (${Object.keys(IMAGES).length} sprites)`);
