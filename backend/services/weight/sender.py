"""
sender.py - Gui ban ghi can sang May B (app nhan) qua HTTP POST.
============================================================
- Co token bao mat (header Authorization: Bearer ...).
- Co hang doi offline: neu May B mat ket noi -> luu vao QUEUE_FILE,
  lan gui thanh cong sau se day bu het (khong mat so can).
- Chi dung thu vien chuan (urllib) -> khong can pip install.
- Gui tren thread rieng de khong block BLE.
"""

import json
import threading
import time
import urllib.request
import urllib.error

import config

_lock = threading.Lock()  # bao ve QUEUE_FILE khoi ghi dong thoi


def _auth_header():
    """Tra ve (ten_header, gia_tri) theo AUTH_MODE trong config. None neu khong xac thuc."""
    mode = getattr(config, "AUTH_MODE", "bearer").lower()
    token = getattr(config, "AUTH_TOKEN", "")
    if mode == "none" or not token:
        return None
    if mode == "bearer":
        return ("Authorization", f"Bearer {token}")
    if mode == "apikey":
        return ("X-API-Key", token)
    if mode == "custom":
        name = getattr(config, "AUTH_HEADER_NAME", "Authorization")
        return (name, token)
    # mode la (ten header tu dat) -> dung nguyen chuoi
    return ("Authorization", f"Bearer {token}")


def _post_once(record: dict) -> tuple[bool, bool]:
    """
    POST 1 lan. Tra ve (thanh_cong, nen_thu_lai).
    - thanh_cong=True neu web tra 2xx.
    - nen_thu_lai=True neu loi mang/timeout/5xx (dang thu lai duoc);
      False neu loi 4xx (sai token/sai data -> thu lai vo ich).
    """
    if not getattr(config, "RECEIVER_URL", ""):
        print("[sender] Chua dat RECEIVER_URL -> khong gui.")
        return (False, False)

    body = json.dumps(record, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(config.RECEIVER_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    hdr = _auth_header()
    if hdr:
        req.add_header(hdr[0], hdr[1])
    try:
        with urllib.request.urlopen(req, timeout=config.SEND_TIMEOUT) as resp:
            return (200 <= resp.status < 300, False)
    except urllib.error.HTTPError as e:
        # 4xx = loi phia client (sai token/data) -> khong thu lai.
        # 5xx = loi server -> co the thu lai + queue.
        retryable = e.code >= 500
        print(f"[sender] HTTP {e.code}: {e.reason}"
              + ("" if retryable else " (khong thu lai - kiem tra URL/token/schema)"))
        return (False, retryable)
    except Exception as e:
        # Mat mang / timeout / DNS loi -> thu lai + queue.
        print(f"[sender] Khong ket noi duoc web: {e}")
        return (False, True)


def _post(record: dict) -> bool:
    """POST co thu lai ngay (SEND_RETRIES lan) truoc khi bo cuoc."""
    retries = getattr(config, "SEND_RETRIES", 2)
    for attempt in range(retries + 1):
        ok, retryable = _post_once(record)
        if ok:
            return True
        if not retryable:
            return False  # loi 4xx -> thu lai vo ich, bo qua luon
        if attempt < retries:
            time.sleep(1.0 * (attempt + 1))  # cho tang dan roi thu lai
    return False


def _enqueue(record: dict) -> None:
    """Luu record vao file hang doi offline."""
    if not getattr(config, "QUEUE_FILE", None):
        return
    with _lock:
        with open(config.QUEUE_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _flush_queue() -> int:
    """Gui bu cac record ton trong hang doi. Tra ve so record da gui thanh cong."""
    qf = getattr(config, "QUEUE_FILE", None)
    if not qf:
        return 0
    with _lock:
        try:
            with open(qf, "r", encoding="utf-8") as f:
                lines = [ln for ln in f.read().splitlines() if ln.strip()]
        except FileNotFoundError:
            return 0

        remaining = []
        sent = 0
        for i, ln in enumerate(lines):
            try:
                rec = json.loads(ln)
            except Exception:
                continue  # bo dong hong
            if _post(rec):
                sent += 1
            else:
                # Loi giua chung -> giu lai record nay + tat ca record sau, thu lan sau
                remaining.extend(lines[i:])
                break
        # Ghi lai phan con lai
        with open(qf, "w", encoding="utf-8") as f:
            if remaining:
                f.write("\n".join(remaining) + "\n")
        if sent:
            print(f"[sender] Da gui bu {sent} ban ghi ton trong hang doi.")
        return sent


def _worker(record: dict) -> None:
    """Chay tren thread: gui record + day bu hang doi."""
    if not getattr(config, "SEND_TO_RECEIVER", True):
        return
    ok = _post(record)
    if ok:
        # Gui thanh cong -> co the May B da song lai -> day not hang doi.
        _flush_queue()
    else:
        # That bai -> cat vao hang doi de gui bu sau.
        _enqueue(record)


def send(record: dict) -> None:
    """Diem vao chinh: gui 1 ban ghi can (khong block - chay thread rieng)."""
    t = threading.Thread(target=_worker, args=(record,), daemon=True)
    t.start()


def flush_pending() -> None:
    """Goi luc khoi dong de day not cac record con ton tu lan chay truoc."""
    if getattr(config, "SEND_TO_RECEIVER", True):
        threading.Thread(target=_flush_queue, daemon=True).start()
