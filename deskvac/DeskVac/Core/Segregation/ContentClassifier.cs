using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace DeskVac.Core.Segregation;

/// <summary>Wynik klasyfikacji treści: temat (np. „Faktury”) albo null, punkty i uzasadnienie.</summary>
public sealed record Classification(string? Topic, double Score, IReadOnlyList<string> Reasons);

/// <summary>
/// Klasyfikator offline: każdy temat zbiera punkty za charakterystyczne zwroty i wzorce w treści
/// (np. „Faktura VAT”, „Do zapłaty”, NIP → Faktury; „zawarta w dniu”, „§ 1”, „zwanym dalej” → Umowy).
/// Gdy wynik jest niepewny (za mało punktów albo dwa tematy blisko siebie) – zwraca null i plik zostaje,
/// gdzie był. Lepiej nie przenieść niż przenieść źle.
/// </summary>
public static class ContentClassifier
{
    /// <summary>Minimalna liczba punktów i przewaga nad drugim tematem.</summary>
    public const double MinScore = 5;
    public const double MinMargin = 2;

    private sealed record Feature(string Label, double Weight, Regex Pattern);

    private static Feature P(string phrase, double weight)
    {
        // fraza bez polskich znaków, małymi literami; granice słów, dowolne odstępy między wyrazami
        var norm = Normalize(phrase).Trim();
        var pattern = @"(?<![\p{L}\d])" + string.Join(@"\s+", norm.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Regex.Escape)) + @"(?![\p{L}])";
        return new Feature(phrase, weight, new Regex(pattern, RegexOptions.Compiled | RegexOptions.CultureInvariant));
    }

    private static Feature R(string label, double weight, string regex) =>
        new(label, weight, new Regex(regex, RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase));

    private static readonly (string Topic, Feature[] Features)[] Rules =
    {
        ("Faktury", new[]
        {
            P("faktura vat", 4), P("faktura", 2), P("faktura korygująca", 3), P("nr faktury", 3), P("numer faktury", 3),
            P("faktura nr", 3), P("data wystawienia", 1), P("data sprzedaży", 2), P("sprzedawca", 1.5), P("nabywca", 1.5),
            P("do zapłaty", 2), P("razem do zapłaty", 2), P("termin płatności", 1.5), P("sposób płatności", 1),
            P("stawka vat", 1.5), P("kwota vat", 1.5), P("wartość netto", 1), P("wartość brutto", 1), P("proforma", 2),
            P("invoice", 2), P("invoice number", 3), P("invoice no", 3), P("amount due", 2), P("total due", 2), P("vat id", 1),
            P("rechnung", 2), P("rechnungsnummer", 3), P("facture", 2), P("factura", 2), P("fattura", 2),
            R("NIP (numer)", 1, @"\bnip\b\W{0,3}(pl)?\s*\d{3}[- ]?\d{3}[- ]?\d{2}[- ]?\d{2}\b"),
        }),
        ("Umowy", new[]
        {
            P("umowa", 2), P("zawarta w dniu", 4), P("zawarta dnia", 3), P("zwanym dalej", 3), P("zwaną dalej", 3),
            P("zwanymi dalej", 3), P("strony umowy", 3), P("przedmiot umowy", 3), P("postanowienia końcowe", 3),
            P("zamawiający", 1.5), P("wykonawca", 1.5), P("zleceniodawca", 1.5), P("zleceniobiorca", 1.5),
            P("wynajmujący", 1.5), P("najemca", 1.5), P("pracodawca", 1), P("aneks nr", 3), P("podpisy stron", 2),
            P("agreement", 2), P("this agreement", 3), P("the parties", 2), P("hereinafter", 3), P("amendment", 2),
            P("vertrag", 2), P("contrat", 2), P("contrato", 2), P("договор", 3),
            R("§ 1", 2, @"§\s*1\b"),
        }),
        ("Wyciągi bankowe", new[]
        {
            P("wyciąg", 3), P("wyciąg z rachunku", 4), P("saldo początkowe", 4), P("saldo końcowe", 4), P("saldo otwarcia", 3),
            P("saldo zamknięcia", 3), P("historia rachunku", 3), P("zestawienie operacji", 3), P("numer rachunku", 1),
            P("statement", 2), P("account statement", 4), P("opening balance", 4), P("closing balance", 4), P("kontoauszug", 4),
            R("IBAN", 1, @"\bpl\s?\d{2}(\s?\d{4}){6}\b"),
        }),
        ("Oferty", new[]
        {
            P("oferta", 2), P("oferujemy", 2), P("wycena", 2), P("kosztorys", 3), P("ważność oferty", 4), P("oferta ważna", 4),
            P("propozycja cenowa", 3), P("offer", 1.5), P("quotation", 3), P("angebot", 2), P("devis", 2), P("presupuesto", 2),
        }),
        ("Zamówienia", new[]
        {
            P("zamówienie", 2), P("nr zamówienia", 3), P("numer zamówienia", 3), P("zamówienie nr", 3),
            P("potwierdzenie zamówienia", 3), P("purchase order", 4), P("order number", 2), P("order confirmation", 3),
            P("bestellung", 2), P("commande", 2), P("pedido", 2),
        }),
        ("Protokoły", new[]
        {
            P("protokół", 3), P("protokół odbioru", 4), P("protokół zdawczo", 4), P("protokół z posiedzenia", 4),
            P("protokół ze spotkania", 4), P("minutes of meeting", 4), P("uczestnicy spotkania", 2), P("ustalenia", 1.5),
            P("protokoll", 3),
        }),
        ("Raporty", new[]
        {
            P("raport", 2), P("sprawozdanie", 3), P("report", 2), P("executive summary", 3), P("audyt", 2), P("audit", 2),
            P("podsumowanie", 1), P("analiza", 1), P("wnioski i rekomendacje", 3), P("bericht", 2),
        }),
        ("Cenniki", new[] { P("cennik", 4), P("price list", 4), P("preisliste", 4), P("cena jednostkowa", 1), P("ceny netto", 1.5) }),
        ("Instrukcje", new[]
        {
            P("instrukcja", 3), P("instrukcja obsługi", 4), P("procedura", 2), P("krok 1", 2), P("step 1", 2), P("user manual", 4),
            P("kliknij", 1.5), P("należy", 0.5), P("bedienungsanleitung", 4), P("anleitung", 3),
        }),
        ("CV", new[]
        {
            P("curriculum vitae", 5), P("doświadczenie zawodowe", 4), P("wykształcenie", 2), P("umiejętności", 2),
            P("zainteresowania", 2), P("work experience", 4), P("professional experience", 4), P("education", 1.5), P("skills", 1),
            P("lebenslauf", 5),
        }),
        ("Certyfikaty", new[]
        {
            P("certyfikat", 3), P("zaświadczenie", 3), P("zaświadcza się", 4), P("niniejszym zaświadcza", 4), P("dyplom", 3),
            P("ukończył", 2), P("ukończyła", 2), P("certificate", 3), P("this is to certify", 4), P("zertifikat", 3),
        }),
        ("Wnioski i pisma", new[]
        {
            P("wniosek", 3), P("wnoszę o", 4), P("uprzejmie proszę", 3), P("szanowni państwo", 2), P("z poważaniem", 2),
            P("dotyczy", 1), P("reklamacja", 3), P("odwołanie", 3), P("pełnomocnictwo", 3), P("upoważnienie", 3),
            P("dear sir", 2), P("yours sincerely", 2), P("antrag", 3),
        }),
        ("Podatki", new[]
        {
            P("urząd skarbowy", 4), P("zeznanie podatkowe", 4), P("podatek dochodowy", 3), P("deklaracja", 2), P("jpk", 3),
            P("zus", 2), R("PIT/CIT/VAT-7", 3, @"\b(pit|cit|vat)-?\d{1,2}[a-z]?\b"),
        }),
    };

    public static Classification Classify(string text, string fileName)
    {
        var norm = Normalize(text);
        var head = norm.Length > 600 ? norm[..600] : norm; // nagłówek dokumentu waży więcej
        var scores = new List<(string Topic, double Score, List<string> Reasons)>();

        foreach (var (topic, features) in Rules)
        {
            double score = 0;
            var reasons = new List<string>();
            foreach (var f in features)
            {
                if (!f.Pattern.IsMatch(norm)) continue;   // każda cecha liczy się raz – długi dokument nie wygrywa samą długością
                double w = f.Weight * (f.Pattern.IsMatch(head) ? 1.5 : 1.0);
                score += w;
                reasons.Add(f.Label);
            }
            // nazwa pliku jako dodatkowa wskazówka
            if (Categorizer.TopicOf(Path.GetFileNameWithoutExtension(fileName)) == topic)
            {
                score += 2;
                reasons.Add("nazwa pliku");
            }
            scores.Add((topic, score, reasons));
        }

        var ordered = scores.OrderByDescending(s => s.Score).ToList();
        var best = ordered[0];
        double second = ordered.Count > 1 ? ordered[1].Score : 0;
        if (best.Score < MinScore || best.Score - second < MinMargin)
            return new Classification(null, best.Score, best.Reasons);
        return new Classification(best.Topic, best.Score, best.Reasons.Take(5).ToList());
    }

    /// <summary>Małe litery, bez polskich znaków (ł → l), pojedyncze spacje.</summary>
    public static string Normalize(string s)
    {
        var d = s.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(d.Length);
        bool space = false;
        foreach (var ch in d)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            var c = ch switch { 'ł' => 'l', 'ß' => 's', 'ø' => 'o', 'đ' => 'd', 'ı' => 'i', _ => ch };
            if (char.IsWhiteSpace(c))
            {
                if (!space) sb.Append(' ');
                space = true;
            }
            else
            {
                sb.Append(c);
                space = false;
            }
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}
