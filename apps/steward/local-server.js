/**
 * BPR Race Control — Local Network Server
 *
 * Runs on the main PC (the one running iRacing). Serves the steward
 * web UI and proxies iRacing replay/camera commands via irsdk-bridge.exe.
 *
 * Any device on the same LAN can open http://<this-pc-ip>:5180 in a
 * browser and control iRacing remotely.
 *
 * Usage:
 *   node local-server.js
 *   node local-server.js --port 5180
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');

const PORT = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--port') || '5180');
const BRIDGE = path.join(__dirname, 'electron', 'irsdk-bridge.exe');
const DIST = path.join(__dirname, 'dist');

// ── MIME types ───────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ── iRacing bridge helper ────────────────────────────────────
function runBridge(...args) {
  return new Promise((resolve) => {
    execFile(BRIDGE, args, { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, error: err.message });
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ ok: false, error: 'Parse error', raw: stdout });
      }
    });
  });
}

// ── HTTP server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers for local network access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API: iRacing bridge commands ───────────────────────────
  if (url.pathname.startsWith('/api/irsdk/')) {
    const parts = url.pathname.replace('/api/irsdk/', '').split('/');
    const command = parts[0];
    const args = parts.slice(1).map(decodeURIComponent);

    // Also accept query params
    for (const [k, v] of url.searchParams) {
      args.push(v);
    }

    let result;
    switch (command) {
      case 'status':
        result = await runBridge('status');
        break;
      case 'replay-jump':
        result = await runBridge('replay-jump', args[0] || url.searchParams.get('t') || '0');
        break;
      case 'replay-speed':
        result = await runBridge('replay-speed', args[0] || url.searchParams.get('s') || '1');
        break;
      case 'replay-pause':
        result = await runBridge('replay-pause');
        break;
      case 'replay-play':
        result = await runBridge('replay-play');
        break;
      case 'replay-search':
        result = await runBridge('replay-search', args[0] || url.searchParams.get('m') || 'start');
        break;
      case 'camera':
        result = await runBridge('camera',
          args[0] || url.searchParams.get('car') || '0',
          args[1] || url.searchParams.get('group') || 'chase');
        break;
      case 'chat':
        const chatMsg = decodeURIComponent(args[0] || url.searchParams.get('msg') || '');
        result = chatMsg ? await runBridge('chat', chatMsg) : { ok: false, error: 'Missing message' };
        break;
      default:
        result = { ok: false, error: 'Unknown command: ' + command };
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // ── API: health check ──────────────────────────────────────
  if (url.pathname === '/api/health') {
    const iracing = await runBridge('status');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      server: 'bpr-local',
      iracing: iracing.connected || false,
      hostname: os.hostname(),
    }));
    return;
  }

  // ── Static file serving (built Vite app) ───────────────────
  let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);

  // SPA fallback: if file doesn't exist, serve index.html
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST, 'index.html');
  }

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  // Get local IP addresses
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   BPR Race Control — Local Network Server   ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Local:    http://localhost:${PORT}`);
  ips.forEach((ip) => {
    console.log(`  Network:  http://${ip}:${PORT}`);
  });
  console.log('');
  console.log('  Open the Network URL on your laptop/second PC.');
  console.log('  iRacing replay controls work from any device.');
  console.log('');
});
