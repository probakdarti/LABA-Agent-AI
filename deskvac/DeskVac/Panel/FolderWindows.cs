using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Interop;
using System.Windows.Media;
using DeskVac.Core;
using DeskVac.Native;
using DeskVac.Platform;

namespace DeskVac.Panel;

/// <summary>Wspólne „klocki” ciemnego interfejsu dla okien budowanych w kodzie.</summary>
internal static class Ui
{
    public static Brush Res(string key) => (Brush)Application.Current.FindResource(key);

    public static void DarkWindow(Window w, string title, double width, double height)
    {
        w.Title = title;
        w.Width = width;
        w.Height = height;
        w.Background = Res("Bg");
        w.Foreground = Res("Text");
        w.FontFamily = new FontFamily("Segoe UI Variable Display, Segoe UI");
        w.UseLayoutRounding = true;
        w.WindowStartupLocation = WindowStartupLocation.CenterScreen;
        w.SourceInitialized += (_, _) =>
        {
            int on = 1;
            try { NativeMethods.DwmSetWindowAttribute(new WindowInteropHelper(w).Handle, NativeMethods.DWMWA_USE_IMMERSIVE_DARK_MODE, ref on, sizeof(int)); }
            catch (Exception) { /* jasny pasek */ }
        };
    }

    public static Border Card(UIElement content) => new()
    {
        Background = Res("Card"),
        BorderBrush = Res("CardBorder"),
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(12),
        Padding = new Thickness(16, 14, 16, 14),
        Margin = new Thickness(0, 0, 0, 12),
        Child = content,
    };

    public static TextBlock Header(string text) => new() { Text = text, FontSize = 15, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 10) };

    public static TextBlock Hint(string text) => new()
    {
        Text = text, Foreground = Res("Muted"), FontSize = 12, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 8),
    };

    public static Button Button(string text, RoutedEventHandler click, bool accent = false)
    {
        var b = new Button
        {
            Content = text,
            Style = (Style)Application.Current.FindResource(accent ? "AccentButton" : "PillButton"),
            Padding = new Thickness(12, 6, 12, 6),
            Margin = new Thickness(0, 0, 8, 0),
        };
        b.Click += click;
        return b;
    }

    public static TextBox Field(string text, double width) => new()
    {
        Text = text, Width = width, Background = new SolidColorBrush(Color.FromRgb(0x10, 0x14, 0x1A)), Foreground = Res("Text"),
        BorderBrush = new SolidColorBrush(Color.FromRgb(0x2F, 0x36, 0x40)), CaretBrush = Res("Accent"),
        Padding = new Thickness(6, 4, 6, 4), FontSize = 13, VerticalContentAlignment = VerticalAlignment.Center,
    };

    public static StackPanel Row(params UIElement[] children)
    {
        var p = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
        foreach (var c in children) p.Children.Add(c);
        return p;
    }

    public static TextBlock Label(string text) => new() { Text = text, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0) };

    public static readonly (DayOfWeek Day, string Label)[] Days =
    {
        (DayOfWeek.Monday, "Pn"), (DayOfWeek.Tuesday, "Wt"), (DayOfWeek.Wednesday, "Śr"), (DayOfWeek.Thursday, "Cz"),
        (DayOfWeek.Friday, "Pt"), (DayOfWeek.Saturday, "So"), (DayOfWeek.Sunday, "Nd"),
    };

    public static WrapPanel DaysPanel(List<DayOfWeek> selected)
    {
        var p = new WrapPanel { Margin = new Thickness(0, 0, 0, 8) };
        foreach (var (day, label) in Days)
            p.Children.Add(new CheckBox { Content = label, Tag = day, IsChecked = selected.Contains(day), Margin = new Thickness(0, 0, 12, 4) });
        return p;
    }

    public static List<DayOfWeek> ReadDays(WrapPanel p) =>
        p.Children.OfType<CheckBox>().Where(c => c.IsChecked == true).Select(c => (DayOfWeek)c.Tag).ToList();
}

