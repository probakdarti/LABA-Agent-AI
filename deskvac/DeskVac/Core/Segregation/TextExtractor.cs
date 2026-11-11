using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using UglyToad.PdfPig;

namespace DeskVac.Core.Segregation;

/// <summary>Wynik odczytu: tekst (może być pusty) i czy użyto OCR.</summary>
public sealed record ExtractResult(bool Ok, string Text, bool UsedOcr, string? Error);

/// <summary>
/// Odczyt tekstu z dokumentów – tylko czytanie, nic nie jest uruchamiane (żadnych makr, żadnego Office).
/// PDF: warstwa tekstowa (PdfPig), a gdy jej brak – OCR wbudowany w Windows na pierwszych stronach.
/// Office Open XML / OpenDocument: bezpośrednio z XML w archiwum. Zdjęcia: OCR Windows.
/// Działa w osobnym procesie roboczym (patrz SegregationWorker) – uszkodzony plik nie zawiesi DeskVac.
/// </summary>
public static class TextExtractor
{
    public const int MaxChars = 20_000;            // wystarczy do klasyfikacji
    public const long MaxFileBytes = 30L * 1024 * 1024;
    private const int MaxPages = 3;
    private const long MaxXmlBytes = 4L * 1024 * 1024; // ochrona przed „bombami zip”

    public static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".docx", ".docm", ".dotx", ".xlsx", ".xlsm", ".pptx", ".pptm", ".odt", ".ods", ".odp",
        ".txt", ".csv", ".md", ".log", ".rtf", ".eml", ".htm", ".html", ".xml", ".json",
        ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff",
    };

    public static ExtractResult Extract(string path, bool allowOcr)
    {
        try
        {
            var info = new FileInfo(path);
            if (!info.Exists) return new(false, "", false, "brak pliku");
            if (info.Length > MaxFileBytes) return new(false, "", false, "plik za duży");
            var ext = info.Extension.ToLowerInvariant();

            switch (ext)
            {
                case ".pdf":
                {
                    var text = PdfText(path);
                    if (text.Trim().Length >= 40 || !allowOcr) return new(true, Clip(text), false, null);
                    // skan bez warstwy tekstowej → OCR
                    var ocr = WindowsOcr.PdfPages(path, MaxPages);
                    return new(true, Clip(ocr), true, null);
                }
                case ".docx" or ".docm" or ".dotx":
                    return new(true, Clip(ZipXmlText(path, e => e == "word/document.xml", "t")), false, null);
                case ".xlsx" or ".xlsm":
                    return new(true, Clip(ZipXmlText(path, e => e == "xl/sharedStrings.xml", "t")), false, null);
                case ".pptx" or ".pptm":
                    return new(true, Clip(ZipXmlText(path, e => e.StartsWith("ppt/slides/slide") && e.EndsWith(".xml"), "t")), false, null);
                case ".odt" or ".ods" or ".odp":
                    return new(true, Clip(ZipXmlText(path, e => e == "content.xml", null)), false, null);
                case ".rtf":
                    return new(true, Clip(StripRtf(ReadTextHead(path))), false, null);
                case ".htm" or ".html" or ".xml":
                    return new(true, Clip(Regex.Replace(ReadTextHead(path), "<[^>]+>", " ")), false, null);
                case ".jpg" or ".jpeg" or ".png" or ".bmp" or ".tif" or ".tiff":
                    return allowOcr ? new(true, Clip(WindowsOcr.Image(path)), true, null) : new(false, "", false, "OCR wyłączony");
                default:
                    return new(true, Clip(ReadTextHead(path)), false, null);
            }
        }
        catch (Exception ex)
        {
            // zaszyfrowany PDF, uszkodzony plik itp. – plik zostaje, gdzie był
            return new(false, "", false, ex.GetType().Name + ": " + ex.Message);
        }
    }

    private static string PdfText(string path)
    {
        var sb = new StringBuilder();
        using var doc = PdfDocument.Open(path, new ParsingOptions { UseLenientParsing = true });
        int pages = Math.Min(doc.NumberOfPages, MaxPages);
        for (int i = 1; i <= pages && sb.Length < MaxChars; i++)
        {
            var page = doc.GetPage(i);
            // słowa z odstępami – PdfPig.Text skleja czasem wyrazy bez spacji
            foreach (var w in page.GetWords())
            {
                sb.Append(w.Text).Append(' ');
                if (sb.Length >= MaxChars) break;
            }
            sb.Append('\n');
        }
        return sb.ToString();
    }

    /// <summary>Tekst z elementów XML w archiwum (np. &lt;w:t&gt; w Wordzie). localName=null → cały tekst.</summary>
    private static string ZipXmlText(string path, Func<string, bool> entryFilter, string? localName)
    {
        var sb = new StringBuilder();
        using var zip = ZipFile.OpenRead(path);
        foreach (var entry in zip.Entries.Where(e => entryFilter(e.FullName.Replace('\\', '/'))).OrderBy(e => e.FullName).Take(20))
        {
            if (entry.Length > MaxXmlBytes) continue;
            using var stream = entry.Open();
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,   // bez zewnętrznych encji (XXE)
                XmlResolver = null,
                IgnoreComments = true,
            });
            while (reader.Read() && sb.Length < MaxChars)
            {
                if (reader.NodeType == XmlNodeType.Element && localName is not null && reader.LocalName == localName)
                {
                    sb.Append(reader.ReadElementContentAsString()).Append(' ');
                }
                else if (localName is null && reader.NodeType is XmlNodeType.Text or XmlNodeType.SignificantWhitespace)
                {
                    sb.Append(reader.Value).Append(' ');
                }
                else if (reader.NodeType == XmlNodeType.EndElement && reader.LocalName is "p" or "row" or "si")
                {
                    sb.Append('\n');
                }
            }
        }
        return sb.ToString();
    }

    /// <summary>Początek pliku tekstowego: UTF-8, a gdy to nie UTF-8 – polska strona kodowa Windows-1250.</summary>
    private static string ReadTextHead(string path)
    {
        var buffer = new byte[64 * 1024];
        int n;
        using (var fs = File.OpenRead(path)) n = fs.Read(buffer, 0, buffer.Length);
        try
        {
            return new UTF8Encoding(false, true).GetString(buffer, 0, n);
        }
        catch (DecoderFallbackException)
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            return Encoding.GetEncoding(1250).GetString(buffer, 0, n);
        }
    }

    private static string StripRtf(string rtf) =>
        Regex.Replace(Regex.Replace(rtf, @"\\'[0-9a-f]{2}|\\[a-z]+-?\d* ?|[{}]", " ", RegexOptions.IgnoreCase), @"\s+", " ");

    private static string Clip(string s) => s.Length <= MaxChars ? s : s[..MaxChars];
}
