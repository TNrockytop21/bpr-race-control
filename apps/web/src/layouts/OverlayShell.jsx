/**
 * OverlayShell — minimal layout wrapper for OBS browser source pages.
 * Transparent background, no header, edge-to-edge rendering.
 * Parses query params for driver filtering and theming.
 *
 * Usage in OBS:
 *   Add Browser Source → URL: https://racecontrol.bitepointracing.com/overlay/gaps
 *   Optional: ?drivers=D.Newman,A.Riegel&max=6
 */
import { useEffect, useMemo } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';

export function OverlayShell() {
  const [params] = useSearchParams();

  // Set transparent background for OBS
  useEffect(() => {
    document.body.style.background = 'transparent';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.background = 'transparent';

    return () => {
      document.body.style.background = '';
      document.documentElement.style.background = '';
    };
  }, []);

  // Parse driver filter from query params
  const driverFilter = useMemo(() => {
    const d = params.get('drivers');
    if (!d) return null;
    return d.split(',').map((s) => s.trim()).filter(Boolean);
  }, [params]);

  const maxDrivers = parseInt(params.get('max') || '10');
  const theme = params.get('theme') || 'dark';

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: theme === 'light' ? 'rgba(255,255,255,0.9)' : 'transparent',
      color: theme === 'light' ? '#111' : '#ccc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <Outlet context={{ driverFilter, maxDrivers, theme }} />
    </div>
  );
}
