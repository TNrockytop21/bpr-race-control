# BPR Race Control — Technical Architecture

This document describes the full system architecture, every component, how they connect, the complete message protocol, and data storage.

---

## System Overview

Four applications share one websocket-based data pipeline:

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Driver PC  │     │  DigitalOcean    │     │  Steward PC       │
│             │     │  Droplet         │     │                   │
│  SimHub     │────▶│  Server          │◀───▶│  Electron App     │
│  Plugin     │     │  (Node.js)       │     │  (React + iRSDK)  │
│  (C# .dll)  │◀────│                  │     │                   │
│  + Overlays │     │                  │────▶│  irsdk-bridge.exe │
└─────────────┘     │                  │     └───────────────────┘
                    │                  │
                    │                  │────▶┌───────────────────┐
                    │                  │     │  Broadcast Crew   │
                    └──────────────────┘     │  Web Dashboard    │
                                            │  (React/Vite)     │
                                            └───────────────────┘
```

**Data flows in two directions:**
- **Forward:** SimHub Plugin → Server → Viewers/Stewards (telemetry, standings, events)
- **Reverse:** Steward → Server → SimHub Plugin (penalties, investigation notices, race control messages, protest acknowledgments)

---

## 1. SimHub Plugin (`plugins/simhub/BPRRaceControl/`)

The primary driver-side agent. A C# SimHub plugin (.NET Framework 4.8) that runs inside SimHub on each driver's PC. Reads iRacing telemetry via SimHub's data pipeline and streams it over websocket to the server. Replaces the standalone Python agent — drivers just drop a DLL into their SimHub folder (or use the installer).

### Files

| File | Purpose |
|------|---------|
| `BPRRaceControlPlugin.cs` | Main plugin class (IPlugin + IDataPlugin + IWPFSettingsV2). 60Hz DataUpdate throttled to 20Hz send rate. State machine: Idle → WaitingForSession → HelloSent → Streaming. |
| `WebSocketClient.cs` | Background-thread websocket manager. ConcurrentQueue for sends, auto-reconnect with 3s backoff, receive loop for server messages. |
| `TelemetryFrameBuilder.cs` | Maps SimHub `GameRawData.Telemetry.*` properties to JSON frame payload. Radians-to-degrees conversion for steering. Optional fields omitted when null. |
| `StandingsBuilder.cs` | Reads CarIdx* telemetry arrays + SimHub Opponents collection for driver names/car/iRating. Outputs standings array matching Python agent format. |
| `NotificationOverlay.cs` | WPF popup windows for penalty/investigation/RC message overlays. Top-center banner, 92% opacity, color-coded, 8s auto-fade with click-to-dismiss. |
| `PluginUpdater.cs` | Auto-update: checks GitHub releases API on startup, compares assembly version, downloads new DLL, silent batch+VBS swap, restarts SimHub. |
| `SettingsControl.cs` | WPF settings panel: server URL, auto-connect, connect/disconnect, Report Incident button, Check for Updates button, update banner. |
| `PluginSettings.cs` | Persisted settings model (ServerUrl, AutoConnect). |
| `Protocol.cs` | Message type constants + JSON envelope helpers matching server protocol. |
| `AssemblyInfo.cs` | Assembly version tracking for auto-updater. |

### Threading model

```
SimHub Thread (60Hz)              Background Thread
  DataUpdate()                      WebSocket Send Loop
    → skip 2/3 ticks (20Hz)          → dequeue from ConcurrentQueue
    → TelemetryFrameBuilder           → SendAsync to server
    → JSON serialize                  → 1ms yield when empty
    → Enqueue (O(1))
                                    WebSocket Receive Loop
  Every 10th send (2Hz):              → ReceiveAsync
    → StandingsBuilder                → parse JSON
    → Enqueue standings               → Dispatcher.Invoke for WPF overlay
```

### Auto-update system

1. On Init(), `PluginUpdater.CheckForUpdateAsync()` hits `https://api.github.com/repos/TNrockytop21/bpr-race-control/releases/latest`
2. Compares `tag_name` (e.g. `v1.0.4`) against `Assembly.GetExecutingAssembly().GetName().Version`
3. If newer: green banner in settings panel + "Check for Updates" button anytime
4. On click "Install Update": downloads DLL to temp, writes silent VBS+batch updater, closes SimHub, swaps DLL, restarts SimHub — no console window visible

### Installation

- **Installer:** `installer/output/BPR-RaceControl-SimHub-Plugin-Setup.exe` — auto-detects SimHub path, copies DLL
- **Manual:** Copy `BPRRaceControl.dll` to `C:\Program Files (x86)\SimHub\`, restart SimHub

### What the plugin sends

Same protocol as the Python agent — fully compatible, no server changes needed.

Core (20Hz): `lap`, `lapDist`, `lapTime`, `throttle`, `brake`, `speed`, `rpm`, `gear`, `steer`, `latG`, `lonG`, `fuel`, `onPitRoad`, `position`, `sessionTime`, `sessionTimeRemain`.

Optional: water/oil temp, oil pressure, voltage, fuel pressure, fuel use/hour, clutch, ABS, TC, air/track temp, wind, `incidents`, lap delta, last lap time.

### What the plugin receives (reverse channel)

| Message | What happens on driver's screen |
|---------|-------------------------------|
| `server:penalty` | WPF overlay: penalty type in large text, color-coded stripe, steward notes. Fades after 8s. |
| `server:underInvestigation` | Amber overlay: "INCIDENT UNDER INVESTIGATION". Fades after 10s. |
| `server:message` | Race control message overlay. Color auto-detected from content. |
| `server:protestAck` | Green overlay: "PROTEST RECEIVED". |

### Exposed SimHub properties

The plugin exposes properties readable by SimHub's Dash Studio overlay system:
- `BPRRaceControl.Connected` — websocket connection state
- `BPRRaceControl.LastPenalty` — most recent penalty type
- `BPRRaceControl.UnderInvestigation` — investigation flag
- `BPRRaceControl.LastRCMessage` — last race control message
- `BPRRaceControl.ProtestCooldown` — protest button cooldown state

---

## 1b. Legacy Python Agent (`agent/`) — Deprecated

The original standalone Python agent. Still functional but superseded by the SimHub plugin. Retained for bot simulation and as a fallback.

| File | Purpose |
|------|---------|
| `launcher.py` | Tkinter GUI — driver enters name, clicks Connect. Penalty overlays via Tkinter. |
| `main.py` | CLI entry point with `--mock` flag for synthetic telemetry. |
| `bots.py` | Multi-class bot simulator — 35 GT3 + 20 LMP2 mock drivers. |
| `capture.py` | Reads iRacing SDK via pyirsdk. |
| `protocol.py` | Message constructors. |
| `config.py` | SERVER_URL, send/capture rates. |

---

## 2. Server (`apps/server/src/`)

Node.js + Express + ws. Single process on the droplet. Three websocket endpoints.

### Files

| File | Purpose |
|------|---------|
| `main.js` | HTTP server, websocket routing (`/ws/agent`, `/ws/viewer`, `/ws/steward`), health check, Stream Deck API. |
| `ws-handler.js` | Connection handlers for agents, viewers, and stewards. Agent socket registry (`agentSockets` Map) for reverse messaging. Steward coordination (identity, incident locking). Auto-detection broadcasting. |
| `session-store.js` | `SessionStore` class — single shared driver pool. Lap finalization, distance trace compression, raw-frame ring buffer (10 min), blue flag detection, penalty serving verification. |
| `broadcast.js` | `broadcastToViewers()`, `sendToViewer()` — message delivery. |
| `protocol.js` | `MSG` constants — shared vocabulary between agent, server, and all clients. |
| `session-recorder.js` | `SessionRecorder` class — appends every frame, lap, incident, penalty, and event to per-session NDJSON files in `data/sessions/`. |
| `profiles.js` | Per-driver best-lap profile persistence in `data/profiles/`. |
| `race-plans.js` | Race plan save/load/delete persistence. |

### SessionStore internals

**Raw-frame ring buffer:** Pre-allocated array of 12,000 slots per driver (600 seconds / 10 minutes at 20Hz, ~2.5MB). Circular write on every frame. `getRawFrames(driverId, startTime, endTime)` queries by sessionTime range — powers incident review telemetry.

**Blue flag detection:** Every frame, compares all connected driver pairs. If a lapping car (more laps completed) is within 5% track distance of a slower car for >8 seconds continuously, fires `blueFlag:violation`. 60-second cooldown per pair.

**Incident tracking:** Watches each driver's `incidents` field (iRacing's cumulative `PlayerCarMyIncidentCount`). When it increments, fires `incident:flagged` with the delta, classified as `contact` (2x+) or `off-track` (1x).

**Penalty serving verification:** When a drive-through or stop-go penalty is issued via `addPendingPenalty()`, tracks the driver's `onPitRoad` and `speed`. Drive-through served when driver enters and exits pit road. Stop-go served when driver enters pit, stops (speed < 1), then exits. Fires `penalty:served`.

### Multi-steward coordination

- Stewards identify via `steward:hello` with name and role (MAIN/SUPPORT).
- `steward:lockIncident` prevents two stewards reviewing the same incident. Denial sent if already locked.
- `steward:unlockIncident` releases the lock. Locks auto-release when a steward disconnects.
- `steward:list` broadcasts current steward roster and lock state.
- `broadcastToStewards()` helper sends to all steward websockets.

### Session recording

`SessionRecorder` creates NDJSON files named `{timestamp}_{trackName}.ndjson`. Every line is a JSON object tagged with a type:

```
{"t":"session","ts":1713045600000,"trackName":"Sebring","trackId":237}
{"t":"driver","ts":1713045601000,"d":"driver-agent-1","name":"J.Smith","car":"GT3 R"}
{"t":"frame","ts":1713045601050,"d":"driver-agent-1","st":3245.5,"data":{...}}
{"t":"lap","ts":1713045720000,"d":"driver-agent-1","ln":5,"lt":121.45,...}
{"t":"incident","ts":1713045800000,"d":"driver-agent-1","delta":2,"total":4}
{"t":"penalty","ts":1713045900000,"d":"driver-agent-1","type":"drive-through"}
```

Recording starts automatically when the first agent connects with track info. Keys abbreviated (`t`, `ts`, `d`, `st`, `ln`, `lt`) to minimize disk usage at 20Hz write rate.

---

## 3. Steward App (`apps/steward/`)

Electron + React + Vite desktop application. Runs on the steward's PC alongside iRacing. Connects to `wss://racecontrol.bitepointracing.com/ws/steward` (or direct IP fallback).

### Architecture

- **Electron main process** (`electron/main.js`): Window management, IPC handlers for iRacing SDK replay control via `irsdk-bridge.exe`.
- **iRacing SDK bridge** (`electron/irsdk-bridge.exe`): Lightweight C# tool that sends Windows `BroadcastMsg` commands to iRacing for replay control, camera switching, and status checking. Called via `child_process.execFile` — no native Node modules needed.
- **Preload bridge** (`electron/preload.js`): Exposes `window.irsdk` API — `replayJump()`, `replaySpeed()`, `replayCamera()`, `replaySearch()`, `getStatus()`.
- **React renderer** (`src/`): All UI components.

### Multi-steward identity

On launch, a modal (`StewardModal.jsx`) prompts for steward name and role (MAIN / SUPPORT). This sends `steward:hello` to the server. The header displays a steward roster with role badges (red MAIN, blue SUPPORT). Incident lock status badges show which steward is reviewing each incident. Locks are automatically acquired on review, released on resolve or cancel, and cleared on disconnect.

### Selectable layouts

Three layouts selectable from a dropdown in the header, persisted in `localStorage`:

| Layout | Description |
|--------|-------------|
| **Split View** | Default. Sidebar (drivers, incidents, RC messages) + main area (tabbed telemetry/standings/summary). Classic two-column. |
| **Command Center** | Multi-panel grid — standings, incidents, telemetry, and track map all visible simultaneously. No tabs. |
| **Priority Queue** | Incident-first. Large incident list dominates the view with inline review. Optimized for high-incident sessions. |

Layout components live in `src/layouts/` — each receives the same props and renders the same child components in different arrangements.

### Layout (Split View — default)

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: BPR Race Control — track, drivers, steward roster,     │
│          layout selector, connection status                      │
├──────────────┬───────────────────────────────────────────────────┤
│              │                                                   │
│  Driver      │  [Telemetry] [Standings] [Driver Summary]         │
│  Dropdown    │                                                   │
│  (select     │  TELEMETRY TAB:                                   │
│  for         │  ┌───────────────────────────────────────────┐    │
│  incidents)  │  │ uPlot: Throttle, Brake, Speed, Steer     │    │
│              │  │ Synced cursor, dynamic height, no scroll  │    │
│──────────────│  └───────────────────────────────────────────┘    │
│  Race        │  Penalty Panel (when reviewing)                   │
│  Control     │                                                   │
│  Messages    │  STANDINGS TAB:                                   │
│  (templates  │  Track Map + Incident Heatmap (side by side)      │
│  + custom)   │  Full standings table with class column           │
│              │                                                   │
│──────────────│  DRIVER SUMMARY TAB:                              │
│              │  Per-driver stats table + Report Export            │
│  Incident    │                                                   │
│  Feed        │──────────────────────────────────────────────────│
│  (filtered,  │  Replay Controls (always visible):                │
│  scrollable, │  Play/Pause │ LIVE │ Speed │ Jump │ Driver │ Cam  │
│  oldest      │                                                   │
│  first)      │                                                   │
└──────────────┴───────────────────────────────────────────────────┘
```

### Local network server

`local-server.js` runs an Express server on port 5180 alongside Electron. It serves the steward UI as a static web page and proxies iRacing SDK commands over HTTP REST endpoints. Any device on the LAN can open `http://<steward-ip>:5180` in a browser to get the full steward UI with remote replay control.

`src/lib/irsdk-browser.js` provides the same `window.irsdk` API as the Electron preload bridge, but routes commands over HTTP to the local server instead of Electron IPC. It auto-detects the runtime environment (Electron vs browser) and picks the right transport.

### Components (13)

| Component | What it does |
|-----------|-------------|
| `DriverList.jsx` | (Legacy) Full driver list — replaced by inline dropdown in App.jsx |
| `IncidentPanel.jsx` | Incident creation, 5-category filtering, chronological feed, review workflow |
| `TelemetryOverlay.jsx` | 4 stacked uPlot charts with synced cursor, dynamic height, driver color legend |
| `PenaltyPanel.jsx` | 7 penalty buttons, time input, notes, confirm/cancel |
| `ReplayControls.jsx` | Play/pause, LIVE, speed (1/4-4x), jump (+-5/10s), driver nav, 7 camera views |
| `LiveStandings.jsx` | Full standings with class column, click-to-camera, color-coded sectors |
| `RaceControlMessages.jsx` | Templates + custom input, target selector (all/single), confirmation dialog |
| `DriverSummaryPanel.jsx` | Per-driver stats table (contacts, off-tracks, blue flags, inc pts, penalties) |
| `TrackMap.jsx` | Canvas track with live car dots, pit indicator, driver legend |
| `IncidentHeatmap.jsx` | Track colored by incident density, type-colored dots |
| `ReportExport.jsx` | CSV and JSON post-race report download |
| `LiveStandings.jsx` | Race standings with class, sectors, click-to-camera |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space | Play/pause replay |
| Left/Right | Jump -5s / +5s |
| [ / ] | Previous / next driver |
| 1-6 | Camera views |
| Tab | Cycle tabs (Telemetry → Standings → Driver Summary) |
| Escape | Cancel incident review |

### Build & Distribution

- **Dev:** `npm run dev` — Vite HMR + Electron
- **Windows build:** `npm run pack` — outputs to `C:/temp/bpr-steward-build/win-unpacked/`
- **Mac:** Clone repo, `npm run dev` (or `npm run pack:mac` on a Mac)
- Portable .exe — no installer needed, just run `BPR Race Control.exe`

---

## 4. Broadcast Dashboard (`apps/web/`)

Vite + React web app served at `https://racecontrol.bitepointracing.com`. Connects to `/ws/viewer`. Read-only.

### Layout

```
┌───────────────────────────────────────────┬─────────────┐
│  LIVE STANDINGS                           │  TRACK MAP  │
│  (P, #, Class, Driver, Laps, Int, Gap,    │  (car dots) │
│   Best, Last, S1, S2, S3, Pit)            │             │
│  Class: LMP2 (red) / GT3 (amber)         ├─────────────┤
│  Purple = overall best sector             │  BATTLES    │
│  Green = personal best                    │  (<1.5s gap)│
├──────────┬──────────────────┬─────────────┼─────────────┘
│  SESSION │  RACE FEED       │  LIVE TELEM │
│  TIMER   │  Status bar:     │  (6 drivers │
│  Remain  │  "2 under rev"   │  speed,gear │
│  Elapsed │  Event ticker    │  T/B bars)  │
└──────────┴──────────────────┴─────────────┘
```

### Components (5 broadcast-specific)

| Component | What it does |
|-----------|-------------|
| `BroadcastStandings.jsx` | Compact timing tower with class column, color-coded sectors |
| `BattleTracker.jsx` | Auto-detects cars within 1.5s, red highlight for <0.5s |
| `SessionTimer.jsx` | Large countdown, amber <10min, red <2min |
| `IncidentFeed.jsx` | Event ticker with 11 tag types, persistent status bar |
| `TelemetrySnippet.jsx` | Mini telemetry cards for up to 6 drivers |

Reuses `TrackMap.jsx` from `components/track/` for live car positions.

### Analytics Components (4)

| Component | What it shows |
|-----------|--------------|
| `GapChart.jsx` | Gap-to-leader over time (Recharts line chart). Lines converging = battle forming. ~5 min rolling window. |
| `PositionTracker.jsx` | Position changes over time (Recharts step-line). Crossing lines = overtake. |
| `StintAnalysis.jsx` | Lap-by-lap pace chart. Shows tire degradation. Purple dashed line = session best. |
| `SectorComparison.jsx` | Head-to-head sector bars (S1/S2/S3). Grouped per sector, up to 4 drivers. |

All four use Recharts for rendering and accept `?drivers=` and `?max=` query params when used as overlays.

### OBS Overlay Routing

12 overlay URLs served under `/overlay/*` with `transparent` body background for OBS Browser Source:

| Category | Paths |
|----------|-------|
| Analytics | `/overlay/gaps`, `/overlay/positions`, `/overlay/stints`, `/overlay/sectors` |
| Race Data | `/overlay/tower`, `/overlay/ticker`, `/overlay/battle` |
| Telemetry | `/overlay/telemetry`, `/overlay/compare`, `/overlay/laptrace`, `/overlay/h2h` |
| Full-Lap Trace | `/overlay/trace` |

Query params: `?drivers=Name1,Name2` to filter, `?max=N` to limit driver count, `?theme=light` for opaque background.

### Spectator Page (`/live`)

Public viewer page where spectators pick a driver and see live telemetry. Includes a `LiveTelemetryGraph` (canvas-based full-lap trace), live stats, sector times, lap history, and event feed. No steward controls.

### LiveTelemetryGraph

Canvas-rendered full-lap telemetry trace. X-axis = track distance (0-100%), Y-axis = throttle (green), brake (red), speed (blue), steering (yellow). Current position marker moves along the trace. Live speed/gear readout overlay. Data sourced from `telemetry-buffer.js` `getCurrentLapFrames()`.

### Post-Race PDF Report

Export PDF button on the Driver Summary tab. Generates a professional formatted PDF using jsPDF: red BPR header, stat cards (laps/incidents/penalties/protests), driver summary table, incident log, and penalty decision cards.

---

## 5. Message Protocol (`protocol.js`)

All websocket messages use `{ type, payload }` format.

### Agent → Server
| Type | Payload | When |
|------|---------|------|
| `agent:hello` | `{ driverName, car, trackId, trackName, trackLength }` | On connect |
| `agent:frame` | Full telemetry object (20+ channels) | 20Hz |
| `agent:standings` | Array of driver standings with carClass | 2Hz |
| `agent:sessionInfo` | `{ trackName, trackId }` | Session change |
| `agent:protest` | `{ reason }` | Driver presses F1 |

### Server → Viewer/Steward
| Type | Payload | When |
|------|---------|------|
| `session:snapshot` | `{ sessionInfo, drivers[], trackShape }` | On connect |
| `driver:joined` | `{ driverId, driverName, car }` | Agent hello |
| `driver:left` | `{ driverId, replaced }` | Agent disconnect |
| `telemetry:frame` | `{ driverId, ...frameData }` | 20Hz per driver |
| `lap:complete` | `{ driverId, lapNumber, lapTime, sectors, bestLap }` | Lap finish |
| `standings` | Array of standings | 2Hz |
| `track:shape` | `{ points }` | First valid lap |
| `event` | `{ id, type, timestamp, data }` | Any event |
| `incident:flagged` | `{ driverId, delta, newCount, sessionTime }` | Incident count change |
| `blueFlag:violation` | `{ slowDriverId, fastDriverId, duration }` | Blue flag held >8s |
| `penalty:served` | `{ driverId, penaltyType }` | DT/SG completed |
| `driver:protest` | `{ driverId, driverName, sessionTime, reason }` | Driver protest |

### Steward → Server
| Type | Payload | When |
|------|---------|------|
| `request:incidentWindow` | `{ driverIds, centerSessionTime, windowSeconds }` | Review incident |
| `notify:penalty` | `{ driverId, penaltyType, timeSeconds, notes }` | Issue penalty |
| `notify:underInvestigation` | `{ driverIds, notes }` | Start review |
| `server:message` | `{ message, target }` | RC broadcast |
| `steward:hello` | `{ name, role }` | Identify steward |
| `steward:lockIncident` | `{ incidentId }` | Claim incident |
| `steward:unlockIncident` | `{ incidentId }` | Release incident |

### Server → Agent (reverse channel)
| Type | Payload | When |
|------|---------|------|
| `server:penalty` | `{ type, timeSeconds, notes }` | Penalty issued |
| `server:underInvestigation` | `{ notes }` | Review started |
| `server:message` | `{ message }` | RC broadcast |
| `server:protestAck` | `{ message }` | Protest received |

### Server → Steward only
| Type | Payload | When |
|------|---------|------|
| `incident:window` | `{ frames: { driverId: frame[] } }` | Raw frame response |
| `steward:list` | `{ stewards[], locks }` | Steward roster change |
| `incident:locked` | `{ incidentId, stewardName }` | Incident claimed |
| `incident:unlocked` | `{ incidentId }` | Incident released |

---

## 6. Data Storage

### In-memory (SessionStore)
- Driver registry with connection state, lap history, stint tracking
- Per-driver raw-frame ring buffer (10 min at 20Hz = 12,000 frames per driver)
- Per-driver incident count tracking
- Blue flag proximity pairs + cooldowns
- Pending penalty serving queue
- Event log (last 200 events)
- Agent websocket registry (`agentSockets` Map) for reverse messaging
- Steward registry + incident lock state

### On disk
- `data/sessions/*.ndjson` — full session recordings (every frame from every driver)
- `data/profiles/*.json` — per-driver best lap profiles per track

---

## 7. Infrastructure

| Component | Location |
|-----------|---------|
| Server | DigitalOcean droplet `45.55.216.21` |
| Domain | `racecontrol.bitepointracing.com` — Cloudflare DNS + proxy |
| Broadcast dashboard | Served by same droplet via nginx (built Vite output) |
| SimHub Plugin | Driver's PC (DLL in SimHub folder, auto-updates from GitHub) |
| Legacy Agent | Driver's PC (PyInstaller .exe or `python main.py`) — deprecated |
| Steward app | Steward's PC (Electron — portable .exe or `npm run dev`) |
| Local network server | Steward's PC, port 5180 — serves steward UI to LAN browsers |
| Deploy | `deploy.sh` — Node 20, nginx, pm2, ufw |

### HTTPS / WSS via Cloudflare

All production traffic routes through `racecontrol.bitepointracing.com`. Cloudflare terminates TLS and proxies to the droplet. Websocket endpoints use `wss://` in production. CSP headers updated to allow `wss://racecontrol.bitepointracing.com`. Direct IP access (`ws://45.55.216.21`) remains as fallback.

### Endpoints
| URL | Purpose |
|-----|---------|
| `wss://racecontrol.bitepointracing.com/ws/agent` | Agent telemetry stream |
| `wss://racecontrol.bitepointracing.com/ws/viewer` | Broadcast dashboard websocket |
| `wss://racecontrol.bitepointracing.com/ws/steward` | Steward app websocket |
| `https://racecontrol.bitepointracing.com/health` | Health check |
| `https://racecontrol.bitepointracing.com/` | Broadcast web dashboard |
| `http://<steward-ip>:5180/` | Local network steward UI (LAN only) |

---

## 8. Auto-Detection Thresholds

| Detection | Parameter | Value | Purpose |
|-----------|-----------|-------|---------|
| Blue flag proximity | `BLUE_FLAG_PROXIMITY` | 5% track distance | How close cars must be |
| Blue flag duration | `BLUE_FLAG_VIOLATION_SECONDS` | 8 seconds | How long before flagging |
| Blue flag cooldown | Per-pair cooldown | 60 seconds | Prevent re-flagging |

---

## 9. Key Design Decisions

- **`sessionTime` is the universal time key.** Every frame, incident, penalty, and replay scrub point is anchored to iRacing's session clock. Cross-car sync and telemetry-to-replay sync are free.
- **Single driver pool.** No team scoping. All drivers in one `SessionStore`. Every viewer and steward sees every driver.
- **Inline styles only.** No Tailwind/CSS modules in the steward app.
- **10-minute ring buffer, not full history.** Raw frames in memory for incident review. Full history goes to disk via session recording.
- **Steward app is Electron.** Browser can't access iRacing's SDK. Desktop app can control replay via `BroadcastMsg`.
- **IPC per concern.** `irsdk:replay` for replay commands, `irsdk:session` for session info, `irsdk:status` for connection status.
- **Auto-detection supplements manual.** Server auto-flags incidents (contact, blue flag, incident count), but stewards can also flag manually. Both appear in the same incident feed.
- **Broadcast dashboard is read-only.** Shares the same websocket events but exposes no controls.
- **Multi-class aware.** Standings include `carClass` field. LMP2/GT3 displayed with distinct colors.
- **Standings smoothing.** Stable React keys (carIdx, not position), `requestAnimationFrame` throttling, CSS transitions for position changes. BattleTracker uses hysteresis (1.5s entry, 2.0s exit) to prevent flicker.
- **Local network access.** Steward UI is dual-runtime: Electron for local iRacing SDK, browser via `local-server.js` for LAN devices. `irsdk-browser.js` auto-detects environment.

---

## 10. iRacing SDK Integration (Live)

The Electron main process calls `irsdk-bridge.exe` (a C# tool using Windows `SendNotifyMessage` + `RegisterWindowMessage("IRSDK_BROADCASTMSG")`) for all iRacing control. No native Node modules needed.

| IPC Channel | Bridge Command | iRacing API |
|-------------|---------------|------------|
| `irsdk:replay:jump` | `replay-jump <sessionTime>` | `BroadcastMsg(ReplaySetPlayPosition, frame)` |
| `irsdk:replay:speed` | `replay-speed <speed>` / `replay-pause` | `BroadcastMsg(ReplaySetPlaySpeed, speed)` |
| `irsdk:replay:camera` | `camera <carIdx> <group>` | `BroadcastMsg(CamSwitchNum, carIdx+1, camGroup)` |
| `irsdk:replay:search` | `replay-search <mode>` | `BroadcastMsg(ReplaySearch, mode)` |
| `irsdk:status` | `status` | Process detection (`iRacingSim64DX11`) |
| `irsdk:chat` | `chat <text>` | `SendInput` keystrokes to iRacing chat box |

Camera names mapped to group numbers: `nose`(1), `cockpit`(10), `chase`(5), `farchase`(6), `rearchase`(17), `chopper`(16), `blimp`(15), `tv1-3`(11-13), `scenic`(14), `pitlane`(18).

Search modes: `start`, `end`, `prev-incident`, `next-incident`, `prev-lap`, `next-lap`.

### iRacing Admin Commands (via chat)

The `chat` command sends arbitrary text to iRacing's in-game chat using `SendInput` keystrokes. This powers penalty enforcement and race control messaging without native SDK admin APIs.

| Action | Chat command sent | Triggered by |
|--------|------------------|-------------|
| Drive-Through penalty | `!black #<carNum>` | Penalty confirm (DT) |
| Stop & Go penalty | `!black #<carNum>` | Penalty confirm (SG) |
| DSQ | `!dq #<carNum>` | Penalty confirm (DSQ) |
| Clear Penalty | `!clear #<carNum>` | Clear Penalty button |
| RC Message | `/all [RC] <message>` | Race Control message send |
| Throw Caution | `!yellow` | Throw Caution button |

---

## 11. Repo Structure

```
plugins/simhub/BPRRaceControl/
  BPRRaceControl.csproj   .NET 4.8 class library
  BPRRaceControlPlugin.cs Main plugin (IPlugin + IDataPlugin + IWPFSettingsV2)
  WebSocketClient.cs      Background websocket manager
  TelemetryFrameBuilder.cs  Property → JSON mapping
  StandingsBuilder.cs     CarIdx + Opponents → standings
  NotificationOverlay.cs  WPF penalty/investigation overlays
  PluginUpdater.cs        GitHub releases auto-updater
  SettingsControl.cs      WPF settings panel
  Protocol.cs             Message constants
  PluginSettings.cs       Settings model
  AssemblyInfo.cs         Version tracking

agent/                    (legacy — deprecated, kept for bots)
  launcher.py             Tkinter GUI agent
  main.py                 CLI agent + MockIRacing
  bots.py                 55-car multi-class bot simulator
  capture.py              iRacing SDK frame reader
  protocol.py             Message constructors
  config.py               SERVER_URL, rates

apps/server/src/
  main.js               HTTP + WebSocket server
  ws-handler.js          Agent/viewer/steward handlers
  session-store.js      SessionStore + detection + ring buffer
  broadcast.js          Message broadcasting
  protocol.js           MSG constants
  session-recorder.js   NDJSON persistence
  profiles.js           Driver profile persistence
  race-plans.js         Race plan persistence

apps/steward/
  electron/main.js      Electron main process + IPC via irsdk-bridge
  electron/preload.js   IPC bridge (window.irsdk)
  electron/irsdk-bridge.cs   C# source for iRacing BroadcastMsg tool
  electron/irsdk-bridge.exe  Compiled bridge (no native Node deps)
  local-server.js       Express server on port 5180 — serves UI + proxies irsdk over HTTP
  src/App.jsx           Root component + state management
  src/components/       13 UI components + StewardModal.jsx
  src/layouts/          Selectable layout components
    SplitViewLayout.jsx     Default two-column layout
    CommandCenterLayout.jsx Multi-panel grid layout
    PriorityQueueLayout.jsx Incident-first layout
  src/lib/ws-client.js  Steward WebSocket client
  src/lib/irsdk-browser.js  Browser-compatible irsdk API (HTTP to local-server)
  vite.config.js        Renderer build config
  package.json          Build scripts (dev/pack/dist)

apps/web/
  src/pages/            BroadcastDashboard, SpectatorPage (/live)
  src/components/broadcast/  5 broadcast components
  src/components/analytics/  GapChart, PositionTracker, StintAnalysis, SectorComparison
  src/components/track/      TrackMap
  src/components/live/       Reusable telemetry components, LiveTelemetryGraph
  src/context/          SessionContext, TelemetryContext, ThemeContext
  src/hooks/            useAnimationFrame, useFullscreen, etc.
  src/lib/              ws-client, telemetry-buffer, utils

installer/
  simhub-plugin-setup.iss  Inno Setup script for SimHub plugin installer
  setup.iss                Legacy agent installer
  output/                  Built installer executables

CLAUDE.md               Project context and build order
ARCHITECTURE.md          This file
FEATURES.md              Detailed feature guide
```
