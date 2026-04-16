using System;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using Path = System.IO.Path;

namespace BPRRaceControl
{
    public class SettingsControl : UserControl
    {
        private readonly BPRRaceControlPlugin _plugin;
        private readonly PluginSettings _settings;
        private readonly WebSocketClient _wsClient;
        private PluginUpdater _updater;
        private JoystickManager _joystickManager;

        private Ellipse _statusDot;
        private TextBlock _statusText;
        private Button _connectButton;
        private TextBox _serverUrlInput;
        private CheckBox _autoConnectCheck;
        private Button _protestButton;
        private Border _updateBanner;
        private TextBlock _updateText;
        private Button _updateButton;

        // ── Color palette ────────────────────────────────────────────
        static readonly string BG = "#0a0a0e";
        static readonly string CARD = "#111116";
        static readonly string CARD_BORDER = "#252530";
        static readonly string INPUT_BG = "#0d0d12";
        static readonly string INPUT_BORDER = "#2a2a35";
        static readonly string TEXT_PRIMARY = "#f0f0f0";
        static readonly string TEXT_SECONDARY = "#bbbbbb";
        static readonly string TEXT_DIM = "#888888";
        static readonly string TEXT_MUTED = "#666666";
        static readonly string ACCENT_RED = "#c8102e";
        static readonly string ACCENT_GOLD = "#d4a017";
        static readonly string ACCENT_GREEN = "#22c55e";
        static readonly string ACCENT_BLUE = "#378add";
        static readonly string DANGER = "#ef4444";
        static readonly string SECTION_BG = "#0e0e14";

        public SettingsControl(BPRRaceControlPlugin plugin, PluginSettings settings,
            WebSocketClient wsClient, PluginUpdater updater, JoystickManager joystickManager)
        {
            _plugin = plugin;
            _settings = settings;
            _wsClient = wsClient;
            _updater = updater;
            _joystickManager = joystickManager;

            Background = Brush(BG);
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
                            _updateButton.Content = "RETRY";
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

            var root = new StackPanel { Margin = new Thickness(0) };

            // ═══════════════════════════════════════════════════════════
            // HEADER BAR
            // ═══════════════════════════════════════════════════════════
            var headerBar = new Border
            {
                Background = Brush(CARD),
                BorderBrush = Brush(CARD_BORDER),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(28, 20, 28, 20),
            };
            var headerRow = new StackPanel { Orientation = Orientation.Horizontal };

            // Logo (compact)
            try
            {
                var asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                var logoPath = Path.Combine(asmDir, "bpr-logo.png");
                if (File.Exists(logoPath))
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.UriSource = new Uri(logoPath);
                    bitmap.DecodePixelHeight = 100;
                    bitmap.CacheOption = BitmapCacheOption.OnLoad;
                    bitmap.EndInit();

                    headerRow.Children.Add(new Image
                    {
                        Source = bitmap,
                        Height = 65,
                        Margin = new Thickness(0, 0, 20, 0),
                        VerticalAlignment = VerticalAlignment.Center,
                    });
                }
            }
            catch { }

