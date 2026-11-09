using System.Windows;
using System.Windows.Threading;
using DeskVac.Audio;
using DeskVac.Core;
using DeskVac.Native;
using DeskVac.Overlay;
using Microsoft.Win32;

namespace DeskVac;

/// <summary>Łączy odczyt pulpitu, przenoszenie plików i animację robota w jedno „sprzątanie”.</summary>
public sealed class CleaningController : IDisposable
{
    private readonly Window _owner;
    private readonly SoundEngine? _sound;
    private DispatcherTimer? _panTimer;
    private OverlayWindow? _overlay;
    private DesktopView? _view;
    private Collector? _collector;
    private DispatcherTimer? _refreshTimer;
    private bool _minimizedWindows;
    private long _bytes;

    public CleaningController(Window owner)
    {
        _owner = owner;
        try
        {
            _sound = new SoundEngine();
        }
        catch (Exception)
        {
            _sound = null; // bez dźwięku, ale działa
        }
    }

    public void ApplySoundSettings(AppSettings s)
    {
        if (_sound is null) return;
        _sound.Enabled = s.PlaySounds;
        _sound.Volume = (float)s.Volume;
        if (!s.PlaySounds) _sound.MotorStop();
    }

    public void Dispose() => _sound?.Dispose();

    public Stage? Stage => _overlay?.Stage;
    public bool IsRunning { get; private set; }
    public int Total { get; private set; }
    public int Collected { get; private set; }
    public int Skipped { get; private set; }
    public long CollectedBytes => Interlocked.Read(ref _bytes);
    public string? LastProblem { get; private set; }
    public string? CollectionFolder => _collector?.BaseFolder;

    public event Action? Finished;

    public void Start(AppSettings settings)
    {
        if (IsRunning) return;
        ApplySoundSettings(settings);

        _view = DesktopView.Open();
        _collector = new Collector(settings);
        var items = ReadItems(_view, settings, _collector);
        Total = items.Count;
        Collected = 0;
        Skipped = 0;
        LastProblem = null;
        Interlocked.Exchange(ref _bytes, 0);

        if (items.Count == 0)
            throw new InvalidOperationException("Pulpit jest już czysty – nie ma czego zbierać 🎉");

        _collector.Begin();

        _overlay ??= CreateOverlay();
        _overlay.Stage.SetDock(OverlayWindow.DefaultDockTop());
        IsRunning = true;

        void Launch()
        {
            _overlay.Show();
            _overlay.Stage.Start(items);
        }

        if (settings.MinimizeWindows)
        {
            // najpierw chowamy okna, dopiero potem wypuszczamy robota (żeby nakładka nie została zminimalizowana)
            MinimizeAllWindows();
            var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(450) };
            t.Tick += (_, _) => { t.Stop(); Launch(); };
            t.Start();
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
    }

    public void TogglePause()
    {
        if (Stage is not { } s || !IsRunning) return;
        s.Paused = !s.Paused;
        // na pauzie silnik zwalnia do zera, po wznowieniu znów się rozpędza
        if (s.Paused) _sound?.MotorStop();
        else if (s.Phase is RobotPhase.Undocking or RobotPhase.Scanning or RobotPhase.Cleaning or RobotPhase.Returning)
            _sound?.MotorStart();
    }

    public void Stop()
    {
        if (IsRunning) Stage?.RequestStop();
    }

    private OverlayWindow CreateOverlay()
    {
        var o = new OverlayWindow();
        o.Stage.CollectHandler = OnCollect;
        o.Stage.Finished += OnStageFinished;
        o.Stage.PhaseChanged += OnPhaseChanged;
        o.Stage.ItemCollected += it => _sound?.PlaySuck(PanOf(it.Center.X));
        o.Stage.ItemDiscovered += it => _sound?.PlayPing(PanOf(it.Center.X));
        o.Stage.ItemSkipped += it => _sound?.Play("skip", 0.8f, PanOf(it.Center.X));

        // silnik „podąża” za robotem w panoramie stereo
        _panTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
        _panTimer.Tick += (_, _) =>
        {
            if (_sound is not null && Stage is { } st) _sound.MotorPan = PanOf(st.Position.X);
        };
        _panTimer.Start();
        return o;
    }

