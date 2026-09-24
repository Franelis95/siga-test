// Construit www/index.html : application SIGA autonome (un seul fichier, rien chargé depuis Internet
// sauf le serveur Supabase). Utilisé par Android (Capacitor), Windows (Electron) et la version web.
//
// Variables d'environnement (facultatives) :
//   SIGA_SUPABASE_URL       adresse du projet, ex. https://abcd.supabase.co
//   SIGA_SUPABASE_ANON_KEY  clé publique « anon » du projet
// Sans elles, l'écran de connexion demande l'adresse et la clé au premier lancement.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');
const b64 = p => fs.readFileSync(path.join(root, p)).toString('base64');

const url = (process.env.SIGA_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (process.env.SIGA_SUPABASE_ANON_KEY || '').trim();
if (url && !/^https:\/\/[a-z0-9.-]+$/i.test(url) && !process.env.SIGA_DEV) throw new Error('SIGA_SUPABASE_URL invalide : ' + url);
if (key && key.split('.').length !== 3 && !/^sb_publishable_/.test(key)) console.warn('Attention : la clé ne ressemble pas à une clé publique Supabase.');

const APP = ['data.js', 'core.js', 'm_om.js', 'm_req.js', 'm_mail.js', 'm_res.js', 'm_pilot.js', 'm_sys.js', 'seed.js'];
const logo = rd('src/app/logo.txt').trim();

const font = (fam, w, file) => `@font-face{font-family:"${fam}";font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}`;
const fonts = [400, 500, 600, 700].map(w => font('Public Sans', w, `node_modules/@fontsource/public-sans/files/public-sans-latin-${w}-normal.woff2`))
  .concat([400, 500].map(w => font('IBM Plex Mono', w, `node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-normal.woff2`))).join('\n');

const connect = ["'self'", 'https:', 'wss:'].concat(process.env.SIGA_DEV ? ['http://127.0.0.1:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'ws://localhost:*'] : []).join(' ');
const csp = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src ${connect}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;

const esc = s => s.replace(/<\/script/gi, '<\\/script');
const js = APP.map(f => `/* ---- ${f} ---- */\n` + rd('src/app/' + f)).join('\n');
const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="description" content="SIGA, Système Intégré de Gestion Administrative de la DGREH · version de test">
<meta name="theme-color" content="#0E271E">
<title>SIGA DGREH</title>
<link rel="icon" href="${logo}">
<style>
${fonts}
${rd('src/app/style.css')}
${rd('src/server.css')}
</style>
</head>
<body>
<div id="root"></div>
<script>${esc(rd('node_modules/@supabase/supabase-js/dist/umd/supabase.js'))}</script>
<script>
const LOGO = ${JSON.stringify(logo)};
const SIGA_CONFIG = ${JSON.stringify(url && key ? {url, key} : {})};
${esc(js)}
${esc(rd('src/server.js'))}
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'www'), {recursive: true});
fs.writeFileSync(path.join(root, 'www/index.html'), html);
console.log(`www/index.html : ${(html.length / 1024).toFixed(0)} Ko · serveur ${url ? url : 'à saisir au premier lancement'}`);