            // Title block
            var titleStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            var titleRow = new StackPanel { Orientation = Orientation.Horizontal };
            titleRow.Children.Add(new TextBlock
            {
                Text = "RACE CONTROL",
                Foreground = Brush(TEXT_PRIMARY),
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
            });
            titleRow.Children.Add(new Border
            {
                Background = Brush(ACCENT_RED),
                CornerRadius = new CornerRadius(3),
                Padding = new Thickness(10, 3, 10, 3),
                Margin = new Thickness(14, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock
                {
                    Text = "LIVE",
                    Foreground = Brush("#ffffff"),
                    FontSize = 10,
                    FontWeight = FontWeights.Bold,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });
            titleStack.Children.Add(titleRow);

            var verStr = "v" + (_updater != null ? _updater.CurrentVersion.ToString(3) : "1.0.0");
            titleStack.Children.Add(new TextBlock
            {
                Text = "SimHub Telemetry Agent  " + verStr,
                Foreground = Brush(TEXT_DIM),
                FontSize = 12,
                Margin = new Thickness(0, 4, 0, 0),
            });
            headerRow.Children.Add(titleStack);
            headerBar.Child = headerRow;
            root.Children.Add(headerBar);

            // ── Content area ─────────────────────────────────────────
            var content = new StackPanel { Margin = new Thickness(28, 24, 28, 28) };

            // ═══════════════════════════════════════════════════════════
            // UPDATE BANNER (hidden by default)
            // ═══════════════════════════════════════════════════════════
            _updateBanner = new Border
            {
                Background = Brush("#071207"),
                BorderBrush = Brush(ACCENT_GREEN),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(16, 12, 16, 12),
                Margin = new Thickness(0, 0, 0, 16),
                Visibility = Visibility.Collapsed,
            };
            var updateRow = new StackPanel { Orientation = Orientation.Horizontal };
            _updateText = new TextBlock
            {
                Text = "Update available",
                Foreground = Brush(ACCENT_GREEN),
                FontSize = 15,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
            };
            updateRow.Children.Add(_updateText);
            _updateButton = ActionButton("INSTALL UPDATE", ACCENT_GREEN, "#000000");
            _updateButton.Margin = new Thickness(16, 0, 0, 0);
            _updateButton.Click += UpdateButton_Click;
            updateRow.Children.Add(_updateButton);
            _updateBanner.Child = updateRow;
            content.Children.Add(_updateBanner);

            // ═══════════════════════════════════════════════════════════
            // CONNECTION
            // ═══════════════════════════════════════════════════════════
            content.Children.Add(Section("CONNECTION"));

            var connCard = Card();
            var connGrid = new Grid();
            connGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            connGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            // Left side: status + URL
            var connLeft = new StackPanel();

            var statusRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 14) };
            _statusDot = new Ellipse
            {
                Width = 10, Height = 10,
                Fill = Brush(DANGER),
                Margin = new Thickness(0, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            statusRow.Children.Add(_statusDot);
            _statusText = new TextBlock
            {
                Text = "Disconnected",
                Foreground = Brush(TEXT_SECONDARY),
                FontSize = 16,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
            };
            statusRow.Children.Add(_statusText);
            connLeft.Children.Add(statusRow);

            connLeft.Children.Add(FieldLabel("SERVER"));
            _serverUrlInput = new TextBox
            {
                Text = _settings.ServerUrl,
                Background = Brush(INPUT_BG),
                Foreground = Brush(TEXT_PRIMARY),
                BorderBrush = Brush(INPUT_BORDER),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(12, 10, 12, 10),
                FontSize = 14,
                FontFamily = new FontFamily("Consolas"),
                CaretBrush = Brush(TEXT_PRIMARY),
                Margin = new Thickness(0, 0, 0, 12),
            };
            _serverUrlInput.TextChanged += ServerUrl_Changed;
            connLeft.Children.Add(_serverUrlInput);

            var connBtnRow = new StackPanel { Orientation = Orientation.Horizontal };
            _connectButton = ActionButton("CONNECT", ACCENT_RED, "#ffffff");
            _connectButton.Click += ConnectButton_Click;
            connBtnRow.Children.Add(_connectButton);

            _autoConnectCheck = new CheckBox
            {
                Content = "Auto-connect when iRacing starts",
                Foreground = Brush(TEXT_SECONDARY),
                FontSize = 13,
                IsChecked = _settings.AutoConnect,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(16, 0, 0, 0),
            };
            _autoConnectCheck.Checked += AutoConnect_Changed;
            _autoConnectCheck.Unchecked += AutoConnect_Changed;
            connBtnRow.Children.Add(_autoConnectCheck);
            connLeft.Children.Add(connBtnRow);

            Grid.SetColumn(connLeft, 0);
            connGrid.Children.Add(connLeft);
            connCard.Child = connGrid;
            content.Children.Add(connCard);

            content.Children.Add(Spacer(20));

            // ═══════════════════════════════════════════════════════════
            // INCIDENT REPORTING
            // ═══════════════════════════════════════════════════════════
            content.Children.Add(Section("INCIDENT REPORTING"));

            var actionsCard = Card();
            var actionsStack = new StackPanel();

            // Report button row
            var protestRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 16) };
            _protestButton = ActionButton("REPORT INCIDENT", "#1a1a1e", DANGER);
            _protestButton.BorderBrush = Brush(DANGER);
            _protestButton.BorderThickness = new Thickness(1);
            _protestButton.Click += ProtestButton_Click;
            protestRow.Children.Add(_protestButton);
            protestRow.Children.Add(new TextBlock
            {
                Text = "10 second cooldown between reports",
                Foreground = Brush(TEXT_DIM),
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(14, 0, 0, 0),
            });
            actionsStack.Children.Add(protestRow);

