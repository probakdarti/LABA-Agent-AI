using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using static DeskVac.Native.NativeMethods;

namespace DeskVac.Native;

/// <summary>Jedna ikona odczytana z widoku pulpitu (współrzędne fizyczne, w układzie listview pulpitu).</summary>
/// <param name="IconRect">Dokładny prostokąt ikony na ekranie (fizyczne px), jeśli udało się go odczytać z Explorera.</param>
public sealed record RawDesktopIcon(string Name, string? FileSystemPath, POINT Position, BitmapSource? Icon, Rect? IconRect);

/// <summary>
/// Dostęp do widoku folderu pulpitu (to, co rysuje Explorer) przez oficjalne API powłoki:
/// IShellWindows → IShellBrowser → IShellView → IFolderView.
/// Wszystkie wywołania muszą iść z wątku STA (wątek UI aplikacji WPF).
/// </summary>
public sealed class DesktopView
{
    private readonly IFolderView _view;
    private readonly IntPtr _listView;
    private IImageList? _imageList;
    private readonly Dictionary<int, BitmapSource?> _iconCache = new();

    private DesktopView(IFolderView view, IntPtr listView)
    {
        _view = view;
        _listView = listView;
    }

    public static DesktopView Open()
    {
        var type = Type.GetTypeFromCLSID(CLSID_ShellWindows)
                   ?? throw new InvalidOperationException("Brak klasy ShellWindows.");
        var shellWindows = (IShellWindows)(Activator.CreateInstance(type)
                   ?? throw new InvalidOperationException("Nie udało się utworzyć ShellWindows."));

        object loc = CSIDL_DESKTOP;
        object root = null!; // VT_EMPTY
        int hr = shellWindows.FindWindowSW(ref loc, ref root, SWC_DESKTOP, out _, SWFO_NEEDDISPATCH, out var disp);
        if (hr != 0 || disp is null)
            throw new InvalidOperationException("Nie znaleziono okna pulpitu (czy Eksplorator Windows działa?).");

        var sp = (IComServiceProvider)disp;
        var sid = SID_STopLevelBrowser;
        var iid = IID_IShellBrowser;
        Marshal.ThrowExceptionForHR(sp.QueryService(ref sid, ref iid, out var browserObj));
        var browser = (IShellBrowser)browserObj!;

        Marshal.ThrowExceptionForHR(browser.QueryActiveShellView(out var viewObj));
        var folderView = (IFolderView)viewObj!;

        var listView = IntPtr.Zero;
        try
        {
            if (((IShellView)viewObj!).GetWindow(out var defView) == 0 && defView != IntPtr.Zero)
                listView = FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
        }
        catch (Exception)
        {
            // niektóre wersje Explorera nie udostępniają tego przez COM – szukamy okna klasycznie niżej
        }
        if (listView == IntPtr.Zero) listView = FindDesktopListView();

        return new DesktopView(folderView, listView);
    }

