"""
Generuje dźwięki DeskVac (WAV 44,1 kHz, 16 bit, stereo) do deskvac/DeskVac/Assets/Sounds.

Użycie:  python make_sounds.py <nagranie_silnika.mp3|wav> <folder_wyjściowy>
Wymaga: numpy oraz ffmpeg w PATH (do zdekodowania nagrania).

Nagranie silnika jest dzielone na trzy części: rozruch, pętla (z płynnym przejściem
końca w początek) i wybieg. Pozostałe efekty są syntetyzowane.
"""
import subprocess, sys, wave
from pathlib import Path
import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def save(path, x, peak=0.89):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    m = np.abs(x).max()
    if m > peak:
        x = x * (peak / m)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{path.name:18s} {len(x)/SR:5.2f}s")


def t(dur):
    return np.arange(int(dur * SR)) / SR


def env(n, a, r, curve=3.0):
    """atak liniowy, wybrzmienie wykładnicze"""
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na)
    k = np.arange(n - na) / SR
    e[na:] = np.exp(-k * curve / max(r, 1e-3))
    return e


def onepole_lp(x, fc):
    """filtr dolnoprzepustowy 1. rzędu; fc może być tablicą (zmienny w czasie)"""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape[:1])
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    s = np.zeros(x.shape[1:]) if x.ndim > 1 else 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def bandnoise(n, lo, hi):
    w = rng.standard_normal(n)
    return onepole_lp(w, hi) - onepole_lp(w, lo)


def tone(freq, dur, harm=(1.0, 0.25, 0.08), a=0.004, r=0.25):
    tt = t(dur)
    s = sum(h * np.sin(2 * np.pi * freq * (i + 1) * tt) for i, h in enumerate(harm))
    return s * env(len(tt), a, r)


def place(total, *parts):
    """parts: (start_s, sygnał)"""
    out = np.zeros(int(total * SR))
    for st, sig in parts:
        i = int(st * SR)
        out[i:i + len(sig)] += sig[: len(out) - i]
    return out


