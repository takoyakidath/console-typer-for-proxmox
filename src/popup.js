const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const progressEl = $('progress');
const params = new URLSearchParams(location.search);
const isFull = params.has('full');
if (isFull) document.body.classList.add('full');

// ============================================================
// 状態
// ============================================================
let clips = [];
let userPlugins = [];
let lastVars = {};
let editing = null; // { i: number (-1=新規), d: draft }
let asking = null;  // { c, spec, inputs }
let sending = false;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const saveClips = () => chrome.storage.local.set({ clips });
const savePlugins = () => chrome.storage.local.set({ plugins: userPlugins });
function saveSettings() {
  chrome.storage.local.set({
    text: $('text').value,
    delay: Number($('delay').value) || 0,
    layout: $('layout').value,
    trailingEnter: $('trailingEnter').checked,
  });
}

const allPlugins = () => [...PT.BUILTIN.map((p) => ({ ...p, builtin: true })), ...userPlugins];
const findPlugin = (id) => allPlugins().find((p) => p.id === id);

// ============================================================
// ひな形
// ============================================================
const PRESETS = {
  text: () => ({ type: 'text', name: '新しいテキスト', text: '' }),
  fields: () => ({
    type: 'fields', name: '新しい項目リスト', clearFirst: false,
    fields: [{ label: '項目1', value: '' }, { label: '項目2', value: '' }],
  }),
};

function clipFromPlugin(p) {
  return {
    type: 'plugin', plugin: p.id, name: p.name, clearFirst: false,
    settings: Object.fromEntries((p.settings || []).map((s) => [s.id, s.default ?? ''])),
  };
}

function seedClips() {
  return ['builtin.ubuntu-ipv4', 'builtin.ubuntu-profile'].map((id) => clipFromPlugin(findPlugin(id)));
}

// ============================================================
// 読み込み
// ============================================================
chrome.storage.local.get(['clips', 'plugins', 'text', 'delay', 'layout', 'trailingEnter', 'tab', 'lastVars'], (v) => {
  if (v.text != null) $('text').value = v.text;
  if (v.delay != null) $('delay').value = v.delay;
  if (v.layout) $('layout').value = v.layout;
  $('trailingEnter').checked = !!v.trailingEnter;
  lastVars = v.lastVars || {};
  userPlugins = Array.isArray(v.plugins) ? v.plugins : [];
  if (Array.isArray(v.clips)) {
    clips = v.clips;
  } else {
    clips = seedClips().map((c) => ({ ...c, id: newId() }));
    saveClips();
  }
  populateNewType();
  showTab(params.get('tab') || v.tab || 'clips');
  renderList();
  renderPlugins();
});

['text', 'delay', 'layout'].forEach((id) => $(id).addEventListener('input', saveSettings));
$('trailingEnter').addEventListener('change', saveSettings);

// ============================================================
// タブ
// ============================================================
function showTab(name) {
  if (!['clips', 'direct', 'plugins'].includes(name)) name = 'clips';
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('tab-clips').hidden = name !== 'clips';
  $('tab-direct').hidden = name !== 'direct';
  $('tab-plugins').hidden = name !== 'plugins';
  chrome.storage.local.set({ tab: name });
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ============================================================
// DOMヘルパー
// ============================================================
function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  }
  for (const c of [].concat(children)) if (c != null) e.append(c);
  return e;
}

