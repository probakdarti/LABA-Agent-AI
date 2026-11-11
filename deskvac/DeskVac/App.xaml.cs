using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Threading;
using DeskVac.Core;
using DeskVac.Native;
using DeskVac.Panel;
using DeskVac.Platform;
using Microsoft.Toolkit.Uwp.Notifications;

namespace DeskVac;

/// <summary>
/// Start aplikacji: jedna kopia, ikona w zasobniku, robot przy stacji na pulpicie, harmonogram przypomnień.
/// Argumenty: --tray (start z Windows, bez panelu), --show, --clean, --settings, --exit,
/// --toggle-protect "ścieżka" (menu kontekstowe), --cleanup (deinstalacja).
/// </summary>
public partial class App : Application
{
    private SingleInstance? _instance;
    private TrayIcon? _tray;
    private Scheduler? _scheduler;
    private SettingsWindow? _settingsWindow;
    private readonly List<(string Path, bool? Protect)> _pendingToggles = new();
    private DispatcherTimer? _toggleTimer;

    public AppSettings Settings { get; private set; } = new();
    public CleaningController Controller { get; private set; } = null!;
    public MainWindow Panel { get; private set; } = null!;
    public SegregationService Segregation { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        var args = e.Args;

        // proces roboczy segregacji: tylko czyta pliki (bez okien, bez blokady jednej kopii)
        if (args.Length > 0 && args[0] == "--segregation-worker")
        {
            var worker = new Thread(Core.Segregation.Segregator.RunWorker) { IsBackground = false };
            worker.SetApartmentState(ApartmentState.MTA);
            worker.Start();
            worker.Join();
            Shutdown();
            return;
        }

        DispatcherUnhandledException += OnUnhandled;
        base.OnStartup(e);

        if (args.Contains("--cleanup"))
        {
            // deinstalator: zamknij działającą kopię i posprzątaj rejestr
            if (SingleInstance.TryAcquire() is { } own) own.Dispose();
            else SingleInstance.Send(new[] { "--exit" });
            ShellIntegration.RemoveAll();
            Notifications.Uninstall();
            Shutdown();
            return;
        }

        bool toastLaunch = ToastNotificationManagerCompat.WasCurrentProcessToastActivated();
        _instance = SingleInstance.TryAcquire();
        if (_instance is null)
        {
            if (!toastLaunch) SingleInstance.Send(args);
            Shutdown();
            return;
        }

        Settings = AppSettings.Load();
        Theme.Apply(Settings.Theme);
        Settings.StartWithWindows = ShellIntegration.IsAutostartEnabled();
        ShellIntegration.Sync(Settings); // odświeża ścieżkę programu w autostarcie i menu kontekstowym

        Controller = new CleaningController(Settings);
        Panel = new MainWindow(Settings, Controller);
        MainWindow = Panel;
        Controller.Panel = Panel;
        Controller.WidgetClicked += TogglePanel;
        Controller.WidgetTripleClicked += QuickClean;
        Controller.WidgetMenuRequested += ShowMenu;
        Controller.Finished += OnCleaningFinished;

        Segregation = new SegregationService(Settings, Controller);

        _tray = new TrayIcon("DeskVac – robot-odkurzacz pulpitu");
        _tray.LeftClick += TogglePanel;
        _tray.RightClick += ShowMenu;

        ToastNotificationManagerCompat.OnActivated += t => Dispatcher.BeginInvoke(() => HandleToast(t.Argument));

        bool atLogon = args.Contains("--tray");
        _scheduler = new Scheduler(Settings, atLogon)
        {
            CountItems = GatherReminder,
            ShowReminder = Notifications.Reminder,
            StartAutoClean = StartAutoClean,
            UserBusy = UserBusy,
            CountFolder = j => FolderCleaner.Count(j, Settings),
            RemindFolder = Notifications.FolderReminder,
            AutoCleanFolder = AutoCleanFolder,
        };
        _scheduler.Start();

        _instance.Listen(a => Dispatcher.BeginInvoke(() => HandleArgs(a)));

        if (!toastLaunch)
        {
            var rest = args.Where(a => a != "--tray").ToArray();
            if (rest.Length > 0) HandleArgs(rest);
            else if (!atLogon) Panel.ShowPanel();
        }
    }

    // ------------------------------------------------------------------ polecenia

