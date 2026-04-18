# BPR Race Control — Feature Guide

Detailed description of every feature in the system, how it works from the user's perspective, and the technical flow behind it.

---

## STEWARD FEATURES

### 1. Live Driver Monitoring

**What the steward sees:** A compact dropdown driver selector at the top of the sidebar. Shows how many drivers are selected and how many are online. Click to open a scrollable checklist of all connected drivers with checkboxes — handles 40+ drivers without taking up sidebar space.

**How it works:** When a driver launches their agent and connects, the server broadcasts `driver:joined` to all stewards. The driver list updates in real-time. When a driver disconnects, they stay in the list but show as offline — their history and lap data remain accessible.

**Interaction:** Click the dropdown to open, click drivers to toggle selection (checkmarks). Selected drivers shown in purple. Multiple drivers can be selected simultaneously. Selected drivers are used when flagging incidents. Close button at the bottom of the dropdown.

---

### 2. Incident Flagging (Manual)

**What the steward does:** Selects one or more drivers from the driver dropdown, optionally types a note, and clicks "Flag @ XX:XX" (showing the current session time).

**What happens:**
- An incident entry is created with a unique ID, the current `sessionTime`, the list of involved driver IDs, and the steward's notes
- The incident appears in the incident feed below
- The incident status is "open" (amber badge)

**Technical flow:** This is entirely client-side in the steward app — the incident is stored in React state. It only hits the server when the steward clicks "Review" (which requests the raw-frame telemetry window).

---

### 3. Incident Auto-Detection

**What happens automatically:** The server watches every incoming telemetry frame for three types of events:

#### 3a. Incident Point Detection
- **Trigger:** A driver's `incidents` field (iRacing's `PlayerCarMyIncidentCount`) increments
- **Classification:** +1x = "off-track", +2x or more = "contact"
- **Steward sees:** An incident appears in the feed tagged "CONTACT" (red border) or "1x" (gray border) with the delta and total count
- **Example:** "CONTACT — D. Newman +2x incident (total: 6)"

#### 3b. Blue Flag Violation
- **Trigger:** A lapping car (more laps completed) is within 5% track distance of a slower car for more than 8 continuous seconds
- **Steward sees:** An incident tagged "BLUE FLAG" with both drivers and the duration
- **Example:** "BLUE FLAG — Blue flag ignored for 12s — D. Newman blocking A. Riegel"
- **Cooldown:** Same pair won't re-trigger for 60 seconds

---

### 4. Incident Filtering

**What it does:** Filter toggles at the top of the incident feed let the steward show/hide incident categories:

| Filter | Default | What it controls |
|--------|---------|-----------------|
| Off-track (1x) | OFF | Solo off-tracks (not a stewarding issue) |
| Blue flag | ON | Blue flag violations |
| Driver Report | ON | Protests filed by drivers |
| Manual | ON | Steward-flagged incidents |

**Why off-track is off by default:** 1x incidents are overwhelmingly off-tracks that don't require steward action. Showing them would flood the feed.

**Visual:** Each incident has a colored left border matching its category (gray = 1x, blue = blue flag, amber = protest, purple = manual). The filtered count shows "X hidden" when filters are active.

**Sort order:** Oldest at top, newest at bottom — chronological order for easy tracking.

---

### 5. Incident Review + Telemetry Overlay

**What the steward does:** Clicks "Review" on any incident in the feed.

**What happens simultaneously:**
1. **Telemetry loads:** The steward app sends `request:incidentWindow` to the server with the involved driver IDs, the incident's `sessionTime`, and a 20-second window. The server queries each driver's raw-frame ring buffer (10 minutes of history) and returns the frames.
2. **Charts render:** Four stacked uPlot charts appear — throttle, brake, speed, and steer — showing the involved drivers' data overlaid on the same time axis. Each driver gets a distinct color. All four charts share a synced cursor and dynamically fill the available vertical space.
3. **Drivers notified:** `notify:underInvestigation` is sent to the server, which forwards `server:underInvestigation` to each involved driver's agent. The driver sees an amber "INCIDENT UNDER INVESTIGATION" overlay on their screen.
4. **Replay jumps (when SDK is connected):** `window.irsdk.replayJump(sessionTime)` is called to scrub the steward's iRacing replay to the exact moment of the incident.

