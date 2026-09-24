// Génère les icônes Android, Windows et l'écran de démarrage à partir du logo SIGA (build/logo.webp).
// Usage : npm run icons   (nécessite le paquet « sharp » : npm i -D sharp)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = path.join(root, 'build/logo.webp');
const res = path.join(root, 'android/app/src/main/res');
const clear = {r: 0, g: 0, b: 0, alpha: 0};
const white = {r: 255, g: 255, b: 255, alpha: 1};

const scaled = n => sharp(logo).resize(n, n, {kernel: 'lanczos3'}).png().toBuffer();
async function canvas(w, h, bg, inner) {
  const buf = await scaled(inner);
  return sharp({create: {width: w, height: h, channels: 4, background: bg}})
    .composite([{input: buf, left: Math.round((w - inner) / 2), top: Math.round((h - inner) / 2)}]).png().toBuffer();
}

// Android : icônes classiques, rondes et adaptatives
const dens = {mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192};
for (const [d, n] of Object.entries(dens)) {
  const dir = path.join(res, 'mipmap-' + d);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await scaled(n));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await scaled(n));
  const f = Math.round(n * 108 / 48);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await canvas(f, f, clear, Math.round(f * 0.64)));
}
// Android : écrans de démarrage (mêmes dimensions que le modèle Capacitor)
for (const dir of fs.readdirSync(res).filter(x => x.startsWith('drawable'))) {
  const p = path.join(res, dir, 'splash.png');
  if (!fs.existsSync(p)) continue;
  const {width, height} = await sharp(p).metadata();
  fs.writeFileSync(p, await canvas(width, height, white, Math.round(Math.min(width, height) * 0.36)));
}

// Windows : icon.png (fenêtre) et icon.ico (installateur, raccourcis), images PNG dans le conteneur ICO
fs.writeFileSync(path.join(root, 'build/icon.png'), await scaled(512));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map(scaled));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
  head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += pngs[i].length;
});
fs.writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([head, ...pngs]));
console.log('Icônes générées');
