"""
service_run.py - Ban chay NEN (headless) cua JPD-700A BLE Gateway.
==================================================================
Dung cho auto-start cung Windows (Task Scheduler, chay bang pythonw.exe).
- Khong co UI console.
- Ghi log ra file (xoay vong) trong config.LOG_DIR.
- Moi so can ON DINH -> gui len web dang ky (RECEIVER_URL) qua sender.send().

Chay tay de test:
    py service_run.py
Chay nen (khong cua so):
    pythonw service_run.py
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

from bleak import BleakScanner, BleakClient
from bleak.backends.device import BLEDevice

import config
import parser as jpd_parser
import sender

# ===== Logging ra file xoay vong =====
os.makedirs(config.LOG_DIR, exist_ok=True)
_log_path = os.path.join(config.LOG_DIR, "gateway.log")
log = logging.getLogger("gateway")
log.setLevel(logging.INFO)
_handler = RotatingFileHandler(_log_path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
log.addHandler(_handler)

_seq = 0


def _now_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def emit(w: jpd_parser.WeightData) -> None:
    """Tao record JSON + gui sang May B + luu file log local."""
    global _seq
    _seq += 1
    record = {
        "weight_kg": round(w.weight, 2),
        "source": config.SOURCE_ID,
        "device_id": getattr(config, "DEVICE_ID", config.SOURCE_ID),
        "stable": w.stable,
        "seq": _seq,
        "unit": w.unit,
        "raw_hex": w.raw_hex,
        "measured_at": _now_iso(),
    }
    log.info("EMIT %s", json.dumps(record, ensure_ascii=False))
    # Luu file local (tuy chon)
    if config.LOG_FILE:
        try:
            with open(config.LOG_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception as e:
            log.error("Ghi LOG_FILE that bai: %s", e)
    # Gui sang May B (khong block - thread rieng, co hang doi offline)
    sender.send(record)


def _match(device: BLEDevice, adv_name) -> bool:
    name = (device.name or adv_name or "")
    match_name = config.TARGET_NAME_PREFIX.lower() in name.lower()
    match_mac = (
        config.TARGET_MAC is not None
        and device.address is not None
        and device.address.upper() == config.TARGET_MAC.upper()
    )
    return match_name or match_mac


async def scan_for_scale() -> BLEDevice | None:
    log.info("Dang quet BLE tim can...")
    found = {}
    stop_event = asyncio.Event()

    def cb(device, adv):
        if _match(device, adv.local_name):
            log.info("Tim thay can: %s [%s]", device.name or adv.local_name, device.address)
            found["__target__"] = device
            stop_event.set()

    scanner = BleakScanner(detection_callback=cb)
    await scanner.start()
    try:
        await asyncio.wait_for(stop_event.wait(), timeout=config.SCAN_TIMEOUT)
    except asyncio.TimeoutError:
        log.info("Quet timeout, chua thay can.")
    finally:
        await scanner.stop()
    return found.get("__target__")


def _handle_notify(_char, data: bytearray) -> None:
    for w in jpd_parser.feed(bytes(data)):
        log.info("PARSED weight=%s stable=%s checksum_ok=%s",
                 w.weight, w.stable, w.fields.get("checksum_ok"))
        if w.stable or not config.SEND_ONLY_STABLE:
            emit(w)


async def run_session(device: BLEDevice) -> None:
    log.info("Dang ket noi %s...", device.name or device.address)
    disconnected = asyncio.Event()

    async with BleakClient(device, disconnected_callback=lambda _c: disconnected.set()) as client:
        log.info("Da ket noi: %s", client.address)

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
            log.warning("Can khong co char NOTIFY. Thoat session.")
            return

        await client.start_notify(notify_uuid, _handle_notify)
        log.info("Da bat notify tren %s", notify_uuid)

        if write_uuid is not None:
            for cmd in config.WAKEUP_CMDS:
                try:
                    await client.write_gatt_char(write_uuid, cmd, response=False)
                except Exception as e:
                    log.debug("wakeup fail: %s", e)

        log.info("San sang - cho data can.")
        await disconnected.wait()
        log.info("Mat ket noi.")


async def main_loop() -> None:
    log.info("===== JPD Gateway (service) khoi dong. Receiver=%s =====", config.RECEIVER_URL)
    # Day not cac record con ton tu lan chay truoc (neu May B da song lai)
    sender.flush_pending()

    while True:
        try:
            device = await scan_for_scale()
            if device is None:
                await asyncio.sleep(2)
                continue
            await run_session(device)
        except Exception as e:
            log.error("Loi session: %s", e)
        await asyncio.sleep(3)


if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        log.info("Dung (KeyboardInterrupt).")
