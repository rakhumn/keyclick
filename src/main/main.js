// Tray-resident background app.
// Global key hook -> filtered/categorized -> hidden Web Audio renderer.
// No key text is ever captured — only raw keycodes.

const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, shell, nativeTheme } = require('electron');
const { uIOhook } = require('uiohook-napi');
const { Store, DEFAULTS, sanitizePatch } = require('./store');
const { PACKS, packDir } = require('./packs');
const { categoryFor, nameFor } = require('./keymap');
const { keyboardTrayIcon } = require('./icon');
const { autoUpdater } = require('electron-updater');

const PACK_IDS = PACKS.map((p) => p.id);
// Only these URLs may be opened from the renderer; anything else is dropped.
const ALLOWED_EXTERNAL_URLS = ['https://github.com/rakhumn/keyclick', 'https://github.com/tplai/kbsim'];

let store;
let tray;
let audioWindow;
let settingsWindow;
let hookOk = true;
let shortcutOk = true;
let pendingSettingsPage = null;
let trayMenuSignature = '';
let lastUpdateStatus = { text: '', kind: '', version: '', ready: false };
const heldKeys = new Set();

function resolvedTheme() {
  const theme = store ? store.data.theme : 'system';
  if (theme === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return theme;
}

function packUrlFor(id) {
  return pathToFileURL(packDir(id)).href;
}

function pushStateToAudioWindow() {
  if (!audioWindow) return;
  audioWindow.webContents.send('settings-changed', {
    enabled: store.data.enabled,
    volume: store.data.volume,
    pack: store.data.pack,
    packUrl: packUrlFor(store.data.pack),
    playRelease: store.data.playRelease,
    categories: store.data.categories,
  });
}

function sendPreviewCommand(command) {
  if (audioWindow) audioWindow.webContents.send('preview-pack', command);
}

function sendUpdateStatus(status) {
  lastUpdateStatus = status;
  if (settingsWindow) settingsWindow.webContents.send('update-status', status);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  // Never restart on our own — the user presses "Restart to Update".
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', (info) =>
    sendUpdateStatus({ text: 'Downloading KeyClick ' + (info.version || '') + '…', kind: 'info', version: info.version || '', ready: false }));
  autoUpdater.on('download-progress', (progress) =>
    sendUpdateStatus({ text: 'Downloading update… ' + Math.round(progress.percent || 0) + '%', kind: 'info', version: '', ready: false }));
  autoUpdater.on('update-not-available', () =>
    sendUpdateStatus({ text: 'KeyClick is up to date.', kind: 'ok', version: '', ready: false }));
  autoUpdater.on('update-downloaded', (info) =>
    sendUpdateStatus({ text: 'KeyClick ' + (info.version || '') + ' is ready to install.', kind: 'ok', version: info.version || '', ready: true }));
  autoUpdater.on('error', (err) =>
    sendUpdateStatus({ text: 'Update error: ' + (err && err.message ? err.message : String(err)), kind: 'error', version: '', ready: false }));

  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {
      // surfaced to Settings via the 'error' event
    });
  } else {
    lastUpdateStatus = { text: 'Updates apply to the installed KeyClick.app (skipped while running from source).', kind: 'info', version: '', ready: false };
  }
}

function syncLoginItem() {
  // In development the running executable is the Electron binary inside
  // node_modules, and registering *that* as a login item makes macOS try to
  // launch raw "Electron" at login — modern macOS rejects it with a
  // LaunchServices/SMAppService error (the noise seen under `npm start`).
  // Login items are only meaningful for the packaged KeyClick.app, so skip
  // registration from source after saying why.
  if (!app.isPackaged) {
    if (store.data.launchAtLogin) {
      console.log('Launch-at-login applies to the packaged KeyClick.app; skipped while running from source.');
    }
    return;
  }
  try {
    app.setLoginItemSettings({ openAtLogin: store.data.launchAtLogin });
  } catch (err) {
    // Registration can still fail for a moved/renamed bundle; surface it
    // rather than leaving the checkbox lying about its own state.
    console.error('Could not update launch-at-login:', err.message);
  }
}

function applyToggleShortcut(accelerator) {
  globalShortcut.unregisterAll();
  shortcutOk = globalShortcut.register(accelerator, () => {
    updateSettings({ enabled: !store.data.enabled });
  });
  return shortcutOk;
}

function trayMenuSignatureOf() {
  const { enabled, pack, launchAtLogin } = store.data;
  return enabled + '|' + pack + '|' + launchAtLogin;
}

