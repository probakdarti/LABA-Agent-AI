using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using DeskVac.Core;
using DeskVac.Native;
using DeskVac.Overlay;
using DeskVac.Platform;

namespace DeskVac.Panel;

public partial class MainWindow : Window
{
    private readonly AppSettings _settings;
    private readonly CleaningController _controller;
    private readonly DispatcherTimer _ui = new() { Interval = TimeSpan.FromMilliseconds(33) };
    private bool _loading = true;
    private string _target = "desktop";

    /// <summary>Prawdziwe zamknięcie (z menu „Zakończ”), a nie schowanie do zasobnika.</summary>
    public bool AllowClose { get; set; }

    public MainWindow(AppSettings settings, CleaningController controller)
    {
        InitializeComponent();
        _settings = settings;
        _controller = controller;
        _controller.Finished += OnFinished;
        Map.Controller = controller;

        LoadQuickSettings();
        ShortcutsBox.Click += (_, _) => SaveQuickSettings();
        FilesBox.Click += (_, _) => SaveQuickSettings();
        FoldersBox.Click += (_, _) => SaveQuickSettings();
        MinimizeBox.Click += (_, _) => SaveQuickSettings();
        SoundBox.Click += (_, _) => SaveQuickSettings();
        VolumeSlider.ValueChanged += (_, _) => SaveQuickSettings();

        SourceInitialized += (_, _) => Theme.ApplyTitleBar(this);
        Loaded += (_, _) => PlaceNearDock();
        IsVisibleChanged += (_, _) =>
        {
            if (IsVisible) { LoadQuickSettings(); _ui.Start(); }
            else _ui.Stop(); // schowany panel nie zużywa CPU
        };

        _ui.Tick += (_, _) => RefreshUi();

        RefreshTargets();
        AuthorText.Text = $"{AppInfo.Product} {AppInfo.Version} · {AppInfo.Copyright}";
        Title = $"DeskVac – odkurzacz pulpitu · {AppInfo.Author}";
        // wybór „Co sprzątać” obowiązuje do zamknięcia programu; przy starcie zawsze „Tylko pulpit”
        TargetBox.SelectionChanged += (_, _) =>
        {
            if (_loading || TargetBox.SelectedItem is not ComboBoxItem { Tag: string t }) return;
            _target = t;
        };

        ProtectDrop.DragEnter += OnProtectDragOver;
        ProtectDrop.DragOver += OnProtectDragOver;
        ProtectDrop.DragLeave += (_, _) => HighlightDrop(false);
        ProtectDrop.Drop += OnProtectDrop;
        ProtectDrop.MouseLeftButtonUp += (_, _) => ((App)Application.Current).ShowSettings();
        RefreshProtectedCount();
    }

    // ------------------------------------------------------------------ przeciąganie ikon = ochrona

    private void OnProtectDragOver(object sender, DragEventArgs e)
    {
        // „Łącze”, nie kopiowanie/przenoszenie – Eksplorator nic nie robi z plikiem, my tylko zapisujemy ścieżkę
        bool files = e.Data.GetDataPresent(DataFormats.FileDrop);
        e.Effects = files ? DragDropEffects.Link : DragDropEffects.None;
        HighlightDrop(files);
        e.Handled = true;
    }

    private void OnProtectDrop(object sender, DragEventArgs e)
    {
        HighlightDrop(false);
        if (e.Data.GetData(DataFormats.FileDrop) is string[] paths && paths.Length > 0)
        {
            ((App)Application.Current).SetProtected(paths, true, notify: false);
            ShowProblem($"🛡 Chronione: {string.Join(", ", paths.Select(Path.GetFileName).Take(4))}{(paths.Length > 4 ? "…" : "")}");
        }
        e.Effects = DragDropEffects.Link;
        e.Handled = true;
    }

    private void HighlightDrop(bool on)
    {
        // SetResourceReference: kolor ramki dalej podąża za motywem
        ProtectDrop.SetResourceReference(System.Windows.Controls.Border.BorderBrushProperty, on ? "DropActive" : "DropBorder");
        ProtectDropHint.Text = on ? "Upuść – robot nie ruszy tych elementów" : "Przeciągnij tu ikony z pulpitu – robot ich nie ruszy";
    }

    public void RefreshProtectedCount()
    {
        int n = _settings.ProtectedPaths.Count;
        ProtectedCountText.Text = n == 0 ? "Chronione: brak" : $"Chronione: {n} {Notifications.Plural(n)}";
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        SaveQuickSettings();
        if (!AllowClose && _settings.CloseToTray)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        if (!AllowClose)
        {
            e.Cancel = true;
            ((App)Application.Current).ExitApp();
            return;
        }
        base.OnClosing(e);
    }

    public void ShowPanel()
    {
        if (!IsVisible) Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
    }

    private void PlaceNearDock()
    {
        var wa = SystemParameters.WorkArea;
        Left = wa.Right - ActualWidth - 24;
        Top = Math.Max(wa.Top + 24, wa.Bottom - ActualHeight - 150);
    }


    public void LoadQuickSettings()
    {
        _loading = true;
        ShortcutsBox.IsChecked = _settings.CollectShortcuts;
        FilesBox.IsChecked = _settings.CollectFiles;
        FoldersBox.IsChecked = _settings.CollectFolders;
        MinimizeBox.IsChecked = _settings.MinimizeWindows;
        SoundBox.IsChecked = _settings.PlaySounds;
        VolumeSlider.Value = _settings.Volume;
        _loading = false;
    }

