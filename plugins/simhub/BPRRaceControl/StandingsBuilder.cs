using System;
using System.Collections.Generic;
using GameReaderCommon;
using SimHub.Plugins;

namespace BPRRaceControl
{
    /// <summary>
    /// Builds the standings array matching agent/capture.py read_standings() exactly.
    /// Uses SimHub's Opponents collection for driver names/car/iRating (reliable),
    /// and CarIdx* telemetry arrays for timing data.
    /// </summary>
    public class StandingsBuilder
    {
        private const string RawPrefix = "DataCorePlugin.GameRawData.Telemetry.";

        // Cache of carIdx → driver info from Opponents, rebuilt each call
        private Dictionary<int, OpponentInfo> _opponentMap;

        private struct OpponentInfo
        {
            public string Name;
            public string CarNumber;
            public string CarName;
            public int IRating;
        }

        /// <summary>
        /// Build standings array matching agent:standings payload.
        /// Returns a List of Dictionary objects, sorted by position.
        /// </summary>
        public List<Dictionary<string, object>> Build(PluginManager pm, GameData data)
        {
            var standings = new List<Dictionary<string, object>>();

            try
            {
                // Build opponent lookup from SimHub's pre-processed Opponents list
                BuildOpponentMap(data);

                // Read CarIdx arrays from telemetry
                var positions = GetIntArray(pm, "CarIdxPosition");
                var bestLaps = GetFloatArray(pm, "CarIdxBestLapTime");
                var lastLaps = GetFloatArray(pm, "CarIdxLastLapTime");
                var lapsCompleted = GetIntArray(pm, "CarIdxLapCompleted");
                var onPit = GetBoolArray(pm, "CarIdxOnPitRoad");
                var estTime = GetFloatArray(pm, "CarIdxEstTime");
                var lapDist = GetFloatArray(pm, "CarIdxLapDistPct");

                if (positions == null) return standings;

                int driverCount = positions.Length;

                for (int idx = 0; idx < driverCount; idx++)
                {
                    int pos = positions[idx];
                    if (pos <= 0) continue; // Skip invalid positions

                    // Get driver info from opponent map, or try property lookups
                    string name = "Unknown";
                    string carNum = "";
                    string car = "";
                    int iRating = 0;

                    if (_opponentMap != null && _opponentMap.ContainsKey(idx))
                    {
                        var opp = _opponentMap[idx];
                        name = opp.Name;
                        carNum = opp.CarNumber;
                        car = opp.CarName;
                        iRating = opp.IRating;
                    }

                    var entry = new Dictionary<string, object>
                    {
                        ["pos"] = pos,
                        ["carIdx"] = idx,
                        ["name"] = name,
                        ["carNum"] = carNum,
                        ["car"] = car,
                        ["iRating"] = iRating,
                    };

                    // Lap times: 0 or negative → null (matching capture.py)
                    if (bestLaps != null && idx < bestLaps.Length && bestLaps[idx] > 0)
                        entry["bestLap"] = bestLaps[idx];
                    else
                        entry["bestLap"] = null;

                    if (lastLaps != null && idx < lastLaps.Length && lastLaps[idx] > 0)
                        entry["lastLap"] = lastLaps[idx];
                    else
                        entry["lastLap"] = null;

                    entry["lapsCompleted"] = (lapsCompleted != null && idx < lapsCompleted.Length)
                        ? lapsCompleted[idx] : 0;

                    entry["onPitRoad"] = (onPit != null && idx < onPit.Length)
                        ? onPit[idx] : false;

                    entry["estTime"] = (estTime != null && idx < estTime.Length)
                        ? (object)estTime[idx] : 0.0;

                    entry["lapDist"] = (lapDist != null && idx < lapDist.Length)
                        ? (object)lapDist[idx] : 0.0;

                    standings.Add(entry);
                }

                // Sort by position ascending (matching capture.py)
                standings.Sort((a, b) => ((int)a["pos"]).CompareTo((int)b["pos"]));
            }
            catch
            {
                // If anything fails, return whatever we have
            }

            return standings;
        }

        /// <summary>
        /// Build a carIdx → driver info map from SimHub's Opponents collection.
        /// Opponents is the reliable way to get driver names in SimHub.
        /// Since Opponent has no CarIdx property, we match by Id (which is
        /// typically the carIdx as a string for iRacing) or by position.
        /// </summary>
        private void BuildOpponentMap(GameData data)
        {
            _opponentMap = new Dictionary<int, OpponentInfo>();

            try
            {
                if (data?.NewData?.Opponents == null) return;

                foreach (var opp in data.NewData.Opponents)
                {
                    if (opp == null) continue;

                    // Try to get carIdx from Id property (iRacing sets this to carIdx)
                    int carIdx = -1;
                    try
                    {
                        if (!string.IsNullOrEmpty(opp.Id) && int.TryParse(opp.Id, out int parsed))
                            carIdx = parsed;
                    }
                    catch { }

                    if (carIdx < 0) continue;

                    int iRating = 0;
                    try { iRating = (int)(opp.IRacing_IRating ?? 0); } catch { }

                    _opponentMap[carIdx] = new OpponentInfo
                    {
                        Name = opp.Name ?? "Unknown",
                        CarNumber = opp.CarNumber ?? "",
                        CarName = opp.CarName ?? "",
                        IRating = iRating,
                    };
                }
            }
            catch
            {
                // Opponents not available — names will be "Unknown"
            }
        }

        // ── Array readers ────────────────────────────────────────────

        private int[] GetIntArray(PluginManager pm, string prop)
        {
            var val = pm.GetPropertyValue(RawPrefix + prop);
            if (val is int[] ia) return ia;
            if (val is object[] oa)
            {
                var result = new int[oa.Length];
                for (int i = 0; i < oa.Length; i++)
                {
                    if (oa[i] is int iv) result[i] = iv;
                    else if (oa[i] != null) int.TryParse(oa[i].ToString(), out result[i]);
                }
                return result;
            }
            return null;
        }

        private float[] GetFloatArray(PluginManager pm, string prop)
        {
            var val = pm.GetPropertyValue(RawPrefix + prop);
            if (val is float[] fa) return fa;
            if (val is double[] da)
            {
                var result = new float[da.Length];
                for (int i = 0; i < da.Length; i++) result[i] = (float)da[i];
                return result;
            }
            if (val is object[] oa)
            {
                var result = new float[oa.Length];
                for (int i = 0; i < oa.Length; i++)
                {
                    if (oa[i] is float fv) result[i] = fv;
                    else if (oa[i] is double dv) result[i] = (float)dv;
                    else if (oa[i] != null) float.TryParse(oa[i].ToString(), out result[i]);
                }
                return result;
            }
            return null;
        }

        private bool[] GetBoolArray(PluginManager pm, string prop)
        {
            var val = pm.GetPropertyValue(RawPrefix + prop);
            if (val is bool[] ba) return ba;
            if (val is int[] ia)
            {
                var result = new bool[ia.Length];
                for (int i = 0; i < ia.Length; i++) result[i] = ia[i] != 0;
                return result;
            }
            if (val is object[] oa)
            {
                var result = new bool[oa.Length];
                for (int i = 0; i < oa.Length; i++)
                {
                    if (oa[i] is bool bv) result[i] = bv;
                    else if (oa[i] is int iv) result[i] = iv != 0;
                }
                return result;
            }
            return null;
        }
    }
}
