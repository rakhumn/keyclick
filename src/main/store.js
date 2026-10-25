const fs = require('fs');
const path = require('path');

const CATEGORY_IDS = ['GENERIC', 'SPACE', 'ENTER', 'BACKSPACE', 'TAB', 'ESCAPE', 'ARROWS', 'MODIFIERS'];
const THEMES = ['system', 'light', 'dark'];

function defaults() {
  return {
    enabled: true,
    pack: 'mxbrown',
    volume: 0.8,
    launchAtLogin: false,
    launchMuted: false,
    theme: 'system',
    playRelease: true,
    toggleShortcut: 'CommandOrControl+Alt+K',
    categories: CATEGORY_IDS.reduce((map, id) => {
      map[id] = { enabled: true, volume: 1 };
      return map;
    }, {}),
  };
}

const DEFAULTS = defaults();

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Single source of truth for what a settings patch may contain. Renderer IPC
// is fed through this before it reaches the store, so unknown keys and
// wrong-typed values are dropped instead of written to disk.
function sanitizePatch(patch, packIds) {
  const clean = {};
  if (!patch || typeof patch !== 'object') return clean;
  if (typeof patch.enabled === 'boolean') clean.enabled = patch.enabled;
  if (typeof patch.pack === 'string' && packIds.includes(patch.pack)) clean.pack = patch.pack;
  if (typeof patch.volume === 'number' && Number.isFinite(patch.volume)) clean.volume = clamp01(patch.volume);
  if (typeof patch.launchAtLogin === 'boolean') clean.launchAtLogin = patch.launchAtLogin;
  if (typeof patch.launchMuted === 'boolean') clean.launchMuted = patch.launchMuted;
  if (THEMES.includes(patch.theme)) clean.theme = patch.theme;
  if (typeof patch.playRelease === 'boolean') clean.playRelease = patch.playRelease;
  if (typeof patch.toggleShortcut === 'string' && /^[A-Za-z0-9+]+$/.test(patch.toggleShortcut)) {
    clean.toggleShortcut = patch.toggleShortcut;
  }
  if (patch.categories && typeof patch.categories === 'object') {
    const categories = {};
    for (const id of CATEGORY_IDS) {
      const row = patch.categories[id];
      if (!row || typeof row !== 'object') continue;
      categories[id] = {
        enabled: typeof row.enabled === 'boolean' ? row.enabled : DEFAULTS.categories[id].enabled,
        volume:
          typeof row.volume === 'number' && Number.isFinite(row.volume)
            ? clamp01(row.volume)
            : DEFAULTS.categories[id].volume,
      };
    }
    if (Object.keys(categories).length > 0) clean.categories = categories;
  }
  return clean;
}

class Store {
  constructor(userDataPath, packIds) {
    this.filePath = path.join(userDataPath, 'settings.json');
    this.packIds = packIds;
    this._saveTimer = null;
    // Files written by older versions miss newer keys, and a hand-edited file
    // may hold anything — sanitize on load, not just on IPC.
    this.data = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const clean = sanitizePatch(JSON.parse(raw), this.packIds);
      return this._apply(defaults(), clean);
    } catch {
      return defaults();
    }
  }

  _apply(data, clean) {
    for (const [key, value] of Object.entries(clean)) {
      if (key === 'categories') {
        data.categories = { ...data.categories, ...value };
      } else {
        data[key] = value;
      }
    }
    return data;
  }

  set(cleanPatch) {
    this._apply(this.data, cleanPatch);
    this._saveSoon();
    return this.all;
  }

  reset() {
    this.data = defaults();
    this._saveNow();
    return this.all;
  }

  // Persist any pending debounced write immediately (called on quit).
  flush() {
    this._saveNow();
  }

  _saveSoon() {
    clearTimeout(this._saveTimer);
    // Settings arrive in bursts while dragging a slider; write once it settles.
    this._saveTimer = setTimeout(() => this._saveNow(), 200);
  }

  _saveNow() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    // Atomic write: a crash mid-write must not leave a half-written file.
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  get all() {
    return JSON.parse(JSON.stringify(this.data));
  }
}

module.exports = { Store, DEFAULTS, CATEGORY_IDS, sanitizePatch };
