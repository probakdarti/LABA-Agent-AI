using System.Globalization;
using System.Windows;
using System.Windows.Media;
using DeskVac.Core;

namespace DeskVac.Overlay;

public enum RobotPhase { Docked, Undocking, Scanning, Cleaning, FolderApproach, FolderWork, Returning, Docking, Emptying, Done }

/// <summary>
/// Symulacja robota + rysowanie całej sceny. Współrzędne „świata” to FIZYCZNE piksele ekranu
/// (te same co pozycje ikon pulpitu), więc scena obejmuje wszystkie monitory naraz.
/// Każda nakładka (po jednej na monitor) rysuje swój wycinek – patrz <see cref="SceneView"/>.
/// </summary>
public sealed class Stage
{
    // --- parametry „fizyki” robota ---
    public const double BaseRadius = 30;      // promień robota w DIP (na monitorze 100% = px)
    private const double MaxSpeed = 340;      // DIP/s
    private const double Accel = 900;         // DIP/s²
    private const double TurnRate = 6.5;      // rad/s
    private const double ScanDuration = 2.6;  // s – pełny obrót lidaru
    public const double EmptyDuration = 4.2;  // s – opróżnianie pojemnika w stacji (= długość dźwięku)

    private readonly List<FlyingSprite> _sprites = new();
    private readonly List<Particle> _particles = new();
    private readonly List<(Point P, double T)> _trail = new();
    private readonly List<(Point P, double T)> _skips = new();
    private readonly Random _rng = new();
    private readonly Dictionary<DesktopItem, FormattedText> _labels = new();

    private TimeSpan _lastRender = TimeSpan.Zero;
    private double _realTime;
    private double _phaseTime;
    private double _speed;
    private double _brushAngle;
    private double _turretAngle;
    private double _scanStart;
    private double _emitAcc;
    private Point _undockTarget;

    public IReadOnlyList<DesktopItem> Items { get; private set; } = Array.Empty<DesktopItem>();
    public Point Position { get; private set; }
    public double Heading { get; private set; } = -Math.PI / 2;
    public RobotPhase Phase { get; private set; } = RobotPhase.Docked;
    public bool Paused { get; set; }
    public bool StopRequested { get; private set; }
    public double Battery { get; private set; } = 100;
    public double ScanAngle { get; private set; }
    public DesktopItem? Target { get; private set; }

    /// <summary>Zapełnienie pojemnika robota 0..1 (rośnie z każdym zebranym elementem, zeruje się w stacji).</summary>
    public double BinLevel { get; private set; }

    public Point DockTop { get; private set; }
    public Point DockSpot => new(DockTop.X, DockTop.Y - RAt(DockTop) + 4 * ScaleAt(DockTop));

    /// <summary>Skala DPI monitora w danym punkcie świata (1.0 = 100%, 1.5 = 150%).</summary>
    public Func<Point, double> ScaleAt { get; set; } = _ => 1.0;

    /// <summary>Rozmiar „świata” (wirtualny ekran) w pikselach – do długości wiązki lidaru.</summary>
    public Size WorldSize { get; set; } = new(1920, 1080);

    /// <summary>Promień robota w pikselach w jego bieżącym miejscu (robot ma ten sam rozmiar „optyczny” na każdym monitorze).</summary>
    public double R => RAt(Position);

    private double K => R / BaseRadius;

    private double RAt(Point p) => BaseRadius * ScaleAt(p);

    /// <summary>Obszar roboczy monitora w danym punkcie – chmurka nie wyjdzie poza ekran.</summary>
    public Func<Point, Rect> WorkAreaAt { get; set; } = _ => new Rect(0, 0, 1e6, 1e6);

    private string? _bubbleText;
    private double _bubbleStart = -100, _bubbleDuration;

    /// <summary>Robot „mówi”: chmurka nad nim przez podany czas (s), z radosnym kiwnięciem.</summary>
    public void Say(string text, double seconds)
    {
        _bubbleText = text;
        _bubbleStart = _realTime;
        _bubbleDuration = seconds;
    }

    /// <summary>Obszar, w którym chmurka musi się zmieścić (okno widżetu przy stacji). Null = cały monitor.</summary>
    public Rect? BubbleArea { get; set; }

    public bool IsSpeaking => _bubbleText is not null && _realTime - _bubbleStart < _bubbleDuration;

    /// <summary>Wywoływane po każdej klatce – nakładki odświeżają wtedy obraz.</summary>
    public event Action? Invalidated;

    /// <summary>Wywoływane, gdy robot wjeżdża w element. Ma przenieść plik i zwrócić true przy sukcesie.</summary>
    public Func<DesktopItem, bool>? CollectHandler { get; set; }

    public event Action<RobotPhase>? PhaseChanged;
    public event Action? Finished;
    public event Action<DesktopItem>? ItemDiscovered;
    public event Action<DesktopItem>? ItemCollected;
    public event Action<DesktopItem>? ItemSkipped;

    private bool _attached;

    /// <summary>Animacja chodzi tylko wtedy, gdy jakaś nakładka jest widoczna (oszczędza CPU w tle).</summary>
    public bool Running
    {
        get => _attached;
        set
        {
            if (value == _attached) return;
            _attached = value;
            if (value) CompositionTarget.Rendering += OnRendering;
            else { CompositionTarget.Rendering -= OnRendering; _lastRender = TimeSpan.Zero; }
        }
    }

