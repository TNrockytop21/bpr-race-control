/**
 * Live Telemetry Graph — full-lap trace plotted by track distance.
 *
 * X axis: lap distance 0% → 100% (track position)
 * Traces: throttle (green), brake (red), speed (blue)
 * Current position marker moves across as the driver goes around.
 * Redraws from 0% when a new lap starts.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { useTelemetryBuffers } from '../../context/TelemetryContext';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';

const THROTTLE_COLOR = '#22c55e';
const BRAKE_COLOR = '#ef4444';
const SPEED_COLOR = '#3b82f6';
const STEER_COLOR = '#f59e0b';
const GRID_COLOR = '#1a1a1e';
const TEXT_COLOR = '#888';
const MARKER_COLOR = '#ffffff';
const BG_COLOR = '#0a0a0e';

export function LiveTelemetryGraph({ driverId, showThrottle = true, showBrake = true, showSpeed = true, showSteering = false, height = 300 }) {
  const buffersRef = useTelemetryBuffers();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasWidth, setCanvasWidth] = useState(800);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer = buffersRef.current.get(driverId);
    if (!buffer) {
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#333';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for telemetry...', canvas.width / 2, canvas.height / 2);
      return;
    }

    const frames = buffer.getCurrentLapFrames();
    const latest = buffer.getLatest();
    if (!frames.length) return;

    const W = canvas.width;
    const H = canvas.height;
    const padTop = 30;
    const padBottom = 24;
    const padLeft = 40;
    const padRight = 12;
    const plotW = W - padLeft - padRight;
    const plotH = H - padTop - padBottom;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    // ── Grid lines ──
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;

    // Vertical grid (every 10% of track)
    for (let p = 0; p <= 100; p += 10) {
      const x = padLeft + (p / 100) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, H - padBottom);
      ctx.stroke();

      // Labels
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p + '%', x, H - padBottom + 14);
    }

    // Horizontal grid (0%, 25%, 50%, 75%, 100%)
    for (let v = 0; v <= 100; v += 25) {
      const y = padTop + plotH - (v / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.stroke();

      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '9px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(v + '%', padLeft - 4, y + 3);
    }

    // ── Find max speed for scaling ──
    let maxSpeed = 250; // km/h default
    for (const f of frames) {
      const spd = (f.speed || 0) * 3.6;
      if (spd > maxSpeed) maxSpeed = spd;
    }
    maxSpeed = Math.ceil(maxSpeed / 50) * 50; // Round up to nearest 50

    // ── Speed Y axis label ──
    if (showSpeed) {
      ctx.fillStyle = SPEED_COLOR;
      ctx.font = '8px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SPD: ' + maxSpeed + ' km/h', W - padRight - 70, padTop - 4);

      // Speed grid labels on right
      for (let v = 0; v <= maxSpeed; v += 50) {
        const y = padTop + plotH - (v / maxSpeed) * plotH;
        ctx.fillStyle = '#333';
        ctx.font = '8px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(v, W - padRight + 2, y + 3);
      }
    }

    // ── Draw traces ──
    function drawTrace(getY, color, lineWidth) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth || 1.5;
      ctx.beginPath();
      let started = false;

      for (const f of frames) {
        const dist = f.lapDist || 0;
        const x = padLeft + dist * plotW;
        const val = getY(f);
        const y = padTop + plotH - val * plotH;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Speed (scaled to maxSpeed)
    if (showSpeed) {
      drawTrace((f) => Math.min(1, ((f.speed || 0) * 3.6) / maxSpeed), SPEED_COLOR, 2);
    }

    // Throttle (0-1 maps to 0-100%)
    if (showThrottle) {
      drawTrace((f) => f.throttle || 0, THROTTLE_COLOR, 1.5);
    }

    // Brake (0-1)
    if (showBrake) {
      drawTrace((f) => f.brake || 0, BRAKE_COLOR, 1.5);
    }

    // Steering (normalized: -180..+180 → 0..1, center = 0.5)
    if (showSteering) {
      drawTrace((f) => 0.5 + (f.steer || 0) / 360, STEER_COLOR, 1);
    }

    // ── Current position marker ──
    if (latest) {
      const curDist = latest.lapDist || 0;
      const markerX = padLeft + curDist * plotW;

      // Vertical line
      ctx.strokeStyle = MARKER_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(markerX, padTop);
      ctx.lineTo(markerX, H - padBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot
      ctx.fillStyle = MARKER_COLOR;
      ctx.beginPath();
      ctx.arc(markerX, padTop - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Legend ──
    const legendY = 12;
    let legendX = padLeft;
    function legendItem(label, color) {
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY - 4, 10, 3);
      ctx.fillStyle = '#ccc';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, legendX + 14, legendY);
      legendX += ctx.measureText(label).width + 28;
    }

    if (showThrottle) legendItem('Throttle', THROTTLE_COLOR);
    if (showBrake) legendItem('Brake', BRAKE_COLOR);
    if (showSpeed) legendItem('Speed', SPEED_COLOR);
    if (showSteering) legendItem('Steering', STEER_COLOR);

    // ── Live data readout (top right) ──
    if (latest) {
      const readoutX = W - padRight;
      ctx.textAlign = 'right';
      ctx.font = 'bold 16px -apple-system, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.round((latest.speed || 0) * 3.6) + ' km/h', readoutX, padTop + 16);

      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = '#888';
      ctx.fillText('Gear ' + (latest.gear > 0 ? latest.gear : 'N'), readoutX, padTop + 30);

      ctx.fillText('Lap ' + (latest.lap || '--'), readoutX, padTop + 44);
    }
  }, [driverId, buffersRef, canvasWidth, height, showThrottle, showBrake, showSpeed, showSteering]);

  useAnimationFrame(draw);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  return (
    <div ref={containerRef} style={{ width: '100%', height: height + 'px', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth * dpr}
        height={height * dpr}
        style={{
          width: canvasWidth + 'px',
          height: height + 'px',
          display: 'block',
        }}
      />
    </div>
  );
}
