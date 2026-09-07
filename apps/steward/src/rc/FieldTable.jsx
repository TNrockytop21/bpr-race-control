/** Live field: every car in the session from the admin feed, sorted by position. */
import { useMemo, useState } from 'react';

const S = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 },
  title: { color: '#c8102e', fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' },
  meta: { color: '#666', fontSize: '10px', fontVariantNumeric: 'tabular-nums' },
  search: { width: '100%', padding: '4px 8px', background: '#111', border: '1px solid #222', borderRadius: '3px', color: '#ccc', fontSize: '11px', outline: 'none', margin: '6px 0' },
  list: { flex: 1, overflow: 'auto' },
  row: { display: 'grid', gridTemplateColumns: '26px 40px 1fr 36px 30px 34px', gap: '4px', alignItems: 'center', padding: '4px 8px', fontSize: '11px', borderBottom: '1px solid #131313', cursor: 'pointer' },
  pos: { color: '#888', fontVariantNumeric: 'tabular-nums', fontWeight: 700 },
  num: { fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  name: { color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cls: { fontSize: '9px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', textAlign: 'center' },
  inc: { color: '#888', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  tag: { fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '2px', textAlign: 'center' },
  plus: { background: 'transparent', border: '1px solid #2a2a2a', color: '#777', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', padding: '1px 4px' },
};
const CLASS_COLOR = { LMP2: '#7e95d4', GT3: '#f47a7f', GT4: '#f5c542', GTP: '#c084fc' };
const classColor = (s) => CLASS_COLOR[String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)] || '#999';

export function FieldTable({ rc }) {
  const [q, setQ] = useState('');
  const cars = rc.field?.cars || [];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? cars.filter((c) => c.name.toLowerCase().includes(needle) || c.number.includes(needle)) : cars;
  }, [cars, q]);
  const incTotal = cars.reduce((s, c) => s + (c.inc || 0), 0);
  const sourceOk = rc.source?.active;
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>Field · {cars.length} cars</span>
        <span style={S.meta} title={rc.source ? `feed from ${rc.source.name}` : 'no feed'}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: sourceOk ? '#22c55e' : '#ef4444', marginRight: 5 }} />
          {rc.source?.name || 'no feed'} · {incTotal}x
        </span>
      </div>
      <div style={{ padding: '0 8px', flexShrink: 0 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find car / driver…" style={S.search} />
      </div>
      <div style={S.list}>
        {rows.map((c) => (
          <div key={c.carIdx} style={{ ...S.row, opacity: c.surface === -1 ? 0.4 : 1 }} title="Click: camera on this car" onClick={() => rc.cameraOn(c.number)}>
            <span style={S.pos}>{c.pos || '–'}</span>
            <span style={{ ...S.num, color: classColor(c.classShort) }}>#{c.number}</span>
            <span style={S.name}>{c.name}</span>
            <span style={{ ...S.cls, color: classColor(c.classShort), background: `${classColor(c.classShort)}22` }}>{c.classShort || '?'}</span>
            <span style={S.inc}>{c.inc}x</span>
            <span style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
              {c.black && <span style={{ ...S.tag, background: '#111', color: '#f59e0b', border: '1px solid #f59e0b' }}>BLK</span>}
              {c.onPit && !c.black && <span style={{ ...S.tag, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>PIT</span>}
              {c.dq && <span style={{ ...S.tag, background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>DQ</span>}
              <button style={S.plus} title="Open a manual incident on this car" onClick={(e) => { e.stopPropagation(); rc.createIncident([c.carIdx]); }}>+</button>
            </span>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: 14, color: '#444', fontSize: 11 }}>{cars.length ? 'No match.' : 'Waiting for the field feed — start iRacing on a steward PC running this app.'}</div>}
      </div>
    </div>
  );
}
