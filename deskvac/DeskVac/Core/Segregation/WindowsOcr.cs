using System.Text;
using Windows.Data.Pdf;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;

namespace DeskVac.Core.Segregation;

/// <summary>
/// OCR wbudowany w Windows 10/11 (Windows.Media.Ocr) – offline, bez dodatkowych plików i bez opłat.
/// Strony PDF renderuje systemowy Windows.Data.Pdf. Język: polski, a gdy go brak – języki z profilu użytkownika.
/// </summary>
public static class WindowsOcr
{
    private static OcrEngine? _engine;

    /// <summary>Czy OCR jest dostępny i dla jakiego języka (do informacji w ustawieniach).</summary>
    public static string Status()
    {
        try
        {
            var e = Engine();
            if (e is null) return "OCR niedostępny – doinstaluj język w Ustawieniach Windows (Czas i język → Język i region).";
            return e.RecognizerLanguage.LanguageTag.StartsWith("pl", StringComparison.OrdinalIgnoreCase)
                ? "OCR Windows gotowy (język polski)."
                : $"OCR Windows gotowy, ale bez języka polskiego (używam: {e.RecognizerLanguage.DisplayName}). Polskie znaki mogą być gorzej rozpoznawane.";
        }
        catch (Exception ex)
        {
            return "OCR niedostępny: " + ex.Message;
        }
    }

    private static OcrEngine? Engine()
    {
        if (_engine is not null) return _engine;
        var pl = new Language("pl");
        _engine = OcrEngine.IsLanguageSupported(pl) ? OcrEngine.TryCreateFromLanguage(pl) : OcrEngine.TryCreateFromUserProfileLanguages();
        return _engine;
    }

    public static string Image(string path)
    {
        var engine = Engine();
        if (engine is null) return "";
        var file = StorageFile.GetFileFromPathAsync(path).AsTask().GetAwaiter().GetResult();
        using var stream = file.OpenAsync(FileAccessMode.Read).AsTask().GetAwaiter().GetResult();
        return Recognize(engine, stream);
    }

    public static string PdfPages(string path, int maxPages)
    {
        var engine = Engine();
        if (engine is null) return "";
        var file = StorageFile.GetFileFromPathAsync(path).AsTask().GetAwaiter().GetResult();
        var pdf = PdfDocument.LoadFromFileAsync(file).AsTask().GetAwaiter().GetResult();
        var sb = new StringBuilder();
        for (uint i = 0; i < Math.Min(pdf.PageCount, (uint)maxPages); i++)
        {
            using var page = pdf.GetPage(i);
            using var ms = new InMemoryRandomAccessStream();
            // szerokość dobrana pod OCR (czytelnie, a poniżej limitu rozmiaru obrazu silnika)
            var width = (uint)Math.Min(OcrEngine.MaxImageDimension, 1800);
            page.RenderToStreamAsync(ms, new PdfPageRenderOptions { DestinationWidth = width }).AsTask().GetAwaiter().GetResult();
            ms.Seek(0);
            sb.AppendLine(Recognize(engine, ms));
        }
        return sb.ToString();
    }

    private static string Recognize(OcrEngine engine, IRandomAccessStream stream)
    {
        var decoder = BitmapDecoder.CreateAsync(stream).AsTask().GetAwaiter().GetResult();
        // zbyt duże zdjęcia zmniejszamy do limitu silnika
        double scale = Math.Min(1.0, (double)OcrEngine.MaxImageDimension / Math.Max(decoder.PixelWidth, decoder.PixelHeight));
        var transform = new BitmapTransform
        {
            ScaledWidth = (uint)Math.Max(1, decoder.PixelWidth * scale),
            ScaledHeight = (uint)Math.Max(1, decoder.PixelHeight * scale),
        };
        using var bitmap = decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied, transform,
            ExifOrientationMode.RespectExifOrientation, ColorManagementMode.DoNotColorManage).AsTask().GetAwaiter().GetResult();
        var result = engine.RecognizeAsync(bitmap).AsTask().GetAwaiter().GetResult();
        return result.Text;
    }
}
