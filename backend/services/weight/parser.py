"""
Parser frame BLE cua can JPD (module Chipsea, service FFF0).
Dich tu ChipseaParser.kt sang Python.

Format frame 11 byte:
  [0xCE][0x00][0x00][wt_lo][wt_hi][flags][0x00][0x00][0x00][stable][chk]
  - Byte 0      = 0xCE  : dau goi
  - Byte 3,4    = can, little-endian, don vi 0.01 kg (/100)
  - Byte 5      = flags (bit thap nhap nhay khi dang do)
  - Byte 9      = stable: 0x00 = da on dinh, 0x01 = dang do
  - Byte 10     = checksum XOR byte 0..9
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any

FRAME_START = 0xCE
FRAME_LEN = 11


@dataclass
class WeightData:
    weight: float
    unit: str
    stable: bool
    raw_hex: str
    cmd: int
    fields: Dict[str, Any] = field(default_factory=dict)


def _to_hex(b: bytes) -> str:
    return " ".join(f"{x:02X}" for x in b)


def feed(data: bytes) -> List[WeightData]:
    """Xu ly luong byte tu notify. Co the co 1 hoac nhieu frame lien nhau."""
    results: List[WeightData] = []
    i = 0
    n = len(data)
    while i < n:
        if data[i] == FRAME_START:
            if i + FRAME_LEN <= n:
                frame = data[i:i + FRAME_LEN]
                parsed = _parse_frame(frame)
                if parsed is not None:
                    results.append(parsed)
                i += FRAME_LEN
            else:
                # frame chua du -> cho lan sau
                break
        else:
            i += 1
    return results


def _parse_frame(frame: bytes) -> WeightData | None:
    hex_str = _to_hex(frame)

    if len(frame) < FRAME_LEN:
        return None
    if frame[0] != FRAME_START:
        return None

    lo = frame[3]
    hi = frame[4]
    raw = (hi << 8) | lo          # little-endian
    weight = raw / 100.0

    flags = frame[5]
    stable_byte = frame[9]
    stable = (stable_byte == 0x00)  # 0x00 = locked/stable

    # checksum XOR byte 0..9
    chk = 0
    for k in range(10):
        chk ^= frame[k]
    chk_ok = (chk & 0xFF) == frame[10]

    return WeightData(
        weight=weight,
        unit="kg",
        stable=stable,
        raw_hex=hex_str,
        cmd=0xCE,
        fields={
            "raw_be_le": raw,
            "flags": flags,
            "stable_byte": stable_byte,
            "checksum_ok": chk_ok,
        },
    )