**What the steward can read from the telemetry:**
- Did the driver brake late? (Compare brake traces)
- Did someone fail to leave space? (Steer trace shows sudden corrective input)
- How fast were they going? (Speed trace shows velocity delta)
- Was it intentional? (Throttle trace shows if someone accelerated into contact)

---

### 6. Replay Controls

**What it provides:** A persistent control bar (visible on both Telemetry and Standings tabs) with playback, speed, jumping, driver switching, camera selection, and a live button.

**Controls:**
| Control | Options | What it does |
|---------|---------|-------------|
| Play/Pause | Toggle | Starts/stops replay playback |
| LIVE | Red button | Jumps replay to live, resumes 1x speed |
| Speed | 1/4x, 1/2x, 1x, 2x, 4x | Sets replay playback speed |
| Jump | -10s, -5s, +5s, +10s | Scrubs replay forward/backward |
| Driver | < Name > | Cycles through connected drivers, switches camera |
| Camera | Cockpit, Chase, Far Chase, Front, Rear, Chopper, Blimp | 7 camera views |

**Technical:** All controls call through the Electron IPC bridge (`window.irsdk`) → `irsdk-bridge.exe` → iRacing's `BroadcastMsg` API. Fully live — controls the local iRacing instance directly.

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| Space | Play/pause replay |
| Left/Right | Jump -5s / +5s |
| [ / ] | Previous / next driver |
| 1-6 | Camera views |
| Tab | Cycle tabs (Telemetry / Standings / Driver Summary) |
| Escape | Cancel incident review |

---

### 7. Penalty Issuance

**What the steward does:** After reviewing telemetry, clicks one of 7 penalty buttons, optionally types notes, and clicks "Confirm Decision."

**Penalty types:**
| Type | Color | What it means |
|------|-------|--------------|
| No Action | Green | Reviewed, no penalty warranted |
| Race Incident | Blue | Contact occurred but no driver predominantly at fault |
| Warning | Amber | Driver warned, no penalty this time |
| Drive-Through | Red | Must drive through pit lane at speed limit |
| Stop & Go | Red | Must stop in pit box then rejoin |
| Time Penalty | Red | Time added to race result (shows seconds input field) |
| DSQ | Dark red | Disqualified from the session |

**What happens on confirm:**
1. The incident status changes to "resolved" with the penalty attached
2. `notify:penalty` is sent for each involved driver
3. The server forwards `server:penalty` to each driver's agent websocket
4. Each driver sees a transparent overlay banner on their screen with the penalty type, color-coded, with steward notes. Fades after 8 seconds.
5. The server logs a `penalty_issued` event visible to all viewers and the broadcast dashboard
6. For drive-through and stop-go penalties, the server starts monitoring the driver to verify serving

---

### 8. Penalty Serving Verification

**What it does:** After a drive-through or stop-go penalty is issued, the server automatically tracks whether the driver serves it.

**Drive-through:** The server watches for the penalized driver to enter pit road (`onPitRoad = true`) and then exit (`onPitRoad = false`). When they exit, `penalty:served` is broadcast.

**Stop & Go:** The server watches for the driver to enter pit road AND come to a stop (`speed < 1 m/s`). After stopping, when they exit pit road, `penalty:served` is broadcast.

**What stewards/broadcast see:** A "SERVED" tagged event appears in the feed.

---

### 9. Race Control Messages

**What it does:** Lets stewards broadcast messages to drivers as transparent overlays on their screens.

**Templates:** Yellow Flag, Track Limits (pre-built, one-click). Custom message input for anything else.

