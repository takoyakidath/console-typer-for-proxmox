import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { loadPT, listPluginFiles } from '../../scripts/lib/plugins.mjs';
import { ROOT } from '../../scripts/lib/paths.mjs';

const PT = loadPT();
const ipv4 = PT.BUILTIN.find((p) => p.id === 'builtin.ubuntu-ipv4');
const values = (r) => [...r.values].map((v) => v.value);

test('標準プラグインはすべて検証を通る', () => {
  for (const p of PT.BUILTIN) assert.deepEqual([...PT.validate(p)], [], p.id);
});

test('plugins/ の JSON はすべて検証を通る', () => {
  const files = listPluginFiles();
  assert.ok(files.length > 0);
  for (const f of files) {
    const p = JSON.parse(readFileSync(f, 'utf8'));
    assert.deepEqual([...PT.validate(p)], [], relative(ROOT, f));
    assert.ok(!p.id.startsWith('builtin.'), `${relative(ROOT, f)}: id に builtin. は使えません`);
  }
});

test('IPv4: 末尾だけの入力をネットワークで補う', () => {
  assert.deepEqual(values(PT.compute(ipv4, {}, { ip: '162' })),
    ['192.168.1.0/24', '192.168.1.162', '192.168.1.1', '1.1.1.1,8.8.8.8', '']);
  assert.deepEqual(values(PT.compute(ipv4, {}, { ip: '2.162' })).slice(0, 3),
    ['192.168.2.0/24', '192.168.2.162', '192.168.2.1']);
  assert.deepEqual(values(PT.compute(ipv4, { network: '10.20.0.0/16' }, { ip: '132.162' })).slice(0, 3),
    ['10.20.0.0/16', '10.20.132.162', '10.20.0.1']);
});

test('IPv4: プレフィックス付きの入力はそのまま使う', () => {
  assert.deepEqual(values(PT.compute(ipv4, {}, { ip: '10.0.0.5/8' })).slice(0, 3), ['10.0.0.0/8', '10.0.0.5', '10.0.0.1']);
  assert.deepEqual(values(PT.compute(ipv4, {}, { ip: '192.168.1.162/25' })).slice(0, 3), ['192.168.1.128/25', '192.168.1.162', '192.168.1.129']);
});

test('IPv4: ゲートウェイを設定すればそれを使う', () => {
  assert.equal(values(PT.compute(ipv4, { gateway: '192.168.1.254' }, { ip: '50' }))[2], '192.168.1.254');
});

test('IPv4: 不正な入力はエラー', () => {
  assert.match(PT.compute(ipv4, {}, { ip: '300' }).errors.ip, /正しくありません/);
  assert.match(PT.compute(ipv4, {}, { ip: '' }).errors.ip, /未入力/);
  assert.match(PT.compute(ipv4, {}, { ip: 'abc' }).errors.ip, /形式/);
  assert.match(PT.compute(ipv4, {}, { ip: '1.2.3.4/40' }).errors.ip, /プレフィックス/);
  assert.match(PT.compute(ipv4, { network: 'bad' }, { ip: '5' }).errors.ip, /CIDR/);
});

test('IPv4: ネットワーク／ブロードキャストアドレスは警告', () => {
  const r = PT.compute(ipv4, {}, { ip: '0' });
  assert.equal(r.warnings.length, 1);
});

test('式: フィルタ一式', () => {
  const scope = { ip: PT.resolveIpv4('192.168.1.162/24', null).value, s: ' Ab ', empty: '' };
  const cases = {
    '{{ip}}': '192.168.1.162',
    '{{ip|prefix}}': '24',
    '{{ip|mask}}': '255.255.255.0',
    '{{ip|network}}': '192.168.1.0',
    '{{ip|broadcast}}': '192.168.1.255',
    '{{ip|cidr}}': '192.168.1.0/24',
    '{{ip|withprefix}}': '192.168.1.162/24',
    '{{ip|host:1}}': '192.168.1.1',
    '{{ip|host:-1}}': '192.168.1.254',
    '{{ip|octet:4}}': '162',
    '{{s|trim|upper}}': 'AB',
    '{{empty ?? "none"}}': 'none',
    '{{empty ?? ip|host:10}}': '192.168.1.10',
  };
  for (const [tpl, want] of Object.entries(cases)) assert.equal(PT.render(tpl, scope), want, tpl);
});

test('検証: よくある間違いを見つける', () => {
  const errs = (p) => PT.validate(p).join('\n');
  assert.match(errs({ id: 'Bad Id', name: 'x', fields: [] }), /id/);
  assert.match(errs({ id: 'a.b', fields: [] }), /name/);
  assert.match(errs({ id: 'a.b', name: 'x' }), /fields/);
  assert.match(errs({ id: 'a.b', name: 'x', fields: [], text: '' }), /どちらか一方/);
  assert.match(errs({ id: 'a.b', name: 'x', fields: [{ label: 'a', value: '{{nope}}' }] }), /未定義/);
  assert.match(errs({ id: 'a.b', name: 'x', inputs: [{ id: 'ip', type: 'ipv4', label: 'IP' }], fields: [{ label: 'a', value: '{{ip|hots:1}}' }] }), /不明なフィルタ/);
  assert.match(errs({ id: 'a.b', name: 'x', inputs: [{ id: 'ip', type: 'ipv4', base: 'nw', label: 'IP' }], fields: [] }), /base/);
  assert.match(errs({ id: 'a.b', name: 'x', settings: [{ id: 'a', label: 'A' }], inputs: [{ id: 'a', label: 'A' }], fields: [] }), /重複/);
});
