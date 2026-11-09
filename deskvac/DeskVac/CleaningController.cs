using System.Windows;
using System.Windows.Threading;
using DeskVac.Audio;
using DeskVac.Core;
using DeskVac.Native;
using DeskVac.Overlay;
using DeskVac.Platform;
using Microsoft.Win32;

namespace DeskVac;

/// <summary>
/// Serce aplikacji: odczyt pulpitu (wszystkie monitory), przenoszenie plików, nakładki z robotem
/// (po jednej na monitor), widżet „robot przy stacji” i dźwięk.
/// Wszystkie współrzędne w fizycznych pikselach ekranu.
/// </summary>
public sealed class CleaningController : IDisposable
{
    private readonly AppSettings _settings;
    private readonly SoundEngine? _sound;
    private readonly DesktopLayer _layer = new();
    private readonly List<OverlayWindow> _overlays = new();
    private readonly DispatcherTimer _idleTimer = new() { Interval = TimeSpan.FromMilliseconds(66) };
    private readonly DispatcherTimer _panTimer = new() { Interval = TimeSpan.FromMilliseconds(50) };
    private List<MonitorInfo> _monitors = new();
    private Rect _world;
    private DockWidget? _widget;
    private DesktopView? _view;
    private Collector? _collector;
    private DispatcherTimer? _refreshTimer;
    private bool _minimizedWindows;
    private bool _previewing;
    private bool _speaking;
    private long _bytes;

