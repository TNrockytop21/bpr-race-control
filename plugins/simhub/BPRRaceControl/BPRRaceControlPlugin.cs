using System;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using GameReaderCommon;
using Newtonsoft.Json.Linq;
using SimHub.Plugins;

namespace BPRRaceControl
{
    /// <summary>
    /// BPR Race Control SimHub Plugin.
    /// Streams iRacing telemetry to the BPR server via websocket,
    /// replacing the standalone Python agent.
    ///
    /// Drop BPRRaceControl.dll into your SimHub folder, restart SimHub, done.
    /// </summary>
    [PluginName("BPR Race Control")]
    [PluginDescription("Streams iRacing telemetry to BPR Race Control for live stewarding")]
    [PluginAuthor("Bite Point Racing")]
    public class BPRRaceControlPlugin : IPlugin, IDataPlugin, IWPFSettingsV2
    {
        // ── Plugin state ─────────────────────────────────────────────

        private enum AgentState { Idle, WaitingForSession, HelloSent, Streaming }

        public PluginManager PluginManager { get; set; }

        /// <summary>Menu title shown in SimHub's left sidebar.</summary>
        public string LeftMenuTitle => "BPR Race Control";

        /// <summary>Icon for SimHub's plugin list (null = default).</summary>
        public System.Windows.Media.ImageSource PictureIcon => null;

        private PluginSettings _settings;
        private WebSocketClient _wsClient;
        private TelemetryFrameBuilder _frameBuilder;
        private StandingsBuilder _standingsBuilder;
        private SettingsControl _settingsControl;
        private PluginUpdater _updater;
        private JoystickManager _joystickManager;

        private AgentState _state = AgentState.Idle;
        private int _tickCounter;
        private bool _wasGameRunning;
        private DateTime _lastProtestTime = DateTime.MinValue;

        // Global hotkey
        private HwndSource _hwndSource;
        private const int WM_HOTKEY = 0x0312;
        private const int HOTKEY_ID_PROTEST = 9001;

        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        // ── IPlugin ──────────────────────────────────────────────────

        public void Init(PluginManager pluginManager)
        {
            PluginManager = pluginManager;

            // Load persisted settings
            _settings = this.ReadCommonSettings("GeneralSettings", () => new PluginSettings());

            // Create components
            _wsClient = new WebSocketClient();
            _frameBuilder = new TelemetryFrameBuilder();
            _standingsBuilder = new StandingsBuilder();

            // Subscribe to incoming server messages
            _wsClient.OnServerMessage += HandleServerMessage;
            _wsClient.OnConnectionChanged += OnConnectionChanged;

            // Expose plugin properties to SimHub's property system
            pluginManager.AddProperty("BPRRaceControl.Connected", this.GetType(), false);
            pluginManager.AddProperty("BPRRaceControl.LastPenalty", this.GetType(), "");
            pluginManager.AddProperty("BPRRaceControl.UnderInvestigation", this.GetType(), false);
            pluginManager.AddProperty("BPRRaceControl.LastRCMessage", this.GetType(), "");
            pluginManager.AddProperty("BPRRaceControl.ProtestCooldown", this.GetType(), false);

            // Register "Report Incident" action (can be bound to a button/key)
            pluginManager.AddAction("BPRRaceControl.ReportIncident", this.GetType(),
                (pm, action) => SendProtest());

            // Auto-update checker
            _updater = new PluginUpdater();
            _updater.CheckForUpdateAsync();

            // Register global protest hotkey
            RegisterProtestHotkey();

            // Joystick/wheel button binding
            _joystickManager = new JoystickManager();
            _joystickManager.OnButtonPressed += SendProtest;
            _joystickManager.LoadBinding(_settings.WheelDeviceGuid, _settings.WheelButtonIndex);

            SimHub.Logging.Current.Info("[BPR] Plugin initialized");
        }

        public void End(PluginManager pluginManager)
        {
            UnregisterProtestHotkey();
            _joystickManager?.Dispose();
            _wsClient?.Dispose();
            this.SaveCommonSettings("GeneralSettings", _settings);
            SimHub.Logging.Current.Info("[BPR] Plugin shutdown");
        }

        // ── IDataPlugin ──────────────────────────────────────────────

        private GameData _lastGameData;

