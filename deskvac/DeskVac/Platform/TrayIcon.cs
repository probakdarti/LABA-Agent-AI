using System.Runtime.InteropServices;
using System.Windows.Interop;

namespace DeskVac.Platform;

/// <summary>Ikona w zasobniku systemowym (obok zegara) – czyste Shell_NotifyIcon, bez WinForms.</summary>
public sealed class TrayIcon : IDisposable
{
    private const int WM_APP_TRAY = 0x8000 + 42;
    private const int WM_LBUTTONUP = 0x0202;
    private const int WM_RBUTTONUP = 0x0205;
    private const int WM_LBUTTONDBLCLK = 0x0203;
    private const uint NIM_ADD = 0, NIM_MODIFY = 1, NIM_DELETE = 2;
    private const uint NIF_MESSAGE = 1, NIF_ICON = 2, NIF_TIP = 4;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATA
    {
        public int cbSize;
        public IntPtr hWnd;
        public uint uID;
        public uint uFlags;
        public uint uCallbackMessage;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
        public uint dwState;
        public uint dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
        public uint uVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public IntPtr hBalloonIcon;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool Shell_NotifyIcon(uint dwMessage, ref NOTIFYICONDATA data);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern uint ExtractIconEx(string file, int index, IntPtr[]? large, IntPtr[] small, uint count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint RegisterWindowMessage(string msg);

    private readonly HwndSource _source;
    private readonly IntPtr _icon;
    private readonly uint _taskbarCreated;
    private NOTIFYICONDATA _data;

    public event Action? LeftClick;
    public event Action? RightClick;

    public IntPtr Handle => _source.Handle;

    public TrayIcon(string tooltip)
    {
        _source = new HwndSource(new HwndSourceParameters("DeskVacTray") { Width = 0, Height = 0, WindowStyle = 0 });
        _source.AddHook(WndProc);
        _taskbarCreated = RegisterWindowMessage("TaskbarCreated");

        var small = new IntPtr[1];
        ExtractIconEx(ShellIntegration.ExePath, 0, null, small, 1);
        _icon = small[0];

        _data = new NOTIFYICONDATA
        {
            cbSize = Marshal.SizeOf<NOTIFYICONDATA>(),
            hWnd = _source.Handle,
            uID = 1,
            uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP,
            uCallbackMessage = WM_APP_TRAY,
            hIcon = _icon,
            szTip = tooltip,
            szInfo = "",
            szInfoTitle = "",
        };
        Shell_NotifyIcon(NIM_ADD, ref _data);
    }

    public void SetTooltip(string text)
    {
        _data.szTip = text.Length > 120 ? text[..120] : text;
        Shell_NotifyIcon(NIM_MODIFY, ref _data);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_APP_TRAY)
        {
            int ev = (int)(lParam.ToInt64() & 0xFFFF);
            if (ev == WM_LBUTTONUP || ev == WM_LBUTTONDBLCLK) LeftClick?.Invoke();
            else if (ev == WM_RBUTTONUP) RightClick?.Invoke();
            handled = true;
        }
        else if (msg == _taskbarCreated)
        {
            // Explorer się zrestartował – trzeba dodać ikonę ponownie
            Shell_NotifyIcon(NIM_ADD, ref _data);
        }
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        Shell_NotifyIcon(NIM_DELETE, ref _data);
        _source.RemoveHook(WndProc);
        _source.Dispose();
    }
}