    public void SetDock(Point dockTop)
    {
        DockTop = dockTop;
        if (Phase is RobotPhase.Docked or RobotPhase.Done)
        {
            Position = DockSpot;
            Heading = -Math.PI / 2;
        }
    }

    /// <summary>
    /// Po skończonej pracy (pulpit posprzątany / folder skończony) robot pyta, czy jest coś jeszcze.
    /// Kontroler może wtedy zacząć kolejny folder (BeginFolderRun) i zwrócić true; inaczej robot wraca do bazy.
    /// </summary>
    public Func<bool>? NextWork { get; set; }

    private bool _skipScan;

    /// <summary>Wyjazd bez skanowania pulpitu – od razu do folderów (NextWork).</summary>
    public void StartFoldersOnly()
    {
        Start(Array.Empty<DesktopItem>());
        _skipScan = true;
    }

    private void FinishWork()
    {
        if (StopRequested || !(NextWork?.Invoke() ?? false)) SetPhase(RobotPhase.Returning);
    }

    // ------------------------------------------------------------------ sprzątanie folderu (animacja symboliczna)

    private readonly Queue<DesktopItem> _folderQueue = new();
    private Point _portal;
    private string _portalTitle = "";
    private int _portalDone, _portalTotal = -1;
    private bool _folderInputDone;
    private double _emitTimer;

    public string PortalTitle => _portalTitle;

    /// <summary>Robot jedzie do ikony folderu przy stacji; pliki będą z niej „wyskakiwać”.</summary>
    public void BeginFolderRun(string title)
    {
        _portalTitle = title;
        _portalDone = 0;
        _portalTotal = -1;
        _folderInputDone = false;
        _folderQueue.Clear();
        double k = ScaleAt(DockTop);
        var wa = WorkAreaAt(DockTop);
        _portal = new Point(Math.Max(wa.Left + 80 * k, DockTop.X - 300 * k), DockTop.Y - 110 * k);
        SetPhase(RobotPhase.FolderApproach);
    }

    /// <summary>Ile plików obejmie folder (znane po przygotowaniu planu).</summary>
    public void SetFolderTotal(int total) => _portalTotal = total;

    /// <summary>Kolejny przeniesiony plik – do animacji (przy setkach plików animujemy część, licznik pokazuje wszystko).</summary>
    public void EmitFolderItem(DesktopItem item)
    {
        _portalDone++;
        if (_folderQueue.Count < 40) _folderQueue.Enqueue(item);
    }

    public void EndFolderInput() => _folderInputDone = true;

    /// <summary>Czy animacja przyjmie kolejny plik (żeby nie liczyć ikon dla plików, których i tak nie pokażemy).</summary>
    public bool FolderQueueHasRoom => _folderQueue.Count < 40;

    private void UpdateFolderWork(double dt)
    {
        if (dt <= 0) return;
        double k = ScaleAt(_portal);
        // robot stoi przodem do folderu
        var toPortal = _portal - Position;
        Heading += Math.Clamp(NormalizeAngle(Math.Atan2(toPortal.Y, toPortal.X) - Heading), -TurnRate * dt, TurnRate * dt);

        _emitTimer -= dt;
        if (_folderQueue.Count > 0 && _emitTimer <= 0)
        {
            var it = _folderQueue.Dequeue();
            double size = 40 * k;
            var c = _portal + new Vector((_rng.NextDouble() - 0.5) * 30 * k, -20 * k + (_rng.NextDouble() - 0.5) * 16 * k);
            it.IconRect = new Rect(c.X - size / 2, c.Y - size / 2, size, size);
            it.State = ItemState.Collected;
            _sprites.Add(new FlyingSprite(it, it.IconRect, _realTime, 0.5 + _rng.NextDouble() * 0.15, _rng.NextDouble() < 0.5 ? -1 : 1));
            BinLevel = Math.Min(1, BinLevel + 0.02);
            ItemCollected?.Invoke(it);
            _emitTimer = _folderQueue.Count > 12 ? 0.07 : 0.15;
        }

        if (_folderInputDone && _folderQueue.Count == 0 && _sprites.Count == 0 && _phaseTime > 0.8)
            FinishWork();
    }

