import { useMemo, useRef } from 'react';
import { useSession } from '../../context/SessionContext';

const BATTLE_THRESHOLD = 1.5; // seconds — detect battles within this gap
const BATTLE_EXIT_THRESHOLD = 2.0; // seconds — hysteresis: don't remove until gap exceeds this
const BATTLE_MIN_UPDATES = 3; // Must appear in N consecutive updates to show (debounce)

const styles = {
  container: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  header: {
    padding: '6px 10px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #1a1a1a',
    display: 'flex',
    justifyContent: 'space-between',
  },
  list: {
    maxHeight: '200px',
    overflowY: 'auto',
  },
  empty: {
    padding: '12px',
    textAlign: 'center',
    color: '#444',
    fontSize: '10px',
  },
  battle: {
    padding: '6px 10px',
    borderBottom: '1px solid #111',
    transition: 'background-color 0.3s ease, opacity 0.3s ease',
  },
  battleHot: {
    background: 'rgba(239,68,68,0.06)',
    borderLeft: '2px solid #ef4444',
  },
  positions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driver: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  pos: {
    fontWeight: 700,
    fontSize: '10px',
    fontVariantNumeric: 'tabular-nums',
  },
  name: {
    color: '#ccc',
    fontSize: '11px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100px',
  },
  gap: {
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    fontSize: '11px',
  },
};

export function BattleTracker() {
  const { standings } = useSession();

  // Track battle persistence for hysteresis
  const battleHistoryRef = useRef(new Map()); // key → { count, lastGap }

  const battles = useMemo(() => {
    if (!standings || standings.length < 2) return [];

    const currentBattles = new Map();

    // Detect current battles
    for (let i = 1; i < standings.length; i++) {
      const ahead = standings[i - 1];
      const behind = standings[i];
      const gap = behind.interval;

      if (gap != null && gap > 0 && gap <= BATTLE_EXIT_THRESHOLD) {
        const key = `${ahead.carNum || ahead.name}-${behind.carNum || behind.name}`;
        currentBattles.set(key, { ahead, behind, gap, hot: gap <= 0.5 });
      }
    }

    const history = battleHistoryRef.current;
    const result = [];

    // Update history and build stable battle list
    for (const [key, battle] of currentBattles) {
      const prev = history.get(key) || { count: 0 };
      const newCount = prev.count + 1;
      history.set(key, { count: newCount, lastGap: battle.gap });

      // Only show if it's been a battle for enough consecutive updates
      // and the gap is within the display threshold
      if (newCount >= BATTLE_MIN_UPDATES && battle.gap <= BATTLE_THRESHOLD) {
        result.push({ ...battle, key });
      } else if (battle.gap <= BATTLE_THRESHOLD) {
        // New battle, show immediately if gap is small enough
        result.push({ ...battle, key });
        history.set(key, { count: BATTLE_MIN_UPDATES, lastGap: battle.gap });
      }
    }

    // Remove old battles not in current data
    for (const key of history.keys()) {
      if (!currentBattles.has(key)) {
        history.delete(key);
      }
    }

    // Sort by gap (stable — same order unless gaps genuinely change)
    result.sort((a, b) => a.gap - b.gap);

    return result;
  }, [standings]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        Battles ({battles.length})
      </div>
      {battles.length === 0 ? (
        <div style={styles.empty}>No close battles</div>
      ) : (
        <div style={styles.list}>
          {battles.map((b) => (
            <div key={b.key} style={{ ...styles.battle, ...(b.hot ? styles.battleHot : {}) }}>
              <div style={styles.positions}>
                <div style={styles.driver}>
                  <span style={{ ...styles.pos, color: b.ahead.pos <= 3 ? '#f59e0b' : '#666' }}>P{b.ahead.pos}</span>
                  <span style={styles.name}>{b.ahead.name}</span>
                </div>
                <span style={{
                  ...styles.gap,
                  color: b.hot ? '#ef4444' : b.gap <= 1.0 ? '#f59e0b' : '#888',
                }}>
                  {b.gap.toFixed(1)}s
                </span>
                <div style={styles.driver}>
                  <span style={styles.name}>{b.behind.name}</span>
                  <span style={{ ...styles.pos, color: '#666' }}>P{b.behind.pos}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