// Replacing the tray's context menu from inside one of its own click
// callbacks — or at slider-drag frequency — trips Chromium's observer-list
// reentrancy check (base/observer_list.h "Check failed"). Two guards: skip
// the rebuild entirely when nothing the menu shows has changed, and always
// swap the menu one tick after the event that requested it, never while a
// native menu dispatch is still on the stack.
function scheduleTrayMenuUpdate() {
  const next = trayMenuSignatureOf();
  if (next === trayMenuSignature) return;
  trayMenuSignature = next;
  setImmediate(buildTrayMenu);
}

function updateSettings(cleanPatch) {
  store.set(cleanPatch);
  pushStateToAudioWindow();
  syncLoginItem();
  scheduleTrayMenuUpdate();
  if (settingsWindow) {
    settingsWindow.webContents.send('settings-changed', store.all);
  }
}

function settingsSnapshot() {
  return {
    ...store.all,
    packs: PACKS.map((p) => ({ ...p, url: packUrlFor(p.id) })),
    version: app.getVersion(),
    platform: process.platform,
    updateStatus: lastUpdateStatus,
    hookOk,
    shortcutOk,
  };
}

function buildTrayMenu() {
  const { enabled, pack, launchAtLogin } = store.data;

  const packItems = PACKS.map((p) => ({
    label: p.caption,
    type: 'radio',
    checked: pack === p.id,
    click: () => {
      updateSettings({ pack: p.id });
      // Audible confirmation of the pick. Native menus expose no per-item
      // hover events in Electron, so selection time is the closest hook.
      sendPreviewCommand({ type: 'play', pack: p.id, url: packUrlFor(p.id) });
    },
  }));

  const menu = Menu.buildFromTemplate([
    {
      label: enabled ? 'Enabled' : 'Disabled',
      type: 'checkbox',
      checked: enabled,
      click: (item) => updateSettings({ enabled: item.checked }),
    },
    { type: 'separator' },
    { label: 'Switch Sound', submenu: packItems },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: launchAtLogin,
      click: (item) => updateSettings({ launchAtLogin: item.checked }),
    },
    { label: 'Settings…', click: () => openSettingsWindow() },
    { label: 'About KeyClick', click: () => openSettingsWindow('about') },
    { type: 'separator' },
    { label: 'Quit KeyClick', click: () => app.quit() },
  ]);

  // The only menu-level lifecycle events Electron exposes on macOS. Per-item
  // *hover* events do not exist in the menu API, so the menu open previews
  // the active pack and closing stops any preview.
  menu.on('will-show', () =>
    sendPreviewCommand({ type: 'play', pack: store.data.pack, url: packUrlFor(store.data.pack) }));
  menu.on('will-close', () => sendPreviewCommand({ type: 'stop' }));

  tray.setContextMenu(menu);
}

function showSettingsPage(page) {
  if (!settingsWindow || !page) return;
  settingsWindow.webContents.send('show-page', page);
  pendingSettingsPage = null;
}

function openSettingsWindow(page) {
  if (page) pendingSettingsPage = page;
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    showSettingsPage(pendingSettingsPage);
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    minWidth: 620,
    minHeight: 500,
    title: 'KeyClick Settings',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    backgroundColor: resolvedTheme() === 'dark' ? '#1d1b24' : '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'settings-preload.js'),
      contextIsolation: true,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWindow.webContents.once('did-finish-load', () => {
    settingsWindow.webContents.send('settings-changed', store.all);
    showSettingsPage(pendingSettingsPage);
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createAudioWindow() {
  audioWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'audio-preload.js'),
      contextIsolation: true,
    },
  });
  audioWindow.loadFile(path.join(__dirname, '..', 'renderer', 'audio.html'));
  audioWindow.webContents.on('console-message', (event) => {
    console.log('[audio]', event.message);
  });
  audioWindow.webContents.once('did-finish-load', pushStateToAudioWindow);
}

function startHook() {
  const forward = (type) => (e) => {
    // Auto-repeat filtering: a held physical key streams repeated OS keydowns,
    // but a real switch only clicks once per physical actuation.
    if (type === 'down') {
      if (heldKeys.has(e.keycode)) return;
      heldKeys.add(e.keycode);
    } else {
      heldKeys.delete(e.keycode);
    }

    if (!audioWindow) return;
    audioWindow.webContents.send('key-event', {
      type,
      keycode: e.keycode,
      name: nameFor(e.keycode),
      category: categoryFor(e.keycode),
      t: Date.now(),
    });
  };

  uIOhook.on('keydown', forward('down'));
  uIOhook.on('keyup', forward('up'));

  try {
    uIOhook.start();
  } catch (err) {
    hookOk = false;
    console.error('\nGlobal hook failed to start — this is almost always a missing permission.');
    console.error('macOS: System Settings -> Privacy & Security -> Accessibility (and Input Monitoring)');
    console.error('Add/enable KeyClick there, then quit the app and relaunch it.\n');
  }
}

