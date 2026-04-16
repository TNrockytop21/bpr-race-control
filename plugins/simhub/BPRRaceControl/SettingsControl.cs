using System;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace BPRRaceControl
{
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

            Background = Brush("#060608");
            BuildUI();
            UpdateConnectionStatus(_wsClient.IsConnected);

            if (_updater != null)
            {
                _updater.OnUpdateCheckComplete += () =>
                    Dispatcher.BeginInvoke(new Action(RefreshUpdateBanner));
                _updater.OnDownloadComplete += (success, error) =>
                {
                    if (!success)
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            _updateText.Text = "Update failed: " + error;
                            _updateButton.Content = "Retry";
                            _updateButton.IsEnabled = true;
                        }));
                };
                RefreshUpdateBanner();
            }
        }

        private void BuildUI()
        {
            var scroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            };

            var root = new StackPanel { Margin = new Thickness(24, 16, 24, 24) };

            // ═══════════════════════════════════════════════════════════
            // HEADER — Logo + title + version
            // ═══════════════════════════════════════════════════════════
            var headerCard = Card();
            var headerStack = new StackPanel();

            // Logo image
            try
            {
                var asmDir = System.IO.Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                var logoPath = System.IO.Path.Combine(asmDir, "bpr-logo.png");
                if (File.Exists(logoPath))
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.UriSource = new Uri(logoPath);
                    bitmap.DecodePixelWidth = 600;
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.EndInit();

                    var logoImage = new Image
                    {
                        Source = bitmap,
                        Width = 300,
                        HorizontalAlignment = HorizontalAlignment.Left,
                        Margin = new Thickness(0, 0, 0, 12),
                    };
                    headerStack.Children.Add(logoImage);
                }
            }
            catch { }

            // Title + subtitle row
            var titleRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 4) };
            titleRow.Children.Add(new TextBlock
            {
                Text = "RACE CONTROL",
                Foreground = Brush("#ffffff"),
                FontSize = 18,
                FontWeight = FontWeights.Bold,
            });
            titleRow.Children.Add(new Border
            {
                Background = Brush("#c8102e"),
                CornerRadius = new CornerRadius(2),
                Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(10, 2, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock
                {
                    Text = "LIVE",
                    Foreground = Brush("#ffffff"),
                    FontSize = 9,
                    FontWeight = FontWeights.Bold,
                },
            });
            headerStack.Children.Add(titleRow);

            headerStack.Children.Add(new TextBlock
            {
                Text = "SimHub Telemetry Agent  v" + (_updater != null ? _updater.CurrentVersion.ToString(3) : "1.0.0"),
                Foreground = Brush("#555555"),
                FontSize = 10,
                Margin = new Thickness(0, 0, 0, 0),
            });

            headerCard.Child = headerStack;
            root.Children.Add(headerCard);

            // ═══════════════════════════════════════════════════════════
            // UPDATE SECTION
            // ═══════════════════════════════════════════════════════════

            // Check for Updates button (inline, subtle)
            var checkRow = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 8, 0, 0),
            };
            var checkBtn = new Button
            {
                Content = "Check for Updates",
                Background = Brushes.Transparent,
                Foreground = Brush("#555555"),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0, 4, 0, 4),
                FontSize = 10,
                Cursor = System.Windows.Input.Cursors.Hand,
            };
            checkBtn.Click += (s, e) =>
            {
                checkBtn.Content = "Checking...";
                checkBtn.IsEnabled = false;
                _updater.OnUpdateCheckComplete += () =>
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        checkBtn.Content = _updater.UpdateAvailable ? "Update found!" : "Up to date";
                        checkBtn.IsEnabled = true;
                        RefreshUpdateBanner();
                    }));
                _updater.CheckForUpdateAsync();
            };
            checkRow.Children.Add(checkBtn);
            root.Children.Add(checkRow);

            // Update banner (hidden)
            _updateBanner = new Border
            {
                Background = Brush("#071a07"),
                BorderBrush = Brush("#22c55e"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(14),
                Margin = new Thickness(0, 10, 0, 0),
                Visibility = Visibility.Collapsed,
            };
            var updateStack = new StackPanel();
            _updateText = new TextBlock
            {
                Text = "Update available",
                Foreground = Brush("#22c55e"),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 10),
            };
            updateStack.Children.Add(_updateText);
            _updateButton = new Button
            {
                Content = "Install Update",
                Background = Brush("#22c55e"),
                Foreground = Brush("#000000"),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(20, 8, 20, 8),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
            };
            _updateButton.Click += UpdateButton_Click;
            updateStack.Children.Add(_updateButton);
            _updateBanner.Child = updateStack;
            root.Children.Add(_updateBanner);

            root.Children.Add(Spacer(20));

            // ═══════════════════════════════════════════════════════════
            // CONNECTION
            // ═══════════════════════════════════════════════════════════
            root.Children.Add(SectionLabel("CONNECTION"));

            var connCard = Card();
            var connStack = new StackPanel();

            // Status row
            var statusRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 12) };
            _statusDot = new Ellipse
            {
                Width = 10, Height = 10,
                Fill = Brush("#ef4444"),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            statusRow.Children.Add(_statusDot);
            _statusText = new TextBlock
            {
                Text = "Disconnected",
                Foreground = Brush("#888888"),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
            };
            statusRow.Children.Add(_statusText);
            connStack.Children.Add(statusRow);

            // Server URL
            connStack.Children.Add(FieldLabel("SERVER URL"));
            _serverUrlInput = new TextBox
            {
                Text = _settings.ServerUrl,
                Background = Brush("#0a0a0c"),
                Foreground = Brush("#cccccc"),
                BorderBrush = Brush("#222222"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 8, 10, 8),
                FontSize = 12,
                FontFamily = new FontFamily("Consolas, Courier New"),
                CaretBrush = Brush("#cccccc"),
                Margin = new Thickness(0, 0, 0, 12),
            };
            _serverUrlInput.TextChanged += ServerUrl_Changed;
            connStack.Children.Add(_serverUrlInput);

            // Auto-connect + connect button row
            var connRow = new StackPanel { Orientation = Orientation.Horizontal };
            _connectButton = StyledButton("Connect", "#c8102e", "#ffffff");
            _connectButton.Click += ConnectButton_Click;
            connRow.Children.Add(_connectButton);

            _autoConnectCheck = new CheckBox
            {
                Content = "Auto-connect when iRacing starts",
                Foreground = Brush("#888888"),
                FontSize = 11,
                IsChecked = _settings.AutoConnect,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(16, 0, 0, 0),
            };
            _autoConnectCheck.Checked += AutoConnect_Changed;
            _autoConnectCheck.Unchecked += AutoConnect_Changed;
            connRow.Children.Add(_autoConnectCheck);

            connStack.Children.Add(connRow);
            connCard.Child = connStack;
            root.Children.Add(connCard);

            root.Children.Add(Spacer(20));

            // ═══════════════════════════════════════════════════════════
            // DRIVER ACTIONS
            // ═══════════════════════════════════════════════════════════
            root.Children.Add(SectionLabel("DRIVER ACTIONS"));

            var actionsCard = Card();
            var actionsStack = new StackPanel();

            var protestRow = new StackPanel { Orientation = Orientation.Horizontal };
            _protestButton = StyledButton("Report Incident", "#1a1a1a", "#ef4444");
            _protestButton.BorderBrush = Brush("#ef4444");
            _protestButton.BorderThickness = new Thickness(1);
            _protestButton.Click += ProtestButton_Click;
            protestRow.Children.Add(_protestButton);

            protestRow.Children.Add(new TextBlock
            {
                Text = "10s cooldown. Bind to a button in Controls and Events.",
                Foreground = Brush("#444444"),
                FontSize = 9,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 0, 0),
            });

            // Hotkey row
            actionsStack.Children.Add(Spacer(12));
            actionsStack.Children.Add(FieldLabel("PROTEST HOTKEY"));
            var hotkeyRow = new StackPanel { Orientation = Orientation.Horizontal };
            var hotkeyInput = new TextBox
            {
                Text = _settings.ProtestHotkey,
                Background = Brush("#0a0a0c"),
                Foreground = Brush("#cccccc"),
                BorderBrush = Brush("#222222"),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 6, 10, 6),
                FontSize = 12,
                FontFamily = new FontFamily("Consolas, Courier New"),
                CaretBrush = Brush("#cccccc"),
                Width = 140,
            };
            hotkeyInput.TextChanged += (s, e) =>
            {
                _settings.ProtestHotkey = hotkeyInput.Text;
                _plugin.SaveSettings();
                _plugin.ReregisterHotkey();
            };
            hotkeyRow.Children.Add(hotkeyInput);
            hotkeyRow.Children.Add(new TextBlock
            {
                Text = "e.g. F1, Ctrl+F5, Shift+F2",
                Foreground = Brush("#444444"),
                FontSize = 9,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(10, 0, 0, 0),
            });
            actionsStack.Children.Add(hotkeyRow);

            actionsStack.Children.Add(protestRow);
            actionsCard.Child = actionsStack;
            root.Children.Add(actionsCard);

            root.Children.Add(Spacer(20));

            // ═══════════════════════════════════════════════════════════
            // NOTIFICATIONS
            // ═══════════════════════════════════════════════════════════
            root.Children.Add(SectionLabel("NOTIFICATIONS"));

            var notifCard = Card();
            var notifStack = new StackPanel();

            var penaltyToggle = SettingsToggle("Penalty notifications",
                "Show overlay when a penalty is issued", _settings.ShowPenaltyOverlay);
            penaltyToggle.Checked += (s, e) => { _settings.ShowPenaltyOverlay = true; _plugin.SaveSettings(); };
            penaltyToggle.Unchecked += (s, e) => { _settings.ShowPenaltyOverlay = false; _plugin.SaveSettings(); };
            notifStack.Children.Add(penaltyToggle);

            notifStack.Children.Add(Spacer(8));

            var rcToggle = SettingsToggle("Race control messages",
                "Show overlay for steward broadcasts", _settings.ShowRCMessageOverlay);
            rcToggle.Checked += (s, e) => { _settings.ShowRCMessageOverlay = true; _plugin.SaveSettings(); };
            rcToggle.Unchecked += (s, e) => { _settings.ShowRCMessageOverlay = false; _plugin.SaveSettings(); };
            notifStack.Children.Add(rcToggle);

            notifStack.Children.Add(Spacer(8));

            var invToggle = SettingsToggle("Under investigation notices",
                "Show overlay when your incident is being reviewed", _settings.ShowInvestigationOverlay);
            invToggle.Checked += (s, e) => { _settings.ShowInvestigationOverlay = true; _plugin.SaveSettings(); };
            invToggle.Unchecked += (s, e) => { _settings.ShowInvestigationOverlay = false; _plugin.SaveSettings(); };
            notifStack.Children.Add(invToggle);

            notifCard.Child = notifStack;
            root.Children.Add(notifCard);

            root.Children.Add(Spacer(20));

            // ═══════════════════════════════════════════════════════════
            // SIMHUB PROPERTIES
            // ═══════════════════════════════════════════════════════════
            root.Children.Add(SectionLabel("SIMHUB PROPERTIES"));

            var propsCard = Card();
            var propsStack = new StackPanel();

            propsStack.Children.Add(new TextBlock
            {
                Text = "Use these in Dash Studio overlays or NCalc formulas:",
                Foreground = Brush("#555555"),
                FontSize = 10,
                Margin = new Thickness(0, 0, 0, 10),
            });

            var props = new string[]
            {
                "BPRRaceControl.Connected",
                "BPRRaceControl.LastPenalty",
                "BPRRaceControl.UnderInvestigation",
                "BPRRaceControl.LastRCMessage",
                "BPRRaceControl.ProtestCooldown",
            };

            foreach (var prop in props)
            {
                var propRow = new Border
                {
                    Background = Brush("#0a0a0c"),
                    CornerRadius = new CornerRadius(3),
                    Padding = new Thickness(10, 5, 10, 5),
                    Margin = new Thickness(0, 0, 0, 4),
                };
                propRow.Child = new TextBlock
                {
                    Text = prop,
                    Foreground = Brush("#d4a017"),
                    FontSize = 11,
                    FontFamily = new FontFamily("Consolas, Courier New"),
                };
                propsStack.Children.Add(propRow);
            }

            propsCard.Child = propsStack;
            root.Children.Add(propsCard);

            root.Children.Add(Spacer(16));

            // Footer
            root.Children.Add(new TextBlock
            {
                Text = "Bite Point Racing  |  bitepointracing.com  |  github.com/TNrockytop21/bpr-race-control",
                Foreground = Brush("#333333"),
                FontSize = 9,
                HorizontalAlignment = HorizontalAlignment.Center,
            });

            scroll.Content = root;
            Content = scroll;
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
                _connectButton.Background = Brush("#1a1a1a");
                _connectButton.Foreground = Brush("#888888");
                _connectButton.BorderBrush = Brush("#333333");
                _connectButton.BorderThickness = new Thickness(1);
            }
            else
            {
                _statusDot.Fill = Brush("#ef4444");
                _statusText.Text = "Disconnected";
                _statusText.Foreground = Brush("#888888");
                _connectButton.Content = "Connect";
                _connectButton.Background = Brush("#c8102e");
                _connectButton.Foreground = Brush("#ffffff");
                _connectButton.BorderThickness = new Thickness(0);
            }
        }

        // ── Event handlers ───────────────────────────────────────────

        private void ConnectButton_Click(object sender, RoutedEventArgs e)
        {
            if (_wsClient.IsConnected) _plugin.Disconnect();
            else _plugin.Connect();
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
                    "  (current: v" + _updater.CurrentVersion.ToString(3) + ")";
                _updateBanner.Visibility = Visibility.Visible;
            }
        }

        private void UpdateButton_Click(object sender, RoutedEventArgs e)
        {
            _updateButton.Content = "Downloading...";
            _updateButton.IsEnabled = false;
            _updater.DownloadAndApplyUpdate();
        }

        // ── UI Helpers ───────────────────────────────────────────────

        private static SolidColorBrush Brush(string hex)
        {
            return new SolidColorBrush((System.Windows.Media.Color)ColorConverter.ConvertFromString(hex));
        }

        private static System.Windows.Media.Color Color(byte r, byte g, byte b)
        {
            return System.Windows.Media.Color.FromRgb(r, g, b);
        }

        private static Border Card()
        {
            return new Border
            {
                Background = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x0d, 0x0d, 0x0f)),
                BorderBrush = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x1a, 0x1a, 0x1a)),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(16),
                Margin = new Thickness(0, 0, 0, 0),
            };
        }

        private static TextBlock SectionLabel(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x66, 0x66, 0x66)),
                FontSize = 9,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(2, 0, 0, 6),
            };
        }

        private static TextBlock FieldLabel(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0x55, 0x55, 0x55)),
                FontSize = 9,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 4),
            };
        }

        private static Button StyledButton(string text, string bgHex, string fgHex)
        {
            return new Button
            {
                Content = text,
                Background = new SolidColorBrush((System.Windows.Media.Color)ColorConverter.ConvertFromString(bgHex)),
                Foreground = new SolidColorBrush((System.Windows.Media.Color)ColorConverter.ConvertFromString(fgHex)),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(20, 8, 20, 8),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
            };
        }

        private static Border Spacer(double height)
        {
            return new Border { Height = height };
        }

        private static CheckBox SettingsToggle(string label, string description, bool isChecked)
        {
            var stack = new StackPanel();
            stack.Children.Add(new TextBlock
            {
                Text = label,
                Foreground = Brush("#cccccc"),
                FontSize = 12,
            });
            stack.Children.Add(new TextBlock
            {
                Text = description,
                Foreground = Brush("#444444"),
                FontSize = 9,
                Margin = new Thickness(0, 2, 0, 0),
            });

            return new CheckBox
            {
                Content = stack,
                IsChecked = isChecked,
                Foreground = Brush("#cccccc"),
                VerticalContentAlignment = VerticalAlignment.Center,
            };
        }
    }
}