// ============================================================
// クリップ一覧
// ============================================================
function populateNewType() {
  const sel = $('newType');
  const keep = sel.value;
  sel.replaceChildren(
    el('optgroup', { label: 'プラグイン' },
      allPlugins().map((p) => el('option', { value: 'plugin:' + p.id, textContent: p.name }))),
    el('optgroup', { label: '基本' }, [
      el('option', { value: 'fields', textContent: '項目リスト（Tab区切り）' }),
      el('option', { value: 'text', textContent: 'テキスト' }),
    ]),
  );
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

function preview(c) {
  if (c.type === 'text') return c.text.replace(/\n/g, '⏎') || '（空）';
  if (c.type === 'plugin') {
    const p = findPlugin(c.plugin);
    if (!p) return `⚠ プラグイン「${c.plugin}」が見つかりません`;
    const vals = (p.settings || [])
      .filter((s) => !s.secret)
      .map((s) => c.settings?.[s.id] ?? s.default ?? '')
      .filter(Boolean);
    const asks = (p.inputs || []).map((i) => `[${i.label}]`);
    return [...asks, ...vals].join(' · ') || p.name;
  }
  return c.fields
    .filter((f) => !f.same)
    .map((f) => (f.secret && f.value ? '••••' : f.value || '∅'))
    .join('  ⇥  ');
}

function renderList() {
  const ul = $('list');
  ul.replaceChildren();
  if (!clips.length) {
    ul.append(el('li', { class: 'empty', textContent: 'まだありません。上の「＋ 追加」から作成してください。' }));
    return;
  }
  clips.forEach((c, i) => {
    ul.append(
      el('li', { class: 'clip' }, [
        el('button', {
          class: 'clip-main', title: 'クリックでコンソールに入力', disabled: sending,
          onclick: () => runClip(c),
        }, [
          el('div', { class: 'clip-name' }, [
            c.type === 'plugin' ? el('span', { class: 'badge', textContent: 'P' }) : null,
            c.name,
          ]),
          el('div', { class: 'clip-preview', textContent: preview(c) }),
        ]),
        el('button', {
          class: 'icon', title: '上へ移動', textContent: '↑', disabled: i === 0,
          onclick: () => { [clips[i - 1], clips[i]] = [clips[i], clips[i - 1]]; saveClips(); renderList(); },
        }),
        el('button', { class: 'icon', title: '編集', textContent: '✎', onclick: () => openEditor(i) }),
      ]),
    );
  });
}

$('add').addEventListener('click', () => {
  const t = $('newType').value;
  if (t.startsWith('plugin:')) {
    const p = findPlugin(t.slice(7));
    if (p) openEditor(-1, clipFromPlugin(p));
  } else {
    openEditor(-1, PRESETS[t]());
  }
});

// ============================================================
// 編集
// ============================================================
function openEditor(i, draft) {
  editing = { i, d: structuredClone(draft ?? clips[i]) };
  $('listView').hidden = true;
  $('askView').hidden = true;
  $('editor').hidden = false;
  $('delete').hidden = i < 0;
  renderEditor();
}
function closeEditor() {
  editing = null;
  $('editor').hidden = true;
  $('listView').hidden = false;
  renderList();
}

function renderEditor() {
  const d = editing.d;
  const body = $('editorBody');
  body.replaceChildren(
    el('label', { class: 'field-label', textContent: '名前' }),
    el('input', { type: 'text', class: 'name-input', value: d.name, oninput: (e) => (d.name = e.target.value) }),
  );

  if (d.type === 'text') {
    body.append(
      el('label', { class: 'field-label', textContent: '内容（改行 = Enter）' }),
      el('textarea', { value: d.text, oninput: (e) => (d.text = e.target.value) }),
      tokenHelp(),
    );
    return;
  }

  if (d.type === 'plugin') {
    const p = findPlugin(d.plugin);
    if (!p) {
      body.append(el('p', { class: 'error', textContent: `プラグイン「${d.plugin}」が見つかりません。プラグインタブで読み込み直すか、この項目を削除してください。` }));
      return;
    }
    d.settings = d.settings || {};
    body.append(el('div', { class: 'plugin-desc' }, [el('strong', { textContent: p.name }), el('br'), p.description || '']));
    if ((p.settings || []).length) body.append(el('label', { class: 'field-label', textContent: '設定（保存されます）' }));
    for (const s of p.settings || []) {
      body.append(
        el('div', { class: 'srow' }, [
          el('span', { class: 'slabel', textContent: s.label }),
          el('input', {
            type: s.secret ? 'password' : 'text',
            value: d.settings[s.id] ?? s.default ?? '', placeholder: s.placeholder || '',
            oninput: (e) => (d.settings[s.id] = e.target.value),
          }),
        ]),
      );
    }
    if ((p.inputs || []).length) {
      body.append(el('div', { class: 'tokens', textContent: 'クリック時に入力: ' + p.inputs.map((x) => x.label).join('、') }));
    }
    if (Array.isArray(p.fields)) body.append(clearFirstRow(d));
    return;
  }

  // fields
  body.append(el('label', { class: 'field-label', textContent: '項目（上から順に入力し、間でTabを押します）' }));
  body.append(el('div', { class: 'tokens' }, [
    '値に ', el('code', { textContent: '{?}' }), ' と書くと、その部分をクリック時に毎回入力します（例: ',
    el('code', { textContent: '192.168.1.{?}' }), '）。', el('code', { textContent: '{?ホスト番号}' }),
    ' のように名前を付けると、同じ名前の箇所に同じ値が入ります。',
  ]));
  d.fields.forEach((f, idx) => {
    const valueInput = f.same
      ? el('span', { class: 'same', textContent: '↑ 上の欄と同じ値' })
      : el('input', {
          type: f.secret ? 'password' : 'text',
          value: f.value, placeholder: '（空欄ならそのままTab）',
          oninput: (e) => (f.value = e.target.value),
        });
    body.append(
      el('div', { class: 'frow' }, [
        el('input', { type: 'text', value: f.label, title: 'ラベル（メモ用）', oninput: (e) => (f.label = e.target.value) }),
        valueInput,
        el('div', { class: 'opts' }, [
          el('button', {
            class: f.secret ? 'on' : '', title: '値を伏せ字で表示', textContent: '🔒',
            onclick: () => { f.secret = !f.secret; renderEditor(); },
          }),
          idx > 0 ? el('button', {
            class: f.same ? 'on' : '', title: '上の欄と同じ値にする（パスワード確認用）', textContent: '＝',
            onclick: () => { f.same = !f.same; renderEditor(); },
          }) : null,
        ]),
        el('button', {
          class: 'icon', title: 'この項目を削除', textContent: '×',
          onclick: () => {
            d.fields.splice(idx, 1);
            if (d.fields[0]) d.fields[0].same = false;
            renderEditor();
          },
        }),
      ]),
    );
  });
  body.append(
    el('div', { class: 'row' }, [
      el('button', {
        textContent: '＋ 項目を追加',
        onclick: () => { d.fields.push({ label: `項目${d.fields.length + 1}`, value: '' }); renderEditor(); },
      }),
    ]),
    clearFirstRow(d),
  );
}

function clearFirstRow(d) {
  return el('div', { class: 'row' }, [
    el('label', {}, [
      el('input', { type: 'checkbox', checked: !!d.clearFirst, onchange: (e) => (d.clearFirst = e.target.checked) }),
      '各欄の既存の文字を消してから入力（Backspace×40）',
    ]),
  ]);
}

function tokenHelp() {
  const t = ['{TAB}', '{ENTER}', '{ESC}', '{BS}', '{DEL}', '{UP}', '{DOWN}', '{LEFT}', '{RIGHT}', '{HOME}', '{END}', '{WAIT 500}'];
  return el('div', { class: 'tokens' }, [
    '特殊キー: ', ...t.flatMap((x) => [el('code', { textContent: x }), ' ']),
    el('br'), 'クリック時に毎回入力: ', el('code', { textContent: '{?}' }), ' ', el('code', { textContent: '{?名前}' }),
  ]);
}

$('cancel').addEventListener('click', closeEditor);
$('save').addEventListener('click', () => {
  const d = editing.d;
  d.name = (d.name || '').trim() || '無題';
  if (editing.i < 0) clips.push({ ...d, id: newId() });
  else clips[editing.i] = d;
  saveClips();
  closeEditor();
});
$('delete').addEventListener('click', () => {
  if (!confirm(`「${editing.d.name}」を削除しますか？`)) return;
  clips.splice(editing.i, 1);
  saveClips();
  closeEditor();
});

// ============================================================
// {?} / {?名前}（テキスト・項目リスト用）
// ============================================================
const VAR_RE = /\{\?([^{}]*)\}/g;

function collectVars(c) {
  const names = [];
  const add = (n) => { if (!names.includes(n)) names.push(n); };
  if (c.type === 'text') {
    for (const m of c.text.matchAll(VAR_RE)) add(m[1].trim() || '値');
  } else {
    c.fields.forEach((f) => {
      if (f.same) return;
      for (const m of (f.value || '').matchAll(VAR_RE)) add(m[1].trim() || f.label || '値');
    });
  }
  return names;
}

function applyVars(c, vars) {
  const d = structuredClone(c);
  const sub = (s, def) => s.replace(VAR_RE, (_, n) => vars[n.trim() || def] ?? '');
  if (d.type === 'text') d.text = sub(d.text, '値');
  else d.fields.forEach((f) => (f.value = sub(f.value || '', f.label || '値')));
  return d;
}

// ============================================================
// 実行の準備：何を聞いて、何を入力するか
//   spec = { inputs: [{key,label,placeholder,storeKey}], compute(vals) → {seq, lines, errors, error, warnings} }
// ============================================================
function askSpec(c) {
  if (c.type === 'plugin') {
    const p = findPlugin(c.plugin);
    if (!p) return { error: `プラグイン「${c.plugin}」が見つかりません` };
    return {
      inputs: (p.inputs || []).map((i) => ({
        key: i.id, label: i.label, placeholder: i.placeholder || '', storeKey: `${c.id}:${i.id}`,
      })),
      compute(vals) {
        const r = PT.compute(p, c.settings, vals);
        if (Object.keys(r.errors || {}).length || r.error) return r;
        if (r.values) {
          return {
            ...r,
            seq: fieldsSeq(r.values.map((v) => v.value), c.clearFirst),
            lines: r.values.map((v) => `${v.label}: ${v.secret && v.value ? '••••' : v.value || '∅'}`),
          };
        }
        return { ...r, seq: parseTokens(r.text), lines: [r.text] };
      },
    };
  }
  const names = collectVars(c);
  return {
    inputs: names.map((n) => ({ key: n, label: n, placeholder: n, storeKey: n })),
    compute(vals) {
      const errors = {};
      for (const n of names) if (!String(vals[n] ?? '').trim()) errors[n] = '未入力です';
      if (Object.keys(errors).length) return { errors, warnings: [] };
      const d = applyVars(c, vals);
      const lines = d.type === 'text'
        ? [d.text]
        : d.fields.map((f, i) => `${f.label}: ${f.same && i > 0 ? '（上と同じ）' : f.secret && f.value ? '••••' : f.value || '∅'}`);
      return { errors, warnings: [], seq: buildSeq(d), lines };
    },
  };
}

function runClip(c) {
  if (sending) return;
  const spec = askSpec(c);
  if (spec.error) { statusEl.textContent = spec.error; return; }
  if (!spec.inputs.length) {
    const r = spec.compute({});
    if (r.error) { statusEl.textContent = 'エラー: ' + r.error; return; }
    return sendSeq(r.seq, c.name);
  }
  openAsk(c, spec);
}

// ============================================================
// クリック時の入力画面
// ============================================================
function openAsk(c, spec) {
  const body = $('askBody');
  body.replaceChildren(el('div', { class: 'clip-name', textContent: c.name }));
  const inputs = spec.inputs.map((inp) => {
    const input = el('input', {
      type: 'text', value: lastVars[inp.storeKey] ?? '', placeholder: inp.placeholder,
      oninput: updateAsk,
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); askGo(); } },
    });
    const err = el('div', { class: 'input-error' });
    body.append(el('label', { class: 'field-label', textContent: inp.label }), input, err);
    return { ...inp, input, err };
  });
  asking = { c, spec, inputs };
  $('listView').hidden = true;
  $('askView').hidden = false;
  updateAsk();
  inputs[0].input.focus();
  inputs[0].input.select();
}

