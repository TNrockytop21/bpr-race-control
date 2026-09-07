// iRacing SDK Bridge — FEED mode (Race Control v2).
//
//   irsdk-bridge.exe feed [hz]
//
// Long-running. Maps iRacing's shared memory ("Local\IRSDKMemMapFileName")
// and prints one JSON object per line:
//
//   {"t":"hello","feed":1}
//   {"t":"status","connected":true|false,"tickRate":60}
//   {"t":"session","update":N,"weekend":{...},"sessions":[...],"drivers":[...],"cameras":[...]}
//       — whenever the session info string changes (~1/s during a race).
//         drivers[] carries CurDriverIncidentCount / TeamIncidentCount for
//         EVERY car, which is what race control is built on.
//   {"t":"frame","sessionNum":2,"sessionTime":1234.5,"sessionState":4,"flags":4,
//    "cam":{"carIdx":..,"group":..,"camera":..},
//    "replay":{"sessionNum":..,"sessionTime":..,"speed":..,"playing":..,"frame":..},
//    "cars":[[carIdx,lap,lapDistPct,pos,classPos,onPit,trackSurface,sessionFlags,lapCompleted],...]}
//       — `hz` times a second (default 4).
//   {"t":"error","message":"..."}
//
// The Electron main process spawns this and forwards every line to the
// steward renderer, which relays it to the server as rc:field.
//
// Build (with irsdk-bridge.cs): see build-bridge.bat.

using System;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Globalization;

partial class IRSDKBridge
{
    const string MMF_NAME = "Local\\IRSDKMemMapFileName";
    const int VARHDR_SIZE = 144;
    const int VARBUF_BASE = 48;   // irsdk_header: 12 ints, then irsdk_varBuf[4] (16 bytes each)
    static readonly int[] TYPE_SIZE = { 1, 1, 4, 4, 4, 8 }; // char, bool, int, bitField, float, double
    static readonly CultureInfo INV = CultureInfo.InvariantCulture;

    class VarDef { public int Type; public int Offset; public int Count; public string Name; }

    class SdkReader : IDisposable
    {
        MemoryMappedFile mmf;
        MemoryMappedViewAccessor acc;
        public Dictionary<string, VarDef> Vars = new Dictionary<string, VarDef>();
        int varsLoadedFor = -1;

        public bool IsOpen { get { return acc != null; } }
        public bool Open()
        {
            try
            {
                mmf = MemoryMappedFile.OpenExisting(MMF_NAME, MemoryMappedFileRights.Read);
                acc = mmf.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read);
                return true;
            }
            catch { Close(); return false; }
        }
        public void Close()
        {
            if (acc != null) { acc.Dispose(); acc = null; }
            if (mmf != null) { mmf.Dispose(); mmf = null; }
            Vars.Clear(); varsLoadedFor = -1;
        }
        public void Dispose() { Close(); }

        public int Status { get { return acc.ReadInt32(4); } }
        public int TickRate { get { return acc.ReadInt32(8); } }
        public int SessionInfoUpdate { get { return acc.ReadInt32(12); } }
        public int SessionInfoLen { get { return acc.ReadInt32(16); } }
        public int SessionInfoOffset { get { return acc.ReadInt32(20); } }
        public int NumVars { get { return acc.ReadInt32(24); } }
        public int VarHeaderOffset { get { return acc.ReadInt32(28); } }
        public int NumBuf { get { return acc.ReadInt32(32); } }
        public int BufTick(int i) { return acc.ReadInt32(VARBUF_BASE + i * 16); }
        public int BufOffset(int i) { return acc.ReadInt32(VARBUF_BASE + i * 16 + 4); }

