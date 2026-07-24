"""
GUI Tkinter cho ZKFinger SDK (SLK20R / Live20R).

Cung data model voi api.py:
    users.json = {"1": {"name": "...", "fingers": {"left_thumb": "<b64>", ...}}, ...}
    FID trong SDK DB cache: user_id * 10 + finger_index

Chuc nang:
  - Init / Close thiet bi
  - Live preview
  - Enroll 10 ngon (tuan tu, ten tieng Viet, highlight ngon dang cho)
  - Identify: 1 ngon bat ky -> ten user + ten ngon
  - Danh sach user + xoa + doi ten
  - Chinh nguong 1:N, 1:1

Chay: python demo_gui.py
"""
from __future__ import annotations

import base64
import json
import os
import queue
import sys
import threading
import time
import tkinter as tk
from tkinter import messagebox, simpledialog, ttk

from PIL import Image, ImageTk

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zkfp


# ---------- 10 ngon tay (dong bo voi api.py) ----------
FINGERS: list[dict[str, str]] = [
    {"code": "left_little",  "name_vi": "Ut trai",    "hand": "left"},
    {"code": "left_ring",    "name_vi": "Ap ut trai", "hand": "left"},
    {"code": "left_middle",  "name_vi": "Giua trai",  "hand": "left"},
    {"code": "left_index",   "name_vi": "Tro trai",   "hand": "left"},
    {"code": "left_thumb",   "name_vi": "Cai trai",   "hand": "left"},
    {"code": "right_thumb",  "name_vi": "Cai phai",   "hand": "right"},
    {"code": "right_index",  "name_vi": "Tro phai",   "hand": "right"},
    {"code": "right_middle", "name_vi": "Giua phai",  "hand": "right"},
    {"code": "right_ring",   "name_vi": "Ap ut phai", "hand": "right"},
    {"code": "right_little", "name_vi": "Ut phai",    "hand": "right"},
]
FINGER_CODES = [f["code"] for f in FINGERS]
FINGER_INDEX = {c: i for i, c in enumerate(FINGER_CODES)}
FINGER_NAME = {f["code"]: f["name_vi"] for f in FINGERS}


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_FILE = os.path.join(BASE_DIR, "users.json")


def load_users() -> dict[int, dict]:
    if not os.path.exists(USERS_FILE):
        return {}
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


def save_users(users: dict[int, dict]) -> None:
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump({str(k): v for k, v in users.items()}, f, indent=2,
                  ensure_ascii=False)


