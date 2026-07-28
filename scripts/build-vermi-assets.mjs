// Buduje gotowe do użycia assety marki VERMI z surowych plików w app/VERMI.
//
// Pliki źródłowe to wycinki z arkusza kontaktowego: mają wypalone podpisy
// („WITAJ", „LOGO PODSTAWOWE"), białe tło i miejscami „wycieki" sąsiednich
// obrazków przy krawędziach. Ten skrypt to naprawia:
//   1. wypełnienie tła (flood fill od krawędzi) → prawdziwa przezroczystość,
//   2. usunięcie podpisów (składowa leżąca pod maskotką) i wycieków
//      (składowe dotykające krawędzi kadru),
//   3. wygładzenie brzegu (feather), żeby nie było białej obwódki na ciemnym tle,
//   4. wordmark „VERMI" przeliczany na czyste krycie → wersja jasna i ciemna,
//   5. skład lockupu poziomego (nagłówki) i pionowego (ekran logowania),
//   6. ikony aplikacji renderowane z wektora app/icon.svg (ostre w każdym rozmiarze).
//
// Uruchomienie:  node scripts/build-vermi-assets.mjs

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SRC = "app/VERMI";
const OUT_VERMI = "public/vermi";
const OUT_MASCOT = path.join(OUT_VERMI, "mascot");
const OUT_ICONS = "public/icons";

// PNG z paletą — rysunek jest płaski, więc paleta daje ~5× mniejsze pliki
// bez widocznej różnicy (a oba warianty motywu i tak lecą w tym samym HTML-u).
const PNG_OPTS = { palette: true, effort: 10, compressionLevel: 9 };

const PAD = 4; // biała ramka dodawana przed obróbką (żeby nic nie dotykało krawędzi)
const BG_MIN = 238; // od tej wartości piksel uznajemy za białe tło
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── Wczytanie pikseli ───────────────────────────────────────────────────────
async function readPadded(file) {
  const { data, info } = await sharp(file)
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { d: data, W: info.width, H: info.height, C: info.channels };
}

// ── Tło: flood fill od krawędzi obrazu ──────────────────────────────────────
// Zwraca dwie maski:
//   bg   – pełne (białe) tło,
//   soft – miękki cień pod maskotką: szarości „wyciekające" z tła, którym
//          nadajemy częściowe krycie. Bez tego na ciemnym motywie pod
//          maskotką widać jasną smugę. Do wnętrza figury nie wchodzi, bo
//          zatrzymuje ją ciemny kontur rysunku.
function backgroundMasks({ d, W, H, C }) {
  const bg = new Uint8Array(W * H);
  const soft = new Int16Array(W * H).fill(-1);
  const px = (i) => {
    const s = i * C;
    return [d[s], d[s + 1], d[s + 2]];
  };
  const stack = [];
  const pushBg = (x, y) => {
    const i = y * W + x;
    if (bg[i]) return;
    const [r, g, b] = px(i);
    if (r >= BG_MIN && g >= BG_MIN && b >= BG_MIN) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    pushBg(x, 0);
    pushBg(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    pushBg(0, y);
    pushBg(W - 1, y);
  }
  const neighbours = (i, fn) => {
    const x = i % W;
    const y = (i - x) / W;
    if (x > 0) fn(x - 1, y);
    if (x < W - 1) fn(x + 1, y);
    if (y > 0) fn(x, y - 1);
    if (y < H - 1) fn(x, y + 1);
  };
  while (stack.length) neighbours(stack.pop(), pushBg);

  // Faza 2: z tła w jasne, nienasycone szarości (cień rzucany na podłoże).
  const soft2 = [];
  const pushSoft = (x, y) => {
    const i = y * W + x;
    if (bg[i] || soft[i] >= 0) return;
    const [r, g, b] = px(i);
    const Y = lum(r, g, b);
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // Progi dobrane doświadczalnie: niżej niż 212 zaczyna „zjadać" biały kask
    // maskotki (jego kontur jest miejscami cieńszy niż piksel).
    if (Y < 212 || sat > 28) return;
    soft[i] = Math.round(clamp01((250 - Y) / 38) * 255);
    soft2.push(i);
  };
  for (let i = 0; i < W * H; i++) if (bg[i]) neighbours(i, pushSoft);
  while (soft2.length) neighbours(soft2.pop(), pushSoft);

  return { bg, soft };
}

// ── Etykietowanie spójnych składowych (8-sąsiedztwo) ────────────────────────
function labelComponents(fg, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let start = 0; start < W * H; start++) {
    if (!fg[start] || label[start] >= 0) continue;
    const id = comps.length;
    const c = { id, area: 0, x0: W, y0: H, x1: -1, y1: -1 };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      const x = i % W;
      const y = (i - x) / W;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (fg[ni] && label[ni] < 0) {
            label[ni] = id;
            stack.push(ni);
          }
        }
      }
    }
    comps.push(c);
  }
  return { label, comps };
}