        public void LoadVars()
        {
            int n = NumVars, off = VarHeaderOffset;
            int key = n * 100003 + off;
            if (key == varsLoadedFor) return;
            Vars.Clear();
            byte[] name = new byte[32];
            for (int i = 0; i < n; i++)
            {
                int b = off + i * VARHDR_SIZE;
                var v = new VarDef();
                v.Type = acc.ReadInt32(b);
                v.Offset = acc.ReadInt32(b + 4);
                v.Count = acc.ReadInt32(b + 8);
                acc.ReadArray(b + 16, name, 0, 32);
                v.Name = CStr(name);
                if (v.Type < 0 || v.Type > 5) continue;
                Vars[v.Name] = v;
            }
            varsLoadedFor = key;
        }
        public int LatestBuf()
        {
            int best = 0, bt = int.MinValue, nb = Math.Min(NumBuf, 4);
            for (int i = 0; i < nb; i++) { int t = BufTick(i); if (t > bt) { bt = t; best = i; } }
            return best;
        }
        public string SessionInfo()
        {
            int len = SessionInfoLen, off = SessionInfoOffset;
            if (len <= 0 || off <= 0) return "";
            byte[] buf = new byte[len];
            acc.ReadArray(off, buf, 0, len);
            int end = Array.IndexOf(buf, (byte)0);
            if (end < 0) end = len;
            return Encoding.UTF8.GetString(buf, 0, end);
        }
        public bool Has(string name) { return Vars.ContainsKey(name); }
        public int Count(string name) { VarDef v; return Vars.TryGetValue(name, out v) ? v.Count : 0; }
        int Pos(VarDef v, int bufBase, int idx) { return bufBase + v.Offset + idx * TYPE_SIZE[v.Type]; }
        public int ReadInt(int bufBase, string name, int idx = 0)
        {
            VarDef v; if (!Vars.TryGetValue(name, out v) || idx >= v.Count) return 0;
            int p = Pos(v, bufBase, idx);
            switch (v.Type)
            {
                case 0: case 1: return acc.ReadByte(p);
                case 2: case 3: return acc.ReadInt32(p);
                case 4: return (int)acc.ReadSingle(p);
                case 5: return (int)acc.ReadDouble(p);
            }
            return 0;
        }
        public double ReadDouble(int bufBase, string name, int idx = 0)
        {
            VarDef v; if (!Vars.TryGetValue(name, out v) || idx >= v.Count) return 0;
            int p = Pos(v, bufBase, idx);
            switch (v.Type)
            {
                case 0: case 1: return acc.ReadByte(p);
                case 2: case 3: return acc.ReadInt32(p);
                case 4: return acc.ReadSingle(p);
                case 5: return acc.ReadDouble(p);
            }
            return 0;
        }
        public bool ReadBool(int bufBase, string name, int idx = 0) { return ReadInt(bufBase, name, idx) != 0; }
    }

    static string CStr(byte[] b)
    {
        int end = Array.IndexOf(b, (byte)0);
        if (end < 0) end = b.Length;
        return Encoding.ASCII.GetString(b, 0, end);
    }

    // ── JSON helpers (no external assemblies) ──
    static string Esc(string s)
    {
        if (s == null) return "";
        var sb = new StringBuilder(s.Length + 8);
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.ToString();
    }
    static string Q(string s) { return "\"" + Esc(s) + "\""; }
    static string F(double d) { return d.ToString("0.####", INV); }

    // Keys emitted as JSON numbers; everything else stays a string (car
    // numbers like "001" must keep their zeros).
    static readonly HashSet<string> NUMERIC_KEYS = new HashSet<string> {
        "CarIdx", "UserID", "CarClassID", "CarID", "CurDriverIncidentCount", "TeamIncidentCount", "CarIsPaceCar", "CarIsAI",
        "IsSpectator", "IRating", "LicLevel", "SessionNum", "GroupNum", "CameraNum", "TrackID", "SessionID", "SubSessionID",
        "LeagueID", "SeasonID", "SeriesID", "SessionLaps", "NumCarClasses", "NumCarTypes", "TeamID", "CarClassRelSpeed"
    };
    static string JsonValue(string key, string val)
    {
        if (val == null) return "null";
        string v = val.Trim();
        if (v.Length >= 2 && ((v[0] == '"' && v[v.Length - 1] == '"') || (v[0] == '\'' && v[v.Length - 1] == '\''))) v = v.Substring(1, v.Length - 2);
        if (NUMERIC_KEYS.Contains(key))
        {
            long l; double d;
            if (long.TryParse(v, NumberStyles.Integer, INV, out l)) return l.ToString(INV);
            if (double.TryParse(v, NumberStyles.Float, INV, out d)) return d.ToString(INV);
        }
        return Q(v);
    }
    static string JsonObject(Dictionary<string, string> kv)
    {
        var sb = new StringBuilder("{");
        bool first = true;
        foreach (var e in kv)
        {
            if (!first) sb.Append(',');
            first = false;
            sb.Append(Q(e.Key)).Append(':').Append(JsonValue(e.Key, e.Value));
        }
        return sb.Append('}').ToString();
    }

    // ── minimal YAML extraction for the irsdk session string ──
    // Top-level block: "Key:" at column 0 until the next column-0 key.
    static string[] Block(string[] lines, string key)
    {
        int start = -1;
        for (int i = 0; i < lines.Length; i++) if (lines[i].StartsWith(key + ":")) { start = i + 1; break; }
        if (start < 0) return new string[0];
        int end = start;
        while (end < lines.Length && (lines[end].Length == 0 || lines[end][0] == ' ' || lines[end][0] == '\t')) end++;
        var outp = new string[end - start];
        Array.Copy(lines, start, outp, 0, end - start);
        return outp;
    }
    static int Indent(string s) { int i = 0; while (i < s.Length && s[i] == ' ') i++; return i; }
    // Scalars at the block's own indent level: " TrackName: bathurst"
    static Dictionary<string, string> Scalars(string[] block)
    {
        var d = new Dictionary<string, string>();
        if (block.Length == 0) return d;
        int ind = -1;
        foreach (var raw in block)
        {
            if (raw.Trim().Length == 0) continue;
            int i = Indent(raw);
            if (ind < 0) ind = i;
            if (i != ind) continue;
            string line = raw.Trim();
            int c = line.IndexOf(": ");
            if (c < 0) { if (line.EndsWith(":")) continue; c = line.IndexOf(':'); if (c < 0) continue; d[line.Substring(0, c)] = ""; continue; }
            d[line.Substring(0, c)] = line.Substring(c + 2);
        }
        return d;
    }
    // A "- Key: value" list under `listKey:` inside `block`. Nested lists
    // (deeper "- ") are skipped; only keys at itemIndent+2 join the item.
    static List<Dictionary<string, string>> ListOf(string[] block, string listKey)
    {
        var items = new List<Dictionary<string, string>>();
        int start = -1;
        for (int i = 0; i < block.Length; i++) if (block[i].Trim() == listKey + ":") { start = i + 1; break; }
        if (start < 0) return items;
        int listIndent = Indent(block[start - 1]);
        int itemIndent = -1;
        Dictionary<string, string> cur = null;
        for (int i = start; i < block.Length; i++)
        {
            string raw = block[i];
            if (raw.Trim().Length == 0) continue;
            int ind = Indent(raw);
            if (ind <= listIndent) break; // next key at the parent level
            string line = raw.Trim();
            if (line.StartsWith("- "))
            {
                if (itemIndent < 0) itemIndent = ind;
                if (ind != itemIndent) continue; // nested list
                cur = new Dictionary<string, string>();
                items.Add(cur);
                line = line.Substring(2).Trim();
                int c = line.IndexOf(": ");
                if (c > 0) cur[line.Substring(0, c)] = line.Substring(c + 2);
                else if (line.EndsWith(":")) cur[line.Substring(0, line.Length - 1)] = "";
                continue;
            }
            if (cur == null || itemIndent < 0 || ind != itemIndent + 2) continue;
            int cc = line.IndexOf(": ");
            if (cc > 0) cur[line.Substring(0, cc)] = line.Substring(cc + 2);
        }
        return items;
    }
    static Dictionary<string, string> Pick(Dictionary<string, string> d, params string[] keys)
    {
        var o = new Dictionary<string, string>();
        foreach (var k in keys) { string v; if (d.TryGetValue(k, out v)) o[k] = v; }
        return o;
    }
    static string JsonList(List<Dictionary<string, string>> items, params string[] keys)
    {
        var sb = new StringBuilder("[");
        for (int i = 0; i < items.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(JsonObject(Pick(items[i], keys)));
        }
        return sb.Append(']').ToString();
    }

    static string BuildSessionJson(string yaml, int update)
    {
        string[] lines = yaml.Replace("\r", "").Split('\n');
        var weekend = Scalars(Block(lines, "WeekendInfo"));
        var drivers = ListOf(Block(lines, "DriverInfo"), "Drivers");
        var sessions = ListOf(Block(lines, "SessionInfo"), "Sessions");
        var cameras = ListOf(Block(lines, "CameraInfo"), "Groups");
        var sb = new StringBuilder();
        sb.Append("{\"t\":\"session\",\"update\":").Append(update);
        sb.Append(",\"weekend\":").Append(JsonObject(Pick(weekend, "TrackName", "TrackID", "TrackDisplayName", "TrackDisplayShortName", "TrackLength", "TrackLengthOfficial", "SessionID", "SubSessionID", "LeagueID", "SeasonID", "SeriesID", "EventType", "Category", "NumCarClasses")));
        sb.Append(",\"sessions\":").Append(JsonList(sessions, "SessionNum", "SessionType", "SessionName", "SessionLaps", "SessionTime", "SessionSubType"));
        sb.Append(",\"drivers\":").Append(JsonList(drivers, "CarIdx", "UserName", "AbbrevName", "UserID", "TeamID", "TeamName", "CarNumber", "CarNumberRaw", "CarClassID", "CarClassShortName", "CarScreenNameShort", "CarPath", "CarID", "CarIsPaceCar", "CarIsAI", "IsSpectator", "CurDriverIncidentCount", "TeamIncidentCount", "IRating", "LicLevel"));
        sb.Append(",\"cameras\":").Append(JsonList(cameras, "GroupNum", "GroupName"));
        return sb.Append('}').ToString();
    }

    static string BuildFrameJson(SdkReader sdk, int b)
    {
        var sb = new StringBuilder(4096);
        sb.Append("{\"t\":\"frame\"");
        sb.Append(",\"sessionNum\":").Append(sdk.ReadInt(b, "SessionNum"));
        sb.Append(",\"sessionTime\":").Append(F(sdk.ReadDouble(b, "SessionTime")));
        sb.Append(",\"sessionState\":").Append(sdk.ReadInt(b, "SessionState"));
        sb.Append(",\"flags\":").Append(sdk.ReadInt(b, "SessionFlags"));
        sb.Append(",\"playerCarIdx\":").Append(sdk.ReadInt(b, "PlayerCarIdx"));
        sb.Append(",\"cam\":{\"carIdx\":").Append(sdk.ReadInt(b, "CamCarIdx"))
          .Append(",\"group\":").Append(sdk.ReadInt(b, "CamGroupNumber"))
          .Append(",\"camera\":").Append(sdk.ReadInt(b, "CamCameraNumber")).Append('}');
        sb.Append(",\"replay\":{\"sessionNum\":").Append(sdk.ReadInt(b, "ReplaySessionNum"))
          .Append(",\"sessionTime\":").Append(F(sdk.ReadDouble(b, "ReplaySessionTime")))
          .Append(",\"speed\":").Append(sdk.ReadInt(b, "ReplayPlaySpeed"))
          .Append(",\"playing\":").Append(sdk.ReadBool(b, "IsReplayPlaying") ? "true" : "false")
          .Append(",\"frame\":").Append(sdk.ReadInt(b, "ReplayFrameNum")).Append('}');
        sb.Append(",\"cars\":[");
        int n = Math.Min(64, Math.Max(sdk.Count("CarIdxLap"), sdk.Count("CarIdxTrackSurface")));
        bool first = true;
        for (int i = 0; i < n; i++)
        {
            int surface = sdk.Has("CarIdxTrackSurface") ? sdk.ReadInt(b, "CarIdxTrackSurface", i) : -1;
            if (surface == -1) continue; // not in world
            if (!first) sb.Append(',');
            first = false;
            sb.Append('[').Append(i)
              .Append(',').Append(sdk.ReadInt(b, "CarIdxLap", i))
              .Append(',').Append(F(sdk.ReadDouble(b, "CarIdxLapDistPct", i)))
              .Append(',').Append(sdk.ReadInt(b, "CarIdxPosition", i))
              .Append(',').Append(sdk.ReadInt(b, "CarIdxClassPosition", i))
              .Append(',').Append(sdk.ReadBool(b, "CarIdxOnPitRoad", i) ? 1 : 0)
              .Append(',').Append(surface)
              .Append(',').Append(sdk.ReadInt(b, "CarIdxSessionFlags", i))
              .Append(',').Append(sdk.ReadInt(b, "CarIdxLapCompleted", i))
              .Append(']');
        }
        return sb.Append("]}").ToString();
    }

    static StreamWriter feedOut;
    static void Emit(string line)
    {
        feedOut.WriteLine(line);
    }

    static void RunFeed(int hz)
    {
        feedOut = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        feedOut.AutoFlush = true;
        int interval = Math.Max(50, 1000 / Math.Max(1, hz));
        var sdk = new SdkReader();
        int lastSessionUpdate = -1;
        bool wasConnected = false;
        Emit("{\"t\":\"hello\",\"feed\":1,\"hz\":" + hz + "}");
        while (true)
        {
            try
            {
                if (!sdk.IsOpen && !sdk.Open())
                {
                    if (wasConnected) { Emit("{\"t\":\"status\",\"connected\":false}"); wasConnected = false; }
                    Thread.Sleep(1000);
                    continue;
                }
                bool connected = (sdk.Status & 1) == 1;
                if (!connected)
                {
                    if (wasConnected) { Emit("{\"t\":\"status\",\"connected\":false}"); wasConnected = false; lastSessionUpdate = -1; }
                    Thread.Sleep(1000);
                    continue;
                }
                if (!wasConnected)
                {
                    wasConnected = true;
                    Emit("{\"t\":\"status\",\"connected\":true,\"tickRate\":" + sdk.TickRate + "}");
                }
                sdk.LoadVars();
                int su = sdk.SessionInfoUpdate;
                if (su != lastSessionUpdate)
                {
                    string yaml = sdk.SessionInfo();
                    if (yaml.Length > 0) { Emit(BuildSessionJson(yaml, su)); lastSessionUpdate = su; }
                }
                int bi = sdk.LatestBuf();
                int tick = sdk.BufTick(bi);
                string frame = BuildFrameJson(sdk, sdk.BufOffset(bi));
                if (sdk.BufTick(bi) != tick) // torn read — the sim wrote over us; take the newest buffer again
                {
                    bi = sdk.LatestBuf();
                    frame = BuildFrameJson(sdk, sdk.BufOffset(bi));
                }
                Emit(frame);
            }
            catch (Exception ex)
            {
                Emit("{\"t\":\"error\",\"message\":" + Q(ex.Message) + "}");
                sdk.Close();
                wasConnected = false;
                lastSessionUpdate = -1;
                Thread.Sleep(1000);
                continue;
            }
            Thread.Sleep(interval);
        }
    }
}
