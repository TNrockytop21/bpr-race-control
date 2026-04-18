import { store } from './session-store.js';
import { broadcastToViewers, sendToViewer } from './broadcast.js';
import { MSG } from './protocol.js';
import { loadProfile } from './profiles.js';
import { savePlan, loadPlan, listPlans, deletePlan } from './race-plans.js';
import { recorder } from './session-recorder.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const auth = require('./auth.js');

let agentCounter = 0;

// Map driverId -> agent websocket for reverse messaging (penalties, race control)
const agentSockets = new Map();

// Multi-steward coordination
let stewardCounter = 0;
const stewards = new Map(); // ws -> { id, name, role, connectedAt }
const incidentLocks = new Map(); // incidentId -> { stewardId, stewardName, lockedAt }

export function handleAgentConnection(ws, req) {
  const agentId = `agent-${++agentCounter}`;
  let driverId = null;

  console.log(`[agent] connected: ${agentId}`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type, payload } = msg;

    switch (type) {
      case MSG.AGENT_HELLO: {
        driverId = `driver-${agentId}`;
        const removedGhostId = store.addDriver(driverId, {
          name: payload.driverName || 'Unknown',
          car: payload.car || 'Unknown',
        });
        if (removedGhostId) {
          broadcastToViewers(MSG.DRIVER_LEFT, { driverId: removedGhostId, replaced: true });
        }
        if (payload.trackName) {
          store.setSessionInfo({
            trackName: payload.trackName,
            trackId: payload.trackId,
            trackLength: payload.trackLength,
          });
          // Start recording if not already active
          if (!recorder.active) {
            recorder.start({
              trackName: payload.trackName,
              trackId: payload.trackId,
              trackLength: payload.trackLength,
            });
          }
        }
        for (const viewerWs of store.getAllViewers()) {
          const viewer = store.viewers.get(viewerWs);
          if (viewer) viewer.subscribedDrivers.add(driverId);
        }
        broadcastToViewers(MSG.DRIVER_JOINED, {
          driverId,
          driverName: payload.driverName,
          car: payload.car,
        });
        const joinEvent = store.addEvent('driver_joined', { driverName: payload.driverName, car: payload.car });
        broadcastToViewers(MSG.EVENT, joinEvent);

        if (store.sessionInfo?.trackId) {
          const profile = loadProfile(payload.driverName, store.sessionInfo.trackId);
          if (profile) {
            broadcastToViewers(MSG.PROFILE, { driverId, profile });
          }
        }
        // Register agent socket for reverse messaging
        agentSockets.set(driverId, ws);

        // Record to session file
        recorder.recordDriver(driverId, payload.driverName, payload.car);

        console.log(`[agent] ${payload.driverName} (${driverId})`);
        break;
      }

      case MSG.AGENT_FRAME: {
        if (!driverId) return;
        const trackShapeBefore = store.trackShape;
        const { completedLap, incidentDelta } = store.updateFrame(driverId, payload);

        broadcastToViewers(MSG.TELEMETRY_FRAME, { driverId, ...payload }, driverId);

        // Record frame to session file
        recorder.recordFrame(driverId, payload);

        // Blue flag + contact detection
        if (payload.sessionTime != null) {
          const blueFlagViolations = store.checkBlueFlagViolations(payload.sessionTime);
          for (const v of blueFlagViolations) {
            broadcastToViewers(MSG.BLUE_FLAG_VIOLATION, v);
            const bfEvent = store.addEvent('blue_flag_violation', {
              slowDriver: v.slowDriverName,
              fastDriver: v.fastDriverName,
              duration: v.duration,
              sessionTime: v.sessionTime,
            });
            broadcastToViewers(MSG.EVENT, bfEvent);
            recorder.recordEvent({ type: 'blue_flag', ...v });
            console.log(
              `[blue flag] ${v.slowDriverName} held up ${v.fastDriverName} for ${v.duration}s`
            );
          }

          // Penalty serving verification
          const servedPenalties = store.checkPenaltyServing();
          for (const s of servedPenalties) {
            broadcastToViewers(MSG.PENALTY_SERVED, s);
            const sEvent = store.addEvent('penalty_served', {
              driverName: s.driverName,
              penaltyType: s.penaltyType,
            });
            broadcastToViewers(MSG.EVENT, sEvent);
            recorder.recordEvent({ type: 'penalty_served', ...s });
            console.log(`[penalty served] ${s.driverName} completed ${s.penaltyType}`);
          }
        }

        // Auto-flag incident when a driver picks up incident points
        if (incidentDelta) {
          broadcastToViewers(MSG.INCIDENT_FLAGGED, incidentDelta);
          const incEvent = store.addEvent('incident_detected', {
            driverName: incidentDelta.driverName,
            delta: incidentDelta.delta,
            newCount: incidentDelta.newCount,
            sessionTime: incidentDelta.sessionTime,
          });
          broadcastToViewers(MSG.EVENT, incEvent);
          recorder.recordIncident(incidentDelta);
          console.log(
            `[incident] ${incidentDelta.driverName} +${incidentDelta.delta}x ` +
            `(total: ${incidentDelta.newCount}) @ ${incidentDelta.sessionTime?.toFixed(1)}s`
          );
        }

        if (completedLap) {
          const driver = store.drivers.get(driverId);

          broadcastToViewers(MSG.LAP_COMPLETE, {
            driverId,
            lapNumber: completedLap.lapNumber,
            lapTime: completedLap.lapTime,
            fuelUsed: completedLap.fuelUsed,
            valid: completedLap.valid,
            sectors: completedLap.sectors,
            bestLap: driver?.bestLapTime,
            bestSectors: driver?.bestSectors,
          });

          if (completedLap.valid && completedLap.lapTime === driver?.bestLapTime) {
            const bestEvent = store.addEvent('new_best_lap', {
              driverName: driver?.name,
              lapNumber: completedLap.lapNumber,
              lapTime: completedLap.lapTime,
            });
            broadcastToViewers(MSG.EVENT, bestEvent);
          }

          if (!trackShapeBefore && store.trackShape) {
            broadcastToViewers(MSG.TRACK_SHAPE, { points: store.trackShape });
          }

          recorder.recordLap(driverId, completedLap);

          console.log(
            `[lap] ${driver?.name} L${completedLap.lapNumber}: ${completedLap.lapTime?.toFixed(3)}s`
          );
        }
        break;
      }

      case MSG.AGENT_SESSION_INFO: {
        store.setSessionInfo(payload);
        broadcastToViewers(MSG.SESSION_SNAPSHOT, store.getSnapshot());
        break;
      }

      case MSG.AGENT_PROTEST: {
        if (!driverId) return;
        const driver = store.drivers.get(driverId);
        const driverName = driver?.name || driverId;
        const lastFrame = driver?.lastFrame;

        const protest = {
          driverId,
          driverName,
          sessionTime: lastFrame?.sessionTime || null,
          lap: lastFrame?.lap || null,
          lapDist: lastFrame?.lapDist || null,
          reason: payload?.reason || null,
          timestamp: Date.now(),
        };

        broadcastToViewers(MSG.DRIVER_PROTEST, protest);
        const protestEvent = store.addEvent('driver_protest', {
          driverName,
          reason: payload?.reason || 'No reason given',
          sessionTime: lastFrame?.sessionTime,
        });
        broadcastToViewers(MSG.EVENT, protestEvent);
        recorder.recordEvent({ type: 'driver_protest', ...protest });

        // Acknowledge back to the driver
        const agentWs = agentSockets.get(driverId);
        if (agentWs && agentWs.readyState === 1) {
          agentWs.send(JSON.stringify({
            type: MSG.SERVER_PROTEST_ACK,
            payload: { message: 'PROTEST RECEIVED — STEWARDS NOTIFIED' },
          }));
        }

        console.log(`[protest] ${driverName}: ${payload?.reason || 'no reason'} @ ${lastFrame?.sessionTime?.toFixed(1)}s`);
        break;
      }

      case MSG.AGENT_STANDINGS: {
        broadcastToViewers(MSG.STANDINGS, payload);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (driverId) {
      const driverName = store.drivers.get(driverId)?.name;
      recorder.recordDriverLeft(driverId, driverName);
      const stint = store.removeDriver(driverId);
      broadcastToViewers(MSG.DRIVER_LEFT, { driverId });
      if (stint) {
        broadcastToViewers(MSG.STINT_COMPLETE, stint);
        const stintEvent = store.addEvent('stint_complete', {
          driverName: stint.driverName,
          lapCount: stint.lapCount,
          avgLapTime: stint.avgLapTime,
        });
        broadcastToViewers(MSG.EVENT, stintEvent);
      }
      const leftEvent = store.addEvent('driver_left', { driverName });
      broadcastToViewers(MSG.EVENT, leftEvent);

      agentSockets.delete(driverId);
      console.log(`[agent] ${driverName} disconnected`);
    }
  });
}