**Target:** Send to all drivers or a single specific driver (dropdown selector).

**Safety:** Every message goes through a confirmation dialog showing the exact text and target before sending. Prevents accidental broadcasts.

**Driver experience:** The message appears as a top-center overlay banner. Color is auto-detected from content (red for "red flag" or "closed", amber for "yellow" or "caution", green for "green" or "open", white for everything else). Fades after 10 seconds. Click to dismiss.

**Location:** Positioned above the incident list in the sidebar so it doesn't get buried by scrolling incidents.

---

### 10. Driver Protest / Report

**What the driver does:** Presses F1 (or clicks "Report Incident" in the agent GUI).

**What happens:**
1. Agent sends `agent:protest` with the driver's current `sessionTime`, `lap`, and `lapDist`
2. Server broadcasts `driver:protest` to all stewards and viewers
3. Server sends `server:protestAck` back to the driver — driver sees "PROTEST RECEIVED — STEWARDS NOTIFIED" overlay
4. Steward sees a "PROTEST" tagged incident in amber in their incident feed
5. 10-second cooldown on the button prevents spam

**Why it matters:** Drivers can immediately flag an incident from their perspective. The steward gets the exact sessionTime so they can pull up the telemetry and replay.

---

### 11. Multi-Steward Coordination

**What it does:** Prevents two stewards from reviewing the same incident simultaneously. Full identity and locking UI in the steward app.

**Steward identity:** On launch, a modal (`StewardModal.jsx`) prompts the steward to enter their name and select a role (MAIN or SUPPORT). This sends `steward:hello` to the server. The header displays a live steward roster with role badges — red for MAIN, blue for SUPPORT.

**Incident locking UI:** Each incident in the feed shows a lock status badge. When a steward clicks "Review", the incident is automatically locked to them. The badge shows the lock holder's name. Other stewards see the lock and cannot review the same incident. Locks auto-release on resolve, cancel, or disconnect.

**How it works:**
1. Each steward identifies themselves via `steward:hello` with a name and role (MAIN or SUPPORT)
2. When a steward clicks "Review" on an incident, `steward:lockIncident` is sent automatically
3. If the incident is already locked by another steward, the requesting steward gets a denial with the lock holder's name
4. When a steward finishes reviewing (resolves or cancels), `steward:unlockIncident` releases the lock automatically
5. If a steward disconnects, all their locks are automatically released
6. The steward roster and lock state are broadcast to all connected stewards

---

### 12. Driver Incident Summary (Dedicated Tab)

**What it shows:** A full-page table accessible via the "Driver Summary" tab with one row per driver:

| Column | What it shows |
|--------|-------------|
| Driver | Name + offline indicator |
| Laps | Total laps completed |
| Contact | Number of contact incidents |
| Off-Track | Number of 1x off-track incidents |
| Blue Flag | Number of blue flag violations |
| Inc Pts | Total incident points (sum of all deltas) |
| Penalties | Number of penalties issued |

**Color coding:** Contact count turns red when > 0. Incident points amber at <= 4, red at > 4. Helps stewards spot repeat offenders.

**Report Export:** CSV and JSON export buttons alongside the summary table for post-race reports.

---

### 13. Track Map + Incident Heatmap (Standings Tab)

**Track map:** Canvas rendering of the track shape with live car position dots updated at animation frame rate. Pit road indicator (amber ring). Color-coded legend per driver.

**Incident heatmap:** Same track shape but colored by incident density. Brighter segments = more incidents at that part of the track. Individual incident dots colored by type.

**Location:** Both appear side-by-side on the Standings tab, keeping the Telemetry tab clean for incident review.

---

### 14. Live Standings (Dedicated Tab)

**What it shows:** Full race standings table on the "Standings" tab:

