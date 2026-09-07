/**
 * Race Control v2 — client state + actions.
 *
 * Owns: the field feed (this PC's iRacing -> server), the incident ledger
 * mirrored from the server, the live field table, shared views, and the
 * replay/camera actions that turn an incident into pictures on screen.
 * App.jsx calls this once and hands the result to RaceControlLayout.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { wsClient } from '../lib/ws-client';

export const DECISION_TYPES = [
  { id: 'racing-incident',   label: 'Racing incident',   color: '#60a5fa' },
  { id: 'no-further-action', label: 'No further action', color: '#22c55e' },
  { id: 'incident-noted',    label: 'Incident noted',    color: '#a1a1aa' },
  { id: 'warning',           label: 'Warning',           color: '#f59e0b' },
  { id: 'penalty',           label: 'Penalty',           color: '#ef4444' },
];
export const PENALTY_TIERS = [
  { id: 'drive-through',  label: 'Drive-through',  inSim: '!black' },
  { id: 'stop-go',        label: 'Stop & go',      inSim: '!black' },
  { id: 'time',           label: 'Time penalty' },
  { id: 'eol-next-race',  label: 'EOL next race' },
  { id: 'grid-drop',      label: 'Grid drop' },
  { id: 'license-points', label: 'License points' },
  { id: 'dsq',            label: 'DSQ',            inSim: '!dq' },
];
export const REASONS = ['Avoidable contact', 'Blocking / impeding', 'Unsafe rejoin', 'Track limits', 'Pit lane infraction', 'Qualifying impeding', 'Ignoring blue flags', 'Unsportsmanlike conduct', 'Other'];
export const CATEGORY_LABEL = { contact: 'CONTACT', 'loss-of-control': 'LOSS OF CONTROL', 'off-track': 'OFF TRACK', manual: 'MANUAL' };

const PREFS_KEY = 'bpr-rc-prefs';
const defaultPrefs = { preRoll: 8, camGroup: 'TV1', applyInSim: true, showOffTrack: false, acceptRemote: true };

export function fmtSessionTime(t) {
  if (t == null || !Number.isFinite(t)) return '--:--';
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function useRaceControl({ authenticated, stewardId, stewardName }) {
  const [incidents, setIncidents] = useState({});
  const [session, setSession] = useState(null);
  const [field, setField] = useState(null);
  const [source, setSource] = useState(null);
  const [sharedViews, setSharedViews] = useState([]);
  const [served, setServed] = useState([]);
  const [errors, setErrors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [feed, setFeed] = useState({ running: false, connected: false, lastAt: 0, cam: null, replay: null, sessionNum: null, sessionTime: null, error: null });
  const [prefs, setPrefsState] = useState(() => {
    try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return defaultPrefs; }
  });
  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => { const next = { ...p, ...patch }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {} return next; });
  }, []);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [applied, setApplied] = useState([]);
  // This computer has iRacing (Windows steward PC) vs. a remote desk (Mac / browser)
  const hasSim = !!window.irsdk?.hasSim;

  // ── server state mirror ──
  useEffect(() => {
    const unsubs = [
      wsClient.on('rc:snapshot', (p) => {
        setIncidents(Object.fromEntries((p.incidents || []).map((i) => [i.id, i])));
        setSession(p.session || null);
        setField(p.field || null);
        setSource(p.source || null);
      }),
      wsClient.on('rc:incident', (p) => setIncidents((prev) => ({ ...prev, [p.incident.id]: p.incident }))),
      wsClient.on('rc:incidentRemoved', (p) => setIncidents((prev) => { const n = { ...prev }; delete n[p.incidentId]; return n; })),
      wsClient.on('rc:fieldState', (p) => setField(p)),
      wsClient.on('rc:session', (p) => setSession(p)),
      wsClient.on('rc:source', (p) => setSource(p)),
      wsClient.on('rc:viewShared', (p) => setSharedViews((prev) => [{ ...p }, ...prev.filter((v) => v.from?.id !== p.from?.id)].slice(0, 4))),
      wsClient.on('rc:penaltyServed', (p) => setServed((prev) => [{ ...p, at: Date.now() }, ...prev].slice(0, 20))),
      wsClient.on('rc:error', (p) => setErrors((prev) => [{ ...p, at: Date.now() }, ...prev].slice(0, 10))),
      // A remote steward's penalty arrives here on the in-session PC: type it into the sim and report back
      wsClient.on('rc:applyInSim', async (p) => {
        if (!p?.command) return;
        if (!prefsRef.current.acceptRemote || !window.irsdk?.adminChat) {
          wsClient.send('rc:applied', { incidentId: p.incidentId, command: p.command, ok: false, error: 'remote apply is off on this PC', requestedBy: p.from });
          return;
        }
        const r = await window.irsdk.adminChat(p.command);
        wsClient.send('rc:applied', { incidentId: p.incidentId, command: p.command, ok: !!r?.ok, error: r?.ok ? null : (r?.error || 'failed'), requestedBy: p.from });
      }),
      wsClient.on('rc:applied', (p) => setApplied((prev) => [p, ...prev].slice(0, 10))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // ── field feed: start the bridge, relay every line to the server ──
  useEffect(() => {
    const ir = window.irsdk;
    if (!authenticated || !ir?.feedStart || !ir?.onFeed) return undefined;
    let stopped = false;
    const off = ir.onFeed((line) => {
      if (stopped || !line) return;
      switch (line.t) {
        case 'status': setFeed((f) => ({ ...f, running: true, connected: !!line.connected, error: null })); break;
        case 'error': setFeed((f) => ({ ...f, error: line.message })); break;
        case 'exit': setFeed((f) => ({ ...f, running: false, connected: false })); break;
        case 'frame': setFeed((f) => ({ ...f, running: true, connected: true, lastAt: Date.now(), cam: line.cam, replay: line.replay, sessionNum: line.sessionNum, sessionTime: line.sessionTime })); break;
        default: break;
      }
      if (line.t === 'frame' || line.t === 'session' || line.t === 'hello' || line.t === 'status') wsClient.send('rc:field', line);
    });
    ir.feedStart(4).then((r) => setFeed((f) => ({ ...f, running: !!r?.ok, error: r?.ok ? null : (r?.error || null) })));
    return () => { stopped = true; off(); ir.feedStop?.(); };
  }, [authenticated]);

  // ── derived ──
  const list = useMemo(() => Object.values(incidents).sort((a, b) => a.createdAt - b.createdAt), [incidents]);
  const selected = selectedId ? incidents[selectedId] || null : null;
  const drivers = session?.drivers || [];
  const driverByIdx = useMemo(() => Object.fromEntries(drivers.map((d) => [d.carIdx, d])), [drivers]);
  const cameras = session?.cameras || [];
  const resolveGroup = useCallback((nameOrNum) => {
    if (nameOrNum == null) return 'tv1';
    if (typeof nameOrNum === 'number' || /^\d+$/.test(String(nameOrNum))) return Number(nameOrNum);
    const hit = cameras.find((c) => String(c.GroupName || '').toLowerCase() === String(nameOrNum).toLowerCase());
    return hit ? Number(hit.GroupNum) : String(nameOrNum).toLowerCase().replace(/\s+/g, '');
  }, [cameras]);
  const groupName = useCallback((num) => cameras.find((c) => Number(c.GroupNum) === Number(num))?.GroupName || (num != null ? `group ${num}` : ''), [cameras]);

  // ── replay / camera ──
  const seek = useCallback((sessionNum, sessionTime) => {
    const ir = window.irsdk;
    if (!ir) return;
    if (ir.replayTime && sessionNum != null) return ir.replayTime(sessionNum, Math.max(0, sessionTime));
    return ir.replayJump(Math.max(0, sessionTime));
  }, []);
  const cameraOn = useCallback((carNumber, group) => {
    const ir = window.irsdk;
    if (!ir || !carNumber) return;
    return ir.replayCamera(String(carNumber), String(resolveGroup(group ?? prefs.camGroup)));
  }, [resolveGroup, prefs.camGroup]);
  const jumpTo = useCallback(async (inc, opts = {}) => {
    if (!inc) return;
    const car = opts.car || inc.cars?.[0];
    await seek(inc.sessionNum, (inc.sessionTime || 0) - (opts.preRoll ?? prefs.preRoll));
    if (car?.number) await cameraOn(car.number, opts.camGroup);
    window.irsdk?.replaySpeed?.(1);
  }, [seek, cameraOn, prefs.preRoll]);

  // ── workflow ──
  const send = (type, payload) => wsClient.send(type, payload);
  // Admin chat: typed on this PC when it is in the session, otherwise relayed
  // through the server to whichever steward's PC is feeding the field.
  const simCommand = useCallback((command, incidentId = null) => {
    const inSessionHere = hasSim && feedRef.current.connected && Date.now() - feedRef.current.lastAt < 5000;
    if (inSessionHere && window.irsdk?.adminChat) {
      window.irsdk.adminChat(command).then((r) => setApplied((prev) => [{ incidentId, command, ok: !!r?.ok, error: r?.ok ? null : (r?.error || 'failed'), by: { name: 'this PC' }, at: Date.now() }, ...prev].slice(0, 10)));
    } else {
      wsClient.send('rc:applyInSim', { incidentId, command });
    }
  }, [hasSim]);
  const claim = useCallback((id, force = false) => send('rc:claim', { incidentId: id, force }), []);
  const release = useCallback((id) => send('rc:release', { incidentId: id }), []);
  const update = useCallback((id, patch) => send('rc:update', { incidentId: id, patch }), []);
  const dismiss = useCallback((id) => send('rc:dismiss', { incidentId: id }), []);
  const announce = useCallback((id) => send('rc:publish', { incidentId: id, what: 'investigation' }), []);
  const createIncident = useCallback((carIdxs, notes = '') => {
    send('rc:create', { cars: carIdxs, notes, sessionTime: feedRef.current.replay?.playing ? feedRef.current.replay.sessionTime : feedRef.current.sessionTime, sessionNum: feedRef.current.sessionNum });
  }, []);
  const decide = useCallback((id, decision) => {
    send('rc:decide', { incidentId: id, decision });
    const inc = incidents[id];
    const car = inc?.cars.find((c) => c.carIdx === decision.carIdx) || inc?.cars[0];
    if (prefs.applyInSim && decision.type === 'penalty' && car?.number) {
      const tier = PENALTY_TIERS.find((t) => t.id === decision.tier);
      if (tier?.inSim) simCommand(`${tier.inSim} #${car.number}`, id);
    }
  }, [incidents, prefs.applyInSim, simCommand]);
  const clearInSim = useCallback((carNumber, incidentId = null) => { if (carNumber) simCommand(`!clear #${carNumber}`, incidentId); }, [simCommand]);

  // ── view sharing ──
  const ownView = useMemo(() => {
    const f = feed;
    if (!f.cam) return null;
    const d = driverByIdx[f.cam.carIdx];
    const replaying = !!f.replay?.playing || (f.replay && f.replay.speed !== 1);
    return { sessionNum: f.replay?.sessionNum ?? f.sessionNum, sessionTime: replaying ? f.replay?.sessionTime : f.sessionTime, live: !replaying, carIdx: f.cam.carIdx, carNumber: d?.number || '', driverName: d?.name || '', camGroup: f.cam.group, camGroupName: groupName(f.cam.group), speed: f.replay?.speed ?? 1 };
  }, [feed, driverByIdx, groupName]);
  const shareView = useCallback(() => { if (ownView) send('rc:shareView', ownView); }, [ownView]);
  const followView = useCallback(async (v) => {
    if (!v) return;
    if (v.sessionTime != null && !v.live) await seek(v.sessionNum, v.sessionTime);
    if (v.carNumber) await cameraOn(v.carNumber, v.camGroup);
    window.irsdk?.replaySpeed?.(v.live ? 1 : (v.speed ?? 1));
  }, [seek, cameraOn]);

  return {
    incidents: list, incidentsById: incidents, selected, selectedId, setSelectedId,
    session, field, source, drivers, driverByIdx, cameras, groupName, resolveGroup,
    sharedViews, served, errors, applied, feed, prefs, setPrefs, ownView, hasSim, simCommand,
    simLinked: hasSim && feed.connected && Date.now() - feed.lastAt < 5000,
    stewardId, stewardName,
    claim, release, update, dismiss, announce, createIncident, decide, clearInSim,
    seek, cameraOn, jumpTo, shareView, followView,
  };
}
