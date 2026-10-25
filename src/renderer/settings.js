const api = window.keyclickSettings;
const $ = (id) => document.getElementById(id);

const DEFAULT_SHORTCUT = 'CommandOrControl+Alt+K';
const PACK_GROUP_ORDER = ['Clicky', 'Tactile', 'Linear', 'Funny'];
const CATEGORY_META = [
  { id: 'GENERIC', name: 'Regular keys', desc: 'Letters, numbers, and everything without its own entry.' },
  { id: 'SPACE', name: 'Space', desc: 'The big stabilizer thock.' },
  { id: 'ENTER', name: 'Enter', desc: 'Includes the numpad Enter.' },
  { id: 'BACKSPACE', name: 'Backspace', desc: 'Dedicated big-key recording.' },
  { id: 'TAB', name: 'Tab', desc: 'Own twip in Funny Mode; regular-key sound in recorded packs.' },
  { id: 'ESCAPE', name: 'Escape', desc: 'Own squeak in Funny Mode; regular-key sound in recorded packs.' },
  { id: 'ARROWS', name: 'Arrow keys', desc: 'Uses the regular-key sound.' },
  { id: 'MODIFIERS', name: 'Modifier keys', desc: 'Shift, Ctrl, Alt/Option, Cmd — uses the regular-key sound.' },
];
const DEDICATED = new Set(['SPACE', 'ENTER', 'BACKSPACE', 'TAB', 'ESCAPE']);
const SAMPLE_EXTENSIONS = ['.mp3', '.wav'];

let settings = null;
let lastShortcut = DEFAULT_SHORTCUT;
let extras = { packs: [], version: '', platform: '', hookOk: true, shortcutOk: true };

// ---------- theme ----------

const themeMql = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const pref = settings ? settings.theme : 'system';
  document.documentElement.dataset.theme = pref === 'system' ? (themeMql.matches ? 'dark' : 'light') : pref;
}

themeMql.addEventListener('change', () => {
  if (!settings || settings.theme === 'system') applyTheme();
});

// ---------- banners ----------

const banners = {};

function setBanner(name, kind, message, action) {
  banners[name] = kind ? { kind, message, action } : null;
  renderBanner();
}

function renderBanner() {
  const entry = ['permission', 'shortcut', 'pack', 'preview'].map((n) => banners[n]).find(Boolean);
  const el = $('banner');
  if (!entry) {
    el.classList.add('hidden');
    return;
  }
  el.className = 'banner ' + entry.kind;
  $('banner-text').textContent = entry.message;
  const btn = $('banner-action');
  if (entry.action) {
    btn.textContent = entry.action.label;
    btn.classList.remove('hidden');
    btn.onclick = entry.action.run;
  } else {
    btn.classList.add('hidden');
    btn.onclick = null;
  }
}

function refreshStaticBanners() {
  if (!extras.hookOk) {
    setBanner(
      'permission',
      'error',
      'KeyClick can’t hear your keyboard yet — grant Input Monitoring (and Accessibility) permission in Privacy & Security, then relaunch KeyClick.',
      { label: 'Open Privacy Settings', run: () => api.openPrivacySettings() }
    );
  } else {
    setBanner('permission', null);
  }
  if (!extras.shortcutOk) {
    setBanner('shortcut', 'warn', 'The global shortcut is taken by another app — pick a new one on the Shortcuts page.');
  } else {
    setBanner('shortcut', null);
  }
}

// ---------- audio preview ----------

const previewCtx = new AudioContext();
const previewCache = new Map();

async function playSample(base) {
  try {
    if (previewCtx.state === 'suspended') await previewCtx.resume();
    // Recorded packs ship .mp3, the synthesized Funny pack ships .wav.
    let buffer;
    for (const ext of SAMPLE_EXTENSIONS) {
      const url = base + ext;
      buffer = previewCache.get(url);
      if (buffer === undefined) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          buffer = await previewCtx.decodeAudioData(await response.arrayBuffer());
          previewCache.set(url, buffer);
        } catch {
          buffer = undefined;
        }
      }
      if (buffer) break;
    }
    if (!buffer) throw new Error('no audio file found for this item');
    const source = previewCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(previewCtx.destination);
    source.start(0);
  } catch (err) {
    setBanner('preview', 'warn', 'Could not play preview — ' + err.message);
  }
}

function packById(id) {
  return extras.packs.find((p) => p.id === id);
}

function categorySampleBase(pack, categoryId) {
  const file = DEDICATED.has(categoryId) ? 'press/' + categoryId : 'press/GENERIC_R1';
  return pack.url + '/' + file;
}

// ---------- rendering ----------

function buildPackSelect() {
  const select = $('pack-select');
  select.textContent = '';
  for (const pack of extras.packs) {
    const option = document.createElement('option');
    option.value = pack.id;
    option.textContent = pack.caption;
    select.appendChild(option);
  }
}

