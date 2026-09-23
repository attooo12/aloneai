"""Tab Vault icon: a white browser-tab shape with a vault dial, on a teal rounded square. Pillow only.
Run: python3 make_icon.py <outdir>  -> icon16/32/48/128.png (drawn at 1024 px, downsampled)."""
import sys
from PIL import Image, ImageDraw

TEAL, DARK, WHITE = (15, 118, 110, 255), (17, 94, 89, 255), (255, 255, 255, 255)
S = 1024
out = sys.argv[1]

def draw(size):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=TEAL)
    small = size <= 16
    # Browser tab silhouette: a raised tab on the top left + the page body.
    m = S * (0.16 if small else 0.18)
    top = S * (0.24 if small else 0.25)
    d.rounded_rectangle([m, top, S * 0.56, top + S * 0.2], radius=int(S * 0.06), fill=WHITE)
    d.rounded_rectangle([m, top + S * 0.12, S - m, S - m], radius=int(S * 0.07), fill=WHITE)
    d.rectangle([m, top + S * 0.1, m + S * 0.12, top + S * 0.3], fill=WHITE)  # no notch where tab meets page
    # Vault dial in the page body.
    cx, cy = S / 2, (top + S * 0.12 + S - m) / 2 + S * 0.01
    r = S * (0.17 if small else 0.155)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TEAL)
    if not small:
        ri = r * 0.62
        d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=WHITE)
        rh = r * 0.26
        d.ellipse([cx - rh, cy - rh, cx + rh, cy + rh], fill=DARK)
        # Safe wheel: three spokes from the hub.
        import math
        w = r * 0.15
        for k in range(3):
            a = math.radians(-90 + k * 120)
            d.line([cx, cy, cx + math.cos(a) * ri * 0.98, cy + math.sin(a) * ri * 0.98], fill=DARK, width=int(w))
        d.ellipse([cx - rh, cy - rh, cx + rh, cy + rh], fill=DARK)
    return img.resize((size, size), Image.LANCZOS)

for size in (16, 32, 48, 128):
    draw(size).save(f"{out}/icon{size}.png")
print("ok")
