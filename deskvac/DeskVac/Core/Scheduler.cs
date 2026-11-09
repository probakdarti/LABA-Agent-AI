using System.Text.Json;
using System.Windows.Threading;

namespace DeskVac.Core;

/// <summary>Stan harmonogramu zapisywany na dysku (żeby restart nie dublował powiadomień).</summary>
public sealed class SchedulerState
{
    public Dictionary<string, DateTime> Fired { get; set; } = new();
    public DateTime? SnoozeUntil { get; set; }
    public DateTime? SkipDate { get; set; }

    private static string FilePath => Path.Combine(AppPaths.DataDir, "state.json");

    public static SchedulerState Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<SchedulerState>(File.ReadAllText(FilePath)) ?? new SchedulerState();
        }
        catch (Exception)
        {
            // uszkodzony – zaczynamy od nowa
        }
        return new SchedulerState();
    }

    public void Save()
    {
        try
        {
            // stare wpisy nie są potrzebne
            foreach (var k in Fired.Where(kv => kv.Value < DateTime.Now.AddDays(-3)).Select(kv => kv.Key).ToList())
                Fired.Remove(k);
            Directory.CreateDirectory(AppPaths.DataDir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this));
        }
        catch (Exception)
        {
            // brak zapisu – najwyżej powtórzy się powiadomienie
        }
    }
}

/// <summary>
/// Przypomnienia (po starcie komputera, o wybranych godzinach, „za godzinę”) i sprzątanie automatyczne.
/// Sprawdza co 30 s. Przegapione godziny (komputer uśpiony) nadrabia, jeśli minęło mniej niż 60 min.
/// </summary>
public sealed class Scheduler
{
    private static readonly TimeSpan Grace = TimeSpan.FromMinutes(60);

    private readonly AppSettings _settings;
    private readonly SchedulerState _state = SchedulerState.Load();
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(30) };
    private readonly DateTime _startedAt = DateTime.Now;
    private bool _startupDone;

    /// <summary>Przypomnienie: zwraca liczbę elementów do sprzątnięcia (do treści powiadomienia).</summary>
    public required Func<int> CountItems { get; init; }
    public required Action<int> ShowReminder { get; init; }
    /// <summary>Uruchamia sprzątanie automatyczne; zwraca false, gdy teraz się nie da (np. robot już jedzie).</summary>
    public required Func<bool> StartAutoClean { get; init; }
    /// <summary>Czy użytkownik jest zajęty (prezentacja, gra, pełny ekran) – wtedy przesuwamy sprzątanie.</summary>
    public required Func<bool> UserBusy { get; init; }

    public Scheduler(AppSettings settings, bool launchedAtLogon)
    {
        _settings = settings;
        _startupDone = !launchedAtLogon; // „po uruchomieniu komputera” = start z autostartu
        _timer.Tick += (_, _) => Tick();
    }

    public void Start()
    {
        _timer.Start();
        Tick();
    }

    public void Snooze(TimeSpan delay)
    {
        _state.SnoozeUntil = DateTime.Now + delay;
        _state.Save();
    }

    public void SkipToday()
    {
        _state.SkipDate = DateTime.Today;
        _state.SnoozeUntil = null;
        _state.Save();
    }

    private void Tick()
    {
        var now = DateTime.Now;
        bool skipToday = _state.SkipDate == DateTime.Today;

        // --- sprzątanie automatyczne ---
        if (_settings.AutoCleanEnabled && _settings.AutoCleanDays.Contains(now.DayOfWeek) &&
            AppSettings.TryParseTime(_settings.AutoCleanTime, out var autoTime))
        {
            var slot = DateTime.Today + autoTime;
            var key = "auto " + slot.ToString("yyyy-MM-dd HH:mm");
            if (now >= slot && now - slot < Grace && !_state.Fired.ContainsKey(key))
            {
                if (!UserBusy() && StartAutoClean())
                {
                    _state.Fired[key] = now;
                    _state.Save();
                }
                return; // zajęty – spróbujemy przy następnym sprawdzeniu
            }
        }

        if (skipToday) return;

        // --- „przypomnij za godzinę” ---
        if (_state.SnoozeUntil is { } until && now >= until)
        {
            _state.SnoozeUntil = null;
            _state.Save();
            Remind(force: true);
            return;
        }

        // --- po uruchomieniu komputera ---
        if (!_startupDone && _settings.RemindOnStartup &&
            now - _startedAt >= TimeSpan.FromMinutes(Math.Max(0, _settings.StartupDelayMinutes)))
        {
            _startupDone = true;
            Remind(force: false);
            return;
        }

        // --- o wybranych godzinach ---
        if (!_settings.RemindDaily || !_settings.ReminderDays.Contains(now.DayOfWeek)) return;
        foreach (var t in _settings.ReminderTimes)
        {
            if (!AppSettings.TryParseTime(t, out var time)) continue;
            var slot = DateTime.Today + time;
            var key = "remind " + slot.ToString("yyyy-MM-dd HH:mm");
            if (now >= slot && now - slot < Grace && !_state.Fired.ContainsKey(key))
            {
                _state.Fired[key] = now;
                _state.Save();
                Remind(force: false);
                return;
            }
        }
    }

    private void Remind(bool force)
    {
        int count;
        try
        {
            count = CountItems();
        }
        catch (Exception)
        {
            return;
        }
        if (count == 0) return;
        if (!force && count < _settings.MinItemsToRemind) return;
        ShowReminder(count);
    }
}
