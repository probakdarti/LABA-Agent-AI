using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using DeskVac.Native;
using Microsoft.Win32;

namespace DeskVac.Platform;

/// <summary>
/// Motywy okien: Ciemny (domyślny), Jasny i Systemowy (jak „Tryb aplikacji” w Windows, przełączany na żywo).
/// Kolory są zasobami aplikacji podpinanymi przez DynamicResource – podmiana pędzli odświeża wszystkie okna.
/// Robot, stacja i animacje na pulpicie nie zmieniają się (są projektowane na tapetę).
/// </summary>
public static class Theme
{
    private static readonly Dictionary<string, string> Dark = new()
    {
        ["Bg"] = "#0F1216", ["Card"] = "#181C22", ["CardBorder"] = "#262C34",
        ["Accent"] = "#2EE6C5", ["AccentDark"] = "#0F3B35", ["AccentText"] = "#0B1F1C",
        ["Text"] = "#E8ECEF", ["Muted"] = "#8A93A0", ["Warn"] = "#FFB33B",
        ["ButtonBg"] = "#232932", ["ButtonBorder"] = "#2F3640",
        ["FieldBg"] = "#10141A", ["FieldBorder"] = "#2F3640",
        ["Track"] = "#262C34", ["BinFill"] = "#F2F4F6",
        ["DropBg"] = "#151A1F", ["DropBorder"] = "#3A3220", ["DropActive"] = "#FFB33B",
        ["RowBg"] = "#12161B", ["FooterBg"] = "#12161B",
        ["MapBg"] = "#101317", ["MapInk"] = "#FFFFFF", ["MapRobot"] = "#F4F6F8", ["MapDock"] = "#3A414B",
        ["LogoBg"] = "#1F242B", ["LogoDot"] = "#F2F4F6",
    };

    private static readonly Dictionary<string, string> Light = new()
    {
        ["Bg"] = "#F3F5F7", ["Card"] = "#FFFFFF", ["CardBorder"] = "#DDE2E7",
        ["Accent"] = "#0E9F86", ["AccentDark"] = "#D5F3EE", ["AccentText"] = "#FFFFFF",
        ["Text"] = "#15191E", ["Muted"] = "#5F6B78", ["Warn"] = "#A85F00",
        ["ButtonBg"] = "#E9EDF1", ["ButtonBorder"] = "#D3D9DF",
        ["FieldBg"] = "#FFFFFF", ["FieldBorder"] = "#C9D0D7",
        ["Track"] = "#E1E6EA", ["BinFill"] = "#3A424C",
        ["DropBg"] = "#FFF8EC", ["DropBorder"] = "#E9C98A", ["DropActive"] = "#C77700",
        ["RowBg"] = "#F5F7F9", ["FooterBg"] = "#E9EDF1",
        ["MapBg"] = "#EEF1F4", ["MapInk"] = "#15191E", ["MapRobot"] = "#FFFFFF", ["MapDock"] = "#9AA4AF",
        ["LogoBg"] = "#E9EDF1", ["LogoDot"] = "#15191E",
    };

    private static string _setting = "dark";
    private static bool _hooked;

    public static bool IsDark { get; private set; } = true;

    /// <summary>setting: "dark", "light" albo "system".</summary>
    public static void Apply(string setting)
    {
        _setting = setting;
        IsDark = setting switch
        {
            "light" => false,
            "system" => SystemUsesDarkApps(),
            _ => true,
        };

        var res = Application.Current.Resources;
        foreach (var (key, hex) in IsDark ? Dark : Light)
        {
            var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
            brush.Freeze();
            res[key] = brush;
        }
        foreach (Window w in Application.Current.Windows) ApplyTitleBar(w);

        if (!_hooked)
        {
            _hooked = true;
            // zmiana „Tryb aplikacji” w Ustawieniach Windows – motyw systemowy przełącza się sam
            SystemEvents.UserPreferenceChanged += (_, e) =>
            {
                if (_setting == "system" && e.Category is UserPreferenceCategory.General or UserPreferenceCategory.Color)
                    Application.Current?.Dispatcher.BeginInvoke(() => Apply("system"));
            };
        }
    }

    /// <summary>Ciemny lub jasny pasek tytułu okna (Windows 10 20H1+ / 11).</summary>
    public static void ApplyTitleBar(Window w)
    {
        try
        {
            var h = new WindowInteropHelper(w).Handle;
            if (h == IntPtr.Zero) return;
            int dark = IsDark ? 1 : 0;
            NativeMethods.DwmSetWindowAttribute(h, NativeMethods.DWMWA_USE_IMMERSIVE_DARK_MODE, ref dark, sizeof(int));
        }
        catch (Exception)
        {
            // starszy Windows – domyślny pasek
        }
    }

    public static Brush Brush(string key) => (Brush)Application.Current.Resources[key];

    public static Color Color(string key) => Brush(key) is SolidColorBrush b ? b.Color : Colors.Gray;

    private static bool SystemUsesDarkApps()
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return k?.GetValue("AppsUseLightTheme") is int v ? v == 0 : true;
        }
        catch (Exception)
        {
            return true;
        }
    }
}