    private void HandleArgs(string[] args)
    {
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--show":
                    Panel.ShowPanel();
                    break;
                case "--clean":
                    Panel.ShowPanel();
                    Panel.StartCleaning();
                    break;
                case "--settings":
                    ShowSettings();
                    break;
                case "--exit":
                    ExitApp();
                    return;
                case "--toggle-protect" when i + 1 < args.Length:
                    QueueToggle(args[++i], null);
                    break;
                case "--protect" when i + 1 < args.Length:
                    QueueToggle(args[++i], true);
                    break;
                case "--unprotect" when i + 1 < args.Length:
                    QueueToggle(args[++i], false);
                    break;
                case "--tray":
                    break;
                case "--clean-folder" when i + 1 < args.Length:
                    CleanFolderPath(args[++i]);
                    break;
                case "--add-folder" when i + 1 < args.Length:
                    AddFolderPath(args[++i]);
                    break;
            }
        }
    }

    /// <summary>Menu kontekstowe uruchamia DeskVac osobno dla każdej zaznaczonej ikony – zbieramy je i pokazujemy jedno powiadomienie.</summary>
    private void QueueToggle(string path, bool? protect)
    {
        _pendingToggles.Add((path.Trim('"'), protect));
        if (_toggleTimer is null)
        {
            _toggleTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(700) };
            _toggleTimer.Tick += (_, _) => { _toggleTimer!.Stop(); ApplyToggles(); };
        }
        _toggleTimer.Stop();
        _toggleTimer.Start();
    }

    private void ApplyToggles()
    {
        var batch = _pendingToggles.ToList();
        _pendingToggles.Clear();
        var on = batch.Where(b => b.Protect == true || (b.Protect is null && !Settings.IsProtected(b.Path))).Select(b => b.Path).ToList();
        var off = batch.Select(b => b.Path).Except(on, StringComparer.OrdinalIgnoreCase).ToList();
        SetProtected(on, true, notify: true);
        SetProtected(off, false, notify: true);
    }

    /// <summary>
    /// Jedno miejsce zmiany ochrony (menu kontekstowe, przeciąganie, lista w ustawieniach):
    /// zapis ustawień, odświeżenie warunków menu kontekstowego, odświeżenie okien.
    /// </summary>
    public void SetProtected(IEnumerable<string> paths, bool protect, bool notify)
    {
        var changed = new List<string>();
        foreach (var raw in paths.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var p = raw.Trim().Trim('"').TrimEnd('\\');
            if (p.Length == 0 || Settings.IsProtected(p) == protect) continue;
            Settings.ToggleProtected(p);
            changed.Add(Path.GetFileName(p));
        }
        if (changed.Count == 0) return;

        Settings.Save();
        ShellIntegration.Sync(Settings);
        _settingsWindow?.ReloadProtected();
        Panel.RefreshProtectedCount();

        if (!notify) return;
        string names = string.Join(", ", changed.Take(4)) + (changed.Count > 4 ? $" i {changed.Count - 4} więcej" : "");
        if (protect)
            Notifications.Info($"🛡 Nie odkurzaj: {changed.Count} {Notifications.Plural(changed.Count)}", names + " – robot to ominie.");
        else
            Notifications.Info($"🧹 Pozwól odkurzać: {changed.Count} {Notifications.Plural(changed.Count)}", names);
    }

    private void HandleToast(string argument)
    {
        var a = ToastArguments.Parse(argument);
        if (!a.TryGetValue("action", out string action)) action = Notifications.ActionShow;
        switch (action)
        {
            case Notifications.ActionClean:
                // przypomnienie dotyczy pulpitu i folderów „razem z pulpitem”
                Launch(true, Settings.FoldersWithDesktop.ToList(), fromPanel: false);
                break;
            case Notifications.ActionSnooze:
                _scheduler?.Snooze(TimeSpan.FromHours(1));
                break;
            case Notifications.ActionSkipToday:
                _scheduler?.SkipToday();
                break;
            case Notifications.ActionStop:
                Controller.Stop();
                break;
            case Notifications.ActionUndo:
                Notifications.Info("DeskVac", Controller.UndoLast());
                break;
            case Notifications.ActionCleanFolder when a.TryGetValue("folder", out string cleanId):
                StartTarget(cleanId);
                break;
            case Notifications.ActionPreviewFolder when a.TryGetValue("folder", out string previewId):
                if (Settings.FindFolder(previewId) is { } pj) ShowFolderPreview(pj, startAfter: true);
                break;
            case Notifications.ActionSegregation:
                Segregation.ShowPending();
                break;
            case Notifications.ActionOpenFolder:
                Panel.OpenCollectionFolder();
                break;
            default:
                Panel.ShowPanel();
                break;
        }
    }

    /// <summary>Szybki start (3× klik w robota): bez otwierania panelu.</summary>
    private void QuickClean()
    {
        if (Controller.IsRunning) return;
        var folders = Settings.QuickCleanIncludesFolders ? Settings.FoldersWithDesktop.ToList() : new List<FolderJob>();
        Launch(desktop: true, folders, fromPanel: false);
    }

    // ------------------------------------------------------------------ cele sprzątania: pulpit, foldery, wszystko

    /// <summary>„all” = pulpit + wszystkie włączone foldery, „desktop” = sam pulpit, inaczej Id folderu.</summary>
    public void StartTarget(string target, bool fromPanel = false)
    {
        if (Controller.IsRunning) return;
        switch (target)
        {
            case "desktop":
                Launch(true, new List<FolderJob>(), fromPanel);
                break;
            case "all":
                Launch(true, Settings.Folders.Where(f => f.Enabled && Directory.Exists(f.Path)).ToList(), fromPanel);
                break;
            default:
                if (Settings.FindFolder(target) is { } job) Launch(false, new List<FolderJob> { job }, fromPanel);
                break;
        }
    }

    private void Launch(bool desktop, List<FolderJob> folders, bool fromPanel)
    {
        try
        {
            var confirmed = ConfirmFolders(folders, interactive: true);
            if (!desktop && confirmed.Count == 0) return; // anulowany podgląd
            int n = Controller.StartRun(background: false, desktop, confirmed);
            if (n == 0)
            {
                string msg = desktop && confirmed.Count == 0 ? CleaningController.CleanDesktopMessage
                    : desktop ? "Pulpit i foldery są czyste!\nNie mam nic do roboty!\nGratulacje! 🙂"
                    : $"„{folders[0].DisplayName}” jest uporządkowany!\nNie mam nic do roboty! 🙂";
                Controller.SayFromDock(msg, sound: Settings.PlaySounds);
                if (fromPanel) Panel.ShowProblem("Nie ma czego sprzątać 🙂");
            }
            else if (fromPanel && Panel.IsVisible)
            {
                Panel.Topmost = true;
            }
        }
        catch (Exception ex)
        {
            if (fromPanel) Panel.ShowProblem(ex.Message);
            else Notifications.Info("DeskVac – nie udało się ruszyć", ex.Message);
        }
    }

    /// <summary>
    /// Pierwsze sprzątanie folderu wymaga zatwierdzenia podglądu. Interaktywnie – pokazujemy okno podglądu;
    /// w tle (harmonogram) – pomijamy folder i wysyłamy powiadomienie „zatwierdź podgląd”.
    /// </summary>
    private List<FolderJob> ConfirmFolders(IEnumerable<FolderJob> jobs, bool interactive)
    {
        var ok = new List<FolderJob>();
        foreach (var job in jobs)
        {
            if (job.PreviewConfirmed) { ok.Add(job); continue; }
            if (!interactive)
            {
                if (FolderCleaner.Count(job, Settings) > 0) Notifications.PreviewNeeded(job);
                continue;
            }
            if (ShowFolderPreview(job, startAfter: false)) ok.Add(job);
        }
        return ok;
    }

    /// <summary>Okno podglądu. Zatwierdzenie zapamiętuje zgodę; startAfter – od razu sprząta ten folder.</summary>
    public bool ShowFolderPreview(FolderJob job, bool startAfter)
    {
        FolderPlan plan;
        var old = System.Windows.Input.Mouse.OverrideCursor;
        System.Windows.Input.Mouse.OverrideCursor = System.Windows.Input.Cursors.Wait;
        try { plan = FolderCleaner.Plan(job, Settings); }
        finally { System.Windows.Input.Mouse.OverrideCursor = old; }

        if (plan.Error is not null)
        {
            MessageBox.Show(plan.Error, "DeskVac – " + job.DisplayName, MessageBoxButton.OK, MessageBoxImage.Information);
            return false;
        }
        if (plan.Moves.Count == 0)
        {
            Controller.SayFromDock($"„{job.DisplayName}” jest uporządkowany!\nNie mam nic do roboty! 🙂", sound: Settings.PlaySounds);
            return false;
        }

        var w = new FolderPreviewWindow(plan);
        if (Panel.IsVisible) w.Owner = Panel;
        if (w.ShowDialog() != true) return false;

        if (Settings.FindFolder(job.Id) is { } saved)
        {
            saved.PreviewConfirmed = true;
            Settings.Save();
        }
        job.PreviewConfirmed = true;
        if (startAfter && !Controller.IsRunning) Controller.StartRun(false, false, new List<FolderJob> { job });
        return true;
    }

    /// <summary>Menu kontekstowe „Posprzątaj ten folder”: folder z listy albo jednorazowo (zawsze z podglądem).</summary>
    private void CleanFolderPath(string path)
    {
        path = path.Trim('"');
        if (KnownFolders.WhyForbidden(path) is { } why)
        {
            Notifications.Info("DeskVac – tego folderu nie sprzątam", why);
            return;
        }
        if (Controller.IsRunning)
        {
            Notifications.Info("DeskVac", "Robot właśnie sprząta – spróbuj za chwilę.");
            return;
        }
        var job = Settings.FindFolder(path);
        if (job is not null) { StartTarget(job.Id); return; }
        var adHoc = FolderJob.ForPath(path);
        if (ShowFolderPreview(adHoc, startAfter: false))
            Controller.StartRun(false, false, new List<FolderJob> { adHoc });
    }

    /// <summary>Menu kontekstowe „Sprzątaj ten folder regularnie”.</summary>
    private void AddFolderPath(string path)
    {
        path = path.Trim('"');
        if (KnownFolders.WhyForbidden(path) is { } why)
        {
            Notifications.Info("DeskVac – tego folderu nie sprzątam", why);
            return;
        }
        var job = Settings.FindFolder(path);
        if (job is null)
        {
            job = FolderJob.ForPath(path);
            Settings.Folders.Add(job);
            OnFoldersChanged();
        }
        ShowSettings();
        EditFolder(job);
    }

    /// <summary>Okno ustawień folderu; po zapisaniu – zapis, menu kontekstowe, lista w panelu.</summary>
    public bool EditFolder(FolderJob job)
    {
        var w = new FolderJobWindow(job);
        if (_settingsWindow is { IsVisible: true } sw) w.Owner = sw;
        else if (Panel.IsVisible) w.Owner = Panel;
        if (w.ShowDialog() != true) return false;
        OnFoldersChanged();
        return true;
    }

    public void OnFoldersChanged()
    {
        Settings.Save();
        ShellIntegration.Sync(Settings);
        Panel.RefreshTargets();
        _settingsWindow?.RenderFolders();
    }

    private (int Total, string Details) GatherReminder()
    {
        var parts = new List<string>();
        int desktop = Controller.CountCleanable();
        if (desktop > 0) parts.Add($"Pulpit {desktop}");
        int total = desktop;
        foreach (var job in Settings.FoldersWithDesktop)
        {
            int n = FolderCleaner.Count(job, Settings);
            if (n == 0) continue;
            total += n;
            parts.Add($"{job.DisplayName} {n}");
        }
        return (total, string.Join(" · ", parts));
    }

    /// <summary>Własny harmonogram folderu: sprzątanie automatyczne w tle.</summary>
    private bool AutoCleanFolder(FolderJob job)
    {
        if (Controller.IsRunning) return false;
        var ok = ConfirmFolders(new[] { job }, interactive: false);
        if (ok.Count == 0) return true; // brak zgody (wysłano prośbę o podgląd) albo nic do roboty – dziś już nie próbujemy
        try
        {
            int n = Controller.StartRun(background: true, desktop: false, ok);
            if (n > 0) Notifications.Info($"🤖 Robot porządkuje „{job.DisplayName}”", $"{n} {Notifications.Plural(n)} – w tle, możesz pracować dalej.");
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    // ------------------------------------------------------------------ sprzątanie w tle

    private bool StartAutoClean()
    {
        if (Controller.IsRunning) return false;
        try
        {
            int n = Controller.StartRun(background: true, desktop: true, ConfirmFolders(Settings.FoldersWithDesktop, interactive: false));
            if (n > 0) Notifications.AutoCleanStarted(n);
            else Controller.SayFromDock(CleaningController.CleanDesktopMessage, 8, sound: Settings.PlaySounds && !Settings.AutoCleanQuiet);
            return true; // także gdy pulpit był czysty – dziś już nie próbujemy
        }
        catch (Exception)
        {
            return false;
        }
    }

    /// <summary>Prezentacja, gra lub film na pełnym ekranie – nie przeszkadzamy.</summary>
    private static bool UserBusy()
    {
        try
        {
            return NativeMethods.SHQueryUserNotificationState(out int state) == 0 && state is 2 or 3 or 4;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private void OnCleaningFinished()
    {
        if (Controller.IsBackgroundRun || !Panel.IsVisible)
            Notifications.Finished(Controller.Collected, Controller.Skipped, Controller.LastProblem, Controller.SummaryText);

        // drugi etap w tle: segregacja według treści (dołącza do tego samego wyjazdu – wspólne „Cofnij”)
        if (Settings.SegregationEnabled && Settings.SegregationAuto && Controller.Collected > 0)
            Segregation.Start(force: false, interactive: false, runId: Controller.LastRunId);
    }

    // ------------------------------------------------------------------ okna i menu

    private void TogglePanel()
    {
        if (Panel.IsVisible && Panel.IsActive) Panel.Hide();
        else Panel.ShowPanel();
    }

    private void ShowAbout()
    {
        ShowSettings();
        _settingsWindow?.Dispatcher.BeginInvoke(() => _settingsWindow?.ShowAbout(), System.Windows.Threading.DispatcherPriority.Loaded);
    }

    public void ShowSettings()
    {
        try
        {
            // okno już otwarte – mogło zostać zminimalizowane (np. przez „Zminimalizuj okna na czas sprzątania”)
            if (_settingsWindow is { IsLoaded: true } open)
            {
                BringToFront(open);
                return;
            }
            var w = new SettingsWindow(Settings, Controller);
            w.Closed += (_, _) =>
            {
                if (ReferenceEquals(_settingsWindow, w)) _settingsWindow = null;
                Panel.LoadQuickSettings();
            };
            _settingsWindow = w;
            w.Show();
            BringToFront(w);
        }
        catch (Exception ex)
        {
            _settingsWindow = null;
            MessageBox.Show("Nie udało się otworzyć ustawień: " + ex.Message, "DeskVac", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    /// <summary>Przywraca (także ze stanu zminimalizowanego) i wyciąga okno na wierzch.</summary>
    private static void BringToFront(Window w)
    {
        if (!w.IsVisible) w.Show();
        if (w.WindowState == WindowState.Minimized) w.WindowState = WindowState.Normal;
        w.Activate();
        // Windows potrafi odmówić aktywacji – chwilowe „zawsze na wierzchu” wymusza widoczność
        w.Topmost = true;
        w.Topmost = false;
        w.Focus();
    }

    private void ShowMenu()
    {
        if (_tray is not null) NativeMethods.SetForegroundWindow(_tray.Handle);
        var menu = new ContextMenu { Placement = PlacementMode.MousePoint };

        MenuItem Item(string header, Action action, bool enabled = true)
        {
            var mi = new MenuItem { Header = header, IsEnabled = enabled };
            mi.Click += (_, _) => action();
            menu.Items.Add(mi);
            return mi;
        }

        bool running = Controller.IsRunning;
        Item("🧹  Sprzątaj pulpit", () => StartTarget("desktop"), !running);
        if (Settings.Folders.Any(f => f.Enabled)) Item("Sprzątaj wszystko (pulpit + foldery)", () => StartTarget("all"), !running);
        foreach (var job in Settings.Folders.Where(f => f.Enabled))
        {
            var id = job.Id;
            Item($"Sprzątaj „{job.DisplayName}”", () => StartTarget(id), !running);
        }
        if (running) Item("⏹  Zatrzymaj i wróć do bazy", Controller.Stop);
        Item("Pokaż panel", Panel.ShowPanel);
        Item("Ustawienia…", ShowSettings);
        Item("Otwórz folder „Zebrane z pulpitu”", Panel.OpenCollectionFolder);
        Item("↶  Cofnij ostatnie sprzątanie", () => Notifications.Info("DeskVac", Controller.UndoLast()), !running);
        menu.Items.Add(new Separator());
        Item($"O programie (autor: {AppInfo.Author})…", ShowAbout);
        Item("Zakończ DeskVac", ExitApp);
        menu.IsOpen = true;
    }

    public void ExitApp()
    {
        Settings.Save();
        Panel.AllowClose = true;
        _settingsWindow?.Close();
        Segregation?.Cancel();
        Controller.Dispose();
        _tray?.Dispose();
        _instance?.Dispose();
        Shutdown();
    }

    private static void OnUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        MessageBox.Show(e.Exception.Message, "DeskVac – błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
        e.Handled = true;
    }
}