| Column | What it shows |
|--------|-------------|
| Pos | Race position (gold for P1, white for podium) |
| # | Car number |
| Class | Car class — LMP2 (red) or GT3 (amber) |
| Driver | Driver name |
| Laps | Laps completed |
| Interval | Gap to car directly ahead |
| Gap | Gap to race leader |
| Best Lap | Personal best (purple if overall fastest) |
| Last Lap | Most recent lap (green if personal best) |
| S1/S2/S3 | Sector times (purple = overall best, green = PB) |
| iR | iRating |
| Pit | Amber "PIT" badge when on pit road |

**Interaction:** Click any driver row to switch the iRacing camera to that car (chase view).

---

### 15. Post-Race Report Export

**What it does:** Two buttons — "Export CSV" and "Export JSON" — on the Driver Summary tab.

**CSV contents:**
- Header: track name, date
- Incidents table: time, type, drivers, status, notes
- Penalties table: driver, penalty type, time seconds, notes
- Driver summary: laps, contacts, off-tracks, blue flags, incident points, penalty count

**JSON contents:** Same data in structured JSON format for programmatic use.

---

### 16. Tabbed Interface

**Three main tabs in the steward app:**
1. **Telemetry** — telemetry overlay charts, penalty panel (focused incident review)
2. **Standings** — live race standings with track map and incident heatmap
3. **Driver Summary** — per-driver statistics table with report export

**Replay controls** sit between the tab content and are always visible regardless of active tab.

Tab key cycles through all three views.

---

### 17a. Selectable Layouts

**What it does:** Three layout options let stewards customize the UI arrangement for their workflow. Selected via a dropdown in the header bar. Choice is persisted in `localStorage`.

| Layout | Best for |
|--------|---------|
| **Split View** | General use. Sidebar + tabbed main area. Default. |
| **Command Center** | Multi-monitor or large screens. All panels visible at once — no tab switching. |
| **Priority Queue** | High-incident sessions. Incident list dominates with inline review. |

All layouts render the same components — they just arrange them differently. Switching layouts preserves all state (selected drivers, active incident review, etc.).

---

### 17b. Local Network Remote Control

**What it does:** Serves the steward UI as a web page on the local network, allowing any LAN device (tablet, phone, second PC) to control iRacing replay remotely.

**How it works:** `local-server.js` starts an Express server on port 5180 alongside Electron. It serves the built steward UI as static files and exposes HTTP endpoints that proxy iRacing SDK commands to `irsdk-bridge.exe`. `irsdk-browser.js` auto-detects whether it's running in Electron or a browser and routes iRacing commands accordingly — IPC in Electron, HTTP in browser.

**Usage:** Open `http://<steward-pc-ip>:5180` on any device on the same network. Full steward UI with replay control, incident review, penalty issuance.

**Limitation:** iRacing must be running on the PC running the Electron app. The browser client controls it remotely via the local server.

---

### 17c. HTTPS / WSS Encryption

**What it does:** All production traffic between clients and the server is encrypted via Cloudflare.

**Domain:** `racecontrol.bitepointracing.com` — Cloudflare DNS with proxy enabled. TLS terminated at Cloudflare edge, proxied to the droplet over HTTP internally.

**Impact:** Websocket connections use `wss://` instead of `ws://`. CSP headers updated to allow `wss://racecontrol.bitepointracing.com`. Direct IP fallback remains for local development and testing.

---

### 17d. Standings Smoothing

**What it does:** Eliminates visual jitter in standings tables and battle tracker during live racing.

**Techniques:**
- **Stable React keys:** Standings rows keyed by `carIdx` (constant per car) instead of race position (changes every update). Prevents unnecessary DOM re-creation.
- **requestAnimationFrame throttling:** Standings updates batched to display refresh rate, preventing mid-frame repaints.
- **CSS transitions:** Position changes animate smoothly instead of snapping.
- **BattleTracker hysteresis:** Battles require 1.5s within threshold to appear, 2.0s outside to disappear. Prevents battles flickering in and out at the boundary.

---

## DRIVER FEATURES

### 17. SimHub Plugin Connection