function renderPacks() {
  const list = $('pack-list');
  list.textContent = '';
  for (const group of PACK_GROUP_ORDER) {
    const packs = extras.packs.filter((p) => p.group === group);
    if (packs.length === 0) continue;

    const wrap = document.createElement('div');
    wrap.className = 'pack-group';
    const heading = document.createElement('h2');
    heading.textContent = group;
    wrap.appendChild(heading);

    const cards = document.createElement('div');
    cards.className = 'pack-cards';
    for (const pack of packs) {
      const active = pack.id === settings.pack;

      const card = document.createElement('div');
      card.className = 'pack-card' + (active ? ' active' : '');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', pack.caption + (active ? ' (active)' : ''));

      const play = document.createElement('button');
      play.className = 'pack-play';
      play.textContent = '▶';
      play.setAttribute('aria-label', 'Preview ' + pack.caption);
      play.addEventListener('click', (e) => {
        e.stopPropagation();
        playSample(pack.url + '/press/GENERIC_R1');
      });

      const info = document.createElement('div');
      info.className = 'pack-info';
      const name = document.createElement('div');
      name.className = 'pack-name';
      name.textContent = pack.caption;
      const desc = document.createElement('div');
      desc.className = 'pack-desc';
      desc.textContent = pack.desc;
      info.append(name, desc);

      card.append(play, info);
      if (active) {
        const check = document.createElement('span');
        check.className = 'pack-check';
        check.textContent = '✓';
        check.setAttribute('aria-hidden', 'true');
        card.appendChild(check);
      }

      const selectPack = () => api.set({ pack: pack.id });
      card.addEventListener('click', selectPack);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectPack();
        }
      });
      cards.appendChild(card);
    }
    wrap.appendChild(cards);
    list.appendChild(wrap);
  }
}

function renderCategories() {
  const list = $('category-list');
  list.textContent = '';
  for (const meta of CATEGORY_META) {
    const current = settings.categories[meta.id] || { enabled: true, volume: 1 };

    const row = document.createElement('div');
    row.className = 'cat-row';

    const text = document.createElement('div');
    const name = document.createElement('label');
    name.htmlFor = 'cat-' + meta.id;
    name.textContent = meta.name;
    const desc = document.createElement('p');
    desc.className = 'hint';
    desc.textContent = meta.desc;
    text.append(name, desc);

    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '1';
    volume.step = '0.01';
    volume.value = current.volume;
    volume.setAttribute('aria-label', meta.name + ' volume');
    volume.addEventListener('input', () => {
      api.set({ categories: { [meta.id]: { enabled: current.enabled, volume: parseFloat(volume.value) } } });
    });

    const play = document.createElement('button');
    play.className = 'pack-play';
    play.textContent = '▶';
    play.setAttribute('aria-label', 'Preview ' + meta.name);
    play.addEventListener('click', () => {
      const pack = packById(settings.pack) || extras.packs[0];
      if (pack) playSample(categorySampleBase(pack, meta.id));
    });

    const toggle = document.createElement('span');
    toggle.className = 'switch';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'cat-' + meta.id;
    box.checked = current.enabled;
    box.addEventListener('change', () => {
      api.set({ categories: { [meta.id]: { enabled: box.checked, volume: current.volume } } });
    });
    const knob = document.createElement('span');
    toggle.append(box, knob);

    row.append(text, volume, play, toggle);
    list.appendChild(row);
  }
}

// Rebuilding the category rows mid-slider-drag would yank the thumb out from
// under the pointer, so skip the rebuild while one of them is being dragged.
function maybeRenderCategories() {
  const active = document.activeElement;
  if (active && active.type === 'range' && $('category-list').contains(active)) return;
  renderCategories();
}

function applySettings(next) {
  settings = next;
  applyTheme();

  $('enabled').checked = settings.enabled;
  $('packs-enabled').checked = settings.enabled;
  $('volume').value = settings.volume;
  $('packs-volume').value = settings.volume;
  $('launchAtLogin').checked = settings.launchAtLogin;
  $('launchMuted').checked = settings.launchMuted;
  $('theme').value = settings.theme;
  $('playRelease').checked = settings.playRelease;
  if ($('pack-select').value !== settings.pack) $('pack-select').value = settings.pack;

  renderShortcut();
  if (extras.packs.length === 0) return;
  renderPacks();
  maybeRenderCategories();
}

// ---------- shortcut ----------

function fmtShortcut(accel) {
  const mac = extras.platform === 'darwin';
  const map = {
    CommandOrControl: mac ? '⌘' : 'Ctrl',
    Cmd: '⌘',
    Command: '⌘',
    Super: mac ? '⌘' : 'Win',
    Ctrl: '⌃',
    Control: '⌃',
    Alt: mac ? '⌥' : 'Alt',
    Option: '⌥',
    Shift: '⇧',
    Plus: '+',
  };
  return accel.split('+').map((part) => map[part] || part).join(' ');
}

function renderShortcut() {
  $('shortcut-display').textContent = fmtShortcut(settings.toggleShortcut);
}

