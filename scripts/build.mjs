// Chrome Web Store にアップロードする zip を dist/ に作る
//   npm run build
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, SRC, DIST } from './lib/paths.mjs';
import { createZip } from './lib/zip.mjs';
import { loadPT, listPluginFiles } from './lib/plugins.mjs';

const fail = (msg) => { console.error('✖ ' + msg); process.exit(1); };

// ---- チェック ----
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  fail(`バージョンが一致しません: src/manifest.json=${manifest.version}, package.json=${pkg.version}\n  → npm version <新しいバージョン> を使うと両方そろいます`);
}
const iconPaths = [...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {})];
for (const p of iconPaths) if (!existsSync(join(SRC, p))) fail(`アイコンがありません: src/${p}`);
if (manifest.description && [...manifest.description].length > 132) fail('manifest.description は132文字以内にしてください');

const PT = loadPT();
for (const p of PT.BUILTIN) {
  const errs = PT.validate(p);
  if (errs.length) fail(`標準プラグイン ${p.id}: ${errs.join(' / ')}`);
}
const examples = listPluginFiles();
for (const f of examples) {
  const errs = PT.validate(JSON.parse(readFileSync(f, 'utf8')));
  if (errs.length) fail(`${relative(ROOT, f)}: ${errs.join(' / ')}`);
}

// ---- 収集 ----
function walk(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const mtime = new Date();
const entries = walk(SRC)
  .filter((p) => !/(^|[\\/])\./.test(relative(SRC, p))) // 隠しファイルを除く
  .map((p) => ({ name: relative(SRC, p), data: readFileSync(p), mtime }));
entries.push({ name: 'PLUGINS.md', data: readFileSync(join(ROOT, 'docs/PLUGINS.md')), mtime });
entries.push({ name: 'LICENSE', data: readFileSync(join(ROOT, 'LICENSE')), mtime });
for (const f of examples) entries.push({ name: 'examples/' + relative(join(ROOT, 'plugins'), f), data: readFileSync(f), mtime });

// ---- 書き出し ----
mkdirSync(DIST, { recursive: true });
const out = join(DIST, `console-typer-for-proxmox-${manifest.version}.zip`);
writeFileSync(out, createZip(entries));
console.log(`✔ ${relative(ROOT, out)}（${entries.length} ファイル, ${(statSync(out).size / 1024).toFixed(1)} KB）`);
for (const e of entries) console.log('   ' + e.name);
