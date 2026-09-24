// SIGA Test · application Windows (Electron)
// La fenêtre n'affiche que l'application embarquée (www/index.html) : aucune page extérieure,
// aucun accès de la page au système (isolation, bac à sable), liens externes ouverts dans le navigateur.
const {app, BrowserWindow, Menu, shell, session, dialog} = require('electron');
const path = require('node:path');

app.setAppUserModelId('bf.dgreh.siga.test');
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;
const INDEX = path.join(__dirname, '..', 'www', 'index.html');

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 880, minWidth: 380, minHeight: 560,
    title: 'SIGA Test', backgroundColor: '#F2F5F1', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged}
  });
  win.loadFile(INDEX);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({url}) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); }
  });
  // Fermeture avec des modifications non envoyées : la page le signale, on demande confirmation
  win.webContents.on('will-prevent-unload', e => {
    const r = dialog.showMessageBoxSync(win, {type: 'warning', buttons: ['Rester', 'Quitter quand même'], defaultId: 0, cancelId: 0,
      title: 'SIGA Test', message: 'Des modifications ne sont pas encore enregistrées sur le serveur.', detail: 'Rétablissez la connexion et attendez « En ligne · à jour » avant de quitter.'});
    if (r === 1) e.preventDefault();
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label: 'Fichier', submenu: [{label: 'Imprimer…', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print()}, {type: 'separator'}, {label: 'Quitter', role: 'quit'}]},
    {label: 'Édition', submenu: [{label: 'Annuler', role: 'undo'}, {label: 'Rétablir', role: 'redo'}, {type: 'separator'}, {label: 'Couper', role: 'cut'}, {label: 'Copier', role: 'copy'}, {label: 'Coller', role: 'paste'}, {label: 'Tout sélectionner', role: 'selectAll'}]},
    {label: 'Affichage', submenu: [{label: 'Recharger', role: 'reload'}, {type: 'separator'}, {label: 'Zoom avant', role: 'zoomIn'}, {label: 'Zoom arrière', role: 'zoomOut'}, {label: 'Taille normale', role: 'resetZoom'}, {type: 'separator'}, {label: 'Plein écran', role: 'togglefullscreen'}]},
    {label: 'Aide', submenu: [{label: 'À propos de SIGA Test', click: () => dialog.showMessageBox(win, {type: 'info', title: 'SIGA Test', message: 'SIGA · Système Intégré de Gestion Administrative', detail: 'DGREH · version de test ' + app.getVersion() + '\nDossiers enregistrés sur le serveur de test.'})}]}
  ]));
  createWindow();
});
app.on('window-all-closed', () => app.quit());
