import { saveProfile } from './profiles.js';

const NUM_DISTANCE_BINS = 1000;

// Ring buffer: 600 seconds (10 min) at 20 Hz = 12000 frames per driver (~2.5 MB max)
const RAW_BUFFER_SECONDS = 600;
const RAW_BUFFER_HZ = 20;
const RAW_BUFFER_CAPACITY = RAW_BUFFER_SECONDS * RAW_BUFFER_HZ;

// Blue flag: lapping car within 5% of track distance behind a slower car
const BLUE_FLAG_PROXIMITY = 0.05;
// Blue flag violation: held up for more than 8 seconds
const BLUE_FLAG_VIOLATION_SECONDS = 8;



class SessionStore {
  constructor() {
    this.sessionInfo = null;
    this.drivers = new Map();
    this.viewers = new Map();
    this.stints = [];
    this.trackShape = null;
    this.eventLog = [];
    this._eventId = 0;
    // Blue flag tracking: key = "slowId::fastId", value = first-detected sessionTime
    this._blueFlagPairs = new Map();
    // Cooldown: don't re-flag the same pair within 60 seconds
    this._blueFlagCooldowns = new Map();
    // Pending penalties awaiting serving: driverId -> { type, issuedAt }
    this._pendingPenalties = new Map();
  }

  setSessionInfo(info) {
    this.sessionInfo = info;
  }

  addDriver(id, { name, car }) {
    // Reconnect dedupe: if a disconnected driver with the same name exists,
    // remove it so ghost entries don't accumulate across reconnects.
    // Returns the removed ghost's id (if any) so the caller can broadcast
    // a DRIVER_LEFT for it before the new DRIVER_JOINED.
    let removedGhostId = null;
    for (const [existingId, driver] of this.drivers) {
      if (!driver.connected && driver.name === name) {
        this.drivers.delete(existingId);
        removedGhostId = existingId;
        break;
      }
    }
    this.drivers.set(id, {
      id,
      name,
      car,
      connected: true,
      lastFrame: null,
      currentLapNumber: null,
      currentLapSamples: [],
      laps: new Map(),
      bestLapTime: null,
      bestLapNumber: null,
      bestSectors: [null, null, null],
      stintStartTime: Date.now(),
      stintStartLap: null,
      // Raw-frame ring buffer for incident review (120s at 20Hz)
      rawFrames: new Array(RAW_BUFFER_CAPACITY),
      rawFrameHead: 0,
      rawFrameCount: 0,
      // Incident tracking (cumulative iRacing incident count)
      lastIncidentCount: null,
    });
    return removedGhostId;
  }

  removeDriver(id) {
    const driver = this.drivers.get(id);
    if (!driver) return null;
    const stint = this._finalizeStint(driver);
    driver.connected = false;
    return stint;
  }

  _finalizeStint(driver) {
    const stintLaps = [];
    for (const [, lap] of driver.laps) {
      if (lap.timestamp >= driver.stintStartTime) stintLaps.push(lap);
    }
    const validLaps = stintLaps.filter((l) => l.valid);
    const stint = {
      id: `stint-${this.stints.length + 1}`,
      driverId: driver.id,
      driverName: driver.name,
      car: driver.car,
      startTime: driver.stintStartTime,
      endTime: Date.now(),
      lapCount: stintLaps.length,
      avgLapTime: validLaps.length > 0
        ? validLaps.reduce((s, l) => s + l.lapTime, 0) / validLaps.length
        : null,
      bestLapTime: validLaps.length > 0
        ? Math.min(...validLaps.map((l) => l.lapTime))
        : null,
      totalFuelUsed: stintLaps.reduce((s, l) => s + l.fuelUsed, 0),
    };
    this.stints.push(stint);
    return stint;
  }

  getStints() {
    return this.stints;
  }

  addEvent(type, data) {
    const event = { id: ++this._eventId, type, timestamp: Date.now(), data };
    this.eventLog.push(event);
    if (this.eventLog.length > 200) this.eventLog.shift();
    return event;
  }

  getEventLog() {
    return this.eventLog;
  }

