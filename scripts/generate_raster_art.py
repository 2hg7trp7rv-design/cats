from __future__ import annotations

import json
import math
import random
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "illustrations"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(20260813)


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    w, h = size
    image = Image.new("RGB", size)
    d = ImageDraw.Draw(image)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line((0, y, w, y), fill=tuple(lerp(top[i], bottom[i], t) for i in range(3)))
    return image


def soft_ellipse(base: Image.Image, box, color, blur=16, alpha=130):
    layer = Image.new("RGBA", base.size)
    d = ImageDraw.Draw(layer)
    c = (*color[:3], alpha)
    d.ellipse(box, fill=c)
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def plush_fill(size, mask: Image.Image, light, mid, dark, seed=1):
    w, h = size
    fill = Image.new("RGBA", size)
    pix = fill.load()
    rnd = random.Random(seed)
    for y in range(h):
        for x in range(w):
            t = max(0.0, min(1.0, (x * .35 + y * .65) / max(1, w * .35 + h * .65)))
            c0 = tuple(lerp(light[i], mid[i], min(1, t * 1.35)) for i in range(3))
            c1 = tuple(lerp(c0[i], dark[i], max(0, (t - .55) * 1.55)) for i in range(3))
            n = rnd.randint(-4, 4)
            pix[x, y] = tuple(max(0, min(255, v + n)) for v in c1) + (255,)
    fill.putalpha(mask)
    return fill


