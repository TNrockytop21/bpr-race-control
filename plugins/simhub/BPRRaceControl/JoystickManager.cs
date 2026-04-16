using System;
using System.Threading;
using System.Threading.Tasks;
using SharpDX.DirectInput;

namespace BPRRaceControl
{
    /// <summary>
    /// Manages joystick/wheel button capture and polling for the protest binding.
    /// Uses SharpDX.DirectInput (bundled with SimHub).
    /// </summary>
    public class JoystickManager : IDisposable
    {
        private DirectInput _directInput;
        private Joystick _boundDevice;
        private Guid _boundDeviceGuid;
        private int _boundButton = -1;
        private bool _lastButtonState;

        /// <summary>Raised when the bound button is pressed (transition from up to down).</summary>
        public event Action OnButtonPressed;

        /// <summary>Raised during capture when a button is detected.</summary>
        public event Action<string, Guid, int> OnButtonCaptured;

        private volatile bool _capturing;
        private CancellationTokenSource _captureCts;

        public JoystickManager()
        {
            _directInput = new DirectInput();
        }

        /// <summary>
        /// Load a previously saved binding and start polling.
        /// </summary>
        public void LoadBinding(string deviceGuid, int buttonIndex)
        {
            if (string.IsNullOrEmpty(deviceGuid) || buttonIndex < 0) return;

            try
            {
                _boundDeviceGuid = Guid.Parse(deviceGuid);
                _boundButton = buttonIndex;
                OpenDevice(_boundDeviceGuid);
                SimHub.Logging.Current.Info("[BPR Joystick] Loaded binding: button " + buttonIndex);
            }
            catch (Exception ex)
            {
                SimHub.Logging.Current.Error("[BPR Joystick] Failed to load binding: " + ex.Message);
            }
        }

        /// <summary>
        /// Poll the bound button. Call from DataUpdate (60Hz).
        /// Fires OnButtonPressed on rising edge only.
        /// </summary>
        public void Poll()
        {
            if (_boundDevice == null || _boundButton < 0) return;

            try
            {
                _boundDevice.Poll();
                var state = _boundDevice.GetCurrentState();
                var buttons = state.Buttons;
                if (_boundButton >= buttons.Length) return;

                bool pressed = buttons[_boundButton];
                if (pressed && !_lastButtonState)
                {
                    // Rising edge — button just pressed
                    OnButtonPressed?.Invoke();
                }
                _lastButtonState = pressed;
            }
            catch (SharpDX.SharpDXException)
            {
                // Device disconnected — try to reopen
                try
                {
                    _boundDevice?.Dispose();
                    _boundDevice = null;
                    OpenDevice(_boundDeviceGuid);
                }
                catch { _boundDevice = null; }
            }
            catch { }
        }

        /// <summary>
        /// Start capture mode — listens for ANY button press on ANY device.
        /// When a button is pressed, fires OnButtonCaptured(deviceName, deviceGuid, buttonIndex).
        /// </summary>
        public void StartCapture()
        {
            if (_capturing) return;
            _capturing = true;
            _captureCts = new CancellationTokenSource();

            Task.Run(() =>
            {
                try
                {
                    CaptureLoop(_captureCts.Token);
                }
                catch (OperationCanceledException) { }
                catch (Exception ex)
                {
                    SimHub.Logging.Current.Error("[BPR Joystick] Capture error: " + ex.Message);
                }
                finally
                {
                    _capturing = false;
                }
            });
        }

        /// <summary>Stop capture mode.</summary>
        public void StopCapture()
        {
            _captureCts?.Cancel();
        }

        private void CaptureLoop(CancellationToken ct)
        {
            var devices = _directInput.GetDevices(DeviceClass.GameControl, DeviceEnumerationFlags.AllDevices);

            // Open all game controllers
            var joysticks = new System.Collections.Generic.List<Tuple<Joystick, string>>();
            foreach (var dev in devices)
            {
                try
                {
                    var js = new Joystick(_directInput, dev.InstanceGuid);
                    js.Acquire();
                    joysticks.Add(Tuple.Create(js, dev.InstanceName));
                }
                catch { }
            }

            if (joysticks.Count == 0)
            {
                SimHub.Logging.Current.Info("[BPR Joystick] No game controllers found");
                return;
            }

            // Record initial button states (ignore buttons already held down)
            var initialStates = new bool[joysticks.Count][];
            for (int i = 0; i < joysticks.Count; i++)
            {
                try
                {
                    joysticks[i].Item1.Poll();
                    initialStates[i] = joysticks[i].Item1.GetCurrentState().Buttons;
                }
                catch
                {
                    initialStates[i] = new bool[0];
                }
            }

            // Poll until a NEW button press is detected
            while (!ct.IsCancellationRequested)
            {
                for (int i = 0; i < joysticks.Count; i++)
                {
                    try
                    {
                        joysticks[i].Item1.Poll();
                        var state = joysticks[i].Item1.GetCurrentState();
                        var buttons = state.Buttons;

                        for (int b = 0; b < buttons.Length; b++)
                        {
                            bool wasPressed = b < initialStates[i].Length && initialStates[i][b];
                            if (buttons[b] && !wasPressed)
                            {
                                // New button press detected!
                                var deviceName = joysticks[i].Item2;
                                var deviceGuid = joysticks[i].Item1.Information.InstanceGuid;

                                // Cleanup
                                foreach (var js in joysticks)
                                {
                                    try { js.Item1.Unacquire(); js.Item1.Dispose(); } catch { }
                                }

                                OnButtonCaptured?.Invoke(deviceName, deviceGuid, b);
                                return;
                            }
                        }

                        // Update initial states for released buttons
                        initialStates[i] = buttons;
                    }
                    catch { }
                }

                Thread.Sleep(10); // 100Hz polling during capture
            }

            // Cleanup on cancel
            foreach (var js in joysticks)
            {
                try { js.Item1.Unacquire(); js.Item1.Dispose(); } catch { }
            }
        }

        /// <summary>
        /// Apply a captured binding — close old device, open new one.
        /// </summary>
        public void SetBinding(Guid deviceGuid, int buttonIndex)
        {
            try { _boundDevice?.Unacquire(); _boundDevice?.Dispose(); } catch { }
            _boundDevice = null;
            _boundDeviceGuid = deviceGuid;
            _boundButton = buttonIndex;
            _lastButtonState = false;
            OpenDevice(deviceGuid);
        }

        /// <summary>Clear the current binding.</summary>
        public void ClearBinding()
        {
            try { _boundDevice?.Unacquire(); _boundDevice?.Dispose(); } catch { }
            _boundDevice = null;
            _boundButton = -1;
            _lastButtonState = false;
        }

        private void OpenDevice(Guid deviceGuid)
        {
            try
            {
                _boundDevice = new Joystick(_directInput, deviceGuid);
                _boundDevice.Acquire();
            }
            catch (Exception ex)
            {
                _boundDevice = null;
                SimHub.Logging.Current.Error("[BPR Joystick] Could not open device: " + ex.Message);
            }
        }

        public void Dispose()
        {
            _captureCts?.Cancel();
            try { _boundDevice?.Unacquire(); _boundDevice?.Dispose(); } catch { }
            _directInput?.Dispose();
        }
    }
}
