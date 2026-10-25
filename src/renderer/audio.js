// Web Audio engine: preloads a switch pack's samples once, then plays a
// one-shot voice per keydown/keyup with small pitch/gain jitter so repeats
// don't sound identical.

const CATEGORIES = ['GENERIC', 'SPACE', 'ENTER', 'BACKSPACE', 'TAB', 'ESCAPE'];
const GENERIC_VARIANTS = ['R0', 'R1', 'R2', 'R3', 'R4'];
// Categories without dedicated recordings fall back to the generic bank.
const SAMPLE_BANK = { ARROWS: 'GENERIC', MODIFIERS: 'GENERIC' };
const SAMPLE_EXTENSIONS = ['.mp3', '.wav'];
const PITCH_JITTER = 0.03; // +/- 3%
const GAIN_JITTER_DB = 1.5; // +/- 1.5dB
const MAX_VOICES = 24; // cap simultaneous one-shots so key mashing can't spike CPU

const audioContext = new AudioContext({ latencyHint: 'interactive' });
const masterGain = audioContext.createGain();
masterGain.connect(audioContext.destination);

let state = {
  enabled: true,
  volume: 0.8,
  pack: 'mxbrown',
  packUrl: null,
  playRelease: true,
  categories: {},
};
let press = {}; // category -> AudioBuffer[]
let release = {}; // category -> AudioBuffer[]
let activeVoices = 0;
const roundRobin = {};

// Latency diagnostics: main stamps each key event with Date.now(); on receipt
// we measure the main-to-renderer hop plus our own scheduling work. Numbers
// only — never key content. Readable from DevTools as window.keyclickLatency.
window.keyclickLatency = { events: 0, totalMs: 0, maxMs: 0, firstMs: null, schedTotalMs: 0, schedMaxMs: 0 };

function recordIpcLatency(mainTimestamp) {
  const ms = Date.now() - mainTimestamp;
  const stats = window.keyclickLatency;
  stats.events += 1;
  stats.totalMs += ms;
  if (ms > stats.maxMs) stats.maxMs = ms;
  if (stats.firstMs === null) stats.firstMs = ms;
}

function categoryConfig(category) {
  return state.categories[category] || state.categories.GENERIC || { enabled: true, volume: 1 };
}

async function fetchBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}

// Packs ship .mp3 recordings; the synthesized Funny Mode pack ships .wav.
// Probe the known extensions and only speak up when none of them exist.
async function fetchFirstBuffer(base) {
  for (const ext of SAMPLE_EXTENSIONS) {
    const buffer = await fetchBuffer(base + ext);
    if (buffer) return buffer;
  }
  console.log('sample missing (using fallback): ' + base);
  return null;
}

async function loadPack(packUrl, packId) {
  try {
    await loadPackBuffers(packUrl, packId);
  } catch (err) {
    // A pack that can't be read must not take the engine down with it: keep
    // the previous bank playing and tell Settings what happened.
    window.keyclick.reportPackStatus({ ok: false, pack: packId, error: err.message });
  }
}

async function loadPackBuffers(packUrl, packId) {
  const nextPress = {};
  const nextRelease = {};

  const genericPress = (
    await Promise.all(GENERIC_VARIANTS.map((v) => fetchFirstBuffer(`${packUrl}/press/GENERIC_${v}`)))
  ).filter(Boolean);
  nextPress.GENERIC = genericPress;

  const genericReleaseBuf = await fetchFirstBuffer(`${packUrl}/release/GENERIC`);
  nextRelease.GENERIC = genericReleaseBuf ? [genericReleaseBuf] : [];

  for (const category of CATEGORIES) {
    if (category === 'GENERIC') continue;
    const pressBuf = await fetchFirstBuffer(`${packUrl}/press/${category}`);
    nextPress[category] = pressBuf ? [pressBuf] : nextPress.GENERIC;

    const releaseBuf = await fetchFirstBuffer(`${packUrl}/release/${category}`);
    nextRelease[category] = releaseBuf ? [releaseBuf] : nextRelease.GENERIC;
  }

  if (nextPress.GENERIC.length === 0) {
    window.keyclick.reportPackStatus({ ok: false, pack: packId, error: 'No usable audio files found in this pack.' });
    return;
  }

  press = nextPress;
  release = nextRelease;
  window.keyclick.reportPackStatus({ ok: true, pack: packId, error: '' });
  console.log('Pack loaded: ' + packUrl);
}

// --- pack previews (tray Switch Sound menu + Settings) ---
// One voice at a time, routed through masterGain so the volume setting
// applies; any new preview or stopPreview() kills the previous one, and
// nothing ever loops, so there is no path to stuck or overlapping audio.

let previewSource = null;
const previewCache = new Map();

function stopPreview() {
  if (!previewSource) return;
  try {
    previewSource.stop();
  } catch {
    // already ended
  }
  previewSource = null;
}

async function previewPack(packId, packUrl) {
  stopPreview();
  let buffer = previewCache.get(packId);
  if (buffer === undefined) {
    buffer = await fetchFirstBuffer(`${packUrl}/press/GENERIC_R1`);
    previewCache.set(packId, buffer);
  }
  if (!buffer) return;
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch {
      return;
    }
  }
  stopPreview(); // cancel anything that started while we awaited
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGain);
  previewSource = source;
  source.onended = () => {
    if (previewSource === source) previewSource = null;
  };
  source.start(0);
}

function pickBuffer(bank, category) {
  const buffers = bank[category];
  if (!buffers || buffers.length === 0) return null;
  const i = (roundRobin[category] || 0) % buffers.length;
  roundRobin[category] = i + 1;
  return buffers[i];
}

function play(bank, category) {
  const config = categoryConfig(category);
  if (!config.enabled) return;

  const buffer = pickBuffer(bank, SAMPLE_BANK[category] || category);
  if (!buffer) return;
  if (activeVoices >= MAX_VOICES) return;

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH_JITTER;

  const gain = audioContext.createGain();
  const jitterDb = (Math.random() * 2 - 1) * GAIN_JITTER_DB;
  gain.gain.value = Math.pow(10, jitterDb / 20) * config.volume;

  source.connect(gain);
  gain.connect(masterGain);
  activeVoices += 1;
  source.onended = () => {
    activeVoices -= 1;
  };
  source.start(0);
}

window.keyclick.onSettingsChanged((next) => {
  const packChanged = next.packUrl && next.packUrl !== state.packUrl;
  state = { ...state, ...next };
  masterGain.gain.value = state.volume;
  if (packChanged) loadPack(state.packUrl, state.pack);
});

window.keyclick.onPreviewCommand((command) => {
  if (!command || typeof command !== 'object') return;
  if (command.type === 'stop') {
    stopPreview();
    return;
  }
  if (command.type === 'play' && typeof command.pack === 'string' && typeof command.url === 'string') {
    previewPack(command.pack, command.url);
  }
});

window.keyclick.onKeyEvent(async (event) => {
  if (!state.enabled) return;
  if (event.type === 'up' && !state.playRelease) return;

  const startedAt = performance.now();
  recordIpcLatency(event.t);

  // Chromium can hand out a suspended context (autoplay policy, system audio
  // interruption); resume it instead of silently dropping the sound.
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch {
      return;
    }
  }

  const bank = event.type === 'down' ? press : release;
  play(bank, event.category);

  const schedMs = performance.now() - startedAt;
  const stats = window.keyclickLatency;
  stats.schedTotalMs += schedMs;
  if (schedMs > stats.schedMaxMs) stats.schedMaxMs = schedMs;
});
