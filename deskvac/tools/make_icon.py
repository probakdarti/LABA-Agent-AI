"""Rysuje ikonę DeskVac (robot z góry) i zapisuje ją jako wielorozmiarowy .ico.  Użycie: python make_icon.py <plik.ico>"""
import sys
from PIL import Image, ImageDraw

S = 1024  # rysujemy duży obraz i zmniejszamy – gładkie krawędzie


def robot(size):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    r = S * 0.46
    d.ellipse([c - r + 18, c - r + 30, c + r + 18, c + r + 30], fill=(0, 0, 0, 90))             # cień
    d.ellipse([c - r, c - r, c + r, c + r], fill=(36, 40, 46, 255))                               # korpus
    d.arc([c - r + 14, c - r + 14, c + r - 14, c + r - 14], 200, 340, fill=(233, 236, 239, 255), width=44)  # zderzak (przód u góry)
    r2 = r * 0.74
    d.ellipse([c - r2, c - r2 + 40, c + r2, c + r2 + 40], fill=(52, 58, 66, 255))                 # płyta
    d.arc([c - r * 0.58, c - r * 0.58, c + r * 0.58, c + r * 0.58], 240, 300, fill=(46, 230, 197, 255), width=40)  # LED
    t = r * 0.3
    d.ellipse([c - t, c - t + 70, c + t, c + t + 70], fill=(240, 243, 246, 255))                  # lidar
    n = r * 0.08
    d.ellipse([c - n, c - n + 70 - t * 0.45, c + n, c + n + 70 - t * 0.45], fill=(46, 230, 197, 255))
    return im.resize((size, size), Image.LANCZOS)


sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
imgs = [robot(s) for s in sizes]
imgs[-1].save(sys.argv[1], format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
print("ok", sys.argv[1])
