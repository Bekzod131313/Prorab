from PIL import Image

NAVY_BG = (11, 16, 32, 255)
mark_src = Image.open('/home/user/Prorab/branding/ic_foreground.png')

sizes = {
 'drawable-land-xxxhdpi': (1920,1280),
 'drawable-port-xhdpi': (720,1280),
 'drawable-port-xxxhdpi': (1280,1920),
 'drawable-port-xxhdpi': (960,1600),
 'drawable-land-hdpi': (800,480),
 'drawable-land-xhdpi': (1280,720),
 'drawable-land-mdpi': (480,320),
 'drawable-land-xxhdpi': (1600,960),
 'drawable-port-hdpi': (480,800),
 'drawable': (480,320),
 'drawable-port-mdpi': (320,480),
}

RES='/home/user/Prorab/android/app/src/main/res'
for folder, (w,h) in sizes.items():
    img = Image.new('RGBA', (w,h), NAVY_BG)
    mark_dim = int(min(w,h)*0.42)
    mark = mark_src.resize((mark_dim, mark_dim), Image.LANCZOS)
    img.paste(mark, ((w-mark_dim)//2, (h-mark_dim)//2), mark)
    img.convert('RGB').save(f'{RES}/{folder}/splash.png')

print("splash done")
