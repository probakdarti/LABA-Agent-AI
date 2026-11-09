using System.Globalization;
using System.Windows;
using System.Windows.Media;
using DeskVac.Core;

namespace DeskVac.Overlay;

public enum RobotPhase { Docked, Undocking, Scanning, Cleaning, Returning, Docking, Done }

/// <summary>
/// Symulacja robota + rysowanie całej sceny na przezroczystej nakładce.
/// Współrzędne w DIP względem lewego górnego rogu nakładki (= wirtualnego ekranu).
/// </summary>
public sealed class Stage : FrameworkElement
{
    // --- parametry „fizyki” robota ---
    public const double Radius = 30;
    private const double MaxSpeed = 340;      // DIP/s
    private const double Accel = 900;         // DIP/s²
    private const double TurnRate = 6.5;      // rad/s
    private const double ScanDuration = 2.6;  // s – pełny obrót lidaru

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

    public Point DockTop { get; private set; }
    public Point DockSpot => new(DockTop.X, DockTop.Y - Radius + 4);

    /// <summary>Wywoływane, gdy robot wjeżdża w element. Ma przenieść plik i zwrócić true przy sukcesie.</summary>
    public Func<DesktopItem, bool>? CollectHandler { get; set; }

    public event Action<RobotPhase>? PhaseChanged;
    public event Action? Finished;

    public Stage()
    {
        IsHitTestVisible = false;
        Loaded += (_, _) => CompositionTarget.Rendering += OnRendering;
        Unloaded += (_, _) => CompositionTarget.Rendering -= OnRendering;
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

    public void Start(IReadOnlyList<DesktopItem> items)
    {
        Items = items;
        _labels.Clear();
        _sprites.Clear();
        _particles.Clear();
        _trail.Clear();
        _skips.Clear();
        StopRequested = false;
        Paused = false;
        Position = DockSpot;
        Heading = -Math.PI / 2;
        _speed = 0;
        _undockTarget = new Point(DockSpot.X, DockSpot.Y - Radius * 4.2);
        SetPhase(RobotPhase.Undocking);
    }

    /// <summary>Przerywa sprzątanie – robot wraca do stacji.</summary>
    public void RequestStop()
    {
        StopRequested = true;
        Paused = false;
        if (Phase is RobotPhase.Undocking or RobotPhase.Scanning or RobotPhase.Cleaning)
            SetPhase(RobotPhase.Returning);
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
        InvalidateVisual();
    }

    // ------------------------------------------------------------------ symulacja

    private void Update(double dt)
    {
        _phaseTime += dt;
        bool active = Phase is not (RobotPhase.Docked or RobotPhase.Done);

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
                if (Distance(Position, _undockTarget) < 4)
                {
                    _scanStart = Heading;
                    SetPhase(RobotPhase.Scanning);
                }
                break;

            case RobotPhase.Scanning:
                UpdateScan();
                if (_phaseTime >= ScanDuration)
                {
                    foreach (var it in Items.Where(i => i.State == ItemState.Hidden))
                        Discover(it);
                    SetPhase(RobotPhase.Cleaning);
                }
                break;

            case RobotPhase.Cleaning:
                UpdateCleaning(dt);
                break;

            case RobotPhase.Returning:
            {
                var approach = new Point(DockSpot.X, DockSpot.Y - Radius * 1.8);
                DriveTowards(approach, dt, MaxSpeed, allowReverse: false);
                if (Distance(Position, approach) < 5) SetPhase(RobotPhase.Docking);
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
                    double step = Math.Min(d.Length, 70 * dt);
                    if (d.Length > 0.5) Position += d / d.Length * step;
                    else
                    {
                        Position = DockSpot;
                        SetPhase(RobotPhase.Done);
                        Finished?.Invoke();
                    }
                }
                break;
            }
        }

        if (active && _speed > 5 && dt > 0)
        {
            _trail.Add((Position, _realTime));
        }
        _trail.RemoveAll(t => _realTime - t.T > 1.6);
        _skips.RemoveAll(s => _realTime - s.T > 1.2);

