using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using DeskVac.Native;
using static DeskVac.Native.NativeMethods;

namespace DeskVac.Overlay;

/// <summary>
/// Przezroczyste okno na cały wirtualny ekran, przepuszczające kliknięcia myszy,
/// niewidoczne na pasku zadań i w Alt+Tab. Na nim jeździ robot.
/// </summary>
public sealed class OverlayWindow : Window
{
    public Stage Stage { get; } = new();

    public OverlayWindow()
    {
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        ShowActivated = false;
        Topmost = true;
        Title = "DeskVac overlay";

        Left = SystemParameters.VirtualScreenLeft;
        Top = SystemParameters.VirtualScreenTop;
        Width = SystemParameters.VirtualScreenWidth;
        Height = SystemParameters.VirtualScreenHeight;

        Content = Stage;
        SourceInitialized += (_, _) => MakeClickThrough();
    }

    private void MakeClickThrough()
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        var ex = GetWindowLongPtr(hwnd, GWL_EXSTYLE).ToInt64();
        ex |= WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, new IntPtr(ex));
    }

    /// <summary>Zamienia fizyczne współrzędne ekranu na DIP w układzie nakładki.</summary>
    public static Point PhysicalToLocal(double x, double y, double dpiScale)
    {
        int vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        int vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        return new Point((x - vx) / dpiScale, (y - vy) / dpiScale);
    }

    /// <summary>Lewy górny róg stacji dokującej: prawy dolny róg obszaru roboczego monitora głównego (nad paskiem zadań).</summary>
    public static Point DefaultDockTop()
    {
        var wa = SystemParameters.WorkArea;
        return new Point(
            wa.Right - 120 - SystemParameters.VirtualScreenLeft,
            wa.Bottom - Stage.Radius * 1.15 - 18 - SystemParameters.VirtualScreenTop);
    }
}
