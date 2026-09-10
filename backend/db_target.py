"""Chon DB Mongo theo nhanh git dang checkout.

Ly do ton tai: nhanh `Hai_dev` va `main` KHONG cung schema — Hai_dev dung
collection `cases` + khoa ngoai `case_id`, main dung `work_sessions` +
`session_id`. Hai schema nay dung chung mot ten DB thi nhanh nay doc khong ra
du lieu nhanh kia (bang hien "Tong: 0"), va nang hon la seed/ghi cua nhanh nay
lam ban DB cua nhanh kia.

Nen: moi nhanh mot DB rieng. `Hai_dev` giu nguyen DB that `app_cccd`, cac nhanh
khac di vao DB rieng cua no.

Thu tu uu tien:
  1. env var DB_NAME (ke ca tu App_CCCD/.env) — cua sau de override thu cong.
  2. Ten nhanh git hien tai -> tra bang BRANCH_DB.
  3. Khong doc duoc git -> app_cccd (giu y nguyen hanh vi cu, khong tu dung
     mot DB rong lam nguoi dung tuong mat du lieu).
"""

from __future__ import annotations

import os
import subprocess

# DB that cua don vi. Chi nhanh Hai_dev duoc cham vao.
DB_REAL = "app_cccd"

# Nhanh -> DB. Nhanh khong liet ke o day dung DB_FALLBACK_FMT.
BRANCH_DB = {
    "Hai_dev": DB_REAL,
}

# Nhanh la (main, quang-dev, vali_*...) -> app_cccd_<nhanh da chuan hoa>.
DB_FALLBACK_FMT = "app_cccd_{branch}"

_cached: str | None = None


def _repo_root() -> str:
    """app_cccd/ — thu muc cha cua backend/."""
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def current_branch() -> str:
    """Ten nhanh git dang checkout, "" neu khong xac dinh duoc.

    Detached HEAD tra ve "HEAD" — coi nhu khong xac dinh, vi luc do khong biet
    dang o schema nao.
    """
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=_repo_root(),
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    if out.returncode != 0:
        return ""
    branch = (out.stdout or "").strip()
    return "" if branch in ("", "HEAD") else branch


def _slug(branch: str) -> str:
    """Ten nhanh -> doan an toan cho ten DB Mongo.

    Mongo cam / \\ . " $ * < > : | ? va khoang trang trong ten DB, nen doi het
    ky tu la thanh "_". Vi du "feature/abc" -> "feature_abc".
    """
    keep = [c if (c.isalnum() or c == "_") else "_" for c in branch]
    return "".join(keep).strip("_").lower() or "unknown"


def db_name_for_branch(branch: str) -> str:
    if branch in BRANCH_DB:
        return BRANCH_DB[branch]
    if not branch:
        return DB_REAL
    return DB_FALLBACK_FMT.format(branch=_slug(branch))


def resolve_db_name(verbose: bool = True) -> str:
    """Ten DB dung cho tien trinh nay. Cache lai — khong goi git moi request."""
    global _cached
    if _cached is not None:
        return _cached

    override = (os.getenv("DB_NAME") or "").strip()
    if override:
        _cached = override
        if verbose:
            print(f"[db_target] DB_NAME override -> {override}")
        return _cached

    branch = current_branch()
    _cached = db_name_for_branch(branch)
    if verbose:
        tag = "DATA THAT" if _cached == DB_REAL else "data rieng cua nhanh"
        shown = branch or "(khong xac dinh duoc)"
        print(f"[db_target] branch={shown} -> DB={_cached} ({tag})")
    return _cached


def is_real_db(name: str) -> bool:
    return name == DB_REAL
