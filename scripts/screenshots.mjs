// Chrome Web Store 用の画像（スクリーンショット 1280x800 ×3、プロモタイル 440x280）を store/ に作る
//   npm run assets:screenshots
//   実際の src/popup.html を開いて撮影するので、UIを変えたら作り直してください
import fs from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SRC, STORE } from './lib/paths.mjs';
import { launch, openPopupWithStub } from './lib/browser.mjs';

const POPUP_URL = pathToFileURL(join(SRC, 'popup.html')).href;
const b = await launch();

async function popup(setup) {
  const { ctx, page: p } = await openPopupWithStub(b, POPUP_URL, { viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await setup(p);
  const h = await p.evaluate(() => document.body.scrollHeight);
  const buf = await p.screenshot({ clip: { x: 0, y: 0, width: 420, height: h } });
  await ctx.close();
  return { src: 'data:image/png;base64,' + buf.toString('base64'), h };
}

const list = await popup(async (p) => {
  // 例を1つ追加表示
  await p.selectOption('#newType', 'text'); await p.click('#add');
  await p.fill('.name-input', 'apt 更新'); await p.fill('#editorBody textarea', 'sudo apt update && sudo apt -y upgrade\n');
  await p.click('#save');
  await p.evaluate(() => { document.getElementById('status').textContent = '完了: Ubuntu インストーラー: IPv4設定'; });
});
const ask = await popup(async (p) => { await p.click('.clip-main >> nth=0'); await p.fill('#askBody input', '162'); await p.dispatchEvent('#askBody input', 'input'); await p.evaluate(() => document.activeElement.blur()); });
const plug = await popup(async (p) => {
  await p.click('.tab[data-tab=plugins]');
  await p.click('#pasteToggle');
  await p.fill('#pasteJson', fs.readFileSync(join(ROOT, 'plugins/netplan-static.json'), 'utf8'));
  await p.click('#pasteImport');
  await p.click('#pasteToggle');
  await p.evaluate(() => { document.getElementById('pluginList').style.maxHeight = '335px'; document.querySelector('#tab-plugins .hint').remove(); });
});
const icon = 'data:image/png;base64,' + fs.readFileSync(join(SRC, 'icons/icon128.png')).toString('base64');

const consoleMock = (lines) => `
  <div class="console">
    <div class="bar"><span></span><span></span><span></span><em>VM 101 — Console</em></div>
    <pre>${lines}</pre>
  </div>`;

const shot = (title, sub, pop, consoleLines) => `
<html><head><meta charset="utf-8"><style>
  body{margin:0;width:1280px;height:800px;font-family:"Noto Sans CJK JP","Noto Sans JP",system-ui,sans-serif;
       background:linear-gradient(135deg,#fff6ee 0%,#ffe2c7 100%);display:flex;align-items:center;overflow:hidden}
  .left{width:470px;padding-left:64px;flex:none}
  .brand{display:flex;align-items:center;gap:12px;color:#6b4a2b;font-size:20px;font-weight:600;margin-bottom:36px}
  .brand img{width:48px;height:48px}
  h1{font-size:40px;line-height:1.3;margin:0 0 20px;color:#222}
  p{font-size:19px;line-height:1.7;color:#555;margin:0}
  .right{flex:1;position:relative;height:800px}
  .console{position:absolute;left:30px;top:150px;width:560px;height:500px;background:#161616;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden}
  .bar{height:34px;background:#2a2a2a;display:flex;align-items:center;gap:7px;padding:0 14px}
  .bar span{width:11px;height:11px;border-radius:50%;background:#555}
  .bar em{color:#aaa;font-style:normal;font-size:13px;margin-left:10px;font-family:system-ui}
  pre{margin:0;padding:26px 28px;color:#ddd;font:17px/1.9 "DejaVu Sans Mono",ui-monospace,monospace}
  .hl{background:#fff;color:#111;padding:0 4px}
  .pop{position:absolute;right:36px;top:${Math.max(40, 400 - pop.h * 0.55)}px;width:420px;border-radius:10px;
       box-shadow:0 24px 60px rgba(0,0,0,.30);overflow:hidden;background:#fff;transform:scale(1.1);transform-origin:top right}
  .pop img{display:block;width:420px}
</style></head><body>
  <div class="left">
    <div class="brand"><img src="${icon}">Console Typer for Proxmox VE</div>
    <h1>${title}</h1><p>${sub}</p>
  </div>
  <div class="right">${consoleMock(consoleLines)}<div class="pop"><img src="${pop.src}"></div></div>
</body></html>`;

const netLines = `Edit ens18 IPv4 configuration

      Subnet: <span class="hl">192.168.1.0/24    </span>
     Address: <span class="hl">192.168.1.162     </span>
     Gateway: <span class="hl">192.168.1.1       </span>
 Nameservers: <span class="hl">1.1.1.1,8.8.8.8   </span>`;
const profLines = `Profile configuration

   Your name: <span class="hl">Admin             </span>
 Server name: <span class="hl">srv-web01         </span>
    Username: <span class="hl">admin             </span>
    Password: <span class="hl">***********       </span>
     Confirm: <span class="hl">***********       </span>`;
const shellLines = `admin@srv-web01:~$ sudo apt update && sudo
apt -y upgrade
Hit:1 http://archive.example.org stable InRelease
Reading package lists... Done
Building dependency tree... Done
All packages are up to date.
admin@srv-web01:~$ <span class="hl"> </span>`;

const netplanLines = `$ sudo tee /etc/netplan/99-static.yaml &lt;&lt;'EOF'
network:
  version: 2
  ethernets:
    ens18:
      addresses: [192.168.1.162/24]
      routes:
        - to: default
          via: 192.168.1.1
EOF
$ sudo netplan apply`;
const pages = [
  ['01-list.png', 'よく使う入力を<br>ワンクリックで', 'IP設定・ユーザー名・コマンドを保存しておき、<br>コンソールへキーボード入力として送ります。<br>コピー＆ペーストできないnoVNCでも使えます。', list, shellLines],
  ['02-ask.png', '「162」と入れるだけで<br>IP設定を自動計算', 'ネットワークを登録しておけば、<br>Subnet・Gateway は自動で計算して入力。<br>前回の値も覚えています。', ask, netLines],
  ['03-plugins.png', 'プラグインで<br>自由に拡張', '入力のひな形を JSON で追加・共有。<br>netplan の設定やインストーラーの画面など、<br>環境に合わせて増やせます。', plug, netplanLines],
];
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
fs.mkdirSync(STORE, { recursive: true });
for (const [name, t, s, pop, lines] of pages) {
  await p.setContent(shot(t, s.replace(/<code>/g, '<code style="background:#fff;padding:1px 6px;border-radius:4px;font-size:18px">'), pop, lines));
  await p.waitForTimeout(200);
  await p.screenshot({ path: join(STORE, `screenshot-${name}`) });
}
// small promo tile 440x280
await p.setViewportSize({ width: 440, height: 280 });
await p.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0;width:440px;height:280px;background:linear-gradient(135deg,#E57000,#C45400);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Noto Sans CJK JP',system-ui,sans-serif;color:#fff">
  <img src="${icon}" style="width:96px;height:96px;filter:drop-shadow(0 6px 12px rgba(0,0,0,.25))">
  <div style="font-size:30px;font-weight:700;margin-top:10px;letter-spacing:.3px">Console Typer</div>
  <div style="font-size:15px;opacity:.9;margin-top:2px">for Proxmox VE noVNC</div>
</body></html>`);
await p.screenshot({ path: join(STORE, 'promo-small-440x280.png') });
fs.copyFileSync(join(SRC, 'icons/icon128.png'), join(STORE, 'icon128.png'));
await b.close();
console.log('✔ store/ に画像を書き出しました');
