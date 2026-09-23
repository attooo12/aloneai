"""Tab Lifeboat icon: a white browser-tab shape with a lifebuoy, on a teal rounded square. Pillow only.
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
    # Lifebuoy in the page body: orange ring with four teal bands.
    cx, cy = S / 2, (top + S * 0.12 + S - m) / 2 + S * 0.01
    r = S * (0.19 if small else 0.175)
    ORANGE = (234, 88, 12, 255)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE)
    if not small:
        for k in range(4):
            a = 45 + k * 90
            d.pieslice([cx - r, cy - r, cx + r, cy + r], a - 17, a + 17, fill=TEAL)
    ri = r * (0.45 if small else 0.55)
    d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)

for size in (16, 32, 48, 128):
    draw(size).save(f"{out}/icon{size}.png")
print("ok")
