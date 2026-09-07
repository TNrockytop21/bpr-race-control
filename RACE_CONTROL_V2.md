# Race Control v2 — steward desk on the admin's own sim

Stewards (Jason, Mike) and the broadcasters are all admins in the iRacing
session. Nothing runs on driver PCs any more. One steward PC (or both —
the server picks whichever feed is live) runs the steward app, which
streams the whole field out of its own iRacing instance. The server turns
that into incidents, the stewards work them in the app, decisions go to
the broadcast overlay the moment they're issued, and the ledger is
available to the website afterwards.

```
Steward PC (admin in session)                Droplet                      Broadcaster
 iRacing ──shared memory──▶ irsdk-bridge.exe feed ──▶ Electron ──rc:field──▶ server ──event──▶ OBS overlay /overlay/racecontrol
                                                    ▲  rc:claim/decide…       │ rc:incident / rc:fieldState
                                                    └────────── steward app ◀─┘
 replay / camera / !black  ◀── irsdk-bridge.exe ◀── steward app (Jump, Follow, Issue penalty)
```

## What the sim gives us (why no driver plugin is needed)
`irsdk-bridge.exe feed` reads iRacing's shared memory and prints JSON lines:

- `session` — whenever the session-info string changes (about once a second
  in a race). `drivers[]` carries **CurDriverIncidentCount / TeamIncidentCount
  for every car**. That is the incident source.
- `frame` — 4×/s: SessionNum/Time, every car's lap, LapDistPct, position,
  class position, pit road, track surface and **CarIdxSessionFlags** (black
  flag, DQ, repair…), plus this PC's camera and replay state.

The server (`apps/server/src/race-control.js`):
- +N incident points on a car = an incident (1x off-track, 2x loss of
  control, 4x contact). Two cars gaining 2x+ within 2.5 s and 2 % of track
  are **merged into one contact incident**. Cars within 1.5 % at that moment
  are attached as `nearby` (one click adds them).
- Black flag appearing then clearing on a car = **penalty served**; it is
  linked to the newest published drive-through / stop-go for that car.
- Everything is stored in `data/racecontrol.db` keyed by iRacing
  `SubSessionID`, and re-loaded if the server restarts mid-race.

## Steward workflow (steward app → “⚑ Race Control” layout, now the default)
| Column | What |
|---|---|
| Field | every car, live: position, #, driver, class, incident points, PIT / BLK / DQ. Click = camera on that car. `+` = open a manual incident. |
| Incidents | the queue. Category, cars, who has it (MINE / name), status. Tabs Open / Decided / Dismissed / All; “show 1x” toggles off-tracks (hidden by default). Double-click = jump. |
| Decision | the selected incident: involved cars (+ nearby to add), **Jump −8 s** with camera group, **Claim / Take over / Hand back**, **Announce “under investigation”** (goes to the overlay), decision + reason + notes, **Issue & publish**. |
| Views | **Share** my replay time + car + camera; **Follow** what the other steward shared. Served flags and errors show here. |

Statuses: `new → investigating (claimed) → decided → published`, or
`dismissed`. Decision types: racing incident, no further action, incident
noted, warning, penalty (drive-through, stop & go, time +s, EOL next race,
grid drop, licence points, DSQ). A decision **publishes automatically**;
“under investigation” only when announced. With *apply in sim* on,
drive-through / stop & go send `!black #car` and DSQ sends `!dq #car`
through the sim chat on the deciding steward's PC (`clear in sim` undoes).

Only the claiming steward can decide. The other steward sees the claim
instantly and can Take over (confirmation) if needed.