    public CleaningController(AppSettings settings)
    {
        _settings = settings;
        try
        {
            _sound = new SoundEngine();
        }
        catch (Exception)
        {
            _sound = null; // bez dźwięku, ale działa
        }

        Stage.CollectHandler = OnCollect;
        Stage.Finished += OnStageFinished;
        Stage.PhaseChanged += OnPhaseChanged;
        Stage.ItemCollected += it => _sound?.PlaySuck(PanOf(it.Center.X));
        Stage.ItemDiscovered += it => _sound?.PlayPing(PanOf(it.Center.X));
        Stage.ItemSkipped += it => _sound?.Play("skip", 0.8f, PanOf(it.Center.X));
        Stage.Invalidated += OnStageInvalidated;
        Stage.ScaleAt = p => _monitors.Count == 0 ? 1.0 : Monitors.At(_monitors, p).Scale;
        Stage.WorkAreaAt = p => _monitors.Count == 0 ? new Rect(0, 0, 1e6, 1e6) : Monitors.At(_monitors, p).WorkArea;

        _idleTimer.Tick += (_, _) => { if (!Stage.Running) Stage.Tick(_idleTimer.Interval.TotalSeconds); };
        _panTimer.Tick += (_, _) => { if (_sound is not null) _sound.MotorPan = PanOf(Stage.Position.X); };

        SystemEvents.DisplaySettingsChanged += (_, _) => Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            if (!IsRunning) RebuildLayout();
        });

        RebuildLayout();
        _idleTimer.Start();
    }

    public Stage Stage { get; } = new();
    public Window? Panel { get; set; }
    public bool IsRunning { get; private set; }
    public bool IsBackgroundRun { get; private set; }
    public int Total { get; private set; }
    public int Collected { get; private set; }
    public int Skipped { get; private set; }
    public long CollectedBytes => Interlocked.Read(ref _bytes);
    public string? LastProblem { get; private set; }

    /// <summary>Np. „Word 3 · PDF 2 · Zdjęcia 5” – co trafiło gdzie przy ostatnim sprzątaniu.</summary>
    public string SummaryText => _summary.Count == 0
        ? ""
        : string.Join(" · ", _summary.OrderByDescending(kv => kv.Value).Take(8).Select(kv => $"{kv.Key} {kv.Value}"));
    public string CollectionFolder => new Collector(_settings).BaseFolder;
    public IReadOnlyList<MonitorInfo> MonitorList => _monitors;
    public Rect World => _world;

    public event Action? Finished;
    public event Action? WidgetClicked;
    /// <summary>Potrójne kliknięcie w robota – szybki start sprzątania.</summary>
    public event Action? WidgetTripleClicked;
    public event Action? WidgetMenuRequested;

    // ------------------------------------------------------------------ układ ekranów, widżet

    /// <summary>Monitory, stacja dokująca (prawy dolny róg ekranu głównego) i widżet.</summary>
    private void RebuildLayout()
    {
        _monitors = Monitors.GetAll();
        _world = Monitors.Union(_monitors);
        Stage.WorldSize = _world.Size;

        var primary = Monitors.Primary(_monitors);
        double s = primary.Scale;
        var wa = primary.WorkArea;
        var dockTop = new Point(wa.Right - 120 * s, wa.Bottom - (Stage.BaseRadius * 1.15 + 18) * s);
        Stage.SetDock(dockTop);

        foreach (var o in _overlays) o.Close();
        _overlays.Clear();

        // widżet ma zapas miejsca nad robotem na chmurkę (przezroczyste piksele przepuszczają kliknięcia)
        var widgetRect = new Rect(dockTop.X - 250 * s, dockTop.Y - 220 * s, 330 * s, 220 * s + Stage.BaseRadius * 1.15 * s + 16 * s);
        widgetRect.Intersect(primary.WorkArea);
        if (_widget is null)
        {
            _widget = new DockWidget(widgetRect, Stage);
            _widget.MouseLeftButtonDown += OnWidgetMouseDown;
            _widget.MouseRightButtonUp += (_, e) => { e.Handled = true; WidgetMenuRequested?.Invoke(); };
            _widget.SourceInitialized += (_, _) => _layer.Add(_widget.Handle);
        }
        else
        {
            _widget.MoveTo(widgetRect);
        }
        // chmurka mieści się w oknie widżetu (z marginesem), inaczej byłaby ucinana
        var bubbleArea = widgetRect;
        bubbleArea.Inflate(-6 * s, -6 * s);
        Stage.BubbleArea = bubbleArea;
        UpdateWidgetVisibility();
    }

    private DispatcherTimer? _clickTimer;

    /// <summary>
    /// 1 klik = panel (po krótkiej chwili, żeby odróżnić od wielokrotnego kliknięcia), 3 kliki = sprzątanie.
    /// WPF sam liczy kliknięcia w czasie systemowego „podwójnego kliknięcia” (e.ClickCount).
    /// </summary>
    private void OnWidgetMouseDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        e.Handled = true;
        _clickTimer ??= CreateClickTimer();
        _clickTimer.Stop();
        if (e.ClickCount >= 3)
        {
            WidgetTripleClicked?.Invoke();
            return;
        }
        _clickTimer.Start(); // czekamy, czy będzie trzecie kliknięcie
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern uint GetDoubleClickTime();

    private DispatcherTimer CreateClickTimer()
    {
        var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds((int)GetDoubleClickTime() + 60) };
        t.Tick += (_, _) => { t.Stop(); WidgetClicked?.Invoke(); };
        return t;
    }

    public void UpdateWidgetVisibility()
    {
        if (_widget is null) return;
        bool show = (_settings.ShowRobotOnDesktop || _speaking) && !IsRunning && !_previewing;
        if (show && !_widget.IsVisible)
        {
            _widget.Show();
            _layer.Refresh();
        }
        else if (!show && _widget.IsVisible)
        {
            _widget.Hide();
        }
    }

    private void OnStageInvalidated()
    {
        foreach (var o in _overlays)
            if (o.IsVisible) o.View.InvalidateVisual();
        if (_widget is { IsVisible: true }) _widget.View.InvalidateVisual();
    }

    private void EnsureOverlays()
    {
        if (_overlays.Count == _monitors.Count) return;
        foreach (var o in _overlays) o.Close();
        _overlays.Clear();
        foreach (var m in _monitors) _overlays.Add(new OverlayWindow(m, Stage));
    }

    private void ShowOverlays(bool onTop)
    {
        EnsureOverlays();
        foreach (var o in _overlays)
        {
            o.Topmost = onTop;
            o.Show();
            if (onTop) _layer.Remove(o.Handle);
            else _layer.Add(o.Handle);
        }
        Stage.Running = true;
    }

    private void HideOverlays()
    {
        foreach (var o in _overlays)
        {
            _layer.Remove(o.Handle);
            o.Hide();
        }
        Stage.Running = false;
    }

    // ------------------------------------------------------------------ dźwięk

    public void ApplySoundSettings()
    {
        if (_sound is null) return;
        bool quiet = IsRunning && IsBackgroundRun && _settings.AutoCleanQuiet;
        _sound.Enabled = _settings.PlaySounds && !quiet;
        _sound.Volume = (float)_settings.Volume;
        if (!_sound.Enabled) _sound.MotorStop();
    }

    private float PanOf(double x) =>
        _world.Width <= 0 ? 0 : (float)Math.Clamp((x - _world.X) / _world.Width * 2 - 1, -1, 1);

    private void OnPhaseChanged(RobotPhase phase)
    {
        if (_sound is null) return;
        switch (phase)
        {
            case RobotPhase.Undocking:
                _sound.Play("chime_start", 0.7f);
                _sound.MotorStart();
                break;
            case RobotPhase.Scanning:
                _sound.Play("scan", 0.9f, PanOf(Stage.Position.X));
                break;
            case RobotPhase.Docking:
                _sound.MotorStop(); // wybieg silnika podczas parkowania
                break;
            case RobotPhase.Emptying:
                _sound.MotorStop();
                _sound.Play("dock", 0.9f, PanOf(Stage.Position.X));
                Delay(350, () => _sound.Play("empty", 1f, PanOf(Stage.Position.X)));
                break;
            case RobotPhase.Done:
                _sound.MotorStop();
                Delay(250, () => _sound.Play("chime_done", 0.7f));
                break;
        }
    }

    private static void Delay(int ms, Action action)
    {
        var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(ms) };
        t.Tick += (_, _) => { t.Stop(); action(); };
        t.Start();
    }

    // ------------------------------------------------------------------ sprzątanie

    /// <summary>
    /// Rusza robota. background = sprzątanie automatyczne: bez minimalizowania okien,
    /// nakładki leżą pod oknami programów (nie przeszkadzają), opcjonalnie bez dźwięku.
    /// Zwraca liczbę elementów do zebrania (0 = nic do roboty).
    /// </summary>
    /// <summary>Sam pulpit (zgodność wstecz).</summary>
    public int Start(bool background) => StartRun(background, desktop: true, Array.Empty<FolderJob>());

    private readonly Queue<FolderJob> _pendingFolders = new();
    private readonly Dictionary<string, int> _summary = new(StringComparer.OrdinalIgnoreCase);
    private CancellationTokenSource? _cts;
    private string _runId = "";

    /// <summary>
    /// Rusza robota: pulpit (opcjonalnie) i podane foldery, po kolei w jednym wyjeździe.
    /// background = sprzątanie automatyczne: bez minimalizowania okien, nakładki pod oknami programów.
    /// Zwraca szacowaną liczbę elementów (0 = nic do roboty).
    /// </summary>
    public int StartRun(bool background, bool desktop, IReadOnlyList<FolderJob> folders)
    {
        if (IsRunning) return 0;
        RebuildLayout();

        List<DesktopItem> items = new();
        int cleanable = 0;
        _collector = null;
        if (desktop)
        {
            _view = DesktopView.Open();
            _collector = new Collector(_settings);
            items = ReadItems(_view, _collector, exact: true);
            cleanable = items.Count(i => i.State == ItemState.Hidden);
        }

        _pendingFolders.Clear();
        int folderEstimate = 0;
        foreach (var job in folders)
        {
            int n = FolderCleaner.Count(job, _settings);
            if (n == 0) continue;
            folderEstimate += n;
            _pendingFolders.Enqueue(job);
        }
        if (cleanable == 0 && _pendingFolders.Count == 0) return 0;

        _runId = Guid.NewGuid().ToString("N")[..12];
        _cts = new CancellationTokenSource();
        _summary.Clear();
        Total = cleanable + folderEstimate;
        Collected = 0;
        Skipped = 0;
        LastProblem = null;
        Interlocked.Exchange(ref _bytes, 0);
        if (cleanable > 0) _collector!.Begin(_runId);
        else _collector = null;

        IsRunning = true;
        IsBackgroundRun = background;
        ApplySoundSettings();
        UpdateWidgetVisibility();
        _panTimer.Start();
        Stage.NextWork = NextFolder;

        void Launch()
        {
            ShowOverlays(onTop: !background);
            if (cleanable > 0) Stage.Start(items);
            else Stage.StartFoldersOnly();
        }

        if (!background && _settings.MinimizeWindows)
        {
            // najpierw chowamy okna, dopiero potem wypuszczamy robota (żeby nakładki nie zostały zminimalizowane)
            MinimizeAllWindows();
            Delay(450, Launch);
        }
        else
        {
            Launch();
        }

        // przy włączonym „Autorozmieszczaniu” Explorer przesuwa ikony po każdym zabraniu – śledzimy to
        if (cleanable > 0 && _view!.AutoArrange)
        {
            _refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
            _refreshTimer.Tick += (_, _) => RefreshPositions(items);
            _refreshTimer.Start();
        }
        return Total;
    }

    /// <summary>Robot skończył poprzednią pracę – bierze kolejny folder z kolejki (plan i przeprowadzka w tle).</summary>
    private bool NextFolder()
    {
        if (_pendingFolders.Count == 0 || _cts is null || _cts.IsCancellationRequested) return false;
        var job = _pendingFolders.Dequeue();
        Stage.BeginFolderRun(job.DisplayName);

        var ct = _cts.Token;
        var dispatcher = Application.Current.Dispatcher;
        int estimate = FolderCleaner.Count(job, _settings);
        Task.Run(() =>
        {
            FolderPlan? plan = null;
            try
            {
                plan = FolderCleaner.Plan(job, _settings, withDuplicates: true, ct);
            }
            catch (Exception ex)
            {
                dispatcher.BeginInvoke(() => LastProblem = $"{job.DisplayName}: {ex.Message}");
            }

            if (plan is null || plan.Error is not null)
            {
                dispatcher.BeginInvoke(() =>
                {
                    if (plan?.Error is { } err) LastProblem = $"{job.DisplayName}: {err}";
                    Total = Math.Max(Collected, Total - estimate);
                    Stage.SetFolderTotal(0);
                    Stage.EndFolderInput();
                });
                return;
            }

            dispatcher.BeginInvoke(() =>
            {
                Total = Math.Max(Collected, Total - estimate + plan.Moves.Count);
                Stage.SetFolderTotal(plan.Moves.Count);
            });

            var result = FolderCleaner.Execute(plan, _runId, (m, dest) =>
            {
                if (!m.IsFolder) Interlocked.Add(ref _bytes, m.Size);
                dispatcher.BeginInvoke(() =>
                {
                    Collected++;
                    var top = m.Category.Split(Path.DirectorySeparatorChar)[0];
                    _summary[top] = _summary.GetValueOrDefault(top) + 1;
                    var item = new DesktopItem
                    {
                        Path = dest,
                        Name = Path.GetFileName(dest),
                        Kind = m.IsFolder ? ItemKind.Folder : ItemKind.File,
                        Icon = Stage.FolderQueueHasRoom ? FileIcons.Large(dest) : null,
                        Category = m.Category,
                    };
                    Stage.EmitFolderItem(item);
                });
            }, ct);

            dispatcher.BeginInvoke(() =>
            {
                Skipped += result.Failed;
                if (result.Problem is not null) LastProblem = $"{job.DisplayName}: pominięto {result.Problem}";
                Stage.EndFolderInput();
            });
        }, ct);
        return true;
    }

    /// <summary>Liczba elementów do posprzątania w folderach (do przypomnień).</summary>
    public int CountFolders(IEnumerable<FolderJob> jobs) => jobs.Sum(j => FolderCleaner.Count(j, _settings));

    public void TogglePause()
    {
        if (!IsRunning) return;
        Stage.Paused = !Stage.Paused;
        // na pauzie silnik zwalnia do zera, po wznowieniu znów się rozpędza
        if (Stage.Paused) _sound?.MotorStop();
        else if (Stage.Phase is RobotPhase.Undocking or RobotPhase.Scanning or RobotPhase.Cleaning or RobotPhase.Returning)
            _sound?.MotorStart();
    }

    public void Stop()
    {
        if (!IsRunning) return;
        _cts?.Cancel();
        _pendingFolders.Clear();
        Stage.RequestStop();
    }

    private bool OnCollect(DesktopItem item)
    {
        if (_collector is null) return false;
        var dest = _collector.TryCollect(item, out var error);
        if (dest is null)
        {
            Skipped++;
            LastProblem = $"Pominięto „{item.Name}”: {error}";
            return false;
        }

        item.MovedTo = dest;
        Collected++;
        var top = (item.Category ?? "").Split(Path.DirectorySeparatorChar)[0];
        if (top.Length > 0) _summary[top] = _summary.GetValueOrDefault(top) + 1;
        Task.Run(() => Interlocked.Add(ref _bytes, Collector.SizeOf(dest)));
        return true;
    }

    private void OnStageFinished()
    {
        _refreshTimer?.Stop();
        _refreshTimer = null;
        _collector?.Finish();
        _panTimer.Stop();

        Delay(1600, () =>
        {
            if (IsRunning) return;
            HideOverlays();
            UpdateWidgetVisibility();
            if (_minimizedWindows) RestoreAllWindows();
        });

        IsRunning = false;
        ApplySoundSettings();
        Finished?.Invoke();
    }

    /// <summary>
    /// Robot mówi z chmurki nad stacją (np. „pulpit czysty”). Widżet na chwilę wychodzi na wierzch,
    /// ale nie zabiera fokusu – nie przerywa pracy.
    /// </summary>
    public void SayFromDock(string text, double seconds = 6, bool sound = true)
    {
        if (IsRunning || _widget is null) return;
        _speaking = true;
        UpdateWidgetVisibility();
        _widget.Topmost = true;
        _idleTimer.Interval = TimeSpan.FromMilliseconds(33); // płynniejsza animacja chmurki
        Stage.Say(text, seconds);
        if (sound) _sound?.Play("chime_done", 0.6f, PanOf(Stage.Position.X));
        Delay((int)(seconds * 1000) + 200, () =>
        {
            _speaking = false;
            _idleTimer.Interval = TimeSpan.FromMilliseconds(66);
            if (_widget is null) return;
            _widget.Topmost = false;
            UpdateWidgetVisibility();
            _layer.Refresh();
        });
    }

    public const string CleanDesktopMessage = "Twój Pulpit jest czysty!\nNie mam nic do roboty!\nGratulacje! 🙂";

    /// <summary>Podgląd namierzania: ramki wokół wykrytych ikon na wszystkich monitorach przez kilka sekund.</summary>
    public int PreviewTargets(int seconds = 6)
    {
        if (IsRunning) return 0;
        RebuildLayout();
        var view = DesktopView.Open();
        var items = ReadItems(view, new Collector(_settings), exact: true);
        _previewing = true;
        UpdateWidgetVisibility();
        ShowOverlays(onTop: true);
        Stage.ShowPreview(items);
        Delay(seconds * 1000, () =>
        {
            _previewing = false;
            if (IsRunning) return;
            Stage.ShowPreview(Array.Empty<DesktopItem>());
            HideOverlays();
            UpdateWidgetVisibility();
        });
        return items.Count;
    }

    /// <summary>Ile elementów robot by teraz zebrał (do treści przypomnień).</summary>
    public int CountCleanable()
    {
        var view = DesktopView.Open();
        var collector = new Collector(_settings);
        int n = 0;
        foreach (var raw in view.ReadIcons(withIcons: false, exactRects: false))
            if (IsCandidate(raw, collector, out _) && !_settings.IsExcluded(raw.Name, raw.FileSystemPath!)) n++;
        return n;
    }

    // ------------------------------------------------------------------ odczyt pulpitu

    private static readonly string[] DesktopDirs =
    {
        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
        Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
    };

    /// <summary>
    /// Czy element naprawdę leży w folderze pulpitu (własnym lub publicznym). Ikony systemowe pulpitu –
    /// folder użytkownika („Paweł Robak” = C:\Users\…), OneDrive, biblioteki, Ten komputer, Kosz,
    /// Panel sterowania – wskazują gdzie indziej albo nigdzie i są pomijane automatycznie.
    /// </summary>
    public static bool LiesOnDesktop([System.Diagnostics.CodeAnalysis.NotNullWhen(true)] string? path)
    {
        if (string.IsNullOrEmpty(path)) return false;
        var parent = Path.GetDirectoryName(path.TrimEnd('\\'));
        if (parent is null) return false;
        return DesktopDirs.Any(d => !string.IsNullOrEmpty(d) &&
            string.Equals(Path.TrimEndingDirectorySeparator(d), Path.TrimEndingDirectorySeparator(parent), StringComparison.OrdinalIgnoreCase));
    }

    private bool IsCandidate(RawDesktopIcon raw, Collector collector, out ItemKind kind)
    {
        kind = ItemKind.File;
        if (!LiesOnDesktop(raw.FileSystemPath)) return false;          // Kosz, Ten komputer, folder użytkownika itp.
        if (collector.IsCollectionFolder(raw.FileSystemPath!)) return false;
        kind = DesktopItem.Classify(raw.FileSystemPath);
        return _settings.Accepts(kind);
    }

    /// <summary>Elementy do zebrania (stan Hidden) oraz chronione (stan Protected – robot je omija, ale je widać).</summary>
    private List<DesktopItem> ReadItems(DesktopView view, Collector collector, bool exact)
    {
        var origin = view.ListOriginOnScreen;
        var spacing = view.Spacing;
        int iconSize = DesktopIconSize();

        var list = new List<DesktopItem>();
        foreach (var raw in view.ReadIcons(withIcons: true, exactRects: exact))
        {
            if (!LiesOnDesktop(raw.FileSystemPath) || collector.IsCollectionFolder(raw.FileSystemPath!)) continue;
            var kind = DesktopItem.Classify(raw.FileSystemPath);
            bool isProtected = _settings.IsExcluded(raw.Name, raw.FileSystemPath);
            if (!isProtected && !_settings.Accepts(kind)) continue;

            list.Add(new DesktopItem
            {
                Path = raw.FileSystemPath,
                Name = raw.Name,
                Kind = kind,
                Icon = raw.Icon,
                ListPosition = raw.Position,
                IconRect = IconRectOf(raw, origin, spacing, iconSize),
                State = isProtected ? ItemState.Protected : ItemState.Hidden,
            });
        }
        return list;
    }

    private void RefreshPositions(List<DesktopItem> items)
    {
        if (_view is null) return;
        try
        {
            var origin = _view.ListOriginOnScreen;
            var spacing = _view.Spacing;
            int iconSize = DesktopIconSize();
            var byPath = _view.ReadIcons(withIcons: false, exactRects: true)
                .Where(r => r.FileSystemPath is not null)
                .GroupBy(r => r.FileSystemPath!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (var it in items)
            {
                if (it.State is ItemState.Collected or ItemState.Skipped) continue;
                if (byPath.TryGetValue(it.Path, out var raw))
                {
                    it.ListPosition = raw.Position;
                    it.IconRect = IconRectOf(raw, origin, spacing, iconSize);
                }
            }
        }
        catch (Exception)
        {
            // Explorer chwilowo zajęty – spróbujemy przy następnym tyknięciu
        }
    }

    /// <summary>Prostokąt ikony w px: dokładny z Explorera, a gdy go brak – wyliczony z siatki. Plus korekta z ustawień.</summary>
    private Rect IconRectOf(RawDesktopIcon raw, POINT origin, POINT spacing, int iconSize)
    {
        Rect r;
        if (raw.IconRect is { } exact)
        {
            // LVIR_ICON to „komórka” ikony (szersza niż obrazek) – bierzemy wyśrodkowany kwadrat w rozmiarze ikony
            var c = new Point(exact.X + exact.Width / 2, exact.Y + exact.Height / 2);
            double scale = _monitors.Count == 0 ? 1 : Monitors.At(_monitors, c).Scale;
            double side = Math.Min(iconSize * scale, Math.Min(exact.Width, exact.Height));
            r = new Rect(c.X - side / 2, c.Y - side / 2, side, side);
        }
        else
        {
            var guess = new Point(origin.X + raw.Position.X, origin.Y + raw.Position.Y);
            double scale = _monitors.Count == 0 ? 1 : Monitors.At(_monitors, guess).Scale;
            double iconPx = iconSize * scale;
            double cellW = spacing.X > 0 ? spacing.X : iconPx * 1.6;
            r = new Rect(guess.X + (cellW - iconPx) / 2, guess.Y + 2 * scale, iconPx, iconPx);
        }
        double k = _monitors.Count == 0 ? 1 : Monitors.At(_monitors, new Point(r.X + r.Width / 2, r.Y + r.Height / 2)).Scale;
        r.Offset(_settings.OffsetX * k, _settings.OffsetY * k);
        return r;
    }

    /// <summary>Rozmiar ikon pulpitu (Widok → Małe/Średnie/Duże), w pikselach przy 100%.</summary>
    private static int DesktopIconSize()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\Shell\Bags\1\Desktop");
            if (key?.GetValue("IconSize") is int size && size is >= 16 and <= 256) return size;
        }
        catch (Exception)
        {
            // brak dostępu – wartość domyślna
        }
        return 48;
    }

    // ------------------------------------------------------------------ cofanie

    /// <summary>Cofa ostatnie sprzątanie: przenosi elementy z powrotem i odtwarza ich pozycje na pulpicie.</summary>
    public string UndoLast()
    {
        if (IsRunning) return "Poczekaj, aż robot skończy sprzątanie.";
        var run = Collector.LoadLastRun();
        if (run.Count == 0) return "Brak sprzątania do cofnięcia.";

        int restoredCount = 0, failed = 0;
        var positions = new List<(string Path, POINT Position)>();
        foreach (var (log, file) in run)
        {
            var restored = Collector.Undo(log, file, out int f);
            failed += f;
            restoredCount += restored.Count;
            if (!log.IsFolder) positions.AddRange(restored); // pozycje ikon tylko dla pulpitu
        }
        if (positions.Count > 0) RestorePositionsLater(positions);

        return failed == 0
            ? $"Przywrócono {restoredCount} {Notifications.Plural(restoredCount)} na dawne miejsca."
            : $"Przywrócono {restoredCount}, nie udało się: {failed} (np. plik o tej samej nazwie już tam jest).";
    }

    private static void RestorePositionsLater(List<(string Path, POINT Position)> restored)
    {
        // Explorer potrzebuje chwili, żeby zauważyć nowe pliki – próbujemy kilka razy
        var pending = new List<(string Path, POINT Position)>(restored);
        int attempts = 0;
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        timer.Tick += (_, _) =>
        {
            attempts++;
            try
            {
                var view = DesktopView.Open();
                if (!view.AutoArrange)
                    pending.RemoveAll(p => view.PositionItem(p.Path, p.Position));
                else
                    pending.Clear();
            }
            catch (Exception)
            {
                // spróbujemy ponownie
            }
            if (pending.Count == 0 || attempts >= 10) timer.Stop();
        };
        timer.Start();
    }

    // ------------------------------------------------------------------ okna

    private void MinimizeAllWindows()
    {
        try
        {
            dynamic? shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!);
            shell?.MinimizeAll();
            _minimizedWindows = true;

            // panel (jeśli był otwarty) ma zostać na wierzchu
            if (Panel is { IsVisible: true } panel)
                Delay(350, () => { panel.WindowState = WindowState.Normal; panel.Activate(); });
        }
        catch (Exception)
        {
            _minimizedWindows = false;
        }
    }

    private void RestoreAllWindows()
    {
        _minimizedWindows = false;
        try
        {
            dynamic? shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!);
            shell?.UndoMinimizeALL();
        }
        catch (Exception)
        {
            // trudno – użytkownik przywróci okna sam
        }
    }

    public void Dispose()
    {
        _idleTimer.Stop();
        _panTimer.Stop();
        Stage.Running = false;
        _layer.Dispose();
        foreach (var o in _overlays) o.Close();
        _widget?.Close();
        _sound?.Dispose();
    }
}
