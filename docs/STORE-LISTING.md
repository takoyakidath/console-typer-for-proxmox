# Chrome Web Store 申請メモ — Console Typer for Proxmox VE

ダッシュボードの各欄に、以下をそのまま貼り付けて使えます。

---

## 1. パッケージ
- アップロードするファイル: `npm run build` で作られる `dist/console-typer-for-proxmox-<バージョン>.zip`
  （または GitHub Releases に添付された zip。manifest.json が zip の直下にある形）

## 2. ストアの掲載情報（Store listing）

**言語**: 日本語（英語の説明も下にあるので、「言語を追加」で English も登録可）

**カテゴリ**: 開発者ツール（Developer Tools）

**説明（日本語）**
```
Proxmox VE の noVNC コンソールに、保存しておいたテキストをキーボード入力として自動で打ち込む拡張機能です。
コピー＆ペーストが使えない VM のコンソール（OS インストーラー、ログイン画面、BIOS 前のシェルなど）で、長いコマンドや IP 設定を手で打つ手間をなくします。

■ 主な機能
・クリップボード：よく使う入力を保存し、ワンクリックでコンソールに入力
・項目リスト：各欄の間で Tab を押しながら、フォーム全体をまとめて入力
　（例：OS インストーラーのネットワーク設定、ユーザー作成画面）
・IP自動計算：「162」と入れるだけで、Subnet・Address・Gateway を自動で計算して入力
・プラグイン：入力のひな形を JSON で追加・共有できます（Ubuntu インストーラー用などを標準搭載）
・毎回入力：「192.168.1.{?}」のように書いておくと、クリック時に最後の番号だけ入力。前回の値も記憶
・パスワード確認欄に同じ値を自動で入力
・特殊キー：{TAB} {ENTER} {ESC} {BS} {UP} {DOWN} {WAIT 500} など
・キーボード配列（US / JIS）と入力間隔を設定可能
・入力中いつでも停止

■ 使い方
1. Proxmox VE で VM の「Console」（noVNC）を開く
2. 入力したい欄にカーソルを合わせる
3. 拡張機能のアイコンを開き、保存した項目をクリック

■ プライバシー
入力内容はお使いの PC の中（chrome.storage.local）にだけ保存され、外部には一切送信されません。

■ 注意
・対応しているのは ASCII 文字（英数字・記号・スペース・改行・タブ）です
・LXC コンテナなどの xterm.js コンソールは対象外です
・保存したデータは暗号化されません。共用 PC では機密情報の保存に注意してください

Proxmox は Proxmox Server Solutions GmbH の登録商標です。本拡張機能は同社とは関係のない非公式ツールです。
```

**Description (English)**
```
Type saved text into the Proxmox VE noVNC console as real keystrokes.
No more typing long commands or network settings by hand in VM consoles where copy & paste doesn't work (OS installers, login prompts, rescue shells).

FEATURES
- Snippets: save frequently used input and send it to the console with one click
- Field lists: fill whole forms by pressing Tab between fields (e.g. installer network / user setup screens)
- Automatic IP math: type just "162" and Subnet, Address and Gateway are calculated for you
- Plugins: add and share input templates as JSON (Ubuntu installer templates included)
- Ask each time: write "192.168.1.{?}" and enter only the last octet when you click; the previous value is remembered
- "Same as above" for password confirmation fields
- Special keys: {TAB} {ENTER} {ESC} {BS} {UP} {DOWN} {WAIT 500} and more
- US / JIS keyboard layouts and adjustable typing delay
- Stop at any time

HOW TO USE
1. Open a VM's Console (noVNC) in Proxmox VE
2. Put the cursor in the field where typing should start
3. Open the extension and click a saved snippet

PRIVACY
Everything is stored only on your computer (chrome.storage.local). Nothing is sent anywhere.

NOTES
- ASCII characters only (letters, digits, symbols, space, newline, tab)
- xterm.js consoles (e.g. LXC shells) are not supported
- Stored data is not encrypted; be careful with secrets on shared computers

Proxmox is a registered trademark of Proxmox Server Solutions GmbH. This is an unofficial tool, not affiliated with Proxmox Server Solutions GmbH.
```

**画像**
画像はすべて `store/` にあります（`npm run assets` で再生成できます）。
- ストアアイコン: `store/icon128.png`
- スクリーンショット（1280×800）: `store/screenshot-01-list.png` / `store/screenshot-02-ask.png` / `store/screenshot-03-plugins.png`
- 小さいプロモーション タイル（440×280）: `store/promo-small-440x280.png`
- マーキー プロモーション タイル: 不要（任意）

## 3. プライバシーへの取り組み（Privacy practices）

**単一用途の説明（Single purpose）**
```
Proxmox VE の noVNC コンソールに、利用者が保存・入力したテキストをキーボード入力として送信すること。
```

**権限が必要な理由**
| 権限 | 理由（そのまま貼り付け可） |
|---|---|
| activeTab | 利用者が拡張機能のボタンを押したときだけ、表示中の Proxmox VE コンソールのタブにアクセスしてキー入力を送るために使用します。 |
| scripting | 表示中のタブ（noVNC コンソールのフレームを含む）にキーボードイベントを送信するスクリプトを注入するために使用します。 |
| storage | 利用者が保存した入力内容と設定（キーボード配列・入力間隔）を、利用者の PC 内に保存するために使用します。 |

**リモートコードの使用**: いいえ（No, I am not using remote code）
（プラグインは JSON のデータだけで、JavaScript は含まず実行もしません）

**データの使用**
- 収集するデータの種類: すべてチェックなし
  （入力内容は端末内に保存するだけで、開発者や外部に送信しないため「収集」に当たりません）
- 下の3つの宣言にはすべてチェック:
  - 承認されている用途以外で、ユーザーデータを第三者に販売または譲渡しない
  - 単一用途と関係のない目的で、ユーザーデータを使用または譲渡しない
  - 信用力の判断や融資の目的で、ユーザーデータを使用または譲渡しない

**プライバシーポリシーの URL**
`docs/privacy.html` を GitHub Pages で公開し、その URL を入力します。
リポジトリの Settings → Pages →「Deploy from a branch」→ `main` / `/docs` を選ぶと、
`https://<ユーザー名>.github.io/<リポジトリ名>/privacy.html` になります。

## 4. 配布（Distribution）
- 料金: 無料
- 公開範囲: 公開（Public）
  - 知っている人だけに配りたい場合は「限定公開（Unlisted）」も選べます
- 地域: すべての地域
