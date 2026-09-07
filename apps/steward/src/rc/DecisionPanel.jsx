/** One incident: who, where, jump to it, claim it, decide it, publish it. */
import { useEffect, useState } from 'react';
import { DECISION_TYPES, PENALTY_TIERS, REASONS, CATEGORY_LABEL, fmtSessionTime } from './useRaceControl';

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, overflow: 'auto', flex: 1, minHeight: 0 },
  head: { display: 'flex', alignItems: 'baseline', gap: 8 },
  title: { color: '#eee', fontSize: 14, fontWeight: 800, letterSpacing: '0.3px' },
  sub: { color: '#777', fontSize: 10 },
  label: { fontSize: 9, color: '#777', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  chip: (on, color = '#a78bfa') => ({ border: `1px solid ${on ? color : '#2a2a2a'}`, background: on ? `${color}22` : 'transparent', color: on ? color : '#888', borderRadius: 3, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }),
  btn: (bg, fg = '#fff', extra = {}) => ({ background: bg, color: fg, border: 'none', borderRadius: 4, padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', ...extra }),
  row: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '5px 8px', background: '#111', border: '1px solid #2a2a2a', borderRadius: 3, color: '#ccc', fontSize: 11, outline: 'none' },
  notes: { width: '100%', minHeight: 44, padding: 6, background: '#111', border: '1px solid #2a2a2a', borderRadius: 3, color: '#ccc', fontSize: 11, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  card: { background: '#0d0d0f', border: '1px solid #1a1a1a', borderRadius: 4, padding: 10 },
  decision: { background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4, padding: 10, fontSize: 11, color: '#ccc' },
};

export function DecisionPanel({ rc }) {
  const inc = rc.selected;
  const [type, setType] = useState(null);
  const [tier, setTier] = useState(null);
  const [seconds, setSeconds] = useState('15');
  const [points, setPoints] = useState('1');
  const [carIdx, setCarIdx] = useState(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [preRoll, setPreRoll] = useState(rc.prefs.preRoll);
  const [camGroup, setCamGroup] = useState(rc.prefs.camGroup);

  useEffect(() => {
    setType(inc?.decision?.type || null); setTier(inc?.decision?.tier || null);
    setSeconds(String(inc?.decision?.seconds ?? 15)); setPoints(String(inc?.decision?.points ?? 1));
    setCarIdx(inc?.decision?.carIdx ?? inc?.cars?.[0]?.carIdx ?? null);
    setReason(inc?.decision?.reason || ''); setNotes(inc?.notes || '');
  }, [inc?.id]);

  if (!inc) {
    return <div style={{ ...S.wrap, color: '#444', fontSize: 11 }}>Select an incident. Double-click a row to jump straight to it.</div>;
  }
  const mine = inc.claimedBy?.id === rc.stewardId;
  const claimedByOther = inc.claimedBy && !mine;
  const canDecide = mine && inc.status !== 'dismissed';
  const decisionValid = type && (type !== 'penalty' || tier);
  const cameraGroups = rc.cameras.length ? rc.cameras.map((c) => c.GroupName) : ['TV1', 'TV2', 'TV3', 'Chase', 'Cockpit', 'Chopper'];

  const jump = (car) => rc.jumpTo(inc, { car, preRoll: Number(preRoll), camGroup });
  const savePrefs = () => rc.setPrefs({ preRoll: Number(preRoll) || 8, camGroup });
  const issue = () => {
    if (!decisionValid) return;
    rc.decide(inc.id, { type, tier: type === 'penalty' ? tier : null, seconds: Number(seconds) || 0, points: Number(points) || 0, carIdx, reason: reason || (type === 'penalty' ? 'Other' : ''), notes });
  };

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>{CATEGORY_LABEL[inc.category] || inc.category} · {fmtSessionTime(inc.sessionTime)} · L{inc.lap ?? '–'}</span>
        <span style={S.sub}>{inc.kind === 'auto' ? `auto · ${inc.cars.map((c) => `${c.delta}x`).join(' + ')}` : `manual by ${inc.createdBy?.name || '?'}`}</span>
      </div>

      {/* Cars */}
      <div style={S.card}>
        <div style={S.label}>Involved</div>
        <div style={S.chipRow}>
          {inc.cars.map((c) => (
            <span key={c.carIdx} style={{ ...S.chip(true, '#eee'), display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              #{c.number} {c.name} <span style={{ color: '#888' }}>{c.classShort}{c.delta ? ` · +${c.delta}x (${c.total})` : ''}</span>
              <button title="Camera on this car" style={S.btn('#222', '#ccc', { padding: '2px 6px' })} onClick={() => rc.cameraOn(c.number, camGroup)}>cam</button>
              {mine && inc.cars.length > 1 && <button title="Remove from incident" style={S.btn('transparent', '#666', { padding: '2px 4px' })} onClick={() => rc.update(inc.id, { cars: inc.cars.filter((x) => x.carIdx !== c.carIdx).map((x) => x.carIdx) })}>✕</button>}
            </span>
          ))}
        </div>
        {inc.nearby?.length > 0 && (
          <>
            <div style={{ ...S.label, marginTop: 8 }}>Nearby at the time (click to add)</div>
            <div style={S.chipRow}>
              {inc.nearby.map((n) => (
                <button key={n.carIdx} style={S.chip(false)} disabled={!mine} onClick={() => rc.update(inc.id, { cars: [...inc.cars.map((c) => c.carIdx), n.carIdx] })}>
                  #{n.number} {n.name.split(' ').slice(-1)[0]} <span style={{ color: '#666' }}>{n.gapPct != null ? `${(n.gapPct * 100).toFixed(1)}%` : ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Replay */}
      <div style={S.card}>
        <div style={S.label}>Replay</div>
        {!rc.hasSim && <div style={{ fontSize: 10, color: '#888', marginBottom: 6 }}>No iRacing on this computer — replay and camera run on {rc.source?.name ? `${rc.source.name}'s` : 'the in-session'} PC. You can still claim, classify and issue; penalties are applied there.</div>}
        <div style={{ ...S.row, opacity: rc.hasSim ? 1 : 0.4, pointerEvents: rc.hasSim ? 'auto' : 'none' }}>
          <button style={S.btn('#2563eb')} onClick={() => jump(inc.cars[0])}>▶ Jump −{preRoll}s</button>
          {inc.cars.slice(1).map((c) => <button key={c.carIdx} style={S.btn('#1d4ed8')} onClick={() => jump(c)}>▶ on #{c.number}</button>)}
          <span style={{ color: '#666', fontSize: 10 }}>pre-roll</span>
          <input style={{ ...S.input, width: 44 }} type="number" value={preRoll} onChange={(e) => setPreRoll(e.target.value)} onBlur={savePrefs} />
          <select style={S.input} value={camGroup} onChange={(e) => { setCamGroup(e.target.value); rc.setPrefs({ camGroup: e.target.value }); }}>
            {cameraGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <button style={S.btn('#222', '#ccc')} onClick={() => window.irsdk?.replaySearch?.('end')}>LIVE</button>
        </div>
      </div>

      {/* Ownership */}
      <div style={S.row}>
        {!inc.claimedBy && inc.status !== 'dismissed' && <button style={S.btn('#c8102e')} onClick={() => rc.claim(inc.id)}>Claim</button>}
        {claimedByOther && (
          <>
            <span style={{ fontSize: 11, color: '#f59e0b' }}>{inc.claimedBy.name} has this</span>
            <button style={S.btn('#333', '#f59e0b')} onClick={() => { if (confirm(`Take this incident from ${inc.claimedBy.name}?`)) rc.claim(inc.id, true); }}>Take over</button>
          </>
        )}
        {mine && <button style={S.btn('#222', '#ccc')} onClick={() => rc.release(inc.id)}>Hand back</button>}
        {mine && !inc.investigationPublishedAt && <button style={S.btn('#f59e0b', '#111')} onClick={() => rc.announce(inc.id)}>Announce “under investigation”</button>}
        {inc.investigationPublishedAt && <span style={{ fontSize: 10, color: '#f59e0b' }}>investigation on air</span>}
        <span style={{ flex: 1 }} />
        {inc.status !== 'dismissed' && !inc.decision && <button style={S.btn('transparent', '#666', { border: '1px solid #2a2a2a' })} onClick={() => rc.dismiss(inc.id)}>Dismiss</button>}
      </div>

      {/* Existing decision */}
      {inc.decision && (
        <div style={S.decision}>
          <b style={{ color: '#22c55e' }}>{inc.decision.type === 'penalty' ? `PENALTY · ${PENALTY_TIERS.find((t) => t.id === inc.decision.tier)?.label || inc.decision.tier}${inc.decision.seconds ? ` ${inc.decision.seconds}s` : ''}${inc.decision.points ? ` ${inc.decision.points} pts` : ''}` : DECISION_TYPES.find((t) => t.id === inc.decision.type)?.label}</b>
          {' '}— #{inc.cars.find((c) => c.carIdx === inc.decision.carIdx)?.number || inc.cars[0]?.number} · {inc.decision.reason || 'no reason given'} · by {inc.decision.by?.name}
          {inc.status === 'published' ? <span style={{ color: '#22c55e' }}> · on air</span> : null}
          {inc.served ? <span style={{ color: '#22c55e' }}> · served at {fmtSessionTime(inc.served.sessionTime)}</span> : null}
          {inc.decision.type === 'penalty' && ['drive-through', 'stop-go'].includes(inc.decision.tier) && (
            <button style={{ ...S.btn('#222', '#22c55e', { marginLeft: 8, padding: '3px 8px' }) }} onClick={() => rc.clearInSim(inc.cars.find((c) => c.carIdx === inc.decision.carIdx)?.number || inc.cars[0]?.number, inc.id)}>clear in sim</button>
          )}
        </div>
      )}

      {/* Decision form */}
      {canDecide && (
        <div style={S.card}>
          <div style={S.label}>{inc.decision ? 'Revise decision' : 'Decision'}</div>
          <div style={S.chipRow}>
            {DECISION_TYPES.map((t) => <button key={t.id} style={S.chip(type === t.id, t.color)} onClick={() => setType(t.id)}>{t.label}</button>)}
          </div>
          {type === 'penalty' && (
            <>
              <div style={{ ...S.label, marginTop: 8 }}>Penalty</div>
              <div style={S.chipRow}>
                {PENALTY_TIERS.map((t) => <button key={t.id} style={S.chip(tier === t.id, '#ef4444')} onClick={() => setTier(t.id)}>{t.label}</button>)}
              </div>
              <div style={{ ...S.row, marginTop: 6 }}>
                {tier === 'time' && <><span style={{ fontSize: 10, color: '#888' }}>seconds</span><input style={{ ...S.input, width: 50 }} type="number" value={seconds} onChange={(e) => setSeconds(e.target.value)} /></>}
                {tier === 'license-points' && <><span style={{ fontSize: 10, color: '#888' }}>points</span><input style={{ ...S.input, width: 50 }} type="number" value={points} onChange={(e) => setPoints(e.target.value)} /></>}
                {inc.cars.length > 1 && (
                  <>
                    <span style={{ fontSize: 10, color: '#888' }}>penalised car</span>
                    <select style={S.input} value={carIdx ?? ''} onChange={(e) => setCarIdx(Number(e.target.value))}>
                      {inc.cars.map((c) => <option key={c.carIdx} value={c.carIdx}>#{c.number} {c.name}</option>)}
                    </select>
                  </>
                )}
                <label style={{ fontSize: 10, color: '#888', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={rc.prefs.applyInSim} onChange={(e) => rc.setPrefs({ applyInSim: e.target.checked })} /> apply in sim (!black / !dq){!rc.simLinked && rc.source?.name ? ` via ${rc.source.name}'s PC` : ''}
                </label>
              </div>
            </>
          )}
          <div style={{ ...S.label, marginTop: 8 }}>Reason</div>
          <div style={S.chipRow}>
            {REASONS.map((r) => <button key={r} style={S.chip(reason === r, '#eee')} onClick={() => setReason(r)}>{r}</button>)}
          </div>
          <div style={{ ...S.label, marginTop: 8 }}>Notes (stewards only)</div>
          <textarea style={S.notes} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== inc.notes && rc.update(inc.id, { notes })} placeholder="What you saw, what the replay showed…" />
          <div style={{ ...S.row, marginTop: 8, justifyContent: 'flex-end' }}>
            <button style={S.btn(decisionValid ? '#c8102e' : '#333', decisionValid ? '#fff' : '#666')} disabled={!decisionValid} onClick={issue}>
              {type === 'penalty' ? 'Issue penalty & publish' : 'Record decision & publish'}
            </button>
          </div>
        </div>
      )}
      {!mine && !inc.claimedBy && inc.status !== 'dismissed' && <div style={{ fontSize: 10, color: '#666' }}>Claim it to decide.</div>}
    </div>
  );
}
