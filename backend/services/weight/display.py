"""
JPD-700A BLE - Hien thi so can TRUC TIEP tren console.
Chay: py display.py
Dung len can -> so can hien to giua man hinh, cap nhat real-time.
Ctrl+C de dung.
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

from bleak import BleakScanner, BleakClient
from bleak.backends.device import BLEDevice

import config
import parser as jpd_parser

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Trang thai hien tai de ve man hinh
_state = {
    "status": "Dang khoi dong...",
    "weight": None,
    "stable": False,
    "last_json": None,
    "count": 0,
}
_seq = 0


def _clear():
    os.system("cls" if os.name == "nt" else "clear")


def render():
    """Ve lai toan bo man hinh."""
    _clear()
    w = _state["weight"]
    stable = _state["stable"]

    weight_str = f"{w:6.2f} kg" if w is not None else "  --.-- kg"
    mark = "[ ON DINH ]" if stable else "[ dang do ]" if w is not None else ""

    print("=" * 44)
    print("        JPD-700A  CAN DIEN TU  (BLE)")
    print("=" * 44)
    print()
    print("            +--------------------+")
    print("            |                    |")
    print(f"            |   {weight_str:^14}   |")
    print("            |                    |")
    print("            +--------------------+")
    print()
    print(f"            {mark:^20}")
    print()
    print("-" * 44)
    print(f" Trang thai : {_state['status']}")
    print(f" So lan chot: {_state['count']}")
    if _state["last_json"]:
        print("-" * 44)
        print(" JSON gan nhat:")
        print(f"   {_state['last_json']}")
    print("=" * 44)
    print(" (Dung len can. Ctrl+C de thoat.)")
    sys.stdout.flush()


def emit(weight: jpd_parser.WeightData):
    global _seq
    _seq += 1
    record = {
        "weight_kg": round(weight.weight, 2),
        "source": config.SOURCE_ID,
        "stable": weight.stable,
        "seq": _seq,
        "unit": weight.unit,
        "raw_hex": weight.raw_hex,
        "measured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") +
                       f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z",
    }
    line = json.dumps(record, ensure_ascii=False)
    _state["last_json"] = line
    _state["count"] = _seq
    if config.LOG_FILE:
        try:
            with open(config.LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass


def _match(device: BLEDevice, adv_name):
    name = (device.name or adv_name or "")
    match_name = config.TARGET_NAME_PREFIX.lower() in name.lower()
    match_mac = (
        config.TARGET_MAC is not None
        and device.address is not None
        and device.address.upper() == config.TARGET_MAC.upper()
    )
    return match_name or match_mac


async def scan_for_scale():
    _state["status"] = "Dang tim can..."
    render()
    found = {}
    stop_event = asyncio.Event()

    def cb(device, adv):
        if _match(device, adv.local_name):
            found["__target__"] = device
            stop_event.set()

    scanner = BleakScanner(detection_callback=cb)
    await scanner.start()
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=config.SCAN_TIMEOUT)
    except asyncio.TimeoutError:
        pass
    finally:
        await scanner.stop()
    return found.get("__target__")


def _handle_notify(_char, data: bytearray):
    for w in jpd_parser.feed(bytes(data)):
        _state["weight"] = w.weight
        _state["stable"] = w.stable
        if w.stable or not config.SEND_ONLY_STABLE:
            emit(w)
            _state["status"] = "Da chot so can!"
        else:
            _state["status"] = "Dang can..."
        render()


async def run_session(device: BLEDevice):
    _state["status"] = f"Dang ket noi {device.name or device.address}..."
    render()
    disconnected = asyncio.Event()

    async with BleakClient(device, disconnected_callback=lambda _c: disconnected.set()) as client:
        _state["status"] = "Da ket noi. Cho data..."
        render()

        notify_uuid = None
        write_uuid = None
        for svc in client.services:
            for ch in svc.characteristics:
                u = ch.uuid.lower()
                if u in (config.CHAR_NOTIFY_UUID.lower(), config.WEIGHT_CHAR_UUID.lower()):
                    notify_uuid = ch.uuid
                if u == config.CHAR_WRITE_UUID.lower():
                    write_uuid = ch.uuid
        if notify_uuid is None:
            for svc in client.services:
                for ch in svc.characteristics:
                    if "notify" in ch.properties or "indicate" in ch.properties:
                        notify_uuid = ch.uuid
                        break
                if notify_uuid:
                    break
        if notify_uuid is None:
            _state["status"] = "Can khong co NOTIFY!"
            render()
            return

        await client.start_notify(notify_uuid, _handle_notify)
        if write_uuid is not None:
            for cmd in config.WAKEUP_CMDS:
                try:
                    await client.write_gatt_char(write_uuid, cmd, response=False)
                except Exception:
                    pass
        _state["status"] = "San sang - dung len can!"
        render()
        await disconnected.wait()


async def main_loop():
    render()
    while True:
        try:
            device = await scan_for_scale()
            if device is None:
                _state["status"] = "Chua thay can, quet lai..."
                render()
                await asyncio.sleep(2)
                continue
            await run_session(device)
        except Exception as e:
            _state["status"] = f"Loi: {e}. Ket noi lai..."
            render()
        _state["status"] = "Mat ket noi, quet lai..."
        render()
        await asyncio.sleep(3)


if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        print("\nDung.")