// ── Maska → RGBA z wygładzonym brzegiem ─────────────────────────────────────
function maskToRGBA({ d, W, H, C }, keep, soft) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const s = i * C;
    out[i * 4] = d[s];
    out[i * 4 + 1] = d[s + 1];
    out[i * 4 + 2] = d[s + 2];
    out[i * 4 + 3] = keep[i] ? (soft && soft[i] >= 0 ? soft[i] : 255) : 0;
  }
  // Piksel graniczny bywa mieszanką konturu i białego tła — zamieniamy tę
  // „białość" na przezroczystość, inaczej na ciemnym motywie widać obwódkę.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!keep[i]) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !keep[ny * W + nx]) {
            edge = true;
            break;
          }
        }
      }
      if (!edge) continue;
      const Y = lum(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]);
      const a = Math.round(clamp01((250 - Y) / 22) * 255);
      if (a < out[i * 4 + 3]) out[i * 4 + 3] = a;
    }
  }
  return out;
}

function bboxOfAlpha(rgba, W, H, threshold = 8) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rgba[(y * W + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function crop(rgba, W, box, pad = 2) {
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const w = box.width + pad * 2;
  const h = box.height + pad * 2;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const si = (sy * W + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return { buf: out, W: w, H: h };
}

// Zapis z opcjonalnym powiększeniem (lanczos) — źródła są małe, więc 2× daje
// łagodniejsze krawędzie niż skalowanie w przeglądarce.
async function savePNG({ buf, W, H }, file, scale = 2) {
  await mkdir(path.dirname(file), { recursive: true });
  let img = sharp(buf, { raw: { width: W, height: H, channels: 4 } });
  if (scale !== 1) {
    img = img.resize({ width: Math.round(W * scale), kernel: "lanczos3" });
  }
  await img.png(PNG_OPTS).toFile(file);
  return { width: Math.round(W * scale), height: Math.round(H * scale) };
}

// ── Maskotka: usuwa podpis i wycieki, zostawia bohatera i jego atrybuty ─────
async function buildMascot(srcFile, outFile) {
  const img = await readPadded(srcFile);
  const { W, H } = img;
  const { bg, soft } = backgroundMasks(img);
  const fg = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) fg[i] = bg[i] ? 0 : 1;

  const { label, comps } = labelComponents(fg, W, H);
  const main = comps.reduce((a, b) => (b.area > a.area ? b : a), comps[0]);
  const touchesFrame = (c) =>
    c.x0 <= PAD || c.y0 <= PAD || c.x1 >= W - 1 - PAD || c.y1 >= H - 1 - PAD;

  const keepIds = new Set([main.id]);
  for (const c of comps) {
    if (c.id === main.id) continue;
    if (c.area < 8) continue; // szum
    if (touchesFrame(c)) continue; // wyciek sąsiedniego kadru
    if (c.y0 > main.y1 + 1) continue; // wypalony podpis pod maskotką
    keepIds.add(c.id);
  }

  const keep = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (fg[i] && keepIds.has(label[i])) keep[i] = 1;

  const rgba = maskToRGBA(img, keep, soft);
  const box = bboxOfAlpha(rgba, W, H);
  const out = crop(rgba, W, box, 2);
  const size = await savePNG(out, outFile, 2);
  console.log(`  ${path.basename(outFile)}  ${size.width}x${size.height}  (dropped ${comps.length - keepIds.size} comp.)`);
}

// ── Wordmark: płaska grafika 2-kolorowa → krycie + przekolorowanie ──────────
// Piksel to mieszanka koloru docelowego z białym tłem: P = c*T + (1-c)*255.
// Odzyskujemy c i zapisujemy czysty kolor + alfa — dzięki temu wordmark
// wygląda identycznie na każdym tle i da się go przemalować na motyw ciemny.
function flattenWordmark({ d, W, H, C }, region, navyOut) {
  const out = Buffer.alloc(W * H * 4);
  const GREEN = [0x4c, 0xc4, 0x17];
  const NAVY = [0x0f, 0x17, 0x2a];
  const yG = lum(...GREEN);
  const yN = lum(...NAVY);
  for (let y = region.y0; y <= region.y1; y++) {
    for (let x = region.x0; x <= region.x1; x++) {
      const s = (y * W + x) * C;
      const r = d[s], g = d[s + 1], b = d[s + 2];
      const Y = lum(r, g, b);
      if (Y >= 250) continue;
      const green = g - Math.max(r, b) > 14;
      const target = green ? GREEN : navyOut ?? NAVY;
      const c = clamp01((255 - Y) / (255 - (green ? yG : yN)));
      const i = (y * W + x) * 4;
      out[i] = target[0];
      out[i + 1] = target[1];
      out[i + 2] = target[2];
      out[i + 3] = Math.round(c * 255);
    }
  }
  return out;
}

// Składa dwa kawałki w poziomie (2×, wyśrodkowane w pionie).
// leftRatio = wysokość lewego kawałka względem prawego. W pełnym lockupie
// maskotka jest ~2,4× wyższa od napisu, co przy niskim pasku robi napis
// nieczytelnym — w wersji kompaktowej zmniejszamy ją do ~1,6×.
async function composeRow({ left, right, gap, file, leftRatio }) {
  const S = 2;
  const rW = right.W * S, rH = right.H * S;
  const lH = leftRatio ? Math.round(rH * leftRatio) : left.H * S;
  const lW = Math.round((left.W * lH) / left.H);
  const canvasW = lW + gap + rW;
  const canvasH = Math.max(lH, rH);
  const scaleTo = async (piece, w) =>
    sharp(piece.buf, { raw: { width: piece.W, height: piece.H, channels: 4 } })
      .resize({ width: w, kernel: "lanczos3" })
      .png()
      .toBuffer();
  await mkdir(path.dirname(file), { recursive: true });
  await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: await scaleTo(left, lW), left: 0, top: Math.round((canvasH - lH) / 2) },
      { input: await scaleTo(right, rW), left: lW + gap, top: Math.round((canvasH - rH) / 2) },
    ])
    .png(PNG_OPTS)
    .toFile(file);
  console.log(`  ${path.basename(file)}  ${canvasW}x${canvasH}`);
}

