# KeyClick

**A Rakhman Muratbek product.** Mechanical keyboard sounds for any keyboard, on every physical keypress — even in background apps. Lives in the menu bar.

## Install (macOS)

1. Get the latest `.dmg` from [releases](https://github.com/rakhumn/keyclick/releases), or build one yourself (see “Building installers”).
2. Open the DMG and drag **KeyClick** into **Applications**.
3. Double-click **“Fix Gatekeeper Warning.command”** in the DMG window — this clears the quarantine flag on this unsigned personal build (details in Troubleshooting).
4. Launch KeyClick from Applications or Launchpad.
5. macOS asks for **Input Monitoring** (and possibly **Accessibility**) permission — grant it in System Settings → Privacy & Security, then quit KeyClick from the tray icon and relaunch. Until granted, the app hears no keys.

No paid Apple Developer account is needed for any of this; the trade-off of staying unsigned is the Gatekeeper step above.

## Using the app

- Lives in the **menu bar (macOS)** / **system tray (Windows)** — no dock/taskbar window.
- Click the tray icon for: enable/disable, switch-sound picker, launch at login, **Settings…**, **About KeyClick**, and Quit.
- Global hotkey **⌘/Ctrl+Alt+K** toggles sound on/off from anywhere (changeable in Settings → Shortcuts).
- The Settings window has five pages:
  - **General** — sounds on/off, master volume, sound pack, launch at login, start muted, theme (System/Light/Dark), restore defaults.
  - **Sound Packs** — all 13 packs grouped Clicky / Tactile / Linear, each with a preview button; click a card to switch.
  - **Key Sounds** — per-category on/off and volume (regular keys, Space, Enter, Backspace, Tab, Escape, arrows, modifiers), plus sound-on-key-release.
  - **Shortcuts** — shows the global toggle shortcut, records a new one, and reports conflicts instead of silently keeping a broken registration.
  - **About KeyClick** — version, privacy statement, licenses and credits.
- Settings persist to `~/Library/Application Support/KeyClick/settings.json` (macOS) or `%APPDATA%/KeyClick/settings.json` (Windows), written atomically.

## Permissions — what KeyClick actually needs

- **Input Monitoring** — required on modern macOS. The global keyboard hook (libuiohook) can't see keys without it.
- **Accessibility** — sometimes requested as well, depending on macOS version; grant it if prompted.
- Nothing else: no microphone, no screen recording, no network access, no analytics in the app.
- If permission is missing, the Settings window shows a red banner with an **Open Privacy Settings** button. Grant, then quit and relaunch KeyClick.

## Privacy

KeyClick processes only the fact that a key went down or up — a numeric key code. It never sees the characters you type, stores no keystroke history, and makes no network calls. Secure text entry (password fields) is hidden from all global listeners by macOS itself.

## Run it (development)

```
npm install
npm start
```

> Note: this can't be fully tested inside a sandboxed coding-agent session — global key hooks and GUI launches need real OS permissions granted interactively on your machine. Run these commands in your normal Terminal.

Two development-only behaviors worth knowing:

- **Launch-at-login is skipped from source.** Under `npm start` the executable is the Electron binary in `node_modules`; registering *that* as a login item is what modern macOS rejects with a LaunchServices/SMAppService error. KeyClick therefore only manages login items when running as the packaged `KeyClick.app`.
- A second app instance exits immediately instead of competing for the global keyboard hook, and brings the running instance's Settings window forward.

## Sound packs

`sounds/packs/` ships 13 switch themes, sourced from the MIT-licensed [kbsim](https://github.com/tplai/kbsim) project, grouped in the app as Clicky (Cherry MX Blues, Kailh Box Navies, Buckling Spring, SKCM Blue Alps), Tactile (Cherry MX Browns, Holy Pandas, Topre), and Linear (NovelKeys Creams, Alpacas, Turquoise Tealios, Gateron Black/Red Inks, Cherry MX Blacks), plus **Funny Mode** — original cartoon pops, boings, squeaks and slide whistles, fully synthesized in-repo (`node tools/gen-funny-sounds.js` regenerates them; no third-party audio). Switch it on or off like any other pack from the Sound Packs page. Each pack has:
- `press/GENERIC_R0..R4.mp3` — round-robin variants for ordinary keys
- `press/SPACE.mp3`, `ENTER.mp3`, `BACKSPACE.mp3`, `TAB.mp3`, `ESCAPE.mp3` — dedicated big-key sounds (not every pack ships these; missing ones fall back to the generic bank)
- `release/` — the same categories, played on keyup

`sounds/user-recorded/` holds 103 personal recordings (`key_001.wav`…`key_103.wav`), not yet wired in — they need a key-to-file mapping first.

## Building installers

```
npm run dist:mac    # .dmg
npm run dist:win    # .exe (NSIS installer)
npm run dist        # both, for the current platform's target(s)
```

Output lands in `release/`. This is an **unsigned personal build** — no Apple notarization or Windows code signing:
- macOS: the DMG includes the **“Fix Gatekeeper Warning.command”** script — see Troubleshooting.
- Windows: SmartScreen will warn once — “More info” → “Run anyway”. AV may also flag it since a global key hook looks like a keylogger; that's expected.
- Building the Windows installer from a Mac may require Wine (`brew install --cask wine-stable`) for electron-builder's NSIS step — if that's friction, run `npm run dist:win` directly on a Windows machine instead.

## Update to a new version

Your settings (sound pack, volume, theme, shortcuts, key-sound tweaks) live in `~/Library/Application Support/KeyClick/` — a separate place from the app itself — so replacing the app keeps everything exactly as you left it.

1. Download the new `.dmg` from [releases](https://github.com/rakhumn/keyclick/releases) (or build it with `npm run dist:mac`).
2. If KeyClick is running, quit it first from the tray icon (**Quit KeyClick**).
3. Open the DMG and drag **KeyClick** onto the **Applications** folder. macOS asks to replace the older version — click **Replace**.
4. A freshly downloaded unsigned build will trigger the "damaged app" warning again — double-click **“Fix Gatekeeper Warning.command”** inside the DMG once more to clear it.
5. Open KeyClick from Applications or Launchpad and check Settings → Sound Packs: your previous choices are still there.

The old app bundle is replaced in place and settings never live inside the app, so there is nothing else to clean up.

## Releasing a new version

1. Bump `version` in `package.json` (and commit).
2. Build: `npm run dist:mac` — produces `release/KeyClick-<version>-arm64.dmg` (for humans) and `KeyClick-<version>-arm64-mac.zip` + `latest-mac.yml` (the zip is what the in-app updater installs).
3. Publish all four artifacts plus `latest-mac.yml` to a GitHub Release — the in-app updater reads `latest-mac.yml` from releases:
   ```
   gh release create v<version> \
     release/KeyClick-<version>-arm64.dmg release/KeyClick-<version>-arm64.dmg.blockmap \
     release/KeyClick-<version>-arm64-mac.zip release/KeyClick-<version>-arm64-mac.zip.blockmap \
     release/latest-mac.yml
   ```
4. Installed apps pick it up automatically (check at launch, background download; restart happens only when the user clicks **Restart to Update** in Settings → General → Updates).

**Signing caveat:** the update plumbing is complete, but macOS refuses to *apply* updates to apps without a matching Developer ID signature. Today's builds are ad-hoc signed, so a fresh install of each new DMG still works (settings survive), while one-click in-app updating needs: an Apple Developer Program membership, a "Developer ID Application" certificate in your keychain, and building with `CSC_NAME="Developer ID Application: <Your Name>" npm run dist:mac` plus notarization credentials — `build/afterPack.js` then leaves the real signature alone.

## Uninstall

1. Quit KeyClick from the tray icon.
2. If you enabled **Launch at login**, turn it off first (Settings → General), or remove it in System Settings → General → Login Items.
3. Drag `KeyClick.app` from /Applications to the Trash.
4. Optional: delete `~/Library/Application Support/KeyClick/` to remove your settings.

## Credits & license

- **KeyClick** is maintained and published by **Rakhman Muratbek** and licensed under the MIT License (see `LICENSE`).
- KeyClick builds on the MIT-licensed **Actuate** project by anujpatel224 — its copyright notice is preserved in `LICENSE` as required.
- The 13 recorded switch packs come from the MIT-licensed [kbsim](https://github.com/tplai/kbsim) project by tplai.
- **Funny Mode** sounds are original synthesizations generated in this repository — no third-party audio.
- Runtime dependencies (bundled with the app): [Electron](https://github.com/electron/electron) (MIT, which itself packages Chromium and Node.js under their own permissive licenses), [uiohook-napi](https://github.com/SnosMe/uiohook-napi) (MIT), [electron-updater](https://github.com/electron-userland/electron-builder) (MIT).

## Troubleshooting

**macOS says “KeyClick.app is damaged and can't be opened”**
False positive, not real corruption. Browsers tag downloaded files with a “quarantine” flag, and without a paid Apple Developer signature, Gatekeeper on Apple Silicon refuses to even show the usual “unidentified developer” prompt — it jumps straight to “damaged” instead. The DMG ships a **“Fix Gatekeeper Warning.command”** script alongside KeyClick.app for this: after dragging KeyClick to Applications, double-click the script (Terminal will ask you to confirm running it once — that's the normal unsigned-script prompt, click Open) and it clears the flag for you.

If you'd rather do it by hand, or the script itself won't open:
```
xattr -cr /Applications/KeyClick.app
```
`xattr` reads/writes a file's extended attributes; `-c` clears all of them (which removes the quarantine flag Gatekeeper checks), and `-r` applies that recursively through the app bundle, since it's really a folder of files rather than one file. Once cleared, open the app normally (right-click → Open the first time if it still complains), then grant Input Monitoring/Accessibility when prompted.

**Only modifier keys (Shift/Ctrl/Cmd) or function keys make sound — letters and numbers don't**
This is **macOS Secure Keyboard Entry**, not a bug in KeyClick. When it's active anywhere on the system, macOS blocks every global key hook from seeing character-producing keys, while still letting non-text keys (modifiers, most function keys) through — producing exactly this pattern.
- Check **Terminal → Secure Keyboard Entry** in the menu bar (also check iTerm2 if you use it). It stays active as long as that window/app is open, even if it's not the focused app — close it or turn the setting off.
- Quit password managers (1Password, Bitwarden, etc.) or remote-desktop/screen-sharing tools, which sometimes hold secure input on.
- If neither works, reboot — secure input can get stuck on if whatever enabled it crashed without releasing it.

**No sound at all, for any key**
Input Monitoring/Accessibility permission hasn't been granted yet — see “Install” above. The Settings window shows a red banner with a shortcut to the Privacy pane while the keyboard hook isn't running.

**A sound pack failed to load**
Settings shows a warning banner naming the pack and the reason; the previously loaded pack keeps playing. Packs with missing dedicated big-key files (e.g. mxblue) automatically fall back to the generic-key samples.
