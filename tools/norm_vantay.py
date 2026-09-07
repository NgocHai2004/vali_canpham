"""Chuan hoa anh van tay: crop ve vung van + pad lai ve canvas chung.

Van de: 68 file deu 800x750 nhung van tay ben trong chiem cho khac nhau
(latent 50-78% ngang, synth 46-94%) => cung khung ma nhin to nho khac nhau.
Cach xu: tim bbox vung van -> crop -> scale cho vung van cao dung FILL% canvas
-> dan giua canvas OUT_W x OUT_H, nen lay mau nen cuc bo cua tung anh.

Chay:  python tools/norm_vantay.py <src_dir> <out_dir>
"""
import sys, os, glob
import numpy as np
from PIL import Image
from scipy import ndimage

OUT_W, OUT_H = 800, 750
FILL   = 0.88   # vung van chiem 88% chieu cao canvas
MARGIN = 0.06   # chua ria an toan quanh bbox (bu phan van mo dan ra bien)


def bg_level(a):
    """Nen = median cua 4 bien. Anh synth co lop nen xam ~239 trong o 750x750,
    nen KHONG hardcode 255: pad bang 255 se de lai khung xam lo ro."""
    return float(np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])))


def print_box(a):
    """bbox vung van. Nguong cung (a<200) khong dung duoc: van mo dan ra bien nen
    bbox nhay toi 210px khi doi nguong, va 29/68 file co dom nhieu keo phong bbox.
    Nen: do DAM so voi nen -> lam min 25px cho van roi rac thanh vung lien ->
    lay cum co nhieu muc nhat (bo dom nhieu)."""
    ink = np.clip(bg_level(a) - a, 0, None)
    sm = ndimage.uniform_filter(ink, 25)
    if sm.max() <= 0:
        return None
    lab, n = ndimage.label(ndimage.binary_closing(sm > 0.12 * sm.max(), np.ones((15, 15))))
    if n == 0:
        return None
    k = int(np.argmax(ndimage.sum(ink, lab, range(1, n + 1)))) + 1
    ys, xs = np.where(lab == k)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def norm(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im.convert("L")).astype(float)
    box = print_box(a)
    if box is None:
        return None, None
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    mx, my = int(w * MARGIN), int(h * MARGIN)
    crop = im.crop((max(0, x0 - mx), max(0, y0 - my),
                    min(im.width, x1 + mx), min(im.height, y1 + my)))

    # scale theo vung van (khong theo crop) => moi anh van tay cao bang nhau
    k = (OUT_H * FILL) / h
    cw, ch = max(1, round(crop.width * k)), max(1, round(crop.height * k))
    if cw > OUT_W:                      # van qua be ngang -> bo theo chieu rong
        k *= OUT_W / cw
        cw, ch = max(1, round(crop.width * k)), max(1, round(crop.height * k))
    crop = crop.resize((cw, ch), Image.LANCZOS)

    bg = int(round(bg_level(np.asarray(crop.convert("L")).astype(float))))
    out = Image.new("RGB", (OUT_W, OUT_H), (bg, bg, bg))
    out.paste(crop, ((OUT_W - cw) // 2, (OUT_H - ch) // 2))
    return out, (w, h, round(100 * w / im.width), round(100 * h / im.height))


def main(src, dst):
    os.makedirs(dst, exist_ok=True)
    fracs, fails = [], []
    for f in sorted(glob.glob(os.path.join(src, "*.png"))):
        out, st = norm(f)
        name = os.path.basename(f)
        if out is None:
            fails.append(name)
            continue
        out.save(os.path.join(dst, name))
        fracs.append(st[2])
        print(f"  {name:24} van {st[0]}x{st[1]} ({st[2]}%x{st[3]}% canvas cu)")
    print(f"-> {len(fracs)} file. Truoc: van chiem {min(fracs)}-{max(fracs)}% ngang."
          f" Sau: cao dong deu {FILL:.0%} canvas.")
    if fails:
        print("   THAT BAI:", fails)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
