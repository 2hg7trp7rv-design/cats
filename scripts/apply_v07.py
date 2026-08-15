from pathlib import Path
import re
from PIL import Image

# 1) Normalize Mimi to the same 512x512 / 470px-tall / y=502 baseline contract.
src = Path('assets/illustrations/cat-mimi.webp')
dst = Path('assets/illustrations/cat-mimi.v070.webp')
im = Image.open(src).convert('RGBA')
bbox = im.getchannel('A').getbbox()
if not bbox:
    raise SystemExit('Mimi source has no visible pixels')
im = im.crop(bbox)
target_h = 470
target_w = round(im.width * target_h / im.height)
if target_w > 430:
    target_w = 430
    target_h = round(im.height * target_w / im.width)
im = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
x = (512 - target_w) // 2
y = 502 - target_h
canvas.alpha_composite(im, (x, y))
canvas.save(dst, 'WEBP', quality=86, method=6)
b = canvas.getchannel('A').getbbox()
w, h = b[2] - b[0], b[3] - b[1]
if h < 450 or w < 330 or b[3] != 502:
    raise SystemExit(f'Mimi normalization failed: bbox={b}')

# 2) Remove every historic visual patch block and append one authoritative visual layer.
p = Path('styles.css')
css = p.read_text()
for start, end in [
    ('RASTER_ART_V03_START', 'RASTER_ART_V03_END'),
    ('V04_MOBILE_VISUAL_FIX_START', 'V04_MOBILE_VISUAL_FIX_END'),
    ('V05_CHARACTER_ART_START', 'V05_CHARACTER_ART_END'),
    ('CHARACTER_VISUAL_V07_START', 'CHARACTER_VISUAL_V07_END'),
]:
    css = re.sub(
        rf'\n?/\*\s*{re.escape(start)}\s*\*/.*?/\*\s*{re.escape(end)}\s*\*/\s*',
        '\n', css, flags=re.S,
    )

canonical = r'''
/* CHARACTER_VISUAL_V07_START */
/* One authoritative illustration layer. No version-patch stacking. */
.splash{background:linear-gradient(180deg,rgba(4,9,18,.02),rgba(4,9,18,.14) 48%,#040912 100%),url("/assets/illustrations/title-hero.webp") center top/cover no-repeat,#071426}
.splash>.rain,.splash>.skyline,.splashTower{display:none}
.splash:after{background:linear-gradient(180deg,transparent 0 54%,rgba(3,8,17,.2) 68%,rgba(3,8,17,.97) 90%,#030811 100%)}
.splashCopy{z-index:5}.splashCopy h1{filter:drop-shadow(0 12px 16px #000c)}

.floor{flex-basis:168px;height:168px;margin:0 7px 8px;border-width:2px 2px 4px;border-radius:18px;background-position:center;background-size:cover;box-shadow:inset 0 1px #fff6,0 10px 20px #0004}
.floor+.floor{margin-top:0}.floor .wall,.floor .furn{display:none}.floor .base{height:18px;background:linear-gradient(180deg,#2f211d55,#160f0ddd)}.lane{bottom:18px;height:25px}
.floor.lobby{background-image:linear-gradient(180deg,#08111f05,#08111f24),url("/assets/illustrations/room-lobby.webp")}
.floor.home{background-image:linear-gradient(180deg,#fff2,#1b17221c),url("/assets/illustrations/room-home.webp")}
.floor.food{background-image:linear-gradient(180deg,#fff2,#2b160f16),url("/assets/illustrations/room-food.webp")}
.floor.play{background-image:linear-gradient(180deg,#fff2,#0e231719),url("/assets/illustrations/room-play.webp")}
.floor.care{background-image:linear-gradient(180deg,#fff2,#18122418),url("/assets/illustrations/room-care.webp")}
.floor.craft{background-image:linear-gradient(180deg,#fff2,#24170e18),url("/assets/illustrations/room-craft.webp")}
.floor.lobby,.floor.home,.floor.food,.floor.play,.floor.care,.floor.craft{background-blend-mode:soft-light,normal}

.cats{left:14%;right:20%;bottom:17px;height:108px;z-index:5}
.cat{width:96px;height:108px;margin:0 -10px;padding:0;overflow:visible;background:transparent;filter:none}
.cat svg{display:none}
.catSprite{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom;image-rendering:auto;visibility:visible;opacity:1;filter:drop-shadow(0 9px 8px #0007);pointer-events:none;transform-origin:50% 92%}
.cat.work .catSprite{animation:plushWork 1.9s ease-in-out infinite}.cat.sleep .catSprite{animation:plushSleep 3.4s ease-in-out infinite}.cat:not(.work):not(.sleep) .catSprite{animation:plushIdle 2.8s ease-in-out infinite}
@keyframes plushIdle{50%{transform:translateY(-3px) rotate(.7deg)}}@keyframes plushWork{35%{transform:translateY(-5px) rotate(-2deg) scale(1.015)}70%{transform:translateY(-1px) rotate(1.6deg)}}@keyframes plushSleep{50%{transform:translateY(3px) rotate(-1deg) scaleY(.985)}}
.cat .mood{top:1px}.cat .name{bottom:-1px;z-index:4;background:#fff7eedd;color:#1d2027;box-shadow:0 4px 10px #0003}
.catVisual{display:grid;place-items:end center}.catVisual .cat{width:100%;height:100%;margin:0;animation:none}.catVisual .catSprite{width:100%;height:100%;filter:drop-shadow(0 10px 9px #0007)}

.catCard{grid-template-columns:96px minmax(0,1fr) auto;min-height:122px;gap:10px;padding:9px 10px 9px 6px}
.catCard .catVisual{width:96px;height:108px}.catCard .cat{width:96px;height:108px}.catCard h3{font-size:15px}

.hero{grid-template-columns:170px minmax(0,1fr);min-height:202px;gap:12px;padding:14px;background:radial-gradient(circle at 20% 30%,#31d7d026,transparent 42%),#ffffff0a}
.hero .catVisual{width:166px;height:180px}.hero .cat{width:166px;height:180px}.hero .catSprite{width:166px;height:180px;filter:drop-shadow(0 13px 11px #0008)}
.hero h3{font-size:22px}.hero p{font-size:9px;line-height:1.55}.hero .moodBar{margin-top:12px}

.enemyVisual img{display:block;width:100%;height:100%;object-fit:contain;visibility:visible;opacity:1}.enemyBody,.enemyVisual>.antenna,.enemyVisual .eye,.enemyVisual .wheel{display:none}
.cat.artError:before{content:"🐾";display:grid;width:72%;height:72%;margin:auto;place-items:center;border:1px solid #ffffff18;border-radius:24px;background:#13253c;font-size:34px}
@media(max-width:370px){.hero{grid-template-columns:145px minmax(0,1fr)}.hero .catVisual,.hero .cat{width:142px;height:164px}.catCard{grid-template-columns:86px minmax(0,1fr) auto}.catCard .catVisual,.catCard .cat{width:86px;height:100px}}
/* CHARACTER_VISUAL_V07_END */
'''
p.write_text(css.rstrip() + '\n\n' + canonical.strip() + '\n')

