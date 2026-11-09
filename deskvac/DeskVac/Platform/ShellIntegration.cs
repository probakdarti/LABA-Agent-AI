using Microsoft.Win32;
using DeskVac.Core;

namespace DeskVac.Platform;

/// <summary>Autostart (HKCU\…\Run) i pozycja „Nie odkurzaj!” w klasycznym menu kontekstowym. Bez uprawnień administratora.</summary>
public static class ShellIntegration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValue = "DeskVac";
    private const string VerbKey = @"Software\Classes\AllFilesystemObjects\shell\DeskVac.Protect";

    public static string ExePath => Environment.ProcessPath ?? System.Reflection.Assembly.GetExecutingAssembly().Location;

    /// <summary>Uzgadnia rejestr z ustawieniami (także po przeniesieniu programu w inne miejsce).</summary>
    public static void Sync(AppSettings s)
    {
        SetAutostart(s.StartWithWindows);
        RegisterContextMenu(s.ContextMenuOnlyOnDesktop);
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

    public static void RegisterContextMenu(bool onlyOnDesktop)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(VerbKey);
            key.SetValue("MUIVerb", "DeskVac: Nie odkurzaj! / Pozwól odkurzać");
            key.SetValue("Icon", $"\"{ExePath}\",0");
            key.SetValue("MultiSelectModel", "Document");
            if (onlyOnDesktop)
            {
                // tylko elementy leżące na pulpicie (własnym i publicznym)
                var desktops = new[]
                    {
                        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                        Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
                    }
                    .Where(d => !string.IsNullOrEmpty(d))
                    .Select(d => $"System.ParsingPath:~<\"{d.TrimEnd('\\')}\\\"");
                key.SetValue("AppliesTo", string.Join(" OR ", desktops));
            }
            else
            {
                key.DeleteValue("AppliesTo", false);
            }

            using var cmd = key.CreateSubKey("command");
            cmd.SetValue("", $"\"{ExePath}\" --toggle-protect \"%1\"");
        }
        catch (Exception)
        {
            // menu kontekstowe niedostępne – zostaje lista w ustawieniach
        }
    }

    /// <summary>Usuwa wszystkie wpisy (wywoływane przez deinstalator: DeskVac.exe --cleanup).</summary>
    public static void RemoveAll()
    {
        try { Registry.CurrentUser.DeleteSubKeyTree(VerbKey, false); } catch (Exception) { /* nie było */ }
        SetAutostart(false);
    }
}
