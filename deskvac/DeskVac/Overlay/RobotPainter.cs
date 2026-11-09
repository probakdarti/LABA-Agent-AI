using System.Windows;
using System.Windows.Media;

namespace DeskVac.Overlay;

/// <summary>Rysuje robota i stację dokującą wektorowo (bez plików graficznych). Kierunek 0 rad = przód robota w prawo.</summary>
internal static class RobotPainter
{
    public static readonly Color Accent = Color.FromRgb(0x2E, 0xE6, 0xC5);   // turkus
    public static readonly Color Amber = Color.FromRgb(0xFF, 0xB3, 0x3B);
    public static readonly Color Charge = Color.FromRgb(0x6B, 0xF2, 0x7A);

    private static readonly Brush ShadowBrush = Frozen(new RadialGradientBrush(
        new GradientStopCollection
        {
            new(Color.FromArgb(110, 0, 0, 0), 0.0),
            new(Color.FromArgb(70, 0, 0, 0), 0.75),
            new(Color.FromArgb(0, 0, 0, 0), 1.0),
        }));

    private static readonly Brush BodyBrush = Frozen(new RadialGradientBrush(
        new GradientStopCollection
        {
            new(Color.FromRgb(0x4A, 0x50, 0x5A), 0.0),
            new(Color.FromRgb(0x24, 0x28, 0x2E), 0.7),
            new(Color.FromRgb(0x14, 0x16, 0x1A), 1.0),
        })
    { GradientOrigin = new Point(0.35, 0.3), Center = new Point(0.45, 0.4) });

    private static readonly Brush TopBrush = Frozen(new LinearGradientBrush(
        Color.FromRgb(0x3A, 0x40, 0x48), Color.FromRgb(0x1C, 0x1F, 0x24), 55));

    private static readonly Brush TurretBrush = Frozen(new RadialGradientBrush(
        Color.FromRgb(0xF4, 0xF6, 0xF8), Color.FromRgb(0xB8, 0xBE, 0xC6))
    { GradientOrigin = new Point(0.35, 0.3) });

    private static readonly Pen BumperPen = Frozen(new Pen(new SolidColorBrush(Color.FromRgb(0xE9, 0xEC, 0xEF)), 5)
    { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round });

    private static readonly Pen RimPen = Frozen(new Pen(new SolidColorBrush(Color.FromArgb(160, 255, 255, 255)), 1.2));
    private static readonly Pen SeamPen = Frozen(new Pen(new SolidColorBrush(Color.FromArgb(70, 255, 255, 255)), 1));
    private static readonly Pen BristlePen = Frozen(new Pen(new SolidColorBrush(Color.FromArgb(200, 210, 215, 220)), 1.6)
    { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round });