# 3) Use same-origin immutable assets and add a safe image-error fallback.
p = Path('app.js')
s = p.read_text()
s = re.sub(r"const V='[^']+'", "const V='0.7.0'", s, count=1)
s = re.sub(
    r'const CAT_ART=\{.*?\},ENEMY_ART=',
    'const CAT_ART={"mugi":"/assets/illustrations/cat-mugi.v070.webp","luna":"/assets/illustrations/cat-luna.v070.webp","toto":"/assets/illustrations/cat-toto.v070.webp","mimi":"/assets/illustrations/cat-mimi.v070.webp"},ENEMY_ART=',
    s, count=1, flags=re.S,
)
marker = 'offline=offlineCalc();'
guard = "offline=offlineCalc();\ndocument.addEventListener('error',e=>{const img=e.target;if(img&&img.matches&&img.matches('.catSprite')){img.hidden=true;img.closest('.cat')?.classList.add('artError')}},true);"
if marker in s and guard not in s:
    s = s.replace(marker, guard, 1)
p.write_text(s)

# 4) Remove legacy extra CSS/JS injectors from HTML and delete their files.
p = Path('index.html')
h = p.read_text()
h = re.sub(r'\s*<link rel="stylesheet" href="/visual-fix-v04\.css[^"]*">', '', h)
h = re.sub(r'\s*<script src="https://raw\.githubusercontent\.com/2hg7trp7rv-design/cats/main/character-assets-v06\.js[^"]*" defer></script>', '', h)
h = h.replace('V0.6 · CHARACTER ASSET FIX', 'V0.7 · NORMALIZED CHARACTER BUILD')
p.write_text(h)
for legacy in ['visual-fix-v04.css', 'character-assets-v06.js']:
    Path(legacy).unlink(missing_ok=True)

# 5) Static Vercel config: direct same-origin asset delivery with immutable caching.
Path('vercel.json').write_text('''{\n  "cleanUrls": true,\n  "trailingSlash": false,\n  "headers": [\n    {\n      "source": "/assets/(.*)",\n      "headers": [\n        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }\n      ]\n    }\n  ]\n}\n''')

# Hard gates.
assert "const V='0.7.0'" in Path('app.js').read_text()
assert 'raw.githubusercontent.com/2hg7trp7rv-design/cats/main/assets/illustrations/cat-' not in Path('app.js').read_text()
final_css = Path('styles.css').read_text()
for old in ['RASTER_ART_V03_START','V04_MOBILE_VISUAL_FIX_START','V05_CHARACTER_ART_START']:
    assert old not in final_css
assert final_css.count('CHARACTER_VISUAL_V07_START') == 1
assert dst.exists() and dst.stat().st_size > 0
print('V0.7 migration prepared; Mimi bbox:', b)
