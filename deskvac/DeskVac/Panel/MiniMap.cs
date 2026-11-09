using System.Windows;
using System.Windows.Media;
using DeskVac.Core;
using DeskVac.Overlay;

namespace DeskVac.Panel;

/// <summary>Podgląd „mapy” pulpitu w panelu: wykryte elementy, robot, wiązka lidaru, stacja.</summary>
public sealed class MiniMap : FrameworkElement
{
    public Stage? Stage { get; set; }

    private static readonly Brush BgBrush = Freeze(new SolidColorBrush(Color.FromRgb(0x10, 0x13, 0x17)));
    private static readonly Pen GridPen = Freeze(new Pen(new SolidColorBrush(Color.FromArgb(18, 255, 255, 255)), 1));
    private static readonly Pen ScreenPen = Freeze(new Pen(new SolidColorBrush(Color.FromArgb(50, 255, 255, 255)), 1));

    protected override void OnRender(DrawingContext dc)
    {
        var size = RenderSize;
        dc.DrawRoundedRectangle(BgBrush, null, new Rect(size), 12, 12);
        for (double x = 12; x < size.Width; x += 16)
            for (double y = 12; y < size.Height; y += 16)
                dc.DrawRectangle(GridPen.Brush, null, new Rect(x, y, 1, 1));

        double vw = SystemParameters.VirtualScreenWidth, vh = SystemParameters.VirtualScreenHeight;
        double pad = 12;
        double k = Math.Min((size.Width - pad * 2) / vw, (size.Height - pad * 2) / vh);
        double ox = (size.Width - vw * k) / 2, oy = (size.Height - vh * k) / 2;
        Point Map(Point p) => new(ox + p.X * k, oy + p.Y * k);

        dc.DrawRoundedRectangle(null, ScreenPen, new Rect(ox, oy, vw * k, vh * k), 6, 6);

        var accent = RobotPainter.Accent;
        var stage = Stage;
        if (stage is null)
        {
            DrawIdleRobot(dc, Map, null);
            return;
        }

        // wiązka lidaru
        if (stage.Phase == RobotPhase.Scanning)
        {
            var c = Map(stage.Position);
            double len = Math.Max(size.Width, size.Height) * 1.5;
            var geo = new StreamGeometry();
            using (var g = geo.Open())
            {
                g.BeginFigure(c, true, true);
                g.LineTo(c + new Vector(Math.Cos(stage.ScanAngle - 0.35), Math.Sin(stage.ScanAngle - 0.35)) * len, false, false);
                g.LineTo(c + new Vector(Math.Cos(stage.ScanAngle), Math.Sin(stage.ScanAngle)) * len, false, false);
            }
            geo.Freeze();
            dc.PushClip(new RectangleGeometry(new Rect(size), 12, 12));
            dc.DrawGeometry(new SolidColorBrush(Color.FromArgb(60, accent.R, accent.G, accent.B)), null, geo);
            dc.Pop();
        }

        foreach (var it in stage.Items)
        {
            var p = Map(it.Center);
            switch (it.State)
            {
                case ItemState.Discovered:
                    dc.DrawEllipse(new SolidColorBrush(Color.FromRgb(0xF2, 0xF4, 0xF6)), null, p, 2.6, 2.6);
                    break;
                case ItemState.Skipped:
                    dc.DrawEllipse(new SolidColorBrush(Color.FromRgb(0xFF, 0x6A, 0x6A)), null, p, 2.6, 2.6);
                    break;
                case ItemState.Hidden:
                    dc.DrawEllipse(new SolidColorBrush(Color.FromArgb(40, 255, 255, 255)), null, p, 2, 2);
                    break;
            }
        }

        if (stage.Target is { State: ItemState.Discovered } t)
        {
            dc.DrawLine(new Pen(new SolidColorBrush(Color.FromArgb(120, accent.R, accent.G, accent.B)), 1) { DashStyle = DashStyles.Dash },
                Map(stage.Position), Map(t.Center));
        }

        DrawIdleRobot(dc, Map, stage);
    }

    private static void DrawIdleRobot(DrawingContext dc, Func<Point, Point> map, Stage? stage)
    {
        var accent = RobotPainter.Accent;
        var dockTop = stage?.DockTop ?? OverlayWindow.DefaultDockTop();
        var pos = stage?.Position ?? new Point(dockTop.X, dockTop.Y - Stage.Radius + 4);
        double heading = stage?.Heading ?? -Math.PI / 2;

        var d = map(dockTop);
        dc.DrawRoundedRectangle(new SolidColorBrush(Color.FromRgb(0x3A, 0x41, 0x4B)), null, new Rect(d.X - 9, d.Y, 18, 6), 2, 2);

        var p = map(pos);
        dc.DrawEllipse(new SolidColorBrush(Color.FromArgb(50, accent.R, accent.G, accent.B)), null, p, 11, 11);
        dc.DrawEllipse(new SolidColorBrush(Color.FromRgb(0xF4, 0xF6, 0xF8)), new Pen(new SolidColorBrush(accent), 1.5), p, 6, 6);
        dc.DrawLine(new Pen(new SolidColorBrush(accent), 2) { EndLineCap = PenLineCap.Round }, p,
            p + new Vector(Math.Cos(heading), Math.Sin(heading)) * 10);
    }

    private static T Freeze<T>(T f) where T : Freezable
    {
        f.Freeze();
        return f;
    }
}
