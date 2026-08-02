"""
JPD-700A BLE Gateway - ban chay tren Windows.
==============================================
Dich tu app Android (WeightService.kt) sang Python dung thu vien bleak.

Luong:
  1. Quet BLE tim can (ten chua "JPD" hoac dung MAC).
  2. Ket noi, bat notify tren char FFF4 (hoac 2A9C).
  3. Gui cac lenh wakeup vao char FFF1.
  4. Moi goi notify -> parse thanh so can -> in JSON ra man hinh + luu file.

Chay:
    py main.py

Ctrl+C de dung.
"""

import asyncio
import json
import sys
from datetime import datetime, timezone

# Ep stdout/stderr sang UTF-8 de in duoc ten thiet bi co ky tu tieng Viet
# (console Windows mac dinh dung cp1252 -> crash khi gap ky tu la).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from bleak import BleakScanner, BleakClient
from bleak.backends.device import BLEDevice

import config
import parser as jpd_parser


_seq = 0


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def emit(weight: jpd_parser.WeightData):
    """Xuat 1 ban ghi can ra JSON (in man hinh + luu file)."""
    global _seq
    _seq += 1
    record = {
        "weight_kg": round(weight.weight, 2),
        "source": config.SOURCE_ID,
        "stable": weight.stable,
        "seq": _seq,
        "unit": weight.unit,
        "raw_hex": weight.raw_hex,
        "measured_at": _now_iso(),
    }
    line = json.dumps(record, ensure_ascii=False)

    # In ra man hinh (day la "app bat duoc json")
    print(f">>> {line}", flush=True)

    # Luu file log (tuy chon)
    if config.LOG_FILE:
        try:
            with open(config.LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception as e:
            print(f"[!] Ghi log that bai: {e}", file=sys.stderr, flush=True)


def _match(device: BLEDevice, adv_name: str | None) -> bool:
    """Kiem tra thiet bi co phai can can tim khong (theo ten hoac MAC)."""
    name = (device.name or adv_name or "")
    match_name = config.TARGET_NAME_PREFIX.lower() in name.lower()
    match_mac = (
        config.TARGET_MAC is not None
        and device.address is not None
        and device.address.upper() == config.TARGET_MAC.upper()
    )
    return match_name or match_mac


async def scan_for_scale() -> BLEDevice | None:
    """Quet BLE cho toi khi tim thay can hoac het thoi gian."""
    print(f"[*] Dang quet BLE tim can (ten chua '{config.TARGET_NAME_PREFIX}' "
          f"hoac MAC {config.TARGET_MAC})...", flush=True)

    found: dict[str, BLEDevice] = {}
    stop_event = asyncio.Event()

    def detection_callback(device: BLEDevice, adv):
        # Log moi thiet bi thay duoc de debug
        nm = device.name or adv.local_name or "?"
        if device.address not in found:
            found[device.address] = device
            print(f"    thay: {nm}  [{device.address}]  rssi={adv.rssi}", flush=True)
        if _match(device, adv.local_name):
            print(f"[+] Tim thay can: {nm} [{device.address}]", flush=True)
            found["__target__"] = device
            stop_event.set()

    scanner = BleakScanner(detection_callback=detection_callback)
    await scanner.start()
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=config.SCAN_TIMEOUT)
    except asyncio.TimeoutError:
        print("[!] Quet timeout, chua thay can.", flush=True)
    finally:
        await scanner.stop()

    return found.get("__target__")


def _handle_notify(_char, data: bytearray):
    """Callback moi khi can day data BLE ve."""
    b = bytes(data)
    hexs = " ".join(f"{x:02X}" for x in b)
    print(f"[data] ({len(b)} byte): {hexs}", flush=True)

    for w in jpd_parser.feed(b):
        print(f"[parsed] weight={w.weight} {w.unit} stable={w.stable} "
              f"checksum_ok={w.fields.get('checksum_ok')}", flush=True)
        if w.stable or not config.SEND_ONLY_STABLE:
            emit(w)
        else:
            print(f"    (bo qua - chua on dinh, weight={w.weight})", flush=True)


async def run_session(device: BLEDevice):
    """Ket noi 1 can, bat notify, gui wakeup, nhan data cho den khi mat ket noi."""
    print(f"[*] Dang ket noi {device.name or device.address}...", flush=True)

    disconnected = asyncio.Event()

    def on_disconnect(_client):
        print("[!] Mat ket noi.", flush=True)
        disconnected.set()

    async with BleakClient(device, disconnected_callback=on_disconnect) as client:
        print(f"[+] Da ket noi: {client.address}", flush=True)

        # In tat ca service + char de debug (giong onServicesDiscovered ben Android)
        notify_uuid = None
        write_uuid = None
        print("===== SERVICES =====", flush=True)
        for svc in client.services:
            print(f"  Service {svc.uuid}", flush=True)
            for ch in svc.characteristics:
                print(f"    Char {ch.uuid} props={ch.properties}", flush=True)
                u = ch.uuid.lower()
                if u == config.CHAR_NOTIFY_UUID.lower() or u == config.WEIGHT_CHAR_UUID.lower():
                    notify_uuid = ch.uuid
                if u == config.CHAR_WRITE_UUID.lower():
                    write_uuid = ch.uuid
        print("===== END SERVICES =====", flush=True)

        # Fallback: neu khong thay UUID notify quen thuoc, chon char dau tien co "notify"
        if notify_uuid is None:
            for svc in client.services:
                for ch in svc.characteristics:
                    if "notify" in ch.properties or "indicate" in ch.properties:
                        notify_uuid = ch.uuid
                        print(f"[*] Fallback notify char: {notify_uuid}", flush=True)
                        break
                if notify_uuid:
                    break

        if notify_uuid is None:
            print("[!] Can khong co char NOTIFY nao. Thoat session.", flush=True)
            return

        await client.start_notify(notify_uuid, _handle_notify)
        print(f"[+] Da bat notify tren {notify_uuid}", flush=True)

        # Gui lenh wakeup (mot so can Chipsea can moi day data)
        if write_uuid is not None:
            for cmd in config.WAKEUP_CMDS:
                try:
                    await client.write_gatt_char(write_uuid, cmd, response=False)
                    print(f"[*] Gui wakeup: {cmd.hex().upper()}", flush=True)
                except Exception as e:
                    print(f"    wakeup fail ({cmd.hex()}): {e}", flush=True)
        else:
            print("[*] Khong tim thay char WRITE - bo qua wakeup.", flush=True)

        print("[*] Dang cho data can... (dung len can de do)", flush=True)
        # Cho cho den khi mat ket noi
        await disconnected.wait()


async def main_loop():
    print("=" * 60)
    print("JPD-700A BLE Gateway (Windows)")
    print("  Dung len can -> JSON hien ra o day.")
    if config.LOG_FILE:
        print(f"  Log file: {config.LOG_FILE}")
    print("  Ctrl+C de dung.")
    print("=" * 60, flush=True)

    while True:
        try:
            device = await scan_for_scale()
            if device is None:
                print("[*] Thu quet lai sau 2s...\n", flush=True)
                await asyncio.sleep(2)
                continue
            await run_session(device)
        except Exception as e:
            print(f"[!] Loi session: {e}. Thu lai sau 3s...", flush=True)
        # Sau khi mat ket noi -> quet lai (giong auto-reconnect ben Android)
        print("[*] Reconnect sau 3s...\n", flush=True)
        await asyncio.sleep(3)


if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        print("\n[*] Dung.")
