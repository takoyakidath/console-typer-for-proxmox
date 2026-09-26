// 拡張機能のアイコン（16/32/48/128px）を src/icons/ に作る
//   npm run assets:icons
//   デザインは下の SVG を編集してください（128px は 96px の絵 + 16px の余白がストアの推奨）
import { join } from 'node:path';
import { SRC } from './lib/paths.mjs';
import { launch } from './lib/browser.mjs';

const b = await launch();
// 96x96 artwork inside 128 canvas (16px padding). Small sizes use full bleed.
const art = (pad, size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${pad} ${pad}) scale(${(size - 2 * pad) / 96})">
    <rect x="0" y="0" width="96" height="96" rx="20" fill="#E57000"/>
    <rect x="12" y="14" width="72" height="68" rx="12" fill="#1F1F1F"/>
    <path d="M27 36 L42 48 L27 60" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="48" y="54" width="26" height="8" rx="3" fill="#FFB36B"/>
  </g>
</svg>`;
const p = await b.newPage();
for (const [size, pad] of [[16, 0], [32, 1], [48, 2], [128, 16]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;background:transparent">${art(pad, size)}</body></html>`);
  await p.screenshot({ path: join(SRC, `icons/icon${size}.png`), omitBackground: true });
}
await b.close();
console.log('✔ src/icons/ にアイコンを書き出しました');
