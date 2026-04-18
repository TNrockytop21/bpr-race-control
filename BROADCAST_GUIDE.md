# BPR Race Control — Broadcast Crew Guide

Everything you need to set up and use BPR Race Control for your broadcast.

**Dashboard URL:** https://racecontrol.bitepointracing.com

---

## Quick Start

1. Open https://racecontrol.bitepointracing.com in any browser
2. The dashboard auto-connects to the race server
3. You'll see live standings, battles, events, and telemetry as soon as drivers connect
4. No login required — the broadcast dashboard is read-only

---

## Main Dashboard Layout

The main page at `/` shows everything on one screen:

| Panel | Location | What it shows |
|-------|----------|---------------|
| **Live Standings** | Main area | Full timing tower — position, car #, class, driver name, laps, interval, gap, best lap, last lap, sector times (S1/S2/S3), pit status |
| **Track Map** | Top right | Circuit outline with live car position dots |
| **Battle Tracker** | Right side | Auto-detects cars within 1.5s of each other. Red highlight when gap < 0.5s |
| **Session Timer** | Bottom left | Elapsed time. Turns amber < 10 min remaining, red < 2 min |
| **Race Feed** | Bottom center | Live event ticker — incidents, penalties, protests, blue flags, fastest laps, joins/leaves |
| **Live Telemetry** | Bottom right | Mini telemetry cards for drivers — speed, gear, throttle/brake bars |

### Color Coding (Standings)

- **Purple** lap/sector = overall best in the field
- **Green** lap/sector = driver's personal best
- **Gold P1** = race leader
- **Amber "PIT"** badge = driver on pit road
- **Red "LMP2"** / **Amber "GT3"** = car class indicators

### Race Feed Tags

| Tag | Color | Meaning |
|-----|-------|---------|
| INC | Amber | Incident detected (driver picked up incident points) |
| BLUE | Blue | Blue flag violation |
| INV | Amber | Under investigation by stewards |
| PENALTY | Red | Penalty issued |
| SERVED | Green | Penalty served (drive-through/stop-go completed) |
| PROTEST | Amber | Driver filed a protest |
| RC | White | Race control message |
| FAST | Purple | New fastest lap |
| JOIN | Green | Driver connected |
| LEFT | Gray | Driver disconnected |

### Status Bar

When incidents are active, a persistent summary bar shows at the top of the race feed:
- "2 under review" (amber) — stewards are reviewing
- "1 penalty pending" (red) — penalty issued but not yet served
- "5 inc" (gray) — total incident count

---

## OBS Overlay Pages

Each overlay is a standalone page with transparent background designed for OBS Browser Source. Add them to your OBS scene and they update live.

### How to Add an Overlay to OBS

1. In OBS, click **+** under Sources → **Browser**
2. Name it (e.g. "Gap Chart")
3. Set **URL** to the overlay address below
4. Set **Width** and **Height** to fit your scene layout
5. Check **"Shutdown source when not visible"** to save resources
6. The background is transparent — it overlays directly on your scene

### Available Overlays

#### Analytics

| URL | What it shows | Recommended size |
|-----|---------------|-----------------|
| `/overlay/gaps` | Gap-to-leader over time. Lines converging = battle forming. | 800 x 400 |
| `/overlay/positions` | Position changes over time. Step-line showing who gained/lost. | 800 x 400 |
| `/overlay/stints` | Lap-by-lap pace chart. Shows tire degradation and consistency. | 800 x 400 |
| `/overlay/sectors` | Head-to-head sector comparison (S1/S2/S3 bars). | 600 x 300 |

#### Telemetry

