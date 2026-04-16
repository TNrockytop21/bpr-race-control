using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace BPRRaceControl
{
    /// <summary>
    /// Message type constants and JSON helpers.
    /// Mirrors agent/protocol.py and apps/server/src/protocol.js exactly.
    /// </summary>
    public static class Protocol
    {
        // Agent → Server
        public const string AgentHello = "agent:hello";
        public const string AgentFrame = "agent:frame";
        public const string AgentStandings = "agent:standings";
        public const string AgentLapComplete = "agent:lapComplete";
        public const string AgentSessionInfo = "agent:sessionInfo";
        public const string AgentProtest = "agent:protest";

        // Server → Agent
        public const string ServerPenalty = "server:penalty";
        public const string ServerUnderInvestigation = "server:underInvestigation";
        public const string ServerMessage = "server:message";
        public const string ServerProtestAck = "server:protestAck";

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            Formatting = Formatting.None,
        };

        /// <summary>
        /// Build a JSON message envelope: {"type":"...", "payload":{...}}
        /// Matches the Python agent's make_message() exactly.
        /// </summary>
        public static string MakeMessage(string type, object payload)
        {
            var envelope = new JObject
            {
                ["type"] = type,
                ["payload"] = JToken.FromObject(payload, JsonSerializer.Create(JsonSettings)),
            };
            return envelope.ToString(Formatting.None);
        }

        /// <summary>
        /// Parse an incoming server message into type + payload.
        /// </summary>
        public static (string type, JObject payload) ParseMessage(string json)
        {
            var obj = JObject.Parse(json);
            var type = obj["type"]?.ToString() ?? "";
            var payload = obj["payload"] as JObject ?? new JObject();
            return (type, payload);
        }
    }
}
