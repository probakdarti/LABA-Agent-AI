using System.Text.Json;
using DeskVac.Native;

namespace DeskVac.Core;

public sealed record MoveRecord(string Source, string Destination, int X, int Y);

public sealed class CleanupLog
{
    public DateTime StartedAt { get; set; }
    public string SessionFolder { get; set; } = "";
    public List<MoveRecord> Moves { get; set; } = new();
}

/// <summary>
/// Przenosi elementy z pulpitu do folderu „Zebrane z pulpitu\RRRR-MM-DD GG.MM.SS”.
/// Niczego nie usuwa. Każde sprzątanie zapisuje dziennik, dzięki któremu można je cofnąć.
/// </summary>
public sealed class Collector
{
    private readonly CleanupLog _log = new();
    private readonly bool _byType, _byTopic;
    private string? _logFile;

    /// <summary>Ile elementów trafiło do której kategorii (pierwszy poziom, np. „PDF”).</summary>
    public Dictionary<string, int> Summary { get; } = new(StringComparer.OrdinalIgnoreCase);

    public string BaseFolder { get; }
    public string SessionFolder { get; private set; } = "";

    public Collector(AppSettings settings)
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        BaseFolder = Path.Combine(desktop, settings.CollectionFolderName);
        _byType = settings.SortByType;
        _byTopic = settings.SortByTopic;
    }

    public bool IsCollectionFolder(string path) =>
        path.Equals(BaseFolder, StringComparison.OrdinalIgnoreCase) ||
        path.StartsWith(BaseFolder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);

    public void Begin()
    {
        _log.StartedAt = DateTime.Now;
        SessionFolder = Path.Combine(BaseFolder, _log.StartedAt.ToString("yyyy-MM-dd HH.mm.ss"));
        _log.SessionFolder = SessionFolder;
        _log.Moves.Clear();
        Summary.Clear();
        _logFile = Path.Combine(AppPaths.HistoryDir, _log.StartedAt.ToString("yyyyMMdd-HHmmss") + ".json");
    }

    /// <summary>Przenosi element. Zwraca ścieżkę docelową albo null + komunikat błędu.</summary>
    public string? TryCollect(DesktopItem item, out string? error)
    {
        error = null;
        try
        {
            // kategoria liczona PRZED przeniesieniem (np. cel skrótu .lnk czyta się z oryginalnej ścieżki)
            string folder = SessionFolder;
            if (_byType)
            {
                item.Category = Categorizer.RelativeFolder(item.Path, _byTopic);
                folder = Path.Combine(BaseFolder, item.Category);
            }
            Directory.CreateDirectory(folder);
            var dest = UniquePath(Path.Combine(folder, Path.GetFileName(item.Path)));

            if (Directory.Exists(item.Path))
                Directory.Move(item.Path, dest);
            else if (File.Exists(item.Path))
                File.Move(item.Path, dest);
            else
            {
                error = "Element już nie istnieje";
                return null;
            }

            _log.Moves.Add(new MoveRecord(item.Path, dest, item.ListPosition.X, item.ListPosition.Y));
            var top = (item.Category ?? "").Split(Path.DirectorySeparatorChar)[0];
            if (top.Length > 0) Summary[top] = Summary.GetValueOrDefault(top) + 1;
            SaveLog(); // zapis po każdym ruchu – cofanie działa nawet po awarii
            return dest;
        }
        catch (UnauthorizedAccessException)
        {
            error = "Brak uprawnień (np. skrót z pulpitu publicznego)";
        }
        catch (IOException ex)
        {
            error = ex.Message;
        }
        catch (Exception ex)
        {
            error = ex.Message;
        }
        return null;
    }

    public void Finish()
    {
        if (_log.Moves.Count == 0)
        {
            TryDeleteEmpty(SessionFolder);
            TryDeleteEmpty(BaseFolder);
        }
        else
        {
            SaveLog();
        }
    }

    private void SaveLog()
    {
        if (_logFile is null) return;
        try
        {
            Directory.CreateDirectory(AppPaths.HistoryDir);
            File.WriteAllText(_logFile, JsonSerializer.Serialize(_log, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception)
        {
            // brak dziennika nie przerywa sprzątania
        }
    }

    public static (CleanupLog Log, string File)? LoadLast()
    {
        try
        {
            if (!Directory.Exists(AppPaths.HistoryDir)) return null;
            var last = new DirectoryInfo(AppPaths.HistoryDir).GetFiles("*.json")
                .OrderByDescending(f => f.Name).FirstOrDefault();
            if (last is null) return null;
            var log = JsonSerializer.Deserialize<CleanupLog>(File.ReadAllText(last.FullName));
            return log is null ? null : (log, last.FullName);
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// <summary>Przenosi elementy z powrotem na pulpit. Zwraca listę przywróconych elementów (ścieżka + dawna pozycja).</summary>
    public static List<(string Path, POINT Position)> Undo(CleanupLog log, string logFile, out int failed)
    {
        var restored = new List<(string, POINT)>();
        failed = 0;
        foreach (var m in Enumerable.Reverse(log.Moves))
        {
            try
            {
                if (File.Exists(m.Source) || Directory.Exists(m.Source)) { failed++; continue; }
                if (Directory.Exists(m.Destination)) Directory.Move(m.Destination, m.Source);
                else if (File.Exists(m.Destination)) File.Move(m.Destination, m.Source);
                else { failed++; continue; }
                restored.Add((m.Source, new POINT(m.X, m.Y)));
                DeleteEmptyParents(Path.GetDirectoryName(m.Destination), Path.GetDirectoryName(log.SessionFolder));
            }
            catch (Exception)
            {
                failed++;
            }
        }

        TryDeleteEmpty(log.SessionFolder);
        var baseFolder = Path.GetDirectoryName(log.SessionFolder);
        if (baseFolder is not null) TryDeleteEmpty(baseFolder);
        if (failed == 0)
        {
            try { File.Delete(logFile); } catch (Exception) { /* zostawiamy dziennik */ }
        }
        return restored;
    }

    /// <summary>Usuwa puste foldery od <paramref name="dir"/> w górę, aż do <paramref name="stopAt"/> (bez niego).</summary>
    private static void DeleteEmptyParents(string? dir, string? stopAt)
    {
        while (dir is not null && stopAt is not null &&
               dir.StartsWith(stopAt + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            if (!Directory.Exists(dir) || Directory.EnumerateFileSystemEntries(dir).Any()) return;
            TryDeleteEmpty(dir);
            dir = Path.GetDirectoryName(dir);
        }
    }

    private static readonly System.Text.RegularExpressions.Regex DateFolder =
        new(@"^\d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}$");

    /// <summary>
    /// Sortuje wcześniej zebrane foldery „z datą” (stary układ) do folderów wg typu.
    /// Aktualizuje dzienniki historii, żeby „Cofnij” dalej trafiało w dobre miejsca. Zwraca liczbę przeniesionych.
    /// </summary>
    public static int ReorganizeDateFolders(AppSettings settings, out int failed)
    {
        failed = 0;
        var collector = new Collector(settings);
        var baseFolder = collector.BaseFolder;
        if (!Directory.Exists(baseFolder)) return 0;

        var moved = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var dateDir in Directory.GetDirectories(baseFolder).Where(d => DateFolder.IsMatch(Path.GetFileName(d))))
        {
            foreach (var entry in Directory.GetFileSystemEntries(dateDir))
            {
                try
                {
                    var rel = Categorizer.RelativeFolder(entry, settings.SortByTopic);
                    var targetDir = Path.Combine(baseFolder, rel);
                    Directory.CreateDirectory(targetDir);
                    var dest = UniquePath(Path.Combine(targetDir, Path.GetFileName(entry)));
                    if (Directory.Exists(entry)) Directory.Move(entry, dest);
                    else File.Move(entry, dest);
                    moved[entry] = dest;
                }
                catch (Exception)
                {
                    failed++;
                }
            }
            TryDeleteEmpty(dateDir);
        }

        // dzienniki: stare ścieżki docelowe → nowe
        if (moved.Count > 0 && Directory.Exists(AppPaths.HistoryDir))
        {
            foreach (var file in Directory.GetFiles(AppPaths.HistoryDir, "*.json"))
            {
                try
                {
                    var log = JsonSerializer.Deserialize<CleanupLog>(File.ReadAllText(file));
                    if (log is null) continue;
                    bool changed = false;
                    for (int i = 0; i < log.Moves.Count; i++)
                    {
                        if (moved.TryGetValue(log.Moves[i].Destination, out var nd))
                        {
                            log.Moves[i] = log.Moves[i] with { Destination = nd };
                            changed = true;
                        }
                    }
                    if (!changed) continue;
                    log.SessionFolder = Path.Combine(baseFolder, Path.GetFileName(log.SessionFolder));
                    File.WriteAllText(file, JsonSerializer.Serialize(log, new JsonSerializerOptions { WriteIndented = true }));
                }
                catch (Exception)
                {
                    // uszkodzony dziennik – pomijamy
                }
            }
        }
        return moved.Count;
    }

    public static long SizeOf(string path)
    {
        try
        {
            if (File.Exists(path)) return new FileInfo(path).Length;
            if (!Directory.Exists(path)) return 0;
            var opts = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
            long sum = 0;
            foreach (var f in new DirectoryInfo(path).EnumerateFiles("*", opts)) sum += f.Length;
            return sum;
        }
        catch (Exception)
        {
            return 0;
        }
    }

    public static string FormatSize(long bytes)
    {
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        double v = bytes;
        int u = 0;
        while (v >= 1024 && u < units.Length - 1) { v /= 1024; u++; }
        return u == 0 ? $"{bytes} B" : $"{v:0.0} {units[u]}";
    }

    private static string UniquePath(string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path)) return path;
        var dir = Path.GetDirectoryName(path)!;
        var name = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        for (int i = 2; ; i++)
        {
            var candidate = Path.Combine(dir, $"{name} ({i}){ext}");
            if (!File.Exists(candidate) && !Directory.Exists(candidate)) return candidate;
        }
    }

    private static void TryDeleteEmpty(string? dir)
    {
        try
        {
            if (dir is not null && Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any())
                Directory.Delete(dir);
        }
        catch (Exception)
        {
            // folder w użyciu – zostawiamy
        }
    }
}