| URL | What it shows | Recommended size |
|-----|---------------|-----------------|
| `/overlay/telemetry?drivers=D.Newman` | Single driver HUD — speed, gear, throttle/brake bars, lap time, position | 360 x 250 |
| `/overlay/compare?drivers=D.Newman,A.Riegel` | Side-by-side telemetry cards for two drivers | 740 x 250 |
| `/overlay/laptrace?drivers=D.Newman` | Current vs best lap — sector-by-sector delta with +/- time | 400 x 300 |
| `/overlay/h2h?drivers=D.Newman,A.Riegel` | Head-to-head comparison — gap, best/last lap, sector chart | 450 x 350 |
| `/overlay/trace?drivers=D.Newman` | Full-lap telemetry graph — throttle/brake/speed/steer by track distance | 800 x 400 |

#### Race Data

| URL | What it shows | Recommended size |
|-----|---------------|-----------------|
| `/overlay/tower` | Standings timing tower. Same data as main dashboard. | 400 x 800 |
| `/overlay/ticker` | Event feed / race ticker. Incidents, penalties, fastest laps. | 500 x 300 |
| `/overlay/battle` | Active battles with gap display. Red when < 0.5s. | 350 x 300 |

### Filtering Drivers

Add query parameters to any overlay URL to filter what's shown:

| Parameter | Example | What it does |
|-----------|---------|-------------|
| `drivers` | `?drivers=D.Newman,A.Riegel` | Show only these drivers |
| `max` | `?max=6` | Limit to top N drivers |
| `theme` | `?theme=light` | Light background instead of transparent |

**Examples:**
```
https://racecontrol.bitepointracing.com/overlay/gaps?drivers=D.Newman,A.Riegel,M.Johnson
https://racecontrol.bitepointracing.com/overlay/stints?max=4
https://racecontrol.bitepointracing.com/overlay/tower?max=20
```

---

### Telemetry Overlays for Commentators

**Single driver HUD** (`/overlay/telemetry?drivers=D.Newman`):
- Live speed (km/h), gear number, RPM
- Throttle bar (green) and brake bar (red)
- Current lap time vs best lap time
- Position indicator

**Side-by-side** (`/overlay/compare?drivers=D.Newman,A.Riegel`):
- Two driver HUD cards next to each other
- Perfect for battle coverage — see both drivers' inputs in real time

**Lap trace** (`/overlay/laptrace?drivers=D.Newman`):
- Shows current sector times vs driver's best lap sectors
- Green sectors = faster than personal best, red = slower
- Overall delta displayed (+/- seconds)

**Head to head** (`/overlay/h2h?drivers=D.Newman,A.Riegel`):
- Full comparison card: gap, positions, best/last laps
- Sector-by-sector line chart
- Shows exactly where each driver is faster

**Full-lap trace** (`/overlay/trace?drivers=D.Newman`):
- Canvas-rendered graph: X = track distance (0-100%), overlaid lines for throttle (green), brake (red), speed (blue), steering (yellow)
- Current position marker moves along the trace in real time
- Live speed and gear readout
- Great for showing driver technique — where they brake, where they get on the throttle

---

## Spectator Page (`/live`)

A public page where viewers can follow a specific driver's live telemetry. No login required.

1. Open `https://racecontrol.bitepointracing.com/live`
2. Pick a driver from the dropdown
3. See their live telemetry graph (full lap by track distance), stats, sector times, lap history, and events

Good for sharing with fans who want to follow a specific driver during the race.

---

## Understanding the Analytics

### Gap Chart (`/overlay/gaps`)

- **X axis** = time in minutes since you opened the page
- **Y axis** = gap to race leader in seconds
- **Leader** is always at 0 on the Y axis
- Lines moving **down** toward 0 = driver catching the leader
- Lines moving **up** = driver falling back
- Two lines **converging** = a battle is forming between those drivers
- Data accumulates over ~5 minutes then rolls off the oldest

**Use for:** "Newman is closing on Riegel — the gap has come down from 3 seconds to 1.2 in the last 4 laps"

### Position Tracker (`/overlay/positions`)

