using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace BPRRaceControl
{
    /// <summary>
    /// WPF settings panel for the BPR Race Control plugin.
    /// Built in pure C# (no XAML) so it can compile with csc.exe directly.
    /// </summary>
    public class SettingsControl : UserControl
    {
        private readonly BPRRaceControlPlugin _plugin;
        private readonly PluginSettings _settings;
        private readonly WebSocketClient _wsClient;

        private PluginUpdater _updater;

        private Ellipse _statusDot;
        private TextBlock _statusText;
        private Button _connectButton;
        private TextBox _serverUrlInput;
        private CheckBox _autoConnectCheck;
        private Button _protestButton;

        // Update UI elements
        private Border _updateBanner;
        private TextBlock _updateText;
        private Button _updateButton;

        public SettingsControl(BPRRaceControlPlugin plugin, PluginSettings settings,
            WebSocketClient wsClient, PluginUpdater updater)
        {
            _plugin = plugin;
            _settings = settings;
            _wsClient = wsClient;
            _updater = updater;

            Background = new SolidColorBrush(Color(0x0d, 0x0d, 0x0f));
            BuildUI();
            UpdateConnectionStatus(_wsClient.IsConnected);

            // Subscribe to update events
            if (_updater != null)
            {
                _updater.OnUpdateCheckComplete += () =>
                {
                    Dispatcher.BeginInvoke(new Action(RefreshUpdateBanner));
                };
                _updater.OnDownloadComplete += (success, error) =>
                {
                    if (!success)
                    {
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            _updateText.Text = "Update failed: " + error;
                            _updateButton.Content = "Retry";
                            _updateButton.IsEnabled = true;
                        }));
                    }
                };
                // Show banner if update was already detected before settings opened
                RefreshUpdateBanner();
            }
        }

        private void BuildUI()
        {
            var root = new StackPanel { Margin = new Thickness(20) };

            // ── Header ───────────────────────────────────────────────
            root.Children.Add(new TextBlock
            {
                Text = "BPR RACE CONTROL",
                Foreground = Brush("#c8102e"),
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 4),
            });
            root.Children.Add(new TextBlock
            {
                Text = "SimHub Agent Plugin  v" + (_updater != null ? _updater.CurrentVersion.ToString(3) : "1.0.0"),
                Foreground = Brush("#666666"),
                FontSize = 11,
                Margin = new Thickness(0, 0, 0, 12),
            });

            // ── Check for Updates button ─────────────────────────────
            var _checkUpdateButton = new Button
            {
                Content = "Check for Updates",
                Background = Brush("#1a1a1a"),
                Foreground = Brush("#888888"),
                BorderBrush = Brush("#2a2a2a"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(12, 6, 12, 6),
                FontSize = 10,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 0, 0, 16),
            };
            _checkUpdateButton.Click += (s, e) =>
            {
                _checkUpdateButton.Content = "Checking...";
                _checkUpdateButton.IsEnabled = false;
                _updater.OnUpdateCheckComplete += () =>
                {
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        _checkUpdateButton.Content = _updater.UpdateAvailable
                            ? "Update found!"
                            : "Up to date";
                        _checkUpdateButton.IsEnabled = true;
                        RefreshUpdateBanner();
                    }));
                };
                _updater.CheckForUpdateAsync();
            };
            root.Children.Add(_checkUpdateButton);

            // ── Update banner (hidden by default) ────────────────────
            _updateBanner = new Border
            {
                Background = Brush("#0a1a0a"),
                BorderBrush = Brush("#22c55e"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 16),
                Visibility = Visibility.Collapsed,
            };
            var updateStack = new StackPanel();
            _updateText = new TextBlock
            {
                Text = "Update available",
                Foreground = Brush("#22c55e"),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 8),
            };
            updateStack.Children.Add(_updateText);
            _updateButton = new Button
            {
                Content = "Install Update",
                Background = Brush("#22c55e"),
                Foreground = Brush("#000000"),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(16, 8, 16, 8),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
            };
            _updateButton.Click += UpdateButton_Click;
            updateStack.Children.Add(_updateButton);
            _updateBanner.Child = updateStack;
            root.Children.Add(_updateBanner);

            // ── Connection status ────────────────────────────────────
            var statusBorder = new Border
            {
                Background = Brush("#111111"),
                BorderBrush = Brush("#1a1a1a"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(12),
                Margin = new Thickness(0, 0, 0, 16),
            };
            var statusStack = new StackPanel();

            var statusRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
            _statusDot = new Ellipse
            {
                Width = 8, Height = 8,
                Fill = Brush("#ef4444"),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            statusRow.Children.Add(_statusDot);
            _statusText = new TextBlock
            {
                Text = "Disconnected",
                Foreground = Brush("#888888"),
                FontSize = 12,
            };
            statusRow.Children.Add(_statusText);
            statusStack.Children.Add(statusRow);

            _connectButton = new Button
            {
                Content = "Connect",
                Background = Brush("#1a1a1a"),
                Foreground = Brush("#cccccc"),
                BorderBrush = Brush("#2a2a2a"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(16, 8, 16, 8),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
            };
            _connectButton.Click += ConnectButton_Click;
            statusStack.Children.Add(_connectButton);

            statusBorder.Child = statusStack;
            root.Children.Add(statusBorder);

            // ── Server URL ───────────────────────────────────────────
            root.Children.Add(Label("SERVER URL"));
            _serverUrlInput = new TextBox
            {
                Text = _settings.ServerUrl,
                Background = Brush("#1a1a1a"),
                Foreground = Brush("#cccccc"),
                BorderBrush = Brush("#2a2a2a"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 6, 8, 6),
                FontSize = 13,
                CaretBrush = Brush("#cccccc"),
                Margin = new Thickness(0, 0, 0, 16),
            };
            _serverUrlInput.TextChanged += ServerUrl_Changed;
            root.Children.Add(_serverUrlInput);

            // ── Auto-Connect ─────────────────────────────────────────
            _autoConnectCheck = new CheckBox
            {
                Content = "Auto-connect when iRacing starts",
                Foreground = Brush("#cccccc"),
                FontSize = 12,
                IsChecked = _settings.AutoConnect,
                Margin = new Thickness(0, 0, 0, 20),
            };
            _autoConnectCheck.Checked += AutoConnect_Changed;
            _autoConnectCheck.Unchecked += AutoConnect_Changed;
            root.Children.Add(_autoConnectCheck);

            // ── Separator ────────────────────────────────────────────
            root.Children.Add(Separator());

            // ── Report Incident ──────────────────────────────────────
            root.Children.Add(Label("DRIVER ACTIONS"));
            _protestButton = new Button
            {
                Content = "Report Incident",
                Background = Brush("#1a1a1a"),
                Foreground = Brush("#ef4444"),
                BorderBrush = Brush("#ef4444"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(16, 8, 16, 8),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 0, 0, 8),
            };
            _protestButton.Click += ProtestButton_Click;
            root.Children.Add(_protestButton);

            root.Children.Add(new TextBlock
            {
                Text = "10-second cooldown between reports. Bind to a button in Controls and Events.",
                Foreground = Brush("#555555"),
                FontSize = 9,
                Margin = new Thickness(0, 0, 0, 20),
            });

            // ── Separator ────────────────────────────────────────────
            root.Children.Add(Separator());

            // ── Exposed properties info ──────────────────────────────
            root.Children.Add(Label("EXPOSED SIMHUB PROPERTIES"));
            var propsText = new TextBlock
            {
                Foreground = Brush("#666666"),
                FontSize = 10,
                TextWrapping = TextWrapping.Wrap,
                LineHeight = 18,
                Text = "BPRRaceControl.Connected\n" +
                       "BPRRaceControl.LastPenalty\n" +
                       "BPRRaceControl.UnderInvestigation\n" +
                       "BPRRaceControl.LastRCMessage\n" +
                       "BPRRaceControl.ProtestCooldown",
            };
            root.Children.Add(propsText);

            Content = root;
        }

        // ── Public ───────────────────────────────────────────────────

        public void UpdateConnectionStatus(bool connected)
        {
            if (!Dispatcher.CheckAccess())
            {
                Dispatcher.BeginInvoke(new Action(() => UpdateConnectionStatus(connected)));
                return;
            }

            if (connected)
            {
                _statusDot.Fill = Brush("#22c55e");
                _statusText.Text = "Connected";
                _statusText.Foreground = Brush("#22c55e");
                _connectButton.Content = "Disconnect";
            }
            else
            {
                _statusDot.Fill = Brush("#ef4444");
                _statusText.Text = "Disconnected";
                _statusText.Foreground = Brush("#888888");
                _connectButton.Content = "Connect";
            }
        }

        // ── Event handlers ───────────────────────────────────────────

        private void ConnectButton_Click(object sender, RoutedEventArgs e)
        {
            if (_wsClient.IsConnected)
                _plugin.Disconnect();
            else
                _plugin.Connect();
        }

        private void ServerUrl_Changed(object sender, TextChangedEventArgs e)
        {
            if (_settings != null)
            {
                _settings.ServerUrl = _serverUrlInput.Text;
                _plugin.SaveSettings();
            }
        }

        private void AutoConnect_Changed(object sender, RoutedEventArgs e)
        {
            if (_settings != null)
            {
                _settings.AutoConnect = _autoConnectCheck.IsChecked == true;
                _plugin.SaveSettings();
            }
        }

        private void ProtestButton_Click(object sender, RoutedEventArgs e)
        {
            _plugin.SendProtest();

            _protestButton.Content = "Reported!";
            _protestButton.IsEnabled = false;

            var timer = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(10)
            };
            timer.Tick += (s, args) =>
            {
                timer.Stop();
                _protestButton.Content = "Report Incident";
                _protestButton.IsEnabled = true;
            };
            timer.Start();
        }

        // ── Update UI ────────────────────────────────────────────────

        private void RefreshUpdateBanner()
        {
            if (_updater == null) return;
            if (!Dispatcher.CheckAccess())
            {
                Dispatcher.BeginInvoke(new Action(RefreshUpdateBanner));
                return;
            }

            if (_updater.UpdateAvailable)
            {
                _updateText.Text = "Update available: v" + _updater.LatestVersion +
                    " (current: v" + _updater.CurrentVersion.ToString(3) + ")";
                _updateBanner.Visibility = Visibility.Visible;
            }
        }

        private void UpdateButton_Click(object sender, RoutedEventArgs e)
        {
            _updateButton.Content = "Downloading...";
            _updateButton.IsEnabled = false;
            _updater.DownloadAndApplyUpdate();
        }

        // ── Helpers ──────────────────────────────────────────────────

        private static SolidColorBrush Brush(string hex)
        {
            return new SolidColorBrush((System.Windows.Media.Color)ColorConverter.ConvertFromString(hex));
        }

        private static System.Windows.Media.Color Color(byte r, byte g, byte b)
        {
            return System.Windows.Media.Color.FromRgb(r, g, b);
        }

        private static TextBlock Label(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = Brush("#888888"),
                FontSize = 10,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 4),
            };
        }

        private static Border Separator()
        {
            return new Border
            {
                Background = Brush("#1a1a1a"),
                Height = 1,
                Margin = new Thickness(0, 0, 0, 20),
            };
        }
    }
}