    private void SaveQuickSettings()
    {
        if (_loading) return;
        _settings.CollectShortcuts = ShortcutsBox.IsChecked == true;
        _settings.CollectFiles = FilesBox.IsChecked == true;
        _settings.CollectFolders = FoldersBox.IsChecked == true;
        _settings.MinimizeWindows = MinimizeBox.IsChecked == true;
        _settings.PlaySounds = SoundBox.IsChecked == true;
        _settings.Volume = VolumeSlider.Value;
        _settings.Save();
        _controller.ApplySoundSettings();
    }

    private void OnStart(object sender, RoutedEventArgs e) => StartCleaning();

    public void StartCleaning()
    {
        SaveQuickSettings();
        ShowProblem(null);
        var target = TargetBox.SelectedItem is ComboBoxItem { Tag: string t } ? t : "desktop";
        ((App)Application.Current).StartTarget(target, fromPanel: true);
    }

    /// <summary>Lista „Co sprzątać”: wszystko, pulpit, każdy włączony folder.</summary>
    public void RefreshTargets()
    {
        bool was = _loading;
        _loading = true;
        TargetBox.Items.Clear();
        var folders = _settings.Folders.Where(f => f.Enabled).ToList();
        TargetBox.Items.Add(new ComboBoxItem { Content = folders.Count == 0 ? "Pulpit" : "Tylko pulpit", Tag = "desktop" });
        if (folders.Count > 0)
            TargetBox.Items.Add(new ComboBoxItem { Content = "Wszystko: pulpit + " + string.Join(", ", folders.Select(f => f.DisplayName)), Tag = "all" });
        foreach (var f in folders)
            TargetBox.Items.Add(new ComboBoxItem { Content = $"Tylko folder „{f.DisplayName}”", Tag = f.Id });
        TargetBox.SelectedItem = TargetBox.Items.Cast<ComboBoxItem>().FirstOrDefault(i => (string)i.Tag == _target)
                                 ?? TargetBox.Items[0];
        _loading = was;
    }

    private void OnPause(object sender, RoutedEventArgs e) => _controller.TogglePause();

    private void OnStop(object sender, RoutedEventArgs e) => _controller.Stop();

    private void OnUndo(object sender, RoutedEventArgs e) => ShowProblem(_controller.UndoLast());

    private void OnOpenFolder(object sender, RoutedEventArgs e) => OpenCollectionFolder();

    private void OnSettings(object sender, RoutedEventArgs e) => ((App)Application.Current).ShowSettings();

    public void OpenCollectionFolder()
    {
        var folder = _controller.CollectionFolder;
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
        if (_controller.SummaryText.Length > 0) msg += $"\n{_controller.SummaryText}";
        if (_controller.Skipped > 0) msg += $"\nPominięto {_controller.Skipped}. {_controller.LastProblem}";
        ShowProblem(msg);
    }

    public void ShowProblem(string? text)
    {
        ProblemText.Text = text ?? "";
        ProblemText.Visibility = string.IsNullOrEmpty(text) ? Visibility.Collapsed : Visibility.Visible;
    }

    private void RefreshUi()
    {
        var stage = _controller.Stage;
        bool running = _controller.IsRunning;

        StartButton.IsEnabled = !running;
        bool parking = stage.Phase is RobotPhase.Returning or RobotPhase.Docking or RobotPhase.Emptying or RobotPhase.Charging;
        bool midCycle = stage.ReturningToEmpty || stage.Phase == RobotPhase.Charging; // przerwa na opróżnienie – „Do bazy” kończy sprzątanie
        TargetBox.IsEnabled = !running;
        PauseButton.IsEnabled = running && !parking;
        StopButton.IsEnabled = running && (!parking || midCycle) && !stage.StopRequested;
        UndoButton.IsEnabled = !running;
        PauseButton.Content = stage.Paused ? "Wznów" : "Pauza";

        BatteryFill.Width = Math.Max(0, BatteryTrack.ActualWidth * stage.Battery / 100);
        BatteryText.Text = $"{stage.Battery:0}%";
        BinFill.Width = Math.Max(0, BinTrack.ActualWidth * stage.BinLevel);
        BinText.Text = stage.BinCount > 0 || stage.BinLevel <= 0
            ? $"{stage.BinLevel * 100:0}% · {stage.BinCount}/{stage.BinCapacity}"
            : $"{stage.BinLevel * 100:0}%";

        CountText.Text = _controller.Collected.ToString();
        CountSub.Text = _controller.Total > 0 ? $"z {_controller.Total} elementów" : "zebranych elementów";
        SizeText.Text = Collector.FormatSize(_controller.CollectedBytes);

        StatusText.Text = stage.Paused ? "Pauza" : stage.Phase switch
        {
            RobotPhase.Docked => "W stacji dokującej",
            RobotPhase.Undocking => "Wyjeżdżam ze stacji…",
            RobotPhase.Scanning => "Skanuję pulpity lidarem…",
            RobotPhase.Cleaning => $"Sprzątam pulpit – zostało {stage.Items.Count(i => i.State == ItemState.Discovered)}",
            RobotPhase.FolderApproach => $"Jadę do folderu „{stage.PortalTitle}”…",
            RobotPhase.FolderWork => $"Porządkuję „{stage.PortalTitle}”…",
            RobotPhase.Returning => stage.ReturningToEmpty ? "Pojemnik pełny – wracam do bazy…" : "Wracam do bazy…",
            RobotPhase.Docking => "Parkuję w stacji…",
            RobotPhase.Emptying => "Stacja opróżnia pojemnik…",
            RobotPhase.Charging => "Ładuję baterię – zaraz wracam do sprzątania…",
            RobotPhase.Done => stage.Battery < 100 ? "Ładuję się – pulpit czysty ✨" : "Pulpit czysty ✨",
            _ => "",
        };
        if (running && _controller.IsBackgroundRun) StatusText.Text += " (w tle)";

        Map.InvalidateVisual();
    }
}
