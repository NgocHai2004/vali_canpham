"""Xoa sach du lieu cua thoi 'phien lam viec' de seed lai theo schema `cases`.

Chay tay MOT LAN sau khi doi backend sang collection `cases`:

    .venv/Scripts/python.exe backend/scripts/drop_sessions.py           # chi in ra se xoa gi
    .venv/Scripts/python.exe backend/scripts/drop_sessions.py --yes     # xoa that

Mac dinh la DRY RUN — khong --yes thi khong xoa gi, chi dem. Chu y: script nay xoa
toan bo detainees / scene_traces / audit_logs, khong loc theo seed_demo, vi tat ca
dang mang field `session_id` cu. Da chot voi nguoi dung: khong migrate, khong backup.

Khong dung vao: users, admin_units, cells, settings, va thu muc uploads/latent_cut
(anh demo dung cho seed_scene_cases.py).
"""
import argparse
import os
import sys

from pymongo import MongoClient

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "app_cccd")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BACKEND_DIR, "uploads")
SCENE_DIR = os.path.join(UPLOAD_DIR, "scene")
SCENE_CROP_DIR = os.path.join(UPLOAD_DIR, "scene_crop")
REPORTS_DIR = os.path.join(UPLOAD_DIR, "reports")

# Anh ho so nghi pham nam ngay trong uploads/ (khong co thu muc rieng) nen phai
# xoa theo file thay vi xoa ca thu muc — trong uploads/ con avatars, latent_cut...
FLAT_UPLOAD_EXTS = (".png", ".jpg", ".jpeg")

# Counter cua thoi phien + counter seq anh hien truong theo phien cu.
STALE_COUNTER_PREFIXES = ("session_code_", "scene_seq_")


def _list_files(d: str, exts=None) -> list:
    if not os.path.isdir(d):
        return []
    out = []
    for f in os.listdir(d):
        p = os.path.join(d, f)
        if not os.path.isfile(p):
            continue
        if exts and not f.lower().endswith(exts):
            continue
        out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="Xoa that. Khong co co nay thi chi in ra.")
    ap.add_argument("--keep-files", action="store_true", help="Chi xoa trong DB, giu nguyen file anh.")
    args = ap.parse_args()

    db = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)[DB_NAME]
    db.command("ping")

    names = db.list_collection_names()
    has_work_sessions = "work_sessions" in names

    counts = {
        "work_sessions": db.work_sessions.count_documents({}) if has_work_sessions else 0,
        "detainees": db.detainees.count_documents({}),
        "scene_traces": db.scene_traces.count_documents({}),
        "audit_logs": db.audit_logs.count_documents({}),
        "cases": db.cases.count_documents({}) if "cases" in names else 0,
    }
    stale_counters = [
        d["_id"] for d in db.counters.find({}, {"_id": 1})
        if isinstance(d["_id"], str) and d["_id"].startswith(STALE_COUNTER_PREFIXES)
    ]

    files = {
        "uploads/*.png|jpg": _list_files(UPLOAD_DIR, FLAT_UPLOAD_EXTS),
        "uploads/scene": _list_files(SCENE_DIR),
        "uploads/scene_crop": _list_files(SCENE_CROP_DIR),
        "uploads/reports": _list_files(REPORTS_DIR),
    }

    print(f"DB {DB_NAME} @ {MONGO_URL}")
    print("-- se xoa trong DB --")
    print(f"  work_sessions  : {counts['work_sessions']}" + ("" if has_work_sessions else "  (collection khong ton tai)"))
    print(f"  detainees      : {counts['detainees']}")
    print(f"  scene_traces   : {counts['scene_traces']}")
    print(f"  audit_logs     : {counts['audit_logs']}")
    print(f"  counters cu    : {len(stale_counters)} ({', '.join(stale_counters[:5])}{' ...' if len(stale_counters) > 5 else ''})")
    print(f"  GIU LAI cases  : {counts['cases']} (khong xoa)")
    if args.keep_files:
        print("-- file: giu nguyen (--keep-files) --")
    else:
        print("-- se xoa file --")
        for k, v in files.items():
            print(f"  {k:<22}: {len(v)} file")

    if not args.yes:
        print("\nDRY RUN. Chay lai voi --yes de xoa that.")
        return

    if has_work_sessions:
        db.work_sessions.drop()
        print("[db] drop collection work_sessions")
    for coll in ("detainees", "scene_traces", "audit_logs"):
        r = db[coll].delete_many({})
        print(f"[db] {coll}: xoa {r.deleted_count}")
    if stale_counters:
        r = db.counters.delete_many({"_id": {"$in": stale_counters}})
        print(f"[db] counters: xoa {r.deleted_count}")

    if not args.keep_files:
        n_ok = n_err = 0
        for group in files.values():
            for p in group:
                try:
                    os.remove(p)
                    n_ok += 1
                except OSError as e:
                    n_err += 1
                    print(f"  loi xoa {p}: {e}")
        print(f"[file] xoa {n_ok} file" + (f", {n_err} loi" if n_err else ""))

    print("\nXong. Seed lai:")
    print("  .venv/Scripts/python.exe -m backend.seed_dashboard --reset")
    print("  .venv/Scripts/python.exe backend/seed_scene_cases.py")


if __name__ == "__main__":
    main()
