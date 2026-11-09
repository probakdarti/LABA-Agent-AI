using System.Windows;
using System.Windows.Automation;

namespace DeskVac.Native;

/// <summary>
/// Prostokąty ikon pulpitu przez UI Automation – oficjalny interfejs ułatwień dostępu (ten sam, którego używają
/// czytniki ekranu). Nie zagląda do pamięci Eksploratora, więc programy antywirusowe nie widzą tu nic podejrzanego.
/// </summary>
internal static class DesktopUia
{
    /// <summary>Nazwa i prostokąt (fizyczne px ekranu) każdego elementu listy pulpitu.</summary>
    public static List<(string Name, Rect Bounds)> ReadItems(IntPtr listView)
    {
        var result = new List<(string, Rect)>();
        if (listView == IntPtr.Zero) return result;
        try
        {
            var list = AutomationElement.FromHandle(listView);
            var items = list.FindAll(TreeScope.Children,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem));
            foreach (AutomationElement item in items)
            {
                try
                {
                    var r = item.Current.BoundingRectangle;
                    if (r.IsEmpty || r.Width <= 0 || r.Height <= 0) continue;
                    result.Add((item.Current.Name ?? "", r));
                }
                catch (ElementNotAvailableException)
                {
                    // ikona zniknęła w trakcie odczytu
                }
            }
        }
        catch (Exception)
        {
            // UI Automation niedostępne – zostaje pozycja wyliczona z siatki
        }
        return result;
    }
}
