from __future__ import annotations

from pathlib import Path
import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "living"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(90417)


def hexrgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    w, h = size
    a, b = hexrgb(top), hexrgb(bottom)
    im = Image.new("RGB", size)
    px = im.load()
    for y in range(h):
        t = y / max(1, h - 1)
        row = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))
        for x in range(w):
            px[x, y] = row
    return im.convert("RGBA")


def grain(im: Image.Image, strength: int = 12, opacity: float = 0.12) -> Image.Image:
    noise = Image.effect_noise(im.size, strength).convert("L")
    tint = Image.new("RGBA", im.size, (255, 244, 225, 0))
    tint.putalpha(noise.point(lambda p: int(p * opacity)))
    return Image.alpha_composite(im.convert("RGBA"), tint)


def mask_gradient(mask: Image.Image, top: str, bottom: str, noise: int = 10) -> Image.Image:
    fill = gradient(mask.size, top, bottom)
    if noise:
        fill = grain(fill, noise, 0.08)
    fill.putalpha(mask)
    return fill


def rounded_mask(size: tuple[int, int], box: tuple[int, int, int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    return mask


def ellipse_mask(size: tuple[int, int], box: tuple[int, int, int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    return mask


def polygon_mask(size: tuple[int, int], pts: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    return mask


def add_shadow(base: Image.Image, mask: Image.Image, offset: tuple[int, int], blur: int, alpha: int = 90) -> None:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    moved = Image.new("L", base.size, 0)
    moved.paste(mask, offset)
    moved = moved.filter(ImageFilter.GaussianBlur(blur))
    moved = moved.point(lambda p: p * alpha // 255)
    shadow.putalpha(moved)
    base.alpha_composite(shadow)


def paint(base: Image.Image, mask: Image.Image, top: str, bottom: str, outline: str | None = None) -> None:
    if outline:
        outer = mask.filter(ImageFilter.MaxFilter(15))
        edge = Image.new("RGBA", base.size, hexrgb(outline) + (0,))
        edge.putalpha(outer.point(lambda p: int(p * 0.46)))
        base.alpha_composite(edge)
    base.alpha_composite(mask_gradient(mask, top, bottom, 14))


def make_mugi() -> Image.Image:
    size = (1024, 1024)
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    # Soft floor shadow.
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((255, 820, 790, 940), fill=(18, 21, 30, 125))
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    im.alpha_composite(shadow)

    # Tail behind body.
    tail_mask = Image.new("L", size, 0)
    td = ImageDraw.Draw(tail_mask)
    td.arc((595, 485, 925, 875), start=248, end=78, fill=255, width=105)
    add_shadow(im, tail_mask, (12, 20), 16, 80)
    paint(im, tail_mask, "#d28b55", "#9b5838", "#4d302b")
    stripe = Image.new("RGBA", size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(stripe)
    for a in (282, 307, 332):
        sdraw.arc((610, 500, 915, 860), start=a, end=a + 16, fill=(95, 50, 37, 180), width=38)
    stripe = stripe.filter(ImageFilter.GaussianBlur(5))
    im.alpha_composite(stripe)

    # Body, paws and head.
    body = ellipse_mask(size, (294, 450, 738, 880))
    chest = ellipse_mask(size, (415, 510, 626, 830))
    head = ellipse_mask(size, (230, 150, 795, 665))
    left_ear = polygon_mask(size, [(278, 256), (325, 82), (433, 225)])
    right_ear = polygon_mask(size, [(650, 225), (745, 78), (759, 286)])
    for mask in (left_ear, right_ear, body, head):
        add_shadow(im, mask, (12, 18), 18, 75)
        paint(im, mask, "#e9b276", "#b86c46", "#4a2f2b")
    paint(im, chest, "#f7e3c7", "#e8c9a5")

    # Inner ears.
    ear_inner = Image.new("RGBA", size, (0, 0, 0, 0))
    ed = ImageDraw.Draw(ear_inner)
    ed.polygon([(304, 239), (331, 126), (398, 226)], fill=(241, 161, 157, 220))
    ed.polygon([(674, 222), (730, 120), (733, 258)], fill=(241, 161, 157, 220))
    ear_inner = ear_inner.filter(ImageFilter.GaussianBlur(5))
    im.alpha_composite(ear_inner)

    # Paws.
    for box in ((315, 730, 470, 905), (565, 730, 720, 905)):
        pm = ellipse_mask(size, box)
        add_shadow(im, pm, (7, 11), 12, 65)
        paint(im, pm, "#f3d4ae", "#d9a574", "#5a382e")

    # Face patches and tabby markings.
    face = Image.new("RGBA", size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(face)
    fd.ellipse((342, 402, 500, 566), fill=(247, 224, 195, 245))
    fd.ellipse((500, 402, 658, 566), fill=(247, 224, 195, 245))
    fd.ellipse((420, 495, 580, 624), fill=(248, 229, 204, 240))
    # forehead and cheek stripes
    for x in (402, 478, 554):
        fd.rounded_rectangle((x, 215, x + 32, 328), radius=16, fill=(105, 56, 39, 205))
    for y in (405, 465, 525):
        fd.rounded_rectangle((265, y, 365, y + 24), radius=12, fill=(105, 56, 39, 190))
        fd.rounded_rectangle((660, y, 760, y + 24), radius=12, fill=(105, 56, 39, 190))
    face = face.filter(ImageFilter.GaussianBlur(3))
    im.alpha_composite(face)

    # Eyes with glass highlights.
    eye_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(eye_layer)
    for cx in (410, 610):
        d.ellipse((cx - 66, 333, cx + 66, 505), fill=(31, 39, 56, 255), outline=(17, 21, 33, 255), width=10)
        d.ellipse((cx - 35, 354, cx + 5, 405), fill=(255, 255, 244, 235))
        d.ellipse((cx + 16, 420, cx + 42, 451), fill=(118, 180, 199, 150))
    d.polygon([(510, 505), (483, 535), (537, 535)], fill=(132, 69, 66, 255))
    d.arc((456, 515, 510, 582), start=15, end=150, fill=(73, 46, 43, 255), width=8)
    d.arc((510, 515, 564, 582), start=30, end=165, fill=(73, 46, 43, 255), width=8)
    im.alpha_composite(eye_layer)

    # Plush seams and fur speckles.
    texture = Image.new("RGBA", size, (0, 0, 0, 0))
    tx = ImageDraw.Draw(texture)
    for _ in range(950):
        x = random.randint(260, 760)
        y = random.randint(145, 890)
        if random.random() < 0.65:
            tx.ellipse((x, y, x + random.randint(1, 4), y + random.randint(1, 4)), fill=(255, 238, 209, random.randint(16, 45)))
        else:
            tx.ellipse((x, y, x + 2, y + 2), fill=(74, 43, 34, random.randint(8, 22)))
    texture = texture.filter(ImageFilter.GaussianBlur(0.6))
    im.alpha_composite(texture)

    # Teal scarf, kept as Mugi's permanent silhouette cue.
    scarf = Image.new("RGBA", size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(scarf)
    sd.rounded_rectangle((315, 575, 720, 695), radius=52, fill=(37, 210, 199, 255), outline=(17, 103, 101, 210), width=12)
    sd.polygon([(620, 655), (782, 720), (675, 820), (610, 700)], fill=(39, 194, 188, 255))
    sd.line((645, 682, 728, 746), fill=(199, 255, 244, 165), width=10)
    scarf = grain(scarf, 13, 0.10)
    im.alpha_composite(scarf)

    # Soft light from upper left.
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((140, 70, 650, 610), fill=(255, 226, 167, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(85))
    im.alpha_composite(glow)
    return im


def draw_window(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int) -> None:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=28, fill=(37, 48, 65, 255), outline=(76, 58, 48, 255), width=16)
    draw.rounded_rectangle((x + 18, y + 18, x + w - 18, y + h - 18), radius=18, fill=(43, 79, 113, 255))
    draw.line((x + w // 2, y + 18, x + w // 2, y + h - 18), fill=(75, 55, 49, 255), width=12)
    draw.line((x + 18, y + h // 2, x + w - 18, y + h // 2), fill=(75, 55, 49, 255), width=12)
    for _ in range(18):
        sx = random.randint(x + 26, x + w - 26)
        sy = random.randint(y + 24, y + h - 24)
        r = random.randint(2, 5)
        draw.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(245, 232, 173, random.randint(110, 220)))


def lamp(layer: Image.Image, cx: int, top: int, length: int, color=(255, 214, 135, 255)) -> None:
    d = ImageDraw.Draw(layer)
    d.line((cx, top, cx, top + length), fill=(67, 49, 45, 255), width=8)
    d.ellipse((cx - 38, top + length - 8, cx + 38, top + length + 64), fill=color, outline=(78, 54, 45, 255), width=8)
    glow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((cx - 145, top + length - 60, cx + 145, top + length + 230), fill=(255, 204, 118, 80))
    layer.alpha_composite(glow.filter(ImageFilter.GaussianBlur(60)))


def make_room(kind: str) -> Image.Image:
    W, H = 1280, 760
    im = gradient((W, H), "#18293c", "#08121f")
    frame = ImageDraw.Draw(im)
    frame.rounded_rectangle((26, 24, W - 26, H - 24), radius=56, fill=(38, 35, 38, 255), outline=(89, 77, 68, 255), width=15)

    palettes = {
        "food": ("#f7dfbe", "#e5ae78", "#7b4a33"),
        "home": ("#f5e8dc", "#e5cab9", "#8a6054"),
        "lobby": ("#dccab2", "#b89a79", "#4b555e"),
        "craft": ("#ecd4b8", "#d6a878", "#825536"),
        "play": ("#e2eedc", "#bad7c0", "#4f806d"),
        "care": ("#ece7f5", "#cdc1e5", "#716297"),
    }
    top, bottom, accent = palettes[kind]
    inner = rounded_mask((W, H), (48, 46, W - 48, H - 62), 42)
    room = gradient((W, H), top, bottom)
    room = grain(room, 17, 0.10)
    room.putalpha(inner)
    im.alpha_composite(room)
    d = ImageDraw.Draw(im)
    # floorboards
    d.rectangle((48, 568, W - 48, H - 62), fill=hexrgb(accent) + (255,))
    for x in range(48, W - 48, 120):
        d.line((x, 568, x + 24, H - 62), fill=(57, 38, 35, 75), width=5)
    d.rectangle((48, 548, W - 48, 578), fill=(91, 59, 43, 255))
    draw_window(d, 88, 98, 292, 260)

    light_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lamp(light_layer, 755, 45, 75)
    lamp(light_layer, 1000, 45, 75)
    im.alpha_composite(light_layer)
    d = ImageDraw.Draw(im)

    if kind == "food":
        # fish diner counter and kitchen
        d.rounded_rectangle((440, 286, 1175, 580), radius=34, fill=(121, 68, 48, 255), outline=(68, 43, 40, 255), width=12)
        d.rounded_rectangle((420, 270, 1195, 330), radius=26, fill=(77, 45, 39, 255))
        d.rounded_rectangle((500, 346, 690, 520), radius=18, fill=(218, 147, 94, 255))
        d.rounded_rectangle((720, 346, 910, 520), radius=18, fill=(218, 147, 94, 255))
        d.rounded_rectangle((940, 346, 1120, 520), radius=18, fill=(218, 147, 94, 255))
        # fish sign and plates
        d.ellipse((500, 205, 980, 260), fill=(106, 60, 46, 255))
        for x in (555, 690, 825, 960):
            d.ellipse((x, 220, x + 54, 260), fill=(239, 135, 85, 255))
        for x in (515, 755, 995):
            d.ellipse((x, 480, x + 110, 520), fill=(244, 222, 184, 255))
            d.polygon([(x + 24, 500), (x + 57, 482), (x + 90, 500), (x + 57, 511)], fill=(91, 150, 164, 255))
        # steam
        steam = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(steam)
        for x in (560, 810, 1040):
            sd.arc((x, 410, x + 60, 505), 180, 355, fill=(255, 250, 233, 170), width=10)
        im.alpha_composite(steam.filter(ImageFilter.GaussianBlur(4)))
    elif kind == "home":
        d.rounded_rectangle((370, 360, 950, 605), radius=86, fill=(91, 165, 169, 255), outline=(69, 81, 84, 255), width=12)
        d.rounded_rectangle((410, 315, 910, 500), radius=72, fill=(240, 215, 196, 255))
        d.rounded_rectangle((440, 336, 655, 500), radius=62, fill=(239, 166, 160, 255))
        d.rounded_rectangle((665, 336, 880, 500), radius=62, fill=(200, 181, 228, 255))
        # cat tower and shelves
        d.ellipse((980, 280, 1180, 520), fill=(185, 149, 103, 255), outline=(92, 65, 50, 255), width=12)
        for y in (340, 405, 470):
            d.line((1020, y, 1140, y), fill=(92, 65, 50, 255), width=14)
        d.rounded_rectangle((80, 390, 310, 520), radius=34, fill=(217, 189, 146, 255))
        d.ellipse((120, 420, 190, 488), fill=(130, 91, 69, 255))
        d.ellipse((200, 426, 264, 492), fill=(104, 154, 119, 255))
        # toys
        for x, col in ((480, (224, 111, 95, 255)), (570, (118, 180, 143, 255)), (660, (176, 144, 220, 255))):
            d.ellipse((x, 610, x + 52, 662), fill=col)
    elif kind == "lobby":
        d.rounded_rectangle((430, 342, 870, 590), radius=34, fill=(83, 145, 137, 255), outline=(49, 81, 78, 255), width=12)
        d.rounded_rectangle((404, 320, 898, 385), radius=24, fill=(64, 105, 101, 255))
        # elevator and front door
        d.rounded_rectangle((915, 150, 1175, 590), radius=26, fill=(92, 103, 113, 255), outline=(54, 60, 66, 255), width=16)
        d.line((1045, 170, 1045, 570), fill=(57, 63, 71, 255), width=12)
        d.rounded_rectangle((95, 330, 338, 590), radius=24, fill=(93, 117, 125, 255), outline=(76, 57, 48, 255), width=14)
        d.ellipse((290, 455, 312, 477), fill=(242, 201, 110, 255))
        # parcel corner and bell
        for bx, by, bw, bh in ((400, 485, 120, 105), (505, 510, 105, 80), (600, 475, 142, 115)):
            d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=14, fill=(194, 139, 87, 255), outline=(102, 67, 46, 255), width=8)
            d.line((bx + bw // 2, by + 8, bx + bw // 2, by + bh - 8), fill=(232, 196, 128, 255), width=7)
        d.ellipse((718, 350, 808, 430), fill=(244, 208, 101, 255), outline=(106, 76, 42, 255), width=8)
    elif kind == "craft":
        d.rounded_rectangle((390, 360, 1160, 585), radius=30, fill=(126, 82, 54, 255), outline=(72, 48, 38, 255), width=12)
        for bx, by, bw, bh in ((430, 390, 210, 160), (670, 350, 250, 200), (950, 420, 170, 130)):
            d.rounded_rectangle((bx, by, bx + bw, by + bh), radius=18, fill=(204, 143, 84, 255), outline=(103, 67, 42, 255), width=10)
            d.line((bx + bw // 2, by + 8, bx + bw // 2, by + bh - 8), fill=(242, 204, 127, 255), width=9)
        d.rounded_rectangle((85, 405, 340, 525), radius=26, fill=(164, 118, 77, 255))
        d.ellipse((125, 430, 205, 510), fill=(224, 179, 87, 255))
        d.rounded_rectangle((220, 434, 310, 505), radius=16, fill=(83, 132, 136, 255))
    elif kind == "play":
        # Yarn wall, tunnel and baskets.
        for yy in (250, 355, 460):
            d.rounded_rectangle((420, yy, 1135, yy + 76), radius=22, fill=(105, 130, 108, 255))
            for x, col in zip(range(455, 1100, 104), [(213, 118, 125, 255), (130, 108, 194, 255), (225, 178, 92, 255), (85, 166, 145, 255)] * 2):
                d.ellipse((x, yy + 10, x + 58, yy + 68), fill=col)
        d.rounded_rectangle((95, 390, 345, 555), radius=80, fill=(117, 172, 151, 255), outline=(66, 113, 99, 255), width=12)
        d.ellipse((165, 420, 285, 535), fill=(61, 88, 81, 255))
        for x, col in ((470, (180, 120, 214, 255)), (585, (224, 130, 122, 255)), (700, (218, 181, 92, 255))):
            d.ellipse((x, 585, x + 82, 667), fill=col)
    elif kind == "care":
        d.rounded_rectangle((440, 360, 900, 605), radius=80, fill=(145, 203, 212, 255), outline=(78, 107, 119, 255), width=12)
        d.rounded_rectangle((500, 410, 840, 555), radius=60, fill=(218, 244, 243, 255))
        d.ellipse((940, 170, 1160, 390), fill=(224, 218, 239, 255), outline=(105, 91, 126, 255), width=14)
        d.rounded_rectangle((95, 390, 340, 560), radius=28, fill=(205, 184, 223, 255))
        for y in (420, 468, 516):
            d.rounded_rectangle((120, y, 310, y + 32), radius=12, fill=(250, 245, 236, 255))
        bubbles = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bubbles)
        for _ in range(28):
            r = random.randint(14, 42)
            x = random.randint(455, 910)
            y = random.randint(300, 610)
            bd.ellipse((x, y, x + r, y + r), outline=(255, 255, 255, 190), width=4)
        im.alpha_composite(bubbles)

    # Room-wide warm pools and vignette.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((350, 80, 1170, 690), fill=(255, 211, 145, 45))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    im.alpha_composite(glow)
    vignette = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vignette)
    vd.rectangle((0, 0, W, H), fill=120)
    vd.rounded_rectangle((45, 43, W - 45, H - 58), radius=44, fill=0)
    vignette = vignette.filter(ImageFilter.GaussianBlur(35))
    dark = Image.new("RGBA", (W, H), (2, 7, 14, 0))
    dark.putalpha(vignette)
    im.alpha_composite(dark)
    return grain(im, 11, 0.06)


def load_cat(name: str) -> Image.Image:
    path = ROOT / "assets" / "illustrations" / f"cat-{name}.v070.webp"
    with Image.open(path) as src:
        return src.convert("RGBA")


def make_roof() -> Image.Image:
    W, H = 1280, 520
    im = gradient((W, H), "#102944", "#07121f")
    d = ImageDraw.Draw(im)
    for _ in range(90):
        x, y = random.randint(30, W - 30), random.randint(20, 260)
        r = random.choice((2, 2, 3, 4))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(248, 236, 183, random.randint(100, 220)))
    d.ellipse((960, 45, 1165, 250), fill=(247, 232, 174, 255))
    d.rounded_rectangle((34, 310, W - 34, H - 30), radius=45, fill=(32, 48, 69, 255), outline=(77, 91, 109, 255), width=14)
    d.rounded_rectangle((350, 330, 720, 480), radius=50, fill=(71, 91, 104, 255), outline=(38, 53, 66, 255), width=12)
    d.line((535, 180, 535, 345), fill=(105, 120, 142, 255), width=13)
    d.line((535, 205, 470, 255), fill=(105, 120, 142, 255), width=9)
    d.line((535, 205, 600, 255), fill=(105, 120, 142, 255), width=9)
    d.rounded_rectangle((790, 335, 905, 468), radius=22, fill=(90, 132, 102, 255))
    d.ellipse((805, 300, 890, 395), fill=(74, 149, 105, 255))
    return grain(im, 12, 0.08)


def make_title(mugi: Image.Image, rooms: dict[str, Image.Image]) -> Image.Image:
    W, H = 1170, 2532
    im = gradient((W, H), "#102c4c", "#030812")
    d = ImageDraw.Draw(im)
    # stars and rain
    for _ in range(180):
        x, y = random.randint(15, W - 15), random.randint(30, 1450)
        r = random.choice((1, 2, 2, 3, 4))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(245, 233, 183, random.randint(80, 215)))
    d.ellipse((870, 110, 1085, 325), fill=(246, 229, 163, 255))
    # skyline
    for x in range(-20, W, 86):
        bh = random.randint(150, 420)
        d.rectangle((x, 1620 - bh, x + random.randint(55, 92), 1700), fill=(7, 17, 30, 255))
    rain = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rain)
    for _ in range(135):
        x, y = random.randint(-100, W), random.randint(0, 1800)
        rd.line((x, y, x + 20, y + 85), fill=(166, 206, 235, random.randint(18, 55)), width=3)
    im.alpha_composite(rain.filter(ImageFilter.GaussianBlur(0.7)))

    # Dollhouse tower, built from the exact room art used in game.
    tx, tw = 116, 938
    top_y = 380
    floor_h = 380
    shell = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shell)
    sd.rounded_rectangle((tx - 34, top_y - 100, tx + tw + 34, top_y + floor_h * 4 + 84), radius=70, fill=(17, 27, 40, 255), outline=(77, 68, 61, 255), width=22)
    for i, kind in enumerate(("craft", "food", "home", "lobby")):
        panel = rooms[kind].resize((tw, floor_h), Image.Resampling.LANCZOS)
        shell.alpha_composite(panel, (tx, top_y + i * floor_h))
    # roof triangle and warm sign
    sd.polygon([(tx - 55, top_y - 70), (tx + tw // 2, 160), (tx + tw + 55, top_y - 70)], fill=(104, 58, 50, 255), outline=(55, 38, 40, 255))
    sd.rounded_rectangle((tx + 250, top_y - 18, tx + tw - 250, top_y + 74), radius=32, fill=(53, 207, 196, 255), outline=(14, 81, 86, 255), width=10)
    im.alpha_composite(shell)

    # Cats in the windows. Mugi is the new procedural plush asset.
    cat_specs = [
        (mugi, 485, top_y + floor_h + 40, 280),
        (load_cat("luna"), 220, top_y + floor_h * 2 + 78, 230),
        (load_cat("toto"), 475, top_y + floor_h * 2 + 78, 230),
        (load_cat("mimi"), 730, top_y + floor_h * 2 + 78, 230),
    ]
    for cat, x, y, s in cat_specs:
        cat = cat.copy()
        cat.thumbnail((s, s), Image.Resampling.LANCZOS)
        im.alpha_composite(cat, (x, y))

    # Bottom fade for HTML logo and CTA.
    fade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fp = fade.load()
    for y in range(H):
        if y < 1430:
            a = 0
        else:
            a = min(245, int((y - 1430) / (H - 1430) * 255))
        for x in range(W):
            fp[x, y] = (2, 6, 13, a)
    im.alpha_composite(fade)
    return grain(im, 10, 0.05)


def save_webp(im: Image.Image, path: Path, quality: int = 88) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6, lossless=False)
    with Image.open(path) as verify:
        verify.load()
        if verify.format != "WEBP":
            raise RuntimeError(f"{path} is not WebP")


def main() -> None:
    mugi = make_mugi()
    save_webp(mugi, OUT / "cat-mugi-living-v09.webp", 92)
    rooms = {kind: make_room(kind) for kind in ("food", "home", "lobby", "craft", "play", "care")}
    for kind, room in rooms.items():
        save_webp(room, OUT / f"room-{kind}-v09.webp", 88)
    save_webp(make_roof(), OUT / "roof-v09.webp", 88)
    save_webp(make_title(mugi, rooms), OUT / "title-living-v09.webp", 88)
    print("Living Tower V0.9 raster assets written:")
    for p in sorted(OUT.glob("*.webp")):
        with Image.open(p) as im:
            print(p.name, im.size, p.stat().st_size)


if __name__ == "__main__":
    main()
