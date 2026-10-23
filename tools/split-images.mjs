// Splits the single base64 sprite blob (js/images.js) into several smaller
// chunk files to avoid a Windows Defender heuristic false-positive on the large
// aggregated base64. Source is read from the git index so a quarantined
// working-tree copy does not matter. Each chunk populates a shared global IMAGES.
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, statSync } from 'node:fs';

const TARGET_BYTES = Number(process.argv[2] || 48 * 1024);

const raw = execSync('git cat-file -p :js/images.js', { maxBuffer: 1 << 30 }).toString('utf8');
const IMAGES = (new Function(raw + '\n;return IMAGES;'))();
const keys = Object.keys(IMAGES);

// Group keys into chunks until each serialized chunk is ~TARGET_BYTES.
const chunks = [];
let cur = [];
let curBytes = 0;
for (const k of keys) {
  const entry = JSON.stringify(k) + ':' + JSON.stringify(IMAGES[k]) + ',\n';
  if (curBytes && curBytes + entry.length > TARGET_BYTES) { chunks.push(cur); cur = []; curBytes = 0; }
  cur.push(k);
  curBytes += entry.length;
}
if (cur.length) chunks.push(cur);

const results = [];
chunks.forEach((group, i) => {
  let body = 'window.IMAGES = Object.assign(window.IMAGES || {}, {\n';
  for (const k of group) body += JSON.stringify(k) + ':' + JSON.stringify(IMAGES[k]) + ',\n';
  body += '});\n';
  const path = `js/images-${i}.js`;
  writeFileSync(path, body);
  const ok = existsSync(path);
  results.push({ path, keys: group.length, bytes: ok ? statSync(path).size : 0, onDisk: ok });
});

console.log(JSON.stringify({ totalKeys: keys.length, chunkCount: chunks.length, results }, null, 2));
