"""
Demo CLI cho ZKFinger SDK (SLK20R / Live20R) qua Python.

Menu:
  1) Dang ky van tay (enroll) - dat cung 1 ngon 3 lan
  2) Nhan dien 1:N (identify)  - dat 1 ngon, tim trong DB
  3) So sanh 1:1 (verify)      - so voi ID cu the
  4) Liet ke - Xoa - Xoa tat ca
  5) Xuat file BMP anh van tay vua chup
  6) Thoat

Templates duoc luu ra file JSON de tai lai lan sau.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zkfp


DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fingerprints.json")


def load_db() -> dict[int, str]:
    if not os.path.exists(DB_FILE):
        return {}
    with open(DB_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


def save_db(db: dict[int, str]) -> None:
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump({str(k): v for k, v in db.items()}, f, indent=2)


def restore_to_device(dev: zkfp.ZKFP, db: dict[int, str]) -> None:
    for fid, b64 in db.items():
        tmpl = base64.b64decode(b64)
        dev.db_add(fid, tmpl)


def wait_for_finger(dev: zkfp.ZKFP, prompt: str, timeout_s: int = 20):
    print(prompt)
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        result = dev.acquire()
        if result is not None:
            return result
        time.sleep(0.2)
    return None


def enroll(dev: zkfp.ZKFP, db: dict[int, str]) -> None:
    next_id = max(db.keys(), default=0) + 1
    print(f"\n== Dang ky van tay moi (ID={next_id}) ==")
    templates = []
    for i in range(3):
        while True:
            result = wait_for_finger(dev, f"[{i+1}/3] Dat ngon tay len sensor...")
            if result is None:
                print("Timeout, thu lai.")
                continue
            _img, tmpl = result
            if i > 0:
                score = dev.match(tmpl, templates[-1])
                if score <= 0:
                    print(f"Khong khop voi lan truoc (score={score}). Dat DUNG ngon do.")
                    _wait_release()
                    continue
            templates.append(tmpl)
            print(f"  OK ({len(tmpl)} bytes)")
            break
        _wait_release()

    try:
        merged = dev.merge(templates[0], templates[1], templates[2])
    except zkfp.ZKFPError as e:
        print(f"Ghep 3 mau that bai: {e}")
        return

    try:
        dev.db_add(next_id, merged)
    except zkfp.ZKFPError as e:
        print(f"Them vao DB that bai: {e}")
        return

    db[next_id] = base64.b64encode(merged).decode("ascii")
    save_db(db)
    print(f"Dang ky thanh cong. ID={next_id}. Tong so mau trong DB: {len(db)}\n")


def identify(dev: zkfp.ZKFP) -> None:
    print("\n== Nhan dien (1:N) ==")
    result = wait_for_finger(dev, "Dat ngon tay len sensor...")
    if result is None:
        print("Khong lay duoc van tay.\n")
        return
    _img, tmpl = result
    match = dev.identify(tmpl)
    if match is None:
        print("Khong tim thay trong DB.\n")
    else:
        fid, score = match
        print(f"KHOP: ID={fid}, score={score}\n")
    _wait_release()


def verify(dev: zkfp.ZKFP, db: dict[int, str]) -> None:
    if not db:
        print("DB rong.\n")
        return
    print("\n== So sanh 1:1 ==")
    print("Cac ID hien co:", sorted(db.keys()))
    try:
        fid = int(input("Nhap ID de so sanh: "))
    except ValueError:
        print("ID khong hop le.\n")
        return
    if fid not in db:
        print("ID khong ton tai.\n")
        return
    stored = base64.b64decode(db[fid])
    result = wait_for_finger(dev, "Dat ngon tay len sensor...")
    if result is None:
        print("Khong lay duoc van tay.\n")
        return
    _img, tmpl = result
    score = dev.match(tmpl, stored)
    if score > 0:
        print(f"KHOP voi ID={fid}, score={score}\n")
    else:
        print(f"KHONG khop (rc={score})\n")
    _wait_release()


def manage(dev: zkfp.ZKFP, db: dict[int, str]) -> None:
    print("\n== Quan ly DB ==")
    print("Cac ID:", sorted(db.keys()) or "(trong)")
    print("1) Xoa 1 ID    2) Xoa tat ca    3) Quay lai")
    c = input("> ").strip()
    if c == "1":
        try:
            fid = int(input("ID can xoa: "))
        except ValueError:
            return
        if fid in db:
            try:
                dev.db_del(fid)
            except zkfp.ZKFPError:
                pass
            db.pop(fid)
            save_db(db)
            print("Da xoa.\n")
        else:
            print("Khong co ID do.\n")
    elif c == "2":
        confirm = input("Xoa TAT CA (y/N)? ").strip().lower()
        if confirm == "y":
            dev.db_clear()
            db.clear()
            save_db(db)
            print("Da xoa tat ca.\n")


def snapshot_bmp(dev: zkfp.ZKFP) -> None:
    print("\n== Xuat anh van tay ra BMP ==")
    result = wait_for_finger(dev, "Dat ngon tay len sensor...")
    if result is None:
        print("Timeout.\n")
        return
    img, _tmpl = result
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capture.bmp")
    dev.save_bmp(img, out)
    print(f"Da luu: {out}\n")


def _wait_release() -> None:
    # cho nguoi dung nhac ngon tay ra truoc lan doc tiep theo
    time.sleep(0.8)


def main() -> None:
    print("Dang khoi tao ZKFinger SDK...")
    try:
        dev = zkfp.ZKFP()
        dev.init()
        if dev.device_count() < 1:
            print("Khong tim thay thiet bi. Kiem tra cap USB va driver.")
            dev.terminate()
            return
        dev.open(0)
    except zkfp.ZKFPError as e:
        print(f"Loi khoi tao: {e}")
        return

    print(f"Thiet bi mo OK. Kich thuoc anh: {dev.width}x{dev.height}")
    dev.set_threshold_1n(50)
    dev.set_threshold_11(20)

    db = load_db()
    if db:
        print(f"Tim thay {len(db)} mau trong {DB_FILE}, dang nap vao thiet bi...")
        try:
            restore_to_device(dev, db)
        except zkfp.ZKFPError as e:
            print(f"Loi khi nap: {e}")

    try:
        while True:
            print("=" * 40)
            print("1) Dang ky van tay (enroll)")
            print("2) Nhan dien (identify 1:N)")
            print("3) So sanh voi ID (verify 1:1)")
            print("4) Quan ly DB")
            print("5) Xuat anh van tay ra BMP")
            print("6) Thoat")
            choice = input("> ").strip()
            if choice == "1":
                enroll(dev, db)
            elif choice == "2":
                identify(dev)
            elif choice == "3":
                verify(dev, db)
            elif choice == "4":
                manage(dev, db)
            elif choice == "5":
                snapshot_bmp(dev)
            elif choice == "6":
                break
            else:
                print("Lua chon khong hop le.\n")
    finally:
        dev.terminate()
        print("Da dong thiet bi.")


if __name__ == "__main__":
    main()