        UpdateEffects(dt);
    }

    private void UpdateScan()
    {
        double progress = Math.Clamp(_phaseTime / ScanDuration, 0, 1);
        ScanAngle = _scanStart + progress * Math.PI * 2;
        _turretAngle = ScanAngle;
        foreach (var it in Items)
        {
            if (it.State != ItemState.Hidden) continue;
            var v = it.Center - Position;
            double a = NormalizeAngle(Math.Atan2(v.Y, v.X) - _scanStart);
            if (a < 0) a += Math.PI * 2;
            if (a <= progress * Math.PI * 2) Discover(it);
        }
    }

    private void Discover(DesktopItem it)
    {
        it.State = ItemState.Discovered;
        it.DiscoveredAt = _realTime;
    }

    private void UpdateCleaning(double dt)
    {
        if (dt <= 0) return;

        // zbieraj wszystko, przez co robot przejeżdża
        foreach (var it in Items)
        {
            if (it.State != ItemState.Discovered) continue;
            if (Distance(Position, it.Center) < Radius * 0.95) Collect(it);
        }

        if (Target is null || Target.State != ItemState.Discovered)
        {
            Target = Items.Where(i => i.State == ItemState.Discovered)
                          .OrderBy(i => Distance(Position, i.Center))
                          .FirstOrDefault();
        }

        if (Target is null)
        {
            SetPhase(RobotPhase.Returning);
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
            return;
        }

        it.State = ItemState.Collected;
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
            var toRobot = Position - p.P;
            p.V += toRobot * 6 * dt;          // zasysanie
            p.V *= Math.Pow(0.08, dt);       // tłumienie
            p.P += p.V * dt;
            p.Age += dt;
            if (toRobot.Length < Radius * 0.4) p.Age = p.Life;
        }
        _particles.RemoveAll(p => p.Age >= p.Life);
        _sprites.RemoveAll(s => _realTime - s.Start > s.Duration);
    }

    private void DriveTowards(Point target, double dt, double maxSpeed, bool allowReverse, bool stopAtTarget = true)
    {
        if (dt <= 0) return;
        var d = target - Position;
        double dist = d.Length;
        double desired = Math.Atan2(d.Y, d.X);
        double diff = NormalizeAngle(desired - Heading);
        Heading += Math.Clamp(diff, -TurnRate * dt, TurnRate * dt);

        // jak prawdziwy robot: przy dużym kącie obraca się w miejscu
        double factor = Math.Abs(diff) > 1.0 ? 0 : Math.Cos(diff);
        double wanted = maxSpeed * factor;
        if (stopAtTarget) wanted = Math.Min(wanted, dist * 3.2);
        _speed += Math.Clamp(wanted - _speed, -Accel * 1.6 * dt, Accel * dt);
        _speed = Math.Max(0, _speed);

        double step = _speed * dt;
        if (stopAtTarget && step > dist) step = dist;
        Position += new Vector(Math.Cos(Heading), Math.Sin(Heading)) * step;
    }

    // ------------------------------------------------------------------ rysowanie

    protected override void OnRender(DrawingContext dc)
    {
        // przezroczyste tło, ale wypełnione – bez tego WPF może nie odświeżać całej powierzchni
        dc.DrawRectangle(Brushes.Transparent, null, new Rect(RenderSize));

        DrawTrail(dc);
        DrawDiscoveryMarks(dc);
        if (Phase == RobotPhase.Scanning) DrawLidar(dc);

        double pulse = 0.5 + 0.5 * Math.Sin(_realTime * 4);
        bool charging = Phase is RobotPhase.Done or RobotPhase.Docked;
        RobotPainter.DrawDock(dc, DockTop, Radius, charging, pulse);

        if (Target is not null && Phase == RobotPhase.Cleaning && Target.State == ItemState.Discovered)
            DrawTargetLock(dc, Target);

        DrawParticles(dc);
        DrawSprites(dc);

        var led = Paused ? RobotPainter.Amber : charging ? RobotPainter.Charge : RobotPainter.Accent;
        double ledPulse = Paused || charging ? pulse : 0.85 + 0.15 * pulse;
        RobotPainter.DrawRobot(dc, Position, Heading, Radius, _brushAngle, _turretAngle, led, ledPulse);

        DrawSkips(dc);
    }

    private void DrawTrail(DrawingContext dc)
    {
        for (int i = 1; i < _trail.Count; i++)
        {
            double age = _realTime - _trail[i].T;
            byte a = (byte)Math.Clamp(38 * (1 - age / 1.6), 0, 38);
            if (a == 0) continue;
            var pen = new Pen(new SolidColorBrush(Color.FromArgb(a, 255, 255, 255)), Radius * 1.7)
            { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
            dc.DrawLine(pen, _trail[i - 1].P, _trail[i].P);
        }
    }

    private void DrawLidar(DrawingContext dc)
    {
        double len = Math.Sqrt(RenderSize.Width * RenderSize.Width + RenderSize.Height * RenderSize.Height);
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
        double ring = (_phaseTime * 420) % 600;
        var rp = new Pen(new SolidColorBrush(Color.FromArgb((byte)(80 * (1 - ring / 600)), c.R, c.G, c.B)), 1.5);
        dc.DrawEllipse(null, rp, Position, ring, ring);
    }

    private void DrawDiscoveryMarks(DrawingContext dc)
    {
        var c = RobotPainter.Accent;
        foreach (var it in Items)
        {
            if (it.State != ItemState.Discovered) continue;
            double age = _realTime - it.DiscoveredAt;

            if (age < 0.9)
            {
                double r = 8 + age * 55;
                byte a = (byte)(200 * (1 - age / 0.9));
                dc.DrawEllipse(null, new Pen(new SolidColorBrush(Color.FromArgb(a, c.R, c.G, c.B)), 2), it.Center, r, r);
            }

            // narożniki „zaznaczenia” lidaru
            var rc = it.IconRect;
            rc.Inflate(6, 6);
            double s = Math.Min(10, rc.Width / 4);
            var pen = new Pen(new SolidColorBrush(Color.FromArgb(150, c.R, c.G, c.B)), 1.6);
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
        f = new FormattedText(name, CultureInfo.CurrentUICulture, FlowDirection.LeftToRight,
            new Typeface("Segoe UI"), 12, Brushes.White, VisualTreeHelper.GetDpi(this).PixelsPerDip);
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
    }
}
