import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { BroadcastDashboard } from './pages/BroadcastDashboard';
import { OverlayShell } from './layouts/OverlayShell';
import {
  GapOverlay,
  PositionOverlay,
  StintOverlay,
  SectorOverlay,
  TowerOverlay,
  TickerOverlay,
  BattleOverlay,
} from './pages/overlays/index';

export const router = createBrowserRouter([
  // Main broadcast dashboard
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <BroadcastDashboard /> },
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
    ],
  },
]);
