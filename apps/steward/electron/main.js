const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

let mainWindow = null;

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5179';

// Path to the iRacing SDK bridge executable
const BRIDGE_PATH = path.join(__dirname, 'irsdk-bridge.exe');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#060608',
    title: 'BPR Race Control',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// ---------------------------------------------------------------
// Helper: run irsdk-bridge.exe and parse JSON output
// ---------------------------------------------------------------
function runBridge(...args) {
  return new Promise((resolve, reject) => {
    execFile(BRIDGE_PATH, args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (parseErr) {
        resolve({ ok: false, error: 'Failed to parse bridge output', raw: stdout });
      }
    });
  });
}

// ---------------------------------------------------------------
// IPC: iRacing SDK — real integration via irsdk-bridge.exe
// ---------------------------------------------------------------

ipcMain.handle('irsdk:replay:jump', async (event, sessionTime) => {
  console.log(`[irsdk] replay jump to sessionTime=${sessionTime}`);
  return runBridge('replay-jump', String(sessionTime));
});

ipcMain.handle('irsdk:replay:speed', async (event, speed) => {
  console.log(`[irsdk] replay speed=${speed}`);
  if (speed === 0) {
    return runBridge('replay-pause');
  }
  return runBridge('replay-speed', String(speed));
});

ipcMain.handle('irsdk:replay:camera', async (event, carIdx, camGroup) => {
  console.log(`[irsdk] camera -> car=${carIdx} group=${camGroup}`);
  return runBridge('camera', String(carIdx), String(camGroup));
});

ipcMain.handle('irsdk:replay:search', async (event, mode) => {
  console.log(`[irsdk] replay search mode=${mode}`);
  return runBridge('replay-search', mode);
});

ipcMain.handle('irsdk:status', async () => {
  return runBridge('status');
});

// ---------------------------------------------------------------
// IPC: iRacing Admin — chat commands, penalties, safety car
// ---------------------------------------------------------------

ipcMain.handle('irsdk:admin:chat', async (event, message) => {
  console.log(`[irsdk] admin chat: ${message}`);
  return runBridge('chat', message);
});
