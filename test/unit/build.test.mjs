import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createZip } from '../../scripts/lib/zip.mjs';
import { ROOT } from '../../scripts/lib/paths.mjs';

// ZIPを読み戻して中身を確認する（セントラルディレクトリを読む簡易リーダー）
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26);
    const lelen = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
    out[name] = method === 8 ? inflateRawSync(data) : data;
    p += 46 + nlen + elen + clen;
  }
  return out;
}

test('ZIP: 書いた内容を読み戻せる（日本語ファイル名・圧縮/無圧縮）', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('hello '.repeat(100)) },
    { name: 'dir/日本語.json', data: Buffer.from('{"x":1}') },
    { name: 'tiny', data: Buffer.from('x') },
  ];
  const files = readZip(createZip(entries));
  for (const e of entries) assert.equal(files[e.name].toString(), e.data.toString());
});

test('manifest.json と package.json のバージョンが一致', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'src/manifest.json'), 'utf8'));
  const p = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(m.version, p.version);
});

test('manifest.json: 必要最小限の権限だけを使う', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'src/manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual([...m.permissions].sort(), ['activeTab', 'scripting', 'storage']);
  assert.equal(m.host_permissions, undefined);
  assert.ok([...m.description].length <= 132);
});
