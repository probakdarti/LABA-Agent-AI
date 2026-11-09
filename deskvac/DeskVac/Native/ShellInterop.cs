using System.Runtime.InteropServices;

namespace DeskVac.Native;

// Deklaracje COM / Win32 potrzebne do odczytu i ustawiania pozycji ikon pulpitu.
// Kolejność metod w interfejsach COM musi dokładnie odpowiadać vtable z nagłówków Windows SDK
// (shobjidl_core.h, exdisp.h, commoncontrols.h) – metody "Unused*" tylko zajmują sloty.

[StructLayout(LayoutKind.Sequential)]
public struct POINT
{
    public int X;
    public int Y;
    public POINT(int x, int y) { X = x; Y = y; }
}

[ComImport, Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85"), InterfaceType(ComInterfaceType.InterfaceIsDual)]
internal interface IShellWindows
{
    void Unused_get_Count();
    void Unused_Item();
    void Unused_NewEnum();
    void Unused_Register();
    void Unused_RegisterPending();
    void Unused_Revoke();
    void Unused_OnNavigate();
    void Unused_OnActivated();

    [PreserveSig]
    int FindWindowSW(
        [MarshalAs(UnmanagedType.Struct)] ref object pvarLoc,
        [MarshalAs(UnmanagedType.Struct)] ref object pvarLocRoot,
        int swClass,
        out int phwnd,
        int swfwOptions,
        [MarshalAs(UnmanagedType.IDispatch)] out object? ppdispOut);
}

[ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IComServiceProvider
{
    [PreserveSig]
    int QueryService(ref Guid guidService, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object? ppvObject);
}

[ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellBrowser
{
    void Unused_GetWindow();
    void Unused_ContextSensitiveHelp();
    void Unused_InsertMenusSB();
    void Unused_SetMenuSB();
    void Unused_RemoveMenusSB();
    void Unused_SetStatusTextSB();
    void Unused_EnableModelessSB();
    void Unused_TranslateAcceleratorSB();
    void Unused_BrowseObject();
    void Unused_GetViewStateStream();
    void Unused_GetControlWindow();
    void Unused_SendControlMsg();

    [PreserveSig]
    int QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object? ppshv);
}

[ComImport, Guid("00000114-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IOleWindow
{
    [PreserveSig] int GetWindow(out IntPtr phwnd);
    [PreserveSig] int ContextSensitiveHelp([MarshalAs(UnmanagedType.Bool)] bool fEnterMode);
}

/// <summary>IShellView – używamy tylko GetWindow (pierwsza metoda, odziedziczona po IOleWindow).</summary>
[ComImport, Guid("000214E3-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IShellView
{
    [PreserveSig] int GetWindow(out IntPtr phwnd);
}

[ComImport, Guid("CDE725B0-CCC9-4519-917E-325D72FAB4CE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IFolderView
{
    [PreserveSig] int GetCurrentViewMode(out uint pViewMode);
    [PreserveSig] int SetCurrentViewMode(uint viewMode);
    [PreserveSig] int GetFolder(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object? ppv);
    [PreserveSig] int Item(int iItemIndex, out IntPtr ppidl);
    [PreserveSig] int ItemCount(uint uFlags, out int pcItems);
    [PreserveSig] int Items(uint uFlags, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object? ppv);
    [PreserveSig] int GetSelectionMarkedItem(out int piItem);
    [PreserveSig] int GetFocusedItem(out int piItem);
    [PreserveSig] int GetItemPosition(IntPtr pidl, out POINT ppt);
    [PreserveSig] int GetSpacing(out POINT ppt);
    [PreserveSig] int GetDefaultSpacing(out POINT ppt);
    [PreserveSig] int GetAutoArrange();
    [PreserveSig] int SelectItem(int iItem, uint dwFlags);
    [PreserveSig]
    int SelectAndPositionItems(
        uint cidl,
        [MarshalAs(UnmanagedType.LPArray)] IntPtr[] apidl,
        [MarshalAs(UnmanagedType.LPArray)] POINT[] apt,
        uint dwFlags);
}

[ComImport, Guid("46EB5926-582E-4017-9FDF-E8998DAA0950"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IImageList
{
    void Unused_Add();
    void Unused_ReplaceIcon();
    void Unused_SetOverlayImage();
    void Unused_Replace();
    void Unused_AddMasked();
    void Unused_Draw();
    void Unused_Remove();

    [PreserveSig]
    int GetIcon(int i, int flags, out IntPtr picon);
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
internal struct SHFILEINFO
{
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
}

internal static class NativeMethods
{
    public static readonly Guid CLSID_ShellWindows = new("9BA05972-F6A8-11CF-A442-00A0C90A8F39");
    public static Guid SID_STopLevelBrowser = new("4C96BE40-915C-11CF-99D3-00AA004AE837");
    public static Guid IID_IShellBrowser = typeof(IShellBrowser).GUID;
    public static Guid IID_IImageList = typeof(IImageList).GUID;

    public const int CSIDL_DESKTOP = 0x0000;
    public const int SWC_DESKTOP = 0x00000008;
    public const int SWFO_NEEDDISPATCH = 0x00000001;
    public const uint SVGIO_ALLVIEW = 0x00000002;
    public const uint SVSI_POSITIONITEM = 0x00000080;
    public const uint SVSI_DESELECTOTHERS = 0x00000004;

    public const uint SIGDN_NORMALDISPLAY = 0x00000000;
    public const uint SIGDN_FILESYSPATH = 0x80058000;

    public const uint SHGFI_SYSICONINDEX = 0x000004000;
    public const uint SHGFI_PIDL = 0x000000008;
    public const int SHIL_EXTRALARGE = 0x2;
    public const int SHIL_JUMBO = 0x4;
    public const int ILD_TRANSPARENT = 0x00000001;

    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TRANSPARENT = 0x00000020;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_LAYERED = 0x00080000;
    public const int WS_EX_NOACTIVATE = 0x08000000;

    public const int SM_XVIRTUALSCREEN = 76;
    public const int SM_YVIRTUALSCREEN = 77;

    public const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SHGetNameFromIDList(IntPtr pidl, uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SHParseDisplayName(string pszName, IntPtr pbc, out IntPtr ppidl, uint sfgaoIn, out uint psfgaoOut);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SHGetFileInfo(IntPtr pidl, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("shell32.dll")]
    public static extern int SHGetImageList(int iImageList, ref Guid riid, out IImageList ppv);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string? lpszClass, string? lpszWindow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("dwmapi.dll")]
    public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    public static void CoTaskMemFree(IntPtr p)
    {
        if (p != IntPtr.Zero) Marshal.FreeCoTaskMem(p);
    }
}