function askValues() {
  return Object.fromEntries(asking.inputs.map((i) => [i.key, i.input.value.trim()]));
}

function updateAsk(showErrors = false) {
  const r = asking.spec.compute(askValues());
  for (const i of asking.inputs) {
    const msg = r.errors?.[i.key] || '';
    const touched = showErrors === true || i.input.value.trim() !== '';
    i.err.textContent = touched ? msg : '';
    i.input.classList.toggle('invalid', touched && !!msg);
  }
  const lines = r.lines ? [...r.lines] : [];
  $('askPreview').textContent = lines.join('\n') || '（入力すると、ここに入力内容が表示されます）';
  const notes = [...(r.warnings || [])];
  if (r.error) notes.unshift('エラー: ' + r.error);
  $('askError').hidden = !notes.length;
  $('askError').textContent = notes.join('\n');
  return r;
}

function closeAsk() {
  asking = null;
  $('askView').hidden = true;
  $('listView').hidden = false;
}

function askGo() {
  const r = updateAsk(true);
  const bad = asking.inputs.find((i) => r.errors?.[i.key]);
  if (bad) { bad.input.focus(); return; }
  if (r.error) return;
  for (const i of asking.inputs) lastVars[i.storeKey] = i.input.value.trim();
  chrome.storage.local.set({ lastVars });
  const name = asking.c.name;
  closeAsk();
  sendSeq(r.seq, name);
}