/// <summary>Podgląd sprzątania folderu: co gdzie trafi. Zatwierdzenie = zgoda na sprzątanie (pierwsze sprzątanie wymaga podglądu).</summary>
public sealed class FolderPreviewWindow : Window
{
    public FolderPreviewWindow(FolderPlan plan)
    {
        Ui.DarkWindow(this, $"DeskVac – podgląd: {plan.Job.DisplayName}", 820, 640);
        var root = new DockPanel { Margin = new Thickness(18, 16, 18, 16) };

        var head = new StackPanel();
        head.Children.Add(Ui.Header($"📂 {plan.Job.DisplayName} – robot uporządkuje {plan.Moves.Count} {Notifications.Plural(plan.Moves.Count)}"));
        head.Children.Add(Ui.Hint(plan.Job.Path));
        var byCat = plan.Moves.GroupBy(m => m.Category.Split(Path.DirectorySeparatorChar)[0])
            .OrderByDescending(g => g.Count()).Select(g => $"{g.Key} {g.Count()}");
        head.Children.Add(new TextBlock { Text = string.Join("  ·  ", byCat), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 6) });
        var kept = new List<string>();
        if (plan.SkippedRecent > 0) kept.Add($"świeże (młodsze niż {AgeText(plan.Job.MinAgeHours)}): {plan.SkippedRecent}");
        if (plan.SkippedPartial > 0) kept.Add($"niedokończone pobierania: {plan.SkippedPartial}");
        if (plan.SkippedProtected > 0) kept.Add($"chronione: {plan.SkippedProtected}");
        if (plan.SkippedFolders > 0) kept.Add($"podfoldery: {plan.SkippedFolders}");
        if (kept.Count > 0) head.Children.Add(Ui.Hint("Zostają na miejscu: " + string.Join(", ", kept) + "."));
        if (plan.Duplicates > 0)
            head.Children.Add(Ui.Hint($"Duplikaty (identyczna zawartość jak inny plik) trafią do „Duplikaty”: {plan.Duplicates}. Nic nie jest usuwane."));
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 12, 0, 0) };
        buttons.Children.Add(Ui.Button("Anuluj", (_, _) => { DialogResult = false; }));
        var go = Ui.Button($"🧹  Sprzątaj ({plan.Moves.Count})", (_, _) => { DialogResult = true; }, accent: true);
        go.IsEnabled = plan.Moves.Count > 0;
        buttons.Children.Add(go);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(buttons);

        var list = new ListView
        {
            Background = new SolidColorBrush(Color.FromRgb(0x10, 0x14, 0x1A)),
            Foreground = Ui.Res("Text"),
            BorderBrush = Ui.Res("CardBorder"),
            FontSize = 12,
        };
        var grid = new GridView();
        grid.Columns.Add(new GridViewColumn { Header = "Element", Width = 380, DisplayMemberBinding = new Binding("Name") });
        grid.Columns.Add(new GridViewColumn { Header = "Trafi do", Width = 360, DisplayMemberBinding = new Binding("Target") });
        list.View = grid;
        list.ItemsSource = plan.Moves.Select(m => new
        {
            Name = (m.IsFolder ? "📁 " : "") + Path.GetFileName(m.Source),
            Target = plan.Job.DisplayName + " \\ " + m.Category.Replace("\\", " \\ "),
        }).ToList();
        root.Children.Add(list);

        Content = root;
    }

    public static string AgeText(double hours) => hours <= 0 ? "0" : hours % 24 == 0
        ? $"{hours / 24:0} {(hours / 24 == 1 ? "dzień" : "dni")}"
        : $"{hours:0.#} godz.";
}

/// <summary>Ustawienia jednego sprzątanego folderu.</summary>
public sealed class FolderJobWindow : Window
{
    private readonly FolderJob _job;
    private readonly TextBox _name, _age, _time;
    private readonly ComboBox _ageUnit, _kind;
    private readonly CheckBox _enabled, _loose, _dups;
    private readonly RadioButton? _withDesktop, _own;
    private readonly WrapPanel _days;
    private readonly TextBlock _info;
    private readonly StackPanel _ownPanel;

