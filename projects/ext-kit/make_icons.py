"""Generate simple PNG icons (16/32/48/128) from a letter + colour, no dependencies beyond Pillow."""
import sys
from PIL import Image, ImageDraw, ImageFont
letter, color, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
for size in (16, 32, 48, 128):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 5, fill=color)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/freefont/FreeSansBold.ttf", int(size * 0.62))
    except OSError:
        font = ImageFont.load_default()
    box = d.textbbox((0, 0), letter, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), letter, fill="white", font=font)
    img.save(f"{outdir}/icon{size}.png")
print("ok")
