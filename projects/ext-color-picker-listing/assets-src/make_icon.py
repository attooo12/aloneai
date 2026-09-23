"""Generate the Color Picker & Palette extension icon (16/32/48/128 PNG, transparent background).

Draws a simple eyedropper (pipette) touching a colour drop, at high resolution, then
downsamples with Pillow's LANCZOS filter so every size stays crisp. No dependencies
beyond Pillow. Run: python3 assets-src/make_icon.py ../ext-color-picker/icons
"""
import sys
import math
from PIL import Image, ImageDraw

outdir = sys.argv[1] if len(sys.argv) > 1 else '.'

# Supersample at a high resolution, then downscale for each target size so edges stay
# crisp and anti-aliased even at 16px.
S = 1024
CANVAS = Image.new('RGBA', (S, S), (0, 0, 0, 0))

# Colours: a blue-violet pipette body (brand-ish, matches the popup's --accent) and a
# warm amber colour drop at the tip, so the glyph reads as "eyedropper picking a colour"
# even at very small sizes. A dark outline on every shape keeps it legible on both
# light and dark browser toolbars (there is no filled background square, per CWS
# guidance to leave the icon's own padding rather than a full-bleed tile).
BODY = (79, 70, 229, 255)      # indigo-600
BODY_DARK = (49, 46, 129, 255)  # indigo-900 (cap + outline accents)
DROP = (245, 158, 11, 255)     # amber-500
OUTLINE = (17, 24, 39, 255)    # near-black, for contrast on any background
HIGHLIGHT = (255, 255, 255, 235)

# Build the glyph pointing straight down (tip at bottom), then rotate -40deg so the
# finished pipette leans like a hand-held eyedropper with the drop at the lower-left.
glyph = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glyph)
cx = S // 2
barrel_w = 200
barrel_top = 110
barrel_bot = 620
outline_w = 30

# Barrel (capsule): rounded rectangle.
gd.rounded_rectangle(
    [cx - barrel_w / 2, barrel_top, cx + barrel_w / 2, barrel_bot],
    radius=barrel_w / 2, fill=BODY, outline=OUTLINE, width=outline_w,
)
# Bulb cap at the top (a slightly darker, shorter rounded rect overlapping the barrel top).
cap_h = 150
gd.rounded_rectangle(
    [cx - barrel_w / 2, barrel_top - cap_h * 0.55, cx + barrel_w / 2, barrel_top + cap_h * 0.55],
    radius=barrel_w / 2, fill=BODY_DARK, outline=OUTLINE, width=outline_w,
)
# Tapered tip (triangle) below the barrel, narrowing to a point.
tip_len = 150
gd.polygon(
    [
        (cx - barrel_w / 2 + outline_w * 0.3, barrel_bot - 30),
        (cx + barrel_w / 2 - outline_w * 0.3, barrel_bot - 30),
        (cx, barrel_bot + tip_len),
    ],
    fill=BODY,
)
gd.line(
    [(cx - barrel_w / 2 + outline_w * 0.3, barrel_bot - 30), (cx, barrel_bot + tip_len)],
    fill=OUTLINE, width=outline_w,
)
gd.line(
    [(cx + barrel_w / 2 - outline_w * 0.3, barrel_bot - 30), (cx, barrel_bot + tip_len)],
    fill=OUTLINE, width=outline_w,
)
# Glass highlight: a thin light diagonal stripe on the barrel for a bit of shine/depth.
gd.line([(cx - 46, barrel_top + 40), (cx - 46, barrel_bot - 60)], fill=HIGHLIGHT, width=22)

# Colour drop at the very tip: a filled circle, overlapping the point, representing the
# picked colour. Drawn after the pipette so it sits on top, like a droplet on the tip.
drop_r = 92
drop_cx, drop_cy = cx, barrel_bot + tip_len + drop_r * 0.55
gd.ellipse(
    [drop_cx - drop_r, drop_cy - drop_r, drop_cx + drop_r, drop_cy + drop_r],
    fill=DROP, outline=OUTLINE, width=outline_w,
)
# Small highlight dot on the drop.
hl_r = 20
gd.ellipse(
    [drop_cx - drop_r * 0.45 - hl_r, drop_cy - drop_r * 0.45 - hl_r,
     drop_cx - drop_r * 0.45 + hl_r, drop_cy - drop_r * 0.45 + hl_r],
    fill=HIGHLIGHT,
)

# Rotate so the pipette leans like it is actively picking (tip to the lower-left).
glyph = glyph.rotate(40, resample=Image.BICUBIC, expand=False, center=(cx, cx))

# Crop the glyph's own bounding box, then paste it centred with ~12.5% padding (so the
# 128px icon gets ~16px of transparent margin on each side, per CWS icon guidance).
bbox = glyph.getbbox()
glyph_cropped = glyph.crop(bbox)
gw, gh = glyph_cropped.size
pad_frac = 0.125  # ~16px of transparent margin at the 128px size
target = int(S * (1 - 2 * pad_frac))
scale = min(target / gw, target / gh)
glyph_resized = glyph_cropped.resize((max(1, round(gw * scale)), max(1, round(gh * scale))), Image.LANCZOS)
rw, rh = glyph_resized.size
CANVAS.paste(glyph_resized, ((S - rw) // 2, (S - rh) // 2), glyph_resized)

for size in (16, 32, 48, 128):
    im = CANVAS.resize((size, size), Image.LANCZOS)
    im.save(f'{outdir}/icon{size}.png')
print('ok')
