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

        // ── Motorsport Broadcast palette — bright text ────────────────
        static readonly string BG = "#0e1015";
        static readonly string CARD_BORDER = "#1c1f28";
        static readonly string INPUT_BG = "#080a0f";
        static readonly string TEXT_WHITE = "#ffffff";
        static readonly string TEXT_BRIGHT = "#e8e8e8";
        static readonly string TEXT_BODY = "#cccccc";
        static readonly string TEXT_LABEL = "#aaaaaa";
        static readonly string TEXT_HINT = "#808080";
        static readonly string RED = "#c8102e";
        static readonly string GOLD = "#d4a017";
        static readonly string GREEN = "#22c55e";
        static readonly string DANGER = "#ef4444";

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

        private string VerStr
        {
            get { return "v" + (_updater != null ? _updater.CurrentVersion.ToString(3) : "1.0.0"); }
        }

        private void BuildUI()
        {
            var scroll = new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
            };
            var root = new StackPanel();

            // ═══════════════════════════════════════════════════════════
            // RED HEADER BAR
            // ═══════════════════════════════════════════════════════════
            var header = new Border
            {
                Background = new LinearGradientBrush(
                    Clr("#c8102e"), Clr("#8b0a1e"),
                    new Point(0, 0), new Point(1, 1)),
                Padding = new Thickness(28, 22, 28, 22),
            };
            var headerStack = new StackPanel();

            // Logo
            try
            {
                var asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                var logoPath = Path.Combine(asmDir, "bpr-logo.png");
                if (File.Exists(logoPath))
                {
                    var bmp = new BitmapImage();
                    bmp.BeginInit();
                    bmp.UriSource = new Uri(logoPath);
                    bmp.DecodePixelHeight = 120;
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.EndInit();
                    headerStack.Children.Add(new Image
                    {
                        Source = bmp,
                        Height = 55,
                        HorizontalAlignment = HorizontalAlignment.Left,
                        Margin = new Thickness(0, 0, 0, 10),
                    });
                }
            }
            catch { }

            headerStack.Children.Add(new TextBlock
            {
                Text = "BPR RACE CONTROL",
                Foreground = Brush(TEXT_WHITE),
                FontSize = 24,
                FontWeight = FontWeights.ExtraBold,
            });
            var headerBottom = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 6, 0, 0) };
            headerBottom.Children.Add(new TextBlock
            {
                Text = "SimHub Telemetry Agent  " + VerStr,
                Foreground = Brush("rgba(255,255,255,0.6)"),
                FontSize = 12,
                VerticalAlignment = VerticalAlignment.Center,
            });

            var chkUpdBtn = new Button
            {
                Content = "CHECK FOR UPDATES",
                Background = Brush("rgba(255,255,255,0.15)"),
                Foreground = Brush("#ffffff"),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(14, 5, 14, 5),
                FontSize = 10,
                FontWeight = FontWeights.Bold,
                Cursor = System.Windows.Input.Cursors.Hand,
                Margin = new Thickness(16, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            chkUpdBtn.Click += (s, e) =>
            {
                chkUpdBtn.Content = "CHECKING...";
                chkUpdBtn.IsEnabled = false;
                _updater.OnUpdateCheckComplete += () =>
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        chkUpdBtn.Content = _updater.UpdateAvailable ? "UPDATE FOUND!" : "UP TO DATE";
                        chkUpdBtn.Foreground = _updater.UpdateAvailable ? Brush(GREEN) : Brush("#ffffff");
                        chkUpdBtn.IsEnabled = true;
                        RefreshUpdateBanner();
                    }));
                _updater.CheckForUpdateAsync();
            };
            headerBottom.Children.Add(chkUpdBtn);
            headerStack.Children.Add(headerBottom);

            header.Child = headerStack;
            root.Children.Add(header);

            // ── Body ─────────────────────────────────────────────────
            var body = new StackPanel { Margin = new Thickness(28, 24, 28, 28) };

            // ═══════════════════════════════════════════════════════════
            // UPDATE BANNER
            // ═══════════════════════════════════════════════════════════
            _updateBanner = new Border
            {
                Background = Brush("#071207"),
                BorderBrush = Brush(GREEN),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(18, 14, 18, 14),
                Margin = new Thickness(0, 0, 0, 20),
                Visibility = Visibility.Collapsed,
            };
            var updRow = new StackPanel { Orientation = Orientation.Horizontal };
            _updateText = new TextBlock
            {
                Text = "Update available",
                Foreground = Brush(GREEN),
                FontSize = 15,
                FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center,
            };
            updRow.Children.Add(_updateText);
            _updateButton = MakeButton("INSTALL UPDATE", GREEN, "#000000");
            _updateButton.Margin = new Thickness(16, 0, 0, 0);
            _updateButton.Click += UpdateButton_Click;
            updRow.Children.Add(_updateButton);
            _updateBanner.Child = updRow;
            body.Children.Add(_updateBanner);

            // ═══════════════════════════════════════════════════════════
            // CONNECTION
            // ═══════════════════════════════════════════════════════════
            body.Children.Add(SectionHeader("CONNECTION"));

            var statusRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 16) };
            _statusDot = new Ellipse
            {
                Width = 10, Height = 10,
                Fill = Brush(DANGER),
                Margin = new Thickness(0, 0, 10, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            statusRow.Children.Add(_statusDot);
            _statusText = new TextBlock
            {
                Text = "Disconnected",
                Foreground = Brush(TEXT_BODY),
                FontSize = 16,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
            };
            statusRow.Children.Add(_statusText);
            body.Children.Add(statusRow);

            body.Children.Add(Label("SERVER"));
            _serverUrlInput = new TextBox
            {
                Text = _settings.ServerUrl,
                Background = Brush(INPUT_BG),
                Foreground = Brush(TEXT_BRIGHT),
                BorderBrush = Brush(CARD_BORDER),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(12, 10, 12, 10),
                FontSize = 14,
                FontFamily = new FontFamily("Consolas"),
                CaretBrush = Brush(TEXT_WHITE),
                Margin = new Thickness(0, 0, 0, 14),
            };
            _serverUrlInput.TextChanged += (s, e) =>
            {
                if (_settings != null) { _settings.ServerUrl = _serverUrlInput.Text; _plugin.SaveSettings(); }
            };
            body.Children.Add(_serverUrlInput);

            var connRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 0) };
            _connectButton = MakeButton("CONNECT", RED, TEXT_WHITE);
            _connectButton.Click += (s, e) => { if (_wsClient.IsConnected) _plugin.Disconnect(); else _plugin.Connect(); };
            connRow.Children.Add(_connectButton);

            _autoConnectCheck = new CheckBox
            {
                Content = "Auto-connect when iRacing starts",
                Foreground = Brush(TEXT_BODY),
                FontSize = 13,
                IsChecked = _settings.AutoConnect,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(16, 0, 0, 0),
            };
            _autoConnectCheck.Checked += (s, e) => { if (_settings != null) { _settings.AutoConnect = true; _plugin.SaveSettings(); } };
            _autoConnectCheck.Unchecked += (s, e) => { if (_settings != null) { _settings.AutoConnect = false; _plugin.SaveSettings(); } };
            connRow.Children.Add(_autoConnectCheck);
            body.Children.Add(connRow);

            // ═══════════════════════════════════════════════════════════
            // INCIDENT REPORTING
            // ═══════════════════════════════════════════════════════════
            body.Children.Add(SectionHeader("INCIDENT REPORTING"));

            var protestRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 18) };
            _protestButton = MakeButton("REPORT INCIDENT", "transparent", DANGER);
            _protestButton.BorderBrush = Brush(DANGER);
            _protestButton.BorderThickness = new Thickness(1);
            _protestButton.Click += (s, e) =>
            {
                _plugin.SendProtest();
                _protestButton.Content = "REPORTED";
                _protestButton.IsEnabled = false;
                var t = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
                t.Tick += (s2, e2) => { t.Stop(); _protestButton.Content = "REPORT INCIDENT"; _protestButton.IsEnabled = true; };
                t.Start();
            };
            protestRow.Children.Add(_protestButton);
            protestRow.Children.Add(new TextBlock
            {
                Text = "10s cooldown",
                Foreground = Brush(TEXT_LABEL),
                FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(14, 0, 0, 0),
            });
            body.Children.Add(protestRow);

            // Two-column bindings
            var bindGrid = new Grid();
            bindGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            bindGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            // Left: keyboard
            var kbPanel = new StackPanel { Margin = new Thickness(0, 0, 14, 0) };
            kbPanel.Children.Add(Label("KEYBOARD"));
            var hotkeyInput = new TextBox
            {
                Text = _settings.ProtestHotkey,
                Background = Brush(INPUT_BG),
                Foreground = Brush(TEXT_BRIGHT),
                BorderBrush = Brush(CARD_BORDER),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(12, 10, 12, 10),
                FontSize = 14,
                FontFamily = new FontFamily("Consolas"),
                CaretBrush = Brush(TEXT_WHITE),
                Margin = new Thickness(0, 0, 0, 4),
            };
            hotkeyInput.TextChanged += (s, e) =>
            {
                _settings.ProtestHotkey = hotkeyInput.Text;
                _plugin.SaveSettings();
                _plugin.ReregisterHotkey();
            };
            kbPanel.Children.Add(hotkeyInput);
            kbPanel.Children.Add(Hint("F1, Ctrl+F5, Shift+F2"));
            Grid.SetColumn(kbPanel, 0);
            bindGrid.Children.Add(kbPanel);

            // Right: wheel
            var wPanel = new StackPanel { Margin = new Thickness(14, 0, 0, 0) };
            wPanel.Children.Add(Label("WHEEL BUTTON"));

            var bindBtnRow = new StackPanel { Orientation = Orientation.Horizontal };
            var bindBtn = MakeButton("BIND", GOLD, "#000000");

            var bindLabel = new TextBlock
            {
                Foreground = Brush(GOLD),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 0, 0),
            };

            if (_settings.WheelButtonIndex >= 0 && !string.IsNullOrEmpty(_settings.WheelDeviceName))
                bindLabel.Text = "Btn " + (_settings.WheelButtonIndex + 1);
            else
            {
                bindLabel.Text = "Not bound";
                bindLabel.Foreground = Brush(TEXT_LABEL);
            }

            bindBtn.Click += (s, e) =>
            {
                bindBtn.Content = "PRESS...";
                bindBtn.IsEnabled = false;
                bindLabel.Text = "Waiting...";
                bindLabel.Foreground = Brush("#f59e0b");

                _joystickManager.OnButtonCaptured += (dn, dg, bi) =>
                {
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        _settings.WheelDeviceGuid = dg.ToString();
                        _settings.WheelDeviceName = dn;
                        _settings.WheelButtonIndex = bi;
                        _plugin.SaveSettings();
                        _joystickManager.SetBinding(dg, bi);
                        bindLabel.Text = "Btn " + (bi + 1);
                        bindLabel.Foreground = Brush(GOLD);
                        bindBtn.Content = "BIND";
                        bindBtn.IsEnabled = true;
                    }));
                };
                _joystickManager.StartCapture();

                var tmr = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
                tmr.Tick += (s2, e2) =>
                {
                    tmr.Stop();
                    _joystickManager.StopCapture();
                    if (bindBtn.Content.ToString() == "PRESS...")
                    {
                        bindBtn.Content = "BIND";
                        bindBtn.IsEnabled = true;
                        bindLabel.Text = _settings.WheelButtonIndex >= 0 ? "Btn " + (_settings.WheelButtonIndex + 1) : "Not bound";
                        bindLabel.Foreground = _settings.WheelButtonIndex >= 0 ? Brush(GOLD) : Brush(TEXT_LABEL);
                    }
                };
                tmr.Start();
            };

            bindBtnRow.Children.Add(bindBtn);
            bindBtnRow.Children.Add(bindLabel);

            if (_settings.WheelButtonIndex >= 0)
            {
                var clr = new Button
                {
                    Content = "x",
                    Background = Brushes.Transparent,
                    Foreground = Brush(TEXT_HINT),
                    BorderThickness = new Thickness(0),
                    FontSize = 11,
                    Cursor = System.Windows.Input.Cursors.Hand,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(8, 0, 0, 0),
                    Padding = new Thickness(4, 2, 4, 2),
                };
                clr.Click += (s, e) =>
                {
                    _settings.WheelDeviceGuid = "";
                    _settings.WheelDeviceName = "";
                    _settings.WheelButtonIndex = -1;
                    _plugin.SaveSettings();
                    _joystickManager.ClearBinding();
                    bindLabel.Text = "Not bound";
                    bindLabel.Foreground = Brush(TEXT_LABEL);
                    clr.Visibility = Visibility.Collapsed;
                };
                bindBtnRow.Children.Add(clr);
            }

            wPanel.Children.Add(bindBtnRow);
            wPanel.Children.Add(Hint(_settings.WheelButtonIndex >= 0 ? _settings.WheelDeviceName : "Click BIND, then press wheel button"));
            Grid.SetColumn(wPanel, 1);
            bindGrid.Children.Add(wPanel);
            body.Children.Add(bindGrid);

            // ═══════════════════════════════════════════════════════════
            // NOTIFICATIONS
            // ═══════════════════════════════════════════════════════════
            body.Children.Add(SectionHeader("NOTIFICATIONS"));

            body.Children.Add(ToggleRow("Penalty decisions",
                "Drive-through, stop & go, time, DSQ, warnings",
                _settings.ShowPenaltyOverlay, v => { _settings.ShowPenaltyOverlay = v; _plugin.SaveSettings(); }));

            body.Children.Add(ToggleRow("Race control messages",
                "Steward broadcasts to all drivers",
                _settings.ShowRCMessageOverlay, v => { _settings.ShowRCMessageOverlay = v; _plugin.SaveSettings(); }));

            body.Children.Add(ToggleRow("Under investigation",
                "When your incident is being reviewed",
                _settings.ShowInvestigationOverlay, v => { _settings.ShowInvestigationOverlay = v; _plugin.SaveSettings(); }));

            // ═══════════════════════════════════════════════════════════
            // ADVANCED
            // ═══════════════════════════════════════════════════════════
            body.Children.Add(SectionHeader("ADVANCED"));

            body.Children.Add(Label("SIMHUB PROPERTIES"));

            var chipWrap = new WrapPanel { Margin = new Thickness(0, 4, 0, 0) };
            foreach (var p in new[] { "Connected", "LastPenalty", "UnderInvestigation", "LastRCMessage", "ProtestCooldown" })
            {
                chipWrap.Children.Add(new Border
                {
                    Background = Brush(INPUT_BG),
                    BorderBrush = Brush(CARD_BORDER),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(3),
                    Padding = new Thickness(10, 5, 10, 5),
                    Margin = new Thickness(0, 0, 8, 8),
                    Child = new TextBlock
                    {
                        Text = "BPRRaceControl." + p,
                        Foreground = Brush(GOLD),
                        FontSize = 12,
                        FontFamily = new FontFamily("Consolas"),
                    },
                });
            }
            body.Children.Add(chipWrap);


            // Footer
            body.Children.Add(new Border { Height = 16 });
            body.Children.Add(new TextBlock
            {
                Text = "Bite Point Racing  |  bitepointracing.com",
                Foreground = Brush(TEXT_HINT),
                FontSize = 10,
                HorizontalAlignment = HorizontalAlignment.Center,
            });

            root.Children.Add(body);
            scroll.Content = root;
            Content = scroll;
        }

        // ── Public ───────────────────────────────────────────────────

        public void UpdateConnectionStatus(bool connected)
        {
            if (!Dispatcher.CheckAccess()) { Dispatcher.BeginInvoke(new Action(() => UpdateConnectionStatus(connected))); return; }

            if (connected)
            {
                _statusDot.Fill = Brush(GREEN);
                _statusText.Text = "Connected";
                _statusText.Foreground = Brush(GREEN);
                _connectButton.Content = "DISCONNECT";
                _connectButton.Background = Brush(INPUT_BG);
                _connectButton.Foreground = Brush(TEXT_BODY);
                _connectButton.BorderBrush = Brush(CARD_BORDER);
                _connectButton.BorderThickness = new Thickness(1);
            }
            else
            {
                _statusDot.Fill = Brush(DANGER);
                _statusText.Text = "Disconnected";
                _statusText.Foreground = Brush(TEXT_BODY);
                _connectButton.Content = "CONNECT";
                _connectButton.Background = Brush(RED);
                _connectButton.Foreground = Brush(TEXT_WHITE);
                _connectButton.BorderThickness = new Thickness(0);
            }
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

        // ── UI Builders ──────────────────────────────────────────────

        static SolidColorBrush Brush(string hex)
        {
            if (hex.StartsWith("rgba")) return new SolidColorBrush(Colors.White) { Opacity = 0.6 };
            if (hex == "transparent") return Brushes.Transparent as SolidColorBrush ?? new SolidColorBrush(Colors.Transparent);
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        }

        static Color Clr(string hex) { return (Color)ColorConverter.ConvertFromString(hex); }

        /// <summary>Red-underlined section header — the signature motorsport look.</summary>
        static Border SectionHeader(string text)
        {
            return new Border
            {
                BorderBrush = Brush(CARD_BORDER),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Margin = new Thickness(0, 28, 0, 14),
                Padding = new Thickness(0, 0, 0, 8),
                Child = new TextBlock
                {
                    Text = text,
                    Foreground = Brush(RED),
                    FontSize = 12,
                    FontWeight = FontWeights.Bold,
                },
            };
        }

        static TextBlock Label(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = Brush(TEXT_LABEL),
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 0, 0, 6),
            };
        }

        static TextBlock Hint(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = Brush(TEXT_HINT),
                FontSize = 10,
                Margin = new Thickness(0, 4, 0, 0),
            };
        }

        static Button MakeButton(string text, string bg, string fg)
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

        /// <summary>Toggle row with checkbox, label, and description.</summary>
        static Border ToggleRow(string label, string desc, bool isOn, Action<bool> onChange)
        {
            var row = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(0, 0, 0, 0),
            };

            var cb = new CheckBox
            {
                IsChecked = isOn,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 3, 12, 0),
            };
            cb.Checked += (s, e) => onChange(true);
            cb.Unchecked += (s, e) => onChange(false);

            var txt = new StackPanel();
            txt.Children.Add(new TextBlock
            {
                Text = label,
                Foreground = Brush(TEXT_BRIGHT),
                FontSize = 14,
            });
            txt.Children.Add(new TextBlock
            {
                Text = desc,
                Foreground = Brush(TEXT_LABEL),
                FontSize = 11,
                Margin = new Thickness(0, 2, 0, 0),
            });

            row.Children.Add(cb);
            row.Children.Add(txt);

            return new Border
            {
                BorderBrush = Brush("#12141a"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(0, 12, 0, 12),
                Child = row,
            };
        }
    }
}
