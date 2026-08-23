"""Do thang do that cua ImageInfo.Quality (nghi ngo: khong phai 0-100).

Chay: python _probe_quality.py   (dat 4 ngon len sensor khi thay "Dat tay...")
"""
import os
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import morfin as M
from morfin import FingerType, SlapPosition

sdk = M.Morfin()
devs = sdk.device_list()
print("devices:", devs)
kf = sdk.sdk_dir / "ClientKey.txt"
key = kf.read_text().strip() if kf.exists() else None
rc, info = sdk.init_device(devs[0], FingerType.FLAT, key)
print("init:", rc, sdk.err(rc))

done = threading.Event()
seen = {"preview": [], "complete": None}


def on_preview(code, p):
    if code < 0 or not p:
        return
    try:
        ip = p.contents.ImageParams
        n = max(0, min(ip.ImageCount, 4))
        row = [(ip.ImageInfo[i].Quality, ip.ImageInfo[i].NFIQScore) for i in range(n)]
        if row:
            seen["preview"].append(row)
    except Exception as e:
        print("preview err:", e)


def on_complete(code, params, lst):
    try:
        out = {"code": code, "count": lst.contents.FingerCount if lst else -1}
        if params:
            ip = params.contents
            out["ImageCount"] = ip.ImageCount
            out["per"] = [
                {"slot": i + 1,
                 "Quality": ip.ImageInfo[i].Quality,
                 "NFIQScore": ip.ImageInfo[i].NFIQScore,
                 "Intensity": ip.ImageInfo[i].Intensity,
                 "out_score": ip.ImageInfo[i].out_score,
                 "result": ip.ImageInfo[i].result}
                for i in range(max(0, min(ip.ImageCount, 4)))
            ]
        seen["complete"] = out
    except Exception as e:
        print("complete err:", e)
    done.set()


print(">>> Dat 4 ngon ban tay PHAI len sensor va giu yen...")
rc = sdk.start_capture(on_preview, on_complete, timeout=20,
                       slap=SlapPosition.RIGHT_HAND,
                       auto_capture=True, nfiq_quality=40)
print("start_capture:", rc, sdk.err(rc))
done.wait(35)

print("\n=== COMPLETE CALLBACK ===")
print(seen["complete"])

print("\n=== PREVIEW: min/max Quality quan sat duoc ===")
qs = [q for row in seen["preview"] for (q, _n) in row]
ns = [n for row in seen["preview"] for (_q, n) in row]
print("frames:", len(seen["preview"]))
if qs:
    print("Quality   min=%d max=%d" % (min(qs), max(qs)))
    print("NFIQScore min=%d max=%d" % (min(ns), max(ns)))
    print("last 3 frames:", seen["preview"][-3:])

try:
    sdk.stop_capture()
    sdk.uninit_device()
except Exception:
    pass
