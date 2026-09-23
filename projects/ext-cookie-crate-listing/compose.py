"""Compose 1280x800 store screenshots and the 440x280 promo tile from raw-*.png (real UI renders)."""
from PIL import Image, ImageDraw, ImageFont
B = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"; R = "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
def font(p, s): return ImageFont.truetype(p, s)
shots = [
  ("raw-1.png", "#fef3c7", "#1c1917", "Every cookie this site gets", ["Parent-domain, other-path, Secure,", "HttpOnly and partitioned (CHIPS)", "cookies. Edit every field, add,", "delete, copy, search."]),
  ("raw-2.png", "#1c1917", "#fef3c7", "Delete all means all", ["Really removes every cookie that", "applies to the site, including", "parent-domain ones. Protected", "cookies (Pro) stay. Dark mode."]),
  ("raw-3.png", "#fef3c7", "#1c1917", "localStorage and sessionStorage", ["View, edit, add and delete entries", "of the current tab. Export and", "import cookies as JSON. Local", "only: no account, no tracking."]),
]
icon = Image.open("../ext-cookie-crate/icons/icon128.png").convert("RGBA")
for i, (raw, bg, fg, title, lines) in enumerate(shots, 1):
    c = Image.new("RGB", (1280, 800), bg); d = ImageDraw.Draw(c)
    im = Image.open(raw).convert("RGB")
    s = min(740 / im.height, 700 / im.width); im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    x, y = 1280 - im.width - 50, (800 - im.height) // 2
    d.rectangle([x - 1, y - 1, x + im.width, y + im.height], outline="#a8a29e")
    c.paste(im, (x, y))
    c.paste(icon.resize((72, 72), Image.LANCZOS), (60, 150), icon.resize((72, 72), Image.LANCZOS))
    d.text((60, 240), "Cookie Crate", font=font(B, 30), fill="#b45309")
    tf = font(B, 36 if len(title) < 26 else 30)
    words = title.split(); line = ""; ty = 290
    for w in words:
        if d.textlength(line + " " + w, font=tf) > x - 110: d.text((60, ty), line.strip(), font=tf, fill=fg); ty += 46; line = ""
        line += " " + w
    d.text((60, ty), line.strip(), font=tf, fill=fg); ty += 70
    for l in lines: d.text((60, ty), l, font=font(R, 22), fill=fg); ty += 32
    c.save(f"screenshot-{i}.png")
p = Image.new("RGB", (440, 280), "#fef3c7"); d = ImageDraw.Draw(p)
p.paste(icon.resize((96, 96), Image.LANCZOS), (30, 40), icon.resize((96, 96), Image.LANCZOS))
d.text((140, 52), "Cookie Crate", font=font(B, 34), fill="#1c1917")
d.text((140, 96), "Cookie & Storage Editor", font=font(R, 20), fill="#44403c")
for j, l in enumerate(["Edit, export and import cookies,", "localStorage and sessionStorage.", "Delete all that really deletes all.", "Local only. No tracking."]):
    d.text((30, 160 + j * 25), l, font=font(R, 19), fill="#1c1917")
p.save("promo-440x280.png")
print("ok")
