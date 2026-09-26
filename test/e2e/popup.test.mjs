// ポップアップUIの動作テスト（chrome.* API は偽物に差し替え）
//   npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SRC } from '../../scripts/lib/paths.mjs';
import { launch, openPopupWithStub, formatSeq } from '../../scripts/lib/browser.mjs';

const URL = pathToFileURL(join(SRC, 'popup.html')).href;
let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

async function open(initialStorage) {
  const { ctx, page } = await openPopupWithStub(browser, URL, { initialStorage });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.lastSeq = async (opts) => formatSeq(await page.evaluate(() => window.__lastSeq), opts);
  page.enter = async () => { await page.keyboard.press('Enter'); await page.waitForTimeout(50); };
  return { ctx, page, errors };
}

test('初回は標準プラグインの項目が2つ入っている', async () => {
  const { ctx, page, errors } = await open();
  const names = await page.$$eval('#list .clip-name', (e) => e.map((x) => x.textContent));
  assert.equal(names.length, 2);
  assert.match(names[0], /IPv4/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('IPv4: 「162」だけで Subnet/Address/Gateway が入力される', async () => {
  const { ctx, page } = await open();
  await page.click('.clip-main >> nth=0');
  await page.keyboard.type('162');
  assert.match(await page.textContent('#askPreview'), /Gateway: 192\.168\.1\.1/);
  await page.enter();
  assert.equal(await page.lastSeq(), '192.168.1.0/24{TAB}192.168.1.162{TAB}192.168.1.1{TAB}1.1.1.1,8.8.8.8{TAB}');
  // 前回値が入っている
  await page.click('.clip-main >> nth=0');
  assert.equal(await page.inputValue('#askBody input'), '162');
  await ctx.close();
});

test('IPv4: 不正なIPでは送信しない', async () => {
  const { ctx, page } = await open();
  await page.click('.clip-main >> nth=0');
  await page.fill('#askBody input', '999');
  await page.click('#askGo');
  assert.ok(await page.isVisible('#askView'));
  assert.match(await page.textContent('.input-error'), /正しくありません/);
  assert.equal(await page.evaluate(() => window.__lastSeq), undefined);
  await ctx.close();
});

test('設定の変更が保存され、計算に使われる', async () => {
  const { ctx, page } = await open();
  await page.click('.clip >> nth=0 >> button[title="編集"]');
  await page.fill('.srow >> nth=0 >> input', '10.10.0.0/16');
  await page.click('#save');
  await page.click('.clip-main >> nth=0');
  await page.fill('#askBody input', '3.40');
  await page.enter();
  assert.equal(await page.lastSeq(), '10.10.0.0/16{TAB}10.10.3.40{TAB}10.10.0.1{TAB}1.1.1.1,8.8.8.8{TAB}');
  await ctx.close();
});

test('プロフィール: パスワードが確認欄にも入る', async () => {
  const { ctx, page } = await open();
  await page.click('.clip >> nth=1 >> button[title="編集"]');
  const s = await page.$$('.srow input');
  await s[0].fill('Admin'); await s[1].fill('admin'); await s[2].fill('pw!23');
  await page.click('#save');
  await page.click('.clip-main >> nth=1');
  await page.keyboard.type('srv-web01');
  await page.enter();
  assert.equal(await page.lastSeq(), 'Admin{TAB}srv-web01{TAB}admin{TAB}pw!23{TAB}pw!23');
  await ctx.close();
});

test('テキスト項目: {?} と特殊キー', async () => {
  const { ctx, page } = await open();
  await page.selectOption('#newType', 'text');
  await page.click('#add');
  await page.fill('.name-input', 'ping');
  await page.fill('#editorBody textarea', 'ping -c1 10.0.0.{?}{ENTER}');
  await page.click('#save');
  await page.click('.clip-main >> nth=2');
  await page.keyboard.type('7');
  await page.enter();
  assert.equal(await page.lastSeq(), 'ping -c1 10.0.0.7{ENTER}');
  await ctx.close();
});

test('直接入力: 改行と「最後にEnter」', async () => {
  const { ctx, page } = await open();
  await page.click('.tab[data-tab=direct]');
  await page.fill('#text', 'ls{TAB}{WAIT 300}\necho hi');
  await page.check('#trailingEnter');
  await page.click('#send');
  await page.waitForTimeout(50);
  assert.equal(await page.lastSeq(), 'ls{TAB}{WAIT 300}{ENTER}echo hi{ENTER}');
  await ctx.close();
});

test('プラグイン: 読み込み・エラー表示・書き出し・使用', async () => {
  const { ctx, page } = await open();
  await page.click('.tab[data-tab=plugins]');
  await page.click('#pasteToggle');

  await page.fill('#pasteJson', '{"id":"Bad Id"}');
  await page.click('#pasteImport');
  assert.match(await page.textContent('#pluginMsg'), /id は英小文字/);

  await page.fill('#pasteJson', '{"id":"builtin.x","name":"x","fields":[]}');
  await page.click('#pasteImport');
  assert.match(await page.textContent('#pluginMsg'), /builtin\./);

  await page.fill('#pasteJson', readFileSync(join(ROOT, 'plugins/netplan-static.json'), 'utf8'));
  await page.click('#pasteImport');
  assert.match(await page.textContent('#pluginMsg'), /読み込みました/);
  assert.equal(await page.locator('.plugin').count(), 4);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.plugin >> nth=3 >> text=書き出し')]);
  assert.equal(dl.suggestedFilename(), 'example.netplan-static.json');

  await page.click('.plugin >> nth=3 >> text=＋ クリップボードに追加');
  await page.click('#save');
  await page.click('.clip-main >> nth=2');
  await page.keyboard.type('162');
  await page.enter();
  const typed = await page.lastSeq({ enterAsNewline: true });
  assert.match(typed, /addresses: \[192\.168\.1\.162\/24\]/);
  assert.match(typed, /via: 192\.168\.1\.1\n/);
  assert.match(typed, /sudo netplan apply\n$/);
  await ctx.close();
});

test('ポップアップでの「ファイルから読み込む」はタブで開き直す', async () => {
  const { ctx, page } = await open();
  await page.click('.tab[data-tab=plugins]');
  await page.click('#importFile').catch(() => {});
  assert.equal(await page.evaluate(() => window.__createdTab), 'popup.html?full=1&tab=plugins');
  await ctx.close();
});
