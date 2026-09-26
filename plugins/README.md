# プラグイン集

ここにある JSON は、拡張機能の「プラグイン」タブで読み込めるプラグインの例です。
書き方は [docs/PLUGINS.md](../docs/PLUGINS.md) を参照してください。

| ファイル | 内容 |
|---|---|
| [netplan-static.json](netplan-static.json) | Ubuntu: netplan の設定ファイルを書き込んで `netplan apply` |
| [ubuntu-ipv4-gw254.json](ubuntu-ipv4-gw254.json) | Ubuntu インストーラーの IPv4 画面（Gateway を `.254` に） |
| [windows-netsh.json](windows-netsh.json) | Windows: `netsh` で固定IPとDNSを設定 |

標準プラグイン（拡張機能に組み込み済み）は [src/plugins.js](../src/plugins.js) の `BUILTIN` にあります。

## 使い方

1. 使いたい JSON を開いて「Raw」から中身をコピー
2. 拡張機能の「プラグイン」タブ →「JSONを貼り付け」→ 貼り付けて「読み込む」

## 追加したいとき

`plugins/` に JSON を追加して Pull Request を送ってください。
`npm test` を実行すると、このフォルダのすべての JSON が自動でチェックされます。
1つだけ確認したいときは次のコマンドを使います。

```sh
npm run check:plugin -- plugins/your-plugin.json
```
