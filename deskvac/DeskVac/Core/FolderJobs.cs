using System.Runtime.InteropServices;

namespace DeskVac.Core;

/// <summary>Jak folder jest sprzątany automatycznie.</summary>
public enum FolderScheduleMode
{
    /// <summary>Razem z pulpitem: te same przypomnienia i to samo sprzątanie automatyczne.</summary>
    WithDesktop,
    /// <summary>Własny harmonogram folderu.</summary>
    Own,
}

/// <summary>Co robi własny harmonogram folderu o wybranej godzinie.</summary>
public enum FolderScheduleKind
{
    /// <summary>Tylko ręcznie (panel, menu, robot).</summary>
    Off,
    /// <summary>Powiadomienie z przyciskiem „Posprzątaj teraz”.</summary>
    Remind,
    /// <summary>Sprzątanie automatyczne w tle, bez pytania.</summary>
    AutoClean,
}

public sealed class FolderSchedule
{
    public FolderScheduleKind Kind { get; set; } = FolderScheduleKind.Off;
    public string Time { get; set; } = "15:00";
    public List<DayOfWeek> Days { get; set; } = new() { DayOfWeek.Friday };
}

/// <summary>Folder sprzątany przez robota (np. Pobrane). Porządek robiony jest na miejscu: Pobrane\PDF\Faktury…</summary>
public sealed class FolderJob
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Path { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public bool IsDownloads { get; set; }

    /// <summary>Pliki młodsze niż tyle godzin zostają (np. świeżo pobrane). 0 = bez ograniczenia.</summary>
    public double MinAgeHours { get; set; }

    /// <summary>Luźne podfoldery (np. rozpakowane archiwa) przenoś do „Foldery”.</summary>
    public bool MoveLooseFolders { get; set; } = true;

    /// <summary>Identyczne pliki (ta sama zawartość) odkładaj do „Duplikaty”.</summary>
    public bool DetectDuplicates { get; set; } = true;

    /// <summary>
    /// Identyczne kopie do osobnego folderu „Duplikaty” (stary sposób). Domyślnie NIE – kopia trafia obok oryginału
    /// do tego samego folderu kategorii, z własną nazwą.
    /// </summary>
    public bool DuplicatesToFolder { get; set; }

    /// <summary>Czy użytkownik obejrzał i zatwierdził podgląd (wymagane przed pierwszym sprzątaniem).</summary>
    public bool PreviewConfirmed { get; set; }

    public FolderScheduleMode Mode { get; set; } = FolderScheduleMode.Own;
    public FolderSchedule Schedule { get; set; } = new();

    public string DisplayName => string.IsNullOrWhiteSpace(Name) ? System.IO.Path.GetFileName(Path.TrimEnd('\\')) : Name;

    public string ScheduleText => Mode == FolderScheduleMode.WithDesktop
        ? "razem z pulpitem"
        : Schedule.Kind switch
        {
            FolderScheduleKind.Remind => $"przypomnienie {Schedule.Time} ({KnownFolders.DaysText(Schedule.Days)})",
            FolderScheduleKind.AutoClean => $"automatycznie {Schedule.Time} ({KnownFolders.DaysText(Schedule.Days)})",
            _ => "tylko ręcznie",
        };

    public static FolderJob ForPath(string path)
    {
        bool downloads = string.Equals(System.IO.Path.TrimEndingDirectorySeparator(path),
            System.IO.Path.TrimEndingDirectorySeparator(KnownFolders.Downloads), StringComparison.OrdinalIgnoreCase);
        return new FolderJob
        {
            Path = System.IO.Path.TrimEndingDirectorySeparator(path),
            Name = downloads ? "Pobrane" : System.IO.Path.GetFileName(path.TrimEnd('\\')),
            IsDownloads = downloads,
            MinAgeHours = downloads ? 24 : 0,
            Mode = downloads ? FolderScheduleMode.WithDesktop : FolderScheduleMode.Own,
        };
    }
}

public static class KnownFolders
{
    private static readonly Guid DownloadsId = new("374DE290-123F-4565-9164-39C4925E467B");

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHGetKnownFolderPath(ref Guid rfid, uint flags, IntPtr token, out IntPtr path);

    /// <summary>Folder „Pobrane” (także gdy przeniesiony na inny dysk).</summary>
    public static string Downloads
    {
        get
        {
            try
            {
                var id = DownloadsId;
                if (SHGetKnownFolderPath(ref id, 0, IntPtr.Zero, out var p) == 0)
                {
                    try { return Marshal.PtrToStringUni(p) ?? Fallback(); }
                    finally { Marshal.FreeCoTaskMem(p); }
                }
            }
            catch (Exception)
            {
                // starszy system – ścieżka domyślna
            }
            return Fallback();

            static string Fallback() => System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        }
    }

    public static string Documents => Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    public static string Pictures => Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);

    /// <summary>Foldery, których robot nigdy nie sprząta (korzenie dysków, Windows, Program Files, profil, AppData, pulpit).</summary>
    public static string? WhyForbidden(string path)
    {
        try
        {
            var full = System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(path));
            if (!Directory.Exists(full)) return "Folder nie istnieje.";
            if (System.IO.Path.GetPathRoot(full)?.TrimEnd('\\').Equals(full, StringComparison.OrdinalIgnoreCase) == true)
                return "Nie sprzątam całego dysku.";

            string[] forbidden =
            {
                Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            };
            foreach (var f in forbidden.Where(f => !string.IsNullOrEmpty(f)))
            {
                var ff = System.IO.Path.TrimEndingDirectorySeparator(f);
                if (full.Equals(ff, StringComparison.OrdinalIgnoreCase)) return "To folder systemowy – nie sprzątam go.";
                // wnętrza Windows/Program Files/AppData też nie (ale podfoldery profilu, np. Pobrane – tak)
                if (!ff.Equals(System.IO.Path.TrimEndingDirectorySeparator(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)), StringComparison.OrdinalIgnoreCase)
                    && full.StartsWith(ff + "\\", StringComparison.OrdinalIgnoreCase))
                    return "To folder systemowy – nie sprzątam go.";
            }
            var desktop = System.IO.Path.TrimEndingDirectorySeparator(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
            if (full.Equals(desktop, StringComparison.OrdinalIgnoreCase)) return "Pulpit robot sprząta osobno.";
            return null;
        }
        catch (Exception ex)
        {
            return ex.Message;
        }
    }

    public static string DaysText(List<DayOfWeek> days)
    {
        if (days.Count == 7) return "codziennie";
        if (days.Count == 5 && !days.Contains(DayOfWeek.Saturday) && !days.Contains(DayOfWeek.Sunday)) return "pn–pt";
        string[] names = { "nd", "pn", "wt", "śr", "cz", "pt", "so" };
        return string.Join(", ", days.OrderBy(d => ((int)d + 6) % 7).Select(d => names[(int)d]));
    }
}
