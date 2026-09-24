"""1400x560 CWS marquee tiles: icon + name + tagline left, first store screenshot right. Run from projects/."""
from PIL import Image, ImageDraw, ImageFont
B = "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"; R = "/usr/share/fonts/truetype/freefont/FreeSans.ttf"
F = ImageFont.truetype
tiles = [  # (extension dir, listing dir, screenshot, promo tile for colours, name, tagline lines)
  ("ext-reload-until", "ext-reload-until-listing/assets", "screenshot-1-hero.png", "promo-small-440x280.png",
   "Reload Until", ["Auto refresh a tab and get an alert", "when a text appears or disappears.", "Pay once. No tracking."]),
  ("ext-color-picker", "ext-color-picker-listing/assets", "screenshot-1-pick.png", "promo-small-440x280.png",
   "Color Picker & Palette", ["Pick any colour on a page, copy it", "in every format, keep palettes.", "Pay once. No tracking."]),
  ("ext-tab-lifeboat", "ext-tab-lifeboat-listing/assets", "screenshot-1-save-restore.png", "promo-small-440x280.png",
   "Tab Lifeboat", ["Save and restore tab sessions,", "with automatic snapshots and backups.", "Pay once. No tracking."]),
  ("ext-cookie-crate", "ext-cookie-crate-listing", "screenshot-1.png@crop", "promo-440x280.png",
   "Cookie Crate", ["Edit, export and import cookies,", "localStorage and sessionStorage.", "Pay once. No tracking."]),
]
for ext, adir, shot, promo, name, lines in tiles:
    pr = Image.open(f"{adir}/{promo}").convert("RGB")
    bg = pr.getpixel((5, 5)); lum = sum(bg) / 3; fg = "#111111" if lum > 128 else "#f5f5f5"
    c = Image.new("RGB", (1400, 560), bg); d = ImageDraw.Draw(c)
    crop = shot.endswith("@crop"); shot = shot.removesuffix("@crop")
    im = Image.open(f"{adir}/{shot}").convert("RGB")
    if crop: im = im.crop((525, 20, 1240, 780))  # drop the caption column of composed shots
    s = 480 / im.height; im = im.resize((int(im.width * s), 480), Image.LANCZOS)
    x = 1400 - im.width - 40
    d.rectangle([x - 1, 39, x + im.width, 40 + im.height], outline="#888888"); c.paste(im, (x, 40))
    icon = Image.open(f"{ext}/icons/icon128.png").convert("RGBA").resize((112, 112), Image.LANCZOS)
    c.paste(icon, (60, 90), icon)
    nf = F(B, 54)
    while d.textlength(name, font=nf) > x - 100: nf = F(B, nf.size - 2)
    d.text((60, 230), name, font=nf, fill=fg)
    for j, l in enumerate(lines):
        lf = F(R, 28)
        while d.textlength(l, font=lf) > x - 100: lf = F(R, lf.size - 1)
        d.text((60, 310 + j * 42), l, font=lf, fill=fg)
    out = f"{adir}/marquee-1400x560.png"; c.save(out); print(out, x)
