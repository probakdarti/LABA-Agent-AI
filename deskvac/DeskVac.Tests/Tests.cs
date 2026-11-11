using System.Text.Json;
using DeskVac.Core;
using DeskVac.Core.Segregation;

// testy przenoszą pliki i czytają wspólną historię – bez równoległości
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace DeskVac.Tests;

internal static class History
{
    /// <summary>Dzienniki konkretnego wyjazdu (po RunId), niezależnie od innych wpisów w historii.</summary>
    public static IEnumerable<(CleanupLog Log, string File)> Run(string runId) =>
        Directory.GetFiles(AppPaths.HistoryDir, "*.json")
            .Select(f => (Log: JsonSerializer.Deserialize<CleanupLog>(File.ReadAllText(f))!, File: f))
            .Where(x => x.Log?.RunId == runId)
            .OrderByDescending(x => x.File)
            .ToList();
}

public class CategorizerTests
{
    [Theory]
    [InlineData("Instrukcja do oznaczania zleceń SPOT KONTRAKT.docx", @"Word\Instrukcje")]   // 1.4: pierwsze słowo waży najwięcej
    [InlineData("Scan.Plus-plus.scan.android-215-4.7.0.apk", "Instalatory")]                 // 1.4: .apk → Instalatory, bez tematu
    [InlineData("FS 80_08_2026.pdf", @"PDF\Faktury")]                                          // 1.4: skróty faktur
    [InlineData("Complete_with_Docusign_ViGo_Amendment.pdf", @"PDF\Umowy")]
    [InlineData("Dartom - Audyt IT - 20240326_v3.pdf", @"PDF\Raporty")]
    [InlineData("Hr68Gng0.apk.part", "Niedokończone pobrania")]
    [InlineData("Scan stuff.xyz", "Inne")]                                                     // 1.4: „Inne” bez tematów
    [InlineData("Umowa najmu 2024.docx", @"Word\Umowy")]
    [InlineData("Screenshot 2026-11-09.png", @"Zdjęcia\Zrzuty ekranu")]
    [InlineData("IMG_2034.jpg", "Zdjęcia")]
    public void FileNames_GoToExpectedFolders(string name, string expected) =>
        Assert.Equal(expected, Categorizer.RelativeFolder(name, useTopics: true));
}

public class ClassifierTests
{
    [Theory]
    [InlineData(Samples.Invoice, "Faktury")]
    [InlineData(Samples.Contract, "Umowy")]
    [InlineData("Wyciąg z rachunku. Saldo początkowe 100 PLN. Zestawienie operacji. Saldo końcowe 50 PLN", "Wyciągi bankowe")]
    [InlineData("CURRICULUM VITAE Doświadczenie zawodowe 2020-2026 Wykształcenie Umiejętności", "CV")]
    [InlineData("INVOICE Invoice number: INV-1 Total due: 450 EUR VAT ID: PL1234567890", "Faktury")]
    public void Content_IsRecognized(string text, string topic) =>
        Assert.Equal(topic, ContentClassifier.Classify(text, "dokument.pdf").Topic);

    [Fact]
    public void Uncertain_ReturnsNull() =>
        Assert.Null(ContentClassifier.Classify("Zakupy: mleko, chleb, masło.", "notatka.txt").Topic);
}

public class TextExtractorTests
{
    [Fact]
    public void Reads_Docx_And_Pdf()
    {
        using var t = new TempRoot();
        var docx = t.Bytes("umowa.docx", Samples.Docx("UMOWA NAJMU", "zawarta w dniu 1 lipca 2026"));
        var pdf = t.Bytes("dok.pdf", Samples.Pdf(Samples.Invoice));
        Assert.Contains("zawarta w dniu", TextExtractor.Extract(docx, false).Text);
        Assert.Contains("FAKTURA VAT", TextExtractor.Extract(pdf, false).Text);
    }

    [Fact]
    public void Rejects_XmlWithDtd()
    {
        using var t = new TempRoot();
        var xxe = "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"file:///c:/windows/win.ini\">]><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>&e;</w:t></w:r></w:p></w:body></w:document>";
        using var ms = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, true))
        using (var w = new StreamWriter(zip.CreateEntry("word/document.xml").Open())) w.Write(xxe);
        var f = t.Bytes("xxe.docx", ms.ToArray());
        Assert.False(TextExtractor.Extract(f, false).Ok);
    }
}

public class FolderCleanerTests
{
    private static FolderJob Job(string root) => new() { Path = root, Name = "Test", MinAgeHours = 24, PreviewConfirmed = true };