## Remote desk (one steward away from their sim)
The droplet is the hub, so only ONE steward has to be in the session. The
other runs the same app anywhere (Mac build, or the Windows app on a PC
without iRacing) and sees the identical queue, field and decisions live.
What differs on a remote desk:
- Replay / camera buttons are greyed out (no sim on that computer).
- "Apply in sim" still works: the command (`!black #car`, `!dq`, `!clear`)
  is relayed through the server to the PC whose feed is live, typed into
  its sim chat there, and the result comes back ("✓ !black #913 applied ·
  Mike"). The in-session PC can switch this off in Views ("type penalties
  sent by the remote steward into my sim").
- Share view works one way: the in-session steward can share, the remote
  desk can't follow (nothing to follow with).
Week A: Mike in the session on Windows, Jason remote on the Mac. Week B:
the reverse. Nothing to configure — whichever app has iRacing running
becomes the feed.

### Mac build
`cd apps/steward && npm install && npm run build && npx electron-builder --mac --dir -c.directories.output=release/mac`
→ `release/mac/mac-arm64/BPR Race Control.app`. Log in with your steward
username/password (same accounts as Windows). Unsigned local build: if
macOS complains, right-click → Open once.

### Updating the droplet (needed before the first remote race)
On the droplet as root: `bash <(curl -fsSL https://raw.githubusercontent.com/TNrockytop21/bpr-race-control/main/deploy-update.sh)`
(pulls main, `npm install`, rebuilds the broadcast site, restarts pm2,
prints `/health` and `/api/rc/state`). Steward accounts and the ledger in
`data/` are kept.

## Broadcast
- OBS browser source: `https://racecontrol.bitepointracing.com/overlay/racecontrol`
  (`?max=3&hold=12`). Lower-third stack: UNDER INVESTIGATION / PENALTY /
  RACING INCIDENT / NO FURTHER ACTION / INCIDENT NOTED / WARNING / PENALTY
  SERVED, each with car number, driver, tier and reason. Nothing to push
  into their sim: the overlay *is* the message, same mechanism iRaceControl uses.
- `/overlay/ticker` (existing event feed) also shows the new decision tags.
- Jump list for the broadcaster's own replay: run the steward app on the
  broadcast PC with a SUPPORT login — the queue's Jump works there too.

## Website hand-off
`GET https://racecontrol.bitepointracing.com/api/rc/incidents?session=<SubSessionID>`
returns the full ledger (cars, category, lap, session time, decision, who,
when, served). `GET /api/rc/sessions` lists sessions. `GET /api/rc/state`
is the live snapshot. The website's Xtreme reconcile + recap “aired at”
tie-in reads this.

## Protocol additions (`apps/server/src/protocol.js`)
Steward → server: `rc:field` (feed line), `rc:claim {incidentId, force}`,
`rc:release`, `rc:update {patch:{notes, cars[], status}}`, `rc:decide
{decision}`, `rc:publish {what}`, `rc:create {cars, sessionTime, notes}`,
`rc:dismiss`, `rc:shareView {view}`.
Server → steward: `rc:snapshot`, `rc:incident`, `rc:fieldState` (≤2/s),
`rc:session`, `rc:source`, `rc:viewShared`, `rc:penaltyServed`, `rc:error`.
Server → viewers: `event` types `under_investigation`, `penalty_issued`,
`racing_incident`, `no_further_action`, `incident_noted`,
`warning_issued`, `penalty_served`.

## Bridge changes (`apps/steward/electron/`) — READ BEFORE FIRST RACE
`irsdk-bridge.cs` + new `irsdk-bridge-feed.cs`; build with
`build-bridge.bat` (uses the csc.exe that ships with Windows).

1. **Broadcast message ids were off by one** against `irsdk_defines.h`
   (0 is CamSwitchPos, 1 CamSwitchNum, 3 ReplaySetPlaySpeed, 4
   ReplaySetPlayPosition, 5 ReplaySearch, 6 ReplaySetState; 8 ChatCommand
   was right). Replay/camera commands are now sent with the correct ids.
2. `camera <carNumber> <group>` switches **by car number** (the SDK has no
   switch-by-carIdx); leading zeros are honoured (“001”). `pos:N` switches
   by race position. Group may be a name or the `GroupNum` from the
   session's CameraInfo (the app resolves names per PC).
3. `replay-time <sessionNum> <sessionTime>` seeks exactly within a session
   (ReplaySearchSessionTime, full 32-bit). `replay-jump` still exists but
   its frame maths overflowed after ~18 minutes and assumes the replay
   starts at t=0 — the app prefers `replay-time`.
4. `feed [hz]` — the long-running reader described above.

## First-run checklist (Windows, in a test session as admin)
1. `cd apps\steward\electron && build-bridge.bat` → `irsdk-bridge.exe status` says connected.
2. `irsdk-bridge.exe feed` prints a `session` line with your name in
   `drivers[]` and `frame` lines with `cars`. Ctrl-C.
3. Start the server (or point at the droplet), start the steward app, log
   in. Field column fills; “iRacing linked” shows in Views.
4. Drive over a kerb (1x) with “show 1x” on → an off-track incident
   appears within ~1 s. Tap a wall → contact incident.
5. Select it → Jump. The replay should seek ~8 s before and the camera
   should land on your car. If the camera lands on the wrong car the
   group/number mapping needs checking (`irsdk-bridge.exe camera 913 TV1`).
6. Claim → decide Drive-through with *apply in sim* → chat shows `!black #<num>`;
   serve it → “served ✓” appears on the incident and the overlay shows PENALTY SERVED.
7. Open `/overlay/racecontrol` in a browser while doing 6.

## Local dev without iRacing
```
PORT=8091 node apps/server/src/main.js
node apps/server/tools/field-sim.js --url ws://localhost:8091/ws/steward --speed 4
cd apps/steward && npm run dev        # log in (or the legacy hello path), pick ⚑ Race Control
```
The simulator plays a 28-car race with a scripted contact, off-track, loss
of control, and a black flag that gets served.
