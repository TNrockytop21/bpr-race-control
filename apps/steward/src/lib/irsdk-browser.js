/**
 * iRacing SDK bridge for browser mode.
 *
 * When running in Electron, window.irsdk is injected by preload.js.
 * When running in a browser (via local-server.js on another PC),
 * this module provides the same API by calling the HTTP endpoints.
 *
 * Auto-detects: if window.irsdk exists, uses it. Otherwise falls
 * back to HTTP calls to the local server.
 */

function getBaseUrl() {
  // The local server runs on the same host that served this page
  return `${window.location.protocol}//${window.location.host}`;
}

async function apiCall(path) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/irsdk/${path}`);
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const browserIrsdk = {
  replayJump: (sessionTime) => apiCall(`replay-jump/${sessionTime}`),
  replaySpeed: (speed) => speed === 0 ? apiCall('replay-pause') : apiCall(`replay-speed/${speed}`),
  replayCamera: (carIdx, camGroup) => apiCall(`camera/${carIdx}/${camGroup}`),
  replaySearch: (mode) => apiCall(`replay-search/${mode}`),
  getStatus: () => apiCall('status'),
  adminChat: (message) => apiCall(`chat/${encodeURIComponent(message)}`),
};

/**
 * Returns the irsdk interface — either the Electron IPC version
 * or the browser HTTP fallback.
 */
export function getIrsdk() {
  if (window.irsdk) return window.irsdk;
  return browserIrsdk;
}
