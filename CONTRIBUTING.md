# コントリビュートの方法

## 不具合の報告

Issue の「不具合の報告」テンプレートを使ってください。
Proxmox VE のバージョン、ゲストOSと画面、拡張機能の「配列」の設定があると原因を探しやすくなります。
パスワードなどの機密情報は貼らないでください。

## プラグインを追加する

1. `plugins/` に JSON ファイルを追加（書き方は [docs/PLUGINS.md](docs/PLUGINS.md)）
   - `id` は `作者名.内容` のような重複しにくい名前に（`builtin.` は使えません）
   - `description` に「どの画面で、どこにカーソルを置いて使うか」を書く
2. 確認する
   ```sh
   npm run check:plugin -- plugins/your-plugin.json 162
   npm test
   ```
3. `plugins/README.md` の表に1行追加して Pull Request を送る

## コードを変更する

```sh
npm install
npx playwright install chromium
npm test && npm run test:e2e
```

- 拡張機能本体は `src/` です。ビルドなしで `chrome://extensions` から読み込めます
- ページ内で実行される `typeIntoNoVNC`（`src/popup.js` の末尾）は、ページに注入されるので外の変数や関数を参照できません
- プラグインは JSON のデータだけにしてください。Chrome ウェブストアの規約上、外部から読み込んだコードを実行する仕組みは入れられません
- UI を変えたら `npm run assets:screenshots` でストア用画像を更新してください
- `CHANGELOG.md` の「Unreleased」に変更を追記してください
