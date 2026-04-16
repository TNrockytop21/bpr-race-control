namespace BPRRaceControl
{
    /// <summary>
    /// Persisted plugin settings. SimHub serializes this to JSON automatically.
    /// </summary>
    public class PluginSettings
    {
        /// <summary>WebSocket server URL.</summary>
        public string ServerUrl { get; set; } = "ws://45.55.216.21/ws/agent";

        /// <summary>Auto-connect when iRacing session is detected.</summary>
        public bool AutoConnect { get; set; } = true;

        // ── Notification toggles ─────────────────────────────────────

        /// <summary>Show penalty overlay notifications.</summary>
        public bool ShowPenaltyOverlay { get; set; } = true;

        /// <summary>Show race control message overlays.</summary>
        public bool ShowRCMessageOverlay { get; set; } = true;

        /// <summary>Show "Under Investigation" overlays.</summary>
        public bool ShowInvestigationOverlay { get; set; } = true;

        // ── Protest hotkey ────────────────────────────────────────────

        /// <summary>Keyboard shortcut for Report Incident (e.g. "F1", "Ctrl+F1", "F5").</summary>
        public string ProtestHotkey { get; set; } = "F1";
    }
}
