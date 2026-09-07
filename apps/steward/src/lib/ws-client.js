/**
 * Steward WebSocket client.
 * Connects to /ws/steward on the telemetry server.
 * Requires JWT auth token — sends auth:token as first message.
 * Auto-reconnects on disconnect.
 */

// Local override for development: localStorage['bpr-server'] = 'http://localhost:8091'
// (the login modal honours the same key for /api/auth). Cleared = production.
export function serverOverride() {
  try { return (localStorage.getItem('bpr-server') || '').trim().replace(/\/$/, ''); } catch { return ''; }
}
const OVERRIDE = serverOverride();
const SERVERS = OVERRIDE
  ? [OVERRIDE.replace(/^http/, 'ws') + '/ws/steward']
  : [
    'wss://racecontrol.bitepointracing.com/ws/steward',
    'ws://45.55.216.21/ws/steward', // fallback if WSS fails
  ];
const RECONNECT_DELAY = 3000;

class StewardWsClient {
  constructor() {
    this._listeners = new Map();
    this._ws = null;
    this._connected = false;
    this._authenticated = false;
    this._serverIndex = 0;
    this._token = null;
  }

  /**
   * Set the auth token and connect.
   * Call this after successful login.
   */
  setToken(token) {
    this._token = token;
    this._devName = null;
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      this._connect();
    }
  }

  /**
   * Development only: identify with the server's legacy steward:hello
   * (no password). Used with localStorage['bpr-dev-name'] against a local
   * server + field simulator. Production stewards always use setToken.
   */
  setDevName(name) {
    this._devName = name;
    this._token = `dev:${name}`; // truthy so connect/reconnect proceed
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      this._connect();
    }
  }

  /**
   * Clear token and disconnect (logout).
   */
  clearToken() {
    this._token = null;
    this._authenticated = false;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  _connect() {
    if (!this._token) return; // Don't connect without a token

    const url = SERVERS[this._serverIndex];
    console.log('[ws] connecting to', url);
    try {
      this._ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._connected = true;
      this._emit('_connected', true);
      console.log('[ws] connected, sending auth token');

      // Send auth token as first message (or the legacy hello in dev mode)
      if (this._devName) {
        this._ws.send(JSON.stringify({ type: 'steward:hello', payload: { name: this._devName, role: 'MAIN' } }));
      } else {
        this._ws.send(JSON.stringify({
          type: 'auth:token',
          payload: { token: this._token },
        }));
      }
    };

    this._ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);

        // Handle auth responses
        if (type === 'auth:ok') {
          this._authenticated = true;
          console.log('[ws] authenticated as', payload?.steward?.name);
          this._emit('auth:ok', payload);
          return;
        }
        if (type === 'auth:failed') {
          console.error('[ws] auth failed:', payload?.error);
          this._authenticated = false;
          this._emit('auth:failed', payload);
          this._ws.close();
          return;
        }
        if (type === 'auth:required') {
          // Server is asking for auth but we already sent it — token might be expired
          this._emit('auth:failed', { error: 'Token expired or invalid' });
          this._ws.close();
          return;
        }

        this._emit(type, payload);
      } catch {
        // ignore malformed messages
      }
    };

    this._ws.onclose = () => {
      this._connected = false;
      this._authenticated = false;
      this._emit('_connected', false);
      console.log('[ws] disconnected, reconnecting...');
      this._scheduleReconnect();
    };

    this._ws.onerror = (err) => {
      console.error('[ws] error:', err?.message || err?.type || 'unknown');
    };
  }

  _scheduleReconnect() {
    if (!this._token) return; // Don't reconnect without a token
    this._serverIndex = (this._serverIndex + 1) % SERVERS.length;
    setTimeout(() => this._connect(), RECONNECT_DELAY);
  }

  _emit(type, payload) {
    const cbs = this._listeners.get(type);
    if (cbs) cbs.forEach((cb) => cb(payload));
  }

  on(type, cb) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(cb);
    return () => this._listeners.get(type)?.delete(cb);
  }

  send(type, payload) {
    if (this._ws?.readyState === WebSocket.OPEN && this._authenticated) {
      this._ws.send(JSON.stringify({ type, payload }));
    }
  }

  get connected() {
    return this._connected && this._authenticated;
  }
}

export const wsClient = new StewardWsClient();
