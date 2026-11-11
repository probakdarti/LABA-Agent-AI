using System.IO.Compression;
using System.Text;

namespace DeskVac.Tests;

/// <summary>Tymczasowy folder testowy poza AppData (tam DeskVac celowo niczego nie sprząta).</summary>
public sealed class TempRoot : IDisposable
{
    public string Path { get; }

    public TempRoot()
    {
        Path = System.IO.Path.Combine(System.IO.Path.GetPathRoot(Environment.SystemDirectory)!, "DeskVacTests", Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(Path);
    }

    public string File(string relative, string content, int ageDays = 30)
    {
        var full = Combine(relative);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(full)!);
        System.IO.File.WriteAllText(full, content);
        Age(full, ageDays);
        return full;
    }

    public string Bytes(string relative, byte[] content, int ageDays = 30)
    {
        var full = Combine(relative);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(full)!);
        System.IO.File.WriteAllBytes(full, content);
        Age(full, ageDays);
        return full;
    }

    public string Combine(string relative) => System.IO.Path.Combine(Path, relative.Replace('/', '\\'));

    public static void Age(string file, int days)
    {
        var t = DateTime.Now.AddDays(-days);
        System.IO.File.SetCreationTime(file, t);
        System.IO.File.SetLastWriteTime(file, t);
    }

    public void Dispose()
    {
        try
        {
            foreach (var f in Directory.EnumerateFileSystemEntries(Path, "*", SearchOption.AllDirectories))
                System.IO.File.SetAttributes(f, FileAttributes.Normal);
            new DirectoryInfo(Path).Attributes = FileAttributes.Directory;
            Directory.Delete(Path, true);
        }
        catch (Exception)
        {
            // sprzątanie po teście nie może psuć wyniku
        }
    }
}

public static class Samples
{
    public const string Invoice = "FAKTURA VAT nr FS 80/08/2026 Data wystawienia 2026-08-31 Sprzedawca: ACME NIP 123-456-78-90 Nabywca: Jan Kowalski Razem do zaplaty: 1230 PLN Termin platnosci 14 dni";
    public const string Contract = "UMOWA O SWIADCZENIE USLUG zawarta w dniu 12 pazdziernika 2026 pomiedzy ACME, zwana dalej Zamawiajacym, a XYZ, zwana dalej Wykonawca. § 1 Przedmiot umowy. Postanowienia koncowe.";

    /// <summary>Plik Word (.docx) z podanymi akapitami.</summary>
    public static byte[] Docx(params string[] paragraphs)
    {
        var xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>");
        foreach (var p in paragraphs) xml.Append("<w:p><w:r><w:t>").Append(System.Security.SecurityElement.Escape(p)).Append("</w:t></w:r></w:p>");
        xml.Append("</w:body></w:document>");
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
        {
            using var w = new StreamWriter(zip.CreateEntry("word/document.xml").Open(), new UTF8Encoding(false));
            w.Write(xml.ToString());
        }
        return ms.ToArray();
    }

    /// <summary>Minimalny PDF z warstwą tekstową (Helvetica, tekst ASCII).</summary>
    public static byte[] Pdf(string text)
    {
        var content = $"BT /F1 11 Tf 40 760 Td ({text.Replace("(", "").Replace(")", "")}) Tj ET";
        var objs = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2000 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            $"<< /Length {content.Length} >>\nstream\n{content}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        };
        var sb = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int>();
        for (int i = 0; i < objs.Length; i++)
        {
            offsets.Add(Encoding.ASCII.GetByteCount(sb.ToString()));
            sb.Append($"{i + 1} 0 obj\n{objs[i]}\nendobj\n");
        }
        int xref = Encoding.ASCII.GetByteCount(sb.ToString());
        sb.Append($"xref\n0 {objs.Length + 1}\n0000000000 65535 f \n");
        foreach (var o in offsets) sb.Append($"{o:D10} 00000 n \n");
        sb.Append($"trailer\n<< /Size {objs.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(sb.ToString());
    }
}
