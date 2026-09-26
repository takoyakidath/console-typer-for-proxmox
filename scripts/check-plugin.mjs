// プラグインJSONをチェックし、サンプル入力での結果を表示する
//   npm run check:plugin -- plugins/my-plugin.json [入力値...]
//   例: npm run check:plugin -- plugins/netplan-static.json 162
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { loadPT, listPluginFiles } from './lib/plugins.mjs';
import { ROOT } from './lib/paths.mjs';

const [file, ...inputArgs] = process.argv.slice(2);
const files = file ? [resolve(file)] : listPluginFiles();
const PT = loadPT();
let failed = false;

for (const f of files) {
  let p;
  try {
    p = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    console.error(`✖ ${f}: JSONとして読めません: ${e.message}`);
    failed = true;
    continue;
  }
  const errs = PT.validate(p);
  if (errs.length) {
    console.error(`✖ ${relative(ROOT, f)}`);
    for (const e of errs) console.error('    ' + e);
    failed = true;
    continue;
  }
  console.log(`✔ ${relative(ROOT, f)} — ${p.name}`);
  if (!file) continue;

  // 1ファイル指定時は、試しに計算した結果を表示
  const inputs = {};
  (p.inputs || []).forEach((inp, i) => {
    inputs[inp.id] = inputArgs[i] ?? ((inp.type || 'text') === 'ipv4' ? (inp.base ? '10' : '192.0.2.10/24') : 'sample');
  });
  const r = PT.compute(p, {}, inputs);
  console.log('\n入力: ' + JSON.stringify(inputs));
  if (r.error || Object.keys(r.errors || {}).length) {
    console.log('エラー: ' + (r.error || JSON.stringify(r.errors)));
  } else if (r.values) {
    for (const v of r.values) console.log(`  ${v.label}: ${v.secret && v.value ? '••••' : v.value || '(空)'}  ⇥`);
  } else {
    console.log('----\n' + r.text + '----');
  }
  for (const w of r.warnings || []) console.log('注意: ' + w);
}
process.exit(failed ? 1 : 0);
