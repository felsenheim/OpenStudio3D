"""AR tracking card: A4, one round target filled with the model's scan texture,
a white centre with the mode ring (flat / smooth / PBR), QR code bottom-right.

Run from the repo root:  python3 tools/make_card.py [models/head.glb]
Writes ar/card.pdf, ar/card_preview.png and ar/target.png (compile target.png
with the MindAR compiler to get ar/target.mind).
Needs: pip install pillow numpy opencv-python qrcode"""
import sys, json, struct, io, os
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import qrcode

DPI = 300
MM = DPI / 25.4
W, H = round(210 * MM), round(297 * MM)
URL = "https://felsenheim.github.io/OpenStudio3D/ar/"
GLB = sys.argv[1] if len(sys.argv) > 1 else "models/head.glb"
OUT = "ar"

def base_color_texture(path):
    """Return the GLB's base-colour texture as a PIL image."""
    data = open(path, "rb").read()
    jlen = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + jlen])
    binc = data[20 + jlen + 8:]
    tex_index = gltf["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    img = gltf["images"][gltf["textures"][tex_index]["source"]]
    bv = gltf["bufferViews"][img["bufferView"]]
    off = bv.get("byteOffset", 0)
    return Image.open(io.BytesIO(binc[off:off + bv["byteLength"]]))

R = 92        # target radius in mm (184 mm diameter)
CY_MM = 112   # disc centre from the top of the sheet
F = "/usr/share/fonts/opentype/inter/"
def font(w, size_mm):
    return ImageFont.truetype(F + f"Inter-{w}.otf", round(size_mm * MM))

card = Image.new("RGB", (W, H), "white")
cx, cy = W / 2, CY_MM * MM

# texture: the scan's atlas, local contrast boosted (CLAHE) and sharpened
tex = base_color_texture(GLB).convert("RGB")
side = round(2 * R * MM)
tex = tex.resize((side, side), Image.LANCZOS).rotate(17, Image.BICUBIC)
lab = cv2.cvtColor(np.array(tex), cv2.COLOR_RGB2LAB)
lab[..., 0] = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(12, 12)).apply(lab[..., 0])
tex = Image.fromarray(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB))
tex = ImageEnhance.Brightness(tex).enhance(1.15)
tex = ImageEnhance.Sharpness(tex).enhance(1.8)

mask = Image.new("L", (side, side), 0)
ImageDraw.Draw(mask).ellipse([0, 0, side - 1, side - 1], fill=255)
card.paste(tex, (round(cx - side / 2), round(cy - side / 2)), mask)

d = ImageDraw.Draw(card)
r = R * MM
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline="black", width=round(0.6 * MM))
# centre: white stand area with a thin mode ring (flat / smooth / PBR)
import math
R_IN, R_RING = 30, 35   # mm: white disc radius, outer edge of the mode ring
def P(r_mm, deg):       # card angle: 0 deg at 6 o'clock (front), clockwise
    a = math.radians(deg)
    return cx - math.sin(a) * r_mm * MM, cy + math.cos(a) * r_mm * MM
def curved_text(text, r_mm, mid_deg, fnt, fill, upright_top):
    widths = [d.textlength(c, font=fnt) for c in text]
    k = 180 / math.pi / (r_mm * MM)
    total = sum(widths) * k
    a = mid_deg - total / 2 if upright_top else mid_deg + total / 2
    for c, w in zip(text, widths):
        step = w * k
        ac = a + step / 2 if upright_top else a - step / 2
        g = Image.new("RGBA", (round(w) + 4, round(fnt.size * 1.4)), (0, 0, 0, 0))
        ImageDraw.Draw(g).text((2, 0), c, font=fnt, fill=fill)
        g = g.rotate(180 - ac if upright_top else -ac, Image.BICUBIC, expand=True)
        x, y = P(r_mm, ac)
        card.paste(g, (round(x - g.width / 2), round(y - g.height / 2)), g)
        a = a + step if upright_top else a - step
rr = R_RING * MM
for a0, a1, col, label in [(-60, 60, (47, 74, 107), "FLAT"),
                           (60, 180, (150, 150, 150), "SMOOTH"),
                           (180, 300, (176, 108, 52), "PBR")]:
    d.pieslice([cx - rr, cy - rr, cx + rr, cy + rr], 90 + a0, 90 + a1, fill=col)
    mid = (a0 + a1) / 2
    curved_text(label, (R_IN + R_RING) / 2, mid, font("Bold", 2.8), "white",
                upright_top=90 < mid % 360 < 270)
for a in (60, 180, 300):
    d.line([P(R_IN, a), P(R_RING, a)], fill="white", width=round(0.8 * MM))
ri = R_IN * MM
d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill="white")
s6, lw = 5 * MM, round(0.35 * MM)
d.line([cx - s6, cy, cx + s6, cy], fill=(40, 40, 40), width=lw)
d.line([cx, cy - s6, cx, cy + s6], fill=(40, 40, 40), width=lw)
ax, ay = P(R_IN - 5, 0)
d.polygon([(ax, ay + 3 * MM), (ax - 2.2 * MM, ay - 1 * MM), (ax + 2.2 * MM, ay - 1 * MM)], fill=(40, 40, 40))
d.text((cx, ay - 2.5 * MM), "front", font=font("Medium", 2.6), fill=(70, 70, 70), anchor="mb")

# tracking image for the MindAR compiler: square around the disc
pad = 3 * MM
box = tuple(round(v) for v in (cx - r - pad, cy - r - pad, cx + r + pad, cy + r + pad))
card.crop(box).resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, "target.png"))

# title, QR code (bottom-right corner), one line of instructions
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
print("ok")
