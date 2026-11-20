"""Build the printable A4 sheet for the model-viewer AR page.

    pip install pillow qrcode
    python3 tools/make_mv_card.py        (from the repo root)

Writes mv/ar/card.pdf (A4, 300 dpi) and mv/ar/card_preview.png.
Uses mv/ar/flower_render.png (a transparent render of the model) if present.
"""
from pathlib import Path
import qrcode
from PIL import Image, ImageDraw, ImageFont

URL = "https://felsenheim.github.io/OpenStudio3D/mv/ar/"
TITLE = "OpenStudio3D · AR"
HEADLINE = "A flower, 1.1 m wide"
LINES = [
    "1  Scan the QR code with your phone camera.",
    "2  Tap “View in AR”.",
    "3  Point the phone at the floor and step back about 2 m.",
]
FOOTER = "iPhone / iPad: Safari · Android: Chrome · Allow the camera when asked."

DPI = 300
MM = DPI / 25.4
W, H = round(210 * MM), round(297 * MM)
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "mv" / "ar"
FONT_DIR = Path("/usr/share/fonts/opentype/inter")


def font(name, size_mm):
    return ImageFont.truetype(str(FONT_DIR / name), round(size_mm * MM))


def main():
    page = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(page)
    margin = 18 * MM
    ink, grey, blue = (25, 25, 25), (110, 110, 110), (47, 74, 107)

    # Title and headline
    d.text((margin, margin), TITLE, font=font("Inter-SemiBold.otf", 6), fill=blue)
    d.text((margin, margin + 11 * MM), HEADLINE, font=font("Inter-Bold.otf", 11), fill=ink)

    # Render of the model
    top = margin + 32 * MM
    render = OUT / "flower_render.png"
    if render.exists():
        im = Image.open(render).convert("RGBA")
        im = im.crop(im.getchannel("A").getbbox())
        box_w, box_h = W - 2 * margin, 95 * MM
        s = min(box_w / im.width, box_h / im.height)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        page.paste(im, (round((W - im.width) / 2), round(top + (box_h - im.height) / 2)), im)
        top += box_h + 10 * MM

    # QR code, centred
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, box_size=10)
    qr.add_data(URL)
    qr.make(fit=True)
    q = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    size = round(60 * MM)
    q = q.resize((size, size), Image.NEAREST)
    page.paste(q, (round((W - size) / 2), round(top)))
    url_font = font("Inter-Regular.otf", 3.2)
    tw = d.textlength(URL, font=url_font)
    d.text(((W - tw) / 2, top + size + 4 * MM), URL, font=url_font, fill=grey)

    # Instructions
    y = top + size + 16 * MM
    step_font = font("Inter-Regular.otf", 4.6)
    for line in LINES:
        d.text((margin + 20 * MM, y), line, font=step_font, fill=ink)
        y += 8 * MM
    d.text((margin + 20 * MM, y + 3 * MM), FOOTER, font=font("Inter-Regular.otf", 3.4), fill=grey)

    OUT.mkdir(parents=True, exist_ok=True)
    page.save(OUT / "card.pdf", resolution=DPI)
    page.resize((W // 5, H // 5), Image.LANCZOS).save(OUT / "card_preview.png")
    print("wrote", OUT / "card.pdf")


if __name__ == "__main__":
    main()
