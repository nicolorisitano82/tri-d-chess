import { app, BrowserWindow, Menu, clipboard, dialog, shell } from 'electron';
import { startServer } from '../server.js';

const PORT = Number(process.env.PORT || 47321);
const URL = `http://localhost:${PORT}`;
const mcpCmd = (c) => `claude mcp add --transport http tri-d-chess-${c} "${URL}/mcp?color=${c}"`;

app.setName('Tri-D Chess');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

async function ensureServer() {
  try {
    await startServer({ port: PORT, host: '127.0.0.1' });
    return true;
  } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    // Port busy: reuse it if it is already a Tri-D Chess server (e.g. `npm start` running).
    try {
      const r = await fetch(`${URL}/api/state`);
      if (r.ok && (await r.json()).pieces) return false;
    } catch {}
    throw new Error(`La porta ${PORT} è occupata da un altro programma.`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Tri-D Chess',
    backgroundColor: '#000006',
    titleBarStyle: 'hiddenInset',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL(`${URL}/?app=1`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Copia comando MCP · Bianco', click: () => clipboard.writeText(mcpCmd('white')) },
        { label: 'Copia comando MCP · Nero', click: () => clipboard.writeText(mcpCmd('black')) },
        { label: 'Copia URL endpoint MCP', click: () => clipboard.writeText(`${URL}/mcp`) },
        { label: 'Apri nel browser', click: () => shell.openExternal(URL) },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Vista',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

app.whenReady().then(async () => {
  try {
    await ensureServer();
  } catch (e) {
    dialog.showErrorBox('Tri-D Chess', e.message);
    app.quit();
    return;
  }
  buildMenu();
  createWindow();
});