class ZKApp(tk.Tk):
    MODE_IDLE = "idle"
    MODE_ENROLL = "enroll"
    MODE_IDENTIFY = "identify"

    def __init__(self) -> None:
        super().__init__()
        self.title("ZKFinger - Dang ky 10 ngon & Nhan dien")
        self.geometry("1000x700")
        self.minsize(960, 660)

        self.dev: zkfp.ZKFP | None = None
        self.users: dict[int, dict] = {}
        self.mode = self.MODE_IDLE
        self.enroll_user_name: str = ""
        self.enroll_progress: dict[str, str] = {}  # code -> b64 template
        self.enroll_next_index: int = 0
        self.last_enrolled_code: str | None = None

        self.capture_thread: threading.Thread | None = None
        self.stop_capture = threading.Event()
        self.event_q: queue.Queue = queue.Queue()
        self._preview_photo = None

        self._build_ui()
        self._poll_events()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ------------- UI -------------
    def _build_ui(self) -> None:
        # Top bar
        top = ttk.Frame(self, padding=(10, 10, 10, 6))
        top.pack(fill="x")
        self.status_var = tk.StringVar(value="Chua khoi tao.")
        self.status_label = ttk.Label(top, textvariable=self.status_var,
                                      foreground="#0a0", font=("Segoe UI", 10, "bold"))
        self.status_label.pack(side="left")

        self.btn_init = ttk.Button(top, text="Init + Open",
                                   command=self._on_init_open)
        self.btn_init.pack(side="right", padx=4)
        self.btn_close_dev = ttk.Button(top, text="Close", state="disabled",
                                        command=self._on_close_dev)
        self.btn_close_dev.pack(side="right", padx=4)

        # Notebook
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self._build_enroll_tab()
        self._build_identify_tab()
        self._build_users_tab()

    def _build_enroll_tab(self) -> None:
        tab = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(tab, text="1. Dang ky (10 ngon)")

        # Left column: hand grid + progress
        left = ttk.Frame(tab)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 10))

        name_row = ttk.Frame(left)
        name_row.pack(fill="x", pady=(0, 8))
        ttk.Label(name_row, text="Ho ten:", width=8).pack(side="left")
        self.name_entry = ttk.Entry(name_row)
        self.name_entry.pack(side="left", fill="x", expand=True, padx=(4, 8))
        self.btn_start = ttk.Button(name_row, text="Bat dau", state="disabled",
                                    command=self._on_start_enroll)
        self.btn_start.pack(side="left")

        prog_row = ttk.Frame(left)
        prog_row.pack(fill="x", pady=(0, 8))
        self.progress_var = tk.IntVar(value=0)
        ttk.Progressbar(prog_row, variable=self.progress_var, maximum=10,
                        length=280).pack(side="left")
        self.progress_text = ttk.Label(prog_row, text="0 / 10")
        self.progress_text.pack(side="left", padx=8)

        # Two hand columns
        hands = ttk.Frame(left)
        hands.pack(fill="both", expand=True)
        ttk.Label(hands, text="Tay trai", font=("Segoe UI", 10, "bold")
                  ).grid(row=0, column=0, pady=(0, 4))
        ttk.Label(hands, text="Tay phai", font=("Segoe UI", 10, "bold")
                  ).grid(row=0, column=1, pady=(0, 4))
        self.finger_widgets: dict[str, ttk.Label] = {}
        left_fingers = [f for f in FINGERS if f["hand"] == "left"]
        right_fingers = [f for f in FINGERS if f["hand"] == "right"]
        for i, f in enumerate(left_fingers):
            lbl = self._make_finger_row(hands, f)
            lbl.grid(row=i + 1, column=0, sticky="ew", padx=4, pady=3)
            self.finger_widgets[f["code"]] = lbl
        for i, f in enumerate(right_fingers):
            lbl = self._make_finger_row(hands, f)
            lbl.grid(row=i + 1, column=1, sticky="ew", padx=4, pady=3)
            self.finger_widgets[f["code"]] = lbl
        hands.columnconfigure(0, weight=1)
        hands.columnconfigure(1, weight=1)

        # Right column: current instruction + preview + actions
        right = ttk.Frame(tab)
        right.grid(row=0, column=1, sticky="nsew")

        instr_box = ttk.LabelFrame(right, text="Buoc tiep theo", padding=10)
        instr_box.pack(fill="x")
        self.current_name_var = tk.StringVar(value="—")
        ttk.Label(instr_box, textvariable=self.current_name_var,
                  font=("Segoe UI", 16, "bold"), foreground="#1f6feb"
                  ).pack(anchor="w")
        self.hint_var = tk.StringVar(value="Nhap ho ten roi bam \"Bat dau\".")
        ttk.Label(instr_box, textvariable=self.hint_var, wraplength=320,
                  foreground="#4b5563").pack(anchor="w", pady=(4, 0))
        self.enroll_msg_var = tk.StringVar(value="")
        ttk.Label(instr_box, textvariable=self.enroll_msg_var,
                  foreground="#b45309", wraplength=320,
                  font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(6, 0))

        prev_box = ttk.LabelFrame(right, text="Anh van tay", padding=10)
        prev_box.pack(fill="both", expand=True, pady=(8, 0))
        self.canvas = tk.Canvas(prev_box, width=280, height=340, bg="#0f172a",
                                highlightthickness=1, highlightbackground="#334155")
        self.canvas.pack()

        btns = ttk.Frame(right)
        btns.pack(fill="x", pady=(8, 0))
        self.btn_redo = ttk.Button(btns, text="Chup lai ngon vua roi",
                                   state="disabled", command=self._on_redo)
        self.btn_redo.pack(side="left", padx=(0, 6))
        self.btn_cancel_enroll = ttk.Button(btns, text="Huy",
                                            state="disabled",
                                            command=self._cancel_enroll)
        self.btn_cancel_enroll.pack(side="left")

        tab.columnconfigure(0, weight=1)
        tab.columnconfigure(1, weight=0)
        tab.rowconfigure(0, weight=1)

    def _make_finger_row(self, parent, f: dict) -> ttk.Label:
        lbl = tk.Label(parent, text=f"  ○  {f['name_vi']}",
                       anchor="w", padx=10, pady=8,
                       bg="#f0f3f9", fg="#1c2536",
                       font=("Segoe UI", 10), relief="flat", bd=0,
                       highlightthickness=2, highlightbackground="#f0f3f9",
                       highlightcolor="#f0f3f9", width=18)
        return lbl

    def _update_finger_row(self, code: str, state: str) -> None:
        """state: 'idle' | 'active' | 'done'"""
        lbl = self.finger_widgets.get(code)
        if not lbl:
            return
        name = FINGER_NAME[code]
        if state == "done":
            lbl.config(text=f"  ●  {name}   [Xong]",
                       bg="#e6f7ec", fg="#14532d",
                       highlightbackground="#22c55e", highlightcolor="#22c55e")
        elif state == "active":
            lbl.config(text=f"  ●  {name}   [Dang cho]",
                       bg="#fff4e0", fg="#7c2d12",
                       highlightbackground="#f59e0b", highlightcolor="#f59e0b")
        else:
            lbl.config(text=f"  ○  {name}",
                       bg="#f0f3f9", fg="#1c2536",
                       highlightbackground="#f0f3f9", highlightcolor="#f0f3f9")

    def _build_identify_tab(self) -> None:
        tab = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(tab, text="2. Nhan dien (1 ngon)")

        info = ttk.Label(tab, text="Dat 1 ngon bat ky (trong 10 ngon da dang ky) len sensor.",
                         font=("Segoe UI", 10))
        info.pack(anchor="w")

        toolbar = ttk.Frame(tab)
        toolbar.pack(fill="x", pady=(8, 0))
        self.btn_identify = ttk.Button(toolbar, text="Dat ngon tay & Xac thuc",
                                       state="disabled", command=self._on_identify)
        self.btn_identify.pack(side="left")
        self.btn_cancel_identify = ttk.Button(toolbar, text="Huy",
                                              state="disabled",
                                              command=self._cancel_identify)
        self.btn_cancel_identify.pack(side="left", padx=6)

        body = ttk.Frame(tab)
        body.pack(fill="both", expand=True, pady=(10, 0))

        result_box = ttk.LabelFrame(body, text="Ket qua", padding=12)
        result_box.pack(side="left", fill="both", expand=True, padx=(0, 8))
        self.id_result_var = tk.StringVar(value="Chua co ket qua.")
        self.id_result_label = tk.Label(result_box, textvariable=self.id_result_var,
                                        justify="left", anchor="nw",
                                        font=("Segoe UI", 11), wraplength=440,
                                        bg="#f0f3f9", padx=12, pady=12)
        self.id_result_label.pack(fill="both", expand=True)

        prev_box = ttk.LabelFrame(body, text="Anh van tay", padding=10)
        prev_box.pack(side="right")
        self.id_canvas = tk.Canvas(prev_box, width=240, height=300, bg="#0f172a",
                                   highlightthickness=1,
                                   highlightbackground="#334155")
        self.id_canvas.pack()
        self._id_preview_photo = None

    def _build_users_tab(self) -> None:
        tab = ttk.Frame(self.notebook, padding=10)
        self.notebook.add(tab, text="3. Nguoi dung")

        tools = ttk.Frame(tab)
        tools.pack(fill="x", pady=(0, 8))
        ttk.Button(tools, text="Tai lai", command=self._refresh_users_list).pack(side="left")
        ttk.Button(tools, text="Doi ten", command=self._rename_user).pack(side="left", padx=6)
        ttk.Button(tools, text="Xoa", command=self._delete_user).pack(side="left")

        # Threshold
        th_box = ttk.LabelFrame(tools, text="Nguong (0-100)", padding=6)
        th_box.pack(side="right")
        ttk.Label(th_box, text="1:N").grid(row=0, column=0)
        self.th_1n = tk.IntVar(value=50)
        ttk.Spinbox(th_box, from_=0, to=100, width=5, textvariable=self.th_1n,
                    command=self._on_threshold_change).grid(row=0, column=1, padx=4)
        ttk.Label(th_box, text="1:1").grid(row=0, column=2, padx=(8, 0))
        self.th_11 = tk.IntVar(value=20)
        ttk.Spinbox(th_box, from_=0, to=100, width=5, textvariable=self.th_11,
                    command=self._on_threshold_change).grid(row=0, column=3, padx=4)

        cols = ("id", "name", "fingers", "created")
        self.tree = ttk.Treeview(tab, columns=cols, show="headings", height=18)
        self.tree.heading("id", text="ID")
        self.tree.heading("name", text="Ho ten")
        self.tree.heading("fingers", text="So ngon")
        self.tree.heading("created", text="Ngay tao")
        self.tree.column("id", width=60, anchor="center")
        self.tree.column("name", width=280)
        self.tree.column("fingers", width=80, anchor="center")
        self.tree.column("created", width=180)
        self.tree.pack(fill="both", expand=True)

    # ------------- Device lifecycle -------------
    def _set_status(self, msg: str, kind: str = "info") -> None:
        colors = {"info": "#0a0", "warn": "#c80", "err": "#c00"}
        self.status_var.set(msg)
        self.status_label.config(foreground=colors.get(kind, "#0a0"))

    def _on_init_open(self) -> None:
        try:
            self.dev = zkfp.ZKFP()
            self.dev.init()
            if self.dev.device_count() < 1:
                self.dev.terminate()
                self.dev = None
                self._set_status("Khong tim thay thiet bi.", "err")
                messagebox.showerror("Loi", "Khong tim thay thiet bi. Kiem tra cap USB.")
                return
            self.dev.open(0)
            self.dev.set_threshold_1n(self.th_1n.get())
            self.dev.set_threshold_11(self.th_11.get())
        except zkfp.ZKFPError as e:
            self._set_status(f"Loi: {e}", "err")
            messagebox.showerror("Loi", str(e))
            return

        # Nap users vao SDK DB cache
        self.users = load_users()
        for uid, u in self.users.items():
            for code, b64 in u.get("fingers", {}).items():
                if code not in FINGER_INDEX:
                    continue
                fid = uid * 10 + FINGER_INDEX[code]
                try:
                    self.dev.db_add(fid, base64.b64decode(b64))
                except zkfp.ZKFPError:
                    pass
        self._refresh_users_list()

        self.stop_capture.clear()
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.capture_thread.start()

        self.btn_init.config(state="disabled")
        self.btn_close_dev.config(state="normal")
        self.btn_start.config(state="normal")
        self.btn_identify.config(state="normal")
        self._set_status(f"Da mo thiet bi ({self.dev.width}x{self.dev.height}). "
                         f"Da nap {len(self.users)} nguoi dung.", "info")

    def _on_close_dev(self) -> None:
        self.stop_capture.set()
        if self.capture_thread:
            self.capture_thread.join(timeout=2)
            self.capture_thread = None
        if self.dev:
            self.dev.terminate()
            self.dev = None
        self.btn_init.config(state="normal")
        self.btn_close_dev.config(state="disabled")
        self.btn_start.config(state="disabled")
        self.btn_identify.config(state="disabled")
        self._reset_enroll_ui()
        self.mode = self.MODE_IDLE
        self._set_status("Da dong thiet bi.", "info")

    def _on_close(self) -> None:
        try:
            self._on_close_dev()
        finally:
            self.destroy()

    def _on_threshold_change(self) -> None:
        if self.dev:
            self.dev.set_threshold_1n(self.th_1n.get())
            self.dev.set_threshold_11(self.th_11.get())

    # ------------- Capture thread -------------
    def _capture_loop(self) -> None:
        while not self.stop_capture.is_set():
            try:
                result = self.dev.acquire() if self.dev else None
            except zkfp.ZKFPError as e:
                self.event_q.put(("error", str(e)))
                return
            if result is not None:
                self.event_q.put(("capture", result))
            self.stop_capture.wait(0.15)

    def _poll_events(self) -> None:
        try:
            while True:
                kind, payload = self.event_q.get_nowait()
                if kind == "capture":
                    self._handle_capture(*payload)
                elif kind == "error":
                    self._set_status(f"Loi capture: {payload}", "err")
        except queue.Empty:
            pass
        self.after(60, self._poll_events)

    def _handle_capture(self, img_bytes: bytes, template: bytes) -> None:
        # preview cho tab dang mo
        current_tab = self.notebook.index(self.notebook.select())
        if current_tab == 0:
            self._show_preview(self.canvas, img_bytes, 280, 340)
        elif current_tab == 1:
            self._show_preview(self.id_canvas, img_bytes, 240, 300)

        if self.mode == self.MODE_ENROLL:
            self._enroll_step(template)
        elif self.mode == self.MODE_IDENTIFY:
            self._do_identify(template)

    def _show_preview(self, canvas: tk.Canvas, img_bytes: bytes,
                      max_w: int, max_h: int) -> None:
        if not self.dev:
            return
        w, h = self.dev.width, self.dev.height
        img = Image.frombytes("L", (w, h), img_bytes)
        scale = min(max_w / w, max_h / h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        photo = ImageTk.PhotoImage(img)
        # giu reference theo canvas
        canvas.image_ref = photo  # type: ignore[attr-defined]
        canvas.delete("all")
        canvas.create_image(max_w // 2, max_h // 2, image=photo)

    # ------------- Enroll -------------
    def _on_start_enroll(self) -> None:
        name = self.name_entry.get().strip()
        if not name:
            messagebox.showinfo("Chua co ten", "Nhap ho ten truoc.")
            return
        self.enroll_user_name = name
        self.enroll_progress = {}
        self.enroll_next_index = 0
        self.last_enrolled_code = None
        self.mode = self.MODE_ENROLL
        self.btn_start.config(state="disabled")
        self.btn_cancel_enroll.config(state="normal")
        self.btn_identify.config(state="disabled")
        self.name_entry.config(state="disabled")
        self.progress_var.set(0)
        self.progress_text.config(text="0 / 10")
        self.enroll_msg_var.set("")
        for code in FINGER_CODES:
            self._update_finger_row(code, "idle")
        self._show_next_enroll_finger()

    def _current_target_code(self) -> str | None:
        if self.enroll_next_index >= len(FINGER_CODES):
            return None
        return FINGER_CODES[self.enroll_next_index]

    def _show_next_enroll_finger(self) -> None:
        target = self._current_target_code()
        if target is None:
            self._finish_enroll()
            return
        # highlight
        for code in FINGER_CODES:
            if code == target:
                self._update_finger_row(code, "active")
            elif code in self.enroll_progress:
                self._update_finger_row(code, "done")
            else:
                self._update_finger_row(code, "idle")
        name = FINGER_NAME[target]
        self.current_name_var.set(name)
        self.hint_var.set(f"Dat {name.lower()} len sensor, giu yen ~1 giay.")

    def _enroll_step(self, template: bytes) -> None:
        target = self._current_target_code()
        if target is None:
            return
        # kiem tra khong trung voi user khac
        result = self.dev.identify(template) if self.dev else None
        if result is not None:
            fid, score = result
            other_uid = fid // 10
            if other_uid in self.users:
                self.enroll_msg_var.set(
                    f"Van tay nay da thuoc user {other_uid} "
                    f"({self.users[other_uid]['name']}) - ngon {FINGER_NAME.get(FINGER_CODES[fid % 10], '?')}. "
                    f"Nhac tay ra, thu ngon khac hoac Huy."
                )
                return
        # kiem tra khong trung voi ngon da enroll trong session nay
        for done_code, done_b64 in self.enroll_progress.items():
            if self.dev and self.dev.match(template, base64.b64decode(done_b64)) > 0:
                self.enroll_msg_var.set(
                    f"Van tay nay da dang ky o ngon '{FINGER_NAME[done_code]}'. "
                    f"Vui long dung dung ngon '{FINGER_NAME[target]}'."
                )
                return

        # OK: luu
        self.enroll_progress[target] = base64.b64encode(template).decode("ascii")
        self.last_enrolled_code = target
        self.enroll_next_index += 1
        n = len(self.enroll_progress)
        self.progress_var.set(n)
        self.progress_text.config(text=f"{n} / 10")
        self.enroll_msg_var.set(f"Da luu {FINGER_NAME[target]}.")
        self.btn_redo.config(state="normal")
        self.after(600, lambda: self.enroll_msg_var.set(""))
        self._show_next_enroll_finger()

    def _on_redo(self) -> None:
        code = self.last_enrolled_code
        if not code:
            return
        self.enroll_progress.pop(code, None)
        # roll back index toi ngon do
        self.enroll_next_index = FINGER_INDEX[code]
        n = len(self.enroll_progress)
        self.progress_var.set(n)
        self.progress_text.config(text=f"{n} / 10")
        self.btn_redo.config(state="disabled")
        self.last_enrolled_code = None
        self.enroll_msg_var.set(f"Chup lai {FINGER_NAME[code]}.")
        self._show_next_enroll_finger()

    def _cancel_enroll(self) -> None:
        if not messagebox.askyesno("Xac nhan", "Huy session dang ky? Du lieu chua luu se mat."):
            return
        self._reset_enroll_ui()

    def _reset_enroll_ui(self) -> None:
        self.mode = self.MODE_IDLE
        self.enroll_progress = {}
        self.enroll_next_index = 0
        self.last_enrolled_code = None
        self.name_entry.config(state="normal")
        self.name_entry.delete(0, tk.END)
        self.progress_var.set(0)
        self.progress_text.config(text="0 / 10")
        self.current_name_var.set("—")
        self.hint_var.set("Nhap ho ten roi bam \"Bat dau\".")
        self.enroll_msg_var.set("")
        self.btn_redo.config(state="disabled")
        self.btn_cancel_enroll.config(state="disabled")
        if self.dev:
            self.btn_start.config(state="normal")
            self.btn_identify.config(state="normal")
        for code in FINGER_CODES:
            self._update_finger_row(code, "idle")
        self.canvas.delete("all")

    def _finish_enroll(self) -> None:
        # persist user + nap vao SDK
        next_uid = (max(self.users.keys()) + 1) if self.users else 1
        self.users[next_uid] = {
            "name": self.enroll_user_name,
            "created_at": time.time(),
            "fingers": dict(self.enroll_progress),
        }
        save_users(self.users)
        if self.dev:
            for code, b64 in self.enroll_progress.items():
                fid = next_uid * 10 + FINGER_INDEX[code]
                try:
                    self.dev.db_add(fid, base64.b64decode(b64))
                except zkfp.ZKFPError:
                    pass
        self._refresh_users_list()
        messagebox.showinfo(
            "Hoan tat",
            f"Da luu {self.enroll_user_name} voi ID = {next_uid}.\n"
            f"Chuyen sang tab 'Nhan dien' de kiem tra."
        )
        self._reset_enroll_ui()

    # ------------- Identify -------------
    def _on_identify(self) -> None:
        if not self.users:
            messagebox.showinfo("Chua co du lieu", "Chua co user nao. Dang ky truoc.")
            return
        self.mode = self.MODE_IDENTIFY
        self.btn_identify.config(state="disabled")
        self.btn_cancel_identify.config(state="normal")
        self.btn_start.config(state="disabled")
        self.id_result_var.set("Dat ngon tay len sensor...")
        self.id_result_label.config(bg="#f0f3f9", fg="#1c2536")

    def _do_identify(self, template: bytes) -> None:
        result = self.dev.identify(template) if self.dev else None
        if result is None:
            self.id_result_var.set("KHONG khop\n\nVan tay nay chua co trong he thong.")
            self.id_result_label.config(bg="#fee2e2", fg="#7f1d1d")
        else:
            fid, score = result
            uid = fid // 10
            finger_idx = fid % 10
            code = FINGER_CODES[finger_idx] if 0 <= finger_idx < 10 else "?"
            u = self.users.get(uid)
            if not u:
                self.id_result_var.set(
                    f"Match FID={fid} nhung khong tim thay user tuong ung.")
                self.id_result_label.config(bg="#fee2e2", fg="#7f1d1d")
            else:
                self.id_result_var.set(
                    f"✓ KHOP\n\n"
                    f"Ten:   {u['name']}\n"
                    f"ID:    {uid}\n"
                    f"Ngon:  {FINGER_NAME.get(code, code)}\n"
                    f"Score: {score}"
                )
                self.id_result_label.config(bg="#dcfce7", fg="#14532d")
        self._cancel_identify(clear_message=False)

    def _cancel_identify(self, clear_message: bool = True) -> None:
        self.mode = self.MODE_IDLE
        self.btn_cancel_identify.config(state="disabled")
        if self.dev:
            self.btn_identify.config(state="normal")
            self.btn_start.config(state="normal")
        if clear_message:
            self.id_result_var.set("Chua co ket qua.")
            self.id_result_label.config(bg="#f0f3f9", fg="#1c2536")

    # ------------- Users tab -------------
    def _refresh_users_list(self) -> None:
        self.users = load_users()
        for row in self.tree.get_children():
            self.tree.delete(row)
        for uid in sorted(self.users.keys()):
            u = self.users[uid]
            ts = u.get("created_at")
            when = time.strftime("%Y-%m-%d %H:%M:%S",
                                 time.localtime(ts)) if ts else ""
            self.tree.insert("", "end", iid=str(uid),
                             values=(uid, u["name"],
                                     len(u.get("fingers", {})), when))

    def _selected_uid(self) -> int | None:
        sel = self.tree.selection()
        if not sel:
            return None
        try:
            return int(sel[0])
        except ValueError:
            return None

    def _delete_user(self) -> None:
        uid = self._selected_uid()
        if uid is None:
            messagebox.showinfo("Chon user", "Chon 1 user trong danh sach.")
            return
        u = self.users.get(uid)
        if not u:
            return
        if not messagebox.askyesno("Xac nhan",
                                   f"Xoa user {uid} - {u['name']}?"):
            return
        # xoa khoi SDK
        if self.dev:
            for code in u.get("fingers", {}):
                fid = uid * 10 + FINGER_INDEX.get(code, -1)
                if fid >= 0:
                    try:
                        self.dev.db_del(fid)
                    except zkfp.ZKFPError:
                        pass
        self.users.pop(uid, None)
        save_users(self.users)
        self._refresh_users_list()
        self._set_status(f"Da xoa user {uid}.", "info")

    def _rename_user(self) -> None:
        uid = self._selected_uid()
        if uid is None:
            messagebox.showinfo("Chon user", "Chon 1 user trong danh sach.")
            return
        u = self.users.get(uid)
        if not u:
            return
        new_name = simpledialog.askstring("Doi ten",
                                          f"Ten moi cho user {uid}:",
                                          initialvalue=u["name"], parent=self)
        if new_name is None:
            return
        new_name = new_name.strip()
        if not new_name:
            return
        u["name"] = new_name
        save_users(self.users)
        self._refresh_users_list()
        self._set_status(f"Da doi ten user {uid} -> {new_name}.", "info")


if __name__ == "__main__":
    app = ZKApp()
    app.mainloop()
