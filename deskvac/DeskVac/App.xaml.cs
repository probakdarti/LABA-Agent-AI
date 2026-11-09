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

    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += OnUnhandled;
        base.OnStartup(e);
        var args = e.Args;

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

        _tray = new TrayIcon("DeskVac – robot-odkurzacz pulpitu");
        _tray.LeftClick += TogglePanel;
        _tray.RightClick += ShowMenu;

        ToastNotificationManagerCompat.OnActivated += t => Dispatcher.BeginInvoke(() => HandleToast(t.Argument));

        bool atLogon = args.Contains("--tray");
        _scheduler = new Scheduler(Settings, atLogon)
        {
            CountItems = Controller.CountCleanable,
            ShowReminder = Notifications.Reminder,
            StartAutoClean = StartAutoClean,
            UserBusy = UserBusy,
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
        ShellIntegration.RegisterContextMenu(Settings.ContextMenuOnlyOnDesktop, Settings.ProtectedPaths);
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
                Panel.ShowPanel();
                Panel.StartCleaning();
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
        try
        {
            if (Controller.Start(background: false) == 0)
                Controller.SayFromDock(CleaningController.CleanDesktopMessage, sound: Settings.PlaySounds);
        }
        catch (Exception ex)
        {
            Notifications.Info("DeskVac – nie udało się ruszyć", ex.Message);
        }
    }

    // ------------------------------------------------------------------ sprzątanie w tle

    private bool StartAutoClean()
    {
        if (Controller.IsRunning) return false;
        try
        {
            int n = Controller.Start(background: true);
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
    }

    // ------------------------------------------------------------------ okna i menu

    private void TogglePanel()
    {
        if (Panel.IsVisible && Panel.IsActive) Panel.Hide();
        else Panel.ShowPanel();
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
        Item("🧹  Sprzątaj teraz", () => { Panel.ShowPanel(); Panel.StartCleaning(); }, !running);
        if (running) Item("⏹  Zatrzymaj i wróć do bazy", Controller.Stop);
        Item("Pokaż panel", Panel.ShowPanel);
        Item("Ustawienia…", ShowSettings);
        Item("Otwórz folder „Zebrane z pulpitu”", Panel.OpenCollectionFolder);
        Item("↶  Cofnij ostatnie sprzątanie", () => Notifications.Info("DeskVac", Controller.UndoLast()), !running);
        menu.Items.Add(new Separator());
        Item("Zakończ DeskVac", ExitApp);
        menu.IsOpen = true;
    }

    public void ExitApp()
    {
        Settings.Save();
        Panel.AllowClose = true;
        _settingsWindow?.Close();
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