// ── Lockup: maskotka (bitmapa) + wordmark (przeliczony) ─────────────────────
// W logo_podstawowe.png: y<30 to wypalony podpis, x<117 maskotka, x>=117 wordmark.
const LOGO = { topCut: 30, splitX: 117 };

async function buildLogo({ navyOut, suffix }) {
  const file = path.join(SRC, "logos/logo_podstawowe.png");
  const img = await readPadded(file);
  const { W, H } = img;
  const topCut = LOGO.topCut + PAD;
  const splitX = LOGO.splitX + PAD;

  // maskotka — flood fill (ma wiele odcieni, nie da się jej „spłaszczyć")
  const { bg, soft } = backgroundMasks(img);
  const keep = new Uint8Array(W * H);
  for (let y = topCut; y < H; y++) {
    for (let x = 0; x < splitX; x++) {
      const i = y * W + x;
      if (!bg[i]) keep[i] = 1;
    }
  }
  const mascotRGBA = maskToRGBA(img, keep, soft);

  // wordmark — czyste krycie, z opcjonalnym przekolorowaniem granatu
  const wordRGBA = flattenWordmark(img, { x0: splitX, y0: topCut, x1: W - 1, y1: H - 1 }, navyOut);

  // scalenie obu warstw w jeden bufor (rozłączne regiony)
  const full = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H * 4; i += 4) {
    const a = mascotRGBA[i + 3] ? mascotRGBA : wordRGBA;
    full[i] = a[i];
    full[i + 1] = a[i + 1];
    full[i + 2] = a[i + 2];
    full[i + 3] = a[i + 3];
  }

  // 1) lockup poziomy — do nagłówków
  const boxAll = bboxOfAlpha(full, W, H);
  const horiz = crop(full, W, boxAll, 3);
  const hSize = await savePNG(horiz, path.join(OUT_VERMI, `logo-lockup${suffix}.png`), 2);
  console.log(`  logo-lockup${suffix}.png  ${hSize.width}x${hSize.height}`);

  const mBox = bboxOfAlpha(mascotRGBA, W, H);
  const wBox = bboxOfAlpha(wordRGBA, W, H);
  const mascotPiece = crop(mascotRGBA, W, mBox, 1);
  const wordPiece = crop(wordRGBA, W, wBox, 1);

  // 2) lockup kompaktowy — maskotka + „VERMI" bez tagline'u. Pełny lockup ma
  // proporcje 2,2:1, więc w pasku wysokości 52 px (mobile) tagline robi się
  // nieczytelny. Szukamy pustego wiersza nad tagline'em i odcinamy go.
  let sep = -1;
  for (let y = wBox.y1; y > wBox.y0 + 8; y--) {
    let ink = 0;
    for (let x = wBox.x0; x <= wBox.x1; x++) if (wordRGBA[(y * W + x) * 4 + 3] > 8) ink++;
    if (ink === 0) {
      sep = y;
      break;
    }
  }
  if (sep < 0) throw new Error("nie znaleziono przerwy między wordmarkiem a tagline'em");
  const wordTopPiece = crop(
    wordRGBA,
    W,
    { x0: wBox.x0, y0: wBox.y0, width: wBox.width, height: sep - wBox.y0 },
    1,
  );
  await composeRow({
    left: mascotPiece,
    right: wordTopPiece,
    gap: 20,
    leftRatio: 1.6,
    file: path.join(OUT_VERMI, `logo-compact${suffix}.png`),
  });

  // Składamy od razu w 2×, bo sharp wykonuje resize PRZED composite.
  const wordW = 460;
  const wordH = Math.round((wordPiece.H * wordW) / wordPiece.W);
  const mascotW = 304;
  const mascotH = Math.round((mascotPiece.H * mascotW) / mascotPiece.W);
  const gap = 32;
  const canvasW = 520;
  const canvasH = mascotH + gap + wordH;

  const mascotBuf = await sharp(mascotPiece.buf, {
    raw: { width: mascotPiece.W, height: mascotPiece.H, channels: 4 },
  })
    .resize({ width: mascotW, kernel: "lanczos3" })
    .png()
    .toBuffer();
  const wordBuf = await sharp(wordPiece.buf, {
    raw: { width: wordPiece.W, height: wordPiece.H, channels: 4 },
  })
    .resize({ width: wordW, kernel: "lanczos3" })
    .png()
    .toBuffer();

  const outFile = path.join(OUT_VERMI, `logo-vertical${suffix}.png`);
  await mkdir(path.dirname(outFile), { recursive: true });
  await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: mascotBuf, left: Math.round((canvasW - mascotW) / 2), top: 0 },
      { input: wordBuf, left: Math.round((canvasW - wordW) / 2), top: mascotH + gap },
    ])
    .png(PNG_OPTS)
    .toFile(outFile);
  console.log(`  logo-vertical${suffix}.png  ${canvasW}x${canvasH}`);
}

