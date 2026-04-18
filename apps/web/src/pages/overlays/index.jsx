/**
 * OBS overlay page wrappers.
 * Each component reads driverFilter/maxDrivers from OverlayShell's outlet context.
 */
import { useOutletContext } from 'react-router-dom';
import { GapChart } from '../../components/analytics/GapChart';
import { PositionTracker } from '../../components/analytics/PositionTracker';
import { StintAnalysis } from '../../components/analytics/StintAnalysis';
import { SectorComparison } from '../../components/analytics/SectorComparison';
import { BroadcastStandings } from '../../components/broadcast/BroadcastStandings';
import { IncidentFeed } from '../../components/broadcast/IncidentFeed';
import { BattleTracker } from '../../components/broadcast/BattleTracker';

export function GapOverlay() {
  const { driverFilter, maxDrivers } = useOutletContext();
  return <GapChart driverFilter={driverFilter} maxDrivers={maxDrivers} />;
}

export function PositionOverlay() {
  const { driverFilter, maxDrivers } = useOutletContext();
  return <PositionTracker driverFilter={driverFilter} maxDrivers={maxDrivers} />;
}

export function StintOverlay() {
  const { driverFilter, maxDrivers } = useOutletContext();
  return <StintAnalysis driverFilter={driverFilter} maxDrivers={maxDrivers} />;
}

export function SectorOverlay() {
  const { driverFilter, maxDrivers } = useOutletContext();
  return <SectorComparison driverFilter={driverFilter} maxDrivers={maxDrivers} />;
}

export function TowerOverlay() {
  return (
    <div style={{ height: '100vh', overflow: 'auto' }}>
      <BroadcastStandings />
    </div>
  );
}

export function TickerOverlay() {
  return (
    <div style={{ height: '100vh', overflow: 'hidden' }}>
      <IncidentFeed />
    </div>
  );
}

export function BattleOverlay() {
  return (
    <div style={{ height: '100vh', overflow: 'auto' }}>
      <BattleTracker />
    </div>
  );
}