def main(src, out):
    out.mkdir(parents=True, exist_ok=True)
    x = load(src)

    # --- silnik z nagrania ------------------------------------------------------------
    a, b, xf = int(1.30 * SR), int(7.90 * SR), int(0.60 * SR)
    start = x[:a].copy()
    start[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))[:, None]
    save(out / "motor_start.wav", start)

    # pętla zaczyna się dokładnie tam, gdzie kończy się rozruch (ciągłość start → pętla).
    # Jej ostatnie 0,6 s przenika (równa moc) w fragment tuż PRZED początkiem pętli,
    # który w nagraniu naturalnie w nią przechodzi – dzięki temu zawinięcie jest bezszwowe.
    loop = x[a:b].copy()
    pre = x[a - xf:a]
    ph = np.linspace(0, np.pi / 2, xf)[:, None]
    loop[-xf:] = loop[-xf:] * np.cos(ph) + pre * np.sin(ph)
    save(out / "motor_loop.wav", loop)

    stop = x[b:].copy()
    stop[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))[:, None]
    save(out / "motor_stop.wav", stop)

    # --- zasysanie elementu: krótkie „fwump” (szum z rosnącym filtrem + niskie uderzenie)
    for k, (f0, f1, d) in enumerate([(500, 3800, 0.20), (420, 3200, 0.23), (600, 4500, 0.18)]):
        n = int(d * SR)
        sweep = np.geomspace(f0, f1, n)
        w = rng.standard_normal(n)
        hiss = onepole_lp(w, sweep) - onepole_lp(w, sweep * 0.35)
        e = np.sin(np.linspace(0, np.pi, n)) ** 1.5
        thump = np.sin(2 * np.pi * np.cumsum(np.geomspace(140, 60, n)) / SR) * env(n, 0.002, 0.05, 4)
        pop = place(d, (d * 0.82, tone(1900 + 300 * k, 0.05, (1.0, 0.2), 0.001, 0.03) * 0.25))
        save(out / f"suck{k + 1}.wav", hiss * e * 1.1 + thump * 0.55 + pop)

    # --- start: rosnący trójdźwięk
    notes = [(0.00, 1046.5), (0.11, 1318.5), (0.22, 1568.0)]
    save(out / "chime_start.wav", place(0.75, *[(s, tone(f, 0.5, r=0.35) * 0.5) for s, f in notes]))

    # --- koniec: dwudźwięk w górę + oktawa
    notes = [(0.00, 1318.5), (0.13, 1760.0), (0.26, 2637.0)]
    save(out / "chime_done.wav", place(0.95, *[(s, tone(f, 0.6, r=0.45) * 0.45) for s, f in notes]))

    # --- ping lidaru przy wykryciu elementu
    save(out / "ping.wav", tone(2793.0, 0.09, (1.0, 0.1), 0.001, 0.05) * 0.35)

    # --- obrót lidaru: cichy „wirr” ze zmienną modulacją
    d = 2.6
    tt = t(d)
    whirr = np.sin(2 * np.pi * 210 * tt + 3 * np.sin(2 * np.pi * 7 * tt)) * 0.12
    whirr += bandnoise(len(tt), 900, 2600) * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * tt))
    e = np.minimum(1, tt / 0.15) * np.minimum(1, (d - tt) / 0.3)
    save(out / "scan.wav", whirr * e, peak=0.35)

    # --- pominięty element: niski „bloop”
    n = int(0.22 * SR)
    f = np.geomspace(420, 180, n)
    save(out / "skip.wav", np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.005, 0.18) * 0.5)

    # --- dokowanie: klik styków + „du-dip”
    click = bandnoise(int(0.03 * SR), 1500, 6000) * env(int(0.03 * SR), 0.0005, 0.012, 5) * 1.2
    clunk = np.sin(2 * np.pi * 95 * t(0.12)) * env(int(0.12 * SR), 0.001, 0.08, 4) * 0.6
    save(out / "dock.wav", place(0.75,
                                 (0.00, click), (0.00, clunk),
                                 (0.18, tone(1568.0, 0.35, r=0.25) * 0.45),
                                 (0.32, tone(2093.0, 0.4, r=0.3) * 0.45)))

    # --- opróżnianie w stacji: mocny wir powietrza + silnik stacji (nagranie obniżone) + grzechot
    d = 4.2
    tt = t(d)
    n = len(tt)
    station = x[a:a + int(d / 0.72 * SR)].mean(axis=1)
    idx = np.arange(n) * 0.72                                    # obniżenie wysokości o ~ 0,72×
    station = np.interp(idx, np.arange(len(station)), station)
    rise = np.clip(tt / 0.6, 0, 1) ** 1.5
    fall = np.clip((d - tt) / 0.9, 0, 1) ** 1.2
    shape = rise * fall
    cutoff = 300 + 5200 * shape
    w = rng.standard_normal(n)
    air = onepole_lp(w, cutoff) - onepole_lp(w, 120)
    rumble = np.sin(2 * np.pi * np.cumsum(55 + 25 * shape) / SR) * 0.35
    debris = np.zeros(n)
    for _ in range(70):                                          # drobiny lecące rurą
        s = int(rng.uniform(0.35, 1.9) * SR)
        m = int(0.012 * SR)
        debris[s:s + m] += rng.standard_normal(m) * env(m, 0.0005, 0.006, 4) * rng.uniform(0.2, 0.7)
    debris = onepole_lp(debris, 5000) - onepole_lp(debris, 1200)
    body = (station * 0.9 + air * 0.8 + rumble) * shape + debris * 0.8
    end_click = place(d, (d - 0.25, clunk * 0.8))
    mix = body + end_click
    stereo = np.stack([mix, np.roll(mix, int(0.0008 * SR))], axis=1)  # lekka szerokość
    save(out / "empty.wav", stereo)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