    public FolderJobWindow(FolderJob job)
    {
        _job = job;
        Ui.DarkWindow(this, $"DeskVac – folder: {job.DisplayName}", 560, 700);
        var stack = new StackPanel { Margin = new Thickness(18, 16, 18, 6) };

        // --- ogólne
        var general = new StackPanel();
        general.Children.Add(Ui.Header("Folder"));
        _name = Ui.Field(job.DisplayName, 240);
        general.Children.Add(Ui.Row(Ui.Label("Nazwa:"), _name));
        general.Children.Add(Ui.Hint(job.Path));
        _enabled = new CheckBox { Content = "Sprzątaj ten folder", IsChecked = job.Enabled };
        general.Children.Add(_enabled);
        stack.Children.Add(Ui.Card(general));

        // --- zasady
        var rules = new StackPanel();
        rules.Children.Add(Ui.Header("Zasady"));
        bool days = job.MinAgeHours > 0 && job.MinAgeHours % 24 == 0;
        _age = Ui.Field(days ? (job.MinAgeHours / 24).ToString(CultureInfo.InvariantCulture) : job.MinAgeHours.ToString(CultureInfo.InvariantCulture), 50);
        _ageUnit = new ComboBox { Width = 90, Margin = new Thickness(6, 0, 0, 0), ItemsSource = new[] { "godz.", "dni" }, SelectedIndex = days ? 1 : 0 };
        rules.Children.Add(Ui.Row(Ui.Label("Nie ruszaj plików młodszych niż"), _age, _ageUnit));
        rules.Children.Add(Ui.Hint("Świeżo pobrane pliki zostają na miejscu, aż „odleżą”. 0 = sprzątaj wszystko. Niedokończone pobierania (.crdownload, .part…) i pliki otwarte w programach robot zawsze pomija."));
        _loose = new CheckBox { Content = "Luźne podfoldery (np. rozpakowane archiwa) przenoś do „Foldery”", IsChecked = job.MoveLooseFolders };
        _dups = new CheckBox { Content = "Identyczne kopie plików odkładaj do „Duplikaty” (nic nie jest usuwane)", IsChecked = job.DetectDuplicates };
        rules.Children.Add(_loose);
        rules.Children.Add(_dups);
        rules.Children.Add(Ui.Hint("Twoje istniejące podfoldery kategorii (PDF, Word, Instalatory…) i chronione elementy zostają nietknięte. Pliki trafiają do podfolderów w tym samym folderze, np. " + job.DisplayName + "\\PDF\\Faktury."));
        stack.Children.Add(Ui.Card(rules));

        // --- harmonogram
        var sched = new StackPanel();
        sched.Children.Add(Ui.Header("Harmonogram"));
        if (job.IsDownloads)
        {
            _withDesktop = new RadioButton { Content = "Wspólny z pulpitem (te same przypomnienia i sprzątanie automatyczne)", IsChecked = job.Mode == FolderScheduleMode.WithDesktop, Foreground = Ui.Res("Text"), Margin = new Thickness(0, 0, 0, 6) };
            _own = new RadioButton { Content = "Własny harmonogram:", IsChecked = job.Mode == FolderScheduleMode.Own, Foreground = Ui.Res("Text"), Margin = new Thickness(0, 0, 0, 6) };
            sched.Children.Add(_withDesktop);
            sched.Children.Add(_own);
        }
        _ownPanel = new StackPanel { Margin = new Thickness(job.IsDownloads ? 22 : 0, 0, 0, 0) };
        _kind = new ComboBox { Width = 230, ItemsSource = new[] { "Tylko ręcznie", "Przypomnienie", "Sprzątanie automatyczne (bez pytania)" }, SelectedIndex = (int)job.Schedule.Kind };
        _time = Ui.Field(job.Schedule.Time, 60);
        _ownPanel.Children.Add(Ui.Row(_kind, Ui.Label("  o godzinie"), _time));
        _ownPanel.Children.Add(Ui.Hint("W dni:"));
        _days = Ui.DaysPanel(job.Schedule.Days);
        _ownPanel.Children.Add(_days);
        sched.Children.Add(_ownPanel);
        if (_withDesktop is not null)
        {
            void Sync() => _ownPanel.IsEnabled = _own!.IsChecked == true;
            _withDesktop.Checked += (_, _) => Sync();
            _own!.Checked += (_, _) => Sync();
            Sync();
        }
        stack.Children.Add(Ui.Card(sched));

        _info = new TextBlock { Foreground = Ui.Res("Warn"), FontSize = 12, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
        var bar = new DockPanel { Margin = new Thickness(18, 10, 18, 12) };
        var save = Ui.Button("Zapisz", OnSave, accent: true);
        DockPanel.SetDock(save, Dock.Right);
        var cancel = Ui.Button("Anuluj", (_, _) => DialogResult = false);
        DockPanel.SetDock(cancel, Dock.Right);
        bar.Children.Add(save);
        bar.Children.Add(cancel);
        bar.Children.Add(_info);

        var dock = new DockPanel();
        DockPanel.SetDock(bar, Dock.Bottom);
        dock.Children.Add(bar);
        dock.Children.Add(new ScrollViewer { Content = stack, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = dock;
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        if (!double.TryParse(_age.Text.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var age) || age < 0)
        {
            _info.Text = "Wiek plików: liczba ≥ 0.";
            return;
        }
        if (!AppSettings.TryParseTime(_time.Text, out var ts))
        {
            _info.Text = "Godzina w formacie GG:MM, np. 15:00.";
            return;
        }
        var days = Ui.ReadDays(_days);
        if (_kind.SelectedIndex > 0 && days.Count == 0 && (_own?.IsChecked ?? true))
        {
            _info.Text = "Zaznacz co najmniej jeden dzień.";
            return;
        }

        _job.Name = string.IsNullOrWhiteSpace(_name.Text) ? _job.DisplayName : _name.Text.Trim();
        _job.Enabled = _enabled.IsChecked == true;
        _job.MinAgeHours = _ageUnit.SelectedIndex == 1 ? age * 24 : age;
        _job.MoveLooseFolders = _loose.IsChecked == true;
        _job.DetectDuplicates = _dups.IsChecked == true;
        _job.Mode = _withDesktop?.IsChecked == true ? FolderScheduleMode.WithDesktop : FolderScheduleMode.Own;
        _job.Schedule.Kind = (FolderScheduleKind)Math.Max(0, _kind.SelectedIndex);
        _job.Schedule.Time = $"{(int)ts.TotalHours:00}:{ts.Minutes:00}";
        _job.Schedule.Days = days;
        DialogResult = true;
    }
}
