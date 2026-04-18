import { useCallback } from 'react';
import { jsPDF } from 'jspdf';

const styles = {
  container: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    padding: '12px',
    flexShrink: 0,
  },
  label: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  row: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  btn: {
    padding: '6px 14px',
    borderRadius: '3px',
    border: '1px solid #2a2a2a',
    background: '#1a1a1a',
    color: '#ccc',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnPdf: {
    padding: '6px 14px',
    borderRadius: '3px',
    border: '1px solid rgba(200,16,46,0.4)',
    background: 'rgba(200,16,46,0.12)',
    color: '#c8102e',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

function formatTime(t) {
  if (t == null) return '--:--';
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

// ── CSV / JSON (existing) ────────────────────────────────────

function generateCSV(sessionInfo, drivers, incidents, penalties) {
  const lines = [];
  lines.push('BPR Race Control — Post-Race Report');
  lines.push(`Track: ${sessionInfo?.trackName || 'Unknown'}`);
  lines.push(`Date: ${formatDate(Date.now())}`);
  lines.push('');

  lines.push('INCIDENTS');
  lines.push('Time,Type,Drivers,Status,Notes');
  for (const inc of incidents) {
    const driverNames = (inc.involvedDrivers || [])
      .map((id) => drivers[id]?.name || id).join(' / ');
    const type = inc.incidentType || (inc.detectedBy === 'auto' ? 'auto' : 'manual');
    lines.push(`${formatTime(inc.sessionTime)},${type},"${driverNames}",${inc.status},"${inc.notes || ''}"`);
  }
  lines.push('');

  lines.push('PENALTIES');
  lines.push('Driver,Penalty,Time (s),Notes');
  for (const inc of incidents) {
    if (!inc.penalty) continue;
    const driverNames = (inc.involvedDrivers || [])
      .map((id) => drivers[id]?.name || id).join(' / ');
    const p = inc.penalty;
    lines.push(`"${driverNames}",${p.type},${p.timeSeconds || ''},${p.notes || ''}`);
  }
  lines.push('');

  lines.push('DRIVER SUMMARY');
  lines.push('Driver,Laps,Off-Track,Blue Flags,Total Inc Points,Penalties');
  for (const driver of Object.values(drivers)) {
    const driverIncs = incidents.filter((i) => i.involvedDrivers?.includes(driver.id));
    const offTrack = driverIncs.filter((i) => i.incidentType === 'off-track' || i.delta === 1).length;
    const blueFlag = driverIncs.filter((i) => i.incidentType === 'blue-flag').length;
    const incPts = driverIncs.reduce((s, i) => s + (i.delta || 0), 0);
    const penCount = driverIncs.filter((i) => i.penalty && i.penalty.type !== 'no-action' && i.penalty.type !== 'race-incident').length;
    lines.push(`"${driver.name}",${driver.lapCount || 0},${offTrack},${blueFlag},${incPts},${penCount}`);
  }
  return lines.join('\n');
}

function generateJSON(sessionInfo, drivers, incidents) {
  return JSON.stringify({
    report: 'BPR Race Control — Post-Race Report',
    track: sessionInfo?.trackName || 'Unknown',
    exportedAt: new Date().toISOString(),
    incidents: incidents.map((inc) => ({
      sessionTime: inc.sessionTime,
      type: inc.incidentType || 'manual',
      drivers: (inc.involvedDrivers || []).map((id) => drivers[id]?.name || id),
      status: inc.status,
      notes: inc.notes,
      penalty: inc.penalty || null,
    })),
    drivers: Object.values(drivers).map((d) => ({
      name: d.name, car: d.car, lapCount: d.lapCount || 0,
    })),
  }, null, 2);
}

// ── PDF Report ───────────────────────────────────────────────

function generatePDF(sessionInfo, drivers, incidents) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = 215.9; // letter width mm
  const margin = 18;
  const contentW = W - margin * 2;
  let y = margin;

  const RED = [200, 16, 46];
  const DARK = [30, 30, 30];
  const GRAY = [120, 120, 120];
  const LIGHT = [200, 200, 200];
  const WHITE = [255, 255, 255];

  // ── Helper functions ──

  function addPage() {
    doc.addPage();
    y = margin;
  }

  function checkSpace(needed) {
    if (y + needed > 260) addPage();
  }

  function drawLine(x1, yPos, x2, color, width) {
    doc.setDrawColor(...color);
    doc.setLineWidth(width || 0.3);
    doc.line(x1, yPos, x2, yPos);
  }

  function text(str, x, yPos, opts) {
    const size = opts?.size || 10;
    const color = opts?.color || DARK;
    const style = opts?.bold ? 'bold' : 'normal';
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont('helvetica', style);
    doc.text(str || '', x, yPos, opts?.align ? { align: opts.align } : undefined);
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 1: RACE SUMMARY
  // ═══════════════════════════════════════════════════════════

  // Red header bar
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 28, 'F');

  text('BPR RACE CONTROL', margin, 12, { size: 18, bold: true, color: WHITE });
  text('POST-RACE REPORT', margin, 19, { size: 10, color: [255, 200, 200] });

  y = 36;

  // Track + date
  text(sessionInfo?.trackName || 'Unknown Track', margin, y, { size: 14, bold: true });
  y += 6;
  text(formatDate(Date.now()), margin, y, { size: 9, color: GRAY });
  y += 10;

  drawLine(margin, y, W - margin, RED, 0.5);
  y += 8;

  // Quick stats
  const driverList = Object.values(drivers);
  const totalDrivers = driverList.length;
  const totalIncidents = incidents.length;
  const totalPenalties = incidents.filter((i) => i.penalty && i.penalty.type !== 'no-action' && i.penalty.type !== 'race-incident').length;
  const resolved = incidents.filter((i) => i.status === 'resolved').length;

  const stats = [
    { label: 'Drivers', value: String(totalDrivers) },
    { label: 'Incidents', value: String(totalIncidents) },
    { label: 'Penalties', value: String(totalPenalties) },
    { label: 'Resolved', value: String(resolved) },
  ];

  const statW = contentW / stats.length;
  stats.forEach((s, i) => {
    const sx = margin + i * statW;
    doc.setFillColor(245, 245, 248);
    doc.roundedRect(sx, y, statW - 4, 18, 2, 2, 'F');
    text(s.value, sx + (statW - 4) / 2, y + 8, { size: 16, bold: true, align: 'center' });
    text(s.label, sx + (statW - 4) / 2, y + 14, { size: 7, color: GRAY, align: 'center' });
  });
  y += 26;

  // ── Driver Summary Table ──
  text('DRIVER SUMMARY', margin, y, { size: 11, bold: true, color: RED });
  y += 6;

  // Table header
  const cols = [
    { label: 'Driver', x: margin, w: 55 },
    { label: 'Laps', x: margin + 55, w: 18 },
    { label: 'Off-Track', x: margin + 73, w: 22 },
    { label: 'Blue Flag', x: margin + 95, w: 22 },
    { label: 'Inc Pts', x: margin + 117, w: 20 },
    { label: 'Penalties', x: margin + 137, w: 22 },
  ];

  doc.setFillColor(240, 240, 243);
  doc.rect(margin, y, contentW, 6, 'F');
  cols.forEach((c) => {
    text(c.label, c.x + 1, y + 4, { size: 7, bold: true, color: GRAY });
  });
  y += 7;

  // Table rows
  for (const driver of driverList) {
    checkSpace(6);
    const driverIncs = incidents.filter((i) => i.involvedDrivers?.includes(driver.id));
    const offTrack = driverIncs.filter((i) => i.incidentType === 'off-track' || i.delta === 1).length;
    const blueFlag = driverIncs.filter((i) => i.incidentType === 'blue-flag').length;
    const incPts = driverIncs.reduce((s, i) => s + (i.delta || 0), 0);
    const penCount = driverIncs.filter((i) => i.penalty && i.penalty.type !== 'no-action' && i.penalty.type !== 'race-incident').length;

    if (Math.floor((y - 70) / 5) % 2 === 0) {
      doc.setFillColor(250, 250, 252);
      doc.rect(margin, y - 3.5, contentW, 5, 'F');
    }

    text(driver.name || 'Unknown', cols[0].x + 1, y, { size: 8 });
    text(String(driver.lapCount || 0), cols[1].x + 1, y, { size: 8 });
    text(String(offTrack), cols[2].x + 1, y, { size: 8, color: offTrack > 0 ? [245, 158, 11] : GRAY });
    text(String(blueFlag), cols[3].x + 1, y, { size: 8, color: blueFlag > 0 ? [96, 165, 250] : GRAY });
    text(String(incPts), cols[4].x + 1, y, { size: 8, color: incPts > 4 ? RED : incPts > 0 ? [245, 158, 11] : GRAY });
    text(String(penCount), cols[5].x + 1, y, { size: 8, color: penCount > 0 ? RED : GRAY });
    y += 5;
  }

  y += 6;
  drawLine(margin, y, W - margin, [220, 220, 220], 0.2);

  // ═══════════════════════════════════════════════════════════
  // PAGE 2: INCIDENT LOG
  // ═══════════════════════════════════════════════════════════
  addPage();

  text('INCIDENT LOG', margin, y, { size: 11, bold: true, color: RED });
  y += 6;

  // Header
  doc.setFillColor(240, 240, 243);
  doc.rect(margin, y, contentW, 6, 'F');
  text('Time', margin + 1, y + 4, { size: 7, bold: true, color: GRAY });
  text('Type', margin + 22, y + 4, { size: 7, bold: true, color: GRAY });
  text('Drivers', margin + 48, y + 4, { size: 7, bold: true, color: GRAY });
  text('Status', margin + 110, y + 4, { size: 7, bold: true, color: GRAY });
  text('Decision', margin + 135, y + 4, { size: 7, bold: true, color: GRAY });
  y += 7;

  for (const inc of incidents) {
    checkSpace(6);
    const driverNames = (inc.involvedDrivers || [])
      .map((id) => drivers[id]?.name || id).join(', ');
    const type = inc.incidentType || 'manual';
    const typeColors = {
      'off-track': GRAY,
      'blue-flag': [96, 165, 250],
      'protest': [245, 158, 11],
      'manual': [167, 139, 250],
    };

    text(formatTime(inc.sessionTime), margin + 1, y, { size: 8 });
    text(type.replace('-', ' '), margin + 22, y, { size: 7, bold: true, color: typeColors[type] || GRAY });
    text(driverNames.substring(0, 40), margin + 48, y, { size: 8 });
    text(inc.status?.replace('_', ' ') || '', margin + 110, y, { size: 7,
      color: inc.status === 'resolved' ? [34, 197, 94] : inc.status === 'under_review' ? [96, 165, 250] : [245, 158, 11] });

    if (inc.penalty) {
      text(inc.penalty.type?.replace('-', ' ') || '', margin + 135, y, { size: 7,
        color: ['drive-through', 'stop-go', 'dsq'].includes(inc.penalty.type) ? RED : GRAY });
    }
    y += 5;
  }

  if (incidents.length === 0) {
    text('No incidents recorded', margin + 1, y, { size: 9, color: GRAY });
    y += 8;
  }

  // ═══════════════════════════════════════════════════════════
  // PENALTY DECISIONS (same page or new)
  // ═══════════════════════════════════════════════════════════
  const penaltyIncidents = incidents.filter((i) => i.penalty && i.penalty.type !== 'no-action' && i.penalty.type !== 'race-incident');

  if (penaltyIncidents.length > 0) {
    checkSpace(30);
    y += 8;
    drawLine(margin, y, W - margin, RED, 0.5);
    y += 8;

    text('PENALTY DECISIONS', margin, y, { size: 11, bold: true, color: RED });
    y += 8;

    for (const inc of penaltyIncidents) {
      checkSpace(20);
      const driverNames = (inc.involvedDrivers || [])
        .map((id) => drivers[id]?.name || id).join(', ');
      const p = inc.penalty;
      const pLabel = p.type?.replace(/-/g, ' ').toUpperCase() || '';

      // Penalty card
      doc.setFillColor(248, 248, 250);
      doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');

      // Red left bar
      doc.setFillColor(...RED);
      doc.rect(margin, y, 2, 14, 'F');

      text(pLabel, margin + 6, y + 5, { size: 9, bold: true, color: RED });
      text(driverNames, margin + 60, y + 5, { size: 9, bold: true });
      text('@ ' + formatTime(inc.sessionTime), margin + 60, y + 10, { size: 7, color: GRAY });

      if (p.timeSeconds) {
        text(p.timeSeconds + 's', margin + contentW - 20, y + 5, { size: 9, bold: true, color: RED });
      }

      if (p.notes) {
        text(p.notes.substring(0, 80), margin + 6, y + 10, { size: 7, color: GRAY });
      }

      y += 18;
    }
  }

  // ── Footer ──
  y = 265;
  drawLine(margin, y, W - margin, [220, 220, 220], 0.2);
  y += 4;
  text('Generated by BPR Race Control — bitepointracing.com', W / 2, y, { size: 7, color: GRAY, align: 'center' });

  return doc;
}

// ── Download helper ──────────────────────────────────────────

function download(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ────────────────────────────────────────────────

export function ReportExport({ sessionInfo, drivers, incidents, penalties }) {
  const handleCSV = useCallback(() => {
    const csv = generateCSV(sessionInfo, drivers, incidents, penalties);
    const track = (sessionInfo?.trackName || 'race').replace(/\s+/g, '_');
    download(csv, `BPR_Report_${track}.csv`, 'text/csv');
  }, [sessionInfo, drivers, incidents, penalties]);

  const handleJSON = useCallback(() => {
    const json = generateJSON(sessionInfo, drivers, incidents);
    const track = (sessionInfo?.trackName || 'race').replace(/\s+/g, '_');
    download(json, `BPR_Report_${track}.json`, 'application/json');
  }, [sessionInfo, drivers, incidents]);

  const handlePDF = useCallback(() => {
    const doc = generatePDF(sessionInfo, drivers, incidents);
    const track = (sessionInfo?.trackName || 'race').replace(/\s+/g, '_');
    doc.save(`BPR_Report_${track}.pdf`);
  }, [sessionInfo, drivers, incidents]);

  return (
    <div style={styles.container}>
      <div style={styles.label}>Post-Race Report</div>
      <div style={styles.row}>
        <button style={styles.btnPdf} onClick={handlePDF}>Export PDF</button>
        <button style={styles.btn} onClick={handleCSV}>CSV</button>
        <button style={styles.btn} onClick={handleJSON}>JSON</button>
      </div>
    </div>
  );
}
