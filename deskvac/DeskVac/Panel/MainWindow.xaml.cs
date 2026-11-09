using System.Diagnostics;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;
using DeskVac.Core;
using DeskVac.Native;
using DeskVac.Overlay;

namespace DeskVac.Panel;

public partial class MainWindow : Window
{
    private readonly AppSettings _settings = AppSettings.Load();
    private readonly CleaningController _controller;
    private readonly DispatcherTimer _ui = new() { Interval = TimeSpan.FromMilliseconds(33) };

    public MainWindow()
    {
        InitializeComponent();
        _controller = new CleaningController(this);
        _controller.Finished += OnFinished;

        ShortcutsBox.IsChecked = _settings.CollectShortcuts;
        FilesBox.IsChecked = _settings.CollectFiles;
        FoldersBox.IsChecked = _settings.CollectFolders;
        MinimizeBox.IsChecked = _settings.MinimizeWindows;
        ExclusionsBox.Text = string.Join(", ", _settings.Exclusions);

        SourceInitialized += (_, _) => UseDarkTitleBar();
        Loaded += (_, _) => PlaceNearDock();
        Closing += (_, _) => SaveSettings();

        _ui.Tick += (_, _) => RefreshUi();
        _ui.Start();
    }

    private void PlaceNearDock()
    {
        var wa = SystemParameters.WorkArea;
        Left = wa.Right - ActualWidth - 24;
        Top = Math.Max(wa.Top + 24, wa.Bottom - ActualHeight - 130);
    }

    private void UseDarkTitleBar()
    {
        try
        {
            int on = 1;
            NativeMethods.DwmSetWindowAttribute(new WindowInteropHelper(this).Handle,
                NativeMethods.DWMWA_USE_IMMERSIVE_DARK_MODE, ref on, sizeof(int));
        }
        catch (Exception)
        {
            // starszy Windows – zostaje jasny pasek
        }
    }

    private void SaveSettings()
    {
        _settings.CollectShortcuts = ShortcutsBox.IsChecked == true;
        _settings.CollectFiles = FilesBox.IsChecked == true;
        _settings.CollectFolders = FoldersBox.IsChecked == true;
        _settings.MinimizeWindows = MinimizeBox.IsChecked == true;
        _settings.Exclusions = ExclusionsBox.Text
            .Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        _settings.Save();
    }

    private void OnStart(object sender, RoutedEventArgs e)
    {
        SaveSettings();
        ShowProblem(null);
        try
        {
            _controller.Start(_settings);
            Map.Stage = _controller.Stage;
            Topmost = true;
        }
        catch (Exception ex)
        {
            ShowProblem(ex.Message);
        }
    }

    private void OnPause(object sender, RoutedEventArgs e) => _controller.TogglePause();

    private void OnStop(object sender, RoutedEventArgs e) => _controller.Stop();

    private void OnUndo(object sender, RoutedEventArgs e) => ShowProblem(_controller.UndoLast());

    private void OnOpenFolder(object sender, RoutedEventArgs e)
    {
        var folder = _controller.CollectionFolder ?? new Collector(_settings).BaseFolder;
        if (!Directory.Exists(folder))
        {
            ShowProblem("Folder jeszcze nie istnieje – powstanie przy pierwszym sprzątaniu.");
            return;
        }
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{folder}\"") { UseShellExecute = true });
    }

    private void OnFinished()
    {
        Topmost = false;
        var msg = $"Gotowe: zebrano {_controller.Collected} z {_controller.Total}.";
        if (_controller.Skipped > 0) msg += $" Pominięto {_controller.Skipped}. {_controller.LastProblem}";
        ShowProblem(_controller.Skipped > 0 ? msg : null);
    }

    private void ShowProblem(string? text)
    {
        ProblemText.Text = text ?? "";
        ProblemText.Visibility = string.IsNullOrEmpty(text) ? Visibility.Collapsed : Visibility.Visible;
    }

    private void RefreshUi()
    {
        var stage = _controller.Stage;
        bool running = _controller.IsRunning;

        StartButton.IsEnabled = !running;
        PauseButton.IsEnabled = running && stage?.Phase is not (RobotPhase.Returning or RobotPhase.Docking);
        StopButton.IsEnabled = running && stage?.Phase is not (RobotPhase.Returning or RobotPhase.Docking);
        UndoButton.IsEnabled = !running;
        PauseButton.Content = stage?.Paused == true ? "Wznów" : "Pauza";

        double battery = stage?.Battery ?? 100;
        BatteryFill.Width = Math.Max(0, BatteryTrack.ActualWidth * battery / 100);
        BatteryText.Text = $"{battery:0}%";

        CountText.Text = _controller.Collected.ToString();
        CountSub.Text = _controller.Total > 0 ? $"z {_controller.Total} elementów" : "zebranych elementów";
        SizeText.Text = Collector.FormatSize(_controller.CollectedBytes);

        StatusText.Text = stage is null ? "W stacji dokującej" : (stage.Paused ? "Pauza" : stage.Phase switch
        {
            RobotPhase.Docked => "W stacji dokującej",
            RobotPhase.Undocking => "Wyjeżdżam ze stacji…",
            RobotPhase.Scanning => "Skanuję pulpit lidarem…",
            RobotPhase.Cleaning => $"Sprzątam pulpit – zostało {stage.Items.Count(i => i.State == ItemState.Discovered)}",
            RobotPhase.Returning => "Wracam do bazy…",
            RobotPhase.Docking => "Dokowanie…",
            RobotPhase.Done => stage.Battery < 100 ? "Ładuję się – pulpit czysty ✨" : "Pulpit czysty ✨",
            _ => "",
        });

        Map.InvalidateVisual();
    }
}