$('askGo').addEventListener('click', askGo);
$('askCancel').addEventListener('click', closeAsk);

// ============================================================
// 入力シーケンスの組み立て
//   文字: 'a'   特殊キー: {k:'TAB'}   待機: {w:500}
// ============================================================
const TOKEN_RE = /\{(TAB|ENTER|ESC|BS|DEL|UP|DOWN|LEFT|RIGHT|HOME|END|WAIT(?:[ :]\d+)?)\}/g;

function parseTokens(text) {
  text = String(text).replace(/\r\n?/g, '\n');
  const seq = [];
  const pushChars = (s) => {
    for (const ch of s) {
      if (ch === '\n') seq.push({ k: 'ENTER' });
      else if (ch === '\t') seq.push({ k: 'TAB' });
      else seq.push(ch);
    }
  };
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    pushChars(text.slice(last, m.index));
    const t = m[1];
    if (t.startsWith('WAIT')) seq.push({ w: parseInt(t.slice(5), 10) || 500 });
    else seq.push({ k: t });
    last = m.index + m[0].length;
  }
  pushChars(text.slice(last));
  return seq;
}

function fieldsSeq(values, clearFirst) {
  const seq = [];
  values.forEach((v, i) => {
    if (i > 0) seq.push({ k: 'TAB' });
    if (clearFirst) {
      seq.push({ k: 'END' });
      for (let n = 0; n < 40; n++) seq.push({ k: 'BS' });
    }
    for (const ch of v) seq.push(ch);
  });
  return seq;
}

