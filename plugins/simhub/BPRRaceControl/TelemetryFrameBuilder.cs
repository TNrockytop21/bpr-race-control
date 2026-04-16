using System;
using System.Collections.Generic;
using GameReaderCommon;
using SimHub.Plugins;

namespace BPRRaceControl
{
    /// <summary>
    /// Maps SimHub iRacing telemetry properties to the JSON frame payload.
    /// Mirrors agent/capture.py read_frame() exactly — same field names,
    /// same units, same optional-field behavior.
    /// </summary>
    public class TelemetryFrameBuilder
    {
        private const string RawPrefix = "DataCorePlugin.GameRawData.Telemetry.";

        /// <summary>
        /// Build a telemetry frame dictionary matching agent:frame payload.
        /// </summary>
        public Dictionary<string, object> Build(PluginManager pm)
        {
            var frame = new Dictionary<string, object>();

            // ── Core driving (required, always present) ──────────────
            frame["lap"] = GetInt(pm, "Lap");
            frame["lapDist"] = GetDouble(pm, "LapDistPct");
            frame["lapTime"] = GetDouble(pm, "LapCurrentLapTime");
            frame["throttle"] = GetDouble(pm, "Throttle");
            frame["brake"] = GetDouble(pm, "Brake");
            frame["speed"] = GetDouble(pm, "Speed");                    // m/s
            frame["rpm"] = GetDouble(pm, "RPM");
            frame["gear"] = GetInt(pm, "Gear");
            frame["latG"] = GetDouble(pm, "LatAccel");
            frame["lonG"] = GetDouble(pm, "LongAccel");
            frame["fuel"] = GetDouble(pm, "FuelLevel");
            frame["onPitRoad"] = GetBool(pm, "OnPitRoad");
            frame["position"] = GetInt(pm, "PlayerCarPosition");
            frame["sessionTime"] = GetDouble(pm, "SessionTime");
            frame["sessionTimeRemain"] = GetDouble(pm, "SessionTimeRemain");

            // SteeringWheelAngle: iRacing gives radians, we convert to degrees
            // Matches: math.degrees(ir["SteeringWheelAngle"]) in capture.py
            var steerRad = GetDoubleOrNull(pm, "SteeringWheelAngle");
            frame["steer"] = steerRad.HasValue ? steerRad.Value * (180.0 / Math.PI) : 0.0;

            // ── Optional fields (include only if available) ──────────
            // Mirrors capture.py's try/except pattern — omit if null

            // Engine / Drivetrain
            TryAdd(frame, "waterTemp", pm, "WaterTemp");
            TryAdd(frame, "oilTemp", pm, "OilTemp");
            TryAdd(frame, "oilPress", pm, "OilPress");
            TryAdd(frame, "voltage", pm, "Voltage");
            TryAdd(frame, "fuelPress", pm, "FuelPress");
            TryAdd(frame, "fuelUsePerHour", pm, "FuelUsePerHour");
            TryAdd(frame, "clutch", pm, "Clutch");

            // Brake / ABS / TC
            TryAdd(frame, "brakeRaw", pm, "BrakeRaw");
            TryAdd(frame, "abs", pm, "dcABS");
            TryAdd(frame, "tc", pm, "dcTractionControl");

            // Environment
            TryAdd(frame, "airTemp", pm, "AirTemp");
            TryAdd(frame, "trackTemp", pm, "TrackTempCrew");
            TryAdd(frame, "windSpeed", pm, "WindVel");
            TryAdd(frame, "windDir", pm, "WindDir");

            // Incidents (cumulative counter — server detects deltas)
            TryAddInt(frame, "incidents", pm, "PlayerCarMyIncidentCount");

            // Lap delta
            TryAdd(frame, "lapDeltaToBest", pm, "LapDeltaToBestLap");
            TryAdd(frame, "lastLapTime", pm, "LapLastLapTime");

            return frame;
        }

        // ── Helpers ──────────────────────────────────────────────────

        private double GetDouble(PluginManager pm, string prop)
        {
            var val = pm.GetPropertyValue(RawPrefix + prop);
            if (val is double d) return d;
            if (val is float f) return f;
            if (val is int i) return i;
            if (val != null && double.TryParse(val.ToString(), out var parsed)) return parsed;
            return 0.0;
        }

        private double? GetDoubleOrNull(PluginManager pm, string prop)
        {
            var val = pm.GetPropertyValue(RawPrefix + prop);
            if (val is double d) return d;
            if (val is float f) return f;
            if (val is int i) return i;
            if (val != null && double.TryParse(val.ToString(), out var parsed)) return parsed;
            return null;
        }

        private int GetInt(PluginManager pm, string prop)
        {
            var val = pm.GetPropertyValue(RawPrefix + prop);
            if (val is int i) return i;
            if (val is double d) return (int)d;
            if (val is float f) return (int)f;
            if (val != null && int.TryParse(val.ToString(), out var parsed)) return parsed;
            return 0;
        }

        private bool GetBool(PluginManager pm, string prop)
        {
            var val = pm.GetPropertyValue(RawPrefix + prop);
            if (val is bool b) return b;
            if (val is int i) return i != 0;
            if (val is double d) return d != 0;
            return false;
        }

        /// <summary>
        /// Try to add an optional double field. Only adds if the property
        /// exists and has a non-null value. Mirrors capture.py's try/except.
        /// </summary>
        private void TryAdd(Dictionary<string, object> frame, string key, PluginManager pm, string prop)
        {
            try
            {
                var val = pm.GetPropertyValue(RawPrefix + prop);
                if (val == null) return;
                if (val is double d) { frame[key] = d; return; }
                if (val is float f) { frame[key] = (double)f; return; }
                if (val is int i) { frame[key] = (double)i; return; }
                if (double.TryParse(val.ToString(), out var parsed)) frame[key] = parsed;
            }
            catch
            {
                // Field not available for this car — skip silently
            }
        }

        /// <summary>
        /// Try to add an optional int field.
        /// </summary>
        private void TryAddInt(Dictionary<string, object> frame, string key, PluginManager pm, string prop)
        {
            try
            {
                var val = pm.GetPropertyValue(RawPrefix + prop);
                if (val == null) return;
                if (val is int i) { frame[key] = i; return; }
                if (val is double d) { frame[key] = (int)d; return; }
                if (val is float f) { frame[key] = (int)f; return; }
                if (int.TryParse(val.ToString(), out var parsed)) frame[key] = parsed;
            }
            catch
            {
                // Field not available — skip silently
            }
        }
    }
}
