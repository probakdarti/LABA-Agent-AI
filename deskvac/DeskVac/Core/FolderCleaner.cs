using System.Security.Cryptography;

namespace DeskVac.Core;

/// <summary>Jedna zaplanowana przeprowadzka: plik/folder → podfolder kategorii (albo „Duplikaty”).</summary>
public sealed record PlannedMove(string Source, string Destination, string Category, bool IsDuplicate, bool IsFolder, long Size);

public sealed class FolderPlan
{
    public required FolderJob Job { get; init; }
    public List<PlannedMove> Moves { get; } = new();
    public int SkippedRecent { get; set; }
    public int SkippedPartial { get; set; }
    public int SkippedProtected { get; set; }
    public int SkippedFolders { get; set; }
    public int SkippedSystem { get; set; }
    public string? Error { get; set; }

    public int Duplicates => Moves.Count(m => m.IsDuplicate);
}

/// <summary>
/// Sprzątanie zwykłego folderu (np. Pobrane) NA MIEJSCU: luźne pliki trafiają do podfolderów wg typu
/// i tematu (Pobrane\PDF\Faktury…), luźne podfoldery do „Foldery”, identyczne kopie do „Duplikaty”.
/// Niczego nie usuwa; każde sprzątanie można cofnąć.
/// </summary>
public static class FolderCleaner
{
    public const string DuplicatesFolder = "Duplikaty";

