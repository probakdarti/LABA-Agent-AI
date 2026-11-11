using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;

namespace DeskVac.Core;

/// <summary>
/// Ikona folderu „Zebrane z pulpitu” (stacja dokująca z pojemnikiem) – standardowy mechanizm Windows:
/// ukryty desktop.ini + ukryta ikona w samym folderze (zostaje po odinstalowaniu DeskVac, synchronizuje się z OneDrive).
/// </summary>
public static class FolderIcon
{
    public const string IconFile = "DeskVac.ico";
    private const string IniFile = "desktop.ini";

    private const string IniContent =
        "[.ShellClassInfo]\r\nIconResource=" + IconFile + ",0\r\nInfoTip=Tu robot DeskVac odkłada to, co zebrał z pulpitu.\r\n";

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern void SHChangeNotify(int wEventId, uint uFlags, string? dwItem1, IntPtr dwItem2);

    private const int SHCNE_UPDATEITEM = 0x00002000;
    private const uint SHCNF_PATHW = 0x0005;

    /// <summary>Nadaje ikonę, jeśli jej brak (bezpieczne do wołania wielokrotnie).</summary>
    public static void Ensure(string folder)
    {
        try
        {
            if (!Directory.Exists(folder)) return;
            bool changed = false;

            var ico = Path.Combine(folder, IconFile);
            if (!File.Exists(ico))
            {
                using var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("DeskVac.ZebraneFolder.ico");
                if (res is null) return;
                using (var fs = File.Create(ico)) res.CopyTo(fs);
                File.SetAttributes(ico, FileAttributes.Hidden | FileAttributes.System);
                changed = true;
            }

            var ini = Path.Combine(folder, IniFile);
            if (!File.Exists(ini) || File.ReadAllText(ini) != IniContent)
            {
                if (File.Exists(ini)) File.SetAttributes(ini, FileAttributes.Normal);
                File.WriteAllText(ini, IniContent, Encoding.Unicode); // Windows czyta desktop.ini w UTF-16 (polskie znaki)
                File.SetAttributes(ini, FileAttributes.Hidden | FileAttributes.System);
                changed = true;
            }

            // atrybut „tylko do odczytu” na FOLDERZE każe Eksploratorowi czytać desktop.ini (nie blokuje plików w środku)
            var di = new DirectoryInfo(folder);
            if ((di.Attributes & FileAttributes.ReadOnly) == 0)
            {
                di.Attributes |= FileAttributes.ReadOnly;
                changed = true;
            }

            if (changed) SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, folder, IntPtr.Zero);
        }
        catch (Exception)
        {
            // bez ikony – folder działa normalnie
        }
    }

    /// <summary>Folder bez niczego poza naszym desktop.ini i ikoną.</summary>
    public static bool IsEffectivelyEmpty(string folder) =>
        Directory.Exists(folder) &&
        !Directory.EnumerateFileSystemEntries(folder)
            .Select(Path.GetFileName)
            .Any(n => !string.Equals(n, IniFile, StringComparison.OrdinalIgnoreCase) && !string.Equals(n, IconFile, StringComparison.OrdinalIgnoreCase));

    /// <summary>Usuwa folder, gdy w środku zostały tylko pliki ikony. Zwraca true, jeśli usunięto.</summary>
    public static bool DeleteIfEmpty(string folder)
    {
        try
        {
            if (!IsEffectivelyEmpty(folder)) return false;
            foreach (var f in new[] { IniFile, IconFile }.Select(n => Path.Combine(folder, n)).Where(File.Exists))
            {
                File.SetAttributes(f, FileAttributes.Normal);
                File.Delete(f);
            }
            var di = new DirectoryInfo(folder);
            di.Attributes &= ~FileAttributes.ReadOnly;
            di.Delete();
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