    [Fact]
    public void AbandonedPartial_GoesTo_NiedokonczonePobrania_FreshStays()
    {
        using var t = new TempRoot();
        t.File("stary.htm.part", "x", ageDays: 10);
        t.File("trwa.part", "x", ageDays: 0);
        var plan = FolderCleaner.Plan(Job(t.Path), new AppSettings());
        var moved = Assert.Single(plan.Moves, m => m.Source.EndsWith("stary.htm.part"));
        Assert.Equal(FolderCleaner.AbandonedFolder, moved.Category);
        Assert.DoesNotContain(plan.Moves, m => m.Source.EndsWith("trwa.part"));
        Assert.Contains(plan.Skipped, s => s.Name == "trwa.part");
    }

    [Fact]
    public void FreshFile_Stays_WithReason()
    {
        using var t = new TempRoot();
        t.File("nowy.pdf", "x", ageDays: 0);
        var plan = FolderCleaner.Plan(Job(t.Path), new AppSettings());
        Assert.Empty(plan.Moves);
        Assert.Contains(plan.Skipped, s => s.Name == "nowy.pdf" && s.Reason.StartsWith("świeży"));
    }

    [Fact]
    public void IdenticalCopies_GoNextToOriginal()
    {
        using var t = new TempRoot();
        t.File("raport.pdf", "ta sama treść");
        t.File("raport (1).pdf", "ta sama treść");
        var plan = FolderCleaner.Plan(Job(t.Path), new AppSettings());
        Assert.Equal(2, plan.Moves.Count);
        Assert.Single(plan.Moves, m => m.IsDuplicate);
        Assert.All(plan.Moves, m => Assert.Equal(t.Combine("PDF"), Path.GetDirectoryName(m.Destination)));
    }

    [Fact]
    public void IdenticalCopies_ToDuplikaty_WhenChosen()
    {
        using var t = new TempRoot();
        t.File("raport.pdf", "ta sama treść");
        t.File("raport (1).pdf", "ta sama treść");
        var job = Job(t.Path);
        job.DuplicatesToFolder = true;
        var plan = FolderCleaner.Plan(job, new AppSettings());
        Assert.Contains(plan.Moves, m => m.Category == FolderCleaner.DuplicatesFolder);
    }

    [Fact]
    public void ExecuteAndUndo_RestoresFiles()
    {
        using var t = new TempRoot();
        var a = t.File("umowa najmu.docx", "x");
        var b = t.File("Faktura 12.pdf", "y");
        var runId = Guid.NewGuid().ToString("N")[..12];
        var plan = FolderCleaner.Plan(Job(t.Path), new AppSettings());
        var result = FolderCleaner.Execute(plan, runId, null, CancellationToken.None);
        Assert.Equal(2, result.Moved);
        Assert.True(File.Exists(t.Combine(@"Word\Umowy\umowa najmu.docx")));
        Assert.True(File.Exists(t.Combine(@"PDF\Faktury\Faktura 12.pdf")));

        foreach (var (log, file) in History.Run(runId))
            Collector.Undo(log, file, out _);
        Assert.True(File.Exists(a));
        Assert.True(File.Exists(b));
    }

    [Fact]
    public void SystemLocations_AreForbidden()
    {
        Assert.NotNull(KnownFolders.WhyForbidden(Path.GetPathRoot(Environment.SystemDirectory)!));
        Assert.NotNull(KnownFolders.WhyForbidden(Environment.GetFolderPath(Environment.SpecialFolder.Windows)));
        Assert.NotNull(KnownFolders.WhyForbidden(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)));
        Assert.True(SystemFolders.Snapshot().IsProtected(KnownFolders.Documents));
    }
}