    /// <summary>Niedokończone pobierania przeglądarek i menedżerów pobierania.</summary>
    private static readonly HashSet<string> PartialExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".crdownload", ".part", ".partial", ".download", ".opdownload", ".tmp", ".temp", ".!ut", ".!qb", ".aria2", ".bc!", ".dlpart",
    };

    /// <summary>
    /// Plan sprzątania bez ruszania plików (podgląd i liczenie do przypomnień).
    /// withDuplicates=false pomija liczenie sum kontrolnych (szybkie liczenie).
    /// </summary>
    public static FolderPlan Plan(FolderJob job, AppSettings settings, bool withDuplicates = true, CancellationToken ct = default)
    {
        var plan = new FolderPlan { Job = job };
        var why = KnownFolders.WhyForbidden(job.Path);
        if (why is not null)
        {
            plan.Error = why;
            return plan;
        }

        var root = Path.TrimEndingDirectorySeparator(job.Path);
        var reserved = Categorizer.AllCategoryFolders();
        var system = SystemFolders.Snapshot();
        var minAge = TimeSpan.FromHours(Math.Max(0, job.MinAgeHours));
        var now = DateTime.Now;

        var candidates = new List<FileSystemInfo>();
        foreach (var info in new DirectoryInfo(root).EnumerateFileSystemInfos())
        {
            ct.ThrowIfCancellationRequested();
            if ((info.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue; // desktop.ini itp.
            bool isDir = info is DirectoryInfo;

            if (isDir)
            {
                // nasze foldery kategorii (PDF, Word, Foldery, Duplikaty…) zostają na miejscu
                if (reserved.Contains(info.Name)) continue;
                if ((info.Attributes & FileAttributes.ReparsePoint) != 0) continue; // dowiązania, OneDrive-owe skróty folderów
                // foldery znane Windows (np. Obrazy\Zrzuty ekranu, Z aparatu) i zawierające je – nigdy
                if (system.IsProtected(info.FullName))
                {
                    plan.SkippedSystem++;
                    continue;
                }
                if (!job.MoveLooseFolders)
                {
                    plan.SkippedFolders++;
                    continue;
                }
            }
            else if (PartialExtensions.Contains(info.Extension) || info.Name.StartsWith("Unconfirmed ", StringComparison.OrdinalIgnoreCase))
            {
                plan.SkippedPartial++;
                continue;
            }

            if (settings.IsExcluded(info.Name, info.FullName))
            {
                plan.SkippedProtected++;
                continue;
            }

            // „wiek” = najpóźniejsza z dat utworzenia i modyfikacji (świeżo pobrany plik ma nową datę utworzenia)
            var touched = info.CreationTime > info.LastWriteTime ? info.CreationTime : info.LastWriteTime;
            if (minAge > TimeSpan.Zero && now - touched < minAge)
            {
                plan.SkippedRecent++;
                continue;
            }
            candidates.Add(info);
        }

        // duplikaty: ta sama zawartość (rozmiar → SHA-256). Zostaje „oryginał” – najkrótsza nazwa, potem najstarszy.
        var duplicates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (job.DetectDuplicates && withDuplicates)
        {
            foreach (var group in candidates.OfType<FileInfo>().Where(f => f.Length > 0).GroupBy(f => f.Length).Where(g => g.Count() > 1))
            {
                ct.ThrowIfCancellationRequested();
                foreach (var sameHash in group.GroupBy(f => HashOf(f.FullName)).Where(g => g.Key is not null && g.Count() > 1))
                {
                    var keep = sameHash.OrderBy(f => f.Name.Length).ThenBy(f => f.CreationTime).First();
                    foreach (var f in sameHash.Where(f => f != keep)) duplicates.Add(f.FullName);
                }
            }
        }

        // cele: kolejne nazwy w obrębie planu też nie mogą się zderzyć
        var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var info in candidates.OrderBy(i => i.Name, StringComparer.CurrentCultureIgnoreCase))
        {
            bool dup = duplicates.Contains(info.FullName);
            var category = dup ? DuplicatesFolder : Categorizer.RelativeFolder(info.FullName, settings.SortByTopic);
            var dest = UniqueTarget(Path.Combine(root, category, info.Name), taken);
            taken.Add(dest);
            plan.Moves.Add(new PlannedMove(info.FullName, dest, category, dup, info is DirectoryInfo, info is FileInfo f ? f.Length : 0));
        }
        return plan;
    }

    /// <summary>Szybkie liczenie (bez duplikatów) – do przypomnień i decyzji „czy jest co robić”.</summary>
    public static int Count(FolderJob job, AppSettings settings)
    {
        try
        {
            return Plan(job, settings, withDuplicates: false).Moves.Count;
        }
        catch (Exception)
        {
            return 0;
        }
    }

    /// <summary>
    /// Wykonuje plan. onMoved wywoływane po każdym przeniesieniu (na wątku w tle).
    /// Zwraca liczbę przeniesionych i pominiętych (np. plik otwarty w innym programie).
    /// </summary>
    public static (int Moved, int Failed, string? Problem) Execute(FolderPlan plan, string runId,
        Action<PlannedMove, string>? onMoved, CancellationToken ct)
    {
        var log = new CleanupLog
        {
            StartedAt = DateTime.Now,
            RunId = runId,
            Kind = "folder",
            RootFolder = Path.TrimEndingDirectorySeparator(plan.Job.Path),
            SessionFolder = Path.TrimEndingDirectorySeparator(plan.Job.Path),
        };
        var file = CleanupLog.NewFile(log.StartedAt, "folder-" + plan.Job.Id);
        int moved = 0, failed = 0;
        string? problem = null;

        foreach (var m in plan.Moves)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                if (!File.Exists(m.Source) && !Directory.Exists(m.Source)) continue; // zniknął w międzyczasie
                Directory.CreateDirectory(Path.GetDirectoryName(m.Destination)!);
                var dest = Collector.UniquePath(m.Destination);
                if (m.IsFolder) Directory.Move(m.Source, dest);
                else File.Move(m.Source, dest);

                log.Moves.Add(new MoveRecord(m.Source, dest, 0, 0));
                moved++;
                if (moved % 20 == 0) CleanupLog.Save(log, file);
                onMoved?.Invoke(m, dest);
            }
            catch (Exception ex)
            {
                failed++;
                problem = $"„{Path.GetFileName(m.Source)}”: {ex.Message}";
            }
        }

        if (log.Moves.Count > 0) CleanupLog.Save(log, file);
        return (moved, failed, problem);
    }

    private static string UniqueTarget(string path, HashSet<string> taken)
    {
        if (!taken.Contains(path) && !File.Exists(path) && !Directory.Exists(path)) return path;
        var dir = Path.GetDirectoryName(path)!;
        var name = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        for (int i = 2; ; i++)
        {
            var c = Path.Combine(dir, $"{name} ({i}){ext}");
            if (!taken.Contains(c) && !File.Exists(c) && !Directory.Exists(c)) return c;
        }
    }

    private static string? HashOf(string path)
    {
        try
        {
            using var s = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 1 << 16);
            return Convert.ToHexString(SHA256.HashData(s));
        }
        catch (Exception)
        {
            return null; // otwarty na wyłączność – nie porównujemy
        }
    }
}
