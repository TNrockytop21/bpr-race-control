using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace BPRRaceControl
{
    /// <summary>
    /// WPF notification overlay that appears on top of iRacing.
    /// Mirrors the Python agent's Tkinter overlay exactly:
    /// - Top-center banner, 600px wide, dark #111111 background
    /// - Color-coded accent stripe + "RACE CONTROL" header + penalty text
    /// - 8-second auto-dismiss with alpha fade
    /// - Click to dismiss
    /// </summary>
    public static class NotificationOverlay
    {
        // Penalty type → display label (matching launcher.py lines 208-216)
        private static readonly Dictionary<string, string> PenaltyLabels = new Dictionary<string, string>
        {
            ["no-action"] = "NO ACTION",
            ["race-incident"] = "RACE INCIDENT",
            ["warning"] = "WARNING",
            ["drive-through"] = "DRIVE-THROUGH PENALTY",
            ["stop-go"] = "STOP & GO PENALTY",
            ["dsq"] = "DISQUALIFIED",
        };

        // Penalty type → accent color (matching launcher.py lines 219-227)
        private static readonly Dictionary<string, string> PenaltyColors = new Dictionary<string, string>
        {
            ["no-action"] = "#22c55e",
            ["race-incident"] = "#3b82f6",
            ["warning"] = "#f59e0b",
            ["drive-through"] = "#ef4444",
            ["stop-go"] = "#ef4444",
            ["time-penalty"] = "#ef4444",
            ["dsq"] = "#dc2626",
        };

        /// <summary>
        /// Show a penalty notification overlay.
        /// Must be called on the WPF Dispatcher thread.
        /// </summary>
        public static void ShowPenalty(string penaltyType, int? timeSeconds, string notes)
        {
            string label;
            if (penaltyType == "time-penalty" && timeSeconds.HasValue)
                label = $"TIME PENALTY \u2014 {timeSeconds}s";
            else if (PenaltyLabels.ContainsKey(penaltyType))
                label = PenaltyLabels[penaltyType];
            else
                label = penaltyType.ToUpper().Replace("-", " ");

            string color = PenaltyColors.ContainsKey(penaltyType)
                ? PenaltyColors[penaltyType]
                : "#ef4444";

            ShowBanner("RACE CONTROL", label, color, notes, 8000);
        }

        /// <summary>
        /// Show an "Incident Under Investigation" notification.
        /// </summary>
        public static void ShowInvestigation(string notes)
        {
            ShowBanner("RACE CONTROL", "INCIDENT UNDER INVESTIGATION", "#f59e0b", notes, 10000);
        }

        /// <summary>
        /// Show a race control message notification.
        /// </summary>
        public static void ShowRaceControlMessage(string message)
        {
            // Color detection matching launcher.py lines 434-443
            string color = "#ffffff";
            var lower = message.ToLower();
            if (lower.Contains("red flag") || lower.Contains("closed"))
                color = "#ef4444";
            else if (lower.Contains("yellow") || lower.Contains("safety car") ||
                     lower.Contains("caution") || lower.Contains("warning"))
                color = "#f59e0b";
            else if (lower.Contains("green") || lower.Contains("open") ||
                     lower.Contains("resume"))
                color = "#22c55e";

            ShowBanner("RACE CONTROL", message, color, null, 8000);
        }

        /// <summary>
        /// Show a protest acknowledgement notification.
        /// </summary>
        public static void ShowProtestAck(string message)
        {
            ShowBanner("RACE CONTROL", message ?? "PROTEST RECEIVED", "#22c55e", null, 5000);
        }

        // ── Core banner implementation ───────────────────────────────

        private static void ShowBanner(string header, string mainText, string colorHex, string notes, int displayMs)
        {
            // Ensure we're on the UI thread
            if (Application.Current?.Dispatcher != null &&
                !Application.Current.Dispatcher.CheckAccess())
            {
                Application.Current.Dispatcher.BeginInvoke(new Action(() =>
                    ShowBanner(header, mainText, colorHex, notes, displayMs)));
                return;
            }

            var accentColor = (Color)ColorConverter.ConvertFromString(colorHex);
            var accentBrush = new SolidColorBrush(accentColor);
            var bgBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#111111"));

            bool hasNotes = !string.IsNullOrWhiteSpace(notes);

            // Create the overlay window
            var overlay = new Window
            {
                WindowStyle = WindowStyle.None,
                AllowsTransparency = true,
                Background = bgBrush,
                Opacity = 0.92,
                Topmost = true,
                ShowInTaskbar = false,
                ResizeMode = ResizeMode.NoResize,
                Width = 600,
                Height = hasNotes ? 110 : 90,
                WindowStartupLocation = WindowStartupLocation.Manual,
            };

            // Position: top-center, below iRacing HUD
            var screenWidth = SystemParameters.PrimaryScreenWidth;
            overlay.Left = (screenWidth - 600) / 2;
            overlay.Top = 60;

            // Build layout
            var stack = new StackPanel();

            // Accent stripe at top (3px)
            stack.Children.Add(new Border
            {
                Background = accentBrush,
                Height = 3,
            });

            // "RACE CONTROL" header
            stack.Children.Add(new TextBlock
            {
                Text = header,
                FontFamily = new FontFamily("Arial"),
                FontSize = 9,
                FontWeight = FontWeights.Bold,
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#888888")),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 8, 0, 0),
            });

            // Main penalty text
            stack.Children.Add(new TextBlock
            {
                Text = mainText,
                FontFamily = new FontFamily("Arial"),
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = accentBrush,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 2, 0, 0),
            });

            // Notes (if present)
            if (hasNotes)
            {
                stack.Children.Add(new TextBlock
                {
                    Text = notes,
                    FontFamily = new FontFamily("Arial"),
                    FontSize = 10,
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#999999")),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    TextWrapping = TextWrapping.Wrap,
                    MaxWidth = 560,
                    Margin = new Thickness(0, 2, 0, 0),
                });
            }

            overlay.Content = stack;

            // Click to dismiss
            overlay.MouseDown += (s, e) => overlay.Close();

            // Auto-dismiss with fade after displayMs
            var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(displayMs) };
            timer.Tick += (s, e) =>
            {
                timer.Stop();
                var fadeOut = new DoubleAnimation(0.92, 0.0, TimeSpan.FromSeconds(1));
                fadeOut.Completed += (s2, e2) => overlay.Close();
                overlay.BeginAnimation(UIElement.OpacityProperty, fadeOut);
            };
            timer.Start();

            overlay.Show();
        }
    }
}