export function handleViewerConnection(ws, req) {
  store.addViewer(ws);
  store.subscribeAll(ws);

  sendToViewer(ws, MSG.SESSION_SNAPSHOT, store.getSnapshot());

  const stints = store.getStints();
  if (stints.length > 0) sendToViewer(ws, MSG.STINT_LIST, { stints });
  const events = store.getEventLog();
  if (events.length > 0) sendToViewer(ws, MSG.EVENT_LOG, { events });
  sendToViewer(ws, MSG.PLAN_LIST, { plans: listPlans() });

  console.log('[viewer] connected');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type, payload } = msg;

    switch (type) {
      case MSG.SUBSCRIBE:
        store.setViewerSubscriptions(ws, payload.driverIds || []);
        break;

      case MSG.SUBSCRIBE_ALL:
        store.subscribeAll(ws);
        break;

      case MSG.REQUEST_LAP_TRACE: {
        const trace = store.getLapTrace(payload.driverId, payload.lapNumber);
        sendToViewer(ws, MSG.LAP_TRACE, {
          driverId: payload.driverId,
          lapNumber: payload.lapNumber,
          trace,
        });
        break;
      }

      case MSG.REQUEST_LAP_LIST: {
        const laps = store.getLapList(payload.driverId);
        sendToViewer(ws, MSG.LAP_LIST, {
          driverId: payload.driverId,
          laps,
        });
        break;
      }

      case MSG.REQUEST_STINTS:
        sendToViewer(ws, MSG.STINT_LIST, { stints: store.getStints() });
        break;

      case MSG.SAVE_PLAN: {
        const { eventName, teamName, plan } = payload;
        savePlan(eventName, teamName, plan);
        sendToViewer(ws, MSG.PLAN_LIST, { plans: listPlans() });
        break;
      }

      case MSG.LOAD_PLAN: {
        const plan = loadPlan(payload.eventName, payload.teamName);
        sendToViewer(ws, MSG.PLAN_DATA, { plan });
        break;
      }

      case MSG.DELETE_PLAN: {
        deletePlan(payload.eventName, payload.teamName);
        sendToViewer(ws, MSG.PLAN_LIST, { plans: listPlans() });
        break;
      }

      case MSG.LIST_PLANS:
        sendToViewer(ws, MSG.PLAN_LIST, { plans: listPlans() });
        break;
    }
  });

  ws.on('close', () => {
    store.removeViewer(ws);
    console.log('[viewer] disconnected');
  });
}

