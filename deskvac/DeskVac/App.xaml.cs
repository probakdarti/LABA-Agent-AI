using System.Windows;
using System.Windows.Threading;

namespace DeskVac;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += OnUnhandled;
        base.OnStartup(e);
    }

    private static void OnUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        MessageBox.Show(e.Exception.Message, "DeskVac – błąd", MessageBoxButton.OK, MessageBoxImage.Warning);
        e.Handled = true;
    }
}
