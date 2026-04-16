using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace BPRRaceControl
{
    /// <summary>
    /// Manages a websocket connection on a background thread.
    /// Thread-safe enqueue from SimHub's DataUpdate; async send/receive in background.
    /// Auto-reconnects with 3-second backoff (matching Python agent).
    /// </summary>
    public class WebSocketClient : IDisposable
    {
        private const int ReconnectDelayMs = 3000;
        private const int MaxQueueSize = 100;
        private const int ReceiveBufferSize = 4096;

        private readonly ConcurrentQueue<string> _sendQueue = new ConcurrentQueue<string>();
        private CancellationTokenSource _cts;
        private Task _runTask;
        private volatile bool _isConnected;
        private string _serverUrl;

        /// <summary>True when the websocket is open and ready.</summary>
        public bool IsConnected => _isConnected;

        /// <summary>Raised on the background thread when a server message arrives.</summary>
        public event Action<string, JObject> OnServerMessage;

        /// <summary>Raised when connection state changes.</summary>
        public event Action<bool> OnConnectionChanged;

        /// <summary>
        /// Start the background connection loop. Non-blocking.
        /// </summary>
        public void Start(string serverUrl)
        {
            Stop();
            _serverUrl = serverUrl;
            _cts = new CancellationTokenSource();
            _runTask = Task.Run(() => ConnectionLoop(_cts.Token));
        }

        /// <summary>
        /// Stop the background connection loop and disconnect.
        /// </summary>
        public void Stop()
        {
            _cts?.Cancel();
            try { _runTask?.Wait(2000); } catch { }
            _cts?.Dispose();
            _cts = null;
            _runTask = null;
            _isConnected = false;
        }

        /// <summary>
        /// Enqueue a JSON message for sending. Thread-safe, O(1), never blocks.
        /// Drops oldest messages if the queue exceeds MaxQueueSize.
        /// </summary>
        public void Enqueue(string jsonMessage)
        {
            _sendQueue.Enqueue(jsonMessage);

            // Overflow protection: drop oldest if queue is too large
            while (_sendQueue.Count > MaxQueueSize)
            {
                _sendQueue.TryDequeue(out _);
            }
        }

        private async Task ConnectionLoop(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                ClientWebSocket ws = null;
                try
                {
                    ws = new ClientWebSocket();
                    await ws.ConnectAsync(new Uri(_serverUrl), ct);
                    _isConnected = true;
                    OnConnectionChanged?.Invoke(true);

                    // Run send and receive concurrently
                    var sendTask = SendLoop(ws, ct);
                    var recvTask = ReceiveLoop(ws, ct);
                    await Task.WhenAny(sendTask, recvTask);

                    // If either exits, cancel the other via close
                    if (ws.State == WebSocketState.Open)
                    {
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None);
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception)
                {
                    // Connection lost — will reconnect
                }
                finally
                {
                    _isConnected = false;
                    OnConnectionChanged?.Invoke(false);
                    ws?.Dispose();
                }

                if (!ct.IsCancellationRequested)
                {
                    try { await Task.Delay(ReconnectDelayMs, ct); }
                    catch (OperationCanceledException) { break; }
                }
            }
        }

        private async Task SendLoop(ClientWebSocket ws, CancellationToken ct)
        {
            while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                bool sentAny = false;
                while (_sendQueue.TryDequeue(out var msg))
                {
                    var bytes = Encoding.UTF8.GetBytes(msg);
                    await ws.SendAsync(
                        new ArraySegment<byte>(bytes),
                        WebSocketMessageType.Text,
                        true,
                        ct);
                    sentAny = true;
                }

                if (!sentAny)
                {
                    await Task.Delay(1, ct); // Yield to prevent spin-wait
                }
            }
        }

        private async Task ReceiveLoop(ClientWebSocket ws, CancellationToken ct)
        {
            var buffer = new byte[ReceiveBufferSize];
            var sb = new StringBuilder();

            while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                sb.Clear();
                WebSocketReceiveResult result;
                do
                {
                    result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                    if (result.MessageType == WebSocketMessageType.Close)
                        return;

                    sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                } while (!result.EndOfMessage);

                var json = sb.ToString();
                if (string.IsNullOrEmpty(json)) continue;

                try
                {
                    var (type, payload) = Protocol.ParseMessage(json);
                    OnServerMessage?.Invoke(type, payload);
                }
                catch
                {
                    // Ignore malformed messages
                }
            }
        }

        public void Dispose()
        {
            Stop();
        }
    }
}
