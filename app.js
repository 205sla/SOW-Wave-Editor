'use strict';

// ════════════════════════════════════════════════════════════════════
// SOW Wave Editor
// ────────────────────────────────────────────────────────────────────
// Vanilla JS, no build, no deps. Single-page editor for UE DataTable
// wave rows. Persists to localStorage. Exports per-stage JSON that
// matches the F_Wave struct format used by SOW (XSBD2).
//
// Hierarchy:
//   themes[] (top-level container, e.g. Forest, Iceland)
//     ├── settings (MonsterType / BehaviorTree maps — per-theme)
//     └── stages[] (one DataTable per stage, e.g. Forest_Stage1)
//           └── waves[] (F_Wave rows)
//                 └── monsters[] (F_MonsterSpawnData entries)
// ════════════════════════════════════════════════════════════════════

// ─── Storage keys / wrap prefixes ───────────────────────────────────
const LS_THEMES    = 'sow_wave_themes';
const LS_CUR_THEME = 'sow_wave_current_theme';
const LS_CUR_STAGE = 'sow_wave_current_stage';
// Legacy keys (pre-theme schema; migrated on first load)
const LS_LEGACY_LEVELS   = 'sow_wave_levels';
const LS_LEGACY_SETTINGS = 'sow_wave_settings';
const LS_LEGACY_CURRENT  = 'sow_wave_current';

const MT_PREFIX = "/Script/Engine.BlueprintGeneratedClass'";
const BT_PREFIX = "/Script/AIModule.BehaviorTree'";
const PATH_SUFFIX = "'";
const COMMON_PREFIX = '/Game/01Blueprints/Enemy/'; // auto-prepended on wrap, auto-stripped on unwrap
const BT_NONE = 'None';
const SCHEMA_VERSION = 2; // bumped: themes[] container

// ─── State ──────────────────────────────────────────────────────────
let themes = [];          // [{ id, name, settings, stages: [{ id, name, waves }] }]
let currentThemeId = null;
let currentStageId = null;
let saveTimer = null;
let confirmCb = null;
let statusTimer = null;
let dragState = null;     // { kind, from, waveIdx? }

// ════════════════════════════════════════════════════════════════════
// Seed data
// ────────────────────────────────────────────────────────────────────
// Single Forest theme containing the three sample stages and the
// MonsterType / BehaviorTree mappings observed in those stages.
// Stored paths use short form — `/Game/01Blueprints/Enemy/` is
// auto-prepended on wrap.
// ════════════════════════════════════════════════════════════════════
const SEED_FOREST_SETTINGS = {
  monsterTypeMap: [
    { name: 'BabyYeti',     path: 'EnemyTypes/Iceland/BabyYeti/BP_Enemy_BabyYeti.BP_Enemy_BabyYeti_C' },
    { name: 'EvilWood',     path: 'EnemyTypes/01Forest/EvilWood/BP_Enemy_EvilWood.BP_Enemy_EvilWood_C' },
    { name: 'EvilFlower',   path: 'EnemyTypes/01Forest/EvilFlower/BP_Enemy_EvilFlower.BP_Enemy_EvilFlower_C' },
    { name: 'EvilMushroom', path: 'EnemyTypes/01Forest/EvilMushroom/BP_Enemy_EvilMushroom.BP_Enemy_EvilMushroom_C' },
    { name: 'Bowman',       path: 'EnemyTypes/01Forest/Bowman/BP_Enemy_Bowman.BP_Enemy_Bowman_C' },
    { name: 'Taurus',       path: 'EnemyTypes/01Forest/Taurus/BP_Enemy_Taurus.BP_Enemy_Taurus_C' },
    { name: 'Spider',       path: 'EnemyTypes/01Forest/Spider/BP_Enemy_Spider.BP_Enemy_Spider_C' },
    { name: 'ForestBoss',   path: 'EnemyTypes/00Bosses/ForestBoss/BP_Enemy_ForestBoss.BP_Enemy_ForestBoss_C' }
  ],
  behaviorTreeMap: [
    { name: 'Default',             path: 'AI/BT_EnemyBase.BT_EnemyBase' },
    { name: 'BT_Enemy_Taurus',     path: 'AI/BT_Enemy_Taurus.BT_Enemy_Taurus' },
    { name: 'BT_Enemy_ForestBoss', path: 'AI/BT_Enemy_ForestBoss.BT_Enemy_ForestBoss' }
  ]
};

