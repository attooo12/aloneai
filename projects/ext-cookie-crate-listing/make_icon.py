"""Cookie Crate icon: a wooden crate with a chocolate-chip cookie on top. Drawn at 512px, downsampled."""
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
S = 512
def draw(S):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = S / 32
    # cookie (behind crate top)
    d.ellipse([7*u, 2*u, 25*u, 20*u], fill="#e0a95b", outline="#8a5a22", width=int(1.1*u))
    for x, y, r in [(12, 7, 1.5), (18.5, 6.5, 1.3), (15, 11, 1.4), (20.5, 11.5, 1.2), (10.5, 12, 1.1)]:
        d.ellipse([(x-r)*u, (y-r)*u, (x+r)*u, (y+r)*u], fill="#4a2c12")
    # crate
    d.rounded_rectangle([2*u, 14*u, 30*u, 30.5*u], radius=int(2*u), fill="#b7712b", outline="#5c3510", width=int(1.3*u))
    for y in (19.5, 25):
        d.line([2.6*u, y*u, 29.4*u, y*u], fill="#5c3510", width=int(1.1*u))
    d.line([6*u, 14.5*u, 26*u, 30*u], fill="#7a4617", width=int(1.6*u))
    for x in (6, 26):
        d.line([x*u, 14.6*u, x*u, 30*u], fill="#5c3510", width=int(1.2*u))
    return img
big = draw(S)
for size in (16, 32, 48, 128):
    big.resize((size, size), Image.LANCZOS).save(f"{out}/icon{size}.png")
print("ok")
