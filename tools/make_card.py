"""AR tracking card from a circular design PDF.

The design (ar/design.pdf) holds one circular artwork anywhere on the page. This
script finds it, scales it to DESIGN_MM, centres it on an A4 card and adds,
outside the artwork so nothing of it is covered:
  - a thin mode ring (FLAT / SMOOTH / PBR) around the circle,
  - a "front" arrow below the ring (where the viewer stands for 0°),
  - title, instructions and a QR code to /ar/ in the bottom-right corner.

Run from the repo root:  python3 tools/make_card.py [ar/design.pdf]
Writes ar/card.pdf, ar/card_preview.png and ar/target.png. Then compile
ar/target.png into ar/target.mind with tools/compile-target.html and set
TARGET_MM in ar/index.html to the value this script prints.
Needs: poppler (pdftoppm), pip install pillow numpy opencv-python qrcode
"""
import math, os, subprocess, sys, tempfile
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
import qrcode

DESIGN = sys.argv[1] if len(sys.argv) > 1 else "ar/design.pdf"
OUT = "ar"
URL = "https://felsenheim.github.io/OpenStudio3D/ar/"

DPI = 300
MM = DPI / 25.4
W, H = round(210 * MM), round(297 * MM)
DESIGN_MM = 120          # diameter of the artwork on paper
RING_IN, RING_OUT = 61.5, 66.0   # mode ring radii (mm), just outside the artwork
PAD_MM = 3               # margin around the ring in the tracking image
CY_MM = 118              # circle centre from the top of the sheet
TARGET_MM = 2 * (RING_OUT + PAD_MM)   # width of target.png on paper

F = "/usr/share/fonts/opentype/inter/"
def font(w, size_mm):
    try:
        return ImageFont.truetype(F + f"Inter-{w}.otf", round(size_mm * MM))
    except OSError:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if w in ("Bold", "SemiBold") else "DejaVuSans.ttf", round(size_mm * MM))

# --- load the design and cut out the circle -----------------------------------
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(["pdftoppm", "-r", "600", "-png", "-singlefile", DESIGN, os.path.join(tmp, "d")], check=True)
    page = cv2.cvtColor(cv2.imread(os.path.join(tmp, "d.png")), cv2.COLOR_BGR2RGB)
ys, xs = np.nonzero(cv2.cvtColor(page, cv2.COLOR_RGB2GRAY) < 245)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
dcx, dcy, dr = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2
art = Image.fromarray(page).crop((round(dcx - dr), round(dcy - dr), round(dcx + dr), round(dcy + dr)))
side = round(DESIGN_MM * MM)
art = art.resize((side, side), Image.LANCZOS)
mask = Image.new("L", (side, side), 0)
ImageDraw.Draw(mask).ellipse([0, 0, side - 1, side - 1], fill=255)

card = Image.new("RGB", (W, H), "white")
cx, cy = W / 2, CY_MM * MM
card.paste(art, (round(cx - side / 2), round(cy - side / 2)), mask)
d = ImageDraw.Draw(card)

def P(r_mm, deg):
    """Card angle: 0° at 6 o'clock (front), increasing clockwise seen from above."""
    a = math.radians(deg)
    return cx - math.sin(a) * r_mm * MM, cy + math.cos(a) * r_mm * MM

def curved_text(text, r_mm, mid_deg, fnt, fill, upright_top):
    widths = [d.textlength(c, font=fnt) for c in text]
    k = 180 / math.pi / (r_mm * MM)
    a = mid_deg - sum(widths) * k / 2 if upright_top else mid_deg + sum(widths) * k / 2
    for c, w in zip(text, widths):
        step = w * k
        ac = a + step / 2 if upright_top else a - step / 2
        g = Image.new("RGBA", (round(w) + 4, round(fnt.size * 1.4)), (0, 0, 0, 0))
        ImageDraw.Draw(g).text((2, 0), c, font=fnt, fill=fill)
        g = g.rotate(180 - ac if upright_top else -ac, Image.BICUBIC, expand=True)
        x, y = P(r_mm, ac)
        card.paste(g, (round(x - g.width / 2), round(y - g.height / 2)), g)
        a = a + step if upright_top else a - step

# --- mode ring outside the artwork ---------------------------------------------
ro, ri = RING_OUT * MM, RING_IN * MM
modes = [(-60, 60, (47, 74, 107), "FLAT"), (60, 180, (150, 150, 150), "SMOOTH"), (180, 300, (176, 108, 52), "PBR")]
for a0, a1, col, label in modes:
    d.pieslice([cx - ro, cy - ro, cx + ro, cy + ro], 90 + a0, 90 + a1, fill=col)
for a in (60, 180, 300):
    d.line([P(RING_IN - 0.5, a), P(RING_OUT + 0.5, a)], fill="white", width=round(0.8 * MM))
d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill="white")
card.paste(art, (round(cx - side / 2), round(cy - side / 2)), mask)   # artwork back on top
r = DESIGN_MM / 2 * MM
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline="black", width=round(0.5 * MM))
for a0, a1, col, label in modes:
    mid = (a0 + a1) / 2
    curved_text(label, (RING_IN + RING_OUT) / 2, mid, font("Bold", 2.8), "white", upright_top=90 < mid % 360 < 270)

# --- front arrow below the ring -------------------------------------------------
ty = cy + (RING_OUT + 2) * MM
d.polygon([(cx, ty), (cx - 3 * MM, ty + 4.5 * MM), (cx + 3 * MM, ty + 4.5 * MM)], fill="black")
d.text((cx, ty + 6 * MM), "front", font=font("Medium", 3), fill="black", anchor="mt")

# --- tracking image: square around the ring (arrow and text stay outside) --------
half = (RING_OUT + PAD_MM) * MM
box = tuple(round(v) for v in (cx - half, cy - half, cx + half, cy + half))
card.crop(box).resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, "target.png"))

# --- title, QR code (bottom-right corner), instructions ------------------------------
d.text((15 * MM, 12 * MM), "OpenStudio3D · AR", font=font("Bold", 6), fill="black")
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, box_size=10)
qr.add_data(URL); qr.make()
qs = round(35 * MM)
qimg = qr.make_image(fill_color="black", back_color="white").convert("RGB").resize((qs, qs), Image.NEAREST)
qx, qy = W - round(15 * MM) - qs, H - round(15 * MM) - qs
card.paste(qimg, (qx, qy))
d.text((15 * MM, qy + qs - 16 * MM), "Scan the QR code, allow the camera,", font=font("Medium", 3.6), fill="black")
d.text((15 * MM, qy + qs - 10 * MM), "point at the circle and walk around it.", font=font("Medium", 3.6), fill="black")
d.text((15 * MM, qy + qs), "Print at 100 % on matte paper.", font=font("Regular", 2.8), fill=(120, 120, 120), anchor="lb")

card.save(os.path.join(OUT, "card.pdf"), resolution=DPI)
card.resize((W // 3, H // 3), Image.LANCZOS).save(os.path.join(OUT, "card_preview.png"))
print(f"ok: artwork {DESIGN_MM} mm, ring to {2 * RING_OUT:.0f} mm, TARGET_MM = {TARGET_MM:.0f}")