function buildSeq(c) {
  if (c.type === 'text') return parseTokens(c.text);
  const values = [];
  c.fields.forEach((f, i) => values.push(f.same && i > 0 ? values[i - 1] : f.value || ''));
  return fieldsSeq(values, c.clearFirst);
}

// ============================================================
// プラグイン管理
// ============================================================
function pluginMsg(text, isError) {
  const m = $('pluginMsg');
  m.hidden = !text;
  m.className = 'msg' + (isError ? ' error' : ' ok');
  m.textContent = text;
}

function renderPlugins() {
  const ul = $('pluginList');
  ul.replaceChildren();
  for (const p of allPlugins()) {
    const used = clips.filter((c) => c.type === 'plugin' && c.plugin === p.id).length;
    ul.append(
      el('li', { class: 'plugin' }, [
        el('div', { class: 'plugin-head' }, [
          el('span', { class: 'plugin-name', textContent: p.name }),
          el('span', { class: 'badge' + (p.builtin ? '' : ' user'), textContent: p.builtin ? '標準' : '追加' }),
          p.version ? el('span', { class: 'ver', textContent: 'v' + p.version }) : null,
        ]),
        el('div', { class: 'plugin-meta', textContent: [p.id, p.author].filter(Boolean).join(' · ') }),
        p.description ? el('div', { class: 'plugin-text', textContent: p.description }) : null,
        el('div', { class: 'row' }, [
          el('button', {
            textContent: '＋ クリップボードに追加',
            onclick: () => { showTab('clips'); openEditor(-1, clipFromPlugin(p)); },
          }),
          el('button', { textContent: '書き出し', onclick: () => exportPlugin(p) }),
          el('span', { class: 'spacer' }),
          used ? el('span', { class: 'ver', textContent: `${used}件で使用中` }) : null,
          p.builtin ? null : el('button', {
            class: 'danger', textContent: '削除',
            onclick: () => {
              if (!confirm(`プラグイン「${p.name}」を削除しますか？` + (used ? `\n（使っている ${used} 件の項目は動かなくなります）` : ''))) return;
              userPlugins = userPlugins.filter((x) => x.id !== p.id);
              savePlugins(); populateNewType(); renderPlugins(); renderList();
              pluginMsg(`「${p.name}」を削除しました。`);
            },
          }),
        ]),
      ]),
    );
  }
}

