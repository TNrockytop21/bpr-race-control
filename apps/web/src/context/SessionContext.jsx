import { createContext, useContext, useReducer, useEffect, useMemo, useCallback, useRef } from 'react';
import { wsClient } from '../lib/ws-client';

const SessionContext = createContext(null);
const SessionDispatchContext = createContext(null);

const MAX_GAP_HISTORY = 600; // ~5 min at 2Hz

const initialState = {
  connected: false,
  sessionInfo: null,
  drivers: {},
  driverJoinOrder: [],
  stints: [],
  trackShape: null,
  events: [],
  profiles: {},
  standings: [],
  gapHistory: [], // { time, drivers: { [name]: { pos, gap, interval } } }
};

function sessionReducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };

    case 'SESSION_SNAPSHOT': {
      const drivers = {};
      const joinOrder = [];
      for (const d of action.payload.drivers || []) {
        drivers[d.id] = { ...d, laps: [] };
        joinOrder.push(d.id);
      }
      return {
        ...state,
        sessionInfo: action.payload.sessionInfo,
        drivers,
        driverJoinOrder: joinOrder,
        trackShape: action.payload.trackShape || state.trackShape,
      };
    }

    case 'DRIVER_JOINED': {
      const { driverId, driverName, car } = action.payload;
      return {
        ...state,
        driverJoinOrder: [...state.driverJoinOrder.filter((id) => id !== driverId), driverId],
        drivers: {
          ...state.drivers,
          [driverId]: {
            id: driverId,
            name: driverName,
            car,
            connected: true,
            bestLapTime: null,
            bestLapNumber: null,
            bestSectors: [null, null, null],
            lapCount: 0,
            laps: [],
          },
        },
      };
    }

    case 'DRIVER_LEFT': {
      const { driverId, replaced } = action.payload;
      if (!state.drivers[driverId]) return state;
      if (replaced) {
        const { [driverId]: _removed, ...remainingDrivers } = state.drivers;
        return {
          ...state,
          drivers: remainingDrivers,
          driverJoinOrder: state.driverJoinOrder.filter((id) => id !== driverId),
        };
      }
      return {
        ...state,
        drivers: {
          ...state.drivers,
          [driverId]: { ...state.drivers[driverId], connected: false },
        },
      };
    }

    case 'LAP_LIST': {
      const { driverId, laps } = action.payload;
      const driver = state.drivers[driverId];
      if (!driver) return state;
      return {
        ...state,
        drivers: {
          ...state.drivers,
          [driverId]: {
            ...driver,
            laps: laps || [],
            lapCount: laps?.length || 0,
          },
        },
      };
    }

    case 'LAP_COMPLETE': {
      const { driverId, lapNumber, lapTime, fuelUsed, valid, bestLap, sectors, bestSectors } = action.payload;
      const driver = state.drivers[driverId];
      if (!driver) return state;
      return {
        ...state,
        drivers: {
          ...state.drivers,
          [driverId]: {
            ...driver,
            lapCount: (driver.lapCount || 0) + 1,
            bestLapTime: bestLap,
            bestSectors: bestSectors || driver.bestSectors,
            laps: [
              ...driver.laps,
              { lapNumber, lapTime, fuelUsed, valid, sectors },
            ],
          },
        },
      };
    }

    case 'STINT_COMPLETE':
      return { ...state, stints: [...state.stints, action.payload] };

    case 'STINT_LIST':
      return { ...state, stints: action.payload.stints || [] };

    case 'TRACK_SHAPE':
      return { ...state, trackShape: action.payload.points };

    case 'EVENT':
      return { ...state, events: [...state.events, action.payload] };

    case 'EVENT_LOG':
      return { ...state, events: action.payload.events || [] };

    case 'PROFILE':
      return { ...state, profiles: { ...state.profiles, [action.payload.driverId]: action.payload.profile } };

    case 'PROFILE_UPDATED':
      return { ...state, profiles: { ...state.profiles, [action.payload.driverId]: action.payload.profile } };

    case 'STANDINGS': {
      // Accumulate gap history for analytics
      const snapshot = { time: Date.now(), drivers: {} };
      for (const s of action.payload) {
        if (s.name) {
          snapshot.drivers[s.name] = {
            pos: s.pos,
            gap: s.gap || 0,
            interval: s.interval || 0,
          };
        }
      }
      const history = [...state.gapHistory, snapshot];
      if (history.length > MAX_GAP_HISTORY) history.shift();
      return { ...state, standings: action.payload, gapHistory: history };
    }

    default:
      return state;
  }
}

export function SessionProvider({ children }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  const activeDriverId = useMemo(() => {
    for (let i = state.driverJoinOrder.length - 1; i >= 0; i--) {
      const id = state.driverJoinOrder[i];
      if (state.drivers[id]?.connected) return id;
    }
    return null;
  }, [state.drivers, state.driverJoinOrder]);

  const value = useMemo(
    () => ({
      ...state,
      activeDriverId,
    }),
    [state, activeDriverId]
  );

  useEffect(() => {
    const unsubs = [
      wsClient.on('_connected', (connected) => {
        dispatch({ type: 'SET_CONNECTED', payload: connected });
      }),
      wsClient.on('session:snapshot', (payload) =>
        dispatch({ type: 'SESSION_SNAPSHOT', payload })
      ),
      wsClient.on('driver:joined', (payload) =>
        dispatch({ type: 'DRIVER_JOINED', payload })
      ),
      wsClient.on('driver:left', (payload) =>
        dispatch({ type: 'DRIVER_LEFT', payload })
      ),
      wsClient.on('lap:complete', (payload) =>
        dispatch({ type: 'LAP_COMPLETE', payload })
      ),
      wsClient.on('lap:list', (payload) =>
        dispatch({ type: 'LAP_LIST', payload })
      ),
      wsClient.on('stint:complete', (payload) =>
        dispatch({ type: 'STINT_COMPLETE', payload })
      ),
      wsClient.on('stint:list', (payload) =>
        dispatch({ type: 'STINT_LIST', payload })
      ),
      wsClient.on('track:shape', (payload) =>
        dispatch({ type: 'TRACK_SHAPE', payload })
      ),
      wsClient.on('event', (payload) =>
        dispatch({ type: 'EVENT', payload })
      ),
      wsClient.on('event:log', (payload) =>
        dispatch({ type: 'EVENT_LOG', payload })
      ),
      wsClient.on('profile', (payload) =>
        dispatch({ type: 'PROFILE', payload })
      ),
      wsClient.on('profile:updated', (payload) =>
        dispatch({ type: 'PROFILE_UPDATED', payload })
      ),
      // Throttle standings updates — only apply once per animation frame
      // to prevent excessive re-renders from 2Hz server updates
      (() => {
        let pendingStandings = null;
        let rafId = null;
        return wsClient.on('standings', (payload) => {
          pendingStandings = payload;
          if (!rafId) {
            rafId = requestAnimationFrame(() => {
              if (pendingStandings) {
                dispatch({ type: 'STANDINGS', payload: pendingStandings });
                pendingStandings = null;
              }
              rafId = null;
            });
          }
        });
      })(),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  return (
    <SessionContext.Provider value={value}>
      <SessionDispatchContext.Provider value={dispatch}>
        {children}
      </SessionDispatchContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export function useSessionDispatch() {
  return useContext(SessionDispatchContext);
}
