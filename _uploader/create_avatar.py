import os
from PIL import Image

# 找到项目中任意一张图片用来做头像测试
public_img_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'images')
avatar_out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'avatar.webp')

found_img = None
for root, dirs, files in os.walk(public_img_dir):
    for f in files:
        if f.endswith('.webp'):
            found_img = os.path.join(root, f)
            break
    if found_img:
        break

if found_img:
    print(f"找到图片: {found_img}，正在裁剪为 512x512 的头像...")
    with Image.open(found_img) as img:
        # 裁剪为正方形 1:1
        width, height = img.size
        min_dim = min(width, height)
        left = (width - min_dim) / 2
        top = (height - min_dim) / 2
        right = (width + min_dim) / 2
        bottom = (height + min_dim) / 2
        img = img.crop((left, top, right, bottom))
        
        # 缩放至 512x512
        img = img.resize((512, 512), Image.Resampling.LANCZOS)
        img.save(avatar_out_path, 'WEBP', quality=90)
    print("✅ 头像生成完毕！")
else:
    print("❌ 没有找到任何图片来生成头像，请先生成测试动态。")