/**
 * Steward websocket handler.
 *
 * Stewards get everything viewers get (snapshot, frames, laps, events)
 * plus the ability to request raw-frame windows for incident review.
 */
function broadcastToStewards(type, payload) {
  for (const [sws] of stewards) {
    if (sws.readyState === 1) {
      sws.send(JSON.stringify({ type, payload }));
    }
  }
}

export function handleStewardConnection(ws, req) {
  const stewardId = `steward-${++stewardCounter}`;
  let authenticated = false;
  let stewardInfo = null;

  console.log('[steward] connection opened — awaiting auth');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const { type, payload } = msg;

    // ── Auth gate: must authenticate before anything else ──
    if (!authenticated) {
      if (type === 'auth:token') {
        const token = payload?.token;
        if (!token) {
          ws.send(JSON.stringify({ type: 'auth:failed', payload: { error: 'No token provided' } }));
          ws.close();
          return;
        }

        const decoded = auth.verifyToken(token);
        if (!decoded) {
          ws.send(JSON.stringify({ type: 'auth:failed', payload: { error: 'Invalid or expired token' } }));
          ws.close();
          return;
        }

        // Auth successful — set up steward
        authenticated = true;
        stewardInfo = { id: decoded.stewardId, name: decoded.name, role: decoded.role };

        // Register as viewer to receive race data
        store.addViewer(ws);
        store.subscribeAll(ws);
        sendToViewer(ws, MSG.SESSION_SNAPSHOT, store.getSnapshot());

        const stints = store.getStints();
        if (stints.length > 0) sendToViewer(ws, MSG.STINT_LIST, { stints });
        const events = store.getEventLog();
        if (events.length > 0) sendToViewer(ws, MSG.EVENT_LOG, { events });

        // Register in stewards roster
        stewards.set(ws, { ...stewardInfo, connectedAt: Date.now() });
        broadcastToStewards(MSG.STEWARD_LIST, {
          stewards: [...stewards.values()],
          locks: Object.fromEntries(incidentLocks),
        });

        ws.send(JSON.stringify({
          type: 'auth:ok',
          payload: { steward: stewardInfo },
        }));

        console.log(`[steward] ${stewardInfo.name} (${stewardInfo.role}) authenticated`);
        return;
      }

      // Legacy support: if client sends steward:hello instead of auth:token,
      // allow it (for backward compatibility during transition)
      if (type === MSG.STEWARD_HELLO) {
        authenticated = true;
        const name = payload.name || `Steward ${stewardCounter}`;
        const role = payload.role || 'MAIN';
        stewardInfo = { id: stewardId, name, role };

        store.addViewer(ws);
        store.subscribeAll(ws);
        sendToViewer(ws, MSG.SESSION_SNAPSHOT, store.getSnapshot());

        const stints = store.getStints();
        if (stints.length > 0) sendToViewer(ws, MSG.STINT_LIST, { stints });
        const events = store.getEventLog();
        if (events.length > 0) sendToViewer(ws, MSG.EVENT_LOG, { events });

        stewards.set(ws, { ...stewardInfo, connectedAt: Date.now() });
        broadcastToStewards(MSG.STEWARD_LIST, {
          stewards: [...stewards.values()],
          locks: Object.fromEntries(incidentLocks),
        });
        console.log(`[steward] ${name} (${role}) identified via legacy hello (no auth)`);
        return;
      }

      // Not authenticated and not an auth message — ignore
      ws.send(JSON.stringify({ type: 'auth:required', payload: { error: 'Send auth:token first' } }));
      return;
    }

    // ── Authenticated — process normal steward messages ──
    switch (type) {
      // Legacy hello (already authenticated, ignore)
      case MSG.STEWARD_HELLO:
        break;

      // Incident locking (prevent double-handling)
      case MSG.STEWARD_LOCK_INCIDENT: {
        const { incidentId } = payload || {};
        if (!incidentId) break;
        const stewardInfo = stewards.get(ws) || { id: stewardId, name: stewardId };
        if (incidentLocks.has(incidentId)) {
          // Already locked by someone else
          sendToViewer(ws, MSG.INCIDENT_LOCKED, {
            incidentId,
            ...incidentLocks.get(incidentId),
            denied: true,
          });
        } else {
          incidentLocks.set(incidentId, {
            stewardId: stewardInfo.id,
            stewardName: stewardInfo.name,
            lockedAt: Date.now(),
          });
          broadcastToStewards(MSG.INCIDENT_LOCKED, {
            incidentId,
            stewardId: stewardInfo.id,
            stewardName: stewardInfo.name,
          });
        }
        break;
      }

      case MSG.STEWARD_UNLOCK_INCIDENT: {
        const { incidentId } = payload || {};
        if (!incidentId) break;
        incidentLocks.delete(incidentId);
        broadcastToStewards(MSG.INCIDENT_UNLOCKED, { incidentId });
        break;
      }

      // All viewer messages work for stewards too
      case MSG.SUBSCRIBE:
        store.setViewerSubscriptions(ws, payload.driverIds || []);
        break;

      case MSG.SUBSCRIBE_ALL:
        store.subscribeAll(ws);
        break;

      case MSG.REQUEST_LAP_TRACE: {
        const trace = store.getLapTrace(payload.driverId, payload.lapNumber);
        sendToViewer(ws, MSG.LAP_TRACE, {
          driverId: payload.driverId,
          lapNumber: payload.lapNumber,
          trace,
        });
        break;
      }

      case MSG.REQUEST_LAP_LIST: {
        const laps = store.getLapList(payload.driverId);
        sendToViewer(ws, MSG.LAP_LIST, {
          driverId: payload.driverId,
          laps,
        });
        break;
      }

      case MSG.REQUEST_STINTS:
        sendToViewer(ws, MSG.STINT_LIST, { stints: store.getStints() });
        break;

      // Steward-only: broadcast race control message to drivers
      case MSG.SERVER_MESSAGE: {
        const { message, target } = payload || {};
        if (!message) break;

        const msgPayload = { message, timestamp: Date.now() };

        if (target && target !== 'all') {
          // Single driver
          const agentWs = agentSockets.get(target);
          if (agentWs && agentWs.readyState === 1) {
            agentWs.send(JSON.stringify({ type: MSG.SERVER_MESSAGE, payload: msgPayload }));
          }
        } else {
          // All drivers
          for (const [, agentWs] of agentSockets) {
            if (agentWs.readyState === 1) {
              agentWs.send(JSON.stringify({ type: MSG.SERVER_MESSAGE, payload: msgPayload }));
            }
          }
        }

        const rcEvent = store.addEvent('race_control_message', { message, target: target || 'all' });
        broadcastToViewers(MSG.EVENT, rcEvent);
        recorder.recordEvent({ type: 'rc_message', message, target: target || 'all' });
        console.log(`[RC] ${message}${target && target !== 'all' ? ` → ${store.drivers.get(target)?.name || target}` : ' → ALL'}`);
        break;
      }

      // Steward-only: push penalty to driver's agent
      case MSG.NOTIFY_PENALTY: {
        const { driverId, penaltyType, timeSeconds, notes } = payload || {};
        if (!driverId) break;

        const agentWs = agentSockets.get(driverId);
        const driverName = store.drivers.get(driverId)?.name || driverId;

        const penaltyPayload = {
          driverId,
          driverName,
          type: penaltyType,
          timeSeconds: timeSeconds || null,
          notes: notes || null,
          issuedAt: Date.now(),
        };

        // Send to the driver's agent
        if (agentWs && agentWs.readyState === 1) {
          agentWs.send(JSON.stringify({ type: MSG.SERVER_PENALTY, payload: penaltyPayload }));
          console.log(`[penalty] notified ${driverName}: ${penaltyType}`);
        } else {
          console.log(`[penalty] ${driverName} not connected — penalty logged but not delivered`);
        }

        // Record penalty to session file
        recorder.recordPenalty(driverId, penaltyType, timeSeconds, notes);

        // Register for serving verification (drive-through / stop-go)
        store.addPendingPenalty(driverId, penaltyType);

        // Log as event for all viewers
        const penaltyEvent = store.addEvent('penalty_issued', {
          driverName,
          penaltyType,
          timeSeconds: timeSeconds || null,
        });
        broadcastToViewers(MSG.EVENT, penaltyEvent);
        break;
      }

      // Steward-only: notify drivers their incident is under investigation
      case MSG.NOTIFY_UNDER_INVESTIGATION: {
        const { driverIds, notes } = payload || {};
        if (!driverIds || driverIds.length === 0) break;

        for (const driverId of driverIds) {
          const agentWs = agentSockets.get(driverId);
          const driverName = store.drivers.get(driverId)?.name || driverId;

          const uiPayload = {
            driverId,
            driverName,
            notes: notes || null,
            issuedAt: Date.now(),
          };

          if (agentWs && agentWs.readyState === 1) {
            agentWs.send(JSON.stringify({ type: MSG.SERVER_UNDER_INVESTIGATION, payload: uiPayload }));
            console.log(`[investigation] notified ${driverName}: under investigation`);
          }
        }

        const driverNames = driverIds.map((id) => store.drivers.get(id)?.name || id).join(', ');
        const invEvent = store.addEvent('under_investigation', { driverNames, notes: notes || null });
        broadcastToViewers(MSG.EVENT, invEvent);
        break;
      }

      // Steward-only: raw-frame incident window
      case MSG.REQUEST_INCIDENT_WINDOW: {
        const { driverIds, centerSessionTime, windowSeconds } = payload || {};
        if (!driverIds || !centerSessionTime || !windowSeconds) break;

        const halfWindow = windowSeconds / 2;
        const startTime = centerSessionTime - halfWindow;
        const endTime = centerSessionTime + halfWindow;

        const result = {};
        for (const driverId of driverIds) {
          result[driverId] = store.getRawFrames(driverId, startTime, endTime);
        }

        sendToViewer(ws, MSG.INCIDENT_WINDOW, {
          driverIds,
          centerSessionTime,
          windowSeconds,
          frames: result,
        });

        const driverNames = driverIds.map((id) => store.drivers.get(id)?.name || id).join(', ');
        console.log(
          `[steward] incident window: ${driverNames} @ ${centerSessionTime.toFixed(1)}s ±${halfWindow}s`
        );
        break;
      }
    }
  });

  ws.on('close', () => {
    store.removeViewer(ws);
    const info = stewards.get(ws);
    stewards.delete(ws);
    // Release any locks held by this steward
    for (const [incId, lock] of incidentLocks) {
      if (lock.stewardId === (info?.id || stewardId)) {
        incidentLocks.delete(incId);
        broadcastToStewards(MSG.INCIDENT_UNLOCKED, { incidentId: incId });
      }
    }
    if (stewards.size > 0) {
      broadcastToStewards(MSG.STEWARD_LIST, {
        stewards: [...stewards.values()],
        locks: Object.fromEntries(incidentLocks),
      });
    }
    console.log(`[steward] ${info?.name || stewardId} disconnected`);
  });
}
