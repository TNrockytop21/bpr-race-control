// iRacing SDK Bridge — Lightweight command-line tool for sending
// iRacing BroadcastMsg commands from the Electron steward app.
//
// Usage:
//   irsdk-bridge.exe replay-jump <sessionTime>
//   irsdk-bridge.exe replay-speed <speed>
//   irsdk-bridge.exe replay-pause
//   irsdk-bridge.exe replay-play
//   irsdk-bridge.exe camera <carIdx> <camGroupName>
//   irsdk-bridge.exe status
//
// Returns JSON to stdout for Electron to parse.

using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

class IRSDKBridge
{
    // iRacing BroadcastMsg IDs
    const int BroadcastCamSwitchNum = 0;
    const int BroadcastReplaySetPlaySpeed = 1;
    const int BroadcastReplaySetPlayPosition = 2;
    const int BroadcastReplaySearch = 3;
    const int BroadcastReplaySetState = 4;

    // ReplaySearchMode
    const int ReplaySearchToStart = 0;
    const int ReplaySearchToEnd = 1;
    const int ReplaySearchPrevSession = 2;
    const int ReplaySearchNextSession = 3;
    const int ReplaySearchPrevLap = 4;
    const int ReplaySearchNextLap = 5;
    const int ReplaySearchPrevFrame = 6;
    const int ReplaySearchNextFrame = 7;
    const int ReplaySearchPrevIncident = 8;
    const int ReplaySearchNextIncident = 9;

    // ReplayStateMode
    const int StateEraseTape = 0;

    // ReplayPosMode
    const int ReplayPosBegin = 0;
    const int ReplayPosCurrent = 1;
    const int ReplayPosEnd = 2;

    // Camera groups (common iRacing camera names -> group numbers)
    // These vary by track but typical defaults:
    // 1=Nose, 2=Gearbox, 3=TrailFar, 4=TrailNear, 5=Chase, 6=FarChase,
    // 7=GyroCam, 8=LF Susp, 9=RF Susp, 10=Cockpit, 11=TV1, 12=TV2, 13=TV3,
    // 14=Scenic, 15=Blimp, 16=Chopper, 17=RearChase, 18=Pit Lane

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint RegisterWindowMessage(string lpString);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SendNotifyMessage(IntPtr hWnd, uint msg, uint wParam, uint lParam);

    static readonly IntPtr HWND_BROADCAST = new IntPtr(0xFFFF);

    static uint irsdk_broadcastMsgId;

    static uint MakeLong(ushort lo, ushort hi)
    {
        return (uint)(lo | (hi << 16));
    }

    static void SendBroadcast(int msgId, int var1, int var2, int var3)
    {
        if (irsdk_broadcastMsgId == 0)
            irsdk_broadcastMsgId = RegisterWindowMessage("IRSDK_BROADCASTMSG");

        uint wParam = MakeLong((ushort)(msgId & 0xFFFF), (ushort)(var1 & 0xFFFF));
        uint lParam = MakeLong((ushort)(var2 & 0xFFFF), (ushort)(var3 & 0xFFFF));
        SendNotifyMessage(HWND_BROADCAST, irsdk_broadcastMsgId, wParam, lParam);
    }

    static void SendBroadcast(int msgId, int var1, float var2)
    {
        if (irsdk_broadcastMsgId == 0)
            irsdk_broadcastMsgId = RegisterWindowMessage("IRSDK_BROADCASTMSG");

        // For replay speed, var2 is encoded as an int (speed * 1 for integer speeds,
        // or use the slow-motion encoding)
        int var2Int = (int)var2;
        uint wParam = MakeLong((ushort)(msgId & 0xFFFF), (ushort)(var1 & 0xFFFF));
        uint lParam = MakeLong((ushort)(var2Int & 0xFFFF), 0);
        SendNotifyMessage(HWND_BROADCAST, irsdk_broadcastMsgId, wParam, lParam);
    }

    static bool IsIRacingRunning()
    {
        var procs = Process.GetProcessesByName("iRacingSim64DX11");
        if (procs.Length > 0) return true;
        procs = Process.GetProcessesByName("iRacingSim64");
        return procs.Length > 0;
    }

    static int ParseCameraGroup(string name)
    {
        // Map common camera names to typical iRacing group numbers
        switch (name.ToLower())
        {
            case "nose": return 1;
            case "gearbox": return 2;
            case "far": case "trailfar": return 3;
            case "near": case "trailnear": return 4;
            case "chase": return 5;
            case "farchase": return 6;
            case "gyro": case "gyrocam": return 7;
            case "cockpit": return 10;
            case "tv1": return 11;
            case "tv2": return 12;
            case "tv3": return 13;
            case "scenic": return 14;
            case "blimp": return 15;
            case "chopper": case "helicopter": return 16;
            case "rearchase": return 17;
            case "pitlane": return 18;
            default:
                int num;
                if (int.TryParse(name, out num)) return num;
                return 5; // Default to chase
        }
    }

