// src/plugins.js（ブラウザ用スクリプト）を Node から使うための読み込み
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from './paths.mjs';

export function loadPT() {
  const code = readFileSync(join(ROOT, 'src/plugins.js'), 'utf8');
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'src/plugins.js' });
  return sandbox.PT;
}

export function listPluginFiles() {
  const dir = join(ROOT, 'plugins');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(dir, f));
}