  updateFrame(driverId, frame) {
    const driver = this.drivers.get(driverId);
    if (!driver) return null;

    driver.lastFrame = frame;
    if (driver.stintStartLap === null) driver.stintStartLap = frame.lap;

    // Push into raw-frame ring buffer
    driver.rawFrames[driver.rawFrameHead] = frame;
    driver.rawFrameHead = (driver.rawFrameHead + 1) % RAW_BUFFER_CAPACITY;
    if (driver.rawFrameCount < RAW_BUFFER_CAPACITY) driver.rawFrameCount++;

    // Detect incident count increment
    let incidentDelta = null;
    if (frame.incidents != null) {
      const current = frame.incidents;
      if (driver.lastIncidentCount !== null && current > driver.lastIncidentCount) {
        incidentDelta = {
          driverId,
          driverName: driver.name,
          previousCount: driver.lastIncidentCount,
          newCount: current,
          delta: current - driver.lastIncidentCount,
          sessionTime: frame.sessionTime,
          lap: frame.lap,
          lapDist: frame.lapDist,
          speed: frame.speed,
        };
      }
      driver.lastIncidentCount = current;
    }

    const prevLap = driver.currentLapNumber;
    const newLap = frame.lap;
    let completedLap = null;

    if (prevLap !== null && newLap > prevLap && driver.currentLapSamples.length > 0) {
      completedLap = this._finalizeLap(driver, prevLap);
    }

    driver.currentLapNumber = newLap;
    driver.currentLapSamples.push({ ...frame });

    return { completedLap, incidentDelta };
  }

  _computeSectors(samples) {
    const boundaries = [1 / 3, 2 / 3];
    const sectorTimes = [];
    let prevTime = 0;

    for (const boundary of boundaries) {
      // Find sample closest to boundary distance
      let closest = samples[0];
      let closestDiff = Math.abs(samples[0].lapDist - boundary);
      for (const s of samples) {
        const diff = Math.abs(s.lapDist - boundary);
        if (diff < closestDiff) {
          closest = s;
          closestDiff = diff;
        }
      }
      sectorTimes.push(Math.max(0, closest.lapTime - prevTime));
      prevTime = closest.lapTime;
    }
    // S3 = total - time at 66.6%
    sectorTimes.push(Math.max(0, samples[samples.length - 1].lapTime - prevTime));
    return sectorTimes;
  }

  _finalizeLap(driver, lapNumber) {
    const samples = driver.currentLapSamples;
    if (samples.length < 10) {
      driver.currentLapSamples = [];
      return null;
    }

    const lapTime = samples[samples.length - 1].lapTime;
    const fuelStart = samples[0].fuel;
    const fuelEnd = samples[samples.length - 1].fuel;
    const fuelUsed = fuelStart - fuelEnd;
    const hadPit = samples.some((s) => s.onPitRoad);

    const trace = this._binByDistance(samples);
    const sectors = this._computeSectors(samples);

    const lapRecord = {
      lapNumber,
      lapTime,
      fuelUsed: Math.max(0, fuelUsed),
      valid: !hadPit && lapTime > 0,
      timestamp: Date.now(),
      trace,
      sectors,
    };

    driver.laps.set(lapNumber, lapRecord);

    if (lapRecord.valid && (driver.bestLapTime === null || lapTime < driver.bestLapTime)) {
      driver.bestLapTime = lapTime;
      driver.bestLapNumber = lapNumber;
      // Save profile
      if (this.sessionInfo?.trackId) {
        saveProfile(
          driver.name,
          this.sessionInfo.trackId,
          this.sessionInfo.trackName,
          lapTime,
          trace,
          sectors
        );
      }
    }

    // Update best sectors
    if (lapRecord.valid) {
      for (let i = 0; i < 3; i++) {
        if (driver.bestSectors[i] === null || sectors[i] < driver.bestSectors[i]) {
          driver.bestSectors[i] = sectors[i];
        }
      }
    }

    // Generate track shape from first valid lap
    if (this.trackShape === null && lapRecord.valid) {
      this.trackShape = this._generateTrackShape(trace);
    }

    driver.currentLapSamples = [];
    return lapRecord;
  }

  _generateTrackShape(trace) {
    const points = [];
    let heading = 0;
    let x = 0;
    let y = 0;
    const n = trace.length;

    for (let i = 0; i < n; i++) {
      const speed = Math.max(trace[i].speed, 5);
      const latG = trace[i].latG || 0;
      const dHeading = (latG / speed) * (1 / n) * 50;
      heading += dHeading;
      x += Math.cos(heading) / n;
      y += Math.sin(heading) / n;
      points.push({ x, y });
    }

    // Close the loop
    const lastX = points[n - 1].x;
    const lastY = points[n - 1].y;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      points[i].x -= lastX * t;
      points[i].y -= lastY * t;
    }

    // Normalize to 0-1
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    for (const p of points) {
      p.x = (p.x - minX) / rangeX;
      p.y = (p.y - minY) / rangeY;
    }

