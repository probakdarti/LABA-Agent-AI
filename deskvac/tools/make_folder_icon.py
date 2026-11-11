"""Ikona folderu „Zebrane z pulpitu”: stacja dokująca robota z przezroczystym pojemnikiem na kurz.
Użycie: python make_folder_icon.py <plik.ico>"""
import sys, random
from PIL import Image, ImageDraw

S = 1024
TEAL = (46, 230, 197, 255)


def draw(size):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # cień
    d.ellipse([150, 860, 874, 980], fill=(0, 0, 0, 70))
    # podstawa stacji (szeroka, niska) z rampą
    d.rounded_rectangle([120, 640, 904, 920], radius=90, fill=(32, 36, 42, 255))
    d.rounded_rectangle([150, 660, 874, 720], radius=30, fill=(52, 58, 66, 255))
    # styki ładowania
    d.rounded_rectangle([330, 640, 430, 670], radius=12, fill=(232, 185, 74, 255))
    d.rounded_rectangle([594, 640, 694, 670], radius=12, fill=(232, 185, 74, 255))
    # dioda
    d.rounded_rectangle([432, 820, 592, 850], radius=15, fill=TEAL)
    # wieża stacji
    d.rounded_rectangle([250, 210, 774, 690], radius=80, fill=(40, 45, 52, 255))
    # pojemnik (przezroczysty, z kurzem) – „opróżnianie”
    d.rounded_rectangle([320, 250, 704, 600], radius=50, fill=(210, 235, 240, 210), outline=(240, 250, 252, 255), width=14)
    rnd = random.Random(7)
    for _ in range(260):
        x = rnd.uniform(345, 680); y = rnd.uniform(420, 580)
        r = rnd.uniform(5, 14)
        c = rnd.choice([(120, 120, 128, 255), (150, 150, 160, 255), (90, 92, 100, 255), (46, 200, 175, 255)])
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    # odblask na pojemniku
    d.rounded_rectangle([350, 275, 395, 520], radius=22, fill=(255, 255, 255, 120))
    # uchwyt pojemnika
    d.rounded_rectangle([430, 170, 594, 230], radius=28, fill=(60, 66, 74, 255))
    # strzałka „w dół” (zasysanie do stacji)
    d.polygon([(512, 360), (452, 300), (572, 300)], fill=(46, 230, 197, 230))
    return im.resize((size, size), Image.LANCZOS)


sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
imgs = [draw(s) for s in sizes]
imgs[-1].save(sys.argv[1], format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
print("ok", sys.argv[1])
