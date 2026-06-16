import os
from PIL import Image

# 基础目录定位
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.join(base_dir, '_uploader', 'image')
dest_dir = os.path.join(base_dir, 'public', 'avatars')

# 确保目标文件夹存在
os.makedirs(dest_dir, exist_ok=True)

avatars = ['seikai', 'echo']

for name in avatars:
    src_file = os.path.join(src_dir, f"{name}.jpg")
    dest_file = os.path.join(dest_dir, f"{name}.webp")
    
    if os.path.exists(src_file):
        print(f"正在处理头像: {src_file} -> {dest_file}")
        with Image.open(src_file) as img:
            # 裁剪为正方形 1:1 (居中裁剪)
            width, height = img.size
            min_dim = min(width, height)
            left = (width - min_dim) / 2
            top = (height - min_dim) / 2
            right = (width + min_dim) / 2
            bottom = (height + min_dim) / 2
            
            cropped_img = img.crop((left, top, right, bottom))
            
            # 缩放至 800x800 px
            resized_img = cropped_img.resize((800, 800), Image.Resampling.LANCZOS)
            
            # 保存为 WebP
            resized_img.save(dest_file, 'WEBP', quality=85)
            print(f"[SUCCESS] Avatar {name} processed successfully!")
    else:
        print(f"[ERROR] Source file not found: {src_file}")
