using System.Text.Json;
using System.Windows;
using System.Windows.Media.Imaging;
using DeskVac.Native;

namespace DeskVac.Core;

public enum ItemKind { Shortcut, File, Folder }

public enum ItemState
{
    /// <summary>Jeszcze nie wykryty przez skan lidaru.</summary>
    Hidden,
    /// <summary>Wykryty, czeka na odkurzacz.</summary>
    Discovered,
    /// <summary>Zebrany do folderu.</summary>
    Collected,
    /// <summary>Nie dało się przenieść (plik otwarty, brak uprawnień…).</summary>
    Skipped,
    /// <summary>Chroniony przez użytkownika („Nie odkurzaj!”) – robot go omija.</summary>
    Protected,
}

public sealed class DesktopItem
{
    public required string Path { get; init; }
    public required string Name { get; init; }
    public required ItemKind Kind { get; init; }
    public BitmapSource? Icon { get; init; }

    /// <summary>Pozycja w układzie listview pulpitu (fizyczne piksele) – do przywracania przy „Cofnij”.</summary>
    public POINT ListPosition { get; set; }

    /// <summary>Prostokąt samej ikony w układzie nakładki (DIP).</summary>
    public Rect IconRect { get; set; }

    public Point Center => new(IconRect.X + IconRect.Width / 2, IconRect.Y + IconRect.Height / 2);

    public ItemState State { get; set; } = ItemState.Hidden;

    /// <summary>Czas (s) wykrycia przez lidar – do animacji „pingu”.</summary>
    public double DiscoveredAt { get; set; } = -1;

    public string? MovedTo { get; set; }

    public static ItemKind Classify(string path)
    {
        if (Directory.Exists(path)) return ItemKind.Folder;
        var ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
        return ext is ".lnk" or ".url" or ".appref-ms" or ".website" ? ItemKind.Shortcut : ItemKind.File;
    }
}

public sealed class AppSettings
{
    // --- co zbierać ---
    public bool CollectShortcuts { get; set; } = true;
    public bool CollectFiles { get; set; } = true;
    public bool CollectFolders { get; set; } = true;
    public bool MinimizeWindows { get; set; } = true;

    // --- dźwięk ---
    public bool PlaySounds { get; set; } = true;
    /// <summary>Głośność dźwięków 0..1.</summary>
    public double Volume { get; set; } = 0.8;

    // --- ochrona ---
    /// <summary>Nazwy elementów (z rozszerzeniem lub bez), których robot nie rusza.</summary>
    public List<string> Exclusions { get; set; } = new();
    /// <summary>Pełne ścieżki elementów oznaczonych „Nie odkurzaj!” (menu kontekstowe / lista w ustawieniach).</summary>
    public List<string> ProtectedPaths { get; set; } = new();

    public string CollectionFolderName { get; set; } = "Zebrane z pulpitu";

    /// <summary>Pozycja „Nie odkurzaj!” w menu kontekstowym tylko dla elementów pulpitu.</summary>
    public bool ContextMenuOnlyOnDesktop { get; set; } = true;

    // --- działanie w tle ---
    /// <summary>Odczytywane z rejestru przy starcie (instalator decyduje o wartości początkowej).</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public bool StartWithWindows { get; set; }
    public bool CloseToTray { get; set; } = true;
    public bool ShowRobotOnDesktop { get; set; } = true;

    // --- kalibracja (px, dodawane do pozycji ikon) ---
    public double OffsetX { get; set; }
    public double OffsetY { get; set; }

    // --- przypomnienia ---
    public bool RemindOnStartup { get; set; } = true;
    public int StartupDelayMinutes { get; set; } = 2;
    public bool RemindDaily { get; set; } = true;
    public List<string> ReminderTimes { get; set; } = new() { "16:00" };
    public List<DayOfWeek> ReminderDays { get; set; } = AllDays();
    /// <summary>Nie przypominaj, gdy do sprzątnięcia jest mniej elementów.</summary>
    public int MinItemsToRemind { get; set; } = 5;

    // --- sprzątanie automatyczne ---
    public bool AutoCleanEnabled { get; set; }
    public string AutoCleanTime { get; set; } = "17:00";
    public List<DayOfWeek> AutoCleanDays { get; set; } = AllDays();
    /// <summary>W trybie automatycznym bez dźwięku, żeby nie przeszkadzać.</summary>
    public bool AutoCleanQuiet { get; set; } = true;

    public static List<DayOfWeek> AllDays() => Enum.GetValues<DayOfWeek>().ToList();

    private static string FilePath => System.IO.Path.Combine(AppPaths.DataDir, "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var s = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(FilePath)) ?? new AppSettings();
                s.ReminderTimes = s.ReminderTimes.Where(t => TryParseTime(t, out _)).Distinct().ToList();
                return s;
            }
        }
        catch (Exception)
        {
            // uszkodzony plik – wracamy do domyślnych
        }
        return new AppSettings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(AppPaths.DataDir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception)
        {
            // brak zapisu ustawień nie blokuje działania
        }
    }

    public static bool TryParseTime(string text, out TimeSpan time) =>
        TimeSpan.TryParseExact(text.Trim(), new[] { @"h\:mm", @"hh\:mm" }, null, out time) && time < TimeSpan.FromDays(1);

    public bool IsProtected(string path) =>
        ProtectedPaths.Any(p => p.Equals(path, StringComparison.OrdinalIgnoreCase));

    /// <summary>Przełącza ochronę elementu. Zwraca true, jeśli element jest teraz chroniony.</summary>
    public bool ToggleProtected(string path)
    {
        var existing = ProtectedPaths.FirstOrDefault(p => p.Equals(path, StringComparison.OrdinalIgnoreCase));
        if (existing is not null)
        {
            ProtectedPaths.Remove(existing);
            return false;
        }
        ProtectedPaths.Add(path);
        return true;
    }

    public bool IsExcluded(string name, string path)
    {
        if (IsProtected(path)) return true;
        var fileName = System.IO.Path.GetFileName(path);
        var noExt = System.IO.Path.GetFileNameWithoutExtension(path);
        return Exclusions.Any(e =>
        {
            var x = e.Trim().Trim('"').TrimEnd('\\', '/');
            if (x.Contains('\\') || x.Contains('/'))
            {
                // pełna ścieżka: wykluczamy ten element albo cokolwiek, co w nim leży
                return path.Equals(x, StringComparison.OrdinalIgnoreCase)
                       || path.StartsWith(x + System.IO.Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
            }
            return x.Length > 0 && (x.Equals(name, StringComparison.OrdinalIgnoreCase)
                                    || x.Equals(fileName, StringComparison.OrdinalIgnoreCase)
                                    || x.Equals(noExt, StringComparison.OrdinalIgnoreCase));
        });
    }

    public bool Accepts(ItemKind kind) => kind switch
    {
        ItemKind.Shortcut => CollectShortcuts,
        ItemKind.File => CollectFiles,
        ItemKind.Folder => CollectFolders,
        _ => false,
    };
}

public static class AppPaths
{
    public static string DataDir =>
        System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DeskVac");

    public static string HistoryDir => System.IO.Path.Combine(DataDir, "history");
}