            // Two-column: Hotkey | Wheel binding
            var bindGrid = new Grid { Margin = new Thickness(0, 0, 0, 0) };
            bindGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            bindGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // Left: Keyboard hotkey
            var hotkeyPanel = new StackPanel { Margin = new Thickness(0, 0, 10, 0) };
            hotkeyPanel.Children.Add(FieldLabel("KEYBOARD SHORTCUT"));
            var hotkeyInput = new TextBox
            {
                Text = _settings.ProtestHotkey,
                Background = Brush(INPUT_BG),
                Foreground = Brush(TEXT_PRIMARY),
                BorderBrush = Brush(INPUT_BORDER),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(12, 10, 12, 10),
                FontSize = 14,
                FontFamily = new FontFamily("Consolas"),
                CaretBrush = Brush(TEXT_PRIMARY),
                Margin = new Thickness(0, 0, 0, 4),
            };
            hotkeyInput.TextChanged += (s, e) =>
            {
                _settings.ProtestHotkey = hotkeyInput.Text;
                _plugin.SaveSettings();
                _plugin.ReregisterHotkey();
            };
            hotkeyPanel.Children.Add(hotkeyInput);
            hotkeyPanel.Children.Add(new TextBlock
            {
                Text = "F1, Ctrl+F5, Shift+F2, etc.",
                Foreground = Brush(TEXT_MUTED),
                FontSize = 10,
            });
            Grid.SetColumn(hotkeyPanel, 0);
            bindGrid.Children.Add(hotkeyPanel);

            // Right: Wheel button
            var wheelPanel = new StackPanel { Margin = new Thickness(10, 0, 0, 0) };
            wheelPanel.Children.Add(FieldLabel("WHEEL / BUTTON BOX"));

            var bindBtnRow = new StackPanel { Orientation = Orientation.Horizontal };
            var bindBtn = ActionButton("BIND", ACCENT_GOLD, "#000000");

            var bindStatus = new TextBlock
            {
                Foreground = Brush(TEXT_SECONDARY),
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(10, 0, 0, 0),
            };

            if (_settings.WheelButtonIndex >= 0 && !string.IsNullOrEmpty(_settings.WheelDeviceName))
            {
                bindStatus.Text = "Btn " + (_settings.WheelButtonIndex + 1);
                bindStatus.Foreground = Brush(ACCENT_GOLD);
            }
            else
            {
                bindStatus.Text = "Not bound";
            }

