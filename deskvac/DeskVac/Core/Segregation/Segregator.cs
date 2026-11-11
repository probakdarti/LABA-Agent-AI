using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace DeskVac.Core.Segregation;

/// <summary>Jedna zmiana segregacji: plik → inny podfolder (np. PDF → PDF\Faktury) z uzasadnieniem.</summary>
public sealed record SegregationMove(string Source, string Destination, string Root, string From, string To, string Reason);

public sealed class SegregationPlan
{
    public List<SegregationMove> Moves { get; } = new();
    public int Checked { get; set; }
    public int Unreadable { get; set; }
    public int Uncertain { get; set; }
}

/// <summary>
/// „Segregacja” – drugi etap po sprzątaniu: czyta treść plików już posortowanych wg typu
/// (Zebrane z pulpitu\PDF, Pobrane\Word…) i przenosi je do podfolderów tematycznych (PDF\Faktury, Word\Umowy…).
/// Poprawia też wcześniejsze pomyłki typu (np. .apk w „Inne”). Tylko przenosi, wszystko da się cofnąć.
/// Pliki czyta osobny proces roboczy (DeskVac.exe --segregation-worker) z limitem czasu na plik.
/// </summary>
public sealed class Segregator : IDisposable
{
    /// <summary>Foldery typu, w których szukamy tematów po treści.</summary>
    private static readonly HashSet<string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Word", "Excel", "PowerPoint", "PDF", "Teksty", "E-maile", "Zdjęcia",
    };

    /// <summary>Folderów robota, których segregacja nie rusza.</summary>
    private static readonly HashSet<string> Untouched = new(StringComparer.OrdinalIgnoreCase)
    {
        "Foldery", "Duplikaty", FolderCleaner.AbandonedFolder, "Skróty programów", "Skróty do folderów", "Skróty do dokumentów", "Skróty internetowe",
    };

    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff",
    };

    private static readonly TimeSpan PerFileTimeout = TimeSpan.FromSeconds(30);

    private readonly AppSettings _settings;
    private readonly SegregationCache _cache = SegregationCache.Load();
    private Process? _worker;

    public event Action<int, int, string>? Progress;

    public Segregator(AppSettings settings) => _settings = settings;

    /// <summary>Foldery główne: „Zebrane z pulpitu” i każdy włączony sprzątany folder.</summary>
    public static List<string> Roots(AppSettings s)
    {
        var roots = new List<string>();
        var desktopBase = new Collector(s).BaseFolder;
        if (Directory.Exists(desktopBase)) roots.Add(desktopBase);
        foreach (var f in s.Folders.Where(f => f.Enabled && Directory.Exists(f.Path) && KnownFolders.WhyForbidden(f.Path) is null))
            roots.Add(Path.TrimEndingDirectorySeparator(f.Path));
        return roots;
    }

    /// <summary>Przegląda pliki i układa plan zmian. force = czytaj ponownie także pliki znane z poprzednich segregacji.</summary>
    public SegregationPlan Plan(IEnumerable<string> roots, bool force, CancellationToken ct)
    {
        var plan = new SegregationPlan();
        var work = new List<(string Root, string Type, string? Topic, FileInfo File)>();

        foreach (var root in roots)
        {
            foreach (var typeDir in SafeDirs(root))
            {
                var type = Path.GetFileName(typeDir);
                if (!Categorizer.AllCategoryFolders().Contains(type) || Untouched.Contains(type)) continue;

                foreach (var f in SafeFiles(typeDir)) work.Add((root, type, null, f));
                foreach (var topicDir in SafeDirs(typeDir))
                    foreach (var f in SafeFiles(topicDir)) work.Add((root, type, Path.GetFileName(topicDir), f));
            }
        }

        int done = 0;
        foreach (var (root, type, topic, file) in work)
        {
            ct.ThrowIfCancellationRequested();
            Progress?.Invoke(done++, work.Count, file.Name);
            if ((file.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
            if (_settings.IsExcluded(file.Name, file.FullName)) continue;
            plan.Checked++;

            // 1) poprawka typu (np. .apk wcześniej w „Inne\Skany” → Instalatory)
            var properType = Categorizer.CategoryOf(file.FullName);
            if (!string.Equals(properType, type, StringComparison.OrdinalIgnoreCase) && properType != "Inne")
            {
                var target = Path.Combine(root, Categorizer.RelativeFolder(file.FullName, _settings.SortByTopic));
                AddMove(plan, root, file, target, $"typ pliku: {properType}");
                continue;
            }

            // 2) temat wg treści
            if (!ContentTypes.Contains(type) || !TextExtractor.Supported.Contains(file.Extension)) continue;
            bool image = ImageExtensions.Contains(file.Extension);
            if (image && !_settings.SegregationImages && !string.Equals(topic, "Skany", StringComparison.OrdinalIgnoreCase)) continue;

            var key = SegregationCache.Key(file);
            string? newTopic;
            string reason;
            if (!force && _cache.TryGet(key, out var cached))
            {
                newTopic = cached.Topic;
                reason = cached.Reason;
            }
            else
            {
                var text = ExtractViaWorker(file.FullName, _settings.SegregationOcr);
                if (!text.Ok)
                {
                    plan.Unreadable++;
                    continue; // nie da się odczytać (zaszyfrowany, uszkodzony, za duży) – zostaje, gdzie jest
                }
                var c = ContentClassifier.Classify(text.Text, file.Name);
                newTopic = c.Topic;
                // skan bez rozpoznanego tematu → „Skany”
                if (newTopic is null && text.UsedOcr && type == "PDF") newTopic = "Skany";
                reason = newTopic is null
                    ? "niepewne"
                    : (text.UsedOcr ? "OCR: " : "treść: ") + string.Join(", ", c.Reasons);
                _cache.Set(key, newTopic, reason);
            }

            if (newTopic is null)
            {
                plan.Uncertain++;
                continue;
            }
            if (string.Equals(newTopic, topic, StringComparison.OrdinalIgnoreCase)) continue;
            AddMove(plan, root, file, Path.Combine(root, type, newTopic), reason);
        }

        Progress?.Invoke(work.Count, work.Count, "");
        _cache.Save();
        return plan;
    }

    private static void AddMove(SegregationPlan plan, string root, FileInfo file, string targetDir, string reason)
    {
        var dest = Path.Combine(targetDir, file.Name);
        if (string.Equals(Path.GetDirectoryName(file.FullName), targetDir, StringComparison.OrdinalIgnoreCase)) return;
        plan.Moves.Add(new SegregationMove(file.FullName, dest, root,
            Path.GetRelativePath(root, file.DirectoryName!), Path.GetRelativePath(root, targetDir), reason));
    }

    /// <summary>Wykonuje plan. Dziennik typu „segregation” – „Cofnij” przywraca poprzednie miejsca.</summary>
    public static (int Moved, int Failed) Execute(SegregationPlan plan, string runId, CancellationToken ct)
    {
        int moved = 0, failed = 0;
        foreach (var group in plan.Moves.GroupBy(m => m.Root))
        {
            var log = new CleanupLog
            {
                StartedAt = DateTime.Now,
                RunId = runId,
                Kind = "segregation",
                RootFolder = group.Key,
                SessionFolder = group.Key,
            };
            var file = CleanupLog.NewFile(log.StartedAt, "segregacja-" + Math.Abs(group.Key.GetHashCode()).ToString("x"));
            foreach (var m in group)
            {
                if (ct.IsCancellationRequested) break;
                try
                {
                    if (!File.Exists(m.Source)) continue;
                    Directory.CreateDirectory(Path.GetDirectoryName(m.Destination)!);
                    var dest = Collector.UniquePath(m.Destination);
                    File.Move(m.Source, dest);
                    log.Moves.Add(new MoveRecord(m.Source, dest, 0, 0));
                    moved++;
                    // stary podfolder tematu mógł zostać pusty
                    Collector.DeleteEmptyParents(Path.GetDirectoryName(m.Source), group.Key);
                }
                catch (Exception)
                {
                    failed++; // plik otwarty w programie – zostaje
                }
            }
            if (log.Moves.Count > 0) CleanupLog.Save(log, file);
        }
        return (moved, failed);
    }

    // ------------------------------------------------------------------ proces roboczy

    private ExtractResult ExtractViaWorker(string path, bool ocr)
    {
        for (int attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                EnsureWorker();
                var request = JsonSerializer.Serialize(new WorkerRequest(path, ocr));
                _worker!.StandardInput.WriteLine(request);
                _worker.StandardInput.Flush();
                var read = _worker.StandardOutput.ReadLineAsync();
                if (!read.Wait(PerFileTimeout))
                {
                    KillWorker(); // zawieszony na tym pliku – pomijamy plik
                    return new ExtractResult(false, "", false, "przekroczony czas");
                }
                var line = read.Result;
                if (line is null)
                {
                    KillWorker(); // proces padł – spróbujemy jeszcze raz z nowym
                    continue;
                }
                return JsonSerializer.Deserialize<ExtractResult>(line) ?? new ExtractResult(false, "", false, "brak odpowiedzi");
            }
            catch (Exception ex)
            {
                KillWorker();
                if (attempt == 1) return new ExtractResult(false, "", false, ex.Message);
            }
        }
        return new ExtractResult(false, "", false, "błąd procesu odczytu");
    }

    private void EnsureWorker()
    {
        if (_worker is { HasExited: false }) return;
        var psi = new ProcessStartInfo(Environment.ProcessPath!, "--segregation-worker")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            StandardInputEncoding = new UTF8Encoding(false),
            StandardOutputEncoding = new UTF8Encoding(false),
        };
        _worker = Process.Start(psi) ?? throw new InvalidOperationException("Nie udało się uruchomić procesu odczytu.");
        try { _worker.PriorityClass = ProcessPriorityClass.BelowNormal; } catch (Exception) { /* bez znaczenia */ }
    }

    private void KillWorker()
    {
        try { if (_worker is { HasExited: false }) _worker.Kill(true); } catch (Exception) { /* już zamknięty */ }
        _worker?.Dispose();
        _worker = null;
    }

    public void Dispose()
    {
        try { _worker?.StandardInput.Close(); } catch (Exception) { /* nic */ }
        KillWorker();
    }

    // ------------------------------------------------------------------ pomocnicze

    private static IEnumerable<string> SafeDirs(string dir)
    {
        try { return Directory.GetDirectories(dir).Where(d => (new DirectoryInfo(d).Attributes & FileAttributes.ReparsePoint) == 0).ToList(); }
        catch (Exception) { return Array.Empty<string>(); }
    }

    private static IEnumerable<FileInfo> SafeFiles(string dir)
    {
        try { return new DirectoryInfo(dir).GetFiles(); }
        catch (Exception) { return Array.Empty<FileInfo>(); }
    }

    public sealed record WorkerRequest(string Path, bool Ocr);

    /// <summary>
    /// Pętla procesu roboczego: czyta żądania (JSON w linii) ze standardowego wejścia, odpowiada wynikiem odczytu.
    /// Kończy się po zamknięciu wejścia przez DeskVac.
    /// </summary>
    public static void RunWorker()
    {
        var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        string? line;
        while ((line = input.ReadLine()) is not null)
        {
            ExtractResult result;
            try
            {
                var req = JsonSerializer.Deserialize<WorkerRequest>(line);
                result = req is null ? new ExtractResult(false, "", false, "złe żądanie") : TextExtractor.Extract(req.Path, req.Ocr);
            }
            catch (Exception ex)
            {
                result = new ExtractResult(false, "", false, ex.Message);
            }
            output.WriteLine(JsonSerializer.Serialize(result));
        }
    }
}