    private float PanOf(double x)
    {
        double w = _overlay?.ActualWidth > 0 ? _overlay.ActualWidth : SystemParameters.VirtualScreenWidth;
        return (float)Math.Clamp(x / w * 2 - 1, -1, 1);
    }

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
                _sound.Play("scan", 0.9f, PanOf(Stage?.Position.X ?? 0));
                break;
            case RobotPhase.Docking:
                _sound.MotorStop(); // wybieg silnika podczas parkowania
                break;
            case RobotPhase.Emptying:
                _sound.MotorStop();
                _sound.Play("dock", 0.9f, PanOf(Stage?.Position.X ?? 0));
                Delay(350, () => _sound.Play("empty", 1f, PanOf(Stage?.Position.X ?? 0)));
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
        IsRunning = false;

        var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1600) };
        t.Tick += (_, _) =>
        {
            t.Stop();
            if (!IsRunning) _overlay?.Hide();
            if (_minimizedWindows) RestoreAllWindows();
        };
        t.Start();

        Finished?.Invoke();
    }

    // ------------------------------------------------------------------ odczyt pulpitu

    private List<DesktopItem> ReadItems(DesktopView view, AppSettings settings, Collector collector)
    {
        double scale = DpiScale();
        var origin = view.ListOriginOnScreen;
        var spacing = view.Spacing;
        double iconPx = DesktopIconSize() * scale;

        var list = new List<DesktopItem>();
        foreach (var raw in view.ReadIcons(withIcons: true))
        {
            if (raw.FileSystemPath is null) continue;                 // Kosz, Ten komputer itp.
            if (collector.IsCollectionFolder(raw.FileSystemPath)) continue;
            if (settings.IsExcluded(raw.Name, raw.FileSystemPath)) continue;
            var kind = DesktopItem.Classify(raw.FileSystemPath);
            if (!settings.Accepts(kind)) continue;

            list.Add(new DesktopItem
            {
                Path = raw.FileSystemPath,
                Name = raw.Name,
                Kind = kind,
                Icon = raw.Icon,
                ListPosition = raw.Position,
                IconRect = ToIconRect(raw.Position, origin, spacing, iconPx, scale),
            });
        }
        return list;
    }

    private void RefreshPositions(List<DesktopItem> items)
    {
        if (_view is null) return;
        try
        {
            double scale = DpiScale();
            var origin = _view.ListOriginOnScreen;
            var spacing = _view.Spacing;
            double iconPx = DesktopIconSize() * scale;
            var byPath = _view.ReadIcons(withIcons: false)
                .Where(r => r.FileSystemPath is not null)
                .GroupBy(r => r.FileSystemPath!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            foreach (var it in items)
            {
                if (it.State is ItemState.Collected or ItemState.Skipped) continue;
                if (byPath.TryGetValue(it.Path, out var raw))
                {
                    it.ListPosition = raw.Position;
                    it.IconRect = ToIconRect(raw.Position, origin, spacing, iconPx, scale);
                }
            }
        }
        catch (Exception)
        {
            // Explorer chwilowo zajęty – spróbujemy przy następnym tyknięciu
        }
    }

    private static Rect ToIconRect(POINT pos, POINT origin, POINT spacing, double iconPx, double scale)
    {
        double cellW = spacing.X > 0 ? spacing.X : iconPx * 1.6;
        double left = origin.X + pos.X + (cellW - iconPx) / 2;
        double top = origin.Y + pos.Y + 2 * scale;
        var tl = OverlayWindow.PhysicalToLocal(left, top, scale);
        return new Rect(tl.X, tl.Y, iconPx / scale, iconPx / scale);
    }

    private double DpiScale() => System.Windows.Media.VisualTreeHelper.GetDpi(_owner).DpiScaleX;

    /// <summary>Rozmiar ikon pulpitu (Widok → Małe/Średnie/Duże), w pikselach logicznych.</summary>
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
            ? $"Przywrócono {restored.Count} elementów na pulpit."
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

            // nasz panel ma zostać na wierzchu
            var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
            t.Tick += (_, _) =>
            {
                t.Stop();
                _owner.WindowState = WindowState.Normal;
                _owner.Activate();
            };
            t.Start();
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
}
