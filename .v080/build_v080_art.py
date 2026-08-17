from __future__ import annotations

import random
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "v080"
ICON_OUT = ROOT / "assets" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
ICON_OUT.mkdir(parents=True, exist_ok=True)
RESAMPLE = Image.Resampling.LANCZOS


def rgb(value):
    if isinstance(value, tuple):
        return value
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def rgba(value, alpha=255):
    if isinstance(value, tuple):
        return value if len(value) == 4 else (*value, alpha)
    return (*rgb(value), alpha)


def gradient(size, top, bottom):
    w, h = size
    a, b = rgb(top), rgb(bottom)
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))
        draw.line((0, y, w, y), fill=color)
    return image


def add_texture(image, seed, strength=0.13, fibres=350):
    rng = random.Random(seed)
    base = image.convert("RGBA")
    alpha = base.getchannel("A")
    noise = Image.effect_noise(base.size, 28).convert("L")
    paper = ImageOps.colorize(noise, (210, 205, 197), (255, 252, 243)).convert("RGBA")
    paper.putalpha(alpha.point(lambda p: int(p * 0.28)))
    textured = Image.alpha_composite(base, paper)
    textured = Image.blend(base, textured, strength)
    overlay = Image.new("RGBA", base.size)
    draw = ImageDraw.Draw(overlay)
    w, h = base.size
    for _ in range(fibres):
        x = rng.randrange(w)
        y = rng.randrange(h)
        if alpha.getpixel((x, y)) < 20:
            continue
        length = rng.randint(2, 8)
        color = (255, 250, 235, rng.randint(8, 22)) if rng.random() > 0.38 else (60, 40, 28, rng.randint(5, 14))
        draw.line((x, y, x + length, y + rng.choice((-1, 0, 1))), fill=color, width=1)
    return Image.alpha_composite(textured, overlay)


def vignette(image, amount=90):
    image = image.convert("RGBA")
    w, h = image.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((-w * 0.22, -h * 0.22, w * 1.22, h * 1.22), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.18))
    dark = Image.new("RGBA", image.size, (0, 0, 0, amount))
    dark.putalpha(ImageOps.invert(mask).point(lambda p: int(p * amount / 255)))
    return Image.alpha_composite(image, dark)


class Painter:
    def __init__(self, width, height, scale=2, mode="RGBA", background=(0, 0, 0, 0)):
        self.width = width
        self.height = height
        self.scale = scale
        self.image = Image.new(mode, (width * scale, height * scale), background)
        self.draw = ImageDraw.Draw(self.image, "RGBA")

    def b(self, box):
        return tuple(round(v * self.scale) for v in box)

    def p(self, points):
        return [(round(x * self.scale), round(y * self.scale)) for x, y in points]

    def ellipse(self, box, fill, outline=None, width=1):
        self.draw.ellipse(self.b(box), fill=fill, outline=outline, width=round(width * self.scale))

    def rounded(self, box, radius, fill, outline=None, width=1):
        self.draw.rounded_rectangle(self.b(box), radius=round(radius * self.scale), fill=fill, outline=outline, width=round(width * self.scale))

    def rectangle(self, box, fill, outline=None, width=1):
        self.draw.rectangle(self.b(box), fill=fill, outline=outline, width=round(width * self.scale))

    def polygon(self, points, fill, outline=None):
        points = self.p(points)
        self.draw.polygon(points, fill=fill)
        if outline:
            self.draw.line(points + [points[0]], fill=outline, width=max(1, self.scale))

    def line(self, points, fill, width=1, joint="curve"):
        self.draw.line(self.p(points), fill=fill, width=round(width * self.scale), joint=joint)

    def arc(self, box, start, end, fill, width=1):
        self.draw.arc(self.b(box), start=start, end=end, fill=fill, width=round(width * self.scale))

    def glow(self, box, color, blur=18, opacity=110):
        layer = Image.new("RGBA", self.image.size)
        draw = ImageDraw.Draw(layer)
        draw.ellipse(self.b(box), fill=rgba(color, opacity))
        layer = layer.filter(ImageFilter.GaussianBlur(blur * self.scale))
        self.image = Image.alpha_composite(self.image, layer)
        self.draw = ImageDraw.Draw(self.image, "RGBA")

    def composite(self, image, xy, size=None, alpha=255):
        source = image.convert("RGBA")
        if size:
            source = source.resize((size[0] * self.scale, size[1] * self.scale), RESAMPLE)
        elif self.scale != 1:
            source = source.resize((source.width * self.scale, source.height * self.scale), RESAMPLE)
        if alpha < 255:
            source.putalpha(source.getchannel("A").point(lambda p: int(p * alpha / 255)))
        self.image.alpha_composite(source, (round(xy[0] * self.scale), round(xy[1] * self.scale)))

    def finish(self, texture_seed=None, texture_strength=0.0):
        image = self.image.resize((self.width, self.height), RESAMPLE)
        if texture_seed is not None:
            image = add_texture(image, texture_seed, texture_strength)
        return image


