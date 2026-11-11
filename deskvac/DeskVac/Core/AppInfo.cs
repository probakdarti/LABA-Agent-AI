using System.Reflection;

namespace DeskVac.Core;

/// <summary>Dane programu i autora (okno „O programie”, stopka panelu, instalator).</summary>
public static class AppInfo
{
    public const string Product = "DeskVac";
    public const string Author = "VERME Paweł Robak";
    public const string Email = "pawelrobak@outlook.com";
    public const string Phone = "504 706 334";
    public const string PhoneUri = "tel:+48504706334";

    /// <summary>Kanał wydania wyświetlany przy numerze wersji.</summary>
    public const string Channel = "beta";

    public static string Version
    {
        get
        {
            var v = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                    ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "";
            var plus = v.IndexOf('+');
            var ver = plus > 0 ? v[..plus] : v; // bez skrótu commita
            return string.IsNullOrEmpty(Channel) ? ver : $"{ver} {Channel}";
        }
    }

    public static string Copyright => $"© {DateTime.Now.Year} {Author}";
}