function showStatus(message, kind) {
  const el = $('shortcut-status');
  el.textContent = message;
  el.className = message ? 'status' + (kind ? ' ' + kind : '') : 'status hidden';
}

let recording = false;

$('record-shortcut').addEventListener('click', () => {
  recording = !recording;
  $('record-shortcut').textContent = recording ? 'Press keys…' : 'Change…';
  showStatus(recording ? 'Waiting for a key combination…' : '', '');
});

function stopRecording() {
  recording = false;
  $('record-shortcut').textContent = 'Change…';
}

document.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    stopRecording();
    showStatus('Cancelled.', '');
    return;
  }
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

  const parts = [];
  if (e.metaKey) parts.push(extras.platform === 'darwin' ? 'Cmd' : 'Super');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (parts.length === 0) {
    showStatus('Hold at least one modifier (Cmd/Ctrl/Alt/Shift).', 'error');
    return;
  }

  const code = e.code || '';
  const key = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : '';
  if (!/^[A-Z0-9]$/.test(key)) {
    showStatus('Use a letter or number as the main key.', 'error');
    return;
  }

  parts.push(key);
  const accel = parts.join('+');
  stopRecording();
  showStatus('Setting ' + fmtShortcut(accel) + '…', '');
  api.set({ toggleShortcut: accel });
});

// ---------- wiring ----------

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

function showPage(page) {
  const target = $('page-' + page) ? page : 'general';
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === target));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + target));
}

api.onShowPage(showPage);

$('enabled').addEventListener('change', () => api.set({ enabled: $('enabled').checked }));
$('packs-enabled').addEventListener('change', () => api.set({ enabled: $('packs-enabled').checked }));
$('volume').addEventListener('input', () => {
  $('packs-volume').value = $('volume').value;
  api.set({ volume: parseFloat($('volume').value) });
});
$('packs-volume').addEventListener('input', () => {
  $('volume').value = $('packs-volume').value;
  api.set({ volume: parseFloat($('packs-volume').value) });
});
$('pack-select').addEventListener('change', () => api.set({ pack: $('pack-select').value }));
$('launchAtLogin').addEventListener('change', () => api.set({ launchAtLogin: $('launchAtLogin').checked }));
$('launchMuted').addEventListener('change', () => api.set({ launchMuted: $('launchMuted').checked }));
$('theme').addEventListener('change', () => api.set({ theme: $('theme').value }));
$('playRelease').addEventListener('change', () => api.set({ playRelease: $('playRelease').checked }));

$('reset').addEventListener('click', async () => {
  const snap = await api.reset();
  absorbSnapshot(snap);
  showStatus('', '');
});

$('reset-categories').addEventListener('click', () => {
  const categories = {};
  for (const meta of CATEGORY_META) categories[meta.id] = { enabled: true, volume: 1 };
  api.set({ categories });
});

$('reset-shortcut').addEventListener('click', () => api.set({ toggleShortcut: DEFAULT_SHORTCUT }));

$('repo-link').addEventListener('click', () => api.openExternal('https://github.com/rakhumn/keyclick'));
$('kbsim-link').addEventListener('click', () => api.openExternal('https://github.com/tplai/kbsim'));

api.onChanged((next) => {
  if (settings && next.toggleShortcut !== lastShortcut) {
    lastShortcut = next.toggleShortcut;
    showStatus('Shortcut updated to ' + fmtShortcut(next.toggleShortcut) + '.', 'ok');
  }
  applySettings(next);
});

api.onPackStatus(({ ok, pack, error }) => {
  if (ok) {
    setBanner('pack', null);
    return;
  }
  const found = packById(pack);
  const caption = (found && found.caption) || pack || 'pack';
  setBanner('pack', 'warn', 'Sound pack “' + caption + '” failed to load' + (error ? ' — ' + error : '') + '. The previous pack keeps playing.');
});

api.onShortcutConflict(({ attempted, active }) => {
  showStatus('“' + fmtShortcut(attempted) + '” is already used by another app. Keeping ' + fmtShortcut(active) + '.', 'error');
});

// ---------- init ----------

function absorbSnapshot(snap) {
  extras = {
    ...extras,
    version: snap.version || extras.version,
    platform: snap.platform || extras.platform,
    hookOk: snap.hookOk !== false,
    shortcutOk: snap.shortcutOk !== false,
  };
  applySettings(snap);
  refreshStaticBanners();
}

(async function init() {
  try {
    const snap = await api.get();
    extras = {
      packs: snap.packs || [],
      version: snap.version || '',
      platform: snap.platform || '',
      hookOk: snap.hookOk !== false,
      shortcutOk: snap.shortcutOk !== false,
    };
    lastShortcut = snap.toggleShortcut;
    buildPackSelect();
    $('about-version').textContent = 'Version ' + extras.version;
    applySettings(snap);
    refreshStaticBanners();
  } catch (err) {
    setBanner('permission', 'error', 'Could not load settings: ' + err.message);
  }
})();
