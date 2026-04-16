using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace BPRRaceControl
{
    /// <summary>
    /// Checks GitHub releases for plugin updates and handles self-update.
    /// Pattern: check on startup, show banner in settings, one-click install.
    /// </summary>
    public class PluginUpdater
    {
        private const string GitHubApiUrl =
            "https://api.github.com/repos/TNrockytop21/bpr-race-control/releases/latest";
        private const string DllFileName = "BPRRaceControl.dll";

        private volatile bool _updateAvailable;
        private string _latestVersion;
        private string _downloadUrl;
        private string _releaseNotes;
        private System.Collections.Generic.List<KeyValuePair<string, string>> _extraAssets =
            new System.Collections.Generic.List<KeyValuePair<string, string>>();
        private bool _checking;
        private bool _downloading;

        /// <summary>True when a newer version is available on GitHub.</summary>
        public bool UpdateAvailable { get { return _updateAvailable; } }

        /// <summary>The latest version string (e.g. "1.0.1").</summary>
        public string LatestVersion { get { return _latestVersion; } }

        /// <summary>Release notes / description from the GitHub release.</summary>
        public string ReleaseNotes { get { return _releaseNotes; } }

        /// <summary>True while checking for updates.</summary>
        public bool IsChecking { get { return _checking; } }

        /// <summary>True while downloading an update.</summary>
        public bool IsDownloading { get { return _downloading; } }

        /// <summary>The currently running plugin version.</summary>
        public Version CurrentVersion
        {
            get { return Assembly.GetExecutingAssembly().GetName().Version; }
        }

        /// <summary>Raised when update check completes (on background thread).</summary>
        public event Action OnUpdateCheckComplete;

        /// <summary>Raised when download completes or fails.</summary>
        public event Action<bool, string> OnDownloadComplete;

        /// <summary>
        /// Check GitHub for a newer release. Runs on a background thread.
        /// Safe to call from Init() — never blocks.
        /// </summary>
        public void CheckForUpdateAsync()
        {
            if (_checking) return;
            _checking = true;

            Task.Run(() =>
            {
                try
                {
                    CheckForUpdate();
                }
                catch (Exception ex)
                {
                    SimHub.Logging.Current.Error("[BPR Updater] Check failed: " + ex.Message);
                }
                finally
                {
                    _checking = false;
                    try { OnUpdateCheckComplete?.Invoke(); } catch { }
                }
            });
        }

        private void CheckForUpdate()
        {
            // GitHub API requires a User-Agent header
            var request = (HttpWebRequest)WebRequest.Create(GitHubApiUrl);
            request.UserAgent = "BPRRaceControl/" + CurrentVersion;
            request.Accept = "application/vnd.github.v3+json";
            request.Timeout = 10000;

            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
            {
                var json = reader.ReadToEnd();
                var release = JObject.Parse(json);

                var tagName = release["tag_name"]?.ToString() ?? "";
                _releaseNotes = release["body"]?.ToString() ?? "";

                // Strip leading 'v' from tag (e.g. "v1.0.1" -> "1.0.1")
                var versionStr = tagName.TrimStart('v', 'V');
                Version latestVer;
                if (!Version.TryParse(versionStr, out latestVer))
                {
                    SimHub.Logging.Current.Info("[BPR Updater] Could not parse version: " + tagName);
                    return;
                }

                SimHub.Logging.Current.Info(
                    "[BPR Updater] Current: " + CurrentVersion + " | Latest: " + latestVer);

                if (latestVer > CurrentVersion)
                {
                    _latestVersion = versionStr;

                    // Find assets in the release
                    _extraAssets.Clear();
                    var assets = release["assets"] as JArray;
                    if (assets != null)
                    {
                        foreach (var asset in assets)
                        {
                            var name = asset["name"]?.ToString() ?? "";
                            var url = asset["browser_download_url"]?.ToString();
                            if (string.IsNullOrEmpty(url)) continue;

                            if (name.Equals(DllFileName, StringComparison.OrdinalIgnoreCase))
                            {
                                _downloadUrl = url;
                            }
                            else
                            {
                                // Extra assets (logo, etc.) — download alongside the DLL
                                _extraAssets.Add(new KeyValuePair<string, string>(name, url));
                            }
                        }
                    }

                    _updateAvailable = _downloadUrl != null;

                    if (_updateAvailable)
                    {
                        SimHub.Logging.Current.Info(
                            "[BPR Updater] Update available: v" + _latestVersion);
                    }
                    else
                    {
                        SimHub.Logging.Current.Info(
                            "[BPR Updater] New version found but no DLL asset in release");
                    }
                }
                else
                {
                    SimHub.Logging.Current.Info("[BPR Updater] Plugin is up to date");
                }
            }
        }

        /// <summary>
        /// Download the update and apply it. This will:
        /// 1. Download the new DLL to a temp file
        /// 2. Write a batch script that replaces the DLL after SimHub closes
        /// 3. Close SimHub (which triggers the batch script to run)
        /// </summary>
        public void DownloadAndApplyUpdate()
        {
            if (!_updateAvailable || string.IsNullOrEmpty(_downloadUrl) || _downloading)
                return;

            _downloading = true;

            Task.Run(() =>
            {
                try
                {
                    ApplyUpdate();
                    try { OnDownloadComplete?.Invoke(true, null); } catch { }
                }
                catch (Exception ex)
                {
                    SimHub.Logging.Current.Error("[BPR Updater] Update failed: " + ex.Message);
                    try { OnDownloadComplete?.Invoke(false, ex.Message); } catch { }
                }
                finally
                {
                    _downloading = false;
                }
            });
        }

        private void ApplyUpdate()
        {
            // Figure out where the current DLL is running from
            var currentDllPath = Assembly.GetExecutingAssembly().Location;
            var simhubDir = Path.GetDirectoryName(currentDllPath);
            var tempDllPath = Path.Combine(Path.GetTempPath(), "BPRRaceControl_update.dll");
            var batchPath = Path.Combine(Path.GetTempPath(), "bpr_update.bat");

            SimHub.Logging.Current.Info("[BPR Updater] Downloading from: " + _downloadUrl);
            SimHub.Logging.Current.Info("[BPR Updater] Target: " + currentDllPath);

            // Download the new DLL
            using (var client = new WebClient())
            {
                client.Headers.Add("User-Agent", "BPRRaceControl/" + CurrentVersion);
                client.DownloadFile(_downloadUrl, tempDllPath);
            }

            SimHub.Logging.Current.Info("[BPR Updater] Downloaded DLL to: " + tempDllPath);

            // Download extra assets (logo, etc.) directly to SimHub folder
            foreach (var asset in _extraAssets)
            {
                try
                {
                    var destPath = Path.Combine(simhubDir, asset.Key);
                    using (var client = new WebClient())
                    {
                        client.Headers.Add("User-Agent", "BPRRaceControl/" + CurrentVersion);
                        client.DownloadFile(asset.Value, destPath);
                    }
                    SimHub.Logging.Current.Info("[BPR Updater] Downloaded asset: " + asset.Key);
                }
                catch (Exception ex)
                {
                    SimHub.Logging.Current.Error("[BPR Updater] Asset download failed: " + asset.Key + " — " + ex.Message);
                }
            }

            // Find SimHub executable path
            var simhubExe = Path.Combine(simhubDir, "SimHubWPF.exe");

            // Write a batch script that:
            // 1. Waits for SimHub to close
            // 2. Copies the new DLL over the old one
            // 3. Restarts SimHub
            var batchContent = string.Format(
                "@echo off\r\n" +
                "echo BPR Race Control - Updating plugin...\r\n" +
                "echo Waiting for SimHub to close...\r\n" +
                ":wait\r\n" +
                "tasklist /FI \"IMAGENAME eq SimHubWPF.exe\" 2>NUL | find /I \"SimHubWPF.exe\" >NUL\r\n" +
                "if not errorlevel 1 (\r\n" +
                "    timeout /t 1 /nobreak >NUL\r\n" +
                "    goto wait\r\n" +
                ")\r\n" +
                "echo SimHub closed. Applying update...\r\n" +
                "timeout /t 2 /nobreak >NUL\r\n" +
                "copy /Y \"{0}\" \"{1}\" >NUL\r\n" +
                "if errorlevel 1 (\r\n" +
                "    echo ERROR: Could not copy update file.\r\n" +
                "    echo Please manually copy {0} to {1}\r\n" +
                "    pause\r\n" +
                "    exit /b 1\r\n" +
                ")\r\n" +
                "echo Update applied successfully!\r\n" +
                "del \"{0}\" >NUL 2>&1\r\n" +
                "echo Restarting SimHub...\r\n" +
                "start \"\" \"{2}\"\r\n" +
                "del \"%~f0\" >NUL 2>&1\r\n",
                tempDllPath, currentDllPath, simhubExe);

            File.WriteAllText(batchPath, batchContent);

            // Write a VBScript wrapper to run the batch silently (no console window)
            var vbsPath = Path.Combine(Path.GetTempPath(), "bpr_update.vbs");
            File.WriteAllText(vbsPath,
                "CreateObject(\"Wscript.Shell\").Run \"\"\"" +
                batchPath.Replace("\\", "\\\\") +
                "\"\"\", 0, False\r\n");

            SimHub.Logging.Current.Info("[BPR Updater] Update scripts written");

            // Launch via wscript (completely hidden, no console flash)
            var psi = new ProcessStartInfo
            {
                FileName = "wscript.exe",
                Arguments = "\"" + vbsPath + "\"",
                WindowStyle = ProcessWindowStyle.Hidden,
                CreateNoWindow = true,
                UseShellExecute = false,
            };
            Process.Start(psi);

            SimHub.Logging.Current.Info("[BPR Updater] Updater launched, closing SimHub...");

            // Close SimHub — the batch script will wait for it, then replace the DLL
            System.Windows.Application.Current?.Dispatcher?.BeginInvoke(new Action(() =>
            {
                System.Windows.Application.Current?.Shutdown();
            }));
        }
    }
}