    /// <param name="brushAngle">kąt obrotu szczotek bocznych (rad)</param>
    /// <param name="turretAngle">kąt obrotu wieżyczki lidaru (rad)</param>
    /// <param name="ledColor">kolor diody statusu</param>
    /// <param name="ledPulse">0..1 jasność diody</param>
    public static void DrawRobot(DrawingContext dc, Point pos, double heading, double r,
        double brushAngle, double turretAngle, Color ledColor, double ledPulse, double opacity = 1)
    {
        if (opacity < 1) dc.PushOpacity(opacity);

        // cień (nieobrócony, lekko przesunięty w dół)
        dc.DrawEllipse(ShadowBrush, null, new Point(pos.X + 3, pos.Y + 7), r * 1.12, r * 1.08);

        dc.PushTransform(new TranslateTransform(pos.X, pos.Y));
        dc.PushTransform(new RotateTransform(heading * 180 / Math.PI));

        // szczotki boczne – pod korpusem, wystają z przodu
        DrawSideBrush(dc, new Point(r * 0.62, -r * 0.66), r * 0.42, brushAngle);
        DrawSideBrush(dc, new Point(r * 0.62, r * 0.66), r * 0.42, -brushAngle);

        // korpus
        dc.DrawEllipse(BodyBrush, RimPen, new Point(0, 0), r, r);

        // zderzak – przednia połowa obwodu
        dc.DrawGeometry(null, BumperPen, Arc(r - 2.5, -100, 100));

        // górna płyta
        dc.DrawEllipse(TopBrush, SeamPen, new Point(-r * 0.06, 0), r * 0.74, r * 0.74);

        // pasek LED z przodu
        var led = Color.FromArgb((byte)(120 + 135 * ledPulse), ledColor.R, ledColor.G, ledColor.B);
        var ledPen = new Pen(new SolidColorBrush(led), 3) { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
        dc.DrawGeometry(null, ledPen, Arc(r * 0.58, -28, 28));
        var glow = new Pen(new SolidColorBrush(Color.FromArgb((byte)(50 * ledPulse), ledColor.R, ledColor.G, ledColor.B)), 9)
        { StartLineCap = PenLineCap.Round, EndLineCap = PenLineCap.Round };
        dc.DrawGeometry(null, glow, Arc(r * 0.58, -28, 28));

        // wieżyczka lidaru (lekko z tyłu)
        var turret = new Point(-r * 0.2, 0);
        dc.DrawEllipse(new SolidColorBrush(Color.FromArgb(90, 0, 0, 0)), null, new Point(turret.X + 1.5, turret.Y + 2.5), r * 0.3, r * 0.3);
        dc.DrawEllipse(TurretBrush, null, turret, r * 0.28, r * 0.28);
        var notchDir = new Vector(Math.Cos(turretAngle), Math.Sin(turretAngle));
        dc.DrawEllipse(new SolidColorBrush(Color.FromRgb(0x1C, 0x1F, 0x24)), null, turret + notchDir * r * 0.14, r * 0.07, r * 0.07);
        dc.DrawEllipse(new SolidColorBrush(Color.FromArgb(220, ledColor.R, ledColor.G, ledColor.B)), null, turret + notchDir * r * 0.14, r * 0.035, r * 0.035);

        // przycisk zasilania
        dc.DrawEllipse(new SolidColorBrush(Color.FromRgb(0x2C, 0x31, 0x38)), SeamPen, new Point(r * 0.32, 0), r * 0.1, r * 0.1);

        dc.Pop();
        dc.Pop();
        if (opacity < 1) dc.Pop();
    }

    private static void DrawSideBrush(DrawingContext dc, Point c, double len, double angle)
    {
        dc.DrawEllipse(new SolidColorBrush(Color.FromRgb(0x33, 0x38, 0x40)), null, c, 3.2, 3.2);
        for (int i = 0; i < 3; i++)
        {
            double a = angle + i * Math.PI * 2 / 3;
            var tip = new Point(c.X + Math.Cos(a) * len, c.Y + Math.Sin(a) * len);
            dc.DrawLine(BristlePen, c, tip);
        }
    }

    /// <summary>Stacja dokująca: niska „wieża” na dole ekranu, robot stoi tuż nad nią.</summary>
    public static void DrawDock(DrawingContext dc, Point topCenter, double r, bool charging, double pulse)
    {
        double w = r * 2.3, h = r * 1.15;
        var rect = new Rect(topCenter.X - w / 2, topCenter.Y, w, h);

        dc.DrawRoundedRectangle(ShadowBrush, null, new Rect(rect.X - 6, rect.Y + 4, rect.Width + 12, rect.Height + 10), 14, 14);
        dc.DrawRoundedRectangle(
            new LinearGradientBrush(Color.FromRgb(0x30, 0x35, 0x3C), Color.FromRgb(0x15, 0x17, 0x1B), 90),
            RimPen, rect, 12, 12);

        // kratka wentylacyjna
        var grill = new Pen(new SolidColorBrush(Color.FromArgb(60, 255, 255, 255)), 1);
        for (double y = rect.Y + 12; y < rect.Bottom - 10; y += 4)
            dc.DrawLine(grill, new Point(rect.X + 14, y), new Point(rect.Right - 14, y));

        // styki ładowania
        var contact = new SolidColorBrush(Color.FromRgb(0xE8, 0xB9, 0x4A));
        dc.DrawRoundedRectangle(contact, null, new Rect(topCenter.X - r * 0.55, rect.Y - 2, r * 0.32, 5), 2, 2);
        dc.DrawRoundedRectangle(contact, null, new Rect(topCenter.X + r * 0.23, rect.Y - 2, r * 0.32, 5), 2, 2);

        // dioda
        var c = charging ? Charge : Accent;
        byte a = (byte)(charging ? 120 + 135 * pulse : 200);
        dc.DrawRoundedRectangle(new SolidColorBrush(Color.FromArgb(a, c.R, c.G, c.B)), null,
            new Rect(topCenter.X - 10, rect.Bottom - 9, 20, 4), 2, 2);
    }

    /// <summary>Łuk o środku (0,0) między kątami w stopniach (0° = przód).</summary>
    private static Geometry Arc(double radius, double fromDeg, double toDeg)
    {
        double a0 = fromDeg * Math.PI / 180, a1 = toDeg * Math.PI / 180;
        var start = new Point(Math.Cos(a0) * radius, Math.Sin(a0) * radius);
        var end = new Point(Math.Cos(a1) * radius, Math.Sin(a1) * radius);
        var fig = new PathFigure { StartPoint = start, IsClosed = false, IsFilled = false };
        fig.Segments.Add(new ArcSegment(end, new Size(radius, radius), 0, toDeg - fromDeg > 180, SweepDirection.Clockwise, true));
        var g = new PathGeometry();
        g.Figures.Add(fig);
        return g;
    }

    private static T Frozen<T>(T f) where T : Freezable
    {
        f.Freeze();
        return f;
    }
}