    static void Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.WriteLine("{\"ok\":false,\"error\":\"No command\"}");
            return;
        }

        string cmd = args[0].ToLower();

        if (cmd == "status")
        {
            bool running = IsIRacingRunning();
            Console.WriteLine("{\"ok\":true,\"connected\":" + (running ? "true" : "false") +
                ",\"message\":\"" + (running ? "iRacing detected" : "iRacing not running") + "\"}");
            return;
        }

        if (!IsIRacingRunning())
        {
            Console.WriteLine("{\"ok\":false,\"error\":\"iRacing not running\"}");
            return;
        }

        switch (cmd)
        {
            case "replay-jump":
            {
                if (args.Length < 2)
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"Missing sessionTime\"}");
                    return;
                }
                double sessionTime;
                if (!double.TryParse(args[1], out sessionTime))
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"Invalid sessionTime\"}");
                    return;
                }
                // Convert sessionTime to frame number (60fps)
                int frameNum = (int)(sessionTime * 60.0);
                SendBroadcast(BroadcastReplaySetPlayPosition, (int)ReplayPosBegin, frameNum, 0);
                Console.WriteLine("{\"ok\":true,\"action\":\"replay-jump\",\"sessionTime\":" + sessionTime + "}");
                break;
            }

            case "replay-speed":
            {
                if (args.Length < 2)
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"Missing speed\"}");
                    return;
                }
                float speed;
                if (!float.TryParse(args[1], out speed))
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"Invalid speed\"}");
                    return;
                }
                // slowMotion flag: true if speed < 1 and speed > 0
                int slowMotion = (speed > 0 && speed < 1) ? 1 : 0;
                int speedInt;
                if (slowMotion == 1)
                {
                    // Slow motion: encode as 1/N where N is the divisor
                    speedInt = (int)(1.0f / speed);
                }
                else
                {
                    speedInt = (int)speed;
                }
                SendBroadcast(BroadcastReplaySetPlaySpeed, speedInt, slowMotion, 0);
                Console.WriteLine("{\"ok\":true,\"action\":\"replay-speed\",\"speed\":" + speed + "}");
                break;
            }

            case "replay-pause":
            {
                SendBroadcast(BroadcastReplaySetPlaySpeed, 0, 0, 0);
                Console.WriteLine("{\"ok\":true,\"action\":\"replay-pause\"}");
                break;
            }

            case "replay-play":
            {
                SendBroadcast(BroadcastReplaySetPlaySpeed, 1, 0, 0);
                Console.WriteLine("{\"ok\":true,\"action\":\"replay-play\"}");
                break;
            }

            case "replay-search":
            {
                if (args.Length < 2)
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"Missing search mode\"}");
                    return;
                }
                int searchMode;
                switch (args[1].ToLower())
                {
                    case "start": searchMode = ReplaySearchToStart; break;
                    case "end": searchMode = ReplaySearchToEnd; break;
                    case "prev-incident": searchMode = ReplaySearchPrevIncident; break;
                    case "next-incident": searchMode = ReplaySearchNextIncident; break;
                    case "prev-lap": searchMode = ReplaySearchPrevLap; break;
                    case "next-lap": searchMode = ReplaySearchNextLap; break;
                    default:
                        Console.WriteLine("{\"ok\":false,\"error\":\"Unknown search mode\"}");
                        return;
                }
                SendBroadcast(BroadcastReplaySearch, searchMode, 0, 0);
                Console.WriteLine("{\"ok\":true,\"action\":\"replay-search\",\"mode\":\"" + args[1] + "\"}");
                break;
            }

            case "camera":
            {
                if (args.Length < 3)
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"Usage: camera <carIdx> <group>\"}");
                    return;
                }
                int carIdx;
                if (!int.TryParse(args[1], out carIdx))
                {
                    Console.WriteLine("{\"ok\":false,\"error\":\"Invalid carIdx\"}");
                    return;
                }
                int camGroup = ParseCameraGroup(args[2]);
                // CamSwitchNum: var1=carIdx+1 (1-based), var2=camGroupNum, var3=0
                SendBroadcast(BroadcastCamSwitchNum, carIdx + 1, camGroup, 0);
                Console.WriteLine("{\"ok\":true,\"action\":\"camera\",\"carIdx\":" + carIdx +
                    ",\"camGroup\":" + camGroup + "}");
                break;
            }

            default:
                Console.WriteLine("{\"ok\":false,\"error\":\"Unknown command: " + cmd + "\"}");
                break;
        }
    }
}
