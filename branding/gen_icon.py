from PIL import Image, ImageDraw

SIZE = 1024
NAVY = (10, 15, 30, 255)        # #0A0F1E
NAVY_BG = (11, 16, 32, 255)      # #0B1020
BLUE = (59, 130, 246, 255)       # #3B82F6
BLUE2 = (37, 99, 235, 255)       # #2563EB
TEAL = (45, 212, 191, 255)       # #2DD4BF
TEAL2 = (20, 184, 166, 255)      # #14B8A6
WHITE = (240, 245, 250, 255)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(4))

def vgrad(size, top, bottom):
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        c = lerp(top, bottom, y/(size-1))
        for x in range(size):
            px[x, y] = c
    return img

def make_mark(canvas_size, transparent=True):
    img = Image.new('RGBA', (canvas_size, canvas_size), (0,0,0,0) if transparent else NAVY_BG)
    d = ImageDraw.Draw(img)
    s = canvas_size

    leg_w = int(s*0.135)
    top_y = int(s*0.255)
    bottom_y = int(s*0.745)
    apex_x = s//2
    apex_y = int(s*0.40)
    left_x = int(s*0.265)
    right_x = s - left_x

    # left leg (vertical bar) - blue
    blue_grad = vgrad(s, BLUE, BLUE2)
    leg_mask = Image.new('L', (s, s), 0)
    md = ImageDraw.Draw(leg_mask)
    md.rectangle([left_x, top_y, left_x+leg_w, bottom_y], fill=255)
    # flag notch cut at top pointing toward center
    md.polygon([(left_x, top_y), (left_x+leg_w, top_y), (apex_x, apex_y)], fill=255)
    img.paste(blue_grad, (0,0), leg_mask)

    # right leg - teal
    teal_grad = vgrad(s, TEAL, TEAL2)
    leg_mask2 = Image.new('L', (s, s), 0)
    md2 = ImageDraw.Draw(leg_mask2)
    md2.rectangle([right_x-leg_w, top_y, right_x, bottom_y], fill=255)
    md2.polygon([(right_x-leg_w, top_y), (right_x, top_y), (apex_x, apex_y)], fill=255)
    img.paste(teal_grad, (0,0), leg_mask2)

    # white ascending bars inside the "house"
    bar_w = int(s*0.085)
    gap = int(s*0.045)
    base_y = int(s*0.745)
    heights = [int(s*0.14), int(s*0.22), int(s*0.30)]
    start_x = apex_x - int(bar_w*1.5) - gap
    for i, h in enumerate(heights):
        x0 = start_x + i*(bar_w+gap)
        d.rounded_rectangle([x0, base_y-h, x0+bar_w, base_y], radius=int(bar_w*0.18), fill=WHITE)

    return img

# 1) Foreground (transparent, for adaptive icon) - mark within safe zone (~66%)
fg_size = 1024
mark = make_mark(int(fg_size*0.62), transparent=True)
foreground = Image.new('RGBA', (fg_size, fg_size), (0,0,0,0))
off = (fg_size - mark.width)//2
foreground.paste(mark, (off, off), mark)
foreground.save('/home/user/Prorab/branding/ic_foreground.png')

# 2) Background (solid navy, for adaptive icon)
bg = Image.new('RGBA', (fg_size, fg_size), NAVY_BG)
bg.save('/home/user/Prorab/branding/ic_background.png')

# 3) Flat full icon (navy rounded square + mark) for app store / favicon
def rounded_square(size, radius, color):
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=color)
    return img

flat = rounded_square(1024, int(1024*0.18), NAVY_BG)
mark_flat = make_mark(int(1024*0.66), transparent=True)
off2 = (1024 - mark_flat.width)//2
flat.paste(mark_flat, (off2, off2), mark_flat)
flat.save('/home/user/Prorab/branding/icon-1024.png')

# 4) Splash screen (navy bg + centered mark)
splash = Image.new('RGBA', (2048, 2048), NAVY_BG)
mark_splash = make_mark(int(2048*0.32), transparent=True)
offs = (2048 - mark_splash.width)//2
splash.paste(mark_splash, (offs, offs), mark_splash)
splash.save('/home/user/Prorab/branding/splash.png')

print("done")

# Legacy square icon (no rounded corners, full bleed) for ic_launcher / ic_launcher_round
legacy = Image.new('RGBA', (1024, 1024), NAVY_BG)
mark_legacy = make_mark(int(1024*0.66), transparent=True)
offl = (1024 - mark_legacy.width)//2
legacy.paste(mark_legacy, (offl, offl), mark_legacy)
legacy.save('/home/user/Prorab/branding/icon_legacy.png')

sizes = {'mdpi':48, 'hdpi':72, 'xhdpi':96, 'xxhdpi':144, 'xxxhdpi':192}
fg_sizes = {'mdpi':108, 'hdpi':162, 'xhdpi':216, 'xxhdpi':324, 'xxxhdpi':432}
RES = '/home/user/Prorab/android/app/src/main/res'

for dens, sz in sizes.items():
    img = legacy.resize((sz,sz), Image.LANCZOS)
    img.save(f'{RES}/mipmap-{dens}/ic_launcher.png')
    img.save(f'{RES}/mipmap-{dens}/ic_launcher_round.png')

fg_full = Image.open('/home/user/Prorab/branding/ic_foreground.png')
bg_full = Image.open('/home/user/Prorab/branding/ic_background.png')
for dens, sz in fg_sizes.items():
    fg_full.resize((sz,sz), Image.LANCZOS).save(f'{RES}/mipmap-{dens}/ic_launcher_foreground.png')

print("icons done")
