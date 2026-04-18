const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle } = require('docx');
const fs = require('fs');

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: "333333" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "C8102E" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "222222" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [

      // ── TITLE ──────────────────────────────────────────
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: "BPR Race Control", size: 44, bold: true, color: "C8102E", font: "Arial" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({ text: "A New Tool for Our League \u2014 Looking for Testers", size: 24, color: "666666" })],
      }),

      // ── DIVIDER ──
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C8102E", space: 1 } },
        spacing: { after: 300 },
        children: [],
      }),

      // ── INTRO ──────────────────────────────────────────
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: "Hey everyone," })],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("We\u2019ve been working on something behind the scenes that we\u2019re finally ready to share with the community. It\u2019s called "),
          new TextRun({ text: "BPR Race Control", bold: true }),
          new TextRun(" \u2014 a live race control and stewarding tool built specifically for our league races."),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("Before we go any further: "),
          new TextRun({ text: "this is completely optional.", bold: true }),
          new TextRun(" Nobody is required to install or use anything. We\u2019re putting this out there because we think it\u2019ll make race nights better for everyone, but we want your feedback first. If you\u2019re interested in helping us test it and shape how it works, read on."),
        ],
      }),

      // ── WHAT IS IT ─────────────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What Is It?")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("BPR Race Control is a system that lets our stewards monitor races in real time, review incidents with actual telemetry data, and issue decisions that show up on your screen during the race. Think of it like what real-world motorsport race control does \u2014 but adapted for iRacing league racing."),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("On your end, it\u2019s a small SimHub plugin. If you already run SimHub (most of you do), it\u2019s just one file dropped into your SimHub folder. That\u2019s it.")],
      }),

      // ── WHAT IT DOES FOR DRIVERS ───────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What It Does For You As a Driver")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Live Penalty Notifications")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("If a steward makes a decision about an incident you\u2019re involved in, you\u2019ll see it pop up on your screen as a transparent banner over iRacing. No more waiting until after the race to find out what happened. You\u2019ll see things like:")],
      }),
      ...["DRIVE-THROUGH PENALTY", "STOP & GO PENALTY", "TIME PENALTY \u2014 10s", "WARNING", "RACE INCIDENT (no penalty)", "NO ACTION (you\u2019re clear)", "DISQUALIFIED"].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 60 },
          children: [new TextRun({ text: t, bold: true })],
        })
      ),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Each notification includes steward notes explaining the decision. They fade out after 8 seconds, or you can click to dismiss them.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Under Investigation Alerts")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("If the stewards are looking at an incident you\u2019re involved in, you\u2019ll get an amber \u201CINCIDENT UNDER INVESTIGATION\u201D banner. Just like real motorsport \u2014 you know it\u2019s being looked at.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Race Control Messages")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Stewards can broadcast messages to all drivers during the race. Yellow flag warnings, track limit reminders, or custom messages. They show up as banners on your screen with color coding \u2014 amber for cautions, red for serious, green for all-clear.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Report Incident Button")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("See something happen on track? You can report it instantly without leaving iRacing. Three ways to do it:")],
      }),
      ...["Press a keyboard shortcut (default F1, you can change it)", "Press a button on your wheel or button box (bindable in the plugin settings)", "Click the Report Incident button in SimHub\u2019s plugin panel"].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 60 },
          children: [new TextRun(t)],
        })
      ),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("The stewards get the exact timestamp of when you pressed it, so they can pull up the replay and telemetry at that exact moment. There\u2019s a 10-second cooldown to prevent accidental spam.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Notification Controls")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Don\u2019t want to see certain types of notifications? You can toggle each one individually in the plugin settings:")],
      }),
      ...["Penalty decisions \u2014 on/off", "Race control messages \u2014 on/off", "Under investigation notices \u2014 on/off"].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 60 },
          children: [new TextRun(t)],
        })
      ),

      // ── SAFETY ─────────────────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Is It Safe?")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("We know people are careful about what they install on their racing PCs. Here\u2019s exactly what this does and doesn\u2019t do:")],
      }),
      ...["It\u2019s a SimHub plugin \u2014 it runs inside SimHub, which you already trust on your system. It doesn\u2019t install anything else, doesn\u2019t modify any files, and doesn\u2019t touch iRacing in any way.",
        "All it does is read telemetry data that SimHub already has access to (speed, throttle, brake, lap times, etc.) and send it to our server over an encrypted connection (wss://racecontrol.bitepointracing.com).",
        "It does NOT read your personal information, iRacing credentials, file system, or anything outside of normal telemetry data.",
        "It\u2019s open source \u2014 you can look at every line of code yourself at github.com/TNrockytop21/bpr-race-control.",
        "It auto-updates through GitHub releases. When we push an update, you\u2019ll see a green banner in the plugin settings. One click to install \u2014 or you can ignore it."
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 100 },
          children: [new TextRun(t)],
        })
      ),

      // ── WHY TEST ───────────────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Why We Need Testers")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("We\u2019ve been building and testing this internally, but we need real-world feedback from people actually racing with it. Things we\u2019re looking for:")],
      }),
      ...["Does it affect your FPS or performance at all?",
        "Are the notifications readable and positioned well?",
        "Does the auto-connect work reliably when you start iRacing?",
        "Is the Report Incident button useful, or does it feel like it\u2019s in the way?",
        "Any bugs, crashes, or weirdness?"
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 60 },
          children: [new TextRun(t)],
        })
      ),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Your input will directly shape how this works going forward. If something is annoying or doesn\u2019t work right, we want to hear about it before we roll it out more broadly.")],
      }),

      // ── DIVIDER ──
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C8102E", space: 1 } },
        spacing: { after: 300, before: 200 },
        children: [],
      }),

      // ── SETUP INSTRUCTIONS ─────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("How to Install (5 Minutes)")] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Option A \u2014 Installer (Easiest)")] }),
      ...[
        "Download the installer from the latest release: github.com/TNrockytop21/bpr-race-control/releases",
        "Run BPR-RaceControl-SimHub-Plugin-Setup.exe",
        "It will automatically find your SimHub folder and copy the plugin",
        "Restart SimHub",
        "When SimHub asks to enable \u201CBPR Race Control,\u201D click Yes"
      ].map((t, i) =>
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          spacing: { after: 60 },
          children: [new TextRun(t)],
        })
      ),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Option B \u2014 Manual Install")] }),
      ...[
        "Download BPRRaceControl.dll and bpr-logo.png from the latest release",
        "Copy both files to your SimHub folder (usually C:\\Program Files (x86)\\SimHub\\)",
        "Restart SimHub",
        "Enable the plugin when prompted"
      ].map((t, i) =>
        new Paragraph({
          numbering: { reference: "numbers", level: 0 },
          spacing: { after: 60 },
          children: [new TextRun(t)],
        })
      ),

      // ── SETTINGS WALKTHROUGH ───────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Settings Walkthrough")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Once installed, click \u201CBPR Race Control\u201D in SimHub\u2019s left sidebar. Here\u2019s what each section does:")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Connection")] }),
      ...["The server URL should already be set to wss://racecontrol.bitepointracing.com/ws/agent. Don\u2019t change this unless told to.",
        "Auto-connect is checked by default \u2014 the plugin will connect automatically when you start iRacing. You can uncheck this if you want to connect manually.",
        "The Connect/Disconnect button lets you manually control the connection.",
        "The green dot means you\u2019re connected. Red means disconnected."
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
          children: [new TextRun(t)],
        })
      ),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Incident Reporting")] }),
      ...["Report Incident button \u2014 Click this to flag something to the stewards. Same as pressing your hotkey or wheel button.",
        "Keyboard Shortcut \u2014 Set your preferred key. Default is F1. You can use combos like Ctrl+F5 or Shift+F2. This works globally \u2014 even when iRacing has focus.",
        "Wheel / Button Box \u2014 Click BIND, then press any button on your wheel or button box. It\u2019ll show which button was detected. This is polled at 60Hz so it\u2019s responsive."
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
          children: [new TextRun(t)],
        })
      ),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Notifications")] }),
      ...["Three toggles let you control what shows up on your screen during a race.",
        "All three are on by default. If you find any of them distracting, turn them off \u2014 the data still goes to the stewards regardless.",
        "The SimHub Properties section at the bottom shows property names you can use if you want to build your own custom Dash Studio overlay."
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
          children: [new TextRun(t)],
        })
      ),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Check for Updates")] }),
      ...["The button in the header bar checks GitHub for a newer version of the plugin.",
        "If an update is available, a green banner appears. Click Install Update and SimHub will close, swap the file, and restart automatically. Takes about 5 seconds.",
        "Updates happen silently \u2014 no command prompt windows."
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 80 },
          children: [new TextRun(t)],
        })
      ),

      // ── WHAT DATA ──────────────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What Data Does It Send?")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Transparency matters. Here is exactly what the plugin sends to our server, and nothing else:")],
      }),
      ...["Your iRacing driver name (auto-detected, not manually entered)",
        "Car and track info",
        "Telemetry: throttle, brake, steering, speed, RPM, gear, fuel level, lap times",
        "Your race position and lap number",
        "Session time (iRacing\u2019s clock \u2014 used for syncing replay and incident timestamps)",
        "Your iRacing incident count (so stewards know when you pick up incident points)"
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 60 },
          children: [new TextRun(t)],
        })
      ),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("That\u2019s it. No personal data, no passwords, no files from your computer. Just racing telemetry.")],
      }),

      // ── IMPORTANT NOTES ────────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Important Notes")] }),
      ...[
        "This is optional. Nobody has to install this. We\u2019re asking for volunteers who want to help us test.",
        "It will not affect your iRacing performance. The plugin runs inside SimHub and sends small data packets over your internet connection. If you can run SimHub, you can run this.",
        "Your telemetry data is only used for race control purposes during events. We\u2019re not collecting it for anything else.",
        "All connections are encrypted (HTTPS/WSS through Cloudflare).",
        "If you have any issues, reach out in the #tech-support channel and we\u2019ll sort it out."
      ].map(t =>
        new Paragraph({
          numbering: { reference: "bullets", level: 0 },
          spacing: { after: 100 },
          children: [new TextRun(t)],
        })
      ),

      // ── WHAT'S COMING NEXT ─────────────────────────────
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("What\u2019s Coming Next")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("We\u2019re actively developing new features based on what the community needs. Here\u2019s what\u2019s on the roadmap:")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Customizable In-Sim HUD")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("A native SimHub Dash Studio overlay that gives you race control info right inside iRacing \u2014 position, gap, incident count, penalty status, session timer. Fully customizable. Move panels around, resize them, show or hide whatever you want. Your overlay, your way.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("VR Support")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("VR drivers can\u2019t see monitor overlays, so we\u2019re building audio and text-to-speech notifications. When a penalty is issued, you\u2019ll hear it spoken to you through your headset. Different tones for different severity levels. Plus SimHub\u2019s built-in VR overlay support means the HUD panels will float in your virtual cockpit.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Post-Race Reports")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Already built. Export a professional PDF report from the Driver Summary tab \u2014 BPR-branded header, stat cards, full driver summary table, incident log, and penalty decision cards. One click to download.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Season Standings & Championship Points")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Integrated championship tracking across the season. Points automatically calculated based on finishing positions with penalties applied. Running standings available on the broadcast dashboard for commentators.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Team Endurance Support")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("For special events and endurance races with driver swaps. The system will track who\u2019s in the car at any given time using iRacing\u2019s team session data. Incidents and penalties follow the driver, not just the car number.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Live Broadcast Integration")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Already live. The broadcast dashboard includes battle detection, fastest lap alerts, and real-time incident feeds. We\u2019ve added 12 OBS overlay pages with transparent backgrounds \u2014 gap charts, position trackers, stint analysis, sector comparisons, timing towers, telemetry HUDs, and full-lap telemetry graphs. Just add them as OBS Browser Sources and they update live.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Spectator Live Page")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Already built. A public page at racecontrol.bitepointracing.com/live where anyone can pick a driver and watch their live telemetry graph \u2014 throttle, brake, speed, and steering traced across the full lap by track distance. Plus live stats, sector times, lap history, and events. Share the link with fans who want to follow a specific driver.")],
      }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Individual Steward Accounts")] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("Login system with individual accounts for stewards. Full audit trail of who issued which decisions. Role-based access so only authorized stewards can issue penalties.")],
      }),

      // ── CLOSING ────────────────────────────────────────
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C8102E", space: 1 } },
        spacing: { after: 300, before: 200 },
        children: [],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun("If you\u2019re interested in testing, grab the plugin from the link above and join us for the next race night. We\u2019ll have it active and ready to go. Drop any questions in the thread below.")],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun("Download: "),
          new TextRun({ text: "github.com/TNrockytop21/bpr-race-control/releases", bold: true, color: "2563EB" }),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: "\u2014 BPR Race Control Team", italics: true, color: "888888" })],
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = 'C:/Users/avala/OneDrive/Attachments/Documents/bprwebsite/Telemetry App/announcement/BPR-Race-Control-Announcement.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('Created: ' + outPath);
});