    private void DrawPortal(DrawingContext dc)
    {
        if (Phase is not (RobotPhase.FolderApproach or RobotPhase.FolderWork)) return;
        double k = ScaleAt(_portal);
        double appear = Math.Min(1, _phaseTime / 0.4);
        if (Phase == RobotPhase.FolderWork) appear = 1;
        double w = 86 * k * (0.7 + 0.3 * appear), h = 64 * k * (0.7 + 0.3 * appear);
        var body = new Rect(_portal.X - w / 2, _portal.Y - h / 2, w, h);

        dc.PushOpacity(appear);
        // poświata
        var glow = new RadialGradientBrush(Color.FromArgb(90, 0xFF, 0xC8, 0x4A), Color.FromArgb(0, 0xFF, 0xC8, 0x4A));
        dc.DrawEllipse(glow, null, _portal, w * 0.95, h * 1.1);
        // folder: zakładka + korpus + przód
        var back = new SolidColorBrush(Color.FromRgb(0xE0, 0xA1, 0x2E));
        var front = new LinearGradientBrush(Color.FromRgb(0xFF, 0xD5, 0x6A), Color.FromRgb(0xF2, 0xB1, 0x3A), 90);
        dc.DrawRoundedRectangle(back, null, new Rect(body.Left, body.Top - 8 * k, w * 0.42, 14 * k), 4 * k, 4 * k);
        dc.DrawRoundedRectangle(back, null, body, 7 * k, 7 * k);
        // „kartki” wystające z folderu, gdy pracuje
        if (Phase == RobotPhase.FolderWork)
        {
            double wob = Math.Sin(_realTime * 9) * 2 * k;
            dc.DrawRoundedRectangle(Brushes.WhiteSmoke, null, new Rect(body.Left + w * 0.18, body.Top - 6 * k + wob, w * 0.6, h * 0.5), 3 * k, 3 * k);
        }
        dc.DrawRoundedRectangle(front, null, new Rect(body.Left, body.Top + h * 0.22, w, h * 0.78), 7 * k, 7 * k);

        // podpis: nazwa folderu i licznik
        string counter = _portalTotal < 0 ? "liczę pliki…" : $"{_portalDone} / {_portalTotal}";
        var title = new FormattedText(_portalTitle, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight,
            new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.SemiBold, FontStretches.Normal), 13 * k, Brushes.White, k);
        var sub = new FormattedText(counter, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight,
            new Typeface("Segoe UI"), 11 * k, new SolidColorBrush(Color.FromRgb(0xDD, 0xE3, 0xE8)), k);
        double ty = body.Bottom + 6 * k;
        var shadow = new SolidColorBrush(Color.FromArgb(170, 0, 0, 0));
        dc.DrawGeometry(shadow, null, title.BuildGeometry(new Point(_portal.X - title.Width / 2 + 1, ty + 1)));
        dc.DrawText(title, new Point(_portal.X - title.Width / 2, ty));
        dc.DrawGeometry(shadow, null, sub.BuildGeometry(new Point(_portal.X - sub.Width / 2 + 1, ty + title.Height + 1)));
        dc.DrawText(sub, new Point(_portal.X - sub.Width / 2, ty + title.Height));
        dc.Pop();
    }

    public void Start(IReadOnlyList<DesktopItem> items)
    {
        _skipScan = false;
        _folderQueue.Clear();
        Items = items;
        _labels.Clear();
        _sprites.Clear();
        _particles.Clear();
        _trail.Clear();
        _skips.Clear();
        StopRequested = false;
        Paused = false;
        BinLevel = 0;
        _emitAcc = 0;
        Position = DockSpot;
        Heading = -Math.PI / 2;
        _speed = 0;
        _undockTarget = new Point(DockSpot.X, DockSpot.Y - R * 4.2);
        SetPhase(RobotPhase.Undocking);
    }

    /// <summary>Przerywa sprzątanie – robot wraca do stacji.</summary>
    public void RequestStop()
    {
        StopRequested = true;
        Paused = false;
        if (Phase is RobotPhase.Undocking or RobotPhase.Scanning or RobotPhase.Cleaning or RobotPhase.FolderApproach or RobotPhase.FolderWork)
        {
            _folderQueue.Clear();
            SetPhase(RobotPhase.Returning);
        }
    }

    private void SetPhase(RobotPhase p)
    {
        Phase = p;
        _phaseTime = 0;
        PhaseChanged?.Invoke(p);
    }

    private void OnRendering(object? sender, EventArgs e)
    {
        var now = ((RenderingEventArgs)e).RenderingTime;
        if (now == _lastRender) return; // to samo „tyknięcie” zgłoszone dwa razy
        double dt = _lastRender == TimeSpan.Zero ? 0 : (now - _lastRender).TotalSeconds;
        _lastRender = now;
        dt = Math.Min(dt, 0.05);

        _realTime += dt;
        Update(Paused ? 0 : dt);
        Invalidated?.Invoke();
    }

    /// <summary>Ręczne „tyknięcie” (gdy robot stoi przy stacji – wolniejszy zegar zamiast 60 kl./s).</summary>
    public void Tick(double dt)
    {
        _realTime += dt;
        Update(Paused ? 0 : dt);
        Invalidated?.Invoke();
    }

    /// <summary>Podgląd namierzania: pokazuje ramki wokół podanych elementów (bez jazdy robota).</summary>
    public void ShowPreview(IReadOnlyList<DesktopItem> items)
    {
        foreach (var it in items)
        {
            if (it.State == ItemState.Hidden) it.State = ItemState.Discovered;
            it.DiscoveredAt = _realTime;
        }
        Items = items;
        Target = null;
    }

    // ------------------------------------------------------------------ symulacja

    private void Update(double dt)
    {
        _phaseTime += dt;
        bool active = Phase is not (RobotPhase.Docked or RobotPhase.Done or RobotPhase.Emptying);

        Battery = active
            ? Math.Max(5, Battery - dt * 0.35)
            : Math.Min(100, Battery + dt * 2.5);

        if (active)
        {
            _brushAngle += dt * 22;
            _turretAngle += dt * 9;
        }

        switch (Phase)
        {
            case RobotPhase.Undocking:
                DriveTowards(_undockTarget, dt, MaxSpeed * 0.45, allowReverse: false);
                if (Distance(Position, _undockTarget) < 4 * K)
                {
                    _scanStart = Heading;
                    if (_skipScan) FinishWork();
                    else SetPhase(RobotPhase.Scanning);
                }
                break;

            case RobotPhase.Scanning:
                UpdateScan();
                if (_phaseTime >= ScanDuration)
                {
                    foreach (var it in Items.Where(i => i.State == ItemState.Hidden))
                        Discover(it);
                    foreach (var it in Items.Where(i => i.State == ItemState.Protected && i.DiscoveredAt < 0))
                        it.DiscoveredAt = _realTime;
                    SetPhase(RobotPhase.Cleaning);
                }
                break;

            case RobotPhase.Cleaning:
                UpdateCleaning(dt);
                break;

            case RobotPhase.FolderApproach:
            {
                var spot = _portal + new Vector(R * 3.2, 0);
                DriveTowards(spot, dt, MaxSpeed, allowReverse: false);
                if (Distance(Position, spot) < 5 * K) SetPhase(RobotPhase.FolderWork);
                break;
            }

            case RobotPhase.FolderWork:
                UpdateFolderWork(dt);
                break;

            case RobotPhase.Returning:
            {
                var approach = new Point(DockSpot.X, DockSpot.Y - R * 1.8);
                DriveTowards(approach, dt, MaxSpeed, allowReverse: false);
                if (Distance(Position, approach) < 5 * K) SetPhase(RobotPhase.Docking);
                break;
            }

            case RobotPhase.Docking:
            {
                // obrót przodem do góry, potem cofanie na stację
                double diff = NormalizeAngle(-Math.PI / 2 - Heading);
                if (Math.Abs(diff) > 0.03)
                {
                    Heading += Math.Clamp(diff, -TurnRate * dt, TurnRate * dt);
                }
                else
                {
                    Heading = -Math.PI / 2;
                    var d = DockSpot - Position;
                    double step = Math.Min(d.Length, 70 * K * dt);
                    if (d.Length > 0.5) Position += d / d.Length * step;
                    else
                    {
                        Position = DockSpot;
                        _speed = 0;
                        if (BinLevel > 0.001) SetPhase(RobotPhase.Emptying);
                        else Finish();
                    }
                }
                break;
            }

            case RobotPhase.Emptying:
                UpdateEmptying(dt);
                if (_phaseTime >= EmptyDuration)
                {
                    BinLevel = 0;
                    Finish();
                }
                break;
        }

        if (active && _speed > 5 * K && dt > 0)
        {
            _trail.Add((Position, _realTime));
        }
        _trail.RemoveAll(t => _realTime - t.T > 1.6);
        _skips.RemoveAll(s => _realTime - s.T > 1.2);

        UpdateEffects(dt);
    }

    private void Finish()
    {
        SetPhase(RobotPhase.Done);
        Finished?.Invoke();
    }

    /// <summary>Stacja wysysa zawartość pojemnika: strumień „kurzu” z robota do stacji.</summary>
    private void UpdateEmptying(double dt)
    {
        if (dt <= 0) return;
        double t = _phaseTime / EmptyDuration;
        // pojemnik opróżnia się głównie w pierwszej połowie (tak jak w dźwięku)
        BinLevel = Math.Max(0, BinLevel - dt * Math.Max(0.05, 1.6 * (1 - t)) * 0.9);
        double rate = t < 0.75 ? 70 * Math.Sin(Math.Min(1, t / 0.15) * Math.PI / 2) : 70 * (1 - (t - 0.75) / 0.25);
        _emitAcc += rate * dt;
        var target = new Point(DockTop.X, DockTop.Y + R * 0.55);
        while (_emitAcc >= 1)
        {
            _emitAcc -= 1;
            double a = _rng.NextDouble() * Math.PI * 2;
            _particles.Add(new Particle
            {
                P = Position + new Vector(Math.Cos(a), Math.Sin(a)) * R * (0.2 + 0.5 * _rng.NextDouble()),
                V = new Vector(_rng.NextDouble() * 60 - 30, 40 + _rng.NextDouble() * 60),
                Life = 0.45 + _rng.NextDouble() * 0.3,
                Size = 1 + _rng.NextDouble() * 1.8,
                Teal = _rng.NextDouble() < 0.5,
                Target = target,
            });
        }
    }

    private void UpdateScan()
    {
        double progress = Math.Clamp(_phaseTime / ScanDuration, 0, 1);
        ScanAngle = _scanStart + progress * Math.PI * 2;
        _turretAngle = ScanAngle;
        foreach (var it in Items)
        {
            bool prot = it.State == ItemState.Protected;
            if (it.State != ItemState.Hidden && !(prot && it.DiscoveredAt < 0)) continue;
            var v = it.Center - Position;
            double a = NormalizeAngle(Math.Atan2(v.Y, v.X) - _scanStart);
            if (a < 0) a += Math.PI * 2;
            if (a > progress * Math.PI * 2) continue;
            if (prot) it.DiscoveredAt = _realTime;
            else Discover(it);
        }
    }

    private void Discover(DesktopItem it)
    {
        it.State = ItemState.Discovered;
        it.DiscoveredAt = _realTime;
        ItemDiscovered?.Invoke(it);
    }

    private void UpdateCleaning(double dt)
    {
        if (dt <= 0) return;

        // zbieraj wszystko, przez co robot przejeżdża
        foreach (var it in Items)
        {
            if (it.State != ItemState.Discovered) continue;
            if (Distance(Position, it.Center) < R * 0.95) Collect(it);
        }

        if (Target is null || Target.State != ItemState.Discovered)
        {
            Target = Items.Where(i => i.State == ItemState.Discovered)
                          .OrderBy(i => Distance(Position, i.Center))
                          .FirstOrDefault();
        }

        if (Target is null)
        {
            FinishWork();
            return;
        }

        DriveTowards(Target.Center, dt, MaxSpeed, allowReverse: false, stopAtTarget: false);
    }

    private void Collect(DesktopItem it)
    {
        bool ok = CollectHandler?.Invoke(it) ?? false;
        if (!ok)
        {
            it.State = ItemState.Skipped;
            _skips.Add((it.Center, _realTime));
            ItemSkipped?.Invoke(it);
            return;
        }

        it.State = ItemState.Collected;
        BinLevel = Math.Min(1, BinLevel + 0.06);
        ItemCollected?.Invoke(it);
        var dir = _rng.NextDouble() < 0.5 ? -1 : 1;
        _sprites.Add(new FlyingSprite(it, it.IconRect, _realTime, 0.55 + _rng.NextDouble() * 0.15, dir));
        for (int i = 0; i < 14; i++)
        {
            double a = _rng.NextDouble() * Math.PI * 2;
            double s = 40 + _rng.NextDouble() * 120;
            _particles.Add(new Particle
            {
                P = it.Center + new Vector(_rng.NextDouble() * 20 - 10, _rng.NextDouble() * 20 - 10),
                V = new Vector(Math.Cos(a) * s, Math.Sin(a) * s),
                Life = 0.5 + _rng.NextDouble() * 0.4,
                Size = 1.2 + _rng.NextDouble() * 2,
                Teal = _rng.NextDouble() < 0.35,
            });
        }
    }

    private void UpdateEffects(double dt)
    {
        foreach (var p in _particles)
        {
            var target = p.Target ?? Position;
            var toTarget = target - p.P;
            p.V += toTarget * (p.Target is null ? 6 : 14) * dt;   // zasysanie
            p.V *= Math.Pow(0.08, dt);                           // tłumienie
            p.P += p.V * dt;
            p.Age += dt;
            if (toTarget.Length < (p.Target is null ? R * 0.4 : 6)) p.Age = p.Life;
        }
        _particles.RemoveAll(p => p.Age >= p.Life);
        _sprites.RemoveAll(s => _realTime - s.Start > s.Duration);
    }

    private void DriveTowards(Point target, double dt, double maxSpeed, bool allowReverse, bool stopAtTarget = true)
    {
        if (dt <= 0) return;
        maxSpeed *= K;
        double accel = Accel * K;
        var d = target - Position;
        double dist = d.Length;
        double desired = Math.Atan2(d.Y, d.X);
        double diff = NormalizeAngle(desired - Heading);
        Heading += Math.Clamp(diff, -TurnRate * dt, TurnRate * dt);

        // jak prawdziwy robot: przy dużym kącie obraca się w miejscu
        double factor = Math.Abs(diff) > 1.0 ? 0 : Math.Cos(diff);
        double wanted = maxSpeed * factor;
        if (stopAtTarget) wanted = Math.Min(wanted, dist * 3.2);
        _speed += Math.Clamp(wanted - _speed, -accel * 1.6 * dt, accel * dt);
        _speed = Math.Max(0, _speed);

        double step = _speed * dt;
        if (stopAtTarget && step > dist) step = dist;
        Position += new Vector(Math.Cos(Heading), Math.Sin(Heading)) * step;
    }

    // ------------------------------------------------------------------ rysowanie

    /// <summary>Rysuje całą scenę we współrzędnych świata (piksele). Nakładka ustawia transformację na swój monitor.</summary>
    public void Draw(DrawingContext dc)
    {
        DrawTrail(dc);
        DrawDiscoveryMarks(dc);
        if (Phase == RobotPhase.Scanning) DrawLidar(dc);

        double pulse = 0.5 + 0.5 * Math.Sin(_realTime * 4);
        bool charging = Phase is RobotPhase.Done or RobotPhase.Docked;
        bool emptying = Phase == RobotPhase.Emptying;
        if (emptying) DrawDockGlow(dc);
        RobotPainter.DrawDock(dc, DockTop, R, charging || emptying, emptying ? 0.5 + 0.5 * Math.Sin(_realTime * 14) : pulse);

        if (Target is not null && Phase == RobotPhase.Cleaning && Target.State == ItemState.Discovered)
            DrawTargetLock(dc, Target);

        DrawParticles(dc);
        DrawPortal(dc);
        DrawSprites(dc);

        var led = Paused ? RobotPainter.Amber : charging ? RobotPainter.Charge : RobotPainter.Accent;
        double ledPulse = Paused || charging ? pulse : emptying ? 0.5 + 0.5 * Math.Sin(_realTime * 14) : 0.85 + 0.15 * pulse;
        double drawHeading = Heading;
        if (IsSpeaking)
        {
            // radosne „kiwnięcie” przez pierwszą sekundę wypowiedzi
            double t = _realTime - _bubbleStart;
            drawHeading += 0.16 * Math.Sin(t * 16) * Math.Max(0, 1 - t);
            led = RobotPainter.Charge;
            ledPulse = 0.5 + 0.5 * Math.Sin(_realTime * 10);
        }
        RobotPainter.DrawRobot(dc, Position, drawHeading, R, _brushAngle, _turretAngle, led, ledPulse);
        DrawBubble(dc);

        DrawSkips(dc);
    }

    private void DrawDockGlow(DrawingContext dc)
    {
        double t = _phaseTime / EmptyDuration;
        double k = Math.Sin(Math.Clamp(t, 0, 1) * Math.PI);
        var c = RobotPainter.Accent;
        var center = new Point(DockTop.X, DockTop.Y + R * 0.5);
        var glow = new RadialGradientBrush(Color.FromArgb((byte)(120 * k), c.R, c.G, c.B), Color.FromArgb(0, c.R, c.G, c.B));
        dc.DrawEllipse(glow, null, center, R * 2.2, R * 1.4);

        // pierścienie „ciągu powietrza” w stacji
        for (int i = 0; i < 3; i++)
        {
            double ph = (_realTime * 2.2 + i / 3.0) % 1;
            double r = R * (1.1 - 0.8 * ph);
            var pen = new Pen(new SolidColorBrush(Color.FromArgb((byte)(110 * k * ph), c.R, c.G, c.B)), 1.5);
            dc.DrawEllipse(null, pen, Position, r, r);
        }
    }

    private void DrawBubble(DrawingContext dc)
    {
        if (!IsSpeaking || _bubbleText is null) return;
        double t = _realTime - _bubbleStart;
        double alpha = Math.Min(1, t / 0.2) * Math.Min(1, (_bubbleDuration - t) / 0.4);
        double pop = t < 0.25 ? 0.85 + 0.15 * Math.Sin(t / 0.25 * Math.PI / 2) * 1.05 : 1;
        double k = ScaleAt(Position);

        var text = new FormattedText(_bubbleText, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight,
            new Typeface(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.SemiBold, FontStretches.Normal),
            14 * k, new SolidColorBrush(Color.FromRgb(0x14, 0x18, 0x1D)), k)
        { LineHeight = 19 * k };

        double pad = 14 * k, tail = 10 * k;
        double w = text.Width + pad * 2, h = text.Height + pad * 2;
        var wa = WorkAreaAt(Position);
        if (BubbleArea is { } area)
        {
            area.Intersect(wa);
            if (!area.IsEmpty) wa = area;
        }
        double x = Math.Clamp(Position.X - w / 2, wa.Left + 6 * k, wa.Right - w - 6 * k);
        double y = Math.Max(wa.Top + 6 * k, Position.Y - R - tail - h - 6 * k);
        var box = new Rect(x, y, w, h);
        text.MaxTextWidth = text.Width + 1;      // wyśrodkowanie linii w obrębie najdłuższej
        text.TextAlignment = TextAlignment.Center;
        double tailX = Math.Clamp(Position.X, box.Left + 16 * k, box.Right - 16 * k);

        var geo = new StreamGeometry();
        using (var g = geo.Open())
        {
            double r = 12 * k;
            g.BeginFigure(new Point(box.Left + r, box.Top), true, true);
            g.LineTo(new Point(box.Right - r, box.Top), true, true);
            g.ArcTo(new Point(box.Right, box.Top + r), new Size(r, r), 0, false, SweepDirection.Clockwise, true, true);
            g.LineTo(new Point(box.Right, box.Bottom - r), true, true);
            g.ArcTo(new Point(box.Right - r, box.Bottom), new Size(r, r), 0, false, SweepDirection.Clockwise, true, true);
            g.LineTo(new Point(tailX + tail, box.Bottom), true, true);
            g.LineTo(new Point(Position.X, box.Bottom + tail), true, true);   // ogonek do robota
            g.LineTo(new Point(tailX - tail, box.Bottom), true, true);
            g.LineTo(new Point(box.Left + r, box.Bottom), true, true);
            g.ArcTo(new Point(box.Left, box.Bottom - r), new Size(r, r), 0, false, SweepDirection.Clockwise, true, true);
            g.LineTo(new Point(box.Left, box.Top + r), true, true);
            g.ArcTo(new Point(box.Left + r, box.Top), new Size(r, r), 0, false, SweepDirection.Clockwise, true, true);
        }

        var anchor = new Point(Position.X, box.Bottom + tail);
        dc.PushOpacity(alpha);
        dc.PushTransform(new ScaleTransform(pop, pop, anchor.X, anchor.Y));
        dc.PushTransform(new TranslateTransform(2 * k, 4 * k));
        dc.DrawGeometry(new SolidColorBrush(Color.FromArgb(70, 0, 0, 0)), null, geo); // cień
        dc.Pop();
        var c = RobotPainter.Accent;
        dc.DrawGeometry(new SolidColorBrush(Color.FromRgb(0xF7, 0xF9, 0xFA)), new Pen(new SolidColorBrush(Color.FromRgb(c.R, c.G, c.B)), 2 * k), geo);
        dc.DrawText(text, new Point(box.Left + pad, box.Top + pad));
        dc.Pop();
        dc.Pop();
    }

    private void DrawTrail(DrawingContext dc)
    {
        for (int i = 1; i < _trail.Count; i++)
        {
            double age = _realTime - _trail[i].T;
            byte a = (byte)Math.Clamp(38 * (1 - age / 1.6), 0, 38);
            if (a == 0) continue;
            var pen = new Pen(new SolidColorBrush(Color.FromArgb(a, 255, 255, 255)), R * 1.7)
            { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            dc.DrawLine(pen, _trail[i - 1].P, _trail[i].P);
        }
    }

    private void DrawLidar(DrawingContext dc)
    {
        double len = Math.Sqrt(WorldSize.Width * WorldSize.Width + WorldSize.Height * WorldSize.Height);
        var c = RobotPainter.Accent;

        // wiązka: trójkątny klin + „smuga” za nią
        for (int k = 0; k < 6; k++)
        {
            double a0 = ScanAngle - 0.06 - k * 0.07;
            double a1 = ScanAngle + 0.06 - k * 0.07;
            byte alpha = (byte)(k == 0 ? 120 : 60 / k);
            var geo = new StreamGeometry();
            using (var g = geo.Open())
            {
                g.BeginFigure(Position, true, true);
                g.LineTo(Position + new Vector(Math.Cos(a0), Math.Sin(a0)) * len, false, false);
                g.LineTo(Position + new Vector(Math.Cos(a1), Math.Sin(a1)) * len, false, false);
            }
            var brush = new RadialGradientBrush(
                new GradientStopCollection
                {
                    new(Color.FromArgb(alpha, c.R, c.G, c.B), 0),
                    new(Color.FromArgb((byte)(alpha / 3), c.R, c.G, c.B), 0.5),
                    new(Color.FromArgb(0, c.R, c.G, c.B), 1),
                })
            {
                MappingMode = BrushMappingMode.Absolute,
                Center = Position,
                GradientOrigin = Position,
                RadiusX = len,
                RadiusY = len,
            };
            dc.DrawGeometry(brush, null, geo);
        }

        // pierścienie zasięgu
        double ring = (_phaseTime * 420 * K) % (600 * K);
        var rp = new Pen(new SolidColorBrush(Color.FromArgb((byte)(80 * (1 - ring / (600 * K))), c.R, c.G, c.B)), 1.5 * K);
        dc.DrawEllipse(null, rp, Position, ring, ring);
    }

    private void DrawDiscoveryMarks(DrawingContext dc)
    {
        var c = RobotPainter.Accent;
        foreach (var it in Items)
        {
            bool prot = it.State == ItemState.Protected;
            if (it.State != ItemState.Discovered && !(prot && it.DiscoveredAt >= 0)) continue;
            double k = ScaleAt(it.Center);
            double age = _realTime - it.DiscoveredAt;
            var col = prot ? RobotPainter.Amber : c;

            if (age < 0.9)
            {
                double r = (8 + age * 55) * k;
                byte a = (byte)(200 * (1 - age / 0.9));
                dc.DrawEllipse(null, new Pen(new SolidColorBrush(Color.FromArgb(a, col.R, col.G, col.B)), 2 * k), it.Center, r, r);
            }

            if (prot)
            {
                RobotPainter.DrawShield(dc, new Point(it.IconRect.Right - 2 * k, it.IconRect.Top + 2 * k), 9 * k);
                continue;
            }

            // narożniki „zaznaczenia” lidaru
            var rc = it.IconRect;
            rc.Inflate(4 * k, 4 * k);
            double s = Math.Min(10 * k, rc.Width / 4);
            var pen = new Pen(new SolidColorBrush(Color.FromArgb(150, c.R, c.G, c.B)), 1.6 * k);
            DrawCorners(dc, pen, rc, s);
        }
    }

    private static void DrawCorners(DrawingContext dc, Pen pen, Rect r, double s)
    {
        dc.DrawLine(pen, r.TopLeft, new Point(r.Left + s, r.Top));
        dc.DrawLine(pen, r.TopLeft, new Point(r.Left, r.Top + s));
        dc.DrawLine(pen, r.TopRight, new Point(r.Right - s, r.Top));
        dc.DrawLine(pen, r.TopRight, new Point(r.Right, r.Top + s));
        dc.DrawLine(pen, r.BottomLeft, new Point(r.Left + s, r.Bottom));
        dc.DrawLine(pen, r.BottomLeft, new Point(r.Left, r.Bottom - s));
        dc.DrawLine(pen, r.BottomRight, new Point(r.Right - s, r.Bottom));
        dc.DrawLine(pen, r.BottomRight, new Point(r.Right, r.Bottom - s));
    }

    private void DrawTargetLock(DrawingContext dc, DesktopItem t)
    {
        var c = RobotPainter.Accent;
        double r = Math.Max(t.IconRect.Width, t.IconRect.Height) * 0.8 + 3 * Math.Sin(_realTime * 6);
        var pen = new Pen(new SolidColorBrush(Color.FromArgb(170, c.R, c.G, c.B)), 1.5) { DashStyle = new DashStyle(new double[] { 3, 3 }, _realTime * 4) };
        dc.DrawEllipse(null, pen, t.Center, r, r);
    }

    private void DrawSprites(DrawingContext dc)
    {
        foreach (var s in _sprites)
        {
            double t = Math.Clamp((_realTime - s.Start) / s.Duration, 0, 1);
            double e = t * t * (3 - 2 * t) * (0.4 + 0.6 * t); // przyspieszające zasysanie
            var p0 = new Point(s.From.X + s.From.Width / 2, s.From.Y + s.From.Height / 2);
            var p2 = Position;
            var mid = p0 + (p2 - p0) / 2;
            var perp = new Vector(-(p2 - p0).Y, (p2 - p0).X);
            if (perp.Length > 0) perp /= perp.Length;
            var p1 = mid + perp * 50 * s.Spin + new Vector(0, -30);
            var pos = Bezier(p0, p1, p2, e);

            double scale = 1 - 0.88 * e;
            double rot = s.Spin * 300 * e;
            double opacity = 1 - 0.7 * e * e;

            // smugi ssania
            var c = RobotPainter.Accent;
            var streak = new Pen(new SolidColorBrush(Color.FromArgb((byte)(70 * (1 - t)), c.R, c.G, c.B)), 1.2);
            dc.DrawLine(streak, pos, Position);

            dc.PushOpacity(opacity);
            dc.PushTransform(new TranslateTransform(pos.X, pos.Y));
            dc.PushTransform(new RotateTransform(rot));
            dc.PushTransform(new ScaleTransform(scale, scale));

            var w = s.From.Width;
            var h = s.From.Height;
            if (s.Item.Icon is not null)
                dc.DrawImage(s.Item.Icon, new Rect(-w / 2, -h / 2, w, h));
            else
                dc.DrawRoundedRectangle(new SolidColorBrush(Color.FromArgb(200, 240, 240, 240)), null, new Rect(-w / 2, -h / 2, w, h), 6, 6);

            if (t < 0.35)
            {
                var label = GetLabel(s.Item);
                dc.PushOpacity(1 - t / 0.35);
                var origin = new Point(-label.Width / 2, h / 2 + 3);
                var shadow = label.BuildGeometry(new Point(origin.X + 1, origin.Y + 1));
                dc.DrawGeometry(new SolidColorBrush(Color.FromArgb(160, 0, 0, 0)), null, shadow);
                dc.DrawText(label, origin);
                dc.Pop();
            }

            dc.Pop();
            dc.Pop();
            dc.Pop();
            dc.Pop();
        }
    }

    private void DrawParticles(DrawingContext dc)
    {
        foreach (var p in _particles)
        {
            double k = 1 - p.Age / p.Life;
            var col = p.Teal ? RobotPainter.Accent : Color.FromRgb(230, 230, 235);
            dc.DrawEllipse(new SolidColorBrush(Color.FromArgb((byte)(220 * k), col.R, col.G, col.B)), null, p.P, p.Size * k + 0.4, p.Size * k + 0.4);
        }
    }

    private void DrawSkips(DrawingContext dc)
    {
        foreach (var (p, t) in _skips)
        {
            double age = _realTime - t;
            byte a = (byte)(230 * (1 - age / 1.2));
            var pen = new Pen(new SolidColorBrush(Color.FromArgb(a, 255, 90, 90)), 3) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            double s = 10;
            dc.DrawLine(pen, new Point(p.X - s, p.Y - s), new Point(p.X + s, p.Y + s));
            dc.DrawLine(pen, new Point(p.X - s, p.Y + s), new Point(p.X + s, p.Y - s));
        }
    }

    private FormattedText GetLabel(DesktopItem item)
    {
        if (_labels.TryGetValue(item, out var f)) return f;
        var name = item.Name.Length > 22 ? item.Name[..20] + "…" : item.Name;
        if (!string.IsNullOrEmpty(item.Category)) name += "\n→ " + item.Category.Replace("\\", " / ");
        double scale = ScaleAt(item.Center);
        f = new FormattedText(name, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight,
            new Typeface("Segoe UI"), 12 * scale, Brushes.White, scale);
        _labels[item] = f;
        return f;
    }

    // ------------------------------------------------------------------ pomocnicze

    private static Point Bezier(Point a, Point b, Point c, double t)
    {
        double u = 1 - t;
        return new Point(u * u * a.X + 2 * u * t * b.X + t * t * c.X, u * u * a.Y + 2 * u * t * b.Y + t * t * c.Y);
    }

    private static double Distance(Point a, Point b) => (a - b).Length;

    private static double NormalizeAngle(double a)
    {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    private sealed record FlyingSprite(DesktopItem Item, Rect From, double Start, double Duration, int Spin);

    private sealed class Particle
    {
        public Point P;
        public Vector V;
        public double Age;
        public double Life;
        public double Size;
        public bool Teal;
        public Point? Target;
    }
}
