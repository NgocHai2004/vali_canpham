"""Sinh anh GIA cho demo Dau vet hien truong (2 bo, dung ten file ma sceneDemo.js cho).

Chay: python backend/gen_scene_images.py

  uploads/latent_cut/    17 anh latent, kho doc ~2:3  (vet hien truong)
  uploads/vantay_synth/  49 ban van tay 380x380       (van tay doi chieu)

Anh dung bang ham sin — KHONG phai van tay that cua bat ky ai, chi de xem bo cuc
UI. Khong dung cho doi sanh/nghiep vu. Deterministic nen chay lai ra dung bo cu.
Hai thu muc nam trong .gitignore (backend/uploads/) nen anh khong vao repo.
"""
import math
import os
import random

from PIL import Image, ImageFilter

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")

# Ten file phai khop LATENT / ENROLLED trong frontend/src/sceneDemo.js.
LATENT = [f"dauvantay_{i:02d}.png" for i in range(1, 11)] + \
         [f"vantay_{i:02d}.png" for i in range(2, 9)]
ENROLLED = [f"vantay_synth_{i:02d}.png" for i in range(2, 51)]

PATTERNS = ("loop", "whorl", "arch")


def phase(kind, dx, dy, warp):
    """Pha song van tay tai 1 diem — doi kind ra 3 dang van co ban."""
    if kind == "whorl":
        return math.hypot(dx, dy * 0.92) * 0.40 + 2.6 * math.atan2(dy, dx) + warp
    if kind == "arch":
        return 0.40 * (dy + 46.0 * math.exp(-(dx * dx) / 18050.0)) + warp
    return math.hypot(dx, dy * 0.86) * 0.42 + 2.2 * math.sin(math.atan2(dy, dx)) + warp


def render(w, h, seed, latent):
    """latent=True: vet mo, in mot phan (mask elip + mang dam nhat), nen ban.
    latent=False: ban lan day khung, net va deu — giong anh da thu nhan."""
    rnd = random.Random(seed)
    kind = PATTERNS[seed % len(PATTERNS)]
    cx = w * 0.5 + rnd.uniform(-0.10, 0.10) * w
    cy = h * 0.52 + rnd.uniform(-0.10, 0.10) * h
    p1, p2 = rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)
    a1, a2 = rnd.uniform(3, 8), rnd.uniform(3, 8)
    scale = h / 460.0
    rx = rnd.uniform(0.31, 0.42) * w / scale
    ry = rnd.uniform(0.33, 0.44) * h / scale
    tilt = rnd.uniform(-0.5, 0.5)
    ct, st = math.cos(tilt), math.sin(tilt)
    bg = rnd.randint(198, 220) if latent else rnd.randint(232, 245)
    ink = rnd.randint(28, 60) if latent else rnd.randint(18, 38)
    grain = 6 if latent else 2
    pitch = 29.0 * scale

    buf = bytearray(w * h)
    for y in range(h):
        sy = math.sin(y / pitch + p2)
        row = y * w
        for x in range(w):
            dx, dy = (x - cx) / scale, (y - cy) / scale
            warp = a1 * math.sin(x / (37.0 * scale) + p1) + a2 * sy
            ridge = (0.5 + 0.5 * math.sin(phase(kind, dx, dy, warp))) ** 0.65
            ux, uy = dx * ct + dy * st, -dx * st + dy * ct
            d = math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2)
            if latent:
                # Vet latent chi in duoc mot phan: bien mo dan + mang dam nhat.
                m = max(0.0, min(1.0, 1.0 - (d - 0.55) / 0.45))
                m *= max(0.0, 0.55 + 0.45 * math.sin(x / 53.0 + y / 71.0 + p1))
            else:
                m = max(0.0, min(1.0, 1.0 - (d - 0.90) / 0.18))
            v = int((bg + rnd.randint(-grain, grain)) - (bg - ink) * ridge * m)
            buf[row + x] = 0 if v < 0 else (255 if v > 255 else v)

    img = Image.frombytes("L", (w, h), bytes(buf))
    return img.filter(ImageFilter.GaussianBlur(0.6 if latent else 0.35))


def main():
    for sub, names, latent in (("latent_cut", LATENT, True),
                               ("vantay_synth", ENROLLED, False)):
        out = os.path.join(BASE, sub)
        os.makedirs(out, exist_ok=True)
        for i, name in enumerate(names):
            if latent:
                rnd = random.Random(7000 + i)
                w, h = rnd.randint(130, 146), rnd.randint(188, 217)
            else:
                w = h = 380
            render(w, h, 1000 + i if latent else 5000 + i, latent).save(
                os.path.join(out, name), "PNG", optimize=True)
        print(f"  {sub}/: {len(names)} anh")
    print("OK")


if __name__ == "__main__":
    main()