public class SegregatorTests
{
    [Fact]
    public void Segregation_SortsByContent_FixesTypes_DissolvesDuplicates_AndUndoes()
    {
        using var t = new TempRoot();
        var docx = t.Bytes(@"Word\dokument.docx", Samples.Docx(Samples.Contract));
        var pdf = t.Bytes(@"PDF\4402276833442379.pdf", Samples.Pdf(Samples.Invoice));
        var apk = t.File(@"Inne\Skany\Scan.Plus.apk", "apk");
        var dup = t.File(@"Duplikaty\notatki.txt", "Zakupy: mleko, chleb.");
        var part = t.File("porzucony.htm.part", "x", ageDays: 10);

        var settings = new AppSettings { SegregationOcr = false };
        using var seg = new Segregator(settings, inProcess: true);
        var plan = seg.Plan(new[] { new SegregationRoot(t.Path, true, true) }, force: true, CancellationToken.None);

        string Dest(string src) => plan.Moves.Single(m => m.Source == src).Destination;
        Assert.Equal(t.Combine(@"Word\Umowy\dokument.docx"), Dest(docx));
        Assert.Equal(t.Combine(@"PDF\Faktury\4402276833442379.pdf"), Dest(pdf));
        Assert.Equal(t.Combine(@"Instalatory\Scan.Plus.apk"), Dest(apk));
        Assert.Equal(t.Combine(@"Teksty\notatki.txt"), Dest(dup));
        Assert.Equal(t.Combine(@"Niedokończone pobrania\porzucony.htm.part"), Dest(part));

        var runId = Guid.NewGuid().ToString("N")[..12];
        var (moved, failed) = Segregator.Execute(plan, runId, CancellationToken.None);
        Assert.Equal(5, moved);
        Assert.Equal(0, failed);
        Assert.False(Directory.Exists(t.Combine("Duplikaty")));   // pusty po rozłożeniu
        Assert.False(Directory.Exists(t.Combine("Inne")));

        foreach (var (log, file) in History.Run(runId))
            Collector.Undo(log, file, out _);
        Assert.True(File.Exists(docx));
        Assert.True(File.Exists(pdf));
        Assert.True(File.Exists(apk));
        Assert.True(File.Exists(dup));
        Assert.True(File.Exists(part));
    }
}

public class FolderIconTests
{
    [Fact]
    public void Ensure_CreatesHiddenDesktopIni_AndIcon_ThenRemovesWhenEmpty()
    {
        using var t = new TempRoot();
        var folder = t.Combine("Zebrane z pulpitu");
        Directory.CreateDirectory(folder);
        FolderIcon.Ensure(folder);

        var ini = Path.Combine(folder, "desktop.ini");
        Assert.True(File.Exists(ini));
        Assert.True(File.GetAttributes(ini).HasFlag(FileAttributes.Hidden));
        Assert.True(File.GetAttributes(ini).HasFlag(FileAttributes.System));
        Assert.Contains("IconResource=DeskVac.ico", File.ReadAllText(ini));
        Assert.True(new FileInfo(Path.Combine(folder, FolderIcon.IconFile)).Length > 1000);
        Assert.True(new DirectoryInfo(folder).Attributes.HasFlag(FileAttributes.ReadOnly));
        Assert.False(SystemFolders.Snapshot().IsProtected(folder));   // nasza ikona nie udaje folderu systemowego

        Assert.True(FolderIcon.IsEffectivelyEmpty(folder));
        Assert.True(FolderIcon.DeleteIfEmpty(folder));
        Assert.False(Directory.Exists(folder));
    }
}

public class TargetsTests
{
    private static AppSettings Settings()
    {
        var s = new AppSettings();
        s.Folders.Add(new FolderJob { Id = "dl", Path = @"C:\x\Pobrane", Name = "Pobrane", IsDownloads = true });
        s.Folders.Add(new FolderJob { Id = "ex", Path = @"C:\x\Projekty", Name = "Projekty" });
        return s;
    }

    [Theory]
    [InlineData(Targets.Desktop, true, "")]
    [InlineData(Targets.Downloads, false, "dl")]
    [InlineData(Targets.Extra, false, "ex")]
    [InlineData(Targets.DesktopAndDownloads, true, "dl")]
    [InlineData(Targets.All, true, "dl,ex")]
    [InlineData("ex", false, "ex")]
    public void Resolve_CoversExpectedFolders(string id, bool desktop, string folders)
    {
        var (d, f) = Targets.Resolve(id, Settings());
        Assert.Equal(desktop, d);
        Assert.Equal(folders, string.Join(",", f.Select(x => x.Id)));
    }

    [Fact]
    public void Options_DefaultFirst_AndUnknownFallsBackToDesktop()
    {
        var s = Settings();
        var options = Targets.Options(s, withSingleFolders: true);
        Assert.Equal(Targets.Desktop, options[0].Id);
        Assert.Contains(options, o => o.Id == Targets.All);
        Assert.Equal(Targets.Desktop, Targets.Normalize("usuniety-folder", s));
        Assert.Equal(Targets.Desktop, new AppSettings().DefaultTarget);
    }
}

public class UndoSafetyTests
{
    [Fact]
    public void TamperedLog_CannotMoveFilesOutsideRoot()
    {
        using var t = new TempRoot();
        var inside = t.File(@"PDF\a.pdf", "x");
        var log = new CleanupLog
        {
            Kind = "segregation",
            RootFolder = t.Path,
            Moves = { new MoveRecord(Path.Combine(t.Path, "..", "poza.pdf"), inside, 0, 0) },
        };
        var restored = Collector.Undo(log, t.Combine("nie-ma.json"), out int failed);
        Assert.Empty(restored);
        Assert.Equal(1, failed);
        Assert.True(File.Exists(inside));
    }
}
