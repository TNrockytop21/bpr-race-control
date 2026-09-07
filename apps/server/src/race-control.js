/**
 * Race Control v2 — whole-field incident detection + steward workflow.
 *
 * Data source: a steward's own iRacing instance (they are session admins).
 * The steward app runs `irsdk-bridge.exe feed`, which streams JSON lines
 * from iRacing's shared memory: a `session` line whenever the session
 * info string updates (every driver's cumulative incident count lives
 * there) and a `frame` line a few times a second (every car's lap, track
 * position, pit status and per-car flags). Nothing runs on driver PCs.
 *
 * Detection: a driver's incident count going up by N is an incident of
 * N x. Two cars gaining 2x+ within CONTACT_WINDOW_S seconds and
 * CONTACT_PCT of track are merged into one contact incident. Cars near
 * the spot at that moment are attached as `nearby` so a steward can pull
 * an uncounted car into the incident with one click.
 *
 * Workflow: new -> investigating (claimed by one steward) -> decided
 * (racing incident / no further action / incident noted / warning /
 * penalty) -> published (broadcast overlay). Decisions publish
 * automatically; "under investigation" is published only when a steward
 * announces it. Everything is persisted in data/racecontrol.db keyed by
 * the iRacing SubSessionID so the website can pull the ledger later.
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'racecontrol.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS rc_incidents (
    id TEXT PRIMARY KEY,
    sessionKey TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    status TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rc_incidents_session ON rc_incidents (sessionKey, createdAt);
  CREATE TABLE IF NOT EXISTS rc_sessions (
    sessionKey TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  );
`);
const stmts = {
  upsert: db.prepare('INSERT INTO rc_incidents (id, sessionKey, createdAt, status, json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, json = excluded.json'),
  bySession: db.prepare('SELECT json FROM rc_incidents WHERE sessionKey = ? ORDER BY createdAt ASC'),
  sessions: db.prepare('SELECT sessionKey, json, updatedAt FROM rc_sessions ORDER BY updatedAt DESC LIMIT 50'),
  upsertSession: db.prepare('INSERT INTO rc_sessions (sessionKey, json, updatedAt) VALUES (?, ?, ?) ON CONFLICT(sessionKey) DO UPDATE SET json = excluded.json, updatedAt = excluded.updatedAt'),
};

// irsdk_Flags bits carried per car in CarIdxSessionFlags
export const FLAG = { BLACK: 0x00010000, DISQUALIFY: 0x00020000, SERVICIBLE: 0x00040000, FURLED: 0x00080000, REPAIR: 0x00100000 };
// irsdk_TrkLoc
export const SURFACE = { NOT_IN_WORLD: -1, OFF_TRACK: 0, IN_PIT_STALL: 1, APPROACHING_PITS: 2, ON_TRACK: 3 };

export const DECISION_TYPES = ['racing-incident', 'no-further-action', 'incident-noted', 'warning', 'penalty'];
export const PENALTY_TIERS = ['drive-through', 'stop-go', 'time', 'eol-next-race', 'grid-drop', 'license-points', 'dsq'];
export const STATUSES = ['new', 'investigating', 'decided', 'published', 'dismissed'];

const CONTACT_WINDOW_S = 2.5;   // two cars gaining points this close in time...
const CONTACT_PCT = 0.02;       // ...and this close on track = one contact incident
const NEARBY_PCT = 0.015;       // cars attached as "nearby" (not counted)
const NEARBY_MAX = 4;
const FIELD_BROADCAST_MS = 500; // steward field table refresh
const SOURCE_STALE_MS = 4000;   // another steward's feed takes over after this

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pctGap = (a, b) => { let d = Math.abs(a - b); if (d > 0.5) d = 1 - d; return d; };

function normalizeDriver(d) {
  return {
    carIdx: num(d.CarIdx, -1),
    name: String(d.UserName || d.AbbrevName || '').trim(),
    userId: num(d.UserID, 0),
    number: String(d.CarNumber ?? d.CarNumberRaw ?? '').replace(/^"|"$/g, ''),
    classId: num(d.CarClassID, 0),
    classShort: String(d.CarClassShortName || '').trim(),
    car: String(d.CarScreenNameShort || d.CarPath || '').trim(),
    isPaceCar: num(d.CarIsPaceCar, 0) === 1,
    isSpectator: num(d.IsSpectator, 0) === 1,
    curInc: num(d.CurDriverIncidentCount, 0),
    teamInc: num(d.TeamIncidentCount, 0),
    team: String(d.TeamName || '').trim(),
  };
}
const incOf = (d) => Math.max(d.teamInc || 0, d.curInc || 0);

class RaceControl {
  constructor() {
    this.session = null;        // { weekend, sessions, drivers[], cameras, update, at }
    this.sessionKey = 'local';
    this.incidents = new Map(); // id -> incident (current sessionKey only)
    this.cars = new Map();      // carIdx -> live { lap, pct, pos, classPos, onPit, surface, flags, lapCompleted, black, at }
    this.lastInc = new Map();   // carIdx -> last seen incident total (per sessionKey)
    this.sessionNum = null;
    this.sessionTime = 0;
    this.sessionState = null;
    this.flags = 0;
    this.source = null;         // { stewardId, name, lastAt }
    this._listeners = new Map();
    this._lastFieldAt = 0;
    this._seq = 0;
  }

  on(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, new Set());
    this._listeners.get(evt).add(fn);
    return () => this._listeners.get(evt).delete(fn);
  }
  _emit(evt, payload) {
    const set = this._listeners.get(evt);
    if (!set) return;
    for (const fn of set) { try { fn(payload); } catch (err) { console.error(`[rc] listener ${evt} failed: ${err.message}`); } }
  }

  // ── feed ingestion (called for every rc:field line a steward sends) ──
  ingest(line, from) {
    if (!line || typeof line !== 'object') return false;
    const now = Date.now();
    if (this.source && this.source.stewardId !== from.id && now - this.source.lastAt < SOURCE_STALE_MS) return false; // another feed is live
    if (!this.source || this.source.stewardId !== from.id) {
      this.source = { stewardId: from.id, name: from.name, lastAt: now };
      console.log(`[rc] field source: ${from.name}`);
      this._emit('source', this.sourceInfo());
    }
    this.source.lastAt = now;
    switch (line.t) {
      case 'session': this._onSession(line); break;
      case 'frame': this._onFrame(line); break;
      default: break; // hello / status / error are for the steward's own UI
    }
    return true;
  }
  sourceInfo() {
    return this.source ? { stewardId: this.source.stewardId, name: this.source.name, lastAt: this.source.lastAt, active: Date.now() - this.source.lastAt < SOURCE_STALE_MS } : null;
  }

  _onSession(s) {
    const weekend = s.weekend || {};
    const key = String(weekend.SubSessionID || weekend.SessionID || 'local');
    if (key !== this.sessionKey) {
      this.sessionKey = key;
      this.incidents.clear();
      this.lastInc.clear();
      for (const row of stmts.bySession.all(key)) {
        try { const inc = JSON.parse(row.json); this.incidents.set(inc.id, inc); } catch { /* skip */ }
      }
      console.log(`[rc] session ${key}: loaded ${this.incidents.size} incidents`);
    }
    const drivers = (s.drivers || []).map(normalizeDriver).filter((d) => d.carIdx >= 0 && !d.isPaceCar);
    this.session = { weekend, sessions: s.sessions || [], drivers, cameras: s.cameras || [], update: s.update ?? null, at: Date.now() };
    stmts.upsertSession.run(key, JSON.stringify({ weekend, sessions: this.session.sessions, driverCount: drivers.length }), Date.now());
    this._emit('session', this.sessionSummary());

    // Incident-count deltas → incidents
    for (const d of drivers) {
      if (d.isSpectator) continue;
      const total = incOf(d);
      const prev = this.lastInc.get(d.carIdx);
      this.lastInc.set(d.carIdx, total);
      if (prev == null || total <= prev) continue;
      this._detect(d, total - prev, total);
    }
  }

  _onFrame(f) {
    this.sessionNum = num(f.sessionNum, this.sessionNum);
    this.sessionTime = num(f.sessionTime, this.sessionTime);
    this.sessionState = f.sessionState ?? this.sessionState;
    this.flags = num(f.flags, 0);
    const now = Date.now();
    const seen = new Set();
    for (const c of f.cars || []) {
      const [carIdx, lap, pct, pos, classPos, onPit, surface, flags, lapCompleted] = c;
      const idx = num(carIdx, -1);
      if (idx < 0) continue;
      seen.add(idx);
      const prev = this.cars.get(idx);
      const black = (num(flags) & FLAG.BLACK) !== 0;
      const live = { lap: num(lap), pct: num(pct), pos: num(pos), classPos: num(classPos), onPit: !!onPit, surface: num(surface, -1), flags: num(flags), lapCompleted: num(lapCompleted), black, at: now };
      if (prev) {
        if (black && !prev.black) live.blackSince = this.sessionTime;
        else if (black) live.blackSince = prev.blackSince ?? this.sessionTime;
        if (!black && prev.black) {
          const d = this.driverFor(idx);
          const served = { carIdx: idx, number: d?.number || '', name: d?.name || `car ${idx}`, sessionTime: this.sessionTime, lap: live.lap, blackFor: prev.blackSince != null ? this.sessionTime - prev.blackSince : null };
          this._emit('served', served);
        }
        if (black && prev.black && prev.onPit !== live.onPit && live.onPit) live.pitDuringBlack = true;
      }
      this.cars.set(idx, live);
    }
    for (const idx of [...this.cars.keys()]) if (!seen.has(idx)) this.cars.delete(idx);
    if (now - this._lastFieldAt >= FIELD_BROADCAST_MS) {
      this._lastFieldAt = now;
      this._emit('field', this.fieldState());
    }
  }

  driverFor(carIdx) {
    return this.session?.drivers.find((d) => d.carIdx === carIdx) || null;
  }
  carRef(carIdx, extra = {}) {
    const d = this.driverFor(carIdx);
    return { carIdx, number: d?.number || '', name: d?.name || `car ${carIdx}`, classShort: d?.classShort || '', userId: d?.userId || 0, ...extra };
  }

  _detect(d, delta, total) {
    const live = this.cars.get(d.carIdx) || {};
    const t = this.sessionTime;
    const category = delta >= 4 ? 'contact' : delta >= 2 ? 'loss-of-control' : 'off-track';
    const car = this.carRef(d.carIdx, { delta, total, lap: live.lap ?? null, pct: live.pct ?? null });

    // Merge with a fresh incident at the same spot (two cars in one contact)
    if (delta >= 2 && live.pct != null) {
      for (const inc of this.incidents.values()) {
        if (inc.kind !== 'auto' || inc.status === 'dismissed' || inc.category === 'off-track') continue;
        if (Math.abs(t - inc.sessionTime) > CONTACT_WINDOW_S || inc.lapPct == null) continue;
        if (pctGap(inc.lapPct, live.pct) > CONTACT_PCT) continue;
        if (inc.cars.some((c) => c.carIdx === d.carIdx)) continue;
        inc.cars.push(car);
        inc.category = 'contact';
        inc.nearby = inc.nearby.filter((n) => n.carIdx !== d.carIdx);
        inc.updatedAt = Date.now();
        this._save(inc);
        this._emit('incident', inc);
        return inc;
      }
    }

    const nearby = [];
    if (live.pct != null) {
      for (const [idx, c] of this.cars) {
        if (idx === d.carIdx || c.surface === SURFACE.NOT_IN_WORLD) continue;
        const gap = pctGap(c.pct, live.pct);
        if (gap <= NEARBY_PCT) nearby.push(this.carRef(idx, { gapPct: Number(gap.toFixed(4)), lap: c.lap }));
      }
      nearby.sort((a, b) => a.gapPct - b.gapPct);
    }
    const inc = {
      id: crypto.randomUUID(),
      seq: ++this._seq,
      sessionKey: this.sessionKey,
      kind: 'auto',
      category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionNum: this.sessionNum,
      sessionTime: t,
      lap: live.lap ?? null,
      lapPct: live.pct ?? null,
      cars: [car],
      nearby: nearby.slice(0, NEARBY_MAX),
      notes: '',
      status: 'new',
      claimedBy: null,
      investigationPublishedAt: null,
      decision: null,
      publishedAt: null,
      airedAt: null,
      served: null,
    };
    this.incidents.set(inc.id, inc);
    this._save(inc);
    this._emit('incident', inc);
    return inc;
  }

  _save(inc) {
    stmts.upsert.run(inc.id, inc.sessionKey, inc.createdAt, inc.status, JSON.stringify(inc));
  }
  _get(id) {
    const inc = this.incidents.get(id);
    if (!inc) throw new Error('unknown incident');
    return inc;
  }

  // ── steward workflow ──
  claim(id, steward, force = false) {
    const inc = this._get(id);
    if (inc.claimedBy && inc.claimedBy.id !== steward.id && !force) {
      return { error: 'claimed', by: inc.claimedBy };
    }
    inc.claimedBy = { id: steward.id, name: steward.name, at: Date.now() };
    if (inc.status === 'new' || inc.status === 'dismissed') inc.status = 'investigating';
    inc.updatedAt = Date.now();
    this._save(inc); this._emit('incident', inc);
    return { incident: inc };
  }
  release(id, steward) {
    const inc = this._get(id);
    inc.claimedBy = null;
    if (inc.status === 'investigating' && !inc.decision) inc.status = 'new';
    inc.updatedAt = Date.now();
    this._save(inc); this._emit('incident', inc);
    return { incident: inc };
  }
  update(id, patch, steward) {
    const inc = this._get(id);
    if (typeof patch.notes === 'string') inc.notes = patch.notes.slice(0, 2000);
    if (Array.isArray(patch.cars)) {
      const keep = new Map(inc.cars.map((c) => [c.carIdx, c]));
      inc.cars = patch.cars.map((idx) => keep.get(num(idx)) || this.carRef(num(idx), { delta: 0, total: this.lastInc.get(num(idx)) ?? 0, added: true }));
      inc.nearby = inc.nearby.filter((n) => !inc.cars.some((c) => c.carIdx === n.carIdx));
    }
    if (typeof patch.status === 'string' && ['new', 'investigating'].includes(patch.status)) inc.status = patch.status;
    if (typeof patch.category === 'string') inc.category = patch.category;
    inc.updatedAt = Date.now();
    this._save(inc); this._emit('incident', inc);
    return { incident: inc };
  }
  decide(id, decision, steward) {
    const inc = this._get(id);
    if (!decision || !DECISION_TYPES.includes(decision.type)) return { error: 'bad decision type' };
    const d = {
      type: decision.type,
      tier: decision.type === 'penalty' ? decision.tier : null,
      seconds: decision.type === 'penalty' && decision.tier === 'time' ? num(decision.seconds, 0) : null,
      points: decision.type === 'penalty' && decision.tier === 'license-points' ? num(decision.points, 0) : null,
      carIdx: decision.carIdx != null ? num(decision.carIdx) : (inc.cars[0]?.carIdx ?? null),
      reason: String(decision.reason || '').slice(0, 200),
      notes: String(decision.notes || '').slice(0, 2000),
      by: { id: steward.id, name: steward.name },
      at: Date.now(),
    };
    if (d.type === 'penalty' && !PENALTY_TIERS.includes(d.tier)) return { error: 'bad penalty tier' };
    inc.decision = d;
    inc.status = 'decided';
    inc.updatedAt = Date.now();
    this._save(inc); this._emit('incident', inc);
    // Decisions go to the broadcast automatically ("when we issue a penalty it pings the broadcasters")
    return this.publish(id, 'decision', steward);
  }
  publish(id, what, steward) {
    const inc = this._get(id);
    const names = inc.cars.map((c) => `#${c.number} ${c.name}`).join(' / ');
    if (what === 'investigation') {
      inc.investigationPublishedAt = Date.now();
      inc.updatedAt = Date.now();
      this._save(inc); this._emit('incident', inc);
      this._emit('event', { type: 'under_investigation', data: { incidentId: inc.id, lap: inc.lap, driverNames: names, cars: inc.cars.map((c) => ({ number: c.number, name: c.name })), note: inc.notes || null, category: inc.category } });
      return { incident: inc };
    }
    if (what === 'decision') {
      if (!inc.decision) return { error: 'no decision to publish' };
      inc.status = 'published';
      inc.publishedAt = Date.now();
      inc.updatedAt = Date.now();
      this._save(inc); this._emit('incident', inc);
      const target = inc.cars.find((c) => c.carIdx === inc.decision.carIdx) || inc.cars[0] || this.carRef(inc.decision.carIdx);
      const base = { incidentId: inc.id, lap: inc.lap, driverName: target?.name || '', carNumber: target?.number || '', driverNames: names, cars: inc.cars.map((c) => ({ number: c.number, name: c.name })), reason: inc.decision.reason || null, by: inc.decision.by?.name || null };
      const map = { 'racing-incident': 'racing_incident', 'no-further-action': 'no_further_action', 'incident-noted': 'incident_noted', warning: 'warning_issued' };
      if (inc.decision.type === 'penalty') {
        this._emit('event', { type: 'penalty_issued', data: { ...base, penaltyType: inc.decision.tier, timeSeconds: inc.decision.seconds, points: inc.decision.points } });
      } else {
        this._emit('event', { type: map[inc.decision.type], data: base });
      }
      return { incident: inc };
    }
    return { error: 'unknown publish target' };
  }
  dismiss(id, steward) {
    const inc = this._get(id);
    inc.status = 'dismissed';
    inc.claimedBy = null;
    inc.updatedAt = Date.now();
    this._save(inc); this._emit('incident', inc);
    return { incident: inc };
  }
  create({ cars = [], sessionTime, sessionNum, notes = '', category = 'manual' }, steward) {
    const t = sessionTime != null ? num(sessionTime) : this.sessionTime;
    const first = this.cars.get(num(cars[0]));
    const inc = {
      id: crypto.randomUUID(), seq: ++this._seq, sessionKey: this.sessionKey, kind: 'manual', category,
      createdAt: Date.now(), updatedAt: Date.now(),
      sessionNum: sessionNum != null ? num(sessionNum) : this.sessionNum, sessionTime: t,
      lap: first?.lap ?? null, lapPct: first?.pct ?? null,
      cars: cars.map((idx) => this.carRef(num(idx), { delta: 0, total: this.lastInc.get(num(idx)) ?? 0 })),
      nearby: [], notes: String(notes || '').slice(0, 2000),
      status: 'investigating', claimedBy: { id: steward.id, name: steward.name, at: Date.now() },
      investigationPublishedAt: null, decision: null, publishedAt: null, airedAt: null, served: null,
      createdBy: { id: steward.id, name: steward.name },
    };
    this.incidents.set(inc.id, inc);
    this._save(inc); this._emit('incident', inc);
    return { incident: inc };
  }
  markServed(carIdx, sessionTime) {
    // Attach a served marker to the newest published drive-through / stop-go for this car
    let best = null;
    for (const inc of this.incidents.values()) {
      if (!inc.decision || inc.decision.type !== 'penalty' || !['drive-through', 'stop-go'].includes(inc.decision.tier)) continue;
      if (inc.decision.carIdx !== carIdx || inc.served) continue;
      if (!best || inc.decision.at > best.decision.at) best = inc;
    }
    if (best) { best.served = { at: Date.now(), sessionTime }; best.updatedAt = Date.now(); this._save(best); this._emit('incident', best); }
    return best;
  }

  // ── views ──
  sessionSummary() {
    if (!this.session) return null;
    return { key: this.sessionKey, weekend: this.session.weekend, sessions: this.session.sessions, drivers: this.session.drivers, cameras: this.session.cameras, update: this.session.update, at: this.session.at };
  }
  fieldState() {
    const cars = [];
    for (const [idx, c] of this.cars) {
      const d = this.driverFor(idx);
      if (d?.isPaceCar) continue;
      cars.push({ carIdx: idx, number: d?.number || '', name: d?.name || `car ${idx}`, classShort: d?.classShort || '', classId: d?.classId || 0, car: d?.car || '',
        pos: c.pos, classPos: c.classPos, lap: c.lap, pct: Number(c.pct.toFixed(4)), onPit: c.onPit, surface: c.surface, black: c.black, dq: (c.flags & FLAG.DISQUALIFY) !== 0, inc: this.lastInc.get(idx) ?? (d ? incOf(d) : 0) });
    }
    cars.sort((a, b) => (a.pos || 999) - (b.pos || 999));
    return { sessionKey: this.sessionKey, sessionNum: this.sessionNum, sessionTime: this.sessionTime, sessionState: this.sessionState, flags: this.flags, source: this.sourceInfo(), cars, at: Date.now() };
  }
  listIncidents() {
    return [...this.incidents.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  snapshot() {
    return { session: this.sessionSummary(), field: this.fieldState(), source: this.sourceInfo(), incidents: this.listIncidents() };
  }
  // For the website dump / audits
  ledger(sessionKey) {
    const key = sessionKey || this.sessionKey;
    if (key === this.sessionKey) return this.listIncidents();
    return stmts.bySession.all(key).map((r) => JSON.parse(r.json));
  }
  sessionsList() {
    return stmts.sessions.all().map((r) => ({ sessionKey: r.sessionKey, updatedAt: r.updatedAt, ...JSON.parse(r.json) }));
  }
}

export const rc = new RaceControl();