            bindBtn.Click += (s, e) =>
            {
                bindBtn.Content = "PRESS...";
                bindBtn.IsEnabled = false;
                bindStatus.Text = "Waiting...";
                bindStatus.Foreground = Brush("#f59e0b");

                _joystickManager.OnButtonCaptured += (deviceName, deviceGuid, buttonIndex) =>
                {
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        _settings.WheelDeviceGuid = deviceGuid.ToString();
                        _settings.WheelDeviceName = deviceName;
                        _settings.WheelButtonIndex = buttonIndex;
                        _plugin.SaveSettings();
                        _joystickManager.SetBinding(deviceGuid, buttonIndex);

                        bindStatus.Text = "Btn " + (buttonIndex + 1);
                        bindStatus.Foreground = Brush(ACCENT_GOLD);
                        bindBtn.Content = "BIND";
                        bindBtn.IsEnabled = true;
                    }));
                };
                _joystickManager.StartCapture();

                var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
                timer.Tick += (s2, e2) =>
                {
                    timer.Stop();
                    _joystickManager.StopCapture();
                    if (bindBtn.Content.ToString() == "PRESS...")
                    {
                        bindBtn.Content = "BIND";
                        bindBtn.IsEnabled = true;
                        bindStatus.Text = _settings.WheelButtonIndex >= 0
                            ? "Btn " + (_settings.WheelButtonIndex + 1) : "Not bound";
                        bindStatus.Foreground = _settings.WheelButtonIndex >= 0
                            ? Brush(ACCENT_GOLD) : Brush(TEXT_SECONDARY);
                    }
                };
                timer.Start();
            };

            bindBtnRow.Children.Add(bindBtn);
            bindBtnRow.Children.Add(bindStatus);

            if (_settings.WheelButtonIndex >= 0)
            {
                var clearBtn = new Button
                {
                    Content = "x",
                    Background = Brushes.Transparent,
                    Foreground = Brush(TEXT_DIM),
                    BorderThickness = new Thickness(0),
                    FontSize = 10,
                    Cursor = System.Windows.Input.Cursors.Hand,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(6, 0, 0, 0),
                    Padding = new Thickness(4, 2, 4, 2),
                };
                clearBtn.Click += (s, e) =>
                {
                    _settings.WheelDeviceGuid = "";
                    _settings.WheelDeviceName = "";
                    _settings.WheelButtonIndex = -1;
                    _plugin.SaveSettings();
                    _joystickManager.ClearBinding();
                    bindStatus.Text = "Not bound";
                    bindStatus.Foreground = Brush(TEXT_SECONDARY);
                    clearBtn.Visibility = Visibility.Collapsed;
                };
                bindBtnRow.Children.Add(clearBtn);
            }

            wheelPanel.Children.Add(bindBtnRow);
            wheelPanel.Children.Add(new TextBlock
            {
                Text = _settings.WheelButtonIndex >= 0 ? _settings.WheelDeviceName : "Press BIND then press a wheel button",
                Foreground = Brush(TEXT_MUTED),
                FontSize = 9,
                Margin = new Thickness(0, 4, 0, 0),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
            Grid.SetColumn(wheelPanel, 1);
            bindGrid.Children.Add(wheelPanel);

            actionsStack.Children.Add(bindGrid);
            actionsCard.Child = actionsStack;
            content.Children.Add(actionsCard);

            content.Children.Add(Spacer(20));

            // ═══════════════════════════════════════════════════════════
            // NOTIFICATIONS
            // ═══════════════════════════════════════════════════════════
            content.Children.Add(Section("NOTIFICATIONS"));

            var notifCard = Card();
            var notifStack = new StackPanel();

            notifStack.Children.Add(Toggle("Penalty decisions",
                "Drive-through, stop & go, time penalties, DSQ, warnings",
                _settings.ShowPenaltyOverlay, (v) => { _settings.ShowPenaltyOverlay = v; _plugin.SaveSettings(); }));

            notifStack.Children.Add(Divider());

            notifStack.Children.Add(Toggle("Race control messages",
                "Steward broadcasts to all drivers",
                _settings.ShowRCMessageOverlay, (v) => { _settings.ShowRCMessageOverlay = v; _plugin.SaveSettings(); }));

            notifStack.Children.Add(Divider());

            notifStack.Children.Add(Toggle("Under investigation",
                "Notification when your incident is being reviewed",
                _settings.ShowInvestigationOverlay, (v) => { _settings.ShowInvestigationOverlay = v; _plugin.SaveSettings(); }));

            notifCard.Child = notifStack;
            content.Children.Add(notifCard);

            content.Children.Add(Spacer(20));

            // ═══════════════════════════════════════════════════════════
            // ADVANCED
            // ═══════════════════════════════════════════════════════════
            content.Children.Add(Section("ADVANCED"));

            var advCard = Card();
            var advStack = new StackPanel();

            advStack.Children.Add(FieldLabel("SIMHUB PROPERTIES"));
            advStack.Children.Add(new TextBlock
            {
                Text = "Use in Dash Studio overlays or NCalc formulas",
                Foreground = Brush(TEXT_MUTED),
                FontSize = 9,
                Margin = new Thickness(0, 0, 0, 8),
            });

            var propsPanel = new WrapPanel();
            foreach (var prop in new[] {
                "Connected", "LastPenalty", "UnderInvestigation", "LastRCMessage", "ProtestCooldown" })
            {
                propsPanel.Children.Add(new Border
                {
                    Background = Brush(SECTION_BG),
                    BorderBrush = Brush(INPUT_BORDER),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(3),
                    Padding = new Thickness(8, 4, 8, 4),
                    Margin = new Thickness(0, 0, 6, 6),
                    Child = new TextBlock
                    {
                        Text = "BPRRaceControl." + prop,
                        Foreground = Brush(ACCENT_GOLD),
                        FontSize = 12,
                        FontFamily = new FontFamily("Consolas"),
                    },
                });
            }
            advStack.Children.Add(propsPanel);

            // Check for updates
            advStack.Children.Add(Spacer(12));
            var checkBtn = new Button
            {
                Content = "Check for Updates",
                Background = Brushes.Transparent,
                Foreground = Brush(TEXT_DIM),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(0, 4, 0, 4),
                FontSize = 10,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
            };
            checkBtn.Click += (s, e) =>
            {
                checkBtn.Content = "Checking...";
                checkBtn.IsEnabled = false;
                _updater.OnUpdateCheckComplete += () =>
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        checkBtn.Content = _updater.UpdateAvailable ? "Update found!" : "Up to date  " + verStr;
                        checkBtn.IsEnabled = true;
                        RefreshUpdateBanner();
                    }));
                _updater.CheckForUpdateAsync();
            };
            advStack.Children.Add(checkBtn);

            advCard.Child = advStack;
            content.Children.Add(advCard);

            content.Children.Add(Spacer(16));

            // Footer
            content.Children.Add(new TextBlock
            {
                Text = "Bite Point Racing  |  github.com/TNrockytop21/bpr-race-control",
                Foreground = Brush(TEXT_MUTED),
                FontSize = 9,
                HorizontalAlignment = HorizontalAlignment.Center,
            });

            root.Children.Add(content);
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
                _statusDot.Fill = Brush(ACCENT_GREEN);
                _statusText.Text = "Connected";
                _statusText.Foreground = Brush(ACCENT_GREEN);
                _connectButton.Content = "DISCONNECT";
                _connectButton.Background = Brush("#1a1a1e");
                _connectButton.Foreground = Brush(TEXT_SECONDARY);
                _connectButton.BorderBrush = Brush(INPUT_BORDER);
                _connectButton.BorderThickness = new Thickness(1);
            }
            else
            {
                _statusDot.Fill = Brush(DANGER);
                _statusText.Text = "Disconnected";
                _statusText.Foreground = Brush(TEXT_SECONDARY);
                _connectButton.Content = "CONNECT";
                _connectButton.Background = Brush(ACCENT_RED);
                _connectButton.Foreground = Brush("#ffffff");
                _connectButton.BorderThickness = new Thickness(0);
            }
        }

        // ── Events ───────────────────────────────────────────────────

        private void ConnectButton_Click(object s, RoutedEventArgs e)
        {
            if (_wsClient.IsConnected) _plugin.Disconnect(); else _plugin.Connect();
        }

        private void ServerUrl_Changed(object s, TextChangedEventArgs e)
        {
            if (_settings != null) { _settings.ServerUrl = _serverUrlInput.Text; _plugin.SaveSettings(); }
        }

        private void AutoConnect_Changed(object s, RoutedEventArgs e)
        {
            if (_settings != null) { _settings.AutoConnect = _autoConnectCheck.IsChecked == true; _plugin.SaveSettings(); }
        }

        private void ProtestButton_Click(object s, RoutedEventArgs e)
        {
            _plugin.SendProtest();
            _protestButton.Content = "REPORTED";
            _protestButton.IsEnabled = false;
            var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
            t.Tick += (s2, e2) => { t.Stop(); _protestButton.Content = "REPORT INCIDENT"; _protestButton.IsEnabled = true; };
            t.Start();
        }

        private void RefreshUpdateBanner()
        {
            if (_updater == null) return;
            if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(RefreshUpdateBanner)); return; }
            if (_updater.UpdateAvailable)
            {
                _updateText.Text = "v" + _updater.LatestVersion + " available";
                _updateBanner.Visibility = Visibility.Visible;
            }
        }

        private void UpdateButton_Click(object s, RoutedEventArgs e)
        {
            _updateButton.Content = "DOWNLOADING...";
            _updateButton.IsEnabled = false;
            _updater.DownloadAndApplyUpdate();
        }

        // ── UI Factories ─────────────────────────────────────────────

        private static SolidColorBrush Brush(string hex)
        {
            return new SolidColorBrush((System.Windows.Media.Color)ColorConverter.ConvertFromString(hex));
        }

        private static Border Card()
        {
            return new Border
            {
                Background = Brush(CARD),
                BorderBrush = Brush(CARD_BORDER),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(22, 20, 22, 20),
            };
        }

        private static TextBlock Section(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = Brush(TEXT_SECONDARY),
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(2, 0, 0, 10),
            };
        }

        private static TextBlock FieldLabel(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = Brush(TEXT_DIM),
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 6),
            };
        }

        private static Button ActionButton(string text, string bg, string fg)
        {
            return new Button
            {
                Content = text,
                Background = Brush(bg),
                Foreground = Brush(fg),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(22, 10, 22, 10),
                FontSize = 13,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left,
            };
        }

        private static Border Spacer(double h) { return new Border { Height = h }; }

        private static Border Divider()
        {
            return new Border
            {
                Background = Brush(CARD_BORDER),
                Height = 1,
                Margin = new Thickness(0, 10, 0, 10),
            };
        }

        private static StackPanel Toggle(string label, string desc, bool isOn, Action<bool> onChange)
        {
            var row = new StackPanel { Orientation = Orientation.Horizontal };

            var cb = new CheckBox
            {
                IsChecked = isOn,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 2, 10, 0),
            };

            var textStack = new StackPanel();
            textStack.Children.Add(new TextBlock
            {
                Text = label,
                Foreground = Brush(TEXT_PRIMARY),
                FontSize = 14,
            });
            textStack.Children.Add(new TextBlock
            {
                Text = desc,
                Foreground = Brush(TEXT_DIM),
                FontSize = 11,
                Margin = new Thickness(0, 2, 0, 0),
            });

            cb.Checked += (s, e) => onChange(true);
            cb.Unchecked += (s, e) => onChange(false);

            row.Children.Add(cb);
            row.Children.Add(textStack);

            var wrapper = new StackPanel();
            wrapper.Children.Add(row);
            return wrapper;
        }

        private string verStr
        {
            get { return "v" + (_updater != null ? _updater.CurrentVersion.ToString(3) : "1.0.0"); }
        }
    }
}
