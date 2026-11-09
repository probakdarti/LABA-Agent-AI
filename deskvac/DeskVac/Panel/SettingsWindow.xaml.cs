using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using DeskVac.Core;
using DeskVac.Native;
using DeskVac.Platform;
using Microsoft.Win32;

namespace DeskVac.Panel;

public partial class SettingsWindow : Window
{
    private static readonly (DayOfWeek Day, string Label)[] Days =
    {
        (DayOfWeek.Monday, "Pn"), (DayOfWeek.Tuesday, "Wt"), (DayOfWeek.Wednesday, "Śr"), (DayOfWeek.Thursday, "Cz"),
        (DayOfWeek.Friday, "Pt"), (DayOfWeek.Saturday, "So"), (DayOfWeek.Sunday, "Nd"),
    };

    private readonly AppSettings _settings;
    private readonly CleaningController _controller;
    private readonly List<string> _times = new();
    private readonly double _origOffsetX, _origOffsetY;
    private bool _saved;

    public SettingsWindow(AppSettings settings, CleaningController controller)
    {
        InitializeComponent();
        _settings = settings;
        _controller = controller;
        SourceInitialized += (_, _) =>
        {
            int on = 1;
            try { NativeMethods.DwmSetWindowAttribute(new WindowInteropHelper(this).Handle, NativeMethods.DWMWA_USE_IMMERSIVE_DARK_MODE, ref on, sizeof(int)); }
            catch (Exception) { /* jasny pasek */ }
        };
        _origOffsetX = settings.OffsetX;
        _origOffsetY = settings.OffsetY;
        // „Test namierzania” zmienia przesunięcie na próbę – bez „Zapisz” wracamy do poprzedniego
        Closed += (_, _) =>
        {
            if (_saved) return;
            _settings.OffsetX = _origOffsetX;
            _settings.OffsetY = _origOffsetY;
        };
        Load();
        ProtectedList.DragEnter += OnProtectDragOver;
        ProtectedList.DragOver += OnProtectDragOver;
        ProtectedList.Drop += OnProtectDrop;
        ProtectedList.KeyDown += (_, e) => { if (e.Key == System.Windows.Input.Key.Delete) OnRemoveProtected(this, new RoutedEventArgs()); };
    }

