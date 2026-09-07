/** Incident queue: what happened, who has it, where it stands. */
import { useMemo, useState } from 'react';
import { CATEGORY_LABEL, fmtSessionTime } from './useRaceControl';

const S = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, flexWrap: 'wrap' },
  title: { color: '#c8102e', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginRight: 6 },
  tab: (on) => ({ background: on ? 'rgba(200,16,46,0.15)' : 'transparent', border: on ? '1px solid rgba(200,16,46,0.4)' : '1px solid #222', color: on ? '#eee' : '#666', fontSize: '10px', padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontWeight: on ? 700 : 400 }),
  list: { flex: 1, overflow: 'auto' },
  row: (sel) => ({ display: 'grid', gridTemplateColumns: '54px 34px 110px 1fr 90px 92px', gap: 6, alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid #131313', background: sel ? 'rgba(200,16,46,0.08)' : 'transparent', borderLeft: sel ? '3px solid #c8102e' : '3px solid transparent', cursor: 'pointer', fontSize: 11 }),
  time: { color: '#aaa', fontVariantNumeric: 'tabular-nums', fontWeight: 600 },
  lap: { color: '#666', fontVariantNumeric: 'tabular-nums' },
  cat: (c) => ({ fontSize: 9, fontWeight: 800, letterSpacing: '0.5px', padding: '2px 6px', borderRadius: 2, textAlign: 'center', color: c, background: `${c}22`, border: `1px solid ${c}55` }),
  cars: { color: '#eee', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  who: (mine) => ({ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, textAlign: 'center', color: mine ? '#fff' : '#bbb', background: mine ? '#c8102e' : '#222', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
  status: (c) => ({ fontSize: 9, fontWeight: 800, letterSpacing: '0.5px', textAlign: 'center', color: c, textTransform: 'uppercase' }),
};
const CAT_COLOR = { contact: '#ef4444', 'loss-of-control': '#f59e0b', 'off-track': '#6b7280', manual: '#a78bfa' };
const STATUS_COLOR = { new: '#f59e0b', investigating: '#60a5fa', decided: '#a78bfa', published: '#22c55e', dismissed: '#555' };

export function IncidentQueue({ rc }) {
  const [tab, setTab] = useState('open');
  const rows = useMemo(() => {
    const all = rc.incidents.filter((i) => rc.prefs.showOffTrack || i.category !== 'off-track' || i.status !== 'new');
    const by = {
      open: (i) => ['new', 'investigating'].includes(i.status),
      decided: (i) => ['decided', 'published'].includes(i.status),
      dismissed: (i) => i.status === 'dismissed',
      all: () => true,
    }[tab];
    return all.filter(by).reverse();
  }, [rc.incidents, rc.prefs.showOffTrack, tab]);
  const counts = useMemo(() => ({
    open: rc.incidents.filter((i) => ['new', 'investigating'].includes(i.status) && (rc.prefs.showOffTrack || i.category !== 'off-track')).length,
    mine: rc.incidents.filter((i) => i.claimedBy?.id === rc.stewardId && ['new', 'investigating'].includes(i.status)).length,
  }), [rc.incidents, rc.prefs.showOffTrack, rc.stewardId]);
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>Incidents</span>
        {[['open', `Open ${counts.open}`], ['decided', 'Decided'], ['dismissed', 'Dismissed'], ['all', 'All']].map(([id, label]) => (
          <button key={id} style={S.tab(tab === id)} onClick={() => setTab(id)}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 10, color: '#777', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={rc.prefs.showOffTrack} onChange={(e) => rc.setPrefs({ showOffTrack: e.target.checked })} /> show 1x
        </label>
        <span style={{ fontSize: 10, color: counts.mine ? '#eee' : '#555' }}>{counts.mine} on my desk</span>
      </div>
      <div style={S.list}>
        {rows.map((inc) => {
          const mine = inc.claimedBy?.id === rc.stewardId;
          const catColor = CAT_COLOR[inc.category] || '#999';
          const label = inc.decision
            ? (inc.decision.type === 'penalty' ? `${inc.decision.tier}${inc.decision.seconds ? ` ${inc.decision.seconds}s` : ''}` : inc.decision.type.replace(/-/g, ' '))
            : inc.status;
          return (
            <div key={inc.id} style={S.row(rc.selectedId === inc.id)} onClick={() => rc.setSelectedId(inc.id)} onDoubleClick={() => rc.jumpTo(inc)}>
              <span style={S.time}>{fmtSessionTime(inc.sessionTime)}</span>
              <span style={S.lap}>L{inc.lap ?? '–'}</span>
              <span style={S.cat(catColor)}>{CATEGORY_LABEL[inc.category] || inc.category}{inc.cars?.[0]?.delta ? ` ${inc.cars.map((c) => `${c.delta}x`).join('+')}` : ''}</span>
              <span style={S.cars} title={inc.cars.map((c) => `#${c.number} ${c.name}`).join(' / ')}>{inc.cars.map((c) => `#${c.number} ${c.name.split(' ').slice(-1)[0]}`).join(' · ')}{inc.nearby?.length ? <span style={{ color: '#666', fontWeight: 400 }}> · near {inc.nearby.map((n) => `#${n.number}`).join(' ')}</span> : null}</span>
              <span style={S.who(mine)}>{inc.claimedBy ? (mine ? 'MINE' : inc.claimedBy.name) : '—'}</span>
              <span style={S.status(STATUS_COLOR[inc.status] || '#999')} title={inc.decision?.reason || ''}>{label}{inc.served ? ' ✓' : ''}</span>
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 16, color: '#444', fontSize: 11 }}>Nothing here.</div>}
      </div>
    </div>
  );
}
