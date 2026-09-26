// ============================================================
// プラグイン: JSON で定義する入力テンプレート
//   コードは含まず、{{式}} だけで値を組み立てる（リモートコード実行なし）
// ============================================================
(function (global) {
  'use strict';

  // ---------- IPv4 ----------
  function ipToInt(s) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim());
    if (!m) return null;
    const o = m.slice(1).map(Number);
    if (o.some((x) => x > 255)) return null;
    return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
  }
  const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  const maskOf = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
  const networkOf = (v) => (v.ip & maskOf(v.prefix)) >>> 0;
  const broadcastOf = (v) => (networkOf(v) | (~maskOf(v.prefix) >>> 0)) >>> 0;

  function parsePrefix(p) {
    if (!/^\d{1,2}$/.test(p)) return null;
    const n = Number(p);
    return n <= 32 ? n : null;
  }

  // "192.168.1.0/24" → {ip, prefix}。prefix省略時は defaultPrefix
  function parseCidr(s, defaultPrefix = null) {
    const [a, b] = String(s).trim().split('/');
    const ip = ipToInt(a);
    if (ip == null) return null;
    const prefix = b === undefined ? defaultPrefix : parsePrefix(b);
    if (prefix == null) return null;
    return { ip, prefix, isIp: true };
  }

  // 入力欄の値を解釈。"162" や "2.162" は base の上位オクテットで補う
  function resolveIpv4(input, base) {
    input = String(input || '').trim();
    if (!input) return { error: '未入力です' };
    let [addr, pre] = input.split('/');
    const parts = addr.split('.');
    if (parts.length > 4 || parts.some((x) => !/^\d{1,3}$/.test(x))) return { error: `IPアドレスの形式が正しくありません: ${input}` };
    if (parts.length < 4) {
      if (!base) return { error: '完全なIPアドレスを入力してください（例: 192.168.1.10/24）' };
      addr = intToIp(base.ip).split('.').slice(0, 4 - parts.length).concat(parts).join('.');
    }
    const ip = ipToInt(addr);
    if (ip == null) return { error: `IPアドレスが正しくありません: ${addr}` };
    let prefix;
    if (pre !== undefined) {
      prefix = parsePrefix(pre);
      if (prefix == null) return { error: `プレフィックスが正しくありません: /${pre}` };
    } else if (base) {
      prefix = base.prefix;
    } else {
      return { error: 'プレフィックスを付けてください（例: /24）' };
    }
    const v = { ip, prefix, isIp: true };
    if (prefix < 31 && (ip === networkOf(v) || ip === broadcastOf(v))) {
      return { value: v, warning: `${intToIp(ip)} はネットワーク／ブロードキャストアドレスです` };
    }
    return { value: v };
  }

  function toIp(v) {
    if (v && v.isIp) return v;
    const p = parseCidr(v, 32);
    if (!p) throw new Error(`"${v}" はIPアドレスではありません`);
    return p;
  }

  // ---------- 式 ----------
  const IP_FILTERS = {
    ip: (v) => intToIp(v.ip),
    prefix: (v) => String(v.prefix),
    mask: (v) => intToIp(maskOf(v.prefix)),
    network: (v) => intToIp(networkOf(v)),
    broadcast: (v) => intToIp(broadcastOf(v)),
    cidr: (v) => `${intToIp(networkOf(v))}/${v.prefix}`,
    withprefix: (v) => `${intToIp(v.ip)}/${v.prefix}`,
    host: (v, n) => {
      const k = Number(n);
      if (!Number.isInteger(k)) throw new Error(`host の引数は整数です: ${n}`);
      return intToIp((k >= 0 ? networkOf(v) + k : broadcastOf(v) + k) >>> 0);
    },
    octet: (v, n) => {
      const k = Number(n);
      if (![1, 2, 3, 4].includes(k)) throw new Error(`octet の引数は 1〜4 です: ${n}`);
      return String((v.ip >>> (8 * (4 - k))) & 255);
    },
  };
  const STR_FILTERS = {
    upper: (v) => String(v).toUpperCase(),
    lower: (v) => String(v).toLowerCase(),
    trim: (v) => String(v).trim(),
  };
  const FILTER_NAMES = [...Object.keys(IP_FILTERS), ...Object.keys(STR_FILTERS)];

  const asString = (v) => (v && v.isIp ? intToIp(v.ip) : String(v ?? ''));

  function evalChain(src, scope) {
    const [head, ...filters] = src.split('|').map((x) => x.trim());
    if (/^".*"$/.test(head)) return head.slice(1, -1); // "文字列"
    if (!/^[A-Za-z_]\w*$/.test(head)) throw new Error(`式が正しくありません: {{${src}}}`);
    if (!(head in scope)) throw new Error(`未定義の名前: ${head}`);
    let v = scope[head];
    if (v === '' || v == null) return '';
    for (const f of filters) {
      const i = f.indexOf(':');
      const name = (i < 0 ? f : f.slice(0, i)).trim();
      let arg = i < 0 ? undefined : f.slice(i + 1).trim();
      if (arg && arg.startsWith('$')) arg = asString(scope[arg.slice(1)]);
      if (IP_FILTERS[name]) v = IP_FILTERS[name](toIp(v), arg);
      else if (STR_FILTERS[name]) v = STR_FILTERS[name](asString(v), arg);
      else throw new Error(`不明なフィルタ: ${name}（使えるもの: ${FILTER_NAMES.join(', ')}）`);
    }
    return v;
  }

  // "a ?? b|host:1" … 左が空なら右
  function evalExpr(expr, scope) {
    for (const alt of expr.split('??')) {
      const v = evalChain(alt.trim(), scope);
      if (v !== '' && v != null) return v;
    }
    return '';
  }

  function render(tpl, scope) {
    return String(tpl ?? '').replace(/\{\{([^{}]*)\}\}/g, (_, e) => asString(evalExpr(e, scope)));
  }

  // ---------- 実行 ----------
  // plugin: 定義, settings: 保存値, inputVals: 入力欄の値
  // → { values: [{label, value, secret}] | null, text: string | null, errors: {inputId: msg}, warnings: [], error: string }
  function compute(plugin, settings, inputVals) {
    const scope = {};
    const errors = {};
    const warnings = [];
    for (const s of plugin.settings || []) {
      const v = settings && settings[s.id] != null ? settings[s.id] : s.default ?? '';
      scope[s.id] = String(v).trim();
    }
    for (const inp of plugin.inputs || []) {
      const raw = (inputVals && inputVals[inp.id]) ?? '';
      if ((inp.type || 'text') === 'ipv4') {
        let base = null;
        if (inp.base) {
          base = parseCidr(scope[inp.base] || '', null);
          if (!base && scope[inp.base]) { errors[inp.id] = `設定「${inp.base}」がCIDR形式ではありません（例: 192.168.1.0/24）`; continue; }
        }
        const r = resolveIpv4(raw, base);
        if (r.error) { errors[inp.id] = r.error; continue; }
        if (r.warning) warnings.push(r.warning);
        scope[inp.id] = r.value;
      } else {
        if (!String(raw).trim() && !inp.optional) { errors[inp.id] = '未入力です'; continue; }
        scope[inp.id] = String(raw).trim();
      }
    }
    if (Object.keys(errors).length) return { errors, warnings };
    try {
      if (Array.isArray(plugin.fields)) {
        return {
          errors, warnings,
          values: plugin.fields.map((f) => ({ label: f.label, value: render(f.value, scope), secret: !!f.secret })),
        };
      }
      return { errors, warnings, text: render(plugin.text, scope) };
    } catch (e) {
      return { errors, warnings, error: e.message };
    }
  }

  // ---------- 検証 ----------
  function validate(p) {
    const errs = [];
    if (!p || typeof p !== 'object' || Array.isArray(p)) return ['JSONのトップはオブジェクト { ... } にしてください'];
    if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(p.id)) errs.push('id は英小文字・数字・「. _ -」で2〜64文字にしてください');
    if (typeof p.name !== 'string' || !p.name.trim()) errs.push('name がありません');
    const hasFields = Array.isArray(p.fields);
    const hasText = typeof p.text === 'string';
    if (hasFields === hasText) errs.push('fields（配列）か text（文字列）のどちらか一方を指定してください');
    const ids = new Set();
    for (const key of ['settings', 'inputs']) {
      if (p[key] === undefined) continue;
      if (!Array.isArray(p[key])) { errs.push(`${key} は配列にしてください`); continue; }
      p[key].forEach((x, i) => {
        if (!x || typeof x.id !== 'string' || !/^[A-Za-z_]\w*$/.test(x.id)) errs.push(`${key}[${i}].id は英数字と _ で指定してください`);
        else if (ids.has(x.id)) errs.push(`id「${x.id}」が重複しています`);
        else ids.add(x.id);
        if (!x || typeof x.label !== 'string') errs.push(`${key}[${i}].label がありません`);
        if (key === 'inputs' && x && x.type && !['text', 'ipv4'].includes(x.type)) errs.push(`inputs[${i}].type は "text" か "ipv4" です`);
        if (key === 'inputs' && x && x.base && !(p.settings || []).some((s) => s.id === x.base)) errs.push(`inputs[${i}].base「${x.base}」という設定がありません`);
      });
    }
    if (hasFields) {
      p.fields.forEach((f, i) => {
        if (!f || typeof f.label !== 'string' || typeof f.value !== 'string') errs.push(`fields[${i}] には label と value（文字列）が必要です`);
      });
    }
    if (errs.length) return errs;

    // 試しに計算して式の誤りを見つける
    const sample = {};
    for (const inp of p.inputs || []) sample[inp.id] = (inp.type || 'text') === 'ipv4' ? '192.0.2.10/24' : 'sample';
    const settings = {};
    for (const s of p.settings || []) settings[s.id] = s.default ?? '';
    const baseErr = (p.inputs || []).find((inp) => inp.base && settings[inp.base] && !parseCidr(settings[inp.base]));
    if (baseErr) return [`設定「${baseErr.base}」の default がCIDR形式ではありません`];
    const r = compute(p, settings, sample);
    if (r.error) errs.push('式のエラー: ' + r.error);
    return errs;
  }

  // ---------- 標準プラグイン ----------
  const BUILTIN = [
    {
      id: 'builtin.ubuntu-ipv4',
      name: 'Ubuntu インストーラー: IPv4設定',
      version: '1.0.0',
      author: 'Console Typer',
      description: '「Edit IPv4 configuration」画面用。IPを入れるだけで Subnet・Gateway を自動で計算します。Subnet 欄にカーソルを置いてから実行してください。',
      settings: [
        { id: 'network', label: 'ネットワーク（CIDR）', default: '192.168.1.0/24', placeholder: '192.168.1.0/24' },
        { id: 'gateway', label: 'ゲートウェイ（空欄=.1）', default: '', placeholder: '空欄 = 自動' },
        { id: 'dns', label: 'DNS（カンマ区切り）', default: '1.1.1.1,8.8.8.8' },
        { id: 'search', label: 'Search domains', default: '' },
      ],
      inputs: [
        { id: 'ip', type: 'ipv4', base: 'network', label: 'IPアドレス', placeholder: '162 / 192.168.1.162 / 10.0.0.5/8' },
      ],
      fields: [
        { label: 'Subnet', value: '{{ip|cidr}}' },
        { label: 'Address', value: '{{ip|ip}}' },
        { label: 'Gateway', value: '{{gateway ?? ip|host:1}}' },
        { label: 'Name servers', value: '{{dns}}' },
        { label: 'Search domains', value: '{{search}}' },
      ],
    },
    {
      id: 'builtin.ubuntu-profile',
      name: 'Ubuntu インストーラー: プロフィール',
      version: '1.0.0',
      author: 'Console Typer',
      description: '「Profile configuration」画面用。Your name 欄にカーソルを置いてから実行してください。',
      settings: [
        { id: 'fullname', label: 'Your name', default: '' },
        { id: 'username', label: 'Username', default: '' },
        { id: 'password', label: 'Password', default: '', secret: true },
      ],
      inputs: [
        { id: 'hostname', type: 'text', label: 'サーバー名', placeholder: 'srv-web01' },
      ],
      fields: [
        { label: 'Your name', value: '{{fullname}}' },
        { label: 'Server name', value: '{{hostname}}' },
        { label: 'Username', value: '{{username}}' },
        { label: 'Password', value: '{{password}}', secret: true },
        { label: 'Confirm', value: '{{password}}', secret: true },
      ],
    },
    {
      id: 'builtin.linux-ip-cmd',
      name: 'Linux: ip コマンドで一時的にIPを設定',
      version: '1.0.0',
      author: 'Console Typer',
      description: 'ログイン済みのシェルで ip コマンドを実行します。再起動すると元に戻ります。',
      settings: [
        { id: 'iface', label: 'インターフェース', default: 'ens18' },
        { id: 'network', label: 'ネットワーク（CIDR）', default: '192.168.1.0/24' },
        { id: 'gateway', label: 'ゲートウェイ（空欄=.1）', default: '' },
      ],
      inputs: [
        { id: 'ip', type: 'ipv4', base: 'network', label: 'IPアドレス', placeholder: '162 / 192.168.1.162' },
      ],
      text: 'sudo ip addr add {{ip|withprefix}} dev {{iface}}\nsudo ip link set {{iface}} up\nsudo ip route add default via {{gateway ?? ip|host:1}}\n',
    },
  ];

  global.PT = { BUILTIN, compute, validate, render, resolveIpv4, parseCidr, FILTER_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
