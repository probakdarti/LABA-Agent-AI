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
    }

    private void Load()
    {
        AutostartBox.IsChecked = _settings.StartWithWindows;
        CloseToTrayBox.IsChecked = _settings.CloseToTray;
        ShowRobotBox.IsChecked = _settings.ShowRobotOnDesktop;

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

        ProtectedList.Items.Clear();
        foreach (var p in _settings.ProtectedPaths) ProtectedList.Items.Add(p);
        ExclusionsBox.Text = string.Join(", ", _settings.Exclusions);
        MenuOnlyDesktopBox.IsChecked = _settings.ContextMenuOnlyOnDesktop;

        OffsetXBox.Text = _settings.OffsetX.ToString(CultureInfo.InvariantCulture);
        OffsetYBox.Text = _settings.OffsetY.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Odświeża listę chronionych (np. po zmianie z menu kontekstowego).</summary>
    public void ReloadProtected()
    {
        ProtectedList.Items.Clear();
        foreach (var p in _settings.ProtectedPaths) ProtectedList.Items.Add(p);
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
        foreach (var f in dlg.FileNames)
            if (!ProtectedList.Items.Contains(f)) ProtectedList.Items.Add(f);
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
        foreach (var f in dlg.FolderNames)
            if (!ProtectedList.Items.Contains(f)) ProtectedList.Items.Add(f);
    }

    private void OnRemoveProtected(object sender, RoutedEventArgs e)
    {
        foreach (var item in ProtectedList.SelectedItems.Cast<object>().ToList())
            ProtectedList.Items.Remove(item);
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

        _settings.ProtectedPaths = ProtectedList.Items.Cast<string>().ToList();
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
}
