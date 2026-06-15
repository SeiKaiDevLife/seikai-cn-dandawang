import os
import json
import uuid
import datetime
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADER_DIR = os.path.join(BASE_DIR, '_uploader')
INPUT_JSON_PATH = os.path.join(UPLOADER_DIR, 'input.json')
IMAGE_SRC_DIR = os.path.join(UPLOADER_DIR, 'image')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
META_JSON_PATH = os.path.join(PUBLIC_DIR, 'meta.json')
POSTS_DIR = os.path.join(PUBLIC_DIR, 'posts')
IMAGES_DST_DIR = os.path.join(PUBLIC_DIR, 'images')

MAX_SIZE = 2160

def resize_and_convert_to_webp(src_path, dst_path):
    with Image.open(src_path) as img:
        # Check orientation and apply EXIF rotation if needed
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
        
        width, height = img.size
        # 1. 超过长边 2160px，按比例缩小
        if max(width, height) > MAX_SIZE:
            if width > height:
                new_width = MAX_SIZE
                new_height = int(height * (MAX_SIZE / width))
            else:
                new_height = MAX_SIZE
                new_width = int(width * (MAX_SIZE / height))
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # 2. 转换为 webp 保存，质量 85 (兼顾清晰度和体积)
        img.save(dst_path, 'WEBP', quality=85)

def update_meta(month_id):
    meta = {"totalPosts": 0, "months": []}
    if os.path.exists(META_JSON_PATH):
        with open(META_JSON_PATH, 'r', encoding='utf-8') as f:
            meta = json.load(f)
            
    month_entry = next((m for m in meta['months'] if m['id'] == month_id), None)
    if month_entry:
        month_entry['postCount'] += 1
    else:
        meta['months'].append({
            "id": month_id,
            "postCount": 1,
            "jsonPath": f"posts/{month_id}.json"
        })
        # 按月份降序排序
        meta['months'] = sorted(meta['months'], key=lambda x: x['id'], reverse=True)
        
    meta['totalPosts'] += 1
    
    os.makedirs(os.path.dirname(META_JSON_PATH), exist_ok=True)
    with open(META_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

def update_post(month_id, post_data):
    month_file = os.path.join(POSTS_DIR, f"{month_id}.json")
    posts = []
    if os.path.exists(month_file):
        with open(month_file, 'r', encoding='utf-8') as f:
            posts = json.load(f)
            
    posts.append(post_data)
    # 按时间戳降序排序
    posts = sorted(posts, key=lambda x: x['timestamp'], reverse=True)
    
    os.makedirs(os.path.dirname(month_file), exist_ok=True)
    with open(month_file, 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

def main():
    if not os.path.exists(INPUT_JSON_PATH):
        print(f"❌ 错误: {INPUT_JSON_PATH} 不存在。")
        return
        
    with open(INPUT_JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    if not data:
        print("✅ input.json 中没有数据需要处理。")
        return
        
    os.makedirs(IMAGE_SRC_DIR, exist_ok=True)
    
    processed_count = 0
    for item in data:
        dt = datetime.datetime.fromisoformat(item['time'])
        month_id = dt.strftime("%Y-%m")
        timestamp_ms = int(dt.timestamp() * 1000)
        
        post_id = f"post_{timestamp_ms}_{uuid.uuid4().hex[:6]}"
        
        dst_img_dir = os.path.join(IMAGES_DST_DIR, month_id)
        os.makedirs(dst_img_dir, exist_ok=True)
        
        saved_images = []
        for img_name in item.get('images', []):
            src_img_path = os.path.join(IMAGE_SRC_DIR, img_name)
            if not os.path.exists(src_img_path):
                print(f"⚠️ 警告: 图片不存在 -> {src_img_path}，跳过该图片。")
                continue
                
            new_img_name = f"{uuid.uuid4().hex}.webp"
            dst_img_path = os.path.join(dst_img_dir, new_img_name)
            
            print(f"⏳ 正在处理图片: {img_name} -> {new_img_name}")
            resize_and_convert_to_webp(src_img_path, dst_img_path)
            saved_images.append(f"images/{month_id}/{new_img_name}")
            
            # 删除原图防止二次上传
            os.remove(src_img_path)
            
        post_data = {
            "id": post_id,
            "timestamp": timestamp_ms,
            "type": "normal",
            "title": item.get('title', ''),
            "content": item.get('content', ''),
            "images": saved_images,
            "layout_config": None
        }
        
        update_post(month_id, post_data)
        update_meta(month_id)
        print(f"✅ 成功生成图文: {item.get('title')} (归档至 {month_id})")
        processed_count += 1
        
    # 清空 input.json 防止重复处理
    with open(INPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump([], f, indent=2)
        
    print(f"🎉 任务完毕！共成功处理并生成 {processed_count} 条动态。")

if __name__ == "__main__":
    main()
