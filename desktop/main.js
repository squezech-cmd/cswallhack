'use strict';
// Electron-обёртка: поднимает локальный сервер и открывает окно игры.
// Нужна для сборки .exe (npm run dist:win на Windows).
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const net = require('net');

process.env.PORT = process.env.PORT || '3210';
const PORT = Number(process.env.PORT);

function waitForPort(port, tries = 60) {
  return new Promise((resolve) => {
    const attempt = (n) => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(true); });
      s.on('error', () => {
        s.destroy();
        if (n <= 0) resolve(false);
        else setTimeout(() => attempt(n - 1), 200);
      });
    };
    attempt(tries);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 860,
    backgroundColor: '#04060a',
    title: 'Башни и руны',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
  win.once('ready-to-show', () => win.show());
  // F11 — полный экран, F12 — консоль
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
}

app.whenReady().then(async () => {
  // сервер живёт в том же процессе
  require(path.join(__dirname, '..', 'server', 'index.js'));
  await waitForPort(PORT);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { app.quit(); process.exit(0); });
