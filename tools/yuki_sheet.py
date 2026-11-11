"""Листы 2×2 с нарисованной серой «шахматкой» -> ленты по 4 кадра с прозрачным фоном.
python -I tools/yuki_sheet.py <папка с листами> <папка для результата>
Имена листов — в SHEETS ниже. Если у листа сплошной фон #FF00FF, вырезание проще: замените cut_checker на отбор по цвету.
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
FW, FH = 330, 484                       # кадр в приложении (пропорция 300:440)
CONTENT_H, BOTTOM = FH * 420 / 440, FH * 434 / 440
SHEETS = {'happy': '13.webp', 'sad': '14.webp', 'wow': '15.webp', 'sleep': '16.webp'}


def cut_checker(im):
    a = np.array(im.convert('RGB')).astype(int)
    chroma = a.max(2) - a.min(2)
    # фон — серые светлые пиксели (у Юки даже белое с лёгким оттенком); сжатие даёт клетке разброс в пару единиц
    cand = (chroma <= 5) & (a.min(2) >= 218)
    lab, n = ndimage.label(cand)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    sizes = ndimage.sum(cand, lab, range(1, n + 1))
    outer = np.isin(lab, list(border))
    # сетка клетки: размер и смещение, при которых яркость фона лучше всего совпадает с шахматным чередованием
    L = a.mean(2)
    Y, X = np.mgrid[0:L.shape[0], 0:L.shape[1]]
    samp = outer & (np.random.RandomState(1).rand(*L.shape) < .08)
    ys, xs, ls = Y[samp], X[samp], L[samp]
    best = (0, None)
    for s in range(8, 33):
        for ox in range(0, s, 2):
            for oy in range(0, s, 2):
                par = ((xs + ox) // s + (ys + oy) // s) % 2
                d = ls[par == 1].mean() - ls[par == 0].mean()
                if abs(d) > abs(best[0]): best = (d, (s, ox, oy))
    d0, (s, ox, oy) = best
    P = ((X + ox) // s + (Y + oy) // s) % 2
    # Где у волос контур тонкий, заливка от края могла протечь в белый блик. Блик без шахматки:
    # меряем, насколько яркость в окрестности чередуется в такт клетке, и возвращаем Юки то, где не чередуется.
    # протечка идёт через узкую щель в контуре: «сжимаем» фон на R пикселей — узкие перемычки рвутся,
    # оставляем только то, что связано с краем картинки, и возвращаем края обратно (только внутри прежнего фона)
    # просвет между прядями — фон, только если внутри та же шахматка (на худи её нет)
    holes = []
    for i, sz in enumerate(sizes):
        if sz < 300 or (i + 1) in border: continue
        m = lab == i + 1
        p1, p0 = m & (P == 1), m & (P == 0)
        if p1.sum() < .25 * sz or p0.sum() < .25 * sz: continue
        d = L[p1].mean() - L[p0].mean()
        if abs(d0) >= 1.5 and np.sign(d) == np.sign(d0) and abs(d) >= .5 * abs(d0):
            holes.append(i + 1)
    print('   checker step', s, 'contrast', round(d0, 1), 'holes accepted', len(holes))
    bg = outer | np.isin(lab, holes)
    # светлый ободок на стыке фона и контура: счищаем светлые почти серые пиксели, касающиеся фона (2 прохода)
    for _ in range(2):
        rim = ndimage.binary_dilation(bg) & ~bg & (a.min(2) >= 200) & (chroma <= 12)
        bg |= rim
    # мелкие оторванные кусочки (крапинки клетки) — тоже фон; «!» и сама Юки крупные
    fg_lab, fn_ = ndimage.label(~bg)
    fsz = ndimage.sum(~bg, fg_lab, range(1, fn_ + 1))
    bg |= np.isin(fg_lab, [i + 1 for i, s in enumerate(fsz) if s < 400])
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    soft = np.array(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(.8)))
    alpha = np.where(bg, np.minimum(soft, 140), 255).astype(np.uint8)   # мягкий край только снаружи
    alpha[bg & (soft < 60)] = 0
    rgba = np.dstack([a.astype(np.uint8), alpha])
    return Image.fromarray(rgba, 'RGBA'), len(holes)


def geom(a):
    ys, xs = np.where(a > 128)
    top, bot = ys.min(), ys.max()
    legs = a[int(bot - (bot - top) * .25):bot + 1] > 128
    return top, bot, np.where(legs)[1].mean()


for mood, fn in SHEETS.items():
    im, nh = cut_checker(Image.open(os.path.join(src, fn)))
    W, H = im.size
    cells = [im.crop((x, y, x + W // 2, y + H // 2)) for y in (0, H // 2) for x in (0, W // 2)]
    # Голова: где контур волос тонкий, фон мог протечь в белый блик через узкую щель.
    # Закрываем щели до 8 px и возвращаем то, что оказалось внутри силуэта головы.
    fixed = []
    for ci, c in enumerate(cells):
        ca = np.array(c)
        al = ca[..., 3] > 128
        ys = np.where(al.any(1))[0]
        top, bot = ys.min(), ys.max()
        head = np.zeros_like(al); head[:int(top + (bot - top) * .38)] = True
        filled = ndimage.binary_fill_holes(ndimage.binary_closing(al, iterations=4))
        gap = filled & ~al & head
        gl, gn = ndimage.label(gap)
        gsz = ndimage.sum(gap, gl, range(1, gn + 1))
        back = np.isin(gl, [i + 1 for i, v in enumerate(gsz) if v >= 120])
        if back.any():
            ca[..., 3] = np.where(back, 255, ca[..., 3])
            print('   ', mood, 'frame', ci, 'head gap restored', int(back.sum()), 'px')
        fixed.append(Image.fromarray(ca, 'RGBA'))
    cells = fixed
    # «!» и прочее: всё, что в своей клетке, принадлежит кадру
    gs = [geom(np.array(c)[..., 3]) for c in cells]
    k = CONTENT_H / np.median([b - t + 1 for t, b, _ in gs])
    strip = Image.new('RGBA', (FW * 4, FH), (0, 0, 0, 0))
    for i, (c, (t, b, cx)) in enumerate(zip(cells, gs)):
        ca = np.array(c)[..., 3]
        if ca[:, :2].max() > 40 or ca[:, -2:].max() > 40 or ca[:2].max() > 40 or ca[-2:].max() > 40:
            print('  ', mood, 'frame', i, 'touches its cell border')
        c2 = c.resize((round(c.width * k), round(c.height * k)), Image.LANCZOS)
        cell = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        cell.alpha_composite(c2, (round(FW / 2 - cx * k), round(BOTTOM - (b + 1) * k)))
        strip.alpha_composite(cell, (i * FW, 0))
    p = os.path.join(out, 'yuki-' + mood + '.webp')
    strip.save(p, 'WEBP', quality=84, method=6)
    print(mood, 'holes', nh, 'heights', [int(b - t) for t, b, _ in gs], os.path.getsize(p) // 1024, 'KB')

# проверка: на тёмном и на пурпурном фоне
rows = []
for bgc in [(30, 38, 52, 255), (255, 0, 255, 255)]:
    for mood in SHEETS:
        s = Image.open(os.path.join(out, 'yuki-' + mood + '.webp')).convert('RGBA')
        bg = Image.new('RGBA', s.size, bgc); bg.alpha_composite(s); rows.append(bg)
sheet = Image.new('RGBA', (FW * 4 * 2, FH * 4))
for i, r in enumerate(rows):
    sheet.paste(r, ((i // 4) * FW * 4, (i % 4) * FH))
sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS).save(os.path.join(out, 'check.png'))
