using System;
using System.Windows;
using System.Windows.Controls;
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

        private AgentState _state = AgentState.Idle;
        private int _tickCounter;
        private bool _wasGameRunning;
        private DateTime _lastProtestTime = DateTime.MinValue;

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

            SimHub.Logging.Current.Info("[BPR] Plugin initialized");
        }

        public void End(PluginManager pluginManager)
        {
            _wsClient?.Dispose();
            this.SaveCommonSettings("GeneralSettings", _settings);
            SimHub.Logging.Current.Info("[BPR] Plugin shutdown");
        }

        // ── IDataPlugin ──────────────────────────────────────────────

        private GameData _lastGameData;

        public void DataUpdate(PluginManager pluginManager, ref GameData data)
        {
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
            _settingsControl = new SettingsControl(this, _settings, _wsClient, _updater);
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

                        // Show overlay on UI thread
                        Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                            NotificationOverlay.ShowPenalty(penaltyType, timeSeconds, notes)));
                        break;

                    case Protocol.ServerUnderInvestigation:
                        var invNotes = payload["notes"]?.ToString();

                        PluginManager.SetPropertyValue("BPRRaceControl.UnderInvestigation",
                            this.GetType(), true);

                        SimHub.Logging.Current.Info($"[BPR] UNDER INVESTIGATION: {invNotes}");

                        Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                            NotificationOverlay.ShowInvestigation(invNotes)));
                        break;

                    case Protocol.ServerMessage:
                        var message = payload["message"]?.ToString();

                        PluginManager.SetPropertyValue("BPRRaceControl.LastRCMessage",
                            this.GetType(), message ?? "");

                        SimHub.Logging.Current.Info($"[BPR] RC MESSAGE: {message}");

                        Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
                            NotificationOverlay.ShowRaceControlMessage(message)));
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
    }
}