**What the driver does:** Installs the BPR Race Control SimHub plugin (one-time: run the installer or drop the DLL into the SimHub folder). Opens SimHub — the plugin auto-connects when iRacing starts.

**What happens:** The plugin auto-detects the driver's name, car, and track from iRacing's session data. Connects to `wss://racecontrol.bitepointracing.com/ws/agent`, sends `agent:hello`, then streams telemetry frames at 20Hz and standings at 2Hz.

**Settings:** In SimHub's left sidebar under "BPR Race Control" — server URL, auto-connect toggle, manual connect/disconnect button, Report Incident button.

**Reconnection:** If the connection drops, the plugin automatically retries every 3 seconds.

**Auto-update:** On SimHub launch (or via "Check for Updates" button), the plugin checks GitHub releases for a newer version. If available, a green banner appears. One click downloads the update, silently swaps the DLL, and restarts SimHub.

**Legacy:** The standalone Python agent (`agent/launcher.py`) still works but is deprecated. The bot simulator (`agent/bots.py`) remains active for testing.

---

### 18. Penalty Overlay Notifications

**What the driver sees:** When a steward issues a decision involving them, a transparent overlay banner appears over their iRacing window:

- Top-center position (below iRacing's own HUD at y=60px)
- 92% opacity dark background
- Colored accent stripe at top matching severity
- "RACE CONTROL" header
- Penalty text in large bold colored font
- Steward notes below (if any)
- Auto-fades after 8 seconds
- Click anywhere to dismiss early

**All overlay types:**
| Overlay | Stripe Color | When shown |
|---------|-------------|-----------|
| INCIDENT UNDER INVESTIGATION | Amber | Steward starts review |
| DRIVE-THROUGH PENALTY | Red | With notes |
| STOP & GO PENALTY | Red | With notes |
| TIME PENALTY — Xs | Red | Shows seconds |
| WARNING | Amber | With notes |
| RACE INCIDENT | Blue | No penalty |
| NO ACTION | Green | Cleared |
| DISQUALIFIED | Dark red | With notes |
| PROTEST RECEIVED | White | Protest acknowledged |
| Race control messages | Auto-detected | Yellow flag, track limits, custom |

---

### 19. Incident Reporting (Protest)

**What the driver does:** Presses F1 or clicks "Report Incident" in the agent window.

**What happens:** The agent captures the exact `sessionTime`, `lap`, and `lapDist` and sends it to the server. The button grays out for 10 seconds ("Reported!") to prevent spam. The driver gets a confirmation overlay.

**On the steward side:** A "PROTEST" incident appears in the feed at the exact moment the driver flagged it. The steward can click Review to pull up telemetry and replay at that sessionTime.

---

## BROADCAST FEATURES

### 20. Broadcast Dashboard

**What it is:** A full-screen web dashboard at `https://racecontrol.bitepointracing.com` designed for the broadcast crew. Read-only — no steward controls.

**Layout — 6 panels:**
1. **Live Standings** (main area) — full timing tower with position, car #, class (LMP2/GT3), driver, laps, interval, gap, best/last lap, sector times, pit status. Purple = overall best sector. Green = personal best.
2. **Track Map** (top right) — circuit outline with live car position dots
3. **Battle Tracker** (bottom right) — auto-detects cars within 1.5s of each other, sorted by gap, red highlight for gaps < 0.5s
4. **Session Timer** (bottom left) — large remaining time countdown + elapsed time. Amber when < 10min remaining, red when < 2min
5. **Race Feed** (bottom center) — live event ticker with status bar showing active counts ("2 under review | 1 penalty pending | 3 contacts")
6. **Live Telemetry** (bottom right area) — mini telemetry cards for up to 6 drivers showing speed, gear, throttle/brake bars, current/best lap time

---

### 21. Battle Tracker

**What it does:** Automatically identifies close battles on track.

**Detection:** Scans the standings for any pair of consecutive cars where the interval is <= 1.5 seconds.

**Display:** Each battle shows the two drivers, their positions, and the gap between them. Sorted by gap (closest first).

**Hot battles:** Gaps < 0.5s are highlighted in red — these are the most exciting on-screen battles for the broadcast.

---

### 22. Race Feed (Broadcast)

**What it shows:** A chronological feed of every race event:

| Tag | Color | Event |
|-----|-------|-------|
| INC | Amber | Incident detected (+Xx) |
| CONTACT | Red | Probable car contact |
| BLUE | Blue | Blue flag violation |
| INV | Amber | Under investigation |
| PENALTY | Red | Penalty issued |
| SERVED | Green | Penalty served |
| PROTEST | Amber | Driver filed protest |
| RC | White | Race control message |
| FAST | Purple | New fastest lap |
| JOIN | Green | Driver connected |
| LEFT | Gray | Driver disconnected |

**Status bar:** Persistent summary when counts are non-zero: "2 under review | 1 penalty pending | 3 contacts | 5 inc". Disappears when everything is clear.

---

## SESSION RECORDING

### 23. NDJSON Persistence

**What it does:** Records every telemetry frame, lap, incident, penalty, and event to a per-session NDJSON file on the server.

**When it starts:** Automatically on the first agent connection with track info.

**File location:** `data/sessions/{timestamp}_{trackName}.ndjson`

**What's recorded:**
| Record type | When | Data |
|-------------|------|------|
| `session` | Session start | Track name, track ID |
| `driver` | Driver joins | Driver ID, name, car |
| `frame` | Every frame (20Hz) | Full telemetry object |
| `lap` | Lap completion | Lap number, time, fuel, sectors |
| `incident` | Incident count change | Driver, delta, total, sessionTime |
| `penalty` | Penalty issued | Driver, type, seconds, notes |
| `driver_left` | Driver disconnect | Driver ID, name |
| `blue_flag` | Blue flag violation | Both drivers, duration |
| `penalty_served` | Penalty served | Driver, penalty type |
| `rc_message` | Race control message | Message text, target |
| `driver_protest` | Driver protest | Driver, reason, sessionTime |

---

## MULTI-CLASS SUPPORT

### 24. Multi-Class Racing

**What it supports:** Multiple car classes racing simultaneously on the same track (e.g., GT3 + LMP2).

**Standings:** Class column in both steward and broadcast standings tables. LMP2 shown in red, GT3 in amber. Overall position reflects actual race order (LMP2 at front due to faster lap times).

**Blue flag detection:** Automatically detects when faster-class cars (LMP2) are held up by slower-class cars (GT3), triggering blue flag violation alerts.

**Bot simulator:** 55-car multi-class field (35 GT3 + 20 LMP2) with realistic speed differentials (~10s/lap faster for LMP2), staggered connections, and realistic incident rates.

---

## TESTING TOOLS

### 25. Multi-Class Bot Simulator (`agent/bots.py`)

**What it does:** Spawns multiple mock drivers that stream realistic synthetic telemetry to the server for testing without iRacing.

**Usage:**
```
python bots.py                    # 35 GT3 + 20 LMP2 (55 total)
python bots.py --gt3 10 --lmp2 5  # smaller field for lighter testing
```

**Driver characteristics:**
- **Skill** (0.68-0.97): Affects lap time consistency, corner speed, steering smoothness
- **Aggression** (0.18-0.85): Affects incident frequency and type distribution
- Clean drivers: ~1 incident per 20-30 minutes, mostly 1x
- Aggressive drivers: ~1 incident per 5-10 minutes, more 2x/4x contacts

**Multi-class behavior:**
- LMP2: ~110-114s/lap, 8% faster corner speeds, higher top speed, more downforce, 7-speed gearbox
- GT3: ~120-124s/lap, 8 different car models, 6-speed gearbox
- LMP2 cars lap GT3 cars, triggering blue flag scenarios

**Connection handling:** Bots connect 0.5s apart to avoid overwhelming the server. 30-second websocket timeout. Auto-reconnect on disconnect.

---

## DISTRIBUTION & UPDATES

### 26. SimHub Plugin Installer

**What it is:** An Inno Setup installer (`BPR-RaceControl-SimHub-Plugin-Setup.exe`) for one-click installation.

**What it does:**
1. Auto-detects SimHub's installation directory (checks `C:\Program Files (x86)\SimHub`, `C:\Program Files\SimHub`, and registry)
2. Copies `BPRRaceControl.dll` to the SimHub folder
3. Shows a "restart SimHub" message
4. Optionally launches SimHub after install

**If SimHub not found:** Shows an error directing the user to install SimHub first.

---

### 27. Auto-Update System

**What it does:** The plugin automatically checks for updates from GitHub releases on every SimHub launch.

**How it works:**
1. On `Init()`, background thread hits `https://api.github.com/repos/TNrockytop21/bpr-race-control/releases/latest`
2. Compares release `tag_name` (e.g. `v1.0.4`) against the running assembly version
3. If newer version found with a `BPRRaceControl.dll` asset attached, sets update-available flag
4. Green banner appears in plugin settings: "Update available: v1.0.4 (current: v1.0.3)"
5. "Check for Updates" button available anytime — no restart needed
6. Driver clicks "Install Update" → plugin downloads DLL to temp, writes a silent VBS+batch updater script, closes SimHub
7. Updater waits for SimHub to fully exit, copies new DLL over old one, deletes temp files, restarts SimHub
8. Entire process is invisible — no console window, no manual file copying

**Publishing an update (for maintainers):**
1. Bump version in `AssemblyInfo.cs`
2. Build: `dotnet build -c Release`
3. Create GitHub release with tag `vX.Y.Z`, attach `BPRRaceControl.dll`
4. All drivers see the update on their next SimHub launch

---

### 28. iRacing SDK Bridge

**What it is:** A lightweight C# command-line tool (`irsdk-bridge.exe`) that sends Windows `BroadcastMsg` commands to iRacing.

**Why it exists:** The Electron steward app needs to control iRacing's replay and camera. Native Node.js iRacing SDK bindings (`node-irsdk-2023`) require Visual Studio Build Tools for compilation. The bridge avoids this dependency entirely — it's a single .exe compiled with .NET Framework's built-in `csc.exe`.

**Commands:**
| Command | What it does |
|---------|-------------|
| `status` | Checks if iRacing is running (process detection) |
| `replay-jump <sessionTime>` | Jumps replay to a specific session time |
| `replay-speed <speed>` | Sets replay playback speed (supports slow-mo) |
| `replay-pause` | Pauses replay |
| `replay-play` | Resumes replay at 1x |
| `replay-search <mode>` | Search to start/end/prev-incident/next-incident/prev-lap/next-lap |
| `camera <carIdx> <group>` | Switches camera to a specific car and view |
| `chat <text>` | Sends text to iRacing chat via `SendInput` (admin commands, RC messages) |

**Camera groups:** `nose`(1), `cockpit`(10), `chase`(5), `farchase`(6), `rearchase`(17), `chopper`(16), `blimp`(15), `tv1-3`(11-13), `scenic`(14), `pitlane`(18), or numeric group ID.

**Output:** All commands return JSON to stdout for Electron to parse: `{"ok":true,"action":"replay-jump","sessionTime":123.45}`

---

### 29. iRacing Admin Commands

**What it does:** Enforces penalties and sends race control messages directly in iRacing's game session via the `chat` command on `irsdk-bridge.exe`. Uses `SendInput` to type into iRacing's chat box.

**Penalty enforcement:**
| Penalty type | iRacing chat command |
|-------------|---------------------|
| Drive-Through | `!black #<carNum>` |
| Stop & Go | `!black #<carNum>` |
| DSQ | `!dq #<carNum>` |

**Clear Penalty:** A "Clear Penalty" button sends `!clear #<carNum>` to remove an in-game black flag.

**Race Control messages:** RC messages are also sent to iRacing chat as `/all [RC] <message>`, so all drivers see the message in-game regardless of plugin status.

**Throw Caution:** A dedicated button sends `!yellow` to trigger a full-course caution in iRacing.

**Requirement:** The steward must be an admin in the iRacing session for `!black`, `!dq`, `!clear`, and `!yellow` commands to take effect.

---

### 30. Post-Race PDF Report

**What it does:** An "Export PDF" button on the Driver Summary tab generates a professional formatted race report using jsPDF.

**PDF contents:**
- Red BPR-branded header with race title and track name
- Stat cards: total laps, incidents, penalties issued, protests filed
- Driver summary table: laps, contacts, off-tracks, blue flags, incident points, penalties per driver
- Incident log: timestamped list of all incidents with type, drivers, and status
- Penalty decision cards: each penalty with type, driver, steward notes, and issuing steward

**Format:** Single-page or multi-page PDF, auto-named with track and date. Downloaded directly in the browser.

---

## BROADCAST ANALYTICS

### 31. Gap Chart

**What it shows:** Gap-to-leader over time as a Recharts line chart. Leader is always at 0. Lines converging indicate a battle forming. Data accumulates over ~5 minutes then rolls off.

**Use for commentary:** Visualize pace differences and closing battles.

### 32. Position Tracker

**What it shows:** Position changes over time as a Recharts step-line chart. Each driver is a line, Y-axis is race position (P1 at top). Crossing lines indicate overtakes.

**Use for commentary:** Show who has gained or lost the most positions over a stint.

### 33. Stint Analysis

**What it shows:** Lap-by-lap pace chart. Purple dashed line marks the session's overall best lap. Rising lines indicate tire degradation, flat lines indicate consistent pace.

**Use for commentary:** Compare race pace between drivers, identify tire drop-off.

### 34. Sector Comparison

**What it shows:** Head-to-head sector bars (S1/S2/S3). Grouped bars per sector for up to 4 drivers. Taller bar = slower sector.

**Use for commentary:** Pinpoint exactly where one driver is faster than another.

---

## OBS OVERLAYS

### 35. OBS Overlay System

**What it is:** 12 standalone overlay pages at `/overlay/*` with transparent backgrounds designed for OBS Browser Source. Each page auto-connects to the server and updates live.

**Analytics overlays:** `/overlay/gaps`, `/overlay/positions`, `/overlay/stints`, `/overlay/sectors`

**Race data overlays:** `/overlay/tower`, `/overlay/ticker`, `/overlay/battle`

**Telemetry overlays:** `/overlay/telemetry`, `/overlay/compare`, `/overlay/laptrace`, `/overlay/h2h`

**Full-lap trace overlay:** `/overlay/trace` — canvas-rendered full-lap telemetry graph showing throttle/brake/speed/steering by track distance.

**Query params:** `?drivers=Name1,Name2` to filter to specific drivers, `?max=N` to limit count, `?theme=light` for opaque background.

---

## SPECTATOR FEATURES

### 36. Spectator Live Page (`/live`)

**What it is:** A public viewer page where spectators pick a driver and see their live telemetry, stats, and race data. No steward controls.

**What it shows:**
- **LiveTelemetryGraph** — canvas-based full-lap trace: X = track distance (0-100%), overlaid throttle (green), brake (red), speed (blue), steering (yellow) lines. A position marker moves along the trace showing where the driver is on track. Live speed and gear readout.
- **Live stats** — current position, best/last lap, incident count
- **Sector times** — S1/S2/S3 with personal best and overall best coloring
- **Lap history** — scrollable list of recent laps with times
- **Event feed** — incidents, penalties, RC messages affecting the selected driver

**Data source:** `LiveTelemetryGraph` uses `telemetry-buffer.js` `getCurrentLapFrames()` to render the current lap's trace in real time.
