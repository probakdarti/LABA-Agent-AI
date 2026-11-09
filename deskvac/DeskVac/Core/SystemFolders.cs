using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace DeskVac.Core;

/// <summary>
/// Foldery, których robot NIGDY nie przenosi: wszystkie foldery znane Windows (Pobrane, Dokumenty, Obrazy,
/// Zrzuty ekranu, Z aparatu, Muzyka, Wideo, OneDrive…, także przeniesione przez użytkownika np. na pulpit)
/// oraz foldery, które je zawierają. Przeniesienie takiego folderu psuje ustawienia Windows.
/// </summary>
public sealed class SystemFolders
{
    private readonly HashSet<string> _paths = new(StringComparer.OrdinalIgnoreCase);

    private SystemFolders() { }

    /// <summary>Aktualny stan (liczony na początku każdego sprzątania – użytkownik mógł coś przenieść).</summary>
    public static SystemFolders Snapshot()
    {
        var s = new SystemFolders();
        s.AddKnownFolders();
        s.AddRegistry(@"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders", Registry.CurrentUser);
        s.AddRegistry(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders", Registry.CurrentUser);
        s.AddRegistry(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders", Registry.LocalMachine);
        s.AddOneDrive();
        s.Add(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
        return s;
    }

    /// <summary>Czy folder jest systemowy (sam jest folderem znanym Windows albo któryś z nich leży w środku).</summary>
    public bool IsProtected(string path)
    {
        if (!Directory.Exists(path)) return false;
        var p = Normalize(path);
        if (_paths.Contains(p)) return true;
        var prefix = p + "\\";
        if (_paths.Any(k => k.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))) return true;
        return LooksLikeShellFolder(p);
    }

    /// <summary>
    /// Foldery z systemowym desktop.ini (zlokalizowana nazwa z shell32/imageres, CLSID) – np. „Pobrane”
    /// po przeniesieniu, nawet gdy nie ma ich w rejestrze.
    /// </summary>
    private static bool LooksLikeShellFolder(string dir)
    {
        try
        {
            var ini = Path.Combine(dir, "desktop.ini");
            if (!File.Exists(ini)) return false;
            var attrs = new DirectoryInfo(dir).Attributes;
            if ((attrs & (FileAttributes.ReadOnly | FileAttributes.System)) == 0) return false;
            var text = File.ReadAllText(ini);
            return text.Contains("LocalizedResourceName=@%SystemRoot%", StringComparison.OrdinalIgnoreCase)
                   || text.Contains("shell32.dll,-21", StringComparison.OrdinalIgnoreCase)
                   || text.Contains("CLSID", StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception)
        {
            return false;
        }
    }

    private void Add(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;
        try
        {
            var expanded = Environment.ExpandEnvironmentVariables(path);
            if (!Path.IsPathRooted(expanded)) return;
            _paths.Add(Normalize(expanded));
        }
        catch (Exception)
        {
            // nieprawidłowa ścieżka w rejestrze – pomijamy
        }
    }

    private static string Normalize(string p) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(p));

    // ------------------------------------------------------------------ Known Folders (pełna lista z Windows)

    [ComImport, Guid("8BE2D872-86AA-4d47-B776-32CCA40C7018"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IKnownFolderManager
    {
        [PreserveSig] int FolderIdFromCsidl(int nCsidl, out Guid pfid);
        [PreserveSig] int FolderIdToCsidl(ref Guid rfid, out int pnCsidl);
        [PreserveSig] int GetFolderIds(out IntPtr ppKFId, ref uint pCount);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHGetKnownFolderPath(ref Guid rfid, uint flags, IntPtr token, out IntPtr path);

    private const uint KF_FLAG_DONT_VERIFY = 0x00004000;

    private void AddKnownFolders()
    {
        try
        {
            var type = Type.GetTypeFromCLSID(new Guid("4df0c730-df9d-4ae3-9153-aa6b82e9795a"));
            if (type is null || Activator.CreateInstance(type) is not IKnownFolderManager mgr) return;
            uint count = 0;
            if (mgr.GetFolderIds(out var ids, ref count) != 0 || ids == IntPtr.Zero) return;
            try
            {
                int size = Marshal.SizeOf<Guid>();
                for (int i = 0; i < count; i++)
                {
                    var id = Marshal.PtrToStructure<Guid>(ids + i * size);
                    if (SHGetKnownFolderPath(ref id, KF_FLAG_DONT_VERIFY, IntPtr.Zero, out var p) != 0) continue;
                    try { Add(Marshal.PtrToStringUni(p)); }
                    finally { Marshal.FreeCoTaskMem(p); }
                }
            }
            finally
            {
                Marshal.FreeCoTaskMem(ids);
            }
        }
        catch (Exception)
        {
            // brak menedżera – zostają wpisy z rejestru
        }
    }

    private void AddRegistry(string key, RegistryKey hive)
    {
        try
        {
            using var k = hive.OpenSubKey(key);
            if (k is null) return;
            foreach (var name in k.GetValueNames())
                Add(k.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string);
        }
        catch (Exception)
        {
            // brak dostępu
        }
    }

    private void AddOneDrive()
    {
        try
        {
            using var accounts = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\OneDrive\Accounts");
            if (accounts is null) return;
            foreach (var name in accounts.GetSubKeyNames())
            {
                using var acc = accounts.OpenSubKey(name);
                Add(acc?.GetValue("UserFolder") as string);
            }
            Add(Environment.GetEnvironmentVariable("OneDrive"));
            Add(Environment.GetEnvironmentVariable("OneDriveCommercial"));
            Add(Environment.GetEnvironmentVariable("OneDriveConsumer"));
        }
        catch (Exception)
        {
            // brak OneDrive
        }
    }
}
