using System.Windows;
using DeskVac.Core;
using DeskVac.Core.Segregation;
using DeskVac.Panel;

namespace DeskVac.Platform;

/// <summary>
/// Steruje segregacją w tle: plan (czytanie plików), podgląd przy pierwszym razie, wykonanie, postęp do panelu.
/// Działa z niskim priorytetem i nie przeszkadza w pracy ani w sprzątaniu.
/// </summary>
public sealed class SegregationService
{
    private readonly AppSettings _settings;
    private readonly CleaningController _controller;
    private CancellationTokenSource? _cts;
    private SegregationPlan? _pending;
    private string? _pendingRunId;

    public SegregationService(AppSettings settings, CleaningController controller)
    {
        _settings = settings;
        _controller = controller;
    }

    public bool Running { get; private set; }
    public int Done { get; private set; }
    public int Total { get; private set; }
    public string Status { get; private set; } = "Gotowa – kliknij „Segreguj”, by uporządkować dokumenty według treści";

    /// <summary>
    /// force – czytaj ponownie także pliki sprawdzone wcześniej; interactive – zawsze pokaż podgląd;
    /// runId – dołącz do wyjazdu robota (wspólne „Cofnij”).
    /// </summary>
    public void Start(bool force, bool interactive, string? runId)
    {
        if (Running || !_settings.SegregationEnabled) return;
        var roots = Segregator.Roots(_settings);
        if (roots.Count == 0)
        {
            Status = "Brak folderów do segregacji – najpierw posprzątaj pulpit lub dodaj folder";
            return;
        }

        Running = true;
        Done = 0;
        Total = 0;
        Status = "Przeglądam pliki…";
        _cts = new CancellationTokenSource();
        var ct = _cts.Token;
        var dispatcher = Application.Current.Dispatcher;

        Task.Run(() =>
        {
            using var seg = new Segregator(_settings);
            seg.Progress += (d, t, f) =>
            {
                Done = d;
                Total = t;
                if (f.Length > 0) Status = $"Czytam {d + 1}/{t}: {f}";
            };
            return seg.Plan(roots, force, ct);
        }, ct).ContinueWith(t => dispatcher.BeginInvoke(() =>
        {
            if (t.IsCanceled || ct.IsCancellationRequested || t.Exception?.InnerException is OperationCanceledException)
            {
                Finish("Zatrzymano");
                return;
            }
            if (t.IsFaulted)
            {
                Finish("Błąd segregacji: " + t.Exception?.InnerException?.Message);
                return;
            }
            OnPlanReady(t.Result, interactive, runId);
        }));
    }

    public void Cancel() => _cts?.Cancel();

    private void OnPlanReady(SegregationPlan plan, bool interactive, string? runId)
    {
        if (plan.Moves.Count == 0)
        {
            Finish($"Wszystko na swoim miejscu ✓ (sprawdzono {plan.Checked}, niepewnych {plan.Uncertain})");
            return;
        }

        if (!interactive && _settings.SegregationConfirmed)
        {
            Execute(plan, runId, notify: true);
            return;
        }

        if (!interactive)
        {
            // pierwszy raz w tle – czekamy na zatwierdzenie podglądu
            _pending = plan;
            _pendingRunId = runId;
            Finish($"{plan.Moves.Count} {Notifications.Plural(plan.Moves.Count)} czeka na zatwierdzenie – kliknij „Segreguj”");
            Notifications.SegregationPreview(plan.Moves.Count);
            return;
        }

        ShowPreviewAndRun(plan, runId);
    }

    /// <summary>Podgląd czekającego planu (z powiadomienia lub przycisku). Gdy brak – nowy przegląd z podglądem.</summary>
    public void ShowPending()
    {
        if (_pending is { } p)
        {
            _pending = null;
            ShowPreviewAndRun(p, _pendingRunId);
        }
        else
        {
            Start(force: false, interactive: true, runId: null);
        }
    }

    private void ShowPreviewAndRun(SegregationPlan plan, string? runId)
    {
        Running = false;
        var w = new SegregationPreviewWindow(plan);
        if (Application.Current.MainWindow is { IsVisible: true } owner) w.Owner = owner;
        if (w.ShowDialog() != true)
        {
            Finish("Anulowano – nic nie zostało przeniesione");
            return;
        }
        _settings.SegregationConfirmed = true;
        _settings.Save();
        Execute(plan, runId, notify: false);
    }

    private void Execute(SegregationPlan plan, string? runId, bool notify)
    {
        if (_controller.IsRunning)
        {
            // robot właśnie sprząta – wykonamy po powrocie do bazy
            Status = "Poczekam, aż robot skończy sprzątanie…";
            void Later()
            {
                _controller.Finished -= Later;
                Execute(plan, runId, notify);
            }
            _controller.Finished += Later;
            return;
        }

        Running = true;
        Status = $"Przenoszę {plan.Moves.Count} {Notifications.Plural(plan.Moves.Count)}…";
        var id = runId ?? Guid.NewGuid().ToString("N")[..12];
        var dispatcher = Application.Current.Dispatcher;
        Task.Run(() => Segregator.Execute(plan, id, CancellationToken.None)).ContinueWith(t => dispatcher.BeginInvoke(() =>
        {
            var (moved, failed) = t.IsCompletedSuccessfully ? t.Result : (0, plan.Moves.Count);
            var summary = string.Join(" · ", plan.Moves.GroupBy(m => m.To).OrderByDescending(g => g.Count()).Take(4).Select(g => $"{g.Key} {g.Count()}"));
            Finish($"Posegregowano {moved} {Notifications.Plural(moved)}" + (failed > 0 ? $", pominięto {failed}" : "") + " ✓");
            if (notify && moved > 0) Notifications.Info($"🗂 Segregacja: {moved} {Notifications.Plural(moved)} na swoim miejscu", summary);
        }));
    }

    private void Finish(string status)
    {
        Running = false;
        Status = status;
        Done = Total;
    }
}