- **X axis** = time in minutes
- **Y axis** = race position (P1 at top, higher numbers lower)
- Step-line style — shows exact moments positions changed
- Crossing lines = an overtake happened

**Use for:** "Johnson has gained 5 positions in the last 10 minutes — look at that climb from P12 to P7"

### Stint Analysis (`/overlay/stints`)

- **X axis** = lap number
- **Y axis** = lap time
- Purple dashed line = overall best lap in the session
- Rising lines = pace degradation (tires wearing out)
- Flat lines = consistent pace
- Compare multiple drivers to see who has better race pace vs qualifying pace

**Use for:** "Riegel's lap times are climbing — looks like tire degradation is setting in. Newman is still consistent at 1:22 flat"

### Sector Comparison (`/overlay/sectors`)

- Grouped bars per sector (S1, S2, S3)
- Compare up to 4 drivers head to head
- Taller bar = slower sector time

**Use for:** "Newman is faster in Sector 1 and 3, but Riegel is making up time in the technical Sector 2"

---

## Tips for Broadcast

### Scene Suggestions

**Main race view:**
- iRacing replay feed (full screen)
- `/overlay/tower` (left side, narrow, tall)
- `/overlay/ticker` (bottom bar)

**Battle focus:**
- iRacing replay of the battle
- `/overlay/gaps?drivers=Driver1,Driver2` (showing just those two)
- `/overlay/battle` (corner)

**Strategy/analysis break:**
- `/overlay/stints?max=4` (main focus)
- `/overlay/sectors?drivers=Driver1,Driver2` (side panel)
- Commentator discusses pace and tire strategy

**Incident review:**
- iRacing replay of the incident
- `/overlay/ticker` (showing the incident event)
- Wait for steward decision — it appears in the ticker as PENALTY or NO ACTION

### Keeping Data Fresh

- Overlays auto-connect to the server and update in real time
- If an overlay disconnects, it auto-reconnects in 2 seconds
- Gap/position history starts accumulating from when you open the page
- Refresh the page to reset the history if needed

### Multi-Monitor Setup

Open different overlay URLs on different monitors:
- Monitor 1: iRacing broadcast feed
- Monitor 2: Main dashboard (full standings + feed)
- Monitor 3: Analytics overlays for commentator reference

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Dashboard shows "Disconnected" | Check your internet connection. It auto-reconnects in 2 seconds. |
| No drivers showing | Drivers haven't connected yet. They connect when they launch iRacing with the SimHub plugin. |
| Overlay background not transparent in OBS | Make sure you're using a `/overlay/` URL, not the main `/` page. Check that OBS Browser Source doesn't have a custom CSS overriding background. |
| Gap chart is empty | Gap data starts accumulating when you open the page. Wait for standings updates to come in (every ~0.5 seconds). |
| Standings are jumpy | Normal at race start when positions change rapidly. They smooth out after a few laps. |

---

## Full URL Reference

**Base URL:** `https://racecontrol.bitepointracing.com`

| Path | Description |
|------|-------------|
| `/` | Main broadcast dashboard (all panels) |
| `/overlay/gaps` | Gap-to-leader chart |
| `/overlay/positions` | Position change chart |
| `/overlay/stints` | Lap time / stint analysis |
| `/overlay/sectors` | Sector comparison bars |
| `/overlay/tower` | Standings timing tower |
| `/overlay/ticker` | Event feed / race ticker |
| `/overlay/battle` | Active battle tracker |
| `/overlay/telemetry` | Single driver telemetry HUD |
| `/overlay/compare` | Side-by-side telemetry comparison |
| `/overlay/laptrace` | Current vs best lap comparison |
| `/overlay/h2h` | Head-to-head driver comparison |
| `/overlay/trace` | Full-lap telemetry graph (throttle/brake/speed/steer by track distance) |
| `/live` | Spectator page — pick a driver, see live telemetry graph, stats, laps, events |

---

*Last updated: April 2026 — BPR Race Control Team*
