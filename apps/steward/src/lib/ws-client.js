/**
 * Steward WebSocket client.
 * Connects to /ws/steward on the telemetry server.
 * Auto-reconnects on disconnect.
 */

const SERVER_URL = 'wss://racecontrol.bitepointracing.com/ws/steward';
const RECONNECT_DELAY = 3000;

class StewardWsClient {
  constructor() {
    this._listeners = new Map();
    this._ws = null;
    this._connected = false;
    this._connect();
  }

  _connect() {
    try {
      this._ws = new WebSocket(SERVER_URL);
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

    this._ws.onerror = () => {
      // onclose will fire after this
    };
  }

  _scheduleReconnect() {
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