def fabric_layer(layer, seed, density=420):
    rng = random.Random(seed)
    image = layer.convert("RGBA")
    alpha = image.getchannel("A")
    overlay = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(overlay)
    w, h = image.size
    for _ in range(density):
        x, y = rng.randrange(w), rng.randrange(h)
        if alpha.getpixel((x, y)) < 25:
            continue
        length = rng.randint(1, 5)
        color = (255, 244, 222, rng.randint(12, 38)) if rng.random() < 0.65 else (68, 39, 25, rng.randint(7, 25))
        draw.line((x, y, x + length, y + rng.choice((-1, 0, 1))), fill=color, width=1)
    return Image.alpha_composite(image, overlay)


def make_mugi(sleep=False):
    p = Painter(512, 512, scale=3)
    p.ellipse((98, 422, 418, 480), (24, 18, 17, 75))
    if sleep:
        p.arc((260, 215, 458, 430), 278, 90, (150, 82, 45, 255), 42)
        p.arc((270, 225, 447, 417), 280, 88, (203, 126, 70, 255), 20)
        p.ellipse((112, 224, 404, 438), (204, 130, 74, 255), (126, 69, 43, 110), 3)
        p.ellipse((154, 254, 370, 424), (239, 188, 129, 230))
        p.polygon(((145, 246), (173, 151), (230, 219)), (199, 118, 66, 255))
        p.polygon(((367, 246), (338, 151), (282, 219)), (199, 118, 66, 255))
        p.polygon(((160, 230), (176, 178), (214, 220)), (237, 166, 143, 255))
        p.polygon(((352, 230), (336, 178), (298, 220)), (237, 166, 143, 255))
        p.ellipse((135, 188, 377, 368), (222, 151, 89, 255), (121, 66, 39, 80), 3)
        p.ellipse((181, 278, 331, 362), (251, 221, 181, 255))
        p.arc((190, 236, 248, 282), 18, 160, (59, 49, 45, 255), 6)
        p.arc((264, 236, 322, 282), 18, 160, (59, 49, 45, 255), 6)
        p.polygon(((251, 298), (261, 298), (256, 307)), (91, 55, 48, 255))
        p.arc((235, 300, 257, 325), 290, 80, (79, 55, 49, 255), 3)
        p.arc((255, 300, 277, 325), 100, 250, (79, 55, 49, 255), 3)
        p.rounded((151, 337, 352, 382), 19, (45, 203, 194, 255), (18, 105, 103, 90), 2)
        p.ellipse((235, 346, 282, 390), (32, 172, 167, 255))
        p.polygon(((274, 368), (336, 415), (289, 420)), (43, 190, 183, 255))
        for x in (205, 239, 273):
            p.line(((x, 202), (x - 5, 238)), (124, 68, 43, 190), 8)
    else:
        p.arc((298, 210, 472, 425), 265, 80, (145, 76, 44, 255), 50)
        p.arc((306, 218, 458, 411), 270, 76, (214, 132, 70, 255), 22)
        p.ellipse((126, 234, 389, 448), (211, 137, 77, 255), (116, 66, 42, 100), 3)
        p.ellipse((184, 281, 331, 444), (241, 196, 138, 240))
        p.ellipse((139, 387, 230, 461), (232, 177, 113, 255), (114, 67, 44, 80), 2)
        p.ellipse((280, 387, 371, 461), (232, 177, 113, 255), (114, 67, 44, 80), 2)
        p.polygon(((133, 229), (166, 91), (235, 192)), (198, 116, 65, 255))
        p.polygon(((379, 229), (346, 91), (277, 192)), (198, 116, 65, 255))
        p.polygon(((153, 205), (170, 124), (219, 190)), (235, 154, 139, 255))
        p.polygon(((359, 205), (342, 124), (293, 190)), (235, 154, 139, 255))
        p.ellipse((117, 143, 395, 351), (224, 151, 86, 255), (111, 63, 41, 95), 3)
        p.ellipse((167, 248, 345, 354), (250, 221, 181, 255))
        p.ellipse((165, 204, 229, 278), (39, 53, 70, 255))
        p.ellipse((283, 204, 347, 278), (39, 53, 70, 255))
        p.ellipse((178, 213, 198, 234), (255, 252, 225, 245))
        p.ellipse((296, 213, 316, 234), (255, 252, 225, 245))
        p.ellipse((203, 246, 217, 262), (108, 144, 170, 130))
        p.ellipse((321, 246, 335, 262), (108, 144, 170, 130))
        p.polygon(((248, 286), (264, 286), (256, 297)), (94, 52, 45, 255))
        p.line(((256, 297), (256, 307)), (86, 55, 50, 255), 3)
        p.arc((231, 299, 256, 326), 285, 78, (80, 54, 48, 255), 3)
        p.arc((256, 299, 281, 326), 102, 255, (80, 54, 48, 255), 3)
        for dy in (0, 13, 26):
            p.line(((169, 294 + dy), (105, 286 + dy)), (86, 65, 55, 175), 3)
            p.line(((343, 294 + dy), (407, 286 + dy)), (86, 65, 55, 175), 3)
        for x in (208, 244, 280):
            p.line(((x, 153), (x - 3, 198)), (125, 68, 43, 200), 9)
        p.line(((135, 251), (181, 257)), (125, 68, 43, 180), 8)
        p.line(((133, 274), (177, 278)), (125, 68, 43, 180), 8)
        p.line(((377, 251), (331, 257)), (125, 68, 43, 180), 8)
        p.line(((379, 274), (335, 278)), (125, 68, 43, 180), 8)
        p.rounded((135, 329, 378, 381), 22, (46, 211, 201, 255), (15, 107, 104, 95), 3)
        p.ellipse((232, 345, 287, 397), (27, 176, 170, 255))
        p.polygon(((277, 371), (362, 438), (296, 438)), (45, 196, 189, 255))
        p.line(((301, 392), (343, 425)), (230, 255, 243, 90), 4)
    cat = fabric_layer(p.finish(), 802 if sleep else 801, 1200)
    alpha = cat.getchannel("A")
    halo = Image.new("RGBA", cat.size, (255, 238, 207, 0))
    halo.putalpha(alpha.filter(ImageFilter.GaussianBlur(2)).point(lambda a: min(35, a // 7)))
    return Image.alpha_composite(halo, cat)


def night_window(p, box, seed=1):
    x0, y0, x1, y1 = box
    p.rounded(box, 18, (37, 57, 77, 255), (82, 66, 55, 170), 7)
    p.rounded((x0 + 8, y0 + 8, x1 - 8, y1 - 8), 10, (21, 57, 89, 255))
    p.line(((x0 + (x1 - x0) / 2, y0 + 8), (x0 + (x1 - x0) / 2, y1 - 8)), (83, 68, 58, 190), 6)
    p.line(((x0 + 8, y0 + (y1 - y0) / 2), (x1 - 8, y0 + (y1 - y0) / 2)), (83, 68, 58, 190), 6)
    rng = random.Random(seed)
    for _ in range(24):
        x = rng.uniform(x0 + 15, x1 - 15)
        y = rng.uniform(y0 + 15, y1 - 15)
        r = rng.choice((1.2, 1.8, 2.4))
        p.ellipse((x - r, y - r, x + r, y + r), (255, 243, 188, rng.randint(120, 235)))


def pendant(p, x, y, color="#ffd37e"):
    p.line(((x, 0), (x, y - 24)), (68, 55, 47, 190), 5)
    p.glow((x - 72, y - 62, x + 72, y + 60), color, 24, 75)
    p.ellipse((x - 35, y - 31, x + 35, y + 31), rgba(color), (83, 60, 39, 180), 5)
    p.ellipse((x - 18, y - 15, x + 18, y + 15), (255, 246, 201, 240))


def wood_floor(p, y, base="#8a5b42"):
    p.rectangle((0, y, p.width, p.height), rgba(base))
    for x in range(-40, p.width + 80, 130):
        p.line(((x, y), (x + 80, p.height)), (70, 43, 33, 58), 3)
    for yy in range(y + 36, p.height, 54):
        p.line(((0, yy), (p.width, yy)), (67, 41, 31, 70), 3)
    p.rectangle((0, y, p.width, y + 17), (75, 46, 35, 210))


def room_base(top, bottom, seed):
    p = Painter(1024, 720, scale=2)
    p.image = gradient((2048, 1440), top, bottom).convert("RGBA")
    p.draw = ImageDraw.Draw(p.image, "RGBA")
    for x in range(0, 1024, 160):
        p.line(((x, 0), (x, 535)), (92, 62, 43, 32), 3)
    p.image = add_texture(p.image.resize((1024, 720), RESAMPLE), seed, 0.11, 520).resize((2048, 1440), RESAMPLE)
    p.draw = ImageDraw.Draw(p.image, "RGBA")
    return p


def make_food():
    p = room_base("#f4d6b5", "#c8895f", 110)
    night_window(p, (68, 70, 342, 292), 8)
    pendant(p, 488, 112)
    pendant(p, 774, 105)
    p.rounded((510, 105, 949, 244), 18, (112, 67, 48, 235), (72, 43, 34, 100), 4)
    p.rectangle((533, 134, 925, 150), (68, 41, 33, 180))
    for x, color in zip((563, 646, 729, 812, 895), ("#ef7953", "#ffd075", "#ef7953", "#ffd075", "#ef7953")):
        p.ellipse((x - 23, 163, x + 23, 207), rgba(color), (85, 52, 39, 80), 2)
    p.rounded((380, 280, 982, 625), 22, (162, 95, 62, 255), (83, 51, 39, 140), 5)
    p.rectangle((365, 278, 997, 318), (103, 61, 45, 255))
    p.rectangle((418, 352, 950, 593), (123, 71, 52, 255))
    for x in range(445, 920, 105):
        p.rounded((x, 387, x + 62, 447), 8, (241, 191, 112, 230), (80, 50, 38, 70), 2)
    for x in (455, 592, 729, 866):
        p.ellipse((x - 46, 252, x + 46, 282), (248, 232, 204, 245), (92, 64, 50, 80), 2)
        p.line(((x - 19, 266), (x + 17, 266)), (220, 105, 72, 230), 8)
        p.polygon(((x + 17, 266), (x + 29, 258), (x + 29, 274)), (220, 105, 72, 230))
        p.arc((x - 16, 208, x + 16, 263), 80, 260, (255, 249, 224, 110), 4)
    wood_floor(p, 603, "#7f513d")
    p.rounded((56, 590, 341, 685), 30, (72, 172, 164, 210), (47, 91, 90, 100), 3)
    p.composite(make_mugi(False), (137, 270), (292, 292))
    p.rounded((55, 352, 196, 522), 15, (184, 126, 74, 255), (85, 55, 38, 100), 4)
    p.line(((75, 390), (176, 390)), (112, 71, 45, 130), 4)
    p.line(((75, 430), (176, 430)), (112, 71, 45, 130), 4)
    p.polygon(((98, 346), (128, 310), (157, 346)), (44, 202, 193, 230))
    return vignette(p.finish(texture_seed=111, texture_strength=0.08), 45).convert("RGB")


def make_home():
    p = room_base("#f0dfcf", "#d4b79f", 210)
    night_window(p, (62, 75, 335, 305), 13)
    pendant(p, 485, 105, "#ffd894")
    p.rounded((718, 90, 956, 432), 45, (190, 148, 104, 210), (91, 61, 43, 90), 4)
    for y in (166, 248, 330):
        p.line(((747, y), (925, y)), (92, 61, 44, 130), 8)
    p.rounded((239, 345, 785, 622), 90, (83, 178, 173, 255), (50, 102, 102, 100), 4)
    p.rounded((283, 311, 752, 492), 65, (236, 213, 187, 255), (116, 82, 61, 70), 3)
    p.rounded((261, 455, 769, 638), 55, (69, 154, 155, 235), (42, 91, 93, 90), 3)
    p.rounded((284, 327, 472, 447), 40, (248, 228, 203, 255), (110, 79, 60, 65), 3)
    p.rounded((520, 337, 708, 451), 40, (238, 180, 173, 245), (110, 79, 60, 65), 3)
    p.polygon(((320, 465), (700, 450), (760, 611), (286, 611)), (230, 160, 152, 190))
    p.line(((340, 499), (684, 484)), (255, 231, 205, 90), 5)
    p.ellipse((815, 510, 900, 594), (166, 134, 219, 255), (79, 58, 109, 100), 3)
    for offset in (0, 13, 26):
        p.arc((826 + offset, 518, 885, 585 - offset), 10, 330, (232, 219, 255, 130), 3)
    p.ellipse((75, 548, 210, 610), (183, 216, 218, 255), (81, 99, 102, 100), 4)
    p.ellipse((91, 557, 194, 588), (112, 172, 179, 220))
    wood_floor(p, 603, "#86604a")
    p.composite(make_mugi(True), (340, 305), (340, 340))
    for x, color in ((405, "#f7c97a"), (545, "#a996eb"), (655, "#64cbbf")):
        p.rounded((x, 114, x + 92, 198), 9, (246, 233, 214, 230), (91, 62, 47, 100), 3)
        p.ellipse((x + 20, 132, x + 72, 184), rgba(color, 180))
    return vignette(p.finish(texture_seed=211, texture_strength=0.09), 38).convert("RGB")


def make_lobby():
    p = room_base("#d6c4a8", "#8d725d", 310)
    night_window(p, (58, 72, 306, 291), 21)
    pendant(p, 487, 102, "#ffd27d")
    pendant(p, 817, 113, "#ffb46f")
    p.rounded((385, 185, 640, 632), 24, (67, 83, 94, 255), (45, 52, 60, 190), 7)
    p.rectangle((430, 235, 593, 545), (83, 119, 133, 245), (43, 56, 63, 150), 5)
    p.line(((512, 235), (512, 545)), (45, 58, 64, 150), 5)
    p.ellipse((559, 396, 578, 415), (246, 196, 105, 255))
    p.rounded((63, 365, 348, 616), 25, (93, 161, 151, 245), (48, 88, 85, 130), 4)
    p.rectangle((45, 356, 365, 399), (57, 112, 106, 255))
    p.rounded((94, 438, 310, 562), 14, (75, 132, 126, 230))
    p.rounded((704, 154, 952, 422), 22, (117, 87, 67, 230), (72, 51, 41, 100), 4)
    for y in (185, 267, 349):
        for x in (732, 822):
            p.rounded((x, y, x + 75, y + 58), 7, (218, 170, 112, 235), (82, 55, 42, 90), 2)
    for box in ((726, 484, 864, 625), (840, 529, 966, 643)):
        p.rounded(box, 12, (191, 129, 73, 255), (89, 58, 39, 110), 4)
        x0, y0, x1, y1 = box
        p.line(((x0 + 15, (y0 + y1) / 2), (x1 - 15, (y0 + y1) / 2)), (113, 72, 45, 100), 3)
    p.rounded((84, 235, 256, 326), 18, (83, 57, 44, 220), (44, 30, 24, 120), 3)
    p.ellipse((125, 253, 174, 302), (246, 196, 78, 255))
    p.line(((149, 259), (149, 295)), (108, 74, 23, 170), 5)
    wood_floor(p, 602, "#725343")
    p.rounded((423, 112, 602, 174), 18, (243, 228, 196, 240), (92, 62, 43, 80), 3)
    p.ellipse((484, 125, 510, 151), (64, 199, 190, 255))
    p.ellipse((517, 125, 543, 151), (64, 199, 190, 255))
    p.ellipse((494, 144, 534, 167), (64, 199, 190, 255))
    return vignette(p.finish(texture_seed=311, texture_strength=0.09), 58).convert("RGB")


def make_roof():
    p = Painter(1024, 720, scale=2)
    p.image = gradient((2048, 1440), "#173b60", "#07111f").convert("RGBA")
    p.draw = ImageDraw.Draw(p.image, "RGBA")
    rng = random.Random(410)
    for _ in range(120):
        x, y = rng.randrange(1024), rng.randrange(470)
        r = rng.choice((1, 1, 2, 2, 3))
        p.ellipse((x - r, y - r, x + r, y + r), (255, 246, 197, rng.randint(100, 235)))
    p.glow((755, 35, 1010, 290), "#ffeaa5", 44, 70)
    p.ellipse((810, 78, 960, 228), (249, 232, 165, 255))
    for x in range(-20, 1040, 82):
        height = rng.randint(90, 230)
        p.rectangle((x, 720 - height, x + rng.randint(55, 86), 720), (5, 13, 25, 255))
        for yy in range(720 - height + 25, 690, 35):
            for xx in range(x + 12, x + 54, 22):
                if rng.random() < 0.55:
                    p.rectangle((xx, yy, xx + 7, yy + 9), (246, 205, 105, rng.randint(80, 170)))
    p.polygon(((0, 515), (1024, 465), (1024, 720), (0, 720)), (39, 55, 70, 255))
    p.line(((0, 520), (1024, 470)), (84, 110, 129, 180), 8)
    for x in range(60, 1000, 110):
        p.line(((x, 505), (x, 690)), (80, 105, 123, 160), 7)
    p.line(((35, 585), (1000, 545)), (80, 105, 123, 160), 7)
    p.rounded((96, 282, 372, 505), 48, (54, 103, 120, 255), (25, 55, 70, 160), 6)
    p.ellipse((96, 267, 372, 355), (93, 155, 160, 255), (28, 64, 72, 150), 5)
    p.line(((134, 357), (334, 357)), (166, 221, 211, 90), 5)
    p.line(((510, 470), (510, 162)), (106, 133, 159, 220), 9)
    p.line(((425, 245), (595, 245)), (106, 133, 159, 220), 7)
    p.line(((458, 195), (562, 295)), (106, 133, 159, 180), 5)
    for x in (650, 760):
        p.rounded((x, 462, x + 86, 548), 12, (155, 94, 61, 255), (74, 48, 35, 100), 3)
        for dx in (18, 42, 63):
            p.line(((x + dx, 470), (x + dx + rng.randint(-12, 12), 412)), (76, 140, 94, 230), 8)
            p.ellipse((x + dx - 14, 397, x + dx + 17, 430), (87, 165, 105, 220))
    p.rounded((620, 584, 900, 694), 30, (62, 177, 168, 160), (27, 91, 91, 90), 3)
    p.composite(make_mugi(False), (715, 410), (215, 215))
    return vignette(p.finish(texture_seed=411, texture_strength=0.06), 65).convert("RGB")


def draw_robot(image):
    p = Painter(image.width, image.height, scale=1)
    p.image = image.convert("RGBA")
    p.draw = ImageDraw.Draw(p.image, "RGBA")
    x, y = 770, 405
    p.glow((x - 110, y - 110, x + 110, y + 110), "#ff6b4c", 22, 95)
    p.rounded((x - 92, y - 76, x + 92, y + 86), 38, (83, 95, 110, 255), (26, 32, 42, 230), 8)
    p.rounded((x - 68, y - 48, x + 68, y + 30), 25, (45, 52, 64, 255))
    p.ellipse((x - 48, y - 26, x - 12, y + 10), (255, 111, 77, 255))
    p.ellipse((x + 12, y - 26, x + 48, y + 10), (255, 111, 77, 255))
    p.line(((x, y - 76), (x, y - 132)), (90, 104, 121, 255), 8)
    p.ellipse((x - 13, y - 150, x + 13, y - 124), (255, 111, 77, 255))
    p.ellipse((x - 75, y + 62, x - 21, y + 116), (34, 39, 48, 255))
    p.ellipse((x + 21, y + 62, x + 75, y + 116), (34, 39, 48, 255))
    p.line(((x - 112, y - 10), (x - 162, y + 38)), (78, 89, 104, 255), 18)
    p.line(((x + 112, y - 10), (x + 162, y + 38)), (78, 89, 104, 255), 18)
    return p.finish()


def make_night_food(food):
    image = Image.alpha_composite(food.convert("RGBA"), Image.new("RGBA", food.size, (12, 33, 66, 105)))
    red = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(red)
    draw.ellipse((650, 150, 1100, 620), fill=(255, 68, 46, 95))
    image = Image.alpha_composite(image, red.filter(ImageFilter.GaussianBlur(85)))
    return vignette(draw_robot(image), 95).convert("RGB")


def make_title(food, home, lobby, roof):
    p = Painter(768, 1365, scale=2)
    p.image = gradient((1536, 2730), "#173b62", "#030812").convert("RGBA")
    p.draw = ImageDraw.Draw(p.image, "RGBA")
    rng = random.Random(710)
    for _ in range(180):
        x, y = rng.randrange(768), rng.randrange(900)
        r = rng.choice((1, 1, 1, 2))
        p.ellipse((x - r, y - r, x + r, y + r), (255, 246, 198, rng.randint(80, 220)))
    p.glow((560, 95, 780, 315), "#ffe6a0", 42, 75)
    p.ellipse((605, 120, 735, 250), (248, 231, 166, 255))
    for x in range(-30, 800, 74):
        height = rng.randint(110, 330)
        p.rectangle((x, 1365 - height, x + rng.randint(52, 80), 1365), (3, 9, 18, 255))
        for yy in range(1365 - height + 22, 1335, 34):
            if rng.random() < 0.7:
                p.rectangle((x + 13, yy, x + 21, yy + 10), (245, 202, 103, rng.randint(50, 135)))
    p.rounded((104, 282, 664, 1238), 36, (24, 39, 58, 255), (72, 92, 112, 210), 10)
    for room, y0, y1 in ((roof, 320, 500), (food, 516, 706), (home, 722, 912), (lobby, 928, 1118)):
        crop = room.resize((500, 190), RESAMPLE).convert("RGBA")
        mask = Image.new("L", crop.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, 499, 189), radius=24, fill=255)
        crop.putalpha(mask)
        p.composite(crop, (134, y0), (500, 190))
        p.rounded((130, y0 - 4, 638, y1 + 4), 28, (0, 0, 0, 0), (9, 17, 28, 245), 9)
    p.polygon(((90, 300), (384, 122), (678, 300)), (119, 64, 49, 255), (57, 37, 34, 180))
    p.line(((111, 301), (657, 301)), (33, 46, 61, 220), 10)
    p.composite(make_mugi(False), (289, 131), (190, 190))
    rain = Image.new("RGBA", p.image.size)
    draw = ImageDraw.Draw(rain)
    for _ in range(90):
        x, y = rng.randrange(p.image.width), rng.randrange(p.image.height)
        draw.line((x, y, x + 10, y + 48), fill=(195, 223, 244, rng.randint(8, 24)), width=2)
    p.image = Image.alpha_composite(p.image, rain)
    return vignette(p.finish(texture_seed=711, texture_strength=0.045), 105).convert("RGB")


def make_icon(size):
    p = Painter(size, size, scale=3)
    p.rounded((10, 10, size - 10, size - 10), size * 0.26, (50, 210, 201, 255))
    p.ellipse((size * .20, size * .20, size * .37, size * .39), (255, 248, 218, 255))
    p.ellipse((size * .42, size * .13, size * .59, size * .34), (255, 248, 218, 255))
    p.ellipse((size * .64, size * .20, size * .81, size * .39), (255, 248, 218, 255))
    p.ellipse((size * .31, size * .42, size * .69, size * .78), (255, 248, 218, 255))
    return p.finish(texture_seed=900 + size, texture_strength=0.07).convert("RGB")


def save_webp(image, path, quality=91):
    image.save(path, "WEBP", quality=quality, method=6)


def main():
    mugi = make_mugi(False)
    mugi_sleep = make_mugi(True)
    food = make_food()
    home = make_home()
    lobby = make_lobby()
    roof = make_roof()
    night = make_night_food(food)
    title = make_title(food, home, lobby, roof)
    memory = vignette(Image.blend(home, Image.new("RGB", home.size, (250, 209, 165)), 0.10), 52)
    save_webp(mugi, OUT / "mugi-v080.webp", 94)
    save_webp(mugi_sleep, OUT / "mugi-sleep-v080.webp", 94)
    save_webp(food, OUT / "room-food-v080.webp")
    save_webp(home, OUT / "room-home-v080.webp")
    save_webp(lobby, OUT / "room-lobby-v080.webp")
    save_webp(roof, OUT / "room-roof-v080.webp")
    save_webp(night, OUT / "room-food-night-v080.webp")
    save_webp(title, OUT / "title-live-v080.webp")
    save_webp(memory, OUT / "memory-first-home-v080.webp")
    make_icon(192).save(ICON_OUT / "icon-192.png", "PNG", optimize=True)
    make_icon(512).save(ICON_OUT / "icon-512.png", "PNG", optimize=True)
    expected = {
        "mugi-v080.webp": (512, 512),
        "mugi-sleep-v080.webp": (512, 512),
        "room-food-v080.webp": (1024, 720),
        "room-home-v080.webp": (1024, 720),
        "room-lobby-v080.webp": (1024, 720),
        "room-roof-v080.webp": (1024, 720),
        "room-food-night-v080.webp": (1024, 720),
        "title-live-v080.webp": (768, 1365),
        "memory-first-home-v080.webp": (1024, 720),
    }
    for name, size in expected.items():
        path = OUT / name
        with Image.open(path) as check:
            check.load()
            assert check.format == "WEBP", (name, check.format)
            assert check.size == size, (name, check.size, size)
        assert path.stat().st_size > 5000, (name, path.stat().st_size)
        print(name, size, path.stat().st_size)


if __name__ == "__main__":
    main()