        public void DataUpdate(PluginManager pluginManager, ref GameData data)
        {
            // Poll wheel button every tick (60Hz) — works even when not streaming
            _joystickManager?.Poll();

            _lastGameData = data;
            bool gameRunning = data.GameRunning && data.GameName == "IRacing";

            // Detect session start/end transitions
            if (gameRunning && !_wasGameRunning)
            {
                // iRacing session just started
                _state = AgentState.WaitingForSession;
                _tickCounter = 0;

                if (_settings.AutoConnect && !_wsClient.IsConnected)
                {
                    _wsClient.Start(_settings.ServerUrl);
                }

                SimHub.Logging.Current.Info("[BPR] iRacing session detected");
            }
            else if (!gameRunning && _wasGameRunning)
            {
                // iRacing session ended
                _state = AgentState.Idle;
                SimHub.Logging.Current.Info("[BPR] iRacing session ended");
            }

            _wasGameRunning = gameRunning;

            if (!gameRunning || !_wsClient.IsConnected)
                return;

            _tickCounter++;

            // Throttle 60Hz → 20Hz: only process every 3rd tick
            if (_tickCounter % 3 != 0)
                return;

            try
            {
                // ── State machine ────────────────────────────────────

                if (_state == AgentState.WaitingForSession)
                {
                    // Try to send hello — need valid driver/track info
                    if (TrySendHello(pluginManager))
                    {
                        _state = AgentState.HelloSent;
                    }
                    return; // Don't send frames until hello is sent
                }

                if (_state == AgentState.HelloSent)
                {
                    _state = AgentState.Streaming;
                }

                // ── Send telemetry frame (20Hz) ──────────────────────

                var frame = _frameBuilder.Build(pluginManager);
                var frameMsg = Protocol.MakeMessage(Protocol.AgentFrame, frame);
                _wsClient.Enqueue(frameMsg);

                // ── Send standings (2Hz = every 10th frame at 20Hz) ──

                // _tickCounter is incremented every 60Hz tick,
                // we process every 3rd → frame number = _tickCounter / 3
                // Every 10th frame = every 30th tick
                if (_tickCounter % 30 == 0)
                {
                    var standings = _standingsBuilder.Build(pluginManager, _lastGameData);
                    if (standings.Count > 0)
                    {
                        var standingsMsg = Protocol.MakeMessage(Protocol.AgentStandings, standings);
                        _wsClient.Enqueue(standingsMsg);
                    }
                }
            }
            catch (Exception ex)
            {
                SimHub.Logging.Current.Error($"[BPR] DataUpdate error: {ex.Message}");
            }
        }

        // ── IWPFSettingsV2 ───────────────────────────────────────────

        public Control GetWPFSettingsControl(PluginManager pluginManager)
        {
            _settingsControl = new SettingsControl(this, _settings, _wsClient, _updater, _joystickManager);
            return _settingsControl;
        }

        // ── Hello message ────────────────────────────────────────────

        private bool TrySendHello(PluginManager pm)
        {
            try
            {
                // Use SimHub's normalized GameData properties (reliable across versions)
                var nameObj = pm.GetPropertyValue("DataCorePlugin.GameData.PlayerName");
                string driverName = nameObj?.ToString();
                if (string.IsNullOrEmpty(driverName)) return false; // Not ready yet

                var carObj = pm.GetPropertyValue("DataCorePlugin.GameData.CarModel");
                string car = carObj?.ToString() ?? "Unknown";

                // Track info — try multiple known SimHub property paths
                string trackName = null;
                int trackId = 0;
                double trackLength = 0;

                // Path 1: GameData normalized properties
                var tn = pm.GetPropertyValue("DataCorePlugin.GameData.TrackName");
                if (tn != null) trackName = tn.ToString();

                // Path 2: Raw session data
                if (string.IsNullOrEmpty(trackName))
                {
                    tn = pm.GetPropertyValue("DataCorePlugin.GameRawData.SessionData.WeekendInfo.TrackDisplayName");
                    if (tn != null) trackName = tn.ToString();
                }

                // Path 3: Another common path
                if (string.IsNullOrEmpty(trackName))
                {
                    tn = pm.GetPropertyValue("DataCorePlugin.GameData.TrackId");
                    if (tn != null) trackName = tn.ToString();
                }

                if (string.IsNullOrEmpty(trackName)) return false; // Not ready yet

                // Track ID
                var tidObj = pm.GetPropertyValue("DataCorePlugin.GameRawData.SessionData.WeekendInfo.TrackID");
                if (tidObj != null) trackId = Convert.ToInt32(tidObj);

                // Track length
                var tlenObj = pm.GetPropertyValue("DataCorePlugin.GameRawData.SessionData.WeekendInfo.TrackLength");
                if (tlenObj != null)
                {
                    string trackLenStr = tlenObj.ToString();
                    var parts = trackLenStr.Split(' ');
                    if (parts.Length > 0) double.TryParse(parts[0], out trackLength);
                }

                // Build and send hello
                var payload = new
                {
                    driverName,
                    car,
                    trackId,
                    trackName,
                    trackLength,
                };
                var msg = Protocol.MakeMessage(Protocol.AgentHello, payload);
                _wsClient.Enqueue(msg);

                SimHub.Logging.Current.Info($"[BPR] Hello sent: {driverName} | {car} | {trackName}");
                return true;
            }
            catch (Exception ex)
            {
                SimHub.Logging.Current.Error($"[BPR] Hello failed: {ex.Message}");
                return false;
            }
        }

