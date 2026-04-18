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
import { TelemetryOverlayCard, TelemetryCompare } from '../../components/analytics/TelemetryOverlayCard';
import { LapTraceComparison, DriverVsDriver } from '../../components/analytics/LapTraceComparison';
import { LiveTelemetryGraph } from '../../components/analytics/LiveTelemetryGraph';
import { useSession } from '../../context/SessionContext';

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

// ── Telemetry overlays ───────────────────────────────────────

export function TelemetryHudOverlay() {
  const { driverFilter } = useOutletContext();
  const driverName = driverFilter?.[0] || null;
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
      <TelemetryOverlayCard driverName={driverName} />
    </div>
  );
}

export function TelemetryCompareOverlay() {
  const { driverFilter, maxDrivers } = useOutletContext();
  return (
    <div style={{ height: '100vh', padding: '8px' }}>
      <TelemetryCompare driverNames={driverFilter} maxDrivers={maxDrivers || 2} />
    </div>
  );
}

export function LapCompareOverlay() {
  const { driverFilter } = useOutletContext();
  const driverName = driverFilter?.[0] || null;
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
      <LapTraceComparison driverName={driverName} />
    </div>
  );
}

export function HeadToHeadOverlay() {
  const { driverFilter } = useOutletContext();
  const driverA = driverFilter?.[0] || null;
  const driverB = driverFilter?.[1] || null;
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
      <DriverVsDriver driverAName={driverA} driverBName={driverB} />
    </div>
  );
}

export function LiveTraceOverlay() {
  const { driverFilter } = useOutletContext();
  const { drivers } = useSession();
  const driverName = driverFilter?.[0] || null;
  const driver = driverName
    ? Object.values(drivers).find((d) => d.name === driverName)
    : Object.values(drivers).find((d) => d.connected);

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      {driver ? (
        <LiveTelemetryGraph driverId={driver.id} height={window.innerHeight || 400} />
      ) : (
        <div style={{ color: '#555', padding: '20px', textAlign: 'center' }}>
          Waiting for driver... (add ?drivers=Name to URL)
        </div>
      )}
    </div>
  );
}
