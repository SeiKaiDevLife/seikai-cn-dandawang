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
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
        
        width, height = img.size
        if max(width, height) > MAX_SIZE:
            if width > height:
                new_width = MAX_SIZE
                new_height = int(height * (MAX_SIZE / width))
            else:
                new_height = MAX_SIZE
                new_width = int(width * (MAX_SIZE / height))
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        img.save(dst_path, 'WEBP', quality=85)

def update_meta(month_id):
    meta = {"totalPosts": 0, "months": []}
    if os.path.exists(META_JSON_PATH):
        with open(META_JSON_PATH, 'r', encoding='utf-8') as f:
            try:
                meta = json.load(f)
            except Exception:
                pass
            
    month_entry = next((m for m in meta['months'] if m['id'] == month_id), None)
    if month_entry:
        month_entry['postCount'] += 1
    else:
        meta['months'].append({
            "id": month_id,
            "postCount": 1,
            "jsonPath": f"posts/{month_id}.json"
        })
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
            try:
                posts = json.load(f)
            except Exception:
                pass
            
    posts.append(post_data)
    posts = sorted(posts, key=lambda x: x['timestamp'], reverse=True)
    
    os.makedirs(os.path.dirname(month_file), exist_ok=True)
    with open(month_file, 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

def main():
    if not os.path.exists(INPUT_JSON_PATH):
        print(f"❌ 错误: {INPUT_JSON_PATH} 不存在。")
        return
        
    with open(INPUT_JSON_PATH, 'r', encoding='utf-8') as f:
        try:
            item = json.load(f)
        except Exception:
            item = {}
            
    if not item or not isinstance(item, dict) or not item.get("time"):
        print("✅ input.json 中没有有效数据需要处理（或缺少 time 字段）。")
        return
        
    os.makedirs(IMAGE_SRC_DIR, exist_ok=True)
    
    all_files = os.listdir(IMAGE_SRC_DIR)
    # 过滤掉隐藏文件，并进行排序以保证图片的顺序与系统内排序一致
    img_names = sorted([f for f in all_files if os.path.isfile(os.path.join(IMAGE_SRC_DIR, f)) and not f.startswith('.')])
    
    if not img_names:
        print("⚠️ 警告: image 文件夹下没有找到任何图片，本次图文将没有图片。")
    
    dt = datetime.datetime.fromisoformat(item['time'])
    month_id = dt.strftime("%Y-%m")
    date_str = dt.strftime("%Y-%m-%d")
    timestamp_ms = int(dt.timestamp() * 1000)
    
    # 清理标题中可能导致文件夹创建失败的非法字符
    safe_title = "".join(c for c in item.get('title', '未命名图文') if c not in r'\/:*?"<>|')
    
    # 使用 日期+标题 作为这篇图文的唯一文件夹名称，例如：2023-10-15_迎接氮氮的第一天
    post_folder_name = f"{date_str}_{safe_title}"
    post_id = f"post_{timestamp_ms}"
    
    # public/images/2023-10/2023-10-15_迎接氮氮的第一天/
    dst_img_dir = os.path.join(IMAGES_DST_DIR, month_id, post_folder_name)
    os.makedirs(dst_img_dir, exist_ok=True)
    
    saved_images = []
    for idx, img_name in enumerate(img_names, start=1):
        src_img_path = os.path.join(IMAGE_SRC_DIR, img_name)
            
        new_img_name = f"{idx}.webp"
        dst_img_path = os.path.join(dst_img_dir, new_img_name)
        
        print(f"⏳ 正在处理图片: {img_name} -> {new_img_name}")
        try:
            resize_and_convert_to_webp(src_img_path, dst_img_path)
            # 保存相对路径
            saved_images.append(f"images/{month_id}/{post_folder_name}/{new_img_name}")
        except Exception as e:
            print(f"❌ 处理图片 {img_name} 失败: {e}")
            continue
        
        # 删除原图
        os.remove(src_img_path)
        
    post_data = {
        "id": post_id,
        "hash": uuid.uuid4().hex[:8],
        "timestamp": timestamp_ms,
        "type": "normal",
        "title": item.get('title', ''),
        "content": item.get('content', ''),
        "images": saved_images,
        "layout_config": None
    }
    
    update_post(month_id, post_data)
    update_meta(month_id)
    print(f"✅ 成功生成图文: {item.get('title')} (归档至 {month_id}/{post_folder_name})，包含 {len(saved_images)} 张图片。")
        
    # 重置为带有当前时间的空模板，方便用户下次填写，而不是直接清空
    empty_template = {
        "title": "",
        "content": "",
        "time": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    }
    with open(INPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(empty_template, f, ensure_ascii=False, indent=2)
        
    print("🎉 任务完毕！")

if __name__ == "__main__":
    main()