        // ── Server message handling ──────────────────────────────────

        private void HandleServerMessage(string type, JObject payload)
        {
            try
            {
                switch (type)
                {
                    case Protocol.ServerPenalty:
                        var penaltyType = payload["type"]?.ToString() ?? "unknown";
                        var timeSeconds = payload["timeSeconds"]?.ToObject<int?>();
                        var notes = payload["notes"]?.ToString();

                        PluginManager.SetPropertyValue("BPRRaceControl.LastPenalty",
                            this.GetType(), penaltyType);

                        SimHub.Logging.Current.Info(
                            $"[BPR] PENALTY: {penaltyType} | {notes}");

                        if (_settings.ShowPenaltyOverlay)
                        {
                            Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                                NotificationOverlay.ShowPenalty(penaltyType, timeSeconds, notes)));
                        }
                        break;

                    case Protocol.ServerUnderInvestigation:
                        var invNotes = payload["notes"]?.ToString();

                        PluginManager.SetPropertyValue("BPRRaceControl.UnderInvestigation",
                            this.GetType(), true);

                        SimHub.Logging.Current.Info($"[BPR] UNDER INVESTIGATION: {invNotes}");

                        if (_settings.ShowInvestigationOverlay)
                        {
                            Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                                NotificationOverlay.ShowInvestigation(invNotes)));
                        }
                        break;

                    case Protocol.ServerMessage:
                        var message = payload["message"]?.ToString();

                        PluginManager.SetPropertyValue("BPRRaceControl.LastRCMessage",
                            this.GetType(), message ?? "");

                        SimHub.Logging.Current.Info($"[BPR] RC MESSAGE: {message}");

