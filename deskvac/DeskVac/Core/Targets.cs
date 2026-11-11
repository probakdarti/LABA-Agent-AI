namespace DeskVac.Core;

/// <summary>
/// Co robot sprząta: „Tylko pulpit” (domyślnie), „Tylko Pobrane”, „Wybrane foldery dodatkowe”, „Pulpit i Pobrane”,
/// „Wszystko” oraz pojedyncze foldery dodatkowe. Wspólne dla panelu, ustawień, menu zasobnika i potrójnego kliknięcia.
/// </summary>
public static class Targets
{
    public const string Desktop = "desktop";
    public const string Downloads = "downloads";
    public const string Extra = "extra";
    public const string DesktopAndDownloads = "desktop+downloads";
    public const string All = "all";

    /// <summary>Folder Pobrane z listy sprzątanych (włączony), jeśli jest.</summary>
    public static FolderJob? DownloadsJob(AppSettings s) => s.Folders.FirstOrDefault(f => f.IsDownloads && f.Enabled);

    /// <summary>Włączone foldery dodatkowe (wszystkie poza Pobranymi).</summary>
    public static List<FolderJob> ExtraJobs(AppSettings s) => s.Folders.Where(f => f.Enabled && !f.IsDownloads).ToList();

    /// <summary>Opcje do list wyboru. Separator = (null, null). Opcje bez sensu (np. brak Pobranych) są pomijane.</summary>
    public static List<(string? Id, string? Label)> Options(AppSettings s, bool withSingleFolders)
    {
        bool dl = DownloadsJob(s) is not null;
        var extra = ExtraJobs(s);
        var list = new List<(string?, string?)> { (Desktop, "Tylko pulpit") };
        if (dl) list.Add((Downloads, "Tylko folder Pobrane"));
        if (extra.Count > 0) list.Add((Extra, "Wybrane foldery dodatkowe: " + string.Join(", ", extra.Select(f => f.DisplayName))));
        if (dl) list.Add((DesktopAndDownloads, "Pulpit i Pobrane"));
        if (dl || extra.Count > 0) list.Add((All, "Wszystko: pulpit + " + (dl ? "Pobrane" : "") + (dl && extra.Count > 0 ? " + " : "") + (extra.Count > 0 ? "foldery dodatkowe" : "")));
        if (withSingleFolders && extra.Count > 0)
        {
            list.Add((null, null));
            foreach (var f in extra) list.Add((f.Id, $"Tylko folder „{f.DisplayName}”"));
        }
        return list;
    }

    /// <summary>Co obejmuje opcja: czy pulpit i które foldery.</summary>
    public static (bool Desktop, List<FolderJob> Folders) Resolve(string id, AppSettings s)
    {
        var dl = DownloadsJob(s);
        var dlList = dl is null ? new List<FolderJob>() : new List<FolderJob> { dl };
        return id switch
        {
            Desktop => (true, new List<FolderJob>()),
            Downloads => (false, dlList),
            Extra => (false, ExtraJobs(s)),
            DesktopAndDownloads => (true, dlList),
            All => (true, dlList.Concat(ExtraJobs(s)).ToList()),
            _ => s.Folders.FirstOrDefault(f => f.Id == id) is { } one ? (false, new List<FolderJob> { one }) : (true, new List<FolderJob>()),
        };
    }

    /// <summary>Czy identyfikator jest nadal ważny (np. po usunięciu folderu wraca „Tylko pulpit”).</summary>
    public static string Normalize(string? id, AppSettings s) =>
        id is not null && Options(s, withSingleFolders: true).Any(o => o.Id == id) ? id : Desktop;
}