def cat_sprite(name, fur, dark, light, pattern, accessory, accent, pose="idle"):
    S = 3
    size = (256 * S, 256 * S)
    im = Image.new("RGBA", size)
    d = ImageDraw.Draw(im)
    def B(v): return round(v * S)
    def box(v): return tuple(B(x) for x in v)

    soft_ellipse(im, box((45, 202, 215, 247)), (0, 0, 0), 18 * S, 95)
    body_mask = Image.new("L", size)
    bm = ImageDraw.Draw(body_mask)
    bm.ellipse(box((62, 106, 200, 232)), fill=255)
    head_mask = Image.new("L", size)
    hm = ImageDraw.Draw(head_mask)
    hm.ellipse(box((45, 39, 207, 187)), fill=255)
    hm.polygon([box((61, 78))[0:2], box((58, 14))[0:2], box((105, 52))[0:2]], fill=255)
    hm.polygon([box((151, 52))[0:2], box((202, 14))[0:2], box((195, 83))[0:2]], fill=255)
    im.alpha_composite(plush_fill(size, body_mask, light, fur, dark, 11))
    im.alpha_composite(plush_fill(size, head_mask, light, fur, dark, 17))

    # tail and paws
    tail = Image.new("RGBA", size)
    td = ImageDraw.Draw(tail)
    td.arc(box((151, 113, 246, 231)), 205, 515, fill=(*dark, 255), width=B(26))
    tail = tail.filter(ImageFilter.GaussianBlur(B(.7)))
    im.alpha_composite(tail, (0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse(box((62, 170, 122, 235)), fill=(*fur, 255), outline=(*dark, 90), width=B(2))
    d.ellipse(box((139, 170, 199, 235)), fill=(*fur, 255), outline=(*dark, 90), width=B(2))

    # ears and muzzle
    d.polygon([box((68, 65))[0:2], box((62, 28))[0:2], box((96, 57))[0:2]], fill=(244, 165, 171, 235))
    d.polygon([box((163, 57))[0:2], box((194, 28))[0:2], box((190, 68))[0:2]], fill=(244, 165, 171, 235))
    d.ellipse(box((82, 99, 177, 174)), fill=(*light, 225))

    # pattern
    if pattern == "tiger":
        for x in (93, 126, 159):
            d.line((B(x), B(54), B(x-4 if x != 126 else x), B(91)), fill=(*dark, 210), width=B(9))
        for y in (111, 126):
            d.line((B(52), B(y), B(78), B(y+2)), fill=(*dark, 180), width=B(7))
            d.line((B(178), B(y+2), B(204), B(y)), fill=(*dark, 180), width=B(7))
    elif pattern == "tuxedo":
        d.polygon([box((75, 52))[0:2], box((126, 91))[0:2], box((183, 50))[0:2], box((172, 110))[0:2], box((126, 132))[0:2], box((82, 107))[0:2]], fill=(*dark, 235))
        d.polygon([box((101, 83))[0:2], box((126, 111))[0:2], box((151, 83))[0:2], box((145, 135))[0:2], box((106, 135))[0:2]], fill=(*light, 255))
    elif pattern == "gray":
        d.ellipse(box((47, 53, 124, 121)), fill=(*dark, 155))
        d.ellipse(box((153, 121, 205, 175)), fill=(*dark, 125))
    elif pattern == "calico":
        d.ellipse(box((47, 48, 117, 115)), fill=(159, 94, 67, 230))
        d.ellipse(box((147, 43, 204, 110)), fill=(65, 60, 68, 230))
        d.ellipse(box((151, 121, 202, 178)), fill=(159, 94, 67, 210))

    # face
    eye_y = 108 if pose != "sleep" else 113
    if pose == "sleep":
        d.arc(box((78, eye_y-8, 113, eye_y+15)), 10, 170, fill=(48, 46, 55, 255), width=B(5))
        d.arc(box((143, eye_y-8, 178, eye_y+15)), 10, 170, fill=(48, 46, 55, 255), width=B(5))
    else:
        for cx in (98, 158):
            d.ellipse(box((cx-15, eye_y-18, cx+15, eye_y+18)), fill=(34, 45, 66, 255))
            d.ellipse(box((cx-8, eye_y-13, cx+1, eye_y-4)), fill=(255, 255, 255, 240))
    d.polygon([box((126, 128))[0:2], box((117, 136))[0:2], box((126, 144))[0:2], box((135, 136))[0:2]], fill=(145, 82, 86, 255))
    d.arc(box((104, 135, 128, 158)), 345, 120, fill=(75, 49, 54, 255), width=B(4))
    d.arc(box((126, 135, 151, 158)), 60, 195, fill=(75, 49, 54, 255), width=B(4))
    for y in (132, 143):
        d.line((B(75), B(y), B(40), B(y-2)), fill=(89, 65, 64, 170), width=B(3))
        d.line((B(181), B(y), B(216), B(y-2)), fill=(89, 65, 64, 170), width=B(3))

    # plush seams
    seam = (95, 64, 62, 80)
    d.arc(box((47, 41, 207, 189)), 5, 176, fill=seam, width=B(2))
    d.arc(box((64, 107, 200, 233)), 5, 176, fill=seam, width=B(2))

    # accessory
    if accessory == "scarf":
        d.rounded_rectangle(box((72, 160, 185, 188)), radius=B(10), fill=(*accent, 255))
        d.polygon([box((160, 181))[0:2], box((191, 223))[0:2], box((157, 216))[0:2]], fill=(*accent, 255))
    elif accessory == "bow":
        d.ellipse(box((171, 58, 202, 90)), fill=(*accent, 255))
        d.ellipse(box((145, 58, 176, 90)), fill=(*accent, 255))
        d.ellipse(box((168, 66, 180, 82)), fill=(245, 225, 255, 255))
    elif accessory == "apron":
        d.polygon([box((82, 163))[0:2], box((175, 163))[0:2], box((186, 229))[0:2], box((71, 229))[0:2]], fill=(*accent, 245))
        d.rounded_rectangle(box((105, 188, 153, 213)), radius=B(7), fill=(255, 255, 255, 65))
    elif accessory == "cap":
        d.pieslice(box((66, 26, 190, 101)), 180, 360, fill=(*accent, 255))
        d.rounded_rectangle(box((126, 60, 212, 78)), radius=B(8), fill=(*accent, 255))

    # fabric speckle and soft highlight
    texture = Image.new("RGBA", size)
    tx = ImageDraw.Draw(texture)
    rnd = random.Random(name)
    for _ in range(1300):
        x, y = rnd.randrange(size[0]), rnd.randrange(size[1])
        tx.point((x, y), fill=(255, 255, 255, rnd.randrange(4, 17)))
    im.alpha_composite(texture.filter(ImageFilter.GaussianBlur(.35 * S)))
    hi = Image.new("RGBA", size)
    hd = ImageDraw.Draw(hi)
    hd.ellipse(box((67, 42, 165, 126)), fill=(255, 255, 255, 28))
    im.alpha_composite(hi.filter(ImageFilter.GaussianBlur(18 * S)))
    im = im.resize((256, 256), Image.Resampling.LANCZOS)
    im.save(OUT / f"cat-{name}.webp", "WEBP", quality=88, method=6)
    return im


def enemy_sprite(name, kind):
    S = 3
    size = (192 * S, 192 * S)
    im = Image.new("RGBA", size)
    d = ImageDraw.Draw(im)
    B = lambda v: round(v * S)
    bx = lambda v: tuple(B(x) for x in v)
    soft_ellipse(im, bx((28, 148, 166, 185)), (0, 0, 0), 14 * S, 100)
    if kind == "blob":
        d.ellipse(bx((35, 42, 158, 165)), fill=(80, 50, 112, 255), outline=(167, 100, 213, 220), width=B(4))
        d.ellipse(bx((58, 88, 91, 119)), fill=(255, 194, 48, 255)); d.ellipse(bx((111, 88, 144, 119)), fill=(255, 194, 48, 255))
        d.polygon([bx((62, 104))[0:2], bx((86, 110))[0:2], bx((65, 116))[0:2]], fill=(45, 25, 70, 255))
        d.polygon([bx((138, 104))[0:2], bx((114, 110))[0:2], bx((136, 116))[0:2]], fill=(45, 25, 70, 255))
        for x, y, r in ((37, 75, 13), (159, 68, 11), (42, 139, 14), (154, 139, 13)):
            d.ellipse(bx((x-r, y-r, x+r, y+r)), fill=(93, 57, 128, 245))
    elif kind == "robot":
        d.ellipse(bx((42, 67, 155, 154)), fill=(129, 143, 161, 255), outline=(54, 66, 81, 255), width=B(5))
        d.ellipse(bx((70, 36, 101, 82)), fill=(145, 158, 177, 255), outline=(54, 66, 81, 255), width=B(4))
        d.ellipse(bx((118, 36, 149, 82)), fill=(145, 158, 177, 255), outline=(54, 66, 81, 255), width=B(4))
        for cx in (83, 129):
            d.ellipse(bx((cx-13, 88, cx+13, 114)), fill=(230, 56, 56, 255)); d.ellipse(bx((cx-5, 93, cx+3, 101)), fill=(255, 228, 148, 255))
        d.ellipse(bx((74, 140, 104, 170)), fill=(55, 63, 77, 255)); d.ellipse(bx((121, 140, 151, 170)), fill=(55, 63, 77, 255))
        d.line((B(150), B(78), B(180), B(58)), fill=(80, 90, 103, 255), width=B(6)); d.ellipse(bx((172, 48, 187, 63)), fill=(242, 64, 64, 255))
    else:
        d.ellipse(bx((39, 51, 156, 164)), fill=(118, 105, 111, 255), outline=(51, 44, 53, 255), width=B(5))
        d.ellipse(bx((52, 73, 143, 138)), fill=(51, 44, 53, 255))
        d.ellipse(bx((69, 91, 98, 119)), fill=(245, 180, 72, 255)); d.ellipse(bx((112, 91, 141, 119)), fill=(245, 180, 72, 255))
        d.arc(bx((83, 122, 126, 149)), 15, 165, fill=(235, 220, 209, 255), width=B(6))
        d.rounded_rectangle(bx((47, 36, 150, 66)), radius=B(13), fill=(194, 61, 53, 255))
        d.ellipse(bx((128, 126, 184, 176)), fill=(151, 119, 85, 255)); d.line((B(141), B(136), B(167), B(164)), fill=(89, 67, 50, 255), width=B(5))
    im = im.filter(ImageFilter.GaussianBlur(.3 * S)).resize((192, 192), Image.Resampling.LANCZOS)
    im.save(OUT / f"enemy-{name}.webp", "WEBP", quality=88, method=6)


def room(name, palette, features):
    W, H = 720, 348
    im = gradient((W, H), palette[0], palette[1]).convert("RGBA")
    d = ImageDraw.Draw(im)
    d.rectangle((0, 285, W, H), fill=palette[2])
    d.rectangle((42, 35, 205, 172), fill=(54, 78, 104, 255), outline=(96, 74, 61, 255), width=12)
    d.line((124, 35, 124, 172), fill=(96, 74, 61, 255), width=8)
    d.line((42, 102, 205, 102), fill=(96, 74, 61, 255), width=8)
    # stars in the window
    for _ in range(14):
        x, y = random.randint(55, 190), random.randint(48, 158)
        d.ellipse((x, y, x+4, y+4), fill=(250, 239, 181, 210))
    # warm lamps
    for x in (285, 520):
        d.line((x, 0, x, 54), fill=(75, 56, 47, 255), width=5)
        soft_ellipse(im, (x-75, 25, x+75, 175), (255, 194, 91), 28, 105)
        d.ellipse((x-26, 48, x+26, 92), fill=(255, 214, 128, 255), outline=(85, 61, 45, 255), width=5)
    if "counter" in features:
        d.rounded_rectangle((250, 178, 680, 305), 18, fill=(128, 79, 53, 255), outline=(73, 47, 39, 255), width=8)
        for x in range(280, 650, 70): d.rectangle((x, 195, x+44, 226), fill=(228, 174, 96, 255))
        d.rectangle((342, 95, 630, 152), fill=(84, 55, 45, 255));
        for x in range(360, 620, 62): d.ellipse((x, 106, x+28, 134), fill=(232, 140, 89, 255))
    if "bed" in features:
        d.rounded_rectangle((248, 195, 582, 302), 35, fill=(91, 142, 150, 255), outline=(47, 83, 91, 255), width=8)
        d.rounded_rectangle((282, 170, 530, 239), 28, fill=(225, 193, 151, 255))
        d.ellipse((535, 107, 680, 294), fill=(164, 125, 80, 255));
        for y in range(126, 279, 34): d.line((548, y, 666, y), fill=(92, 69, 49, 180), width=5)
    if "yarn" in features:
        for x, c in ((310, (230, 84, 127, 255)), (415, (83, 190, 188, 255)), (520, (247, 170, 58, 255))):
            d.ellipse((x, 190, x+92, 282), fill=c, outline=(66, 45, 54, 180), width=5)
            d.arc((x+9, 199, x+82, 274), 15, 340, fill=(255, 255, 255, 90), width=4)
    if "salon" in features:
        d.rounded_rectangle((285, 172, 478, 301), 20, fill=(236, 214, 201, 255), outline=(103, 80, 78, 255), width=7)
        d.ellipse((508, 160, 659, 309), fill=(138, 205, 206, 255), outline=(73, 108, 112, 255), width=7)
        for x, y, r in ((550, 135, 18), (604, 116, 12), (642, 145, 15)): d.ellipse((x-r, y-r, x+r, y+r), fill=(210, 245, 244, 190))
    if "boxes" in features:
        for x, y, w, h in ((280, 198, 125, 97), (425, 170, 145, 125), (580, 215, 95, 80)):
            d.rounded_rectangle((x, y, x+w, y+h), 9, fill=(185, 124, 70, 255), outline=(92, 60, 43, 255), width=7)
            d.line((x+w//2, y, x+w//2, y+h), fill=(235, 188, 109, 200), width=5)
    if "security" in features:
        d.rounded_rectangle((260, 130, 510, 304), 18, fill=(60, 68, 79, 255), outline=(32, 37, 46, 255), width=8)
        for x, y in ((286, 158), (378, 158), (286, 218), (378, 218)):
            d.rectangle((x, y, x+74, y+44), fill=(42, 86, 104, 255), outline=(111, 175, 181, 255), width=4)
        d.ellipse((565, 188, 650, 273), fill=(213, 59, 50, 255), outline=(93, 37, 34, 255), width=7)
        soft_ellipse(im, (520, 140, 700, 320), (255, 74, 54), 25, 65)
    # soft fabric grain
    grain = Image.new("RGBA", im.size)
    gd = ImageDraw.Draw(grain)
    rnd = random.Random(name)
    for _ in range(3500):
        x, y = rnd.randrange(W), rnd.randrange(H)
        gd.point((x, y), fill=(255, 255, 255, rnd.randrange(2, 12)))
    im.alpha_composite(grain.filter(ImageFilter.GaussianBlur(.25)))
    im.resize((360, 174), Image.Resampling.LANCZOS).save(OUT / f"room-{name}.webp", "WEBP", quality=86, method=6)


def title_hero(cats):
    W, H = 780, 1689
    im = gradient((W, H), (12, 34, 65), (5, 11, 22)).convert("RGBA")
    d = ImageDraw.Draw(im)
    for _ in range(130):
        x, y = random.randrange(W), random.randrange(int(H*.72))
        r = random.choice((1, 1, 2, 3))
        d.ellipse((x-r, y-r, x+r, y+r), fill=(245, 232, 182, random.randint(90, 220)))
    soft_ellipse(im, (510, 55, 870, 415), (250, 229, 161), 55, 70)
    # distant town
    for x in range(-20, W+30, 75):
        h = random.randint(150, 330)
        d.rectangle((x, H-500-h, x+58, H-500), fill=(10, 24, 43, 255))
        for yy in range(H-480-h, H-520, 45):
            if random.random() < .6: d.rectangle((x+16, yy, x+27, yy+18), fill=(239, 180, 87, 150))
    # tower
    tx0, tx1 = 118, 662
    floor_h = 250
    for i in range(4):
        y1 = H-280-i*floor_h
        y0 = y1-floor_h+12
        d.rounded_rectangle((tx0, y0, tx1, y1), 28, fill=(43, 48, 54, 255), outline=(104, 81, 65, 255), width=10)
        d.rectangle((tx0+22, y0+24, tx1-22, y1-18), fill=(91+10*i, 69+7*i, 57+3*i, 255))
        soft_ellipse(im, (tx0+20, y0, tx1-20, y1+60), (255, 179, 76), 32, 54)
        for wx in (tx0+70, tx0+238, tx0+406):
            d.rounded_rectangle((wx, y0+55, wx+100, y0+138), 10, fill=(245, 191, 94, 255), outline=(70, 53, 48, 255), width=7)
    d.polygon([(tx0-35, H-280-4*floor_h+20), ((tx0+tx1)//2, H-280-4*floor_h-180), (tx1+35, H-280-4*floor_h+20)], fill=(112, 62, 54, 255), outline=(67, 42, 41, 255))
    # balconies and cats
    spots = [(300, 305, "mugi"), (170, 730, "toto"), (430, 720, "luna"), (305, 1120, "mimi")]
    for x, y, key in spots:
        cat = cats[key].resize((170, 170), Image.Resampling.LANCZOS)
        im.alpha_composite(cat, (x, y))
    # foreground glow/vignette
    vign = Image.new("RGBA", im.size)
    vd = ImageDraw.Draw(vign)
    vd.rectangle((0, int(H*.72), W, H), fill=(2, 7, 14, 105))
    im.alpha_composite(vign.filter(ImageFilter.GaussianBlur(35)))
    im.resize((520, 1126), Image.Resampling.LANCZOS).save(OUT / "title-hero.webp", "WEBP", quality=86, method=6)


def patch_sources():
    app_path = ROOT / "app.js"
    app = app_path.read_text()
    app = re.sub(r"const V='[^']+',KEY=", "const V='0.3.0',KEY=", app, count=1)
    art = "const CAT_ART=" + json.dumps({k: f"assets/illustrations/cat-{k}.webp" for k in ("mugi", "luna", "toto", "mimi")}, separators=(",", ":"))
    art += ",ENEMY_ART=" + json.dumps({"dust": "assets/illustrations/enemy-shadow.webp", "cleaner": "assets/illustrations/enemy-robot.webp", "boss": "assets/illustrations/enemy-burglar.webp"}, separators=(",", ":")) + ";\n"
    if "const CAT_ART=" not in app:
        app = app.replace("\nconst F={", "\n" + art + "const F={", 1)
    else:
        app = re.sub(r"const CAT_ART=.*?;\nconst F=\{", art + "const F={", app, count=1, flags=re.S)
    cat_fn = "function catSvg(id,large=false){const d=C[id],src=CAT_ART[id]||CAT_ART.mugi;return`<img class=\"catSprite${large?' large':''}\" src=\"${src}\" alt=\"${esc(d.name)}\" draggable=\"false\" decoding=\"async\">`}\nfunction catHtml"
    app, n = re.subn(r"function catSvg\(id,large=false\)\{.*?\}\nfunction catHtml", cat_fn, app, count=1, flags=re.S)
    if n != 1: raise RuntimeError("catSvg replacement failed")
    enemy_fn = "function enemyHtml(e){const src=ENEMY_ART[e.type]||ENEMY_ART.cleaner;return`<button class=\"enemy ${e.css} arrive\" data-a=\"enemy\" aria-label=\"侵入者 ${esc(e.name)}\"><span class=\"enemyTag\">INTRUDER</span><span class=\"enemyStatus\"></span><span class=\"hp\"><i style=\"width:100%\"></i></span><span class=\"enemyVisual\"><img src=\"${src}\" alt=\"\" draggable=\"false\" decoding=\"async\"></span><span class=\"enemyName\">${esc(e.name)}</span></button>`}\nfunction attachEnemy"
    app, n = re.subn(r"function enemyHtml\(e\)\{.*?\}\nfunction attachEnemy", enemy_fn, app, count=1, flags=re.S)
    if n != 1: raise RuntimeError("enemyHtml replacement failed")
    app_path.write_text(app)

    css_path = ROOT / "styles.css"
    css = css_path.read_text()
    marker_a = "/* RASTER_ART_V03_START */"
    marker_b = "/* RASTER_ART_V03_END */"
    block = r'''/* RASTER_ART_V03_START */
.splash{background:linear-gradient(180deg,rgba(4,9,18,.02),rgba(4,9,18,.14) 48%,#040912 100%),url("assets/illustrations/title-hero.webp") center top/cover no-repeat,#071426!important}
.splash>.rain,.splash>.skyline,.splashTower{display:none!important}.splash:after{background:linear-gradient(180deg,transparent 0 54%,rgba(3,8,17,.2) 68%,rgba(3,8,17,.97) 90%,#030811 100%)!important}.splashCopy{z-index:5}.splashCopy h1{filter:drop-shadow(0 12px 16px #000c)}
.floor{background-size:cover!important;background-position:center!important}.floor.lobby{background-image:linear-gradient(#ffffff12,#00000018),url("assets/illustrations/room-lobby.webp")!important}.floor.home{background-image:linear-gradient(#ffffff10,#00000012),url("assets/illustrations/room-home.webp")!important}.floor.food{background-image:linear-gradient(#ffffff10,#00000015),url("assets/illustrations/room-food.webp")!important}.floor.play{background-image:linear-gradient(#ffffff10,#00000015),url("assets/illustrations/room-play.webp")!important}.floor.care{background-image:linear-gradient(#ffffff10,#00000015),url("assets/illustrations/room-care.webp")!important}.floor.craft{background-image:linear-gradient(#ffffff10,#00000015),url("assets/illustrations/room-craft.webp")!important}.floor .wall,.floor .furn{display:none!important}.floor .base{background:linear-gradient(180deg,#2f211d55,#160f0ddd)!important}
.cat{width:108px!important;height:122px!important;margin:0 -14px!important;background:transparent!important;animation:none!important;filter:none!important}.cat svg{display:none!important}.catSprite{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 10px 8px #0009);pointer-events:none;transform-origin:50% 92%}.cat.work .catSprite{animation:plushWork 1.9s ease-in-out infinite}.cat.sleep .catSprite{animation:plushSleep 3.4s ease-in-out infinite}.cat:not(.work):not(.sleep) .catSprite{animation:plushIdle 2.8s ease-in-out infinite}@keyframes plushIdle{50%{transform:translateY(-4px) rotate(1.2deg)}}@keyframes plushWork{35%{transform:translateY(-6px) rotate(-2.4deg) scale(1.02)}70%{transform:translateY(-2px) rotate(2deg)}}@keyframes plushSleep{50%{transform:translateY(5px) rotate(-1.5deg) scaleY(.97)}}.catVisual .cat{width:100%!important;height:100%!important;margin:0!important}.splashCat{width:170px!important;height:195px!important}
.enemy{width:122px!important;height:130px!important;filter:drop-shadow(0 11px 8px #0009)!important}.enemyVisual{left:50%!important;bottom:0!important;width:108px!important;height:108px!important;transform:translateX(-50%)!important;filter:none!important}.enemyVisual img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 8px 7px #0008);pointer-events:none}.enemyBody,.enemyVisual>.antenna,.enemyVisual .eye,.enemyVisual .wheel{display:none!important}.enemy.boss .enemyVisual{width:118px!important;height:118px!important}
/* RASTER_ART_V03_END */'''
    if marker_a in css:
        css = re.sub(re.escape(marker_a) + r".*?" + re.escape(marker_b), block, css, flags=re.S)
    else:
        css += "\n\n" + block + "\n"
    css_path.write_text(css)

    index_path = ROOT / "index.html"
    index = index_path.read_text().replace("V0.2 · SMARTPHONE WEB PROTOTYPE", "V0.3 · RASTER ILLUSTRATION BUILD")
    index_path.write_text(index)
    sw_path = ROOT / "sw.js"
    sw = sw_path.read_text()
    sw = re.sub(r"cats-tower-v[0-9.]+", "cats-tower-v0.3.0", sw)
    sw_path.write_text(sw)


def main():
    cats = {
        "mugi": cat_sprite("mugi", (226, 157, 96), (163, 91, 61), (249, 213, 167), "tiger", "scarf", (39, 205, 202)),
        "luna": cat_sprite("luna", (75, 78, 92), (37, 39, 50), (236, 225, 209), "tuxedo", "bow", (157, 126, 225), "sleep"),
        "toto": cat_sprite("toto", (224, 218, 205), (128, 136, 146), (252, 246, 235), "gray", "apron", (238, 112, 77)),
        "mimi": cat_sprite("mimi", (239, 211, 175), (152, 98, 70), (255, 239, 214), "calico", "cap", (216, 233, 108)),
    }
    enemy_sprite("shadow", "blob")
    enemy_sprite("robot", "robot")
    enemy_sprite("burglar", "burglar")
    room("lobby", ((74, 73, 83), (37, 40, 49), (48, 35, 31, 255)), {"security"})
    room("home", ((232, 204, 174), (165, 126, 101), (93, 59, 43, 255)), {"bed"})
    room("food", ((229, 176, 124), (142, 87, 61), (89, 53, 39, 255)), {"counter"})
    room("play", ((148, 193, 194), (85, 115, 143), (68, 48, 57, 255)), {"yarn"})
    room("care", ((216, 189, 220), (137, 119, 168), (78, 57, 77, 255)), {"salon"})
    room("craft", ((205, 159, 105), (124, 87, 63), (70, 48, 38, 255)), {"boxes"})
    title_hero(cats)
    patch_sources()
    print(f"Generated {len(list(OUT.glob('*')))} raster illustration files")


if __name__ == "__main__":
    main()