/// <summary>Wyniki wcześniejszych odczytów (ścieżka + rozmiar + data zmiany) – niezmienione pliki nie są czytane drugi raz.</summary>
public sealed class SegregationCache
{
    public sealed record Entry(string? Topic, string Reason);

    public Dictionary<string, Entry> Items { get; set; } = new();

    private static string FilePath => Path.Combine(AppPaths.DataDir, "segregation-cache.json");

    public static string Key(FileInfo f) => $"{f.Name}|{f.Length}|{f.LastWriteTimeUtc.Ticks}";

    public bool TryGet(string key, out Entry entry) => Items.TryGetValue(key, out entry!);

    public void Set(string key, string? topic, string reason) => Items[key] = new Entry(topic, reason);

    public static SegregationCache Load()
    {
        try
        {
            if (File.Exists(FilePath)) return JsonSerializer.Deserialize<SegregationCache>(File.ReadAllText(FilePath)) ?? new();
        }
        catch (Exception)
        {
            // uszkodzony – zaczynamy od nowa
        }
        return new SegregationCache();
    }

    public void Save()
    {
        try
        {
            if (Items.Count > 20000) Items = Items.TakeLast(10000).ToDictionary(kv => kv.Key, kv => kv.Value);
            Directory.CreateDirectory(AppPaths.DataDir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this));
        }
        catch (Exception)
        {
            // brak zapisu – następnym razem pliki zostaną przeczytane ponownie
        }
    }
}
