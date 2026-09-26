// Playwright の Chromium を起動する共通処理
//   事前に: npx playwright install chromium
//   別の Chrome/Chromium を使う場合: CHROME_PATH=/path/to/chrome npm run ...
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executablePath = process.env.CHROME_PATH || undefined;

export function launch() {
  return chromium.launch({ executablePath });
}

/** 拡張機能を読み込んだ状態の Chromium を起動する */
export async function launchWithExtension(extDir) {
  const profile = mkdtempSync(join(tmpdir(), 'ct-profile-'));
  // 拡張機能は headless shell では動かないため、フル版 Chromium（channel: 'chromium'）を使う
  const ctx = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    headless: true,
    args: ['--headless=new', `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  return ctx;
}

/**
 * chrome.* API の代わりを入れた状態で popup.html を開く（拡張機能として読み込まずにUIを試す用）
 * window.__lastSeq に最後に送信したキー列、window.__store にストレージの中身が入る
 */
export async function openPopupWithStub(browser, popupUrl, { initialStorage = {}, viewport = { width: 420, height: 700 }, deviceScaleFactor = 1 } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.addInitScript((init) => {
    const s = JSON.parse(JSON.stringify(init));
    window.__store = s;
    window.chrome = {
      storage: {
        local: {
          get: (_keys, cb) => cb(JSON.parse(JSON.stringify(s))),
          set: (o) => Object.assign(s, JSON.parse(JSON.stringify(o))),
        },
      },
      runtime: { onMessage: { addListener() {} }, getURL: (x) => x, sendMessage: async () => {} },
      tabs: { query: async () => [{ id: 1 }], create: (o) => { window.__createdTab = o.url; } },
      scripting: {
        executeScript: async ({ args }) => {
          window.__lastSeq = args && args[0];
          return [{ result: { found: true, typed: (args && args[0] ? args[0].length : 0), aborted: false, skipped: [] } }];
        },
      },
    };
  }, initialStorage);
  await page.goto(popupUrl);
  return { ctx, page };
}

/** 送信されたキー列を読みやすい文字列にする（特殊キーは {TAB} など） */
export function formatSeq(seq, { enterAsNewline = false } = {}) {
  return (seq || [])
    .map((x) => (typeof x === 'string' ? x : x.k ? (enterAsNewline && x.k === 'ENTER' ? '\n' : `{${x.k}}`) : `{WAIT ${x.w}}`))
    .join('');
}