// ── Ikony aplikacji z wektora (ostre w każdym rozmiarze) ────────────────────
async function buildIcons() {
  const svg = "app/icon.svg";
  const targets = [
    ["app/apple-icon.png", 180],
    [path.join(OUT_ICONS, "icon-192.png"), 192],
    [path.join(OUT_ICONS, "icon-512.png"), 512],
  ];
  for (const [file, size] of targets) {
    await mkdir(path.dirname(file), { recursive: true });
    await sharp(svg, { density: 512 }).resize(size, size).png(PNG_OPTS).toFile(file);
    console.log(`  ${file}  ${size}x${size}`);
  }
  const manifest = {
    name: "VERMI — Twój agent AI do zadań specjalnych",
    short_name: "VERMI",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#31c24d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  await writeFile("public/site.webmanifest", JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("  public/site.webmanifest");
}

// ── Główny przebieg ─────────────────────────────────────────────────────────
const MASCOTS = [
  ["maskotka_witaj", "witaj"],
  ["maskotka_praca", "praca"],
  ["maskotka_pomysl", "pomysl"],
  ["maskotka_analiza", "analiza"],
  ["maskotka_pytanie", "pytanie"],
  ["maskotka_powiadomienie", "powiadomienie"],
  ["maskotka_sukces", "sukces"],
  ["maskotka_szybkosc", "szybkosc"],
  ["maskotka_sam_symbol", "symbol"],
];

console.log("VERMI » maskotka");
await mkdir(OUT_MASCOT, { recursive: true });
for (const [src, name] of MASCOTS) {
  await buildMascot(path.join(SRC, "mascot", `${src}.png`), path.join(OUT_MASCOT, `${name}.png`));
}

console.log("VERMI » logo");
await buildLogo({ suffix: "", navyOut: null });
await buildLogo({ suffix: "-dark", navyOut: [0xe2, 0xe8, 0xf0] });

console.log("VERMI » ikony");
await buildIcons();

console.log("Gotowe.");
