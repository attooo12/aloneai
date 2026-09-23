"""TEST ONLY: real X11 input + screen grabs for test/headful-xvfb.mjs (needs python-xlib; talks XTEST directly).
Usage: xinput.py move X Y | click X Y | key Alt+Shift+E | shot out.png | pixel X Y | find|bbox RRGGBB [x0 y0 x1 y1]
"""
import sys, time
from Xlib import X, XK, display
from Xlib.ext import xtest

d = display.Display()
root = d.screen().root
cmd, args = sys.argv[1], sys.argv[2:]

def move(x, y):
    xtest.fake_input(d, X.MotionNotify, x=int(x), y=int(y)); d.sync()

def grab():
    from PIL import Image
    g = root.get_geometry()
    raw = root.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xffffffff)
    return Image.frombytes("RGB", (g.width, g.height), raw.data, "raw", "BGRX")

if cmd == "move":
    move(*args)
elif cmd == "click":
    move(*args); time.sleep(0.15)
    xtest.fake_input(d, X.ButtonPress, 1); d.sync(); time.sleep(0.05)
    xtest.fake_input(d, X.ButtonRelease, 1); d.sync()
elif cmd == "key":
    names = {"alt": "Alt_L", "shift": "Shift_L", "ctrl": "Control_L", "enter": "Return", "esc": "Escape"}
    codes = [d.keysym_to_keycode(XK.string_to_keysym(names.get(k.lower(), k.lower() if len(k) == 1 else k))) for k in args[0].split("+")]
    for c in codes: xtest.fake_input(d, X.KeyPress, c); d.sync(); time.sleep(0.03)
    for c in reversed(codes): xtest.fake_input(d, X.KeyRelease, c); d.sync(); time.sleep(0.03)
elif cmd == "shot":
    grab().save(args[0])
elif cmd == "pixel":
    print("#%02X%02X%02X" % grab().getpixel((int(args[0]), int(args[1]))))
elif cmd in ("find", "bbox"):
    # Centre of the pixels matching a colour (+-6 per channel), optionally inside a box. Prints "x y n" or "none".
    img = grab(); t = tuple(int(args[0][i:i + 2], 16) for i in (0, 2, 4))
    x0, y0, x1, y1 = map(int, args[1:5]) if len(args) >= 5 else (0, 0, img.width, img.height)
    px = img.load(); xs = ys = n = 0; bx0 = by0 = 10**9; bx1 = by1 = -1
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = px[x, y]
            if all(abs(p[i] - t[i]) <= 6 for i in range(3)):
                xs += x; ys += y; n += 1; bx0 = min(bx0, x); by0 = min(by0, y); bx1 = max(bx1, x); by1 = max(by1, y)
    if not n: print("none")
    elif cmd == "find": print(f"{xs // n} {ys // n} {n}")
    else: print(f"{bx0} {by0} {bx1} {by1}")
d.sync()
