const { UiohookKey } = require('uiohook-napi');

const CATEGORY_BY_KEYCODE = {
  [UiohookKey.Space]: 'SPACE',
  [UiohookKey.Enter]: 'ENTER',
  [UiohookKey.NumpadEnter]: 'ENTER',
  [UiohookKey.Backspace]: 'BACKSPACE',
  [UiohookKey.Tab]: 'TAB',
  [UiohookKey.Escape]: 'ESCAPE',
  [UiohookKey.ArrowUp]: 'ARROWS',
  [UiohookKey.ArrowDown]: 'ARROWS',
  [UiohookKey.ArrowLeft]: 'ARROWS',
  [UiohookKey.ArrowRight]: 'ARROWS',
  [UiohookKey.Ctrl]: 'MODIFIERS',
  [UiohookKey.CtrlRight]: 'MODIFIERS',
  [UiohookKey.Alt]: 'MODIFIERS',
  [UiohookKey.AltRight]: 'MODIFIERS',
  [UiohookKey.Shift]: 'MODIFIERS',
  [UiohookKey.ShiftRight]: 'MODIFIERS',
  [UiohookKey.Meta]: 'MODIFIERS',
  [UiohookKey.MetaRight]: 'MODIFIERS',
};

function categoryFor(keycode) {
  return CATEGORY_BY_KEYCODE[keycode] || 'GENERIC';
}

const KEY_NAMES = Object.entries(UiohookKey).reduce((map, [name, code]) => {
  if (!(code in map)) map[code] = name;
  return map;
}, {});

function nameFor(keycode) {
  return KEY_NAMES[keycode] || 'unknown';
}

module.exports = { categoryFor, nameFor };
