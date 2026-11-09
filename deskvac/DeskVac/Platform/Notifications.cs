using Microsoft.Toolkit.Uwp.Notifications;

namespace DeskVac.Platform;

/// <summary>Natywne powiadomienia Windows z przyciskami. Kliknięcie przycisku przychodzi jako akcja (patrz App.HandleToast).</summary>
public static class Notifications
{
    public const string ActionClean = "clean";
    public const string ActionSnooze = "snooze";
    public const string ActionSkipToday = "skipToday";
    public const string ActionStop = "stop";
    public const string ActionUndo = "undo";
    public const string ActionOpenFolder = "openFolder";
    public const string ActionShow = "show";

    public static void Reminder(int count)
    {
        Try(() => new ToastContentBuilder()
            .AddArgument("action", ActionShow)
            .AddText($"🧹 Na pulpicie leży {count} {Plural(count)} do sprzątania")
            .AddText("Wypuścić robota?")
            .AddButton(new ToastButton().SetContent("Posprzątaj teraz").AddArgument("action", ActionClean))
            .AddButton(new ToastButton().SetContent("Za godzinę").AddArgument("action", ActionSnooze))
            .AddButton(new ToastButton().SetContent("Nie dziś").AddArgument("action", ActionSkipToday))
            .Show());
    }

    public static void AutoCleanStarted(int count)
    {
        Try(() => new ToastContentBuilder()
            .AddArgument("action", ActionShow)
            .AddText("🤖 Robot ruszył na sprzątanie pulpitu")
            .AddText($"Zbiera {count} {Plural(count)} w tle – możesz spokojnie pracować dalej.")
            .AddButton(new ToastButton().SetContent("Zatrzymaj").AddArgument("action", ActionStop))
            .Show(t => t.ExpirationTime = DateTimeOffset.Now.AddMinutes(10)));
    }

    public static void Finished(int collected, int skipped, string? problem, string summary = "")
    {
        var text = skipped > 0 ? $"Pominięto {skipped}. {problem}" : "Wszystko leży w folderze „Zebrane z pulpitu”.";
        if (summary.Length > 0) text = summary + "\n" + text;
        Try(() => new ToastContentBuilder()
            .AddArgument("action", ActionShow)
            .AddText($"✨ Posprzątane: {collected} {Plural(collected)}")
            .AddText(text)
            .AddButton(new ToastButton().SetContent("Otwórz folder").AddArgument("action", ActionOpenFolder))
            .AddButton(new ToastButton().SetContent("Cofnij").AddArgument("action", ActionUndo))
            .Show());
    }

    public static void Info(string title, string text)
    {
        Try(() => new ToastContentBuilder()
            .AddArgument("action", ActionShow)
            .AddText(title)
            .AddText(text)
            .Show(t => t.ExpirationTime = DateTimeOffset.Now.AddMinutes(5)));
    }

    /// <summary>Usuwa rejestrację powiadomień (deinstalacja).</summary>
    public static void Uninstall() => Try(ToastNotificationManagerCompat.Uninstall);

    public static string Plural(int n)
    {
        if (n == 1) return "element";
        int last = n % 10, lastTwo = n % 100;
        return last is >= 2 and <= 4 && lastTwo is < 12 or > 14 ? "elementy" : "elementów";
    }

    private static void Try(Action a)
    {
        try
        {
            a();
        }
        catch (Exception)
        {
            // powiadomienia wyłączone w systemie – trudno
        }
    }
}
