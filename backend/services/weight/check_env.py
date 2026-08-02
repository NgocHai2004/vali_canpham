"""
check_env.py - Kiem tra may moi da san sang chay JPD Gateway chua.
Chay: py check_env.py
"""

import sys

ok = True


def check(label, cond, hint=""):
    global ok
    mark = "OK  " if cond else "LOI "
    print(f"[{mark}] {label}")
    if not cond:
        ok = False
        if hint:
            print(f"       -> {hint}")


print("=" * 55)
print(" Kiem tra moi truong cho JPD Gateway")
print("=" * 55)

# 1. Python version
check(f"Python {sys.version.split()[0]} (can >= 3.8)",
      sys.version_info >= (3, 8),
      "Cai Python 3.8+ tai python.org (tich 'Add to PATH').")

# 2. bleak
try:
    import bleak  # noqa
    check("Thu vien bleak da cai", True)
except ImportError:
    check("Thu vien bleak da cai", False, "Chay: pip install bleak")

# 3. config.py + URL da dat
try:
    import config
    has_url = bool(getattr(config, "RECEIVER_URL", "")) and \
        "YOUR-WEBSITE" not in config.RECEIVER_URL and \
        "trang-web-cua-ban" not in config.RECEIVER_URL
    check("config.py doc duoc", True)
    check("RECEIVER_URL da dat (URL web that)", has_url,
          "Mo config.py, dien RECEIVER_URL = URL API web cua ban.")
    tok = getattr(config, "AUTH_TOKEN", "")
    has_tok = bool(tok) and "DAT-API-KEY" not in tok and "API-KEY-CUA-WEB" not in tok
    mode = getattr(config, "AUTH_MODE", "bearer")
    if mode != "none":
        check("AUTH_TOKEN da dat", has_tok,
              "Dien AUTH_TOKEN = API key cua web (hoac dat AUTH_MODE='none').")
except Exception as e:
    check("config.py doc duoc", False, f"Loi: {e}")

# 4. Bluetooth (thu khoi tao scanner - chi bao dc adapter co ton tai)
try:
    import asyncio
    from bleak import BleakScanner

    async def _probe():
        # chi tao scanner, khong can quet lau
        s = BleakScanner()
        return True
    asyncio.run(_probe())
    check("Bluetooth adapter khoi tao duoc", True)
except Exception as e:
    check("Bluetooth adapter khoi tao duoc", False,
          f"Kiem tra may co Bluetooth va da bat chua. ({e})")

print("=" * 55)
if ok:
    print(" TAT CA OK. Chay:  py service_run.py")
else:
    print(" CON LOI o tren - sua roi chay lai check_env.py")
print("=" * 55)
sys.exit(0 if ok else 1)