    // Downsample to 200 points
    const step = Math.max(1, Math.floor(n / 200));
    return points.filter((_, i) => i % step === 0);
  }

  _binByDistance(samples) {
    const bins = new Array(NUM_DISTANCE_BINS);
    const channels = ['throttle', 'brake', 'speed', 'gear', 'steer', 'rpm', 'latG', 'lonG'];

    for (let i = 0; i < NUM_DISTANCE_BINS; i++) {
      bins[i] = {};
      for (const ch of channels) bins[i][ch] = 0;
      bins[i]._count = 0;
    }

    for (const s of samples) {
      const idx = Math.min(Math.floor(s.lapDist * NUM_DISTANCE_BINS), NUM_DISTANCE_BINS - 1);
      for (const ch of channels) {
        if (s[ch] !== undefined) bins[idx][ch] += s[ch];
      }
      bins[idx]._count++;
    }

    for (let i = 0; i < NUM_DISTANCE_BINS; i++) {
      if (bins[i]._count > 0) {
        for (const ch of channels) bins[i][ch] /= bins[i]._count;
      }
      delete bins[i]._count;
    }

    for (const ch of channels) {
      let lastFilled = -1;
      for (let i = 0; i < NUM_DISTANCE_BINS; i++) {
        if (bins[i][ch] !== 0 || (i > 0 && bins[i]._count !== undefined)) {
          if (lastFilled >= 0 && i - lastFilled > 1) {
            const startVal = bins[lastFilled][ch];
            const endVal = bins[i][ch];
            for (let j = lastFilled + 1; j < i; j++) {
              const t = (j - lastFilled) / (i - lastFilled);
              bins[j][ch] = startVal + t * (endVal - startVal);
            }
          }
          lastFilled = i;
        }
      }
    }

    return bins;
  }

  /**
   * Return raw frames for a driver within [startTime, endTime] (sessionTime).
   * Returns an array sorted by sessionTime ascending.
   */
  /**
   * Check for blue flag violations across all connected drivers.
   * Called after every frame update. Returns an array of violations
   * detected this tick (usually empty).
   *
   * A violation fires when a lapping car (more laps completed) has
   * been within BLUE_FLAG_PROXIMITY of a slower car's lapDist for
   * longer than BLUE_FLAG_VIOLATION_SECONDS continuously.
   */
  checkBlueFlagViolations(sessionTime) {
    const violations = [];
    const connectedDrivers = [];

    for (const [id, driver] of this.drivers) {
      if (!driver.connected || !driver.lastFrame) continue;
      connectedDrivers.push({
        id,
        name: driver.name,
        lap: driver.lastFrame.lap,
        lapDist: driver.lastFrame.lapDist,
        sessionTime: driver.lastFrame.sessionTime,
      });
    }

    // Check all pairs
    const activePairs = new Set();
    for (let i = 0; i < connectedDrivers.length; i++) {
      for (let j = i + 1; j < connectedDrivers.length; j++) {
        const a = connectedDrivers[i];
        const b = connectedDrivers[j];

        // Determine who's lapping whom
        let faster, slower;
        if (a.lap > b.lap) {
          faster = a; slower = b;
        } else if (b.lap > a.lap) {
          faster = b; slower = a;
        } else {
          continue; // same lap — no blue flag
        }

        // Check proximity (track distance wraps at 0/1)
        let dist = Math.abs(faster.lapDist - slower.lapDist);
        if (dist > 0.5) dist = 1 - dist; // wrap-around

        const pairKey = `${slower.id}::${faster.id}`;

        if (dist <= BLUE_FLAG_PROXIMITY) {
          activePairs.add(pairKey);

          if (!this._blueFlagPairs.has(pairKey)) {
            this._blueFlagPairs.set(pairKey, sessionTime);
          } else {
            const startTime = this._blueFlagPairs.get(pairKey);
            const duration = sessionTime - startTime;
            const cooldownUntil = this._blueFlagCooldowns.get(pairKey) || 0;

            if (duration >= BLUE_FLAG_VIOLATION_SECONDS && sessionTime > cooldownUntil) {
              violations.push({
                slowDriverId: slower.id,
                slowDriverName: slower.name,
                fastDriverId: faster.id,
                fastDriverName: faster.name,
                duration: Math.round(duration),
                sessionTime,
                lap: slower.lap,
                lapDist: slower.lapDist,
              });
              // Set cooldown — don't re-flag this pair for 60 seconds
              this._blueFlagCooldowns.set(pairKey, sessionTime + 60);
              this._blueFlagPairs.delete(pairKey);
            }
          }
        }
      }
    }

    // Clear pairs that are no longer in proximity
    for (const key of this._blueFlagPairs.keys()) {
      if (!activePairs.has(key)) {
        this._blueFlagPairs.delete(key);
      }
    }

    return violations;
  }

  /**
   * Register a penalty that requires pit-lane serving (drive-through or stop-go).
   */
  addPendingPenalty(driverId, penaltyType) {
    if (penaltyType === 'drive-through' || penaltyType === 'stop-go') {
      this._pendingPenalties.set(driverId, {
        type: penaltyType,
        issuedAt: Date.now(),
        wasOnPitRoad: false,
      });
    }
  }

  /**
   * Check if any pending penalties have been served.
   * A drive-through is served when the driver enters and exits pit road.
   * A stop-go is served when the driver enters pit road and speed drops to ~0.
   * Returns an array of served penalties.
   */
  checkPenaltyServing() {
    const served = [];

    for (const [driverId, pending] of this._pendingPenalties) {
      const driver = this.drivers.get(driverId);
      if (!driver || !driver.lastFrame) continue;

      const onPit = driver.lastFrame.onPitRoad;
      const speed = driver.lastFrame.speed || 0;

      if (pending.type === 'drive-through') {
        if (onPit && !pending.wasOnPitRoad) {
          pending.wasOnPitRoad = true;
        }
        if (pending.wasOnPitRoad && !onPit) {
          // Exited pit road — drive-through served
          served.push({
            driverId,
            driverName: driver.name,
            penaltyType: pending.type,
            servedAt: Date.now(),
            sessionTime: driver.lastFrame.sessionTime,
          });
          this._pendingPenalties.delete(driverId);
        }
      } else if (pending.type === 'stop-go') {
        if (onPit && speed < 1) {
          // Stopped in pit — stop-go served
          if (!pending.stopped) {
            pending.stopped = true;
          }
        }
        if (pending.stopped && !onPit) {
          served.push({
            driverId,
            driverName: driver.name,
            penaltyType: pending.type,
            servedAt: Date.now(),
            sessionTime: driver.lastFrame.sessionTime,
          });
          this._pendingPenalties.delete(driverId);
        }
      }
    }

    return served;
  }

  getRawFrames(driverId, startTime, endTime) {
    const driver = this.drivers.get(driverId);
    if (!driver || driver.rawFrameCount === 0) return [];

    const result = [];
    const count = driver.rawFrameCount;
    // Oldest entry is at (head - count) wrapped
    const start = (driver.rawFrameHead - count + RAW_BUFFER_CAPACITY) % RAW_BUFFER_CAPACITY;

    for (let i = 0; i < count; i++) {
      const idx = (start + i) % RAW_BUFFER_CAPACITY;
      const frame = driver.rawFrames[idx];
      if (!frame) continue;
      const t = frame.sessionTime;
      if (t >= startTime && t <= endTime) {
        result.push(frame);
      }
    }
    return result;
  }

  getDriverSummary(driverId) {
    const d = this.drivers.get(driverId);
    if (!d) return null;
    return {
      id: d.id,
      name: d.name,
      car: d.car,
      connected: d.connected,
      bestLapTime: d.bestLapTime,
      bestLapNumber: d.bestLapNumber,
      bestSectors: d.bestSectors,
      lapCount: d.laps.size,
    };
  }

  getSnapshot() {
    const drivers = [];
    for (const d of this.drivers.values()) {
      drivers.push(this.getDriverSummary(d.id));
    }
    return {
      sessionInfo: this.sessionInfo,
      drivers,
      trackShape: this.trackShape,
    };
  }

  getLapList(driverId) {
    const driver = this.drivers.get(driverId);
    if (!driver) return [];
    const list = [];
    for (const [num, lap] of driver.laps) {
      list.push({
        lapNumber: num,
        lapTime: lap.lapTime,
        fuelUsed: lap.fuelUsed,
        valid: lap.valid,
        timestamp: lap.timestamp,
        sectors: lap.sectors,
      });
    }
    return list.sort((a, b) => a.lapNumber - b.lapNumber);
  }

  getLapTrace(driverId, lapNumber) {
    const driver = this.drivers.get(driverId);
    if (!driver) return null;
    const lap = driver.laps.get(lapNumber);
    if (!lap) return null;
    return lap.trace;
  }

  addViewer(ws) {
    this.viewers.set(ws, { subscribedDrivers: new Set() });
  }

  removeViewer(ws) {
    this.viewers.delete(ws);
  }

  setViewerSubscriptions(ws, driverIds) {
    const viewer = this.viewers.get(ws);
    if (!viewer) return;
    viewer.subscribedDrivers = new Set(driverIds);
  }

  subscribeAll(ws) {
    const viewer = this.viewers.get(ws);
    if (!viewer) return;
    viewer.subscribedDrivers = new Set(this.drivers.keys());
  }

  getSubscribedViewers(driverId) {
    const result = [];
    for (const [ws, viewer] of this.viewers) {
      if (viewer.subscribedDrivers.has(driverId)) {
        result.push(ws);
      }
    }
    return result;
  }

  getAllViewers() {
    return [...this.viewers.keys()];
  }
}

export const store = new SessionStore();