    /// <summary>Okno z ikonami pulpitu: Progman lub WorkerW → SHELLDLL_DefView → SysListView32.</summary>
    private static IntPtr FindDesktopListView()
    {
        var defView = FindWindowEx(FindWindow("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);
        var worker = IntPtr.Zero;
        while (defView == IntPtr.Zero)
        {
            worker = FindWindowEx(IntPtr.Zero, worker, "WorkerW", null);
            if (worker == IntPtr.Zero) break;
            defView = FindWindowEx(worker, IntPtr.Zero, "SHELLDLL_DefView", null);
        }
        return defView == IntPtr.Zero ? IntPtr.Zero : FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
    }

    /// <summary>Lewy górny róg obszaru ikon pulpitu w fizycznych współrzędnych ekranu.</summary>
    public POINT ListOriginOnScreen
    {
        get
        {
            // bez okna listy przyjmujemy, że obszar ikon zaczyna się w (0,0) monitora głównego
            var p = new POINT(0, 0);
            if (_listView != IntPtr.Zero) ClientToScreen(_listView, ref p);
            return p;
        }
    }

    public bool AutoArrange => _view.GetAutoArrange() == 0; // S_OK = włączone

    public POINT Spacing
    {
        get
        {
            if (_view.GetSpacing(out var pt) != 0 || pt.X <= 0) _view.GetDefaultSpacing(out pt);
            return pt;
        }
    }

    public List<RawDesktopIcon> ReadIcons(bool withIcons, bool exactRects = true)
    {
        var result = new List<RawDesktopIcon>();
        if (_view.ItemCount(SVGIO_ALLVIEW, out int count) != 0) return result;

        for (int i = 0; i < count; i++)
        {
            if (_view.Item(i, out var pidl) != 0 || pidl == IntPtr.Zero) continue;
            try
            {
                _view.GetItemPosition(pidl, out var pos);
                // Pulpit jest korzeniem przestrzeni nazw, więc PIDL dziecka jest jednocześnie absolutny.
                SHGetNameFromIDList(pidl, SIGDN_NORMALDISPLAY, out var name);
                string? path = SHGetNameFromIDList(pidl, SIGDN_FILESYSPATH, out var p) == 0 ? p : null;
                var icon = withIcons ? GetIcon(pidl) : null;
                result.Add(new RawDesktopIcon(name ?? "", path, pos, icon, null));
            }
            catch (COMException)
            {
                // pojedynczy element nie do odczytania – pomijamy
            }
            finally
            {
                CoTaskMemFree(pidl);
            }
        }
        return exactRects ? AttachExactRects(result) : result;
    }

    /// <summary>
    /// Uzupełnia ikony o prostokąty z UI Automation. Dopasowanie: ta sama nazwa i najbliżej pozycji z IFolderView
    /// (dwie ikony mogą mieć tę samą nazwę, np. „Raport.lnk” i „Raport.url”).
    /// </summary>
    private List<RawDesktopIcon> AttachExactRects(List<RawDesktopIcon> icons)
    {
        var uia = DesktopUia.ReadItems(_listView);
        if (uia.Count == 0) return icons;
        var origin = ListOriginOnScreen;
        var used = new HashSet<int>();

        return icons.Select(ic =>
        {
            var guess = new Point(origin.X + ic.Position.X, origin.Y + ic.Position.Y);
            int best = -1;
            double bestDist = double.MaxValue;
            for (int i = 0; i < uia.Count; i++)
            {
                if (used.Contains(i) || !string.Equals(uia[i].Name, ic.Name, StringComparison.CurrentCultureIgnoreCase)) continue;
                var b = uia[i].Bounds;
                double d = Math.Abs(b.X - guess.X) + Math.Abs(b.Y - guess.Y);
                if (d < bestDist) { bestDist = d; best = i; }
            }
            if (best < 0) return ic;
            used.Add(best);
            return ic with { IconRect = uia[best].Bounds };
        }).ToList();
    }

    /// <summary>Ustawia pozycję ikony o podanej ścieżce (np. po cofnięciu sprzątania). Zwraca false, jeśli ikona jeszcze nie istnieje.</summary>
    public bool PositionItem(string fileSystemPath, POINT position)
    {
        if (_view.ItemCount(SVGIO_ALLVIEW, out int count) != 0) return false;
        for (int i = 0; i < count; i++)
        {
            if (_view.Item(i, out var pidl) != 0 || pidl == IntPtr.Zero) continue;
            try
            {
                if (SHGetNameFromIDList(pidl, SIGDN_FILESYSPATH, out var path) == 0 &&
                    string.Equals(path, fileSystemPath, StringComparison.OrdinalIgnoreCase))
                {
                    return _view.SelectAndPositionItems(1, new[] { pidl }, new[] { position }, SVSI_POSITIONITEM) == 0;
                }
            }
            finally
            {
                CoTaskMemFree(pidl);
            }
        }
        return false;
    }

    private BitmapSource? GetIcon(IntPtr pidl)
    {
        var info = new SHFILEINFO();
        if (SHGetFileInfo(pidl, 0, ref info, (uint)Marshal.SizeOf<SHFILEINFO>(), SHGFI_PIDL | SHGFI_SYSICONINDEX) == IntPtr.Zero)
            return null;
        if (_iconCache.TryGetValue(info.iIcon, out var cached)) return cached;

        BitmapSource? bmp = null;
        try
        {
            if (_imageList is null)
            {
                var iid = IID_IImageList;
                SHGetImageList(SHIL_EXTRALARGE, ref iid, out var list);
                _imageList = list;
            }
            if (_imageList.GetIcon(info.iIcon, ILD_TRANSPARENT, out var hIcon) == 0 && hIcon != IntPtr.Zero)
            {
                try
                {
                    bmp = Imaging.CreateBitmapSourceFromHIcon(hIcon, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
                    bmp.Freeze();
                }
                finally
                {
                    DestroyIcon(hIcon);
                }
            }
        }
        catch (Exception)
        {
            bmp = null;
        }
        _iconCache[info.iIcon] = bmp;
        return bmp;
    }
}
