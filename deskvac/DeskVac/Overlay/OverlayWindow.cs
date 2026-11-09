using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using DeskVac.Native;
using static DeskVac.Native.NativeMethods;

namespace DeskVac.Overlay;

/// <summary>
/// Rysuje wycinek sceny (świat w fizycznych pikselach) widoczny w danym oknie.
/// Okno ma swoją skalę DPI (monitor 100% / 150%), więc przeliczamy: DIP = (px − origin) / skala.
/// </summary>
public sealed class SceneView : FrameworkElement
{
    private readonly Stage _stage;

    /// <summary>Lewy górny róg okna w fizycznych pikselach ekranu.</summary>
    public Point Origin { get; set; }

    public SceneView(Stage stage)
    {
        _stage = stage;
        IsHitTestVisible = false;
    }

    protected override void OnRender(DrawingContext dc)
    {
        // wypełnione przezroczystym – bez tego WPF potrafi nie odświeżać całej powierzchni
        dc.DrawRectangle(Brushes.Transparent, null, new Rect(RenderSize));
        double scale = VisualTreeHelper.GetDpi(this).DpiScaleX;
        dc.PushTransform(new ScaleTransform(1 / scale, 1 / scale));
        dc.PushTransform(new TranslateTransform(-Origin.X, -Origin.Y));
        _stage.Draw(dc);
        dc.Pop();
        dc.Pop();
    }
}

/// <summary>Bazowe okno przezroczyste, ustawiane w fizycznych pikselach.</summary>
public abstract class PixelWindow : Window
{
    protected PixelWindow(Rect boundsPx, bool clickThrough)
    {
        BoundsPx = boundsPx;
        ClickThrough = clickThrough;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ResizeMode = ResizeMode.NoResize;
        ShowInTaskbar = false;
        ShowActivated = false;
        WindowStartupLocation = WindowStartupLocation.Manual;
        // przybliżenie w DIP monitora głównego – dokładne położenie ustawia SetWindowPos niżej
        Left = boundsPx.X;
        Top = boundsPx.Y;
        Width = Math.Max(1, boundsPx.Width);
        Height = Math.Max(1, boundsPx.Height);

        SourceInitialized += (_, _) =>
        {
            var hwnd = Handle;
            var ex = GetWindowLongPtr(hwnd, GWL_EXSTYLE).ToInt64() | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED;
            if (ClickThrough) ex |= WS_EX_TRANSPARENT;
            SetWindowLongPtr(hwnd, GWL_EXSTYLE, new IntPtr(ex));
            ApplyBounds();
        };
        // WPF po zmianie DPI (okno trafiło na monitor 150%) przelicza rozmiar – wymuszamy nasz prostokąt
        DpiChanged += (_, _) => Dispatcher.BeginInvoke(ApplyBounds);
    }

    public Rect BoundsPx { get; private set; }
    public bool ClickThrough { get; }
    public IntPtr Handle => new WindowInteropHelper(this).Handle;

    public void MoveTo(Rect boundsPx)
    {
        BoundsPx = boundsPx;
        ApplyBounds();
    }

    private void ApplyBounds()
    {
        var h = Handle;
        if (h == IntPtr.Zero) return;
        SetWindowPos(h, IntPtr.Zero, (int)BoundsPx.X, (int)BoundsPx.Y, (int)BoundsPx.Width, (int)BoundsPx.Height,
            SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

/// <summary>
/// Przezroczysta nakładka na jeden monitor, przepuszczająca kliknięcia. Na niej jeździ robot.
/// Tryb „na wierzchu” (ręczne sprzątanie) albo „na pulpicie” (sprzątanie w tle – pod oknami programów).
/// </summary>
public sealed class OverlayWindow : PixelWindow
{
    public MonitorInfo Monitor { get; }
    public SceneView View { get; }

    public OverlayWindow(MonitorInfo monitor, Stage stage) : base(monitor.Bounds, clickThrough: true)
    {
        Monitor = monitor;
        Title = "DeskVac – nakładka";
        View = new SceneView(stage) { Origin = monitor.Bounds.TopLeft };
        Content = View;
    }
}

/// <summary>
/// Mały widżet na pulpicie: robot stojący przy stacji, gdy nic nie sprząta.
/// Klik otwiera panel, prawy klik – menu. Leży pod oknami programów.
/// </summary>
public sealed class DockWidget : PixelWindow
{
    public SceneView View { get; }

    public DockWidget(Rect boundsPx, Stage stage) : base(boundsPx, clickThrough: false)
    {
        Title = "DeskVac";
        View = new SceneView(stage) { Origin = boundsPx.TopLeft };
        Content = View;
        Cursor = System.Windows.Input.Cursors.Hand;
        ToolTip = "DeskVac – kliknij, aby otworzyć panel";
    }

    public new void MoveTo(Rect boundsPx)
    {
        View.Origin = boundsPx.TopLeft;
        base.MoveTo(boundsPx);
    }
}