    private void Load()
    {
        AutostartBox.IsChecked = _settings.StartWithWindows;
        CloseToTrayBox.IsChecked = _settings.CloseToTray;
        ShowRobotBox.IsChecked = _settings.ShowRobotOnDesktop;
        QuickAllBox.IsChecked = _settings.QuickCleanIncludesFolders;
        AboutVersion.Text = $"{AppInfo.Product} {AppInfo.Version} – robot-odkurzacz pulpitu i folderów Windows";
        AboutCopyright.Text = $"{AppInfo.Copyright}. Wszelkie prawa zastrzeżone.";
        RenderFolders();

        RemindStartupBox.IsChecked = _settings.RemindOnStartup;
        StartupDelayBox.Text = _settings.StartupDelayMinutes.ToString();
        RemindDailyBox.IsChecked = _settings.RemindDaily;
        _times.Clear();
        _times.AddRange(_settings.ReminderTimes);
        RenderTimes();
        FillDays(ReminderDaysPanel, _settings.ReminderDays);
        MinItemsBox.Text = _settings.MinItemsToRemind.ToString();

        AutoCleanBox.IsChecked = _settings.AutoCleanEnabled;
        AutoTimeBox.Text = _settings.AutoCleanTime;
        FillDays(AutoDaysPanel, _settings.AutoCleanDays);
        AutoQuietBox.IsChecked = _settings.AutoCleanQuiet;

        SortByTypeBox.IsChecked = _settings.SortByType;
        SortByTopicBox.IsChecked = _settings.SortByTopic;
        SortByTopicBox.IsEnabled = _settings.SortByType;
        SortByTypeBox.Click += (_, _) => SortByTopicBox.IsEnabled = SortByTypeBox.IsChecked == true;

        ReloadProtected();
        ExclusionsBox.Text = string.Join(", ", _settings.Exclusions);
        MenuOnlyDesktopBox.IsChecked = _settings.ContextMenuOnlyOnDesktop;

        OffsetXBox.Text = _settings.OffsetX.ToString(CultureInfo.InvariantCulture);
        OffsetYBox.Text = _settings.OffsetY.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Odświeża listę chronionych (np. po zmianie z menu kontekstowego).</summary>
    public void ReloadProtected()
    {
        ProtectedList.Items.Clear();
        foreach (var p in _settings.ProtectedPaths.OrderBy(Path.GetFileName, StringComparer.CurrentCultureIgnoreCase))
            ProtectedList.Items.Add(MakeRow(p));
        ProtectedEmpty.Visibility = ProtectedList.Items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    /// <summary>Wiersz listy: ikona, nazwa, ścieżka (wyszarzona, gdy elementu już nie ma na dysku).</summary>
    private ListBoxItem MakeRow(string path)
    {
        bool exists = File.Exists(path) || Directory.Exists(path);
        var name = Path.GetFileName(path.TrimEnd('\\'));
        if (name.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".url", StringComparison.OrdinalIgnoreCase))
            name = Path.GetFileNameWithoutExtension(name);

        var row = new DockPanel { Margin = new Thickness(2, 3, 2, 3), Opacity = exists ? 1 : 0.5 };
        var icon = new System.Windows.Controls.Image { Width = 16, Height = 16, Margin = new Thickness(0, 0, 8, 0), Source = FileIcons.Small(path) };
        DockPanel.SetDock(icon, Dock.Left);
        row.Children.Add(icon);
        var text = new StackPanel();
        text.Children.Add(new TextBlock { Text = exists ? name : name + "  (nie ma już na dysku)", FontWeight = FontWeights.SemiBold });
        text.Children.Add(new TextBlock
        {
            Text = path,
            FontSize = 11,
            Foreground = (System.Windows.Media.Brush)FindResource("Muted"),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        row.Children.Add(text);
        return new ListBoxItem { Content = row, Tag = path, ToolTip = path };
    }

    private void OnProtectDragOver(object sender, DragEventArgs e)
    {
        // „Łącze” – Eksplorator nie kopiuje ani nie przenosi pliku, my tylko zapamiętujemy ścieżkę
        e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Link : DragDropEffects.None;
        e.Handled = true;
    }

    private void OnProtectDrop(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(DataFormats.FileDrop) is string[] paths)
            ((App)Application.Current).SetProtected(paths, true, notify: false);
        e.Effects = DragDropEffects.Link;
        e.Handled = true;
    }

    private static void FillDays(WrapPanel panel, List<DayOfWeek> selected)
    {
        panel.Children.Clear();
        foreach (var (day, label) in Days)
            panel.Children.Add(new CheckBox { Content = label, Tag = day, IsChecked = selected.Contains(day), Margin = new Thickness(0, 0, 12, 4) });
    }

    private static List<DayOfWeek> ReadDays(WrapPanel panel) =>
        panel.Children.OfType<CheckBox>().Where(c => c.IsChecked == true).Select(c => (DayOfWeek)c.Tag).ToList();

    private void RenderTimes()
    {
        TimesPanel.Children.Clear();
        foreach (var t in _times.OrderBy(x => AppSettings.TryParseTime(x, out var ts) ? ts : TimeSpan.Zero))
        {
            var chip = new Button
            {
                Content = $"{t}   ✕",
                Style = (Style)FindResource("PillButton"),
                Padding = new Thickness(10, 4, 10, 4),
                Margin = new Thickness(0, 0, 6, 6),
                ToolTip = "Kliknij, aby usunąć",
                Tag = t,
            };
            chip.Click += (_, _) => { _times.Remove((string)chip.Tag); RenderTimes(); };
            TimesPanel.Children.Add(chip);
        }
        if (_times.Count == 0)
            TimesPanel.Children.Add(new TextBlock { Text = "(brak godzin)", Foreground = (System.Windows.Media.Brush)FindResource("Muted") });
    }

    private void OnAddTime(object sender, RoutedEventArgs e)
    {
        if (!AppSettings.TryParseTime(NewTimeBox.Text, out var ts))
        {
            SaveInfo.Text = "Wpisz godzinę w formacie GG:MM, np. 9:30 albo 16:00.";
            return;
        }
        var text = $"{(int)ts.TotalHours:00}:{ts.Minutes:00}";
        if (!_times.Contains(text)) _times.Add(text);
        RenderTimes();
        SaveInfo.Text = "";
    }

    private void OnAddFile(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFileDialog
        {
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Multiselect = true,
            DereferenceLinks = false, // skrót ma zostać skrótem, a nie programem, na który wskazuje
            Title = "Wybierz elementy, których robot ma nie ruszać",
        };
        if (dlg.ShowDialog(this) != true) return;
        ((App)Application.Current).SetProtected(dlg.FileNames, true, notify: false);
    }

    private void OnAddFolder(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFolderDialog
        {
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Multiselect = true,
            Title = "Wybierz foldery, których robot ma nie ruszać",
        };
        if (dlg.ShowDialog(this) != true) return;
        ((App)Application.Current).SetProtected(dlg.FolderNames, true, notify: false);
    }

    private void OnRemoveProtected(object sender, RoutedEventArgs e)
    {
        var paths = ProtectedList.SelectedItems.Cast<ListBoxItem>().Select(i => (string)i.Tag).ToList();
        if (paths.Count == 0)
        {
            SaveInfo.Text = "Zaznacz na liście elementy, które robot może znowu odkurzać.";
            return;
        }
        ((App)Application.Current).SetProtected(paths, false, notify: false);
    }

    private void OnTestReminder(object sender, RoutedEventArgs e)
    {
        int n;
        try { n = _controller.CountCleanable(); }
        catch (Exception) { n = 0; }
        Notifications.Reminder(Math.Max(n, 1));
    }

    private void OnPreview(object sender, RoutedEventArgs e)
    {
        if (!ApplyOffsets()) return;
        try
        {
            int n = _controller.PreviewTargets();
            SaveInfo.Text = $"Ramki wokół {n} ikon przez 6 s – sprawdź, czy pasują.";
        }
        catch (Exception ex)
        {
            SaveInfo.Text = ex.Message;
        }
    }

    private bool ApplyOffsets()
    {
        if (!double.TryParse(OffsetXBox.Text.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var x) ||
            !double.TryParse(OffsetYBox.Text.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var y))
        {
            SaveInfo.Text = "Przesunięcie musi być liczbą (np. -4 albo 0).";
            return false;
        }
        _settings.OffsetX = Math.Clamp(x, -200, 200);
        _settings.OffsetY = Math.Clamp(y, -200, 200);
        return true;
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        if (!int.TryParse(StartupDelayBox.Text, out var delay) || delay < 0 || delay > 120)
        {
            SaveInfo.Text = "Opóźnienie po starcie: liczba minut od 0 do 120.";
            return;
        }
        if (!int.TryParse(MinItemsBox.Text, out var minItems) || minItems < 1)
        {
            SaveInfo.Text = "Minimalna liczba elementów musi być ≥ 1.";
            return;
        }
        if (!AppSettings.TryParseTime(AutoTimeBox.Text, out var autoTs))
        {
            SaveInfo.Text = "Godzina sprzątania automatycznego w formacie GG:MM.";
            return;
        }
        if (!ApplyOffsets()) return;

        _settings.StartWithWindows = AutostartBox.IsChecked == true;
        _settings.CloseToTray = CloseToTrayBox.IsChecked == true;
        _settings.ShowRobotOnDesktop = ShowRobotBox.IsChecked == true;
        _settings.QuickCleanIncludesFolders = QuickAllBox.IsChecked == true;

        _settings.RemindOnStartup = RemindStartupBox.IsChecked == true;
        _settings.StartupDelayMinutes = delay;
        _settings.RemindDaily = RemindDailyBox.IsChecked == true;
        _settings.ReminderTimes = _times.Distinct().ToList();
        _settings.ReminderDays = ReadDays(ReminderDaysPanel);
        _settings.MinItemsToRemind = minItems;

        _settings.AutoCleanEnabled = AutoCleanBox.IsChecked == true;
        _settings.AutoCleanTime = $"{(int)autoTs.TotalHours:00}:{autoTs.Minutes:00}";
        _settings.AutoCleanDays = ReadDays(AutoDaysPanel);
        _settings.AutoCleanQuiet = AutoQuietBox.IsChecked == true;
        _settings.SortByType = SortByTypeBox.IsChecked == true;
        _settings.SortByTopic = SortByTopicBox.IsChecked == true;

        _settings.Exclusions = ExclusionsBox.Text
            .Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        _settings.ContextMenuOnlyOnDesktop = MenuOnlyDesktopBox.IsChecked == true;

        _saved = true;
        _settings.Save();
        ShellIntegration.Sync(_settings);
        _controller.UpdateWidgetVisibility();
        Close();
    }

    private void OnCancel(object sender, RoutedEventArgs e) => Close();

    private void OnLink(object sender, System.Windows.Navigation.RequestNavigateEventArgs e)
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(e.Uri.AbsoluteUri) { UseShellExecute = true }); }
        catch (Exception) { /* brak programu pocztowego */ }
        e.Handled = true;
    }

    /// <summary>Przewija do sekcji „O programie”.</summary>
    public void ShowAbout() => AboutVersion.BringIntoView();

    // ------------------------------------------------------------------ sprzątane foldery (zmiany od razu)

    private static App AppRef => (App)Application.Current;

    public void RenderFolders()
    {
        FoldersPanel.Children.Clear();
        if (_settings.Folders.Count == 0)
        {
            FoldersPanel.Children.Add(new TextBlock { Text = "Brak – dodaj folder przyciskami poniżej.", Foreground = (System.Windows.Media.Brush)FindResource("Muted"), Margin = new Thickness(0, 0, 0, 6) });
            return;
        }
        foreach (var job in _settings.Folders.ToList())
        {
            var row = new StackPanel();
            var title = new DockPanel();
            var icon = new System.Windows.Controls.Image { Width = 16, Height = 16, Margin = new Thickness(0, 0, 8, 0), Source = FileIcons.Small(job.Path) };
            DockPanel.SetDock(icon, Dock.Left);
            title.Children.Add(icon);
            title.Children.Add(new TextBlock
            {
                Text = job.DisplayName + (job.Enabled ? "" : "  (wyłączony)") + (Directory.Exists(job.Path) ? "" : "  (nie istnieje)"),
                FontWeight = FontWeights.SemiBold,
                Opacity = job.Enabled ? 1 : 0.55,
            });
            row.Children.Add(title);
            row.Children.Add(new TextBlock
            {
                Text = $"{job.Path}\nHarmonogram: {job.ScheduleText} · pomija pliki młodsze niż {FolderPreviewWindow.AgeText(job.MinAgeHours)}"
                       + (job.DetectDuplicates ? " · duplikaty" : "") + (job.MoveLooseFolders ? " · podfoldery → Foldery" : ""),
                FontSize = 11,
                Foreground = (System.Windows.Media.Brush)FindResource("Muted"),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(24, 2, 0, 6),
            });
            var buttons = new WrapPanel { Margin = new Thickness(24, 0, 0, 0) };
            var j = job;
            buttons.Children.Add(Ui.Button("Ustawienia…", (_, _) => AppRef.EditFolder(j)));
            buttons.Children.Add(Ui.Button("Podgląd", (_, _) => AppRef.ShowFolderPreview(j, startAfter: true)));
            buttons.Children.Add(Ui.Button("Sprzątaj teraz", (_, _) => AppRef.StartTarget(j.Id)));
            buttons.Children.Add(Ui.Button("Usuń z listy", (_, _) =>
            {
                _settings.Folders.Remove(j);
                AppRef.OnFoldersChanged();
            }));
            foreach (var b in buttons.Children.OfType<Button>()) { b.Padding = new Thickness(10, 4, 10, 4); b.Margin = new Thickness(0, 0, 6, 6); b.FontSize = 12; }
            row.Children.Add(buttons);
            FoldersPanel.Children.Add(new Border
            {
                Child = row,
                Padding = new Thickness(10, 8, 10, 4),
                Margin = new Thickness(0, 0, 0, 8),
                CornerRadius = new CornerRadius(10),
                Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x12, 0x16, 0x1B)),
            });
        }
    }

    private void AddFolder(string path)
    {
        if (KnownFolders.WhyForbidden(path) is { } why)
        {
            SaveInfo.Text = why;
            return;
        }
        if (_settings.FindFolder(path) is { } existing)
        {
            SaveInfo.Text = $"„{existing.DisplayName}” już jest na liście.";
            return;
        }
        var job = FolderJob.ForPath(path);
        _settings.Folders.Add(job);
        AppRef.OnFoldersChanged();
        AppRef.EditFolder(job);
    }

    private void OnAddDownloads(object sender, RoutedEventArgs e) => AddFolder(KnownFolders.Downloads);
    private void OnAddDocuments(object sender, RoutedEventArgs e) => AddFolder(KnownFolders.Documents);
    private void OnAddPictures(object sender, RoutedEventArgs e) => AddFolder(KnownFolders.Pictures);

    private void OnAddOtherFolder(object sender, RoutedEventArgs e)
    {
        var dlg = new OpenFolderDialog { Title = "Wybierz folder, który robot ma sprzątać", Multiselect = false };
        if (dlg.ShowDialog(this) == true) AddFolder(dlg.FolderName);
    }

    private void OnReorganize(object sender, RoutedEventArgs e)
    {
        if (_controller.IsRunning)
        {
            SaveInfo.Text = "Poczekaj, aż robot skończy sprzątanie.";
            return;
        }
        // sortujemy wg tego, co jest zaznaczone teraz (nawet bez „Zapisz”)
        var temp = new AppSettings
        {
            CollectionFolderName = _settings.CollectionFolderName,
            SortByType = true,
            SortByTopic = SortByTopicBox.IsChecked == true,
        };
        Cursor = System.Windows.Input.Cursors.Wait;
        try
        {
            int n = Collector.ReorganizeDateFolders(temp, out int failed);
            SaveInfo.Text = n == 0 && failed == 0
                ? "Nie ma folderów z datami do posortowania."
                : $"Posortowano {n} {Notifications.Plural(n)}." + (failed > 0 ? $" Nie udało się: {failed} (plik otwarty?)." : "");
        }
        finally
        {
            Cursor = null;
        }
    }
}
