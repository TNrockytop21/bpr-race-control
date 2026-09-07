const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const readline = require('readline');

let mainWindow = null;

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5179';

// Path to the iRacing SDK bridge executable
// Packaged builds keep electron/ outside the asar (asarUnpack) because
// child_process.spawn cannot launch an .exe from inside an archive.
const BRIDGE_PATH = path.join(__dirname, 'irsdk-bridge.exe').replace('app.asar', 'app.asar.unpacked');

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
const HAS_SIM = process.platform === 'win32'; // iRacing (and the bridge .exe) only exist on Windows
function runBridge(...args) {
  return new Promise((resolve, reject) => {
    if (!HAS_SIM) {
      resolve({ ok: false, error: 'no iRacing on this computer — sim control runs on the steward PC in the session', noSim: true });
      return;
    }
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
  if (!HAS_SIM) return { ok: true, connected: false, noSim: true, message: 'remote steward — no iRacing on this computer' };
  return runBridge('status');
});

// Exact seek within a session (BroadcastReplaySearchSessionTime) — the
// replay-jump frame math only holds when the replay buffer starts at t=0.
ipcMain.handle('irsdk:replay:time', async (event, sessionNum, sessionTime) => {
  console.log(`[irsdk] replay time -> session ${sessionNum} @ ${sessionTime}`);
  return runBridge('replay-time', String(sessionNum), String(sessionTime));
});

// ---------------------------------------------------------------
// Race Control v2 — whole-field feed from THIS PC's iRacing.
// `irsdk-bridge.exe feed` streams JSON lines; every line is forwarded
// to the renderer, which relays it to the server as rc:field.
// ---------------------------------------------------------------
let feedProc = null;

ipcMain.handle('irsdk:feed:start', async (event, hz) => {
  if (!HAS_SIM) return { ok: false, error: 'no iRacing on this computer', noSim: true };
  if (feedProc) return { ok: true, already: true };
  try {
    feedProc = spawn(BRIDGE_PATH, ['feed', String(hz || 4)], { windowsHide: true });
  } catch (err) {
    feedProc = null;
    return { ok: false, error: err.message };
  }
  const pid = feedProc.pid;
  console.log(`[feed] started pid=${pid}`);
  const rl = readline.createInterface({ input: feedProc.stdout });
  rl.on('line', (line) => {
    let obj;
    try { obj = JSON.parse(line); } catch { return; }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('irsdk:feed', obj);
  });
  feedProc.stderr?.on('data', (d) => console.error(`[feed] ${String(d).trim()}`));
  feedProc.on('error', (err) => {
    console.error(`[feed] error: ${err.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('irsdk:feed', { t: 'error', message: err.message });
  });
  feedProc.on('exit', (code) => {
    console.log(`[feed] exited code=${code}`);
    feedProc = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('irsdk:feed', { t: 'exit', code });
  });
  return { ok: true, pid };
});

ipcMain.handle('irsdk:feed:stop', async () => {
  if (!feedProc) return { ok: true, running: false };
  try { feedProc.kill(); } catch { /* already gone */ }
  feedProc = null;
  return { ok: true, running: false };
});

app.on('before-quit', () => {
  if (feedProc) { try { feedProc.kill(); } catch { /* ignore */ } }
});

// ---------------------------------------------------------------
// IPC: iRacing Admin — chat commands, penalties, safety car
// ---------------------------------------------------------------

ipcMain.handle('irsdk:admin:chat', async (event, message) => {
  console.log(`[irsdk] admin chat: ${message}`);
  return runBridge('chat', message);
});
