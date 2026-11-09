using Microsoft.Win32;
using DeskVac.Core;

namespace DeskVac.Platform;

/// <summary>Autostart (HKCU\…\Run) i pozycja „Nie odkurzaj!” w klasycznym menu kontekstowym. Bez uprawnień administratora.</summary>
public static class ShellIntegration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValue = "DeskVac";
    private const string VerbKey = @"Software\Classes\AllFilesystemObjects\shell\DeskVac.Protect";
    private const string ProtectKey = @"Software\Classes\AllFilesystemObjects\shell\DeskVac.NoVacuum";
    private const string AllowKey = @"Software\Classes\AllFilesystemObjects\shell\DeskVac.AllowVacuum";

    public static string ExePath => Environment.ProcessPath ?? System.Reflection.Assembly.GetExecutingAssembly().Location;

    /// <summary>Uzgadnia rejestr z ustawieniami (także po przeniesieniu programu w inne miejsce).</summary>
    public static void Sync(AppSettings s)
    {
        SetAutostart(s.StartWithWindows);
        RegisterContextMenu(s.ContextMenuOnlyOnDesktop, s.ProtectedPaths);
    }

    /// <summary>Czy autostart jest włączony. To rejestr jest źródłem prawdy (ustawia go instalator albo okno ustawień).</summary>
    public static bool IsAutostartEnabled()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(RunValue) is string;
        }
        catch (Exception)
        {
            return false;
        }
    }

    public static void SetAutostart(bool enabled)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey);
            if (enabled) key.SetValue(RunValue, $"\"{ExePath}\" --tray");
            else key.DeleteValue(RunValue, false);
        }
        catch (Exception)
        {
            // brak dostępu do rejestru – autostart po prostu nie zadziała
        }
    }

    /// <summary>
    /// Dwie pozycje klasycznego menu kontekstowego, pokazywane warunkowo (AppliesTo):
    /// „Nie odkurzaj!” – dla elementów pulpitu, które NIE są chronione,
    /// „Pozwól odkurzać!” – tylko dla elementów chronionych.
    /// Warunki zawierają listę chronionych ścieżek, więc odświeżamy je przy każdej zmianie listy.
    /// </summary>
    public static void RegisterContextMenu(bool onlyOnDesktop, IReadOnlyCollection<string> protectedPaths)
    {
        try
        {
            static string Q(string path) => "\"" + path.Replace("\"", "") + "\"";
            string? desktopFilter = null;
            if (onlyOnDesktop)
            {
                var desktops = new[]
                    {
                        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                        Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
                    }
                    .Where(d => !string.IsNullOrEmpty(d))
                    .Select(d => "System.ParsingPath:~<" + Q(d.TrimEnd('\\') + "\\"));
                desktopFilter = "(" + string.Join(" OR ", desktops) + ")";
            }
            string? protectedFilter = protectedPaths.Count == 0
                ? null
                : "(" + string.Join(" OR ", protectedPaths.Select(p => "System.ParsingPath:=" + Q(p))) + ")";

            // „Nie odkurzaj!”
            string? protectWhen = (desktopFilter, protectedFilter) switch
            {
                (null, null) => null,
                (not null, null) => desktopFilter,
                (null, not null) => "NOT " + protectedFilter,
                _ => desktopFilter + " AND NOT " + protectedFilter,
            };
            WriteVerb(ProtectKey, "Nie odkurzaj!", "--protect", protectWhen);

            // „Pozwól odkurzać!” – tylko gdy coś jest chronione
            if (protectedFilter is null)
                Registry.CurrentUser.DeleteSubKeyTree(AllowKey, false);
            else
                WriteVerb(AllowKey, "Pozwól odkurzać!", "--unprotect", protectedFilter);

            // stara, pojedyncza pozycja z wersji 0.2
            Registry.CurrentUser.DeleteSubKeyTree(VerbKey, false);

            // powiedz Eksploratorowi, że skojarzenia się zmieniły
            SHChangeNotify(SHCNE_ASSOCCHANGED, 0, IntPtr.Zero, IntPtr.Zero);
        }
        catch (Exception)
        {
            // menu kontekstowe niedostępne – zostaje lista w ustawieniach
        }
    }

    private static void WriteVerb(string keyPath, string label, string arg, string? appliesTo)
    {
        using var key = Registry.CurrentUser.CreateSubKey(keyPath);
        key.SetValue("MUIVerb", label);
        key.SetValue("Icon", $"\"{ExePath}\",0");
        key.SetValue("MultiSelectModel", "Document");
        if (appliesTo is null) key.DeleteValue("AppliesTo", false);
        else key.SetValue("AppliesTo", appliesTo);
        using var cmd = key.CreateSubKey("command");
        cmd.SetValue("", $"\"{ExePath}\" {arg} \"%1\"");
    }

    private const uint SHCNE_ASSOCCHANGED = 0x08000000;

    [System.Runtime.InteropServices.DllImport("shell32.dll")]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    /// <summary>Usuwa wszystkie wpisy (wywoływane przez deinstalator: DeskVac.exe --cleanup).</summary>
    public static void RemoveAll()
    {
        foreach (var k in new[] { VerbKey, ProtectKey, AllowKey })
        {
            try { Registry.CurrentUser.DeleteSubKeyTree(k, false); } catch (Exception) { /* nie było */ }
        }
        SetAutostart(false);
    }
}
