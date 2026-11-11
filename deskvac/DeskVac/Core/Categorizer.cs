using System.Globalization;
using System.Text;

namespace DeskVac.Core;

/// <summary>
/// Dzieli zebrane elementy na foldery wg typu (rozszerzenie, cel skrótu) i tematu (słowa w nazwie, wiele języków).
/// Np. „Umowa najmu 2024.docx” → „Word\Umowy”, „Faktura_FV12.pdf” → „PDF\Faktury”, „Screenshot 2026.png” → „Zdjęcia\Zrzuty ekranu”.
/// </summary>
public static class Categorizer
{
    // ------------------------------------------------------------------ typy plików

    private static readonly (string Folder, string[] Extensions)[] Types =
    {
        ("Word", new[] { ".doc", ".docx", ".docm", ".dot", ".dotx", ".dotm", ".odt", ".rtf", ".pages", ".wpd" }),
        ("Excel", new[] { ".xls", ".xlsx", ".xlsm", ".xlsb", ".xlt", ".xltx", ".xltm", ".csv", ".ods", ".numbers" }),
        ("PowerPoint", new[] { ".ppt", ".pptx", ".pptm", ".pps", ".ppsx", ".pot", ".potx", ".odp", ".key" }),
        ("PDF", new[] { ".pdf", ".xps", ".oxps" }),
        ("Teksty", new[] { ".txt", ".md", ".log", ".nfo", ".ini", ".cfg" }),
        ("Zdjęcia", new[] { ".jpg", ".jpeg", ".jfif", ".png", ".gif", ".bmp", ".webp", ".heic", ".heif", ".tif", ".tiff",
                            ".raw", ".cr2", ".cr3", ".nef", ".arw", ".dng", ".orf", ".rw2", ".ico", ".avif" }),
        ("Filmy", new[] { ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".webm", ".m4v", ".3gp", ".flv", ".mpg", ".mpeg", ".mts", ".m2ts", ".ts" }),
        ("Muzyka", new[] { ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".wma", ".opus", ".aiff", ".mid", ".midi" }),
        ("Archiwa", new[] { ".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".cab", ".iso", ".img" }),
        ("Instalatory", new[] { ".exe", ".msi", ".msix", ".msixbundle", ".appx", ".appxbundle", ".appinstaller", ".bat", ".cmd", ".ps1", ".vbs", ".reg",
                                ".apk", ".apks", ".xapk", ".aab", ".ipa" }),   // także aplikacje na telefon
        ("Niedokończone pobrania", new[] { ".crdownload", ".part", ".partial", ".download", ".opdownload", ".!ut", ".!qb", ".aria2", ".bc!", ".dlpart" }),
        ("E-maile", new[] { ".eml", ".msg", ".oft", ".pst", ".ics", ".vcf" }),
        ("Grafika i projekty", new[] { ".psd", ".ai", ".eps", ".svg", ".indd", ".xd", ".fig", ".sketch", ".cdr", ".afdesign", ".afphoto", ".blend", ".xcf" }),
        ("CAD", new[] { ".dwg", ".dxf", ".dwf", ".step", ".stp", ".iges", ".igs", ".stl", ".skp", ".rvt", ".ifc", ".sldprt", ".sldasm" }),
        ("Kod", new[] { ".cs", ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".cpp", ".c", ".h", ".go", ".rs", ".php", ".rb", ".sql",
                        ".json", ".xml", ".yaml", ".yml", ".html", ".htm", ".css", ".scss", ".sh", ".ipynb" }),
        ("Pulpit zdalny (RDP)", new[] { ".rdp" }),
        ("Bazy danych", new[] { ".mdb", ".accdb", ".db", ".sqlite", ".dbf" }),
        ("Czcionki", new[] { ".ttf", ".otf", ".woff", ".woff2", ".fon" }),
        ("Torrenty", new[] { ".torrent" }),
    };

    /// <summary>Kategorie, w których dzielimy dalej po temacie (słowa w nazwie).</summary>
    private static readonly HashSet<string> TopicCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        // „Inne” celowo bez tematów: nieznane pliki z przypadkowym słowem w nazwie (np. „Scan.Plus…”) nie trafią do Skanów
        "Word", "Excel", "PowerPoint", "PDF", "Teksty", "E-maile", "Archiwa", "Foldery", "Skróty do dokumentów", "Skróty do folderów",
    };

    // ------------------------------------------------------------------ tematy (słowa kluczowe, początki słów, bez polskich znaków)

    private static readonly (string Folder, string[] Stems)[] Topics =
    {
        ("Umowy", new[]
        {
            "umow", "aneks", "amendment", "addendum", "kontrakt", "porozumien", "contract", "agreement", "vertrag", "vereinbarung", "contrat", "contrato",
            "contratto", "accordo", "smlouv", "zmluv", "overeenkomst", "avtal", "sopimu", "szerzodes", "sozlesme", "dohoda",
            "договор", "контракт", "угод", "nda",
        }),
        ("Faktury", new[]
        {
            "faktur", "fv", "fvat", "fs", "fa", "fz", "fk", "proforma", "paragon", "rachun", "invoice", "receipt", "rechnung", "quittung", "facture",
            "factura", "fattura", "ricevuta", "faktura", "factuur", "szamla", "fatura", "счет", "счёт", "рахунок", "квитанц",
        }),
        ("Oferty", new[]
        {
            "ofert", "wycen", "kosztorys", "offer", "quotation", "quote", "proposal", "angebot", "kostenvoranschlag", "offre",
            "devis", "presupuesto", "cotizacion", "preventivo", "nabidk", "ponuk", "offerte", "ajanlat", "teklif", "предложен", "кошторис",
        }),
        ("Zamówienia", new[]
        {
            "zamowien", "zamowie", "order", "purchase", "bestellung", "auftrag", "commande", "pedido", "ordine", "objednavk",
            "bestelling", "megrendel", "siparis", "заказ", "замовлен",
        }),
        ("Protokoły", new[]
        {
            "protokol", "protocol", "minutes", "protokoll", "verbale", "acta", "zapis", "протокол",
        }),
        ("Raporty", new[]
        {
            "raport", "report", "audyt", "audit", "sprawozdan", "zestawien", "analiz", "statystyk", "bericht", "auswertung", "rapport", "informe", "relazione",
            "zprav", "sprava", "verslag", "jelentes", "rapor", "отчет", "отчёт", "звіт",
        }),
        ("Cenniki", new[] { "cennik", "pricelist", "price", "prices", "preisliste", "tarif", "tarifa", "listino", "cenik", "прайс" }),
        ("Instrukcje", new[]
        {
            "instrukc", "manual", "instruction", "guide", "poradnik", "podrecznik", "handbuch", "anleitung", "manuel",
            "istruzion", "navod", "handleiding", "kezikonyv", "kilavuz", "инструкц", "руковод",
        }),
        ("CV", new[] { "cv", "resume", "zyciorys", "lebenslauf", "curriculum", "zivotopis", "резюме" }),
        ("Certyfikaty", new[]
        {
            "certyfikat", "zaswiadcz", "dyplom", "certificate", "certificat", "zertifikat", "bescheinigung", "attestat", "certificado",
            "certificato", "osvedcen", "сертификат", "свидетельств", "сертифікат",
        }),
        ("Wnioski i pisma", new[]
        {
            "wniosek", "wnioski", "podanie", "pismo", "pisma", "reklamac", "odwolan", "upowaznien", "pelnomocn", "application",
            "request", "letter", "complaint", "antrag", "schreiben", "vollmacht", "demande", "lettre", "solicitud", "domanda",
            "zadost", "ziadost", "заявлен", "заява", "доверенн",
        }),
        ("Podatki", new[] { "pit", "cit", "vat", "jpk", "zus", "deklarac", "podatk", "tax", "steuer", "impot", "impuesto", "налог", "податк" }),
        ("Wyciągi bankowe", new[] { "wyciag", "statement", "kontoauszug", "releve", "extracto", "выписк" }),
        ("Zrzuty ekranu", new[] { "screenshot", "zrzut", "screen", "bildschirmfoto", "capture", "snimek", "снимок", "скриншот" }),
        ("Skany", new[] { "skan", "scan", "scanned", "skanowan", "scansione", "escaneo", "скан" }),
    };

    /// <summary>Tematy dozwolone dla zdjęć (żeby „umowa.jpg” trafiła do Zdjęcia\Umowy, a zwykłe zdjęcie zostało w Zdjęciach).</summary>
    private static readonly HashSet<string> ImageTopics = new(StringComparer.OrdinalIgnoreCase)
    {
        "Zrzuty ekranu", "Skany", "Umowy", "Faktury", "Certyfikaty",
    };

    // ------------------------------------------------------------------ API

    /// <summary>Nazwy folderów, które tworzy robot – przy sprzątaniu folderu zostają na miejscu.</summary>
    public static HashSet<string> AllCategoryFolders()
    {
        var set = new HashSet<string>(Types.Select(t => t.Folder), StringComparer.OrdinalIgnoreCase)
        {
            "Skróty programów", "Skróty do folderów", "Skróty do dokumentów", "Skróty internetowe",
            "Foldery", "Inne", "Duplikaty",
        };
        return set;
    }

    /// <summary>Folder docelowy względem „Zebrane z pulpitu”, np. „PDF\Faktury” albo „Skróty programów”.</summary>
    public static string RelativeFolder(string path, bool useTopics)
    {
        string category = CategoryOf(path);
        if (!useTopics) return category;

        bool images = category == "Zdjęcia";
        if (!TopicCategories.Contains(category) && !images) return category;

        var topic = TopicOf(Path.GetFileNameWithoutExtension(path.TrimEnd('\\')));
        if (topic is null) return category;
        if (images && !ImageTopics.Contains(topic)) return category;
        return Path.Combine(category, topic);
    }

    public static string CategoryOf(string path)
    {
        if (Directory.Exists(path)) return "Foldery";
        var ext = Path.GetExtension(path).ToLowerInvariant();

        switch (ext)
        {
            case ".url":
            case ".website":
                return "Skróty internetowe";
            case ".appref-ms":
                return "Skróty programów";
            case ".lnk":
                return ShortcutCategory(path);
        }

        foreach (var (folder, exts) in Types)
            if (exts.Contains(ext)) return folder;
        return "Inne";
    }

    /// <summary>Temat po słowach w nazwie (lub null). Sprawdza początki słów, bez polskich znaków i wielkości liter.</summary>
    public static string? TopicOf(string name)
    {
        var tokens = Tokenize(name);
        if (tokens.Count == 0) return null;
        var joined = string.Concat(tokens);

        // Punktacja zamiast „pierwszy temat z listy wygrywa”: słowo na początku nazwy waży najwięcej
        // („Instrukcja … KONTRAKT” → Instrukcje, nie Umowy). Remis rozstrzyga kolejność listy.
        string? best = null;
        double bestScore = 0;
        foreach (var (folder, stems) in Topics)
        {
            double score = 0;
            for (int i = 0; i < tokens.Count; i++)
            {
                var t = tokens[i];
                foreach (var stem in stems)
                {
                    // krótkie skróty (cv, fv, fs, pit, nda…) – tylko całe słowo, żeby nie łapać przypadkowych liter
                    bool hit = stem.Length <= 3 ? t == stem : t.StartsWith(stem, StringComparison.Ordinal);
                    if (!hit) continue;
                    score += i == 0 ? 3 : i == 1 ? 2 : 1;
                    break;
                }
            }
            // np. „PriceList”, „pricelist” sklejone bez spacji
            if (score == 0 && stems.Any(st => st.Length >= 6 && joined.Contains(st, StringComparison.Ordinal))) score = 0.5;
            if (score > bestScore)
            {
                bestScore = score;
                best = folder;
            }
        }
        return best;
    }

    // ------------------------------------------------------------------ pomocnicze

    /// <summary>Skrót .lnk: na co wskazuje – program, folder, dokument.</summary>
    private static string ShortcutCategory(string lnkPath)
    {
        string? target = ShortcutTarget(lnkPath);

        // skróty instalatorów MSI („reklamowane”) nie mają ścieżki celu – to programy
        if (string.IsNullOrWhiteSpace(target)) return "Skróty programów";
        if (Directory.Exists(target)) return "Skróty do folderów";
        var ext = Path.GetExtension(target).ToLowerInvariant();
        return ext is ".exe" or ".com" or ".bat" or ".cmd" or ".msc" or ".cpl" or ".ps1" or ".vbs" or ""
            ? "Skróty programów"
            : "Skróty do dokumentów";
    }

    [System.Runtime.InteropServices.ComImport, System.Runtime.InteropServices.Guid("000214F9-0000-0000-C000-000000000046"),
     System.Runtime.InteropServices.InterfaceType(System.Runtime.InteropServices.ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        [System.Runtime.InteropServices.PreserveSig]
        int GetPath([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] StringBuilder pszFile,
            int cch, IntPtr pfd, uint fFlags);
    }

    [System.Runtime.InteropServices.ComImport, System.Runtime.InteropServices.Guid("0000010B-0000-0000-C000-000000000046"),
     System.Runtime.InteropServices.InterfaceType(System.Runtime.InteropServices.ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPersistFile
    {
        void GetClassID(out Guid pClassID);
        [System.Runtime.InteropServices.PreserveSig] int IsDirty();
        [System.Runtime.InteropServices.PreserveSig]
        int Load([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    }

    /// <summary>Ścieżka celu skrótu .lnk przez systemowy obiekt ShellLink (bez Windows Script Host).</summary>
    private static string? ShortcutTarget(string lnkPath)
    {
        try
        {
            var type = Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046"));
            if (type is null) return null;
            var obj = Activator.CreateInstance(type);
            try
            {
                if (((IPersistFile)obj!).Load(lnkPath, 0) != 0) return null;
                var sb = new StringBuilder(1024);
                return ((IShellLinkW)obj).GetPath(sb, sb.Capacity, IntPtr.Zero, 0) == 0 ? sb.ToString() : null;
            }
            finally
            {
                if (obj is not null && System.Runtime.InteropServices.Marshal.IsComObject(obj))
                    System.Runtime.InteropServices.Marshal.ReleaseComObject(obj);
            }
        }
        catch (Exception)
        {
            return null; // nie da się odczytać – traktujemy jak skrót programu
        }
    }

    private static List<string> Tokenize(string name)
    {
        var norm = RemoveDiacritics(name).ToLowerInvariant();
        var tokens = new List<string>();
        var sb = new StringBuilder();
        foreach (var ch in norm)
        {
            if (char.IsLetter(ch))
            {
                sb.Append(ch);
            }
            else if (sb.Length > 0)
            {
                tokens.Add(sb.ToString());
                sb.Clear();
            }
        }
        if (sb.Length > 0) tokens.Add(sb.ToString());
        return tokens;
    }

    private static string RemoveDiacritics(string s)
    {
        var d = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(d.Length);
        foreach (var ch in d)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(ch switch { 'ł' => 'l', 'Ł' => 'L', 'ß' => 's', 'ø' => 'o', 'Ø' => 'O', 'đ' => 'd', 'Đ' => 'D', 'ı' => 'i', _ => ch });
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}