                        if (_settings.ShowRCMessageOverlay)
                        {
                            Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                                NotificationOverlay.ShowRaceControlMessage(message)));
                        }
                        break;

                    case Protocol.ServerProtestAck:
                        var ackMsg = payload["message"]?.ToString();

                        SimHub.Logging.Current.Info($"[BPR] PROTEST ACK: {ackMsg}");

                        Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                            NotificationOverlay.ShowProtestAck(ackMsg)));
                        break;
                }
            }
            catch (Exception ex)
            {
                SimHub.Logging.Current.Error($"[BPR] Message handling error: {ex.Message}");
            }
        }

        private void OnConnectionChanged(bool connected)
        {
            PluginManager?.SetPropertyValue("BPRRaceControl.Connected",
                this.GetType(), connected);

            if (!connected)
            {
                _state = _wasGameRunning ? AgentState.WaitingForSession : AgentState.Idle;
            }

            // Update settings UI if available
            _settingsControl?.UpdateConnectionStatus(connected);
        }

        // ── Protest / Report Incident ────────────────────────────────

        /// <summary>
        /// Send a driver protest. 10-second cooldown (matching launcher.py).
        /// Can be called from settings UI or bound to a SimHub action/key.
        /// </summary>
        public void SendProtest()
        {
            if (!_wsClient.IsConnected) return;

            // 10-second cooldown
            if ((DateTime.Now - _lastProtestTime).TotalSeconds < 10)
                return;

            _lastProtestTime = DateTime.Now;

            var msg = Protocol.MakeMessage(Protocol.AgentProtest, new
            {
                reason = "Driver-reported incident"
            });
            _wsClient.Enqueue(msg);

            PluginManager?.SetPropertyValue("BPRRaceControl.ProtestCooldown",
                this.GetType(), true);

            SimHub.Logging.Current.Info("[BPR] Protest sent");

            // Clear cooldown after 10 seconds
            System.Threading.Tasks.Task.Delay(10000).ContinueWith(t =>
            {
                PluginManager?.SetPropertyValue("BPRRaceControl.ProtestCooldown",
                    this.GetType(), false);
            });
        }

        // ── Public methods for settings UI ───────────────────────────

        public void Connect()
        {
            _wsClient.Start(_settings.ServerUrl);
            _state = _wasGameRunning ? AgentState.WaitingForSession : AgentState.Idle;
        }

        public void Disconnect()
        {
            _wsClient.Stop();
            _state = AgentState.Idle;
        }

        public void SaveSettings()
        {
            this.SaveCommonSettings("GeneralSettings", _settings);
        }

        /// <summary>
        /// Re-register the protest hotkey after settings change.
        /// Called from SettingsControl when the user changes the hotkey.
        /// </summary>
        public void ReregisterHotkey()
        {
            UnregisterProtestHotkey();
            RegisterProtestHotkey();
        }

        // ── Global hotkey ────────────────────────────────────────────

        private void RegisterProtestHotkey()
        {
            try
            {
                Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                {
                    try
                    {
                        var window = Application.Current?.MainWindow;
                        if (window == null) return;

                        var helper = new WindowInteropHelper(window);
                        if (helper.Handle == IntPtr.Zero)
                        {
                            // Window not ready yet, defer
                            window.SourceInitialized += (s, e) => RegisterProtestHotkey();
                            return;
                        }

                        _hwndSource = HwndSource.FromHwnd(helper.Handle);
                        _hwndSource?.AddHook(HwndHook);

                        ParseHotkey(_settings.ProtestHotkey, out uint mod, out uint vk);
                        if (vk != 0)
                        {
                            RegisterHotKey(helper.Handle, HOTKEY_ID_PROTEST, mod, vk);
                            SimHub.Logging.Current.Info("[BPR] Hotkey registered: " + _settings.ProtestHotkey);
                        }
                    }
                    catch (Exception ex)
                    {
                        SimHub.Logging.Current.Error("[BPR] Hotkey registration failed: " + ex.Message);
                    }
                }));
            }
            catch { }
        }

        private void UnregisterProtestHotkey()
        {
            try
            {
                Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                {
                    try
                    {
                        var window = Application.Current?.MainWindow;
                        if (window == null) return;
                        var helper = new WindowInteropHelper(window);
                        if (helper.Handle != IntPtr.Zero)
                        {
                            UnregisterHotKey(helper.Handle, HOTKEY_ID_PROTEST);
                        }
                        _hwndSource?.RemoveHook(HwndHook);
                    }
                    catch { }
                }));
            }
            catch { }
        }

        private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (msg == WM_HOTKEY && wParam.ToInt32() == HOTKEY_ID_PROTEST)
            {
                SendProtest();
                handled = true;
            }
            return IntPtr.Zero;
        }

        /// <summary>
        /// Parse a hotkey string like "F1", "Ctrl+F1", "Shift+F5" into
        /// modifier flags and virtual key code.
        /// </summary>
        private static void ParseHotkey(string hotkey, out uint modifiers, out uint vk)
        {
            modifiers = 0;
            vk = 0;
            if (string.IsNullOrEmpty(hotkey)) return;

            var parts = hotkey.ToUpper().Split('+');
            foreach (var part in parts)
            {
                var p = part.Trim();
                switch (p)
                {
                    case "CTRL": case "CONTROL": modifiers |= 0x0002; break;
                    case "ALT": modifiers |= 0x0001; break;
                    case "SHIFT": modifiers |= 0x0004; break;

                    // Function keys
                    case "F1": vk = 0x70; break;
                    case "F2": vk = 0x71; break;
                    case "F3": vk = 0x72; break;
                    case "F4": vk = 0x73; break;
                    case "F5": vk = 0x74; break;
                    case "F6": vk = 0x75; break;
                    case "F7": vk = 0x76; break;
                    case "F8": vk = 0x77; break;
                    case "F9": vk = 0x78; break;
                    case "F10": vk = 0x79; break;
                    case "F11": vk = 0x7A; break;
                    case "F12": vk = 0x7B; break;

                    // Common keys
                    case "INSERT": case "INS": vk = 0x2D; break;
                    case "DELETE": case "DEL": vk = 0x2E; break;
                    case "HOME": vk = 0x24; break;
                    case "END": vk = 0x23; break;
                    case "PAGEUP": case "PGUP": vk = 0x21; break;
                    case "PAGEDOWN": case "PGDN": vk = 0x22; break;

                    // Numpad
                    case "NUM0": vk = 0x60; break;
                    case "NUM1": vk = 0x61; break;
                    case "NUM2": vk = 0x62; break;
                    case "NUM3": vk = 0x63; break;
                    case "NUM4": vk = 0x64; break;
                    case "NUM5": vk = 0x65; break;
                    case "NUM6": vk = 0x66; break;
                    case "NUM7": vk = 0x67; break;
                    case "NUM8": vk = 0x68; break;
                    case "NUM9": vk = 0x69; break;

                    default:
                        // Single letter/number (A-Z, 0-9)
                        if (p.Length == 1)
                        {
                            char c = p[0];
                            if (c >= 'A' && c <= 'Z') vk = (uint)c;
                            else if (c >= '0' && c <= '9') vk = (uint)c;
                        }
                        break;
                }
            }
        }
    }
}

