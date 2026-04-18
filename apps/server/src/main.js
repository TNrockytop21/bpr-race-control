import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createRequire } from 'module';
import { handleAgentConnection, handleViewerConnection, handleStewardConnection } from './ws-handler.js';
import { ensureProfilesDir } from './profiles.js';
import { ensurePlansDir } from './race-plans.js';
import { ensureSessionsDir } from './session-recorder.js';

// Auth modules use CommonJS (better-sqlite3 requires it)
const require = createRequire(import.meta.url);
const stewardsDb = require('./stewards-db.js');
const auth = require('./auth.js');

ensureProfilesDir();
ensurePlansDir();
ensureSessionsDir();

const PORT = process.env.PORT || 8080;
const app = express();
const server = createServer(app);

app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Auth routes ──────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required' });
  }

  const steward = stewardsDb.verifySteward(email, password);
  if (!steward) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  }

  const token = auth.signToken(steward.id, steward.name, steward.role);
  res.json({
    ok: true,
    token,
    steward: { id: steward.id, email: steward.email, name: steward.name, role: steward.role },
  });
});

app.post('/api/auth/validate', (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ ok: false, error: 'Token required' });
  }

  const decoded = auth.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }

  res.json({ ok: true, steward: decoded });
});

// Stream Deck API endpoint
import { broadcastToViewers } from './broadcast.js';
app.post('/api/streamdeck', (req, res) => {
  broadcastToViewers('streamdeck:command', req.body);
  res.json({ ok: true });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = req.url || '';
  if (url.startsWith('/ws/agent')) {
    handleAgentConnection(ws, req);
  } else if (url.startsWith('/ws/steward')) {
    handleStewardConnection(ws, req);
  } else {
    handleViewerConnection(ws, req);
  }
});

server.listen(PORT, () => {
  console.log(`Telemetry server running on port ${PORT}`);
  console.log(`  Agent WebSocket:  ws://localhost:${PORT}/ws/agent`);
  console.log(`  Viewer WebSocket: ws://localhost:${PORT}/ws/viewer`);
  console.log(`  Steward WebSocket: ws://localhost:${PORT}/ws/steward`);
});
