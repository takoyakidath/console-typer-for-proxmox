// コンソールに送られるキーイベントのテスト
//   popup.js の typeIntoNoVNC を、noVNC に似せた偽ページで実行して、届いたイベントを確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SRC } from '../../scripts/lib/paths.mjs';
import { launch, openPopupWithStub } from '../../scripts/lib/browser.mjs';

let browser, fnSource;
before(async () => {
  browser = await launch();
  const { ctx, page } = await openPopupWithStub(browser, pathToFileURL(join(SRC, 'popup.html')).href);
  fnSource = await page.evaluate(() => typeIntoNoVNC.toString());
  await ctx.close();
});
after(async () => { await browser?.close(); });

const FAKE_NOVNC = `<!doctype html><html><body>
  <div id="noVNC_container"><canvas width="100" height="100"></canvas></div>
  <script>
    window.events = [];
    const c = document.querySelector('canvas');
    for (const t of ['keydown', 'keyup']) c.addEventListener(t, (e) => events.push([t, e.key, e.code, e.shiftKey]));
  </script></body></html>`;

async function run(seq, layout = 'us', html = FAKE_NOVNC) {
  const page = await browser.newPage();
  await page.setContent(html);
  const result = await page.evaluate(async ([src, seq, layout]) => {
    const fn = new Function(`return (${src})`)();
    return fn(seq, 0, layout);
  }, [fnSource, seq, layout]);
  const events = await page.evaluate(() => window.events || []);
  await page.close();
  return { result, events, downs: events.filter((e) => e[0] === 'keydown') };
}

test('英数字: 大文字は Shift 付き', async () => {
  const { result, downs } = await run(['a', 'B', '1']);
  assert.equal(result.typed, 3);
  assert.deepEqual(downs, [
    ['keydown', 'a', 'KeyA', false],
    ['keydown', 'Shift', 'ShiftLeft', true],
    ['keydown', 'B', 'KeyB', true],
    ['keydown', '1', 'Digit1', false],
  ]);
});

test('記号: US配列と JIS配列で物理キーが変わる', async () => {
  const us = await run(['@']);
  assert.deepEqual(us.downs.at(-1), ['keydown', '@', 'Digit2', true]);
  const jis = await run(['@'], 'jis');
  assert.deepEqual(jis.downs.at(-1), ['keydown', '@', 'BracketLeft', false]);
  const jisQuote = await run(['"'], 'jis');
  assert.deepEqual(jisQuote.downs.at(-1), ['keydown', '"', 'Digit2', true]);
});

test('特殊キーと待機', async () => {
  const { downs } = await run([{ k: 'TAB' }, { w: 10 }, { k: 'ENTER' }, { k: 'BS' }, { k: 'UP' }]);
  assert.deepEqual(downs.map((d) => d[2]), ['Tab', 'Enter', 'Backspace', 'ArrowUp']);
});

test('入力できない文字はスキップして報告', async () => {
  const { result } = await run(['a', 'あ', 'b']);
  assert.equal(result.typed, 2);
  assert.deepEqual(result.skipped, ['あ']);
});

test('noVNC でないページでは何もしない', async () => {
  const { result } = await run(['a'], 'us', '<html><body><canvas></canvas></body></html>');
  assert.equal(result.found, false);
});
