// package.json の version を src/manifest.json にコピーする
//   `npm version patch|minor|major` の実行中に自動で呼ばれます
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/paths.mjs';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const file = join(ROOT, 'src/manifest.json');
const manifest = JSON.parse(readFileSync(file, 'utf8'));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`src/manifest.json の version を ${pkg.version} にしました`);
}
