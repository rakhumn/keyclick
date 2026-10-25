const path = require('path');
const { app } = require('electron');

const PACKS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'sounds', 'packs')
  : path.join(__dirname, '..', '..', 'sounds', 'packs');

// captions and descriptions from the original kbsim project
// (MIT licensed, github.com/tplai/kbsim)
const PACKS = [
  { id: 'cream', caption: 'NovelKeys Creams', group: 'Linear', desc: 'Self-lubricating POM — a deep, buttery thock.' },
  { id: 'holypanda', caption: 'Holy Pandas', group: 'Tactile', desc: 'Sharp, heavy bump. Enthusiast favorite.' },
  { id: 'alpaca', caption: 'Alpacas', group: 'Linear', desc: 'Smooth long-pole stem — a clean, quiet glide.' },
  { id: 'turquoise', caption: 'Turquoise Tealios', group: 'Linear', desc: 'Heavier and buttery-smooth throughout travel.' },
  { id: 'blackink', caption: 'Gateron Black Inks', group: 'Linear', desc: 'Premium ink housings — deep and refined.' },
  { id: 'redink', caption: 'Gateron Red Inks', group: 'Linear', desc: 'Light spring — soft and unobtrusive.' },
  { id: 'mxblack', caption: 'Cherry MX Blacks', group: 'Linear', desc: 'Firm spring, the classic no-bump feel.' },
  { id: 'mxbrown', caption: 'Cherry MX Browns', group: 'Tactile', desc: 'Quiet bump — the all-rounder default.' },
  { id: 'mxblue', caption: 'Cherry MX Blues', group: 'Clicky', desc: 'Sharp click-bar snap on press and release.' },
  { id: 'boxnavy', caption: 'Kailh Box Navies', group: 'Clicky', desc: 'Heavy and crisp — loud by design.' },
  { id: 'buckling', caption: 'Buckling Spring', group: 'Clicky', desc: 'IBM Model M mechanism — a booming, distinct clack.' },
  { id: 'bluealps', caption: 'SKCM Blue Alps', group: 'Clicky', desc: 'Vintage clicky switch with a crisp, retro snap.' },
  { id: 'topre', caption: 'Topre', group: 'Tactile', desc: 'Electrocapacitive dome — a rounded, hollow thock.' },
  { id: 'funny', caption: 'Funny Mode', group: 'Funny', desc: 'Cartoon pops, boings and squeaks — all synthesized, all silly.' },
];

function packDir(id) {
  return path.join(PACKS_DIR, id);
}

module.exports = { PACKS, PACKS_DIR, packDir };
