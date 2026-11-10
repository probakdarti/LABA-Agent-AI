using System.Windows;
using System.Windows.Media;
using DeskVac.Core;
using DeskVac.Overlay;
using DeskVac.Platform;

namespace DeskVac.Panel;

/// <summary>Mapa wszystkich monitorów w panelu: wykryte elementy, chronione, robot, wiązka lidaru, stacja.</summary>
public sealed class MiniMap : FrameworkElement
{
    public CleaningController? Controller { get; set; }

    private static Brush Ink(byte alpha)
    {
        var c = Theme.Color("MapInk");
        return Freeze(new SolidColorBrush(Color.FromArgb(alpha, c.R, c.G, c.B)));
    }

    protected override void OnRender(DrawingContext dc)
    {
        var size = RenderSize;
        var DotBrush = Ink(Theme.IsDark ? (byte)18 : (byte)28);
        var ScreenFill = Ink(Theme.IsDark ? (byte)10 : (byte)8);
        var ScreenPen = Freeze(new Pen(Ink(Theme.IsDark ? (byte)55 : (byte)70), 1));
        dc.DrawRoundedRectangle(Theme.Brush("MapBg"), null, new Rect(size), 12, 12);
        for (double x = 12; x < size.Width; x += 16)
            for (double y = 12; y < size.Height; y += 16)
                dc.DrawRectangle(DotBrush, null, new Rect(x, y, 1, 1));

        var c = Controller;
        if (c is null || c.World.Width <= 0) return;
        var world = c.World;
        var stage = c.Stage;

        double pad = 12;
        double k = Math.Min((size.Width - pad * 2) / world.Width, (size.Height - pad * 2) / world.Height);
        double ox = (size.Width - world.Width * k) / 2, oy = (size.Height - world.Height * k) / 2;
        Point Map(Point p) => new(ox + (p.X - world.X) * k, oy + (p.Y - world.Y) * k);

        foreach (var m in c.MonitorList)
        {
            var tl = Map(m.Bounds.TopLeft);
            dc.DrawRoundedRectangle(ScreenFill, ScreenPen, new Rect(tl.X, tl.Y, m.Bounds.Width * k, m.Bounds.Height * k), 4, 4);
        }

        var accent = RobotPainter.Accent;

        if (stage.Phase == RobotPhase.Scanning)
        {
            var center = Map(stage.Position);
            double len = Math.Max(size.Width, size.Height) * 1.5;
            var geo = new StreamGeometry();
            using (var g = geo.Open())
            {
                g.BeginFigure(center, true, true);
                g.LineTo(center + new Vector(Math.Cos(stage.ScanAngle - 0.35), Math.Sin(stage.ScanAngle - 0.35)) * len, false, false);
                g.LineTo(center + new Vector(Math.Cos(stage.ScanAngle), Math.Sin(stage.ScanAngle)) * len, false, false);
            }
            geo.Freeze();
            dc.PushClip(new RectangleGeometry(new Rect(size), 12, 12));
            dc.DrawGeometry(new SolidColorBrush(Color.FromArgb(60, accent.R, accent.G, accent.B)), null, geo);
            dc.Pop();
        }

        foreach (var it in stage.Items)
        {
            var p = Map(it.Center);
            Brush? b = it.State switch
            {
                ItemState.Discovered => Theme.IsDark ? Brushes.WhiteSmoke : Ink(200),
                ItemState.Skipped => new SolidColorBrush(Color.FromRgb(0xFF, 0x6A, 0x6A)),
                ItemState.Protected => new SolidColorBrush(RobotPainter.Amber),
                ItemState.Hidden => Ink(40),
                _ => null,
            };
            if (b is not null) dc.DrawEllipse(b, null, p, 2.3, 2.3);
        }

        if (stage.Target is { State: ItemState.Discovered } t)
        {
            dc.DrawLine(new Pen(new SolidColorBrush(Color.FromArgb(120, accent.R, accent.G, accent.B)), 1) { DashStyle = DashStyles.Dash },
                Map(stage.Position), Map(t.Center));
        }

        var d = Map(stage.DockTop);
        dc.DrawRoundedRectangle(Theme.Brush("MapDock"), null, new Rect(d.X - 7, d.Y, 14, 5), 2, 2);

        var rp = Map(stage.Position);
        dc.DrawEllipse(new SolidColorBrush(Color.FromArgb(50, accent.R, accent.G, accent.B)), null, rp, 10, 10);
        dc.DrawEllipse(Theme.Brush("MapRobot"), new Pen(new SolidColorBrush(accent), 1.5), rp, 5.5, 5.5);
        dc.DrawLine(new Pen(new SolidColorBrush(accent), 2) { EndLineCap = PenLineCap.Round }, rp,
            rp + new Vector(Math.Cos(stage.Heading), Math.Sin(stage.Heading)) * 9);
    }

    private static T Freeze<T>(T f) where T : Freezable
    {
        f.Freeze();
        return f;
    }
}
