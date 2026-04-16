namespace BPRRaceControl
{
    /// <summary>
    /// Persisted plugin settings. SimHub serializes this to JSON automatically.
    /// </summary>
    public class PluginSettings
    {
        /// <summary>WebSocket server URL (matches config.py SERVER_URL).</summary>
        public string ServerUrl { get; set; } = "ws://45.55.216.21/ws/agent";

        /// <summary>Auto-connect when iRacing session is detected.</summary>
        public bool AutoConnect { get; set; } = true;
    }
}
