using System.Windows;
using static DeskVac.Native.NativeMethods;

namespace DeskVac.Native;

/// <summary>Monitor w fizycznych pikselach wirtualnego ekranu.</summary>
public sealed record MonitorInfo(IntPtr Handle, Rect Bounds, Rect WorkArea, double Scale, bool IsPrimary);

public static class Monitors
{
    public static List<MonitorInfo> GetAll()
    {
        var list = new List<MonitorInfo>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr hdc, ref RECT r, IntPtr data) =>
        {
            var mi = new MONITORINFOEX { cbSize = System.Runtime.InteropServices.Marshal.SizeOf<MONITORINFOEX>() };
            if (GetMonitorInfo(h, ref mi))
            {
                double scale = 1.0;
                try
                {
                    if (GetDpiForMonitor(h, MDT_EFFECTIVE_DPI, out var dx, out _) == 0 && dx > 0) scale = dx / 96.0;
                }
                catch (Exception)
                {
                    // Windows bez shcore – zostaje 100%
                }
                list.Add(new MonitorInfo(h, ToRect(mi.rcMonitor), ToRect(mi.rcWork), scale, (mi.dwFlags & MONITORINFOF_PRIMARY) != 0));
            }
            return true;
        }, IntPtr.Zero);

        if (list.Count == 0)
            list.Add(new MonitorInfo(IntPtr.Zero, new Rect(0, 0, 1920, 1080), new Rect(0, 0, 1920, 1040), 1, true));
        return list;
    }

    public static MonitorInfo Primary(IReadOnlyList<MonitorInfo> all) => all.FirstOrDefault(m => m.IsPrimary) ?? all[0];

    /// <summary>Monitor zawierający punkt, a gdy punkt leży poza wszystkimi – najbliższy.</summary>
    public static MonitorInfo At(IReadOnlyList<MonitorInfo> all, Point p)
    {
        foreach (var m in all)
            if (m.Bounds.Contains(p)) return m;
        return all.OrderBy(m => DistanceSq(m.Bounds, p)).First();
    }

    /// <summary>Prostokąt obejmujący wszystkie monitory.</summary>
    public static Rect Union(IReadOnlyList<MonitorInfo> all)
    {
        var r = all[0].Bounds;
        foreach (var m in all.Skip(1)) r.Union(m.Bounds);
        return r;
    }

    private static double DistanceSq(Rect r, Point p)
    {
        double dx = Math.Max(Math.Max(r.Left - p.X, 0), p.X - r.Right);
        double dy = Math.Max(Math.Max(r.Top - p.Y, 0), p.Y - r.Bottom);
        return dx * dx + dy * dy;
    }

    private static Rect ToRect(RECT r) => new(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
}