// Compact stage seed: each wave is { ms: [...], d, p, r }
// Each monster is [mtName, count, time, interval, [points], btName]
// (btName '' means "None")
const SEED_FOREST_STAGES = [
  { name: 'Forest_Stage1', waves: [
    { ms: [['BabyYeti', 30, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 20, 1, 1, [0], 'Default'], ['EvilWood', 15, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 30, 1, 1, [0], 'Default'], ['EvilWood', 20, 1, 1, [0], 'Default'], ['EvilFlower', 10, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 20, 1, 1, [0], 'Default'], ['EvilWood', 20, 1, 1, [0], 'Default'], ['EvilFlower', 20, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 30, 1, 1, [0], 'Default'], ['EvilWood', 25, 1, 1, [0], 'Default'], ['EvilFlower', 20, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 }
  ]},
  { name: 'Forest_Stage2', waves: [
    { ms: [['BabyYeti', 40, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 30, 1, 1, [0], ''], ['EvilWood', 10, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 20, 1, 1, [0], 'Default'], ['EvilWood', 10, 1, 1, [0], 'Default'], ['EvilFlower', 10, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 20, 1, 1, [0], 'Default'], ['EvilWood', 15, 1, 1, [0], 'Default'], ['EvilFlower', 15, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 10, 1, 1, [0], 'Default'], ['EvilWood', 20, 1, 1, [0], 'Default'], ['EvilFlower', 15, 1, 1, [0], 'Default'], ['Bowman', 5, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 10, 1, 1, [0], 'Default'], ['EvilWood', 20, 1, 1, [0], 'Default'], ['EvilFlower', 5, 1, 1, [0], 'Default'], ['EvilMushroom', 10, 1, 1, [0], 'Default']], d: 0, p: 15, r: 10 },
    { ms: [['EvilWood', 15, 1, 1, [0], 'Default'], ['EvilFlower', 15, 1, 1, [0], 'Default'], ['EvilMushroom', 10, 1, 1, [0], 'Default'], ['Bowman', 5, 1, 1, [0], 'Default'], ['Taurus', 3, 1, 1, [0], 'BT_Enemy_Taurus']], d: 0, p: 15, r: 10 }
  ]},
  { name: 'Forest_Stage3', waves: [
    { ms: [['BabyYeti', 40, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 20, 1, 1, [0], ''], ['EvilWood', 10, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 20, 1, 1, [0], ''], ['EvilWood', 15, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 20, 1, 1, [0], ''], ['EvilFlower', 15, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 10, 1, 1, [0], ''], ['EvilWood', 15, 1, 1, [0], ''], ['EvilFlower', 10, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 15, 1, 1, [0], ''], ['EvilFlower', 25, 1, 1, [0], ''], ['Bowman', 5, 1, 1, [0], ''], ['Taurus', 3, 1, 1, [0], 'BT_Enemy_Taurus']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 15, 1, 1, [0], ''], ['EvilWood', 25, 1, 1, [0], ''], ['EvilMushroom', 5, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['EvilFlower', 30, 1, 1, [0], ''], ['Bowman', 10, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['EvilWood', 30, 1, 1, [0], ''], ['EvilMushroom', 10, 1, 1, [0], '']], d: 0, p: 15, r: 10 },
    { ms: [['BabyYeti', 60, 1, 0.5, [0], ''], ['Spider', 10, 1, 0.5, [0], ''], ['ForestBoss', 1, 1, 1, [0], 'BT_Enemy_ForestBoss']], d: 0, p: 15, r: 10 }
  ]}
];

function expandStage(s) {
  return {
    id: makeId(),
    name: s.name,
    waves: s.waves.map(w => ({
      monsters: w.ms.map(m => ({
        monsterTypeName:   m[0],
        monsterCount:      m[1],
        spawnTime:         m[2],
        spawnInterval:     m[3],
        spawnPointIndices: [...m[4]],
        behaviorTreeName:  m[5]
      })),
      waveDuration:     w.d,
      preInterludeTime: w.p,
      waveReward:       w.r
    }))
  };
}

function seedDefaults() {
  const forest = {
    id: makeId(),
    name: 'Forest',
    settings: JSON.parse(JSON.stringify(SEED_FOREST_SETTINGS)),
    stages: SEED_FOREST_STAGES.map(expandStage)
  };
  themes = [forest];
  currentThemeId = forest.id;
  currentStageId = forest.stages[0]?.id || null;
}

// ════════════════════════════════════════════════════════════════════
// Persistence + legacy migration
// ════════════════════════════════════════════════════════════════════
function migrateLegacy() {
  const oldL = localStorage.getItem(LS_LEGACY_LEVELS);
  const oldS = localStorage.getItem(LS_LEGACY_SETTINGS);
  if (!oldL && !oldS) return false;
  let parsedL = []; let parsedS = { monsterTypeMap: [], behaviorTreeMap: [] };
  try { if (oldL) parsedL = JSON.parse(oldL) || []; } catch (e) {}
  try { if (oldS) parsedS = JSON.parse(oldS) || parsedS; } catch (e) {}
  const theme = {
    id: makeId(),
    name: 'Forest',
    settings: parsedS,
    stages: parsedL.map(l => ({
      id: l.id || makeId(),
      name: l.name || 'Untitled',
      waves: l.waves || []
    }))
  };
  themes = [theme];
  currentThemeId = theme.id;
  const oldCur = localStorage.getItem(LS_LEGACY_CURRENT);
  currentStageId = (theme.stages.find(s => s.id === oldCur) || theme.stages[0])?.id || null;
  // Drop legacy keys
  localStorage.removeItem(LS_LEGACY_LEVELS);
  localStorage.removeItem(LS_LEGACY_SETTINGS);
  localStorage.removeItem(LS_LEGACY_CURRENT);
  console.info('Legacy data migrated into "Forest" theme.');
  return true;
}

function loadAll() {
  try {
    const raw = localStorage.getItem(LS_THEMES);
    if (raw) themes = JSON.parse(raw) || [];
    currentThemeId = localStorage.getItem(LS_CUR_THEME) || null;
    currentStageId = localStorage.getItem(LS_CUR_STAGE) || null;
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
  if (!themes.length) {
    if (!migrateLegacy()) seedDefaults();
  }
  // Normalize: strip the common prefix from any settings paths that still have it
  themes.forEach(t => {
    if (!t.settings) t.settings = { monsterTypeMap: [], behaviorTreeMap: [] };
    if (!t.settings.monsterTypeMap) t.settings.monsterTypeMap = [];
    if (!t.settings.behaviorTreeMap) t.settings.behaviorTreeMap = [];
    t.settings.monsterTypeMap.forEach(r => { r.path = shortenInner(r.path || ''); });
    t.settings.behaviorTreeMap.forEach(r => { r.path = shortenInner(r.path || ''); });
  });
  // Sanity: ensure the cached selections are valid
  if (!themes.find(t => t.id === currentThemeId)) currentThemeId = themes[0]?.id || null;
  const ct = curTheme();
  if (!ct?.stages.find(s => s.id === currentStageId)) currentStageId = ct?.stages[0]?.id || null;
}

function saveDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAll, 500);
}

function saveAll() {
  try {
    localStorage.setItem(LS_THEMES, JSON.stringify(themes));
    if (currentThemeId) localStorage.setItem(LS_CUR_THEME, currentThemeId);
    else localStorage.removeItem(LS_CUR_THEME);
    if (currentStageId) localStorage.setItem(LS_CUR_STAGE, currentStageId);
    else localStorage.removeItem(LS_CUR_STAGE);
    setStatus('저장됨');
  } catch (e) {
    console.warn('localStorage save failed:', e);
    setStatus('저장 실패: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════
function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function curTheme() { return themes.find(t => t.id === currentThemeId) || null; }
function curStage() { const t = curTheme(); return t?.stages.find(s => s.id === currentStageId) || null; }
function curSettings() {
  const t = curTheme();
  return t ? t.settings : { monsterTypeMap: [], behaviorTreeMap: [] };
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setStatus(msg) {
  const bar = document.getElementById('bar');
  if (!bar) return;
  bar.textContent = msg;
  bar.classList.add('flash');
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => bar.classList.remove('flash'), 600);
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Path wrap / unwrap ─────────────────────────────────────────────
function expandInner(stored) {
  if (!stored) return '';
  return stored.startsWith('/') ? stored : COMMON_PREFIX + stored;
}
function shortenInner(inner) {
  if (!inner) return '';
  return inner.startsWith(COMMON_PREFIX) ? inner.slice(COMMON_PREFIX.length) : inner;
}
function wrapMT(stored) { return stored ? MT_PREFIX + expandInner(stored) + PATH_SUFFIX : ''; }
function unwrapMT(full) {
  if (!full) return '';
  let inner = full;
  if (inner.startsWith(MT_PREFIX) && inner.endsWith(PATH_SUFFIX))
    inner = inner.slice(MT_PREFIX.length, -PATH_SUFFIX.length);
  return shortenInner(inner);
}
function wrapBT(stored) { return stored ? BT_PREFIX + expandInner(stored) + PATH_SUFFIX : ''; }
function unwrapBT(full) {
  if (!full) return '';
  let inner = full;
  if (inner.startsWith(BT_PREFIX) && inner.endsWith(PATH_SUFFIX))
    inner = inner.slice(BT_PREFIX.length, -PATH_SUFFIX.length);
  return shortenInner(inner);
}

function parseIndices(s) {
  if (!s || !s.trim()) return [];
  return s.split(',').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
}
function formatIndices(arr) { return Array.isArray(arr) ? arr.join(', ') : ''; }

function uniqueName(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// ════════════════════════════════════════════════════════════════════
// Render
// ════════════════════════════════════════════════════════════════════
function renderAll() {
  renderThemeBar();
  renderStageList();
  renderEditor();
}

function renderThemeBar() {
  const sel = document.getElementById('theme-select');
  sel.innerHTML = '';
  if (!themes.length) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '(테마 없음)'; opt.disabled = true;
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  themes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.stages.length}개 스테이지)`;
    if (t.id === currentThemeId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderStageList() {
  const list = document.getElementById('stage-list');
  list.innerHTML = '';
  const t = curTheme();
  if (!t) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '테마를 만들거나 선택하세요.';
    e.style.padding = '20px 10px';
    list.appendChild(e);
    return;
  }
  if (!t.stages.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '스테이지 없음';
    e.style.padding = '20px 10px';
    list.appendChild(e);
    return;
  }
  t.stages.forEach(s => {
    const row = document.createElement('div');
    row.className = 'stage-row' + (s.id === currentStageId ? ' cur' : '');
    row.title = `${s.waves.length}개 wave`;
    row.onclick = () => selectStage(s.id);
    row.innerHTML = `<span class="stage-name">${escHtml(s.name)}</span><span style="color:#444;font-size:10px">${s.waves.length}</span>`;
    list.appendChild(row);
  });
}

function renderEditor() {
  const s = curStage();
  const nameInp = document.getElementById('stage-name');
  const list = document.getElementById('wave-list');
  list.innerHTML = '';

  if (!s) {
    nameInp.value = '';
    nameInp.disabled = true;
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = curTheme()
      ? '왼쪽에서 스테이지를 선택하거나 [+ 새 스테이지]로 만들어 주세요.'
      : '먼저 테마를 만들어주세요.';
    list.appendChild(e);
    return;
  }
  nameInp.disabled = false;
  if (document.activeElement !== nameInp) nameInp.value = s.name;

  if (!s.waves.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'Wave 없음. 위의 [+ Wave] 버튼으로 추가하세요.';
    list.appendChild(e);
    return;
  }
  s.waves.forEach((w, i) => list.appendChild(buildWaveEl(w, i)));
}

function buildWaveEl(wave, idx) {
  const el = document.createElement('div');
  el.className = 'wave';
  el.dataset.waveIdx = idx;
  el.draggable = true;
  el.addEventListener('dragstart', e => {
    if (!e.target.classList.contains('handle')) { e.preventDefault(); return; }
    onDragStart(e, 'wave', { from: idx });
  });
  el.addEventListener('dragover', onDragOver);
  el.addEventListener('drop', e => onDrop(e, 'wave', { to: idx }));
  el.addEventListener('dragleave', onDragLeave);
  el.addEventListener('dragend', onDragEnd);

  const head = document.createElement('div');
  head.className = 'wave-head';
  head.innerHTML = `
    <span class="handle" title="드래그로 순서 변경">⠿</span>
    <span class="wave-title">Wave ${idx + 1}</span>
    <button class="mini" title="위에 새 Wave 삽입">↑ 삽입</button>
    <button class="mini" title="복제">복제</button>
    <button class="mini danger" title="삭제">삭제</button>
  `;
  const [insBtn, dupBtn, delBtn] = head.querySelectorAll('button');
  insBtn.onclick = () => addWave(idx);
  dupBtn.onclick = () => duplicateWave(idx);
  delBtn.onclick = () => deleteWave(idx);
  el.appendChild(head);

  const body = document.createElement('div');
  body.className = 'wave-body';

  const msd = document.createElement('div');
  msd.className = 'msd-section';
  const lbl = document.createElement('div');
  lbl.className = 'msd-label';
  lbl.textContent = `MonsterSpawnData (${wave.monsters.length})`;
  msd.appendChild(lbl);

  const msdList = document.createElement('div');
  msdList.className = 'msd-list';
  wave.monsters.forEach((m, j) => msdList.appendChild(buildMonsterEl(m, idx, j)));
  msd.appendChild(msdList);

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ MonsterSpawnData';
  addBtn.className = 'mini';
  addBtn.onclick = () => addMonster(idx);
  msd.appendChild(addBtn);

  body.appendChild(msd);

  const fields = document.createElement('div');
  fields.className = 'wave-fields';
  fields.innerHTML = `
    <label class="field">WaveDuration <input type="number" step="any" value="${wave.waveDuration}"></label>
    <label class="field">PreInterludeTime <input type="number" step="any" value="${wave.preInterludeTime}"></label>
    <label class="field">WaveReward <input type="number" step="any" value="${wave.waveReward}"></label>
  `;
  const [dInp, pInp, rInp] = fields.querySelectorAll('input');
  dInp.oninput = () => setWaveField(idx, 'waveDuration', parseFloat(dInp.value) || 0);
  pInp.oninput = () => setWaveField(idx, 'preInterludeTime', parseFloat(pInp.value) || 0);
  rInp.oninput = () => setWaveField(idx, 'waveReward', parseFloat(rInp.value) || 0);
  body.appendChild(fields);

  el.appendChild(body);
  return el;
}

function buildMonsterEl(m, waveIdx, monsterIdx) {
  const settings = curSettings();
  const el = document.createElement('div');
  el.className = 'msd-item';
  el.dataset.monsterIdx = monsterIdx;
  el.draggable = true;
  el.addEventListener('dragstart', e => {
    if (!e.target.classList.contains('handle')) { e.preventDefault(); return; }
    e.stopPropagation();
    onDragStart(e, 'monster', { from: monsterIdx, waveIdx });
  });
  el.addEventListener('dragover', e => {
    if (dragState && dragState.kind === 'monster' && dragState.waveIdx === waveIdx) {
      e.stopPropagation();
      onDragOver(e);
    }
  });
  el.addEventListener('drop', e => {
    if (dragState && dragState.kind === 'monster' && dragState.waveIdx === waveIdx) {
      e.stopPropagation();
      onDrop(e, 'monster', { to: monsterIdx, waveIdx });
    }
  });
  el.addEventListener('dragleave', onDragLeave);
  el.addEventListener('dragend', onDragEnd);

  const mtOptions = ['<option value="">(없음)</option>']
    .concat(settings.monsterTypeMap.map(r =>
      `<option value="${escHtml(r.name)}"${r.name === m.monsterTypeName ? ' selected' : ''}>${escHtml(r.name)}</option>`));
  const btOptions = ['<option value="">(없음 → "None")</option>']
    .concat(settings.behaviorTreeMap.map(r =>
      `<option value="${escHtml(r.name)}"${r.name === m.behaviorTreeName ? ' selected' : ''}>${escHtml(r.name)}</option>`));

  let mtUnmapped = '';
  if (m.monsterTypeName && !settings.monsterTypeMap.find(r => r.name === m.monsterTypeName)) {
    mtUnmapped = `<option value="${escHtml(m.monsterTypeName)}" selected>${escHtml(m.monsterTypeName)} (미등록)</option>`;
  }
  let btUnmapped = '';
  if (m.behaviorTreeName && !settings.behaviorTreeMap.find(r => r.name === m.behaviorTreeName)) {
    btUnmapped = `<option value="${escHtml(m.behaviorTreeName)}" selected>${escHtml(m.behaviorTreeName)} (미등록)</option>`;
  }

  const fallbackLabel = (!m.monsterTypeName)
    ? `<span style="color:#a85;font-size:10px" title="설정에 매핑 없으면 export 시 빈 경로">이름없는 적${monsterIdx + 1}</span>`
    : '';

  el.innerHTML = `
    <div class="msd-row1">
      <span class="handle" title="드래그로 순서 변경">⠿</span>
      <label class="field">MonsterType
        <select class="mt-sel">${mtUnmapped}${mtOptions.join('')}</select>
      </label>
      <label class="field">BehaviorTree
        <select class="bt-sel">${btUnmapped}${btOptions.join('')}</select>
      </label>
      ${fallbackLabel}
      <button class="x-btn x" title="삭제">✕</button>
    </div>
    <div class="msd-row2">
      <label class="field">MonsterCount <input type="number" step="any" class="cnt" value="${m.monsterCount}"></label>
      <label class="field">SpawnTime <input type="number" step="any" class="time" value="${m.spawnTime}"></label>
      <label class="field">SpawnInterval <input type="number" step="any" class="int" value="${m.spawnInterval}"></label>
      <label class="field wide">SpawnPointIndices <input type="text" class="pts" value="${escHtml(formatIndices(m.spawnPointIndices))}" placeholder="0, 1, 2"></label>
    </div>
  `;

  el.querySelector('.mt-sel').onchange = e => setMonsterField(waveIdx, monsterIdx, 'monsterTypeName', e.target.value);
  el.querySelector('.bt-sel').onchange = e => setMonsterField(waveIdx, monsterIdx, 'behaviorTreeName', e.target.value);
  el.querySelector('.cnt').oninput = e => setMonsterField(waveIdx, monsterIdx, 'monsterCount', parseFloat(e.target.value) || 0);
  el.querySelector('.time').oninput = e => setMonsterField(waveIdx, monsterIdx, 'spawnTime', parseFloat(e.target.value) || 0);
  el.querySelector('.int').oninput = e => setMonsterField(waveIdx, monsterIdx, 'spawnInterval', parseFloat(e.target.value) || 0);
  el.querySelector('.pts').oninput = e => setMonsterField(waveIdx, monsterIdx, 'spawnPointIndices', parseIndices(e.target.value));
  el.querySelector('.x-btn').onclick = () => deleteMonster(waveIdx, monsterIdx);

  return el;
}

// ════════════════════════════════════════════════════════════════════
// Render: settings modal (operates on curTheme().settings)
// ════════════════════════════════════════════════════════════════════
function renderSettings() {
  const t = curTheme();
  document.getElementById('settings-theme-name').textContent = t ? t.name : '(없음)';
  const mt = document.getElementById('mt-list');
  const bt = document.getElementById('bt-list');
  mt.innerHTML = ''; bt.innerHTML = '';
  if (!t) return;
  t.settings.monsterTypeMap.forEach((r, i) => mt.appendChild(buildMappingRow(r, 'mt', i)));
  t.settings.behaviorTreeMap.forEach((r, i) => bt.appendChild(buildMappingRow(r, 'bt', i)));
}

function buildMappingRow(row, kind, idx) {
  const el = document.createElement('div');
  el.className = 'map-row';
  el.draggable = true;
  el.addEventListener('dragstart', e => {
    if (!e.target.classList.contains('handle')) { e.preventDefault(); return; }
    onDragStart(e, 'mapping-' + kind, { from: idx });
  });
  el.addEventListener('dragover', onDragOver);
  el.addEventListener('drop', e => onDrop(e, 'mapping-' + kind, { to: idx }));
  el.addEventListener('dragleave', onDragLeave);
  el.addEventListener('dragend', onDragEnd);

  el.innerHTML = `
    <span class="handle" title="드래그로 순서 변경">⠿</span>
    <input type="text" class="map-name" value="${escHtml(row.name)}" placeholder="표시 이름">
    <div class="map-path"><input type="text" value="${escHtml(row.path)}" placeholder="${kind === 'mt' ? 'EnemyTypes/.../BP_X.BP_X_C' : 'AI/BT_X.BT_X'}"></div>
    <button class="x" title="삭제">✕</button>
  `;
  const [nameInp, pathInp] = el.querySelectorAll('input');
  nameInp.oninput = () => setMappingField(kind, idx, 'name', nameInp.value);
  pathInp.oninput = () => setMappingField(kind, idx, 'path', pathInp.value);
  el.querySelector('.x').onclick = () => deleteMappingRow(kind, idx);
  return el;
}

// ════════════════════════════════════════════════════════════════════
// Mutations: themes
// ════════════════════════════════════════════════════════════════════
function newThemeObj(name) {
  return {
    id: makeId(),
    name: name || 'New_Theme',
    settings: { monsterTypeMap: [], behaviorTreeMap: [] },
    stages: []
  };
}

function addTheme() {
  let n = 1;
  while (themes.find(t => t.name === `New_Theme_${n}`)) n++;
  const t = newThemeObj(`New_Theme_${n}`);
  themes.push(t);
  currentThemeId = t.id;
  currentStageId = null;
  saveDebounced();
  renderAll();
  setStatus('새 테마 추가됨');
}

function deleteCurrentTheme() {
  const t = curTheme(); if (!t) return;
  const detail = `포함된 스테이지 ${t.stages.length}개와 ` +
    `MonsterType/BT 매핑 (${t.settings.monsterTypeMap.length}+${t.settings.behaviorTreeMap.length}개)이 모두 삭제됩니다.`;
  askConfirm(`테마 "${t.name}"을(를) 삭제하시겠습니까?\n\n${detail}`, () => {
    themes = themes.filter(x => x.id !== t.id);
    currentThemeId = themes[0]?.id || null;
    currentStageId = curTheme()?.stages[0]?.id || null;
    saveDebounced();
    renderAll();
    setStatus('테마 삭제됨');
  });
}

function duplicateCurrentTheme() {
  const t = curTheme(); if (!t) return;
  const copy = JSON.parse(JSON.stringify(t));
  copy.id = makeId();
  // re-id stages too
  copy.stages.forEach(s => { s.id = makeId(); });
  let n = 2;
  let base = t.name.replace(/_copy\d*$/, '');
  while (themes.find(x => x.name === `${base}_copy${n}`)) n++;
  copy.name = `${base}_copy${n}`;
  const idx = themes.indexOf(t);
  themes.splice(idx + 1, 0, copy);
  currentThemeId = copy.id;
  currentStageId = copy.stages[0]?.id || null;
  saveDebounced();
  renderAll();
  setStatus('테마 복제됨');
}

function selectTheme(id) {
  if (currentThemeId === id) return;
  currentThemeId = id;
  const t = curTheme();
  currentStageId = t?.stages[0]?.id || null;
  closeSettingsModal(); // settings was scoped to old theme
  saveDebounced();
  renderAll();
}

function promptRenameCurrentTheme() {
  const t = curTheme(); if (!t) return;
  const next = prompt('테마 이름:', t.name);
  if (next == null) return; // cancel
  const trimmed = next.trim();
  if (!trimmed) { setStatus('빈 이름 무시됨'); return; }
  t.name = trimmed;
  saveDebounced();
  renderThemeBar();
  setStatus('테마 이름 변경됨');
}

// ════════════════════════════════════════════════════════════════════
// Mutations: stages
// ════════════════════════════════════════════════════════════════════
function addStage() {
  const t = curTheme();
  if (!t) { setStatus('테마를 먼저 만들어주세요'); return; }
  let n = 1;
  while (t.stages.find(s => s.name === `New_Stage_${n}`)) n++;
  const s = { id: makeId(), name: `New_Stage_${n}`, waves: [] };
  t.stages.push(s);
  currentStageId = s.id;
  saveDebounced();
  renderThemeBar(); renderStageList(); renderEditor();
  setStatus('새 스테이지 추가됨');
}

function deleteCurrentStage() {
  const t = curTheme(); const s = curStage(); if (!t || !s) return;
  askConfirm(`스테이지 "${s.name}"을(를) 삭제하시겠습니까? 되돌릴 수 없습니다.`, () => {
    t.stages = t.stages.filter(x => x.id !== s.id);
    currentStageId = t.stages[0]?.id || null;
    saveDebounced();
    renderThemeBar(); renderStageList(); renderEditor();
    setStatus('스테이지 삭제됨');
  });
}

function duplicateCurrentStage() {
  const t = curTheme(); const s = curStage(); if (!t || !s) return;
  const copy = JSON.parse(JSON.stringify(s));
  copy.id = makeId();
  let n = 2;
  let base = s.name.replace(/_copy\d*$/, '');
  while (t.stages.find(x => x.name === `${base}_copy${n}`)) n++;
  copy.name = `${base}_copy${n}`;
  const idx = t.stages.indexOf(s);
  t.stages.splice(idx + 1, 0, copy);
  currentStageId = copy.id;
  saveDebounced();
  renderThemeBar(); renderStageList(); renderEditor();
  setStatus('스테이지 복제됨');
}

function selectStage(id) {
  if (currentStageId === id) return;
  currentStageId = id;
  saveDebounced();
  renderStageList(); renderEditor();
}

function renameCurrentStage(name) {
  const s = curStage(); if (!s) return;
  s.name = name;
  saveDebounced();
  renderThemeBar(); renderStageList();
}

// ════════════════════════════════════════════════════════════════════
// Mutations: waves
// ════════════════════════════════════════════════════════════════════
function newWaveObj() {
  return { monsters: [], waveDuration: 0, preInterludeTime: 15, waveReward: 10 };
}

function addWave(insertAt) {
  const s = curStage(); if (!s) return;
  const w = newWaveObj();
  if (typeof insertAt === 'number' && insertAt >= 0 && insertAt <= s.waves.length) {
    s.waves.splice(insertAt, 0, w);
  } else {
    s.waves.push(w);
  }
  saveDebounced();
  renderStageList(); renderEditor();
  setStatus('Wave 추가됨');
  setTimeout(() => {
    const list = document.getElementById('wave-list');
    const target = (typeof insertAt === 'number') ? list.children[insertAt] : list.lastElementChild;
    if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 0);
}

function deleteWave(idx) {
  const s = curStage(); if (!s) return;
  if (idx < 0 || idx >= s.waves.length) return;
  askConfirm(`Wave ${idx + 1}을(를) 삭제하시겠습니까?`, () => {
    s.waves.splice(idx, 1);
    saveDebounced();
    renderStageList(); renderEditor();
    setStatus('Wave 삭제됨');
  });
}

function duplicateWave(idx) {
  const s = curStage(); if (!s) return;
  if (idx < 0 || idx >= s.waves.length) return;
  const copy = JSON.parse(JSON.stringify(s.waves[idx]));
  s.waves.splice(idx + 1, 0, copy);
  saveDebounced();
  renderStageList(); renderEditor();
  setStatus('Wave 복제됨');
}

function moveWave(from, to) {
  const s = curStage(); if (!s) return;
  if (from === to || from < 0 || from >= s.waves.length) return;
  const [w] = s.waves.splice(from, 1);
  if (to > from) to--;
  s.waves.splice(to, 0, w);
  saveDebounced();
  renderEditor();
}

function setWaveField(idx, field, value) {
  const s = curStage(); if (!s) return;
  if (!s.waves[idx]) return;
  s.waves[idx][field] = value;
  saveDebounced();
}

// ════════════════════════════════════════════════════════════════════
// Mutations: monsters
// ════════════════════════════════════════════════════════════════════
function newMonsterObj() {
  return {
    monsterTypeName: '',
    monsterCount: 1,
    spawnTime: 1,
    spawnInterval: 1,
    spawnPointIndices: [0],
    behaviorTreeName: ''
  };
}

function addMonster(waveIdx) {
  const s = curStage(); if (!s) return;
  const w = s.waves[waveIdx]; if (!w) return;
  w.monsters.push(newMonsterObj());
  saveDebounced();
  renderEditor();
}

function deleteMonster(waveIdx, monsterIdx) {
  const s = curStage(); if (!s) return;
  const w = s.waves[waveIdx]; if (!w) return;
  w.monsters.splice(monsterIdx, 1);
  saveDebounced();
  renderEditor();
}

function moveMonster(waveIdx, from, to) {
  const s = curStage(); if (!s) return;
  const w = s.waves[waveIdx]; if (!w) return;
  if (from === to || from < 0 || from >= w.monsters.length) return;
  const [m] = w.monsters.splice(from, 1);
  if (to > from) to--;
  w.monsters.splice(to, 0, m);
  saveDebounced();
  renderEditor();
}

function setMonsterField(waveIdx, monsterIdx, field, value) {
  const s = curStage(); if (!s) return;
  const w = s.waves[waveIdx]; if (!w) return;
  const m = w.monsters[monsterIdx]; if (!m) return;
  m[field] = value;
  saveDebounced();
  if (field === 'monsterTypeName') renderEditor();
}

// ════════════════════════════════════════════════════════════════════
// Mutations: settings mappings (per-theme)
// ════════════════════════════════════════════════════════════════════
function mappingList(kind) {
  const t = curTheme(); if (!t) return null;
  return kind === 'mt' ? t.settings.monsterTypeMap : t.settings.behaviorTreeMap;
}

function addMappingRow(kind) {
  const list = mappingList(kind); if (!list) return;
  list.push({ name: '', path: '' });
  saveDebounced();
  renderSettings();
  renderEditor();
}

function deleteMappingRow(kind, idx) {
  const list = mappingList(kind); if (!list) return;
  list.splice(idx, 1);
  saveDebounced();
  renderSettings();
  renderEditor();
}

function moveMappingRow(kind, from, to) {
  const list = mappingList(kind); if (!list) return;
  if (from === to || from < 0 || from >= list.length) return;
  const [r] = list.splice(from, 1);
  if (to > from) to--;
  list.splice(to, 0, r);
  saveDebounced();
  renderSettings();
  renderEditor();
}

function setMappingField(kind, idx, field, value) {
  const list = mappingList(kind); if (!list) return;
  const row = list[idx]; if (!row) return;
  row[field] = value;
  saveDebounced();
  renderEditor();
}

// ════════════════════════════════════════════════════════════════════
// Drag and drop
// ════════════════════════════════════════════════════════════════════
function onDragStart(e, kind, payload) {
  dragState = { kind, ...payload };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', kind);
  e.currentTarget.classList.add('dragging');
}
function onDragOver(e) {
  if (!dragState) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const t = e.currentTarget;
  const rect = t.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  document.querySelectorAll('.drop-above, .drop-below').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
  t.classList.add(above ? 'drop-above' : 'drop-below');
}
function onDragLeave(e) {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom) {
    e.currentTarget.classList.remove('drop-above', 'drop-below');
  }
}
function onDrop(e, kind, payload) {
  if (!dragState || dragState.kind !== kind) return;
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const above = (e.clientY - rect.top) < rect.height / 2;
  const to = above ? payload.to : payload.to + 1;
  const from = dragState.from;

  if (kind === 'wave') {
    moveWave(from, to);
  } else if (kind === 'monster') {
    if (dragState.waveIdx === payload.waveIdx) moveMonster(payload.waveIdx, from, to);
  } else if (kind === 'mapping-mt' || kind === 'mapping-bt') {
    moveMappingRow(kind === 'mapping-mt' ? 'mt' : 'bt', from, to);
  }

  document.querySelectorAll('.drop-above, .drop-below').forEach(el => {
    el.classList.remove('drop-above', 'drop-below');
  });
}
function onDragEnd() {
  dragState = null;
  document.querySelectorAll('.dragging, .drop-above, .drop-below').forEach(el => {
    el.classList.remove('dragging', 'drop-above', 'drop-below');
  });
}

// ════════════════════════════════════════════════════════════════════
// Export
// ════════════════════════════════════════════════════════════════════
function buildStageExport(stage, themeSettings) {
  let unmappedMT = 0, unmappedBT = 0;
  const mtMap = themeSettings.monsterTypeMap || [];
  const btMap = themeSettings.behaviorTreeMap || [];

  const out = stage.waves.map((w, idx) => ({
    Name: String(idx + 1),
    WaveNum: idx + 1,
    MonsterSpawnData: w.monsters.map((m, i) => {
      let mtPath = '';
      if (m.monsterTypeName) {
        const r = mtMap.find(x => x.name === m.monsterTypeName);
        if (r) mtPath = r.path;
        else { unmappedMT++; console.warn(`[${stage.name}] Wave ${idx+1} entry ${i+1}: 매핑 없는 MonsterType "${m.monsterTypeName}"`); }
      } else {
        unmappedMT++;
        console.warn(`[${stage.name}] Wave ${idx+1} entry ${i+1}: MonsterType 비어있음 (이름없는 적${i+1})`);
      }

      let btField = BT_NONE;
      if (m.behaviorTreeName) {
        const r = btMap.find(x => x.name === m.behaviorTreeName);
        if (r) btField = wrapBT(r.path);
        else { unmappedBT++; console.warn(`[${stage.name}] Wave ${idx+1} entry ${i+1}: 매핑 없는 BehaviorTree "${m.behaviorTreeName}"`); }
      }

      return {
        MonsterType: wrapMT(mtPath),
        MonsterCount: m.monsterCount,
        SpawnTime: m.spawnTime,
        SpawnInterval: m.spawnInterval,
        SpawnPointIndices: Array.isArray(m.spawnPointIndices) ? [...m.spawnPointIndices] : [],
        BehaviorTree: btField
      };
    }),
    WaveDuration: w.waveDuration,
    PreInterludeTime: w.preInterludeTime,
    WaveReward: w.waveReward
  }));

  return { rows: out, unmappedMT, unmappedBT };
}

function exportCurrentStage() {
  const t = curTheme(); const s = curStage();
  if (!s) { setStatus('스테이지 없음'); return; }
  const { rows, unmappedMT, unmappedBT } = buildStageExport(s, t.settings);
  download(`${s.name}.json`, JSON.stringify(rows, null, '\t'));
  let msg = `${s.name}.json export 완료`;
  if (unmappedMT || unmappedBT) msg += ` (매핑 누락: MT ${unmappedMT}, BT ${unmappedBT}개 — 콘솔 확인)`;
  setStatus(msg);
}

async function exportAllStages() {
  const t = curTheme();
  if (!t || !t.stages.length) { setStatus('스테이지 없음'); return; }
  let totalMT = 0, totalBT = 0;
  for (let i = 0; i < t.stages.length; i++) {
    const { rows, unmappedMT, unmappedBT } = buildStageExport(t.stages[i], t.settings);
    download(`${t.stages[i].name}.json`, JSON.stringify(rows, null, '\t'));
    totalMT += unmappedMT; totalBT += unmappedBT;
    if (i < t.stages.length - 1) await sleep(150);
  }
  let msg = `[${t.name}] ${t.stages.length}개 스테이지 export 완료`;
  if (totalMT || totalBT) msg += ` (매핑 누락: MT ${totalMT}, BT ${totalBT}개)`;
  setStatus(msg);
}

function exportBackup() {
  const data = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    themes
  };
  download(`sow_waves_backup_${dateStr()}.json`, JSON.stringify(data, null, 2));
  setStatus('백업 export 완료');
}

// ════════════════════════════════════════════════════════════════════
// Import: multiple F_Wave stage JSON files (into current theme)
// ════════════════════════════════════════════════════════════════════
function deriveMonsterName(shortPath) {
  if (!shortPath) return '';
  const lastSeg = shortPath.split('/').pop();
  const cls = lastSeg.split('.').pop();
  let n = cls;
  if (n.startsWith('BP_Enemy_')) n = n.slice('BP_Enemy_'.length);
  else if (n.startsWith('BP_')) n = n.slice('BP_'.length);
  if (n.endsWith('_C')) n = n.slice(0, -2);
  return n || cls || 'Monster';
}
function deriveBTName(shortPath) {
  if (!shortPath) return '';
  const lastSeg = shortPath.split('/').pop();
  const cls = lastSeg.split('.').pop();
  return cls || 'BT';
}

function parseFWaveStage(filename, raw, ctx) {
  const baseName = filename.replace(/\.json$/i, '');
  const stageName = uniqueName(baseName, ctx.stageNameSet);
  ctx.stageNameSet.add(stageName);

  const waves = (Array.isArray(raw) ? raw : []).map(w => ({
    monsters: (w.MonsterSpawnData || []).map(m => {
      const mtShort = unwrapMT(m.MonsterType || '');
      let mtName = '';
      if (mtShort) {
        if (ctx.mtPathIdx.has(mtShort)) {
          mtName = ctx.mtPathIdx.get(mtShort);
        } else {
          const derived = uniqueName(deriveMonsterName(mtShort), ctx.mtNameSet);
          ctx.newMT.push({ name: derived, path: mtShort });
          ctx.mtPathIdx.set(mtShort, derived);
          ctx.mtNameSet.add(derived);
          mtName = derived;
        }
      }
      let btName = '';
      const btRaw = m.BehaviorTree;
      if (btRaw && btRaw !== BT_NONE) {
        const btShort = unwrapBT(btRaw);
        if (btShort) {
          if (ctx.btPathIdx.has(btShort)) {
            btName = ctx.btPathIdx.get(btShort);
          } else {
            const derived = uniqueName(deriveBTName(btShort), ctx.btNameSet);
            ctx.newBT.push({ name: derived, path: btShort });
            ctx.btPathIdx.set(btShort, derived);
            ctx.btNameSet.add(derived);
            btName = derived;
          }
        }
      }
      return {
        monsterTypeName: mtName,
        monsterCount: Number(m.MonsterCount) || 0,
        spawnTime: Number(m.SpawnTime) || 0,
        spawnInterval: Number(m.SpawnInterval) || 0,
        spawnPointIndices: Array.isArray(m.SpawnPointIndices) ? m.SpawnPointIndices.slice() : [],
        behaviorTreeName: btName
      };
    }),
    waveDuration:     Number(w.WaveDuration) || 0,
    preInterludeTime: Number(w.PreInterludeTime) || 0,
    waveReward:       Number(w.WaveReward) || 0
  }));

  return { id: makeId(), name: stageName, waves };
}

function importStages(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;
  const t = curTheme();
  if (!t) {
    askConfirm('현재 테마가 없습니다. 먼저 테마를 만든 뒤 다시 가져와주세요.', () => {});
    return;
  }

  const ctx = {
    newMT: [], newBT: [], newStages: [],
    mtPathIdx: new Map(t.settings.monsterTypeMap.map(r => [r.path, r.name])),
    btPathIdx: new Map(t.settings.behaviorTreeMap.map(r => [r.path, r.name])),
    mtNameSet: new Set(t.settings.monsterTypeMap.map(r => r.name)),
    btNameSet: new Set(t.settings.behaviorTreeMap.map(r => r.name)),
    stageNameSet: new Set(t.stages.map(s => s.name))
  };
  const errors = [];

  Promise.all(files.map(f =>
    f.text().then(text => ({ file: f, text })).catch(e => ({ file: f, error: e.message }))
  )).then(results => {
    for (const r of results) {
      if (r.error) { errors.push(`${r.file.name}: 읽기 실패 — ${r.error}`); continue; }
      let parsed;
      try { parsed = JSON.parse(r.text); }
      catch (e) { errors.push(`${r.file.name}: JSON 파싱 실패 — ${e.message}`); continue; }
      if (!Array.isArray(parsed)) { errors.push(`${r.file.name}: 최상위가 배열이 아님 (F_Wave 배열 필요)`); continue; }
      try {
        const stage = parseFWaveStage(r.file.name, parsed, ctx);
        ctx.newStages.push(stage);
      } catch (e) {
        errors.push(`${r.file.name}: ${e.message}`);
      }
    }

    if (!ctx.newStages.length) {
      askConfirm(`가져온 스테이지 없음.\n\n실패 ${errors.length}건:\n` + errors.join('\n'), () => {});
      return;
    }

    const summarize = arr => {
      const names = arr.map(r => r.name);
      const head = names.slice(0, 5).join(', ');
      return arr.length > 5 ? `${head} … (+${arr.length - 5})` : head;
    };

    let msg = `[테마: ${t.name}]에 ${ctx.newStages.length}개 스테이지를 추가합니다:\n  ${ctx.newStages.map(s => s.name).join(', ')}`;
    if (ctx.newMT.length) msg += `\n\n신규 MonsterType 매핑 ${ctx.newMT.length}개:\n  ${summarize(ctx.newMT)}`;
    if (ctx.newBT.length) msg += `\n\n신규 BehaviorTree 매핑 ${ctx.newBT.length}개:\n  ${summarize(ctx.newBT)}`;
    if (errors.length) msg += `\n\n실패 ${errors.length}건:\n  ${errors.join('\n  ')}`;
    msg += '\n\n계속하시겠습니까?';

    askConfirm(msg, () => {
      t.stages = t.stages.concat(ctx.newStages);
      t.settings.monsterTypeMap = t.settings.monsterTypeMap.concat(ctx.newMT);
      t.settings.behaviorTreeMap = t.settings.behaviorTreeMap.concat(ctx.newBT);
      currentStageId = ctx.newStages[0].id;
      saveAll();
      renderAll();
      setStatus(`${ctx.newStages.length}개 스테이지 가져옴` +
        (ctx.newMT.length || ctx.newBT.length ? ` (신규 매핑 MT ${ctx.newMT.length}, BT ${ctx.newBT.length})` : ''));
    });
  });
}

// ════════════════════════════════════════════════════════════════════
// Import: backup file (overwrites everything)
// ────────────────────────────────────────────────────────────────────
// Accepts schemaVersion 2 (themes-based) and 1 (legacy levels+global
// settings). For v1 backups, the old data is wrapped into one Forest
// theme to match the current model.
// ════════════════════════════════════════════════════════════════════
function importBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try { data = JSON.parse(e.target.result); }
    catch (err) { askConfirm('JSON 파싱 실패: ' + err.message, () => {}); return; }
    if (!data) { askConfirm('백업 파일이 비어있습니다.', () => {}); return; }

    let normalized = null;
    if (data.schemaVersion === 2 && Array.isArray(data.themes)) {
      normalized = data.themes;
    } else if (data.schemaVersion === 1 && Array.isArray(data.levels) && data.settings) {
      // legacy: wrap into a single Forest theme
      normalized = [{
        id: makeId(),
        name: 'Forest',
        settings: data.settings,
        stages: data.levels.map(l => ({
          id: l.id || makeId(),
          name: l.name || 'Untitled',
          waves: l.waves || []
        }))
      }];
    } else {
      askConfirm('백업 파일 형식이 잘못되었습니다 (schemaVersion 1 또는 2 필요).', () => {});
      return;
    }
    if (data.schemaVersion > SCHEMA_VERSION) {
      console.warn(`Backup schemaVersion ${data.schemaVersion} > current ${SCHEMA_VERSION}; attempting anyway.`);
    }

    const stageCount = normalized.reduce((n, t) => n + (t.stages?.length || 0), 0);
    askConfirm(
      `백업을 가져오면 현재 데이터가 모두 덮어쓰기됩니다.\n\n` +
      `가져올 데이터: 테마 ${normalized.length}개, 스테이지 합계 ${stageCount}개\n\n` +
      `계속하시겠습니까?`,
      () => {
        themes = normalized.map(t => ({
          id: t.id || makeId(),
          name: t.name || 'Untitled',
          settings: {
            monsterTypeMap: (t.settings?.monsterTypeMap || []).map(r => ({
              name: r.name || '',
              path: unwrapMT(r.path || '')
            })),
            behaviorTreeMap: (t.settings?.behaviorTreeMap || []).map(r => ({
              name: r.name || '',
              path: unwrapBT(r.path || '')
            }))
          },
          stages: (t.stages || []).map(s => ({
            id: s.id || makeId(),
            name: s.name || 'Untitled',
            waves: (s.waves || []).map(w => ({
              monsters: (w.monsters || []).map(m => ({
                monsterTypeName: m.monsterTypeName ?? '',
                monsterCount: m.monsterCount ?? 0,
                spawnTime: m.spawnTime ?? 0,
                spawnInterval: m.spawnInterval ?? 0,
                spawnPointIndices: Array.isArray(m.spawnPointIndices) ? [...m.spawnPointIndices] : [],
                behaviorTreeName: m.behaviorTreeName ?? ''
              })),
              waveDuration: w.waveDuration ?? 0,
              preInterludeTime: w.preInterludeTime ?? 0,
              waveReward: w.waveReward ?? 0
            }))
          }))
        }));
        currentThemeId = themes[0]?.id || null;
        currentStageId = curTheme()?.stages[0]?.id || null;
        saveAll();
        renderAll();
        setStatus('백업 가져오기 완료');
      }
    );
  };
  reader.readAsText(file);
}

// ════════════════════════════════════════════════════════════════════
// Settings / Confirm modals
// ════════════════════════════════════════════════════════════════════
function openSettingsModal() {
  if (!curTheme()) { setStatus('테마를 먼저 만들어주세요'); return; }
  renderSettings();
  document.getElementById('settings-modal').classList.add('open');
}
function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('open');
}

function askConfirm(msg, cb) {
  const m = document.getElementById('confirm-msg');
  m.innerText = msg;
  confirmCb = cb;
  document.getElementById('confirm-modal').classList.add('open');
}
function confirmYes() {
  const cb = confirmCb;
  closeConfirmModal();
  if (cb) cb();
}
function closeConfirmModal() {
  confirmCb = null;
  document.getElementById('confirm-modal').classList.remove('open');
}

// ════════════════════════════════════════════════════════════════════
// Keyboard shortcuts
// ════════════════════════════════════════════════════════════════════
function findFocusedWaveIdx() {
  const a = document.activeElement;
  if (!a) return -1;
  const w = a.closest('.wave');
  return w ? parseInt(w.dataset.waveIdx, 10) : -1;
}

document.addEventListener('keydown', e => {
  const modalOpen = document.querySelector('.modal.open');
  if (modalOpen) {
    if (e.key === 'Escape') {
      if (modalOpen.id === 'settings-modal') closeSettingsModal();
      else if (modalOpen.id === 'confirm-modal') closeConfirmModal();
    }
    return;
  }
  if (!e.ctrlKey && !e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === 's')      { e.preventDefault(); saveAll(); }
  else if (k === 'n') { e.preventDefault(); addWave(); }
  else if (k === 'd') {
    e.preventDefault();
    const idx = findFocusedWaveIdx();
    if (idx >= 0) duplicateWave(idx);
    else setStatus('복제할 Wave 위에서 입력 포커스가 필요합니다');
  }
});

// ════════════════════════════════════════════════════════════════════
// Init
// ════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  loadAll();
  renderAll();
  setStatus('준비');
});

document.addEventListener('click', e => {
  if (e.target.id === 'settings-modal') closeSettingsModal();
  if (e.target.id === 'confirm-modal') closeConfirmModal();
});
