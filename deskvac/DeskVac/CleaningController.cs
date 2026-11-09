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
    public string CollectionFolder => new Collector(_settings).BaseFolder;
    public IReadOnlyList<MonitorInfo> MonitorList => _monitors;
    public Rect World => _world;

    public event Action? Finished;
    public event Action? WidgetClicked;
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

        var widgetRect = new Rect(dockTop.X - 80 * s, dockTop.Y - 80 * s, 160 * s, 80 * s + Stage.BaseRadius * 1.15 * s + 16 * s);
        if (_widget is null)
        {
            _widget = new DockWidget(widgetRect, Stage);
            _widget.MouseLeftButtonUp += (_, _) => WidgetClicked?.Invoke();
            _widget.MouseRightButtonUp += (_, e) => { e.Handled = true; WidgetMenuRequested?.Invoke(); };
            _widget.SourceInitialized += (_, _) => _layer.Add(_widget.Handle);
        }
        else
        {
            _widget.MoveTo(widgetRect);
        }
        UpdateWidgetVisibility();
    }

    public void UpdateWidgetVisibility()
    {
        if (_widget is null) return;
        bool show = _settings.ShowRobotOnDesktop && !IsRunning && !_previewing;
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
    public int Start(bool background)
    {
        if (IsRunning) return 0;
        RebuildLayout();

        _view = DesktopView.Open();
        _collector = new Collector(_settings);
        var items = ReadItems(_view, _collector, exact: true);
        int cleanable = items.Count(i => i.State == ItemState.Hidden);
        if (cleanable == 0) return 0;

        Total = cleanable;
        Collected = 0;
        Skipped = 0;
        LastProblem = null;
        Interlocked.Exchange(ref _bytes, 0);
        _collector.Begin();

        IsRunning = true;
        IsBackgroundRun = background;
        ApplySoundSettings();
        UpdateWidgetVisibility();
        _panTimer.Start();

        void Launch()
        {
            ShowOverlays(onTop: !background);
            Stage.Start(items);
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
        if (_view.AutoArrange)
        {
            _refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(600) };
            _refreshTimer.Tick += (_, _) => RefreshPositions(items);
            _refreshTimer.Start();
        }
        return cleanable;
    }

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
        if (IsRunning) Stage.RequestStop();
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

    private bool IsCandidate(RawDesktopIcon raw, Collector collector, out ItemKind kind)
    {
        kind = ItemKind.File;
        if (raw.FileSystemPath is null) return false;                 // Kosz, Ten komputer itp.
        if (collector.IsCollectionFolder(raw.FileSystemPath)) return false;
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
            if (raw.FileSystemPath is null || collector.IsCollectionFolder(raw.FileSystemPath)) continue;
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
            r = exact;
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
        var last = Collector.LoadLast();
        if (last is null) return "Brak sprzątania do cofnięcia.";

        var restored = Collector.Undo(last.Value.Log, last.Value.File, out int failed);
        if (restored.Count > 0) RestorePositionsLater(restored);

        return failed == 0
            ? $"Przywrócono {restored.Count} {Notifications.Plural(restored.Count)} na pulpit."
            : $"Przywrócono {restored.Count}, nie udało się: {failed} (np. plik o tej samej nazwie już jest na pulpicie).";
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
