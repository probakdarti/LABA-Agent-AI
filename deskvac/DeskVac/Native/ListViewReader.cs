using System.Runtime.InteropServices;
using static DeskVac.Native.NativeMethods;

namespace DeskVac.Native;

/// <summary>
/// Dokładne prostokąty ikon pulpitu: wysyłamy do listview Explorera LVM_GETITEMRECT (LVIR_ICON).
/// Wynik trafia do pamięci procesu Explorera, więc rezerwujemy tam bufor i go odczytujemy.
/// Elementy dopasowujemy do IFolderView po pozycji (obie strony używają tych samych współrzędnych).
/// </summary>
internal static class ListViewReader
{
    /// <summary>Mapa: pozycja elementu (LVM_GETITEMPOSITION) → prostokąt ikony, w układzie klienta listview (px).</summary>
    public static Dictionary<(int X, int Y), RECT>? ReadIconRects(IntPtr listView)
    {
        if (listView == IntPtr.Zero) return null;
        GetWindowThreadProcessId(listView, out var pid);
        if (pid == 0) return null;

        var proc = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, false, pid);
        if (proc == IntPtr.Zero) return null;

        var size = (UIntPtr)Marshal.SizeOf<RECT>();
        var remote = VirtualAllocEx(proc, IntPtr.Zero, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        if (remote == IntPtr.Zero)
        {
            CloseHandle(proc);
            return null;
        }

        try
        {
            int count = (int)SendMessage(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
            var map = new Dictionary<(int, int), RECT>();
            for (int i = 0; i < count; i++)
            {
                // pozycja elementu
                if (SendMessage(listView, LVM_GETITEMPOSITION, (IntPtr)i, remote) == IntPtr.Zero) continue;
                if (!ReadProcessMemory(proc, remote, out POINT pos, (UIntPtr)Marshal.SizeOf<POINT>(), out _)) continue;

                // prostokąt samej ikony
                var req = new RECT { Left = LVIR_ICON };
                if (!WriteProcessMemory(proc, remote, ref req, size, out _)) continue;
                if (SendMessage(listView, LVM_GETITEMRECT, (IntPtr)i, remote) == IntPtr.Zero) continue;
                if (!ReadProcessMemory(proc, remote, out RECT rect, size, out _)) continue;

                map[(pos.X, pos.Y)] = rect;
            }
            return map;
        }
        catch (Exception)
        {
            return null;
        }
        finally
        {
            VirtualFreeEx(proc, remote, UIntPtr.Zero, MEM_RELEASE);
            CloseHandle(proc);
        }
    }
}
