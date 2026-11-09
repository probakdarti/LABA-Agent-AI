using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using static DeskVac.Native.NativeMethods;

namespace DeskVac.Native;

/// <summary>Małe ikony plików/skrótów/folderów (takie jak w Eksploratorze) – do listy chronionych.</summary>
public static class FileIcons
{
    public static BitmapSource? Small(string path)
    {
        try
        {
            var info = new SHFILEINFO();
            if (SHGetFileInfoPath(path, 0, ref info, (uint)Marshal.SizeOf<SHFILEINFO>(), SHGFI_ICON | SHGFI_SMALLICON) == IntPtr.Zero
                || info.hIcon == IntPtr.Zero)
                return null;
            try
            {
                var bmp = Imaging.CreateBitmapSourceFromHIcon(info.hIcon, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
                bmp.Freeze();
                return bmp;
            }
            finally
            {
                DestroyIcon(info.hIcon);
            }
        }
        catch (Exception)
        {
            return null;
        }
    }
}