if (!app.requestSingleInstanceLock()) {
  // A second copy would fight the first over the global hook and the login
  // item — bail out and let the existing instance take focus instead.
  app.quit();
} else {
  app.on('second-instance', () => openSettingsWindow());

  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.dock?.hide();
    }

    store = new Store(app.getPath('userData'), PACK_IDS);
    if (store.data.launchMuted && store.data.enabled) {
      store.set({ enabled: false });
    }

    tray = new Tray(keyboardTrayIcon());
    tray.setToolTip('KeyClick');
    scheduleTrayMenuUpdate();

    createAudioWindow();
    startHook();
    syncLoginItem();

    shortcutOk = applyToggleShortcut(store.data.toggleShortcut);
    if (!shortcutOk) {
      console.error('Global shortcut "' + store.data.toggleShortcut + '" is taken by another app — change it in Settings → Shortcuts.');
    }

    ipcMain.handle('settings:get', () => settingsSnapshot());

    ipcMain.on('settings:set', (_event, patch) => {
      const clean = sanitizePatch(patch, PACK_IDS);

      if (clean.toggleShortcut && clean.toggleShortcut !== store.data.toggleShortcut) {
        const previous = store.data.toggleShortcut;
        const attempted = clean.toggleShortcut;
        if (!applyToggleShortcut(attempted)) {
          // Conflict: re-register the old shortcut and reject just this field
          // — the working shortcut is never silently dropped.
          applyToggleShortcut(previous);
          delete clean.toggleShortcut;
          if (settingsWindow) {
            settingsWindow.webContents.send('shortcut-conflict', { attempted, active: previous });
          }
        }
      }
      if (Object.keys(clean).length === 0) return;
      updateSettings(clean);
    });

    ipcMain.handle('settings:reset', () => {
      applyToggleShortcut(DEFAULTS.toggleShortcut);
      store.reset();
      pushStateToAudioWindow();
      syncLoginItem();
      scheduleTrayMenuUpdate();
      if (settingsWindow) {
        settingsWindow.webContents.send('settings-changed', store.all);
      }
      return settingsSnapshot();
    });

    ipcMain.handle('app:open-external', (_event, url) => {
      if (typeof url === 'string' && ALLOWED_EXTERNAL_URLS.includes(url)) {
        shell.openExternal(url);
        return true;
      }
      return false;
    });

    ipcMain.handle('app:open-privacy-settings', () => {
      // Deep link toward the Input Monitoring pane. The anchor varies between
      // macOS versions; worst case plain System Settings opens.
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
      return true;
    });

    // The audio renderer reports whether the active pack actually loaded so
    // Settings can show feedback instead of failing silently.
    ipcMain.on('pack-load-status', (_event, status) => {
      if (settingsWindow && status && typeof status === 'object') {
        settingsWindow.webContents.send('pack-status', {
          ok: !!status.ok,
          pack: typeof status.pack === 'string' ? status.pack : '',
          error: typeof status.error === 'string' ? status.error : '',
        });
      }
    });

    ipcMain.handle('update:check', () => {
      if (!app.isPackaged) {
        sendUpdateStatus({ text: 'Updates apply to the installed KeyClick.app (skipped while running from source).', kind: 'info', version: '', ready: false });
        return { ok: false, dev: true };
      }
      autoUpdater.checkForUpdates().catch((err) => {
        sendUpdateStatus({ text: 'Update check failed: ' + (err && err.message ? err.message : String(err)), kind: 'error', version: '', ready: false });
      });
      return { ok: true };
    });

    ipcMain.handle('update:restart', () => {
      if (!app.isPackaged || !lastUpdateStatus.ready) return false;
      autoUpdater.quitAndInstall(false, true);
      return true;
    });

    setupAutoUpdater();

    console.log('KeyClick running in the tray/menu bar. Toggle with ' + store.data.toggleShortcut + '.');
  });
}

app.on('window-all-closed', () => {
  // Background app — no visible windows required, so don't quit on this event.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  uIOhook.stop();
  if (store) store.flush();
});
