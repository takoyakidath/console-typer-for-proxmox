// ビルドした zip を実際に Chromium へ拡張機能として読み込めるかのテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { ROOT } from '../../scripts/lib/paths.mjs';
import { launchWithExtension } from '../../scripts/lib/browser.mjs';

function unzip(zipPath, dest) {
  const buf = readFileSync(zipPath);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(start, start + csize);
    mkdirSync(dirname(join(dest, name)), { recursive: true });
    writeFileSync(join(dest, name), method === 8 ? inflateRawSync(data) : data);
    p += 46 + nlen + elen + clen;
  }
}

test('ビルドした zip が拡張機能としてエラーなく読み込まれる', async () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build.mjs')], { stdio: 'pipe' });
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const ext = mkdtempSync(join(tmpdir(), 'ct-ext-'));
  unzip(join(ROOT, `dist/console-typer-for-proxmox-${version}.zip`), ext);

  const ctx = await launchWithExtension(ext);
  try {
    const page = await ctx.newPage();
    await page.goto('chrome://extensions');
    const info = await page.evaluate(() => new Promise((res) =>
      chrome.developerPrivate.getExtensionsInfo((list) => res(list.map((e) => ({
        id: e.id, name: e.name, version: e.version, state: e.state,
        errors: e.manifestErrors.length + e.runtimeErrors.length, warnings: e.installWarnings,
      }))))));
    assert.equal(info.length, 1);
    assert.equal(info[0].state, 'ENABLED');
    assert.equal(info[0].version, version);
    assert.equal(info[0].errors, 0);
    assert.deepEqual(info[0].warnings, []);

    const popup = await ctx.newPage();
    const errors = [];
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.goto(`chrome-extension://${info[0].id}/popup.html`);
    await popup.waitForSelector('#list .clip');
    assert.equal(await popup.locator('#list .clip').count(), 2);
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
  }
});