function exportPlugin(p) {
  const { builtin, ...data } = p;
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${p.id}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importPlugins(text, source = '') {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    pluginMsg(`${source}JSONとして読めません: ${e.message}`, true);
    return false;
  }
  const list = Array.isArray(data) ? data : [data];
  const added = [];
  const problems = [];
  for (const p of list) {
    const label = (p && p.name) || (p && p.id) || '（名前なし）';
    const errs = PT.validate(p);
    if (p && typeof p.id === 'string' && p.id.startsWith('builtin.')) errs.push('id を「builtin.」で始めることはできません');
    if (errs.length) { problems.push(`「${label}」: ` + errs.join(' / ')); continue; }
    const clean = JSON.parse(JSON.stringify(p));
    delete clean.builtin;
    const idx = userPlugins.findIndex((x) => x.id === p.id);
    if (idx >= 0) {
      if (!confirm(`プラグイン「${p.id}」は既にあります。上書きしますか？`)) continue;
      userPlugins[idx] = clean;
    } else {
      userPlugins.push(clean);
    }
    added.push(p.name);
  }
  if (added.length) { savePlugins(); populateNewType(); renderPlugins(); renderList(); }
  const msgs = [];
  if (added.length) msgs.push(`${source}読み込みました: ${added.join('、')}`);
  if (problems.length) msgs.push(...problems);
  pluginMsg(msgs.join('\n'), problems.length > 0);
  return problems.length === 0;
}

$('pasteToggle').addEventListener('click', () => { $('pasteBox').hidden = !$('pasteBox').hidden; });
$('pasteImport').addEventListener('click', () => {
  if (importPlugins($('pasteJson').value)) $('pasteJson').value = '';
});
$('importFile').addEventListener('click', () => {
  if (!isFull) {
    // ポップアップではファイル選択画面を開くとポップアップが閉じるため、タブで開き直す
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1&tab=plugins') });
    window.close();
    return;
  }
  $('fileInput').click();
});
$('fileInput').addEventListener('change', async (e) => {
  for (const f of e.target.files) importPlugins(await f.text(), `${f.name}: `);
  e.target.value = '';
});

// ============================================================
// 送信
// ============================================================
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'pve-typer-progress') {
    progressEl.hidden = false;
    progressEl.max = msg.total;
    progressEl.value = msg.done;
    statusEl.textContent = `入力中… ${msg.done} / ${msg.total}`;
  }
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setBusy(b) {
  sending = b;
  $('send').disabled = b;
  document.querySelectorAll('.clip-main').forEach((x) => (x.disabled = b));
}

async function sendSeq(seq, label) {
  if (sending) return;
  if (!seq || !seq.length) { statusEl.textContent = '入力する内容が空です。'; return; }
  saveSettings();
  const tab = await activeTab();
  setBusy(true);
  statusEl.textContent = `送信中: ${label}`;
  progressEl.hidden = false; progressEl.value = 0; progressEl.max = seq.length;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: typeIntoNoVNC,
      args: [seq, Number($('delay').value) || 0, $('layout').value],
    });
    const r = results.map((x) => x.result).find((x) => x && x.found);
    if (!r) {
      statusEl.textContent = 'noVNCコンソールが見つかりません。\nProxmoxのコンソール画面（noVNC）を開いたタブで実行してください。';
    } else if (r.busy) {
      statusEl.textContent = '別の入力が実行中です。停止してから再実行してください。';
    } else {
      let s = r.aborted ? `停止しました（${r.typed} キー入力）` : `完了: ${label}`;
      if (r.skipped.length) s += `\n入力できない文字をスキップ: ${r.skipped.join(' ')}`;
      statusEl.textContent = s;
    }
  } catch (e) {
    statusEl.textContent = 'エラー: ' + e.message;
  } finally {
    setBusy(false);
  }
}

$('send').addEventListener('click', () => {
  const seq = parseTokens($('text').value);
  const last = seq[seq.length - 1];
  if ($('trailingEnter').checked && !(last && last.k === 'ENTER')) seq.push({ k: 'ENTER' });
  sendSeq(seq, '直接入力');
});

$('stop').addEventListener('click', async () => {
  const tab = await activeTab();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => { if (window.__pveTyper) window.__pveTyper.abort = true; },
  });
  statusEl.textContent = '停止を要求しました…';
});

$('clear').addEventListener('click', () => { $('text').value = ''; saveSettings(); });

