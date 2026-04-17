/**
 * Steward WebSocket client.
 * Connects to /ws/steward on the telemetry server.
 * Auto-reconnects on disconnect.
 */

const SERVERS = [
  'wss://racecontrol.bitepointracing.com/ws/steward',
  'ws://45.55.216.21/ws/steward', // fallback if WSS fails
];
const RECONNECT_DELAY = 3000;

class StewardWsClient {
  constructor() {
    this._listeners = new Map();
    this._ws = null;
    this._connected = false;
    this._serverIndex = 0;
    this._connect();
  }

  _connect() {
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
      console.log('[ws] connected to steward endpoint');
    };

    this._ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        this._emit(type, payload);
      } catch {
        // ignore malformed messages
      }
    };

    this._ws.onclose = () => {
      this._connected = false;
      this._emit('_connected', false);
      console.log('[ws] disconnected, reconnecting...');
      this._scheduleReconnect();
    };

    this._ws.onerror = (err) => {
      console.error('[ws] error:', err?.message || err?.type || 'unknown');
    };
  }

  _scheduleReconnect() {
    // Try next server on failure
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
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type, payload }));
    }
  }

  get connected() {
    return this._connected;
  }
}

export const wsClient = new StewardWsClient();
