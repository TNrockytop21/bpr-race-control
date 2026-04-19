import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { BroadcastDashboard } from './pages/BroadcastDashboard';
import { SpectatorPage } from './pages/SpectatorPage';
import { DriverDashboard } from './pages/DriverDashboard';
import { OverlayShell } from './layouts/OverlayShell';
import {
  GapOverlay,
  PositionOverlay,
  StintOverlay,
  SectorOverlay,
  TowerOverlay,
  TickerOverlay,
  BattleOverlay,
  TelemetryHudOverlay,
  TelemetryCompareOverlay,
  LapCompareOverlay,
  HeadToHeadOverlay,
  LiveTraceOverlay,
  FuelOverlay,
} from './pages/overlays/index';

export const router = createBrowserRouter([
  // Main broadcast dashboard
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <BroadcastDashboard /> },
      { path: 'live', element: <SpectatorPage /> },
      { path: 'driver', element: <DriverDashboard /> },
    ],
  },

  // OBS overlay pages — transparent background, no header
  // Usage: Add as OBS Browser Source at the URL
  {
    path: '/overlay',
    element: <OverlayShell />,
    children: [
      { path: 'gaps',      element: <GapOverlay /> },       // Gap chart
      { path: 'positions', element: <PositionOverlay /> },   // Position changes
      { path: 'stints',    element: <StintOverlay /> },      // Lap time analysis
      { path: 'sectors',   element: <SectorOverlay /> },     // Sector comparison
      { path: 'tower',     element: <TowerOverlay /> },      // Standings tower
      { path: 'ticker',    element: <TickerOverlay /> },     // Event feed
      { path: 'battle',    element: <BattleOverlay /> },     // Battle tracker
      { path: 'telemetry', element: <TelemetryHudOverlay /> },  // Single driver HUD
      { path: 'compare',  element: <TelemetryCompareOverlay /> }, // Side by side telemetry
      { path: 'laptrace', element: <LapCompareOverlay /> },   // Current vs best lap
      { path: 'h2h',      element: <HeadToHeadOverlay /> },   // Head to head comparison
      { path: 'trace',    element: <LiveTraceOverlay /> },   // Full-lap telemetry graph
      { path: 'fuel',     element: <FuelOverlay /> },        // Fuel monitor
    ],
  },
]);