// ============================================================
// ページ（各フレーム）内で実行される関数。自己完結している必要がある。
// ============================================================
async function typeIntoNoVNC(seq, delay, layout) {
  const container = document.getElementById('noVNC_container');
  const isNoVNC = !!container || /novnc=1/.test(location.search);
  if (!isNoVNC) return { found: false };
  const canvas = (container && container.querySelector('canvas')) || document.querySelector('canvas');
  if (!canvas) return { found: false };

  if (window.__pveTyper && window.__pveTyper.running) return { found: true, busy: true };
  const state = (window.__pveTyper = { running: true, abort: false });

  // [物理キーコード, 通常時の文字, Shift時の文字]
  const US_ROWS = [
    ['Backquote', '`', '~'],
    ['Digit1', null, '!'], ['Digit2', null, '@'], ['Digit3', null, '#'], ['Digit4', null, '$'],
    ['Digit5', null, '%'], ['Digit6', null, '^'], ['Digit7', null, '&'], ['Digit8', null, '*'],
    ['Digit9', null, '('], ['Digit0', null, ')'],
    ['Minus', '-', '_'], ['Equal', '=', '+'],
    ['BracketLeft', '[', '{'], ['BracketRight', ']', '}'], ['Backslash', '\\', '|'],
    ['Semicolon', ';', ':'], ['Quote', "'", '"'],
    ['Comma', ',', '<'], ['Period', '.', '>'], ['Slash', '/', '?'],
  ];
  const JIS_ROWS = [
    ['Digit1', null, '!'], ['Digit2', null, '"'], ['Digit3', null, '#'], ['Digit4', null, '$'],
    ['Digit5', null, '%'], ['Digit6', null, '&'], ['Digit7', null, "'"], ['Digit8', null, '('],
    ['Digit9', null, ')'],
    ['Minus', '-', '='], ['Equal', '^', '~'],
    ['IntlRo', '\\', '_'], ['IntlYen', '\\', '|'],
    ['BracketLeft', '@', '`'], ['BracketRight', '[', '{'], ['Backslash', ']', '}'],
    ['Semicolon', ';', '+'], ['Quote', ':', '*'],
    ['Comma', ',', '<'], ['Period', '.', '>'], ['Slash', '/', '?'],
  ];

  const map = {};
  for (let i = 0; i < 26; i++) {
    const lo = String.fromCharCode(97 + i), up = lo.toUpperCase();
    map[lo] = { code: 'Key' + up, shift: false };
    map[up] = { code: 'Key' + up, shift: true };
  }
  for (let d = 0; d < 10; d++) map[String(d)] = { code: 'Digit' + d, shift: false };
  for (const [code, n, s] of layout === 'jis' ? JIS_ROWS : US_ROWS) {
    if (n && !map[n]) map[n] = { code, shift: false };
    if (s && !map[s]) map[s] = { code, shift: true };
  }
  map[' '] = { code: 'Space', shift: false };

  // 特殊キー: [key, code]
  const SPECIAL = {
    TAB: ['Tab', 'Tab'], ENTER: ['Enter', 'Enter'], ESC: ['Escape', 'Escape'],
    BS: ['Backspace', 'Backspace'], DEL: ['Delete', 'Delete'],
    UP: ['ArrowUp', 'ArrowUp'], DOWN: ['ArrowDown', 'ArrowDown'],
    LEFT: ['ArrowLeft', 'ArrowLeft'], RIGHT: ['ArrowRight', 'ArrowRight'],
    HOME: ['Home', 'Home'], END: ['End', 'End'],
  };

  const fire = (type, key, code, shiftKey) =>
    canvas.dispatchEvent(new KeyboardEvent(type, { key, code, shiftKey, bubbles: true, cancelable: true }));
  const press = (key, code, shift) => {
    if (shift) fire('keydown', 'Shift', 'ShiftLeft', true);
    fire('keydown', key, code, shift);
    fire('keyup', key, code, shift);
    if (shift) fire('keyup', 'Shift', 'ShiftLeft', false);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = (done) => {
    try {
      chrome.runtime.sendMessage({ type: 'pve-typer-progress', done, total: seq.length }).catch(() => {});
    } catch (_) { /* ポップアップが閉じていても無視 */ }
  };

  const skipped = new Set();
  let typed = 0;
  try {
    for (let i = 0; i < seq.length; i++) {
      if (state.abort) break;
      const item = seq[i];
      if (typeof item === 'string') {
        const k = map[item];
        if (!k) { skipped.add(item); continue; }
        press(item, k.code, k.shift);
      } else if (item.k) {
        const s = SPECIAL[item.k];
        if (!s) continue;
        press(s[0], s[1], false);
      } else if (item.w) {
        await sleep(item.w);
        continue;
      }
      typed++;
      if (i % 10 === 0 || i === seq.length - 1) report(i + 1);
      if (delay > 0) await sleep(delay);
      else if (i % 50 === 0) await sleep(0);
    }
  } finally {
    state.running = false;
  }
  report(seq.length);
  return { found: true, typed, aborted: state.abort, skipped: [...skipped] };
}
