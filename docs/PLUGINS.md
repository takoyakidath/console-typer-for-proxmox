# プラグインの書き方

プラグインは、入力内容のひな形を **JSON** で書いたものです。
「プラグイン」タブの「ファイルから読み込む」または「JSONを貼り付け」で追加できます。
プログラムは書けません（ストアの規約上、外部のコードは実行できないため）。値の組み立ては `{{ }}` の式だけで行います。

## 全体の形

```json
{
  "id": "my.ubuntu-ipv4",
  "name": "表示名",
  "version": "1.0.0",
  "author": "作者名",
  "description": "説明（どの画面で、どこにカーソルを置いて使うか）",

  "settings": [ ... ],   // 保存しておく値（項目ごとに編集画面で変更できる）
  "inputs":   [ ... ],   // クリックするたびに聞く値

  "fields": [ ... ]      // Tab で区切って入力する欄のリスト
  // または
  "text": "..."          // 自由なテキスト（特殊キー {ENTER} なども使える）
}
```

- `id`: 英小文字・数字・`.` `_` `-`（2〜64文字）。`builtin.` で始まるものは使えません。同じ id を読み込むと上書き（更新）されます
- `fields` と `text` は **どちらか一方** を指定します

## settings（保存しておく値）

```json
{ "id": "network", "label": "ネットワーク（CIDR）", "default": "192.168.1.0/24", "placeholder": "...", "secret": false }
```
- `secret: true` にすると、編集画面で伏せ字になります（パスワード用）

## inputs（クリックのたびに聞く値）

```json
{ "id": "ip", "type": "ipv4", "base": "network", "label": "IPアドレス", "placeholder": "162" }
```
- `type`: `"text"`（そのままの文字）または `"ipv4"`（IPアドレスとして計算に使える）
- `base`（ipv4のみ）: settings の id を指定すると、その CIDR を元に省略入力を補います
  - `162` → `192.168.1.162/24`
  - `2.162` → `192.168.2.162/24`
  - `192.168.5.9` → `/24` を補う
  - `10.0.0.5/8` → そのまま
- `optional: true`（textのみ）: 空欄でも入力できるようにする
- 前回の値は項目ごとに記憶されます

## fields（Tabで区切って入力する欄）

```json
{ "label": "Gateway", "value": "{{gateway ?? ip|host:1}}", "secret": false }
```
上から順に入力し、欄と欄の間で Tab を押します。`secret: true` の欄はプレビューで伏せ字になります。

## text（自由なテキスト）

改行は Enter になります。特殊キーも使えます:
`{TAB}` `{ENTER}` `{ESC}` `{BS}` `{DEL}` `{UP}` `{DOWN}` `{LEFT}` `{RIGHT}` `{HOME}` `{END}` `{WAIT 500}`

## 式 `{{ }}`

| 書き方 | 意味 |
|---|---|
| `{{name}}` | settings / inputs の値 |
| `{{a ?? b}}` | a が空なら b |
| `{{"文字列"}}` | 固定の文字列（`??` の右側で使う） |
| `{{ip\|フィルタ}}` | フィルタで変換（つなげて書ける） |

### IPアドレス用フィルタ（例: ip = 192.168.1.162/24）

| フィルタ | 結果 |
|---|---|
| `ip` | 192.168.1.162 |
| `prefix` | 24 |
| `mask` | 255.255.255.0 |
| `network` | 192.168.1.0 |
| `broadcast` | 192.168.1.255 |
| `cidr` | 192.168.1.0/24 |
| `withprefix` | 192.168.1.162/24 |
| `host:1` | 192.168.1.1（ネットワークの先頭から1番目） |
| `host:-1` | 192.168.1.254（最後から1番目） |
| `octet:4` | 162（4番目の数字） |

`{{ip}}` とだけ書くと `ip` と同じになります。settings の文字列（`"192.168.1.0/24"` など）にも使えます。

### 文字列用フィルタ
`upper`（大文字）/ `lower`（小文字）/ `trim`（前後の空白を削除）

フィルタの引数に `$名前` と書くと、その値を使えます（例: `{{ip|host:$gwhost}}`）。

## 例

リポジトリの [`plugins/`](../plugins/) フォルダ（拡張機能の zip では `examples/`）に例があります。たとえば `netplan-static.json` は、netplan の設定ファイルを書き込んで適用するプラグインです。
標準プラグインの中身は、「プラグイン」タブの「書き出し」で JSON として保存して確認できます。

```json
{
  "id": "my.ubuntu-ipv4-gw254",
  "name": "Ubuntu IPv4（Gatewayは .254）",
  "version": "1.0.0",
  "settings": [
    { "id": "network", "label": "ネットワーク", "default": "10.0.0.0/24" },
    { "id": "dns", "label": "DNS", "default": "10.0.0.53" }
  ],
  "inputs": [
    { "id": "ip", "type": "ipv4", "base": "network", "label": "IPアドレス" }
  ],
  "fields": [
    { "label": "Subnet", "value": "{{ip|cidr}}" },
    { "label": "Address", "value": "{{ip|ip}}" },
    { "label": "Gateway", "value": "{{ip|host:-1}}" },
    { "label": "Name servers", "value": "{{dns}}" },
    { "label": "Search domains", "value": "" }
  ]
}
```
