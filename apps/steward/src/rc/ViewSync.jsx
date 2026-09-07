/** Share what you're looking at; follow what the other steward shares. */
import { fmtSessionTime } from './useRaceControl';

const S = {
  card: { background: '#0d0d0f', border: '1px solid #1a1a1a', borderRadius: 4, padding: 10, flexShrink: 0 },
  label: { fontSize: 9, color: '#777', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6, display: 'flex', justifyContent: 'space-between' },
  row: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 0', borderTop: '1px solid #151515' },
  btn: (bg, fg = '#fff') => ({ background: bg, color: fg, border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }),
};

export function ViewSync({ rc }) {
  const v = rc.ownView;
  const feedOk = rc.feed.connected && Date.now() - rc.feed.lastAt < 5000;
  return (
    <div style={S.card}>
      <div style={S.label}>
        <span>Views</span>
        <span style={{ color: feedOk ? '#22c55e' : rc.hasSim ? '#ef4444' : '#f59e0b' }}>{feedOk ? 'iRacing linked' : !rc.hasSim ? (rc.source?.active ? `remote desk · feed from ${rc.source.name}` : 'remote desk · no feed yet') : rc.feed.error ? `feed: ${rc.feed.error}` : 'iRacing not linked'}</span>
      </div>
      <div style={{ ...S.row, borderTop: 'none' }}>
        <span style={{ color: '#888', width: 44 }}>mine</span>
        <span style={{ flex: 1, color: '#ccc' }}>{v ? `#${v.carNumber || v.carIdx} ${v.driverName} · ${v.camGroupName} · ${v.live ? 'LIVE' : `${fmtSessionTime(v.sessionTime)} @ ${v.speed}x`}` : '—'}</span>
        <button style={S.btn('#2563eb')} disabled={!v} onClick={rc.shareView}>Share</button>
      </div>
      {rc.sharedViews.map((sv) => (
        <div key={sv.from?.id} style={S.row}>
          <span style={{ color: '#f59e0b', width: 44, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sv.from?.name}</span>
          <span style={{ flex: 1, color: '#ccc' }}>#{sv.view?.carNumber || sv.view?.carIdx} {sv.view?.driverName} · {sv.view?.camGroupName} · {sv.view?.live ? 'LIVE' : fmtSessionTime(sv.view?.sessionTime)}</span>
          <button style={S.btn('#f59e0b', '#111')} onClick={() => rc.followView(sv.view)}>Follow</button>
        </div>
      ))}
      {rc.served.slice(0, 2).map((s, i) => (
        <div key={i} style={{ ...S.row, color: '#22c55e' }}>✓ #{s.number} {s.name} served at {fmtSessionTime(s.sessionTime)}</div>
      ))}
      {rc.hasSim && (
        <label style={{ ...S.row, color: '#888', fontSize: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={rc.prefs.acceptRemote} onChange={(e) => rc.setPrefs({ acceptRemote: e.target.checked })} /> type penalties sent by the remote steward into my sim
        </label>
      )}
      {rc.applied.slice(0, 2).map((a, i) => (
        <div key={i} style={{ ...S.row, color: a.ok ? '#22c55e' : '#ef4444' }}>{a.ok ? '✓' : '✕'} {a.command} {a.ok ? 'applied' : `failed: ${a.error}`}{a.by?.name ? ` · ${a.by.name}` : ''}</div>
      ))}
      {rc.errors.slice(0, 1).map((e, i) => (
        <div key={i} style={{ ...S.row, color: '#ef4444' }}>{e.error}{e.by ? ` (${e.by.name})` : ''}</div>
      ))}
    </div>
  );
}
