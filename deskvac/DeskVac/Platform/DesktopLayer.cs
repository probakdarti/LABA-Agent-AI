using System.Text;
using static DeskVac.Native.NativeMethods;

namespace DeskVac.Platform;

/// <summary>
/// Okna „przyklejone do pulpitu”: leżą tuż nad tapetą i ikonami, pod wszystkimi programami.
/// Gdy użytkownik pokaże pulpit (Win+D, kliknięcie w pulpit), wychodzą na wierzch, żeby nie zniknęły.
/// </summary>
public sealed class DesktopLayer : IDisposable
{
    private readonly List<IntPtr> _windows = new();
    private readonly WinEventDelegate _callback; // trzymamy referencję – inaczej GC zbierze delegat
    private readonly IntPtr _hook;

    public DesktopLayer()
    {
        _callback = OnForegroundChanged;
        _hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, IntPtr.Zero, _callback, 0, 0, WINEVENT_OUTOFCONTEXT);
    }

    public void Add(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || _windows.Contains(hwnd)) return;
        _windows.Add(hwnd);
        Arrange(GetForegroundWindow());
    }

    public void Remove(IntPtr hwnd) => _windows.Remove(hwnd);

    /// <summary>Ponowne ułożenie (np. po pokazaniu okna).</summary>
    public void Refresh() => Arrange(GetForegroundWindow());

    private void OnForegroundChanged(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time) =>
        Arrange(hwnd);

    private void Arrange(IntPtr foreground)
    {
        if (_windows.Contains(foreground)) return; // klik w nasze okno – nic nie zmieniamy
        bool desktopShown = IsDesktopWindow(foreground);
        foreach (var w in _windows)
        {
            if (desktopShown)
                SetWindowPos(w, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
            else
                PlaceAboveDesktop(w);
        }
    }

    /// <summary>Umieszcza okno bezpośrednio nad oknem pulpitu (pod wszystkimi programami).</summary>
    public static void PlaceAboveDesktop(IntPtr hwnd)
    {
        var shell = GetShellWindow();
        if (shell == IntPtr.Zero) return;
        var above = GetWindow(shell, GW_HWNDPREV);
        if (above == hwnd) return;
        SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        if (above != IntPtr.Zero)
            SetWindowPos(hwnd, above, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }

    public static bool IsDesktopWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return false;
        var root = GetAncestor(hwnd, GA_ROOT);
        var sb = new StringBuilder(64);
        GetClassName(root == IntPtr.Zero ? hwnd : root, sb, sb.Capacity);
        var cls = sb.ToString();
        return cls is "Progman" or "WorkerW";
    }

    public void Dispose()
    {
        if (_hook != IntPtr.Zero) UnhookWinEvent(_hook);
        _windows.Clear();
    }
}
