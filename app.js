const { createApp, ref, onMounted, onBeforeUnmount, computed } = Vue;

const CORRECT_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

// 密文常量：使用 window.encryptOSSCredentials 生成后粘贴到这里
const ENCRYPTED_CREDENTIALS = "U2FsdGVkX1/NVnBjA1cuZfTROn6WmcQtoUt2tvAMJyjDOS+Gb4pqk73+YeC6yZ74zFjsAC1VhMYgce4Wfgvb/YafPzEA/7ETzoiI5j4jtEJsL5XEQ/UWlMcjfbG0bqKd";

// 挂载辅助加密函数，方便生成密文（全局作用域）
window.encryptOSSCredentials = (ak, sk, pwd) => {
    const cleanAk = ak.trim();
    const cleanSk = sk.trim();
    console.log("正在为您处理密钥，已自动裁剪首尾空格...");
    console.log("AccessKeyId 长度:", cleanAk.length, "首尾预览:", cleanAk.substring(0, 4) + "..." + cleanAk.substring(cleanAk.length - 4));
    console.log("AccessKeySecret 长度:", cleanSk.length, "首尾预览:", cleanSk.substring(0, 4) + "..." + cleanSk.substring(cleanSk.length - 4));
    
    const payload = JSON.stringify({ id: cleanAk, secret: cleanSk });
    const encrypted = CryptoJS.AES.encrypt(payload, pwd).toString();
    console.log("======== 加密成功 ========");
    console.log("请复制下方密文并填入 app.js 中的 ENCRYPTED_CREDENTIALS 常量中：");
    console.log(encrypted);
    console.log("==========================");
    return encrypted;
};

const PLACEHOLDER_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23fff5e6'/></svg>";

const compressImageToWebp = (file) => {
    return new Promise((resolve, reject) => {
        console.log("开始压缩文件:", file.name, "大小:", (file.size / 1024 / 1024).toFixed(2) + "MB");
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                console.log("图片文件成功加载，原始尺寸:", img.width, "x", img.height);
                URL.revokeObjectURL(objectUrl);
                
                let width = img.width;
                let height = img.height;
                const maxLongEdge = 2160;
                if (width > maxLongEdge || height > maxLongEdge) {
                    if (width > height) {
                        height = Math.round((height * maxLongEdge) / width);
                        width = maxLongEdge;
                    } else {
                        width = Math.round((width * maxLongEdge) / height);
                        height = maxLongEdge;
                    }
                }
                
                console.log("计算出缩放尺寸:", width, "x", height);
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                console.log("正在将 canvas 导出为 WebP Base64...");
                const webpDataUrl = canvas.toDataURL('image/webp', 0.85);
                console.log("WebP 导出成功，数据大小:", (webpDataUrl.length / 1024 / 1024).toFixed(2) + "MB");
                resolve(webpDataUrl);
            } catch (err) {
                console.error("Canvas 渲染或导出发生异常:", err);
                reject(err);
            }
        };
        img.onerror = (err) => {
            console.error("图片文件加载错误(img.onerror):", err);
            URL.revokeObjectURL(objectUrl);
            reject(err);
        };
        img.src = objectUrl;
    });
};

createApp({
    setup() {
        const isLoggedIn = ref(localStorage.getItem('isLoggedIn') === 'true');
        const username = ref(localStorage.getItem('username') || '');
        const password = ref('');
        const loginError = ref(false);
        const scrollPosition = ref(0);
        
        const showSecPwdModal = ref(false);
        const secPassword = ref('');
        const isSyncingToOSS = ref(false);
        const ossClient = ref(null);
        
        const meta = ref({ totalPosts: 0, months: [] });
        const posts = ref([]);
        const currentMonthId = ref('');
        
        const ASSET_BASE = 'https://www-seikai.oss-cn-hangzhou.aliyuncs.com/dandawang/public/';

        const checkLogin = () => {
            if (isLoggedIn.value) {
                loadData();
            }
        };

        const handleLogin = () => {
            const hash = CryptoJS.SHA256(password.value).toString();
            // 123456 的 sha256 值为 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
            
            const cleanUser = username.value.trim().toLowerCase();
            const isValidUser = cleanUser === 'seikai' || cleanUser === 'echo';
            
            if (isValidUser && hash === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92') {
                isLoggedIn.value = true;
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('username', cleanUser);
                password.value = '';
                loadData();
            } else {
                loginError.value = true;
                setTimeout(() => {
                    loginError.value = false;
                }, 500);
            }
        };

        const logout = () => {
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('username');
            isLoggedIn.value = false;
            posts.value = [];
        };

        const loadMonth = async (m) => {
            currentMonthId.value = m.id;
            try {
                const postRes = await fetch(ASSET_BASE + m.jsonPath + '?t=' + Date.now());
                if (postRes.ok) {
                    const rawPosts = await postRes.json();
                    posts.value = rawPosts.map(post => ({
                        ...post,
                        publisher: post.publisher || 'seikai',
                        comments: post.comments || []
                    }));
                }
            } catch (e) {
                console.error("加载月份失败", e);
            }
        };

        const loadAllMonths = async () => {
            currentMonthId.value = 'all';
            let allPosts = [];
            try {
                const reqs = meta.value.months.map(m => fetch(ASSET_BASE + m.jsonPath + '?t=' + Date.now()).then(r => r.json()));
                const results = await Promise.all(reqs);
                results.forEach(res => {
                    allPosts = allPosts.concat(res);
                });
                posts.value = allPosts.map(post => ({
                    ...post,
                    publisher: post.publisher || 'seikai',
                    comments: post.comments || []
                })).sort((a, b) => b.timestamp - a.timestamp);
                
                if (isSearchActive.value) {
                    applySearch();
                } else {
                    filteredPosts.value = getBasePosts();
                    distributePosts();
                }
            } catch (e) {
                console.error("加载全部失败", e);
            }
        };

        const loadData = async () => {
            try {
                const metaRes = await fetch(ASSET_BASE + 'meta.json?t=' + Date.now());
                if (metaRes.ok) {
                    meta.value = await metaRes.json();
                    if (meta.value.months.length > 0) {
                        await loadAllMonths();
                    }
                }
                await loadFavorites();
            } catch (e) {
                console.error("加载失败", e);
            }
        };

        // 瀑布流列数据数组
        const columns = ref([]);
        const selectedPost = ref(null);
        const showHomeDropdown = ref(false);

        // 搜索功能替换为内嵌式
        const searchInput = ref('');
        const startDateInput = ref('');
        const endDateInput = ref('');
        const isSearchActive = ref(false);
        const searchStatusText = ref('');
        const filteredPosts = ref([]);
        const showDateFilter = ref(false);
        const currentTab = ref('posts');

        const getBasePosts = () => {
            if (currentTab.value === 'favorites') {
                const user = username.value || 'seikai';
                const userFavs = favorites.value[user] || [];
                return posts.value.filter(p => userFavs.includes(p.id));
            }
            return posts.value;
        };

        const setTab = (tab) => {
            currentTab.value = tab;
            clearSearch();
        };

        const totalPhotosCount = computed(() => {
            return posts.value.reduce((sum, p) => sum + (p.images ? p.images.length : 0), 0);
        });

        const favoritedPostsCount = computed(() => {
            const user = username.value || 'seikai';
            const userFavs = favorites.value[user] || [];
            return userFavs.length;
        });

        const allPhotos = computed(() => {
            const list = [];
            posts.value.forEach(post => {
                if (post.images && post.images.length > 0) {
                    post.images.forEach((img, idx) => {
                        list.push({
                            url: typeof img === 'string' ? img : img.url,
                            index: idx,
                            post: post
                        });
                    });
                }
            });
            return list;
        });

        // 当前用户的统计数据：图文数、图片数、评论数
        const userStats = computed(() => {
            const user = (username.value || 'seikai').toLowerCase();
            let postCount = 0;
            let imageCount = 0;
            let commentCount = 0;
            posts.value.forEach(p => {
                if ((p.publisher || 'seikai').toLowerCase() === user) {
                    postCount++;
                    imageCount += p.images ? p.images.length : 0;
                }
                // 统计该用户发表的评论
                if (p.comments) {
                    p.comments.forEach(c => {
                        if ((c.commenter || '').toLowerCase() === user) {
                            commentCount++;
                        }
                    });
                }
            });
            return { postCount, imageCount, commentCount };
        });

        const selectedPhoto = ref(null);
        const openPhotoLightbox = (photo) => {
            console.log("Opening photo lightbox for:", photo);
            selectedPhoto.value = photo;
        };
        const closePhotoLightbox = () => {
            console.log("Closing photo lightbox");
            selectedPhoto.value = null;
        };

        const selectedCommentImage = ref(null);
        const openCommentImageLightbox = (imgUrl, hash) => {
            console.log("Opening comment image lightbox for:", imgUrl, hash);
            selectedCommentImage.value = { url: imgUrl, hash: hash };
        };
        const closeCommentImageLightbox = () => {
            console.log("Closing comment image lightbox");
            selectedCommentImage.value = null;
        };

        const viewFullPostFromPhoto = (photo) => {
            console.log("Viewing full post from photo:", photo);
            selectedPhoto.value = null;
            openPost(photo.post, photo.index);
        };

        const applySearch = () => {
            isSearchActive.value = true;
            showDateFilter.value = false;
            let res = getBasePosts();
            
            const q = searchInput.value.trim().toLowerCase();
            const start = startDateInput.value ? new Date(startDateInput.value).getTime() : 0;
            const end = endDateInput.value ? new Date(endDateInput.value + 'T23:59:59.999').getTime() : Infinity;

            res = res.filter(p => {
                let matchKeyword = true;
                if (q) {
                    if (q.includes('+')) {
                        // AND search: all keywords must appear
                        const keywords = q.split('+').map(k => k.trim()).filter(k => k);
                        matchKeyword = keywords.every(k => {
                            return (p.title && p.title.toLowerCase().includes(k)) || (p.content && p.content.toLowerCase().includes(k));
                        });
                    } else {
                        // OR search: at least one keyword must appear (single keyword falls here as well)
                        const keywords = q.split(/\s+/).map(k => k.trim()).filter(k => k);
                        matchKeyword = keywords.some(k => {
                            return (p.title && p.title.toLowerCase().includes(k)) || (p.content && p.content.toLowerCase().includes(k));
                        });
                    }
                }
                const matchTime = p.timestamp >= start && p.timestamp <= end;
                return matchKeyword && matchTime;
            });
            
            filteredPosts.value = res;
            
            let status = [];
            if (q) {
                if (q.includes('+')) {
                    const keywords = q.split('+').map(k => k.trim()).filter(k => k);
                    status.push('包含所有: "' + keywords.join(' + ') + '"');
                } else {
                    const keywords = q.split(/\s+/).map(k => k.trim()).filter(k => k);
                    status.push('包含任意: "' + keywords.join(' 或 ') + '"');
                }
            }
            if (startDateInput.value || endDateInput.value) {
                status.push('日期 ' + (startDateInput.value || '最早') + ' 至 ' + (endDateInput.value || '最新'));
            }
            searchStatusText.value = status.join('，') || '所有图文';
            
            distributePosts();
        };

        const clearSearch = () => {
            searchInput.value = '';
            startDateInput.value = '';
            endDateInput.value = '';
            isSearchActive.value = false;
            filteredPosts.value = getBasePosts();
            distributePosts();
        };

        // 获取图片地址并处理 Data URL (支持动态 OSS 图片尺寸裁剪与 CDN 缓存命中优化)
        const RESIZE_BUCKETS = [100, 300, 500, 800, 1000, 1200, 1500];
        const getImageUrlWithHash = (img, hash, sizeCategory = null, colSpan = 1) => {
            const url = typeof img === 'string' ? img : img.url;
            if (url.startsWith('data:')) return url;
            
            let finalUrl = ASSET_BASE + url + '?v=' + hash;
            
            if (sizeCategory) {
                let displayWidthCss = 300; // 默认回退值
                
                const winWidth = window.innerWidth;
                const containerWidth = Math.min(winWidth, 1200) - 32;
                const colWidthCss = (containerWidth - 16) / 2; // 双列瀑布流单列宽度
                
                if (sizeCategory === 'normal-cover') {
                    displayWidthCss = colWidthCss;
                } else if (sizeCategory === 'grid-cover') {
                    displayWidthCss = colWidthCss / 3;
                } else if (sizeCategory === 'custom-cover') {
                    displayWidthCss = (colWidthCss / 3) * colSpan;
                } else if (sizeCategory === 'detail') {
                    displayWidthCss = Math.min(winWidth, 600);
                } else if (sizeCategory === 'hero') {
                    displayWidthCss = winWidth;
                }
                
                // 结合设备像素比计算物理像素，上限设为 2.0 (兼顾高清度与流量)
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const targetPhysicalWidth = Math.round(displayWidthCss * dpr);
                
                // 尺寸阶梯（Bucketing）取整匹配
                let matchedWidth = null;
                for (const bucket of RESIZE_BUCKETS) {
                    if (targetPhysicalWidth <= bucket) {
                        matchedWidth = bucket;
                        break;
                    }
                }
                
                // 若超出最大 bucket 范围，使用最大 bucket 限制以符合 OSS 统一 Resize 规则
                if (!matchedWidth) {
                    matchedWidth = RESIZE_BUCKETS[RESIZE_BUCKETS.length - 1];
                }
                
                if (matchedWidth) {
                    finalUrl += `&x-oss-process=image/resize,w_${matchedWidth}`;
                }
            }
            
            return finalUrl;
        };

        const getVideoSnapshotUrl = (videoPath, hash, sizeCategory = null) => {
            if (!videoPath) return '';
            
            let finalUrl = ASSET_BASE + videoPath + '?v=' + hash;
            
            if (sizeCategory) {
                let displayWidthCss = 300; // 默认回退值
                
                const winWidth = window.innerWidth;
                const containerWidth = Math.min(winWidth, 1200) - 32;
                const colWidthCss = (containerWidth - 16) / 2; // 双列瀑布流单列宽度
                
                if (sizeCategory === 'normal-cover') {
                    displayWidthCss = colWidthCss;
                } else if (sizeCategory === 'detail') {
                    displayWidthCss = Math.min(winWidth, 600);
                }
                
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const targetPhysicalWidth = Math.round(displayWidthCss * dpr);
                
                let matchedWidth = null;
                for (const bucket of RESIZE_BUCKETS) {
                    if (targetPhysicalWidth <= bucket) {
                        matchedWidth = bucket;
                        break;
                    }
                }
                
                if (!matchedWidth) {
                    matchedWidth = RESIZE_BUCKETS[RESIZE_BUCKETS.length - 1];
                }
                
                if (matchedWidth) {
                    finalUrl += `&x-oss-process=video/snapshot,t_1000,f_jpg,w_${matchedWidth}`;
                }
            } else {
                finalUrl += `&x-oss-process=video/snapshot,t_1000,f_jpg`;
            }
            
            return finalUrl;
        };

        let currentRenderId = 0;
        let lastColCount = 0;
        const distributePosts = async () => {
            const renderId = ++currentRenderId;
            
            // 计算当前视口适合的列数，限制最大容器宽度，保证单列宽度最高为 400px
            // 6列 * 400px + 5个16px gap + 32px padding = 2512px
            const winWidth = window.innerWidth;
            const containerWidth = Math.min(winWidth, 2512);
            // 手机/移动端（视口宽度 < 768px）强制至少两列，保证小红书式的双列瀑布流排版；桌面端根据宽度在 2-6 列之间自适应
            const numColsByWidth = winWidth < 768 ? 2 : Math.max(2, Math.min(6, Math.ceil((containerWidth - 32) / 416)));
            // 内容不足时，只生成实际内容对应的列数，避免产生空列
            const numCols = Math.min(numColsByWidth, Math.max(1, filteredPosts.value.length));
            lastColCount = numCols;

            let tempCols = Array.from({ length: numCols }, () => []);
            let colHeights = Array(numCols).fill(0);

            for (const post of filteredPosts.value) {
                if (!post.hash) post.hash = post.timestamp;
                
                let ratio = 1; // 默认 1:1
                if (post.images && post.images.length > 0) {
                    try {
                        // 在 distributePosts 中仅仅需要加载图片提取宽高比例，使用最小的 grid-cover 即可，节省网络流量
                        const imgUrl = getImageUrlWithHash(post.images[0], post.hash, 'grid-cover');
                        ratio = await new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => resolve(img.height / img.width);
                            img.onerror = () => resolve(1);
                            img.src = imgUrl;
                        });
                    } catch (e) {
                        ratio = 1;
                    }
                } else if (post.layout === 'video' && post.video) {
                    try {
                        const imgUrl = getVideoSnapshotUrl(post.video, post.hash, 'grid-cover');
                        ratio = await new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => resolve(img.height / img.width);
                            img.onerror = () => resolve(1);
                            img.src = imgUrl;
                        });
                    } catch (e) {
                        ratio = 1;
                    }
                }
                
                if (renderId !== currentRenderId) return; // 拦截过期渲染（解决8个图文的竞态Bug）

                // 假设卡片高度：图片按比例占用高度 + 底部信息固定高度(100)
                const estimatedHeight = ratio * 300 + 100;

                // 寻找最矮的列放入
                let minColIdx = 0;
                let minColHeight = colHeights[0];
                for (let i = 1; i < numCols; i++) {
                    if (colHeights[i] < minColHeight) {
                        minColHeight = colHeights[i];
                        minColIdx = i;
                    }
                }
                
                tempCols[minColIdx].push(post);
                colHeights[minColIdx] += estimatedHeight;
            }
            
            if (renderId === currentRenderId) {
                // 过滤掉空列（防御性处理）
                columns.value = tempCols.filter(col => col.length > 0);
            }
        };

        const currentSlideIndex = ref(0);
        const sliderRef = ref(null);

        const onSliderScroll = (e) => {
            const scrollLeft = e.target.scrollLeft;
            const width = e.target.clientWidth;
            currentSlideIndex.value = Math.round(scrollLeft / width);
        };

        const scrollToSlide = (index) => {
            if (sliderRef.value) {
                const width = sliderRef.value.clientWidth;
                sliderRef.value.scrollTo({ left: width * index, behavior: 'smooth' });
            }
        };

        const prevSlide = () => {
            if (currentSlideIndex.value > 0) {
                currentSlideIndex.value--;
                scrollToSlide(currentSlideIndex.value);
            }
        };

        const nextSlide = () => {
            if (selectedPost.value && selectedPost.value.images && currentSlideIndex.value < selectedPost.value.images.length - 1) {
                currentSlideIndex.value++;
                scrollToSlide(currentSlideIndex.value);
            }
        };

        const openPost = (post, index = 0) => {
            selectedPost.value = post;
            currentSlideIndex.value = index;
            
            // 等待 DOM 渲染完成后，立即滚动到对应的图片位置
            Vue.nextTick(() => {
                if (sliderRef.value) {
                    const sliderWidth = sliderRef.value.clientWidth;
                    sliderRef.value.scrollTo({
                        left: index * sliderWidth,
                        behavior: 'auto' // instant jump
                    });
                }
            });
        };

        const closePost = () => {
            if (detailVideoPlayerRef.value) {
                try {
                    detailVideoPlayerRef.value.pause();
                } catch(e) {
                    console.warn("暂停视频播放失败", e);
                }
            }
            selectedPost.value = null;
        };

        const formatDate = (ts) => {
            const d = new Date(ts);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        // 发布功能逻辑 (临时)
        const isFabOpen = ref(false);
        const isPublishOpen = ref(false);
        const publishMode = ref('normal'); // 'normal' | 'nine-grid' | 'custom'
        const publishTitle = ref('');
        const publishContent = ref('');
        const publishImages = ref([]);
        const fileInputRef = ref(null);

        // 视频发布相关状态
        const publishVideoFile = ref(null);
        const publishVideoUrl = ref('');
        const publishVideoLoading = ref(false);
        const uploadProgress = ref(0);
        const videoFileInputRef = ref(null);
        const detailVideoPlayerRef = ref(null);

        // 自定义网格状态
        const customGridRows = ref(3);
        const customGridSlots = ref([]);
        const customGridState = ref('edit-layout'); // 'edit-layout' | 'fill-images'
        const currentUploadSlotId = ref(null);

        const initCustomGrid = () => {
            let slots = [];
            for (let r = 0; r < customGridRows.value; r++) {
                for (let c = 0; c < 3; c++) {
                    slots.push({ id: `r${r}c${c}`, r, c, rowSpan: 1, colSpan: 1, image: null, selected: false, loading: false });
                }
            }
            customGridSlots.value = slots;
            customGridState.value = 'edit-layout';
        };

        const isDragging = ref(false);
        const dragStartSlot = ref(null);
        const dragCurrentSlot = ref(null);
        
        const dragImgId = ref(null);
        const dragImgCurrentId = ref(null);

        const onDragStart = (slot) => {
            if (customGridState.value !== 'edit-layout') {
                if (slot.image) {
                    dragImgId.value = slot.id;
                    dragImgCurrentId.value = slot.id;
                }
                return;
            }
            if (slot.rowSpan > 1 || slot.colSpan > 1) {
                unmergeSlot(slot);
                return;
            }
            isDragging.value = true;
            dragStartSlot.value = slot;
            dragCurrentSlot.value = slot;
        };

        const onSlotClick = (slot) => {
            if (customGridState.value !== 'edit-layout') {
                if (dragImgId.value && dragImgId.value !== dragImgCurrentId.value) return; // Ignore click if swapped
                currentUploadSlotId.value = slot.id;
                if (fileInputRef.value) fileInputRef.value.click();
            }
        };

        const onMouseEnter = (slot) => {
            if (customGridState.value !== 'edit-layout') {
                if (dragImgId.value) dragImgCurrentId.value = slot.id;
                return;
            }
            if (!isDragging.value) return;
            dragCurrentSlot.value = slot;
        };

        const onTouchMove = (e) => {
            if (customGridState.value !== 'edit-layout') {
                if (!dragImgId.value) return;
                const touch = e.touches[0];
                const elem = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elem) {
                    const slotElem = elem.closest('.custom-slot');
                    if (slotElem) {
                        const targetId = slotElem.getAttribute('data-id');
                        if (targetId) dragImgCurrentId.value = targetId;
                    }
                }
                return;
            }
            if (!isDragging.value) return;
            const touch = e.touches[0];
            const elem = document.elementFromPoint(touch.clientX, touch.clientY);
            if (elem) {
                const slotElem = elem.closest('.custom-slot');
                if (slotElem) {
                    const slotId = slotElem.getAttribute('data-id');
                    const slot = customGridSlots.value.find(s => s.id === slotId);
                    if (slot) dragCurrentSlot.value = slot;
                }
            }
        };

        const onDragEnd = () => {
            if (customGridState.value !== 'edit-layout') {
                if (dragImgId.value && dragImgCurrentId.value && dragImgId.value !== dragImgCurrentId.value) {
                    const sourceSlot = customGridSlots.value.find(s => s.id === dragImgId.value);
                    const targetSlot = customGridSlots.value.find(s => s.id === dragImgCurrentId.value);
                    if (sourceSlot && targetSlot) {
                        const tempImg = sourceSlot.image;
                        const tempLoad = sourceSlot.loading;
                        sourceSlot.image = targetSlot.image;
                        sourceSlot.loading = targetSlot.loading;
                        targetSlot.image = tempImg;
                        targetSlot.loading = tempLoad;
                    }
                }
                setTimeout(() => {
                    dragImgId.value = null;
                    dragImgCurrentId.value = null;
                }, 50);
                return;
            }
            if (!isDragging.value) return;
            isDragging.value = false;
            if (dragStartSlot.value && dragCurrentSlot.value && dragStartSlot.value !== dragCurrentSlot.value) {
                attemptMerge(dragStartSlot.value, dragCurrentSlot.value);
            }
            dragStartSlot.value = null;
            dragCurrentSlot.value = null;
        };

        const isSlotInDragPreview = (slot) => {
            if (!isDragging.value || !dragStartSlot.value || !dragCurrentSlot.value) return false;
            const minR = Math.min(dragStartSlot.value.r, dragCurrentSlot.value.r);
            const maxR = Math.max(dragStartSlot.value.r + dragStartSlot.value.rowSpan - 1, dragCurrentSlot.value.r + dragCurrentSlot.value.rowSpan - 1);
            const minC = Math.min(dragStartSlot.value.c, dragCurrentSlot.value.c);
            const maxC = Math.max(dragStartSlot.value.c + dragStartSlot.value.colSpan - 1, dragCurrentSlot.value.c + dragCurrentSlot.value.colSpan - 1);
            
            return slot.r >= minR && slot.r <= maxR && slot.c >= minC && slot.c <= maxC;
        };

        const attemptMerge = (slot1, slot2) => {
            const minR = Math.min(slot1.r, slot2.r);
            const maxR = Math.max(slot1.r + slot1.rowSpan - 1, slot2.r + slot2.rowSpan - 1);
            const minC = Math.min(slot1.c, slot2.c);
            const maxC = Math.max(slot1.c + slot1.colSpan - 1, slot2.c + slot2.colSpan - 1);
            
            const slotsInBox = customGridSlots.value.filter(s => {
                return s.r >= minR && s.r + s.rowSpan - 1 <= maxR &&
                       s.c >= minC && s.c + s.colSpan - 1 <= maxC;
            });
            
            const expectedArea = (maxR - minR + 1) * (maxC - minC + 1);
            const actualArea = slotsInBox.reduce((sum, s) => sum + (s.rowSpan * s.colSpan), 0);
            
            if (expectedArea !== actualArea) return;
            
            customGridSlots.value = customGridSlots.value.filter(s => !slotsInBox.includes(s));
            customGridSlots.value.push({
                id: `r${minR}c${minC}_merged_${Date.now()}`,
                r: minR, c: minC,
                rowSpan: maxR - minR + 1,
                colSpan: maxC - minC + 1,
                image: null,
                selected: false,
                loading: false
            });
        };

        const unmergeSlot = (slot) => {
            customGridSlots.value = customGridSlots.value.filter(s => s.id !== slot.id);
            for (let r = slot.r; r < slot.r + slot.rowSpan; r++) {
                for (let c = slot.c; c < slot.c + slot.colSpan; c++) {
                    customGridSlots.value.push({
                        id: `r${r}c${c}_${Date.now()}`,
                        r, c, rowSpan: 1, colSpan: 1, image: null, selected: false, loading: false
                    });
                }
            }
        };

        const resetCustomGrid = () => {
            initCustomGrid();
        };

        const toggleFab = () => {
            isFabOpen.value = !isFabOpen.value;
        };

        const startPublish = (mode) => {
            publishMode.value = mode;
            isFabOpen.value = false;
            isPublishOpen.value = true;
            if (mode === 'custom') {
                initCustomGrid();
            }
        };

        const closePublish = () => {
            isPublishOpen.value = false;
            publishTitle.value = '';
            publishContent.value = '';
            publishImages.value = [];
            
            // 视频状态重置
            publishVideoFile.value = null;
            if (publishVideoUrl.value) {
                URL.revokeObjectURL(publishVideoUrl.value);
            }
            publishVideoUrl.value = '';
            publishVideoLoading.value = false;
            uploadProgress.value = 0;
            if (videoFileInputRef.value) {
                videoFileInputRef.value.value = '';
            }
        };

        const triggerImageUpload = () => {
            if (fileInputRef.value) fileInputRef.value.click();
        };

        const handleImageSelect = (e) => {
            const files = Array.from(e.target.files);
            
            if (publishMode.value === 'custom') {
                if (files.length > 0 && currentUploadSlotId.value) {
                    const sortedSlots = [...customGridSlots.value].sort((a,b) => {
                        if (a.r !== b.r) return a.r - b.r;
                        return a.c - b.c;
                    });
                    
                    let targetSlots = [];
                    const clickedSlot = sortedSlots.find(s => s.id === currentUploadSlotId.value);
                    if (clickedSlot) targetSlots.push(clickedSlot);
                    
                    const otherEmptySlots = sortedSlots.filter(s => s.id !== currentUploadSlotId.value && !s.image);
                    targetSlots = targetSlots.concat(otherEmptySlots);
                    
                    let filesToProcess = files;
                    if (files.length > targetSlots.length) {
                        alert(`最多只能再选择 ${targetSlots.length} 张图片，已自动为您截取前 ${targetSlots.length} 张。`);
                        filesToProcess = files.slice(0, targetSlots.length);
                    }
                    
                    filesToProcess.forEach((file, index) => {
                        const slot = targetSlots[index];
                        slot.loading = true;
                        slot.image = PLACEHOLDER_SVG;
                        
                        compressImageToWebp(file).then(compressedUrl => {
                            slot.image = compressedUrl;
                            slot.loading = false;
                        }).catch(err => {
                            console.error("图片压缩失败", err);
                            slot.image = null;
                            slot.loading = false;
                            alert("图片处理失败，请稍后重试");
                        });
                    });
                    currentUploadSlotId.value = null;
                }
                e.target.value = '';
            } else {
                const remainingSlots = 99 - publishImages.value.length; // 允许超过9张
                let filesToProcess = files;
                if (files.length > remainingSlots) {
                    alert(`最多只能再选择 ${remainingSlots} 张图片，已自动为您截取前 ${remainingSlots} 张。`);
                    filesToProcess = files.slice(0, remainingSlots);
                }

                filesToProcess.forEach(file => {
                    const tempId = Math.random();
                    const placeholderItem = {
                        tempId,
                        url: PLACEHOLDER_SVG,
                        loading: true
                    };
                    publishImages.value.push(placeholderItem);
                    
                    compressImageToWebp(file).then(compressedUrl => {
                        const targetItem = publishImages.value.find(img => img.tempId === tempId);
                        if (targetItem) {
                            targetItem.url = compressedUrl;
                            targetItem.loading = false;
                        }
                    }).catch(err => {
                        console.error("图片压缩失败", err);
                        const idx = publishImages.value.findIndex(img => img.tempId === tempId);
                        if (idx > -1) {
                            publishImages.value.splice(idx, 1);
                        }
                        alert("图片处理失败，请稍后重试");
                    });
                });
                e.target.value = '';
            }
        };

        const removeImage = (idx) => {
            publishImages.value.splice(idx, 1);
        };

        const triggerVideoUpload = () => {
            if (videoFileInputRef.value) videoFileInputRef.value.click();
        };

        const handleVideoSelect = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // 校验文件类型，只能是视频
            if (!file.type.startsWith('video/')) {
                alert("只能选择视频文件进行上传！");
                e.target.value = '';
                return;
            }
            
            // 限制文件大小为 100MB
            if (file.size > 100 * 1024 * 1024) {
                alert("视频文件大小不能超过 100MB！");
                e.target.value = '';
                return;
            }
            
            // 视频预载和时长检测
            publishVideoLoading.value = true;
            const tempUrl = URL.createObjectURL(file);
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            tempVideo.src = tempUrl;
            
            tempVideo.onloadedmetadata = () => {
                URL.revokeObjectURL(tempUrl);
                const duration = tempVideo.duration;
                if (duration > 60.5) { // 允许少许误差
                    alert(`视频时长不能超过 60 秒！当前时长：${Math.round(duration)} 秒`);
                    publishVideoFile.value = null;
                    publishVideoUrl.value = '';
                    publishVideoLoading.value = false;
                    e.target.value = '';
                } else {
                    publishVideoFile.value = file;
                    publishVideoUrl.value = URL.createObjectURL(file);
                    publishVideoLoading.value = false;
                }
            };
            
            tempVideo.onerror = () => {
                URL.revokeObjectURL(tempUrl);
                alert("解析视频失败，可能是该视频格式在当前浏览器中不被支持！");
                publishVideoFile.value = null;
                publishVideoUrl.value = '';
                publishVideoLoading.value = false;
                e.target.value = '';
            };
        };

        const removeVideo = () => {
            publishVideoFile.value = null;
            if (publishVideoUrl.value) {
                URL.revokeObjectURL(publishVideoUrl.value);
            }
            publishVideoUrl.value = '';
            publishVideoLoading.value = false;
            uploadProgress.value = 0;
            if (videoFileInputRef.value) {
                videoFileInputRef.value.value = '';
            }
        };

        const normalDragIndex = ref(null);
        const normalDragCurrentIndex = ref(null);

        const onNormalDragStart = (e, idx) => {
            normalDragIndex.value = idx;
            if(e.dataTransfer) e.dataTransfer.setData('text/plain', idx);
        };
        const onNormalDragOver = (e, idx) => {
            e.preventDefault();
            normalDragCurrentIndex.value = idx;
        };
        const onNormalDrop = (e, idx) => {
            e.preventDefault();
            let from = normalDragIndex.value;
            if (from !== null && from !== idx) {
                const item = publishImages.value.splice(from, 1)[0];
                publishImages.value.splice(idx, 0, item);
            }
            normalDragIndex.value = null;
            normalDragCurrentIndex.value = null;
        };
        const onNormalTouchStart = (e, idx) => {
            normalDragIndex.value = idx;
        };
        const onNormalTouchMove = (e) => {
            if (normalDragIndex.value === null) return;
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                const item = el.closest('.image-preview-item');
                if (item) {
                    const idxStr = item.getAttribute('data-idx');
                    if (idxStr !== null) {
                        normalDragCurrentIndex.value = parseInt(idxStr);
                    }
                }
            }
        };
        const onNormalTouchEnd = () => {
            let from = normalDragIndex.value;
            let to = normalDragCurrentIndex.value;
            if (from !== null && to !== null && from !== to) {
                const item = publishImages.value.splice(from, 1)[0];
                publishImages.value.splice(to, 0, item);
            }
            normalDragIndex.value = null;
            normalDragCurrentIndex.value = null;
        };

        const canSubmit = Vue.computed(() => {
            if (!publishTitle.value.trim() || !publishContent.value.trim()) return false;
            if (publishMode.value === 'custom') {
                return customGridState.value === 'fill-images' && customGridSlots.value.every(s => s.image !== null && !s.loading);
            }
            if (publishMode.value === 'video') {
                return publishVideoFile.value !== null && !publishVideoLoading.value;
            }
            return publishImages.value.length > 0 && publishImages.value.every(img => !img.loading);
        });

        let pendingAction = null;
        const executeWithOSS = (actionFn) => {
            if (ossClient.value) {
                actionFn(ossClient.value);
            } else {
                pendingAction = actionFn;
                showSecPwdModal.value = true;
            }
        };

        const verifySecPassword = () => {
            if (!secPassword.value) {
                alert("请输入二级密码！");
                return;
            }
            
            if (!ENCRYPTED_CREDENTIALS) {
                alert("您的 OSS 密文常量尚未配置，请先按控制台指引运行 window.encryptOSSCredentials() 生成密文并填入 app.js。");
                return;
            }
            
            try {
                const decryptedBytes = CryptoJS.AES.decrypt(ENCRYPTED_CREDENTIALS, secPassword.value);
                const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
                if (!decryptedText) {
                    throw new Error("密码错误，解密内容为空");
                }
                
                const credentials = JSON.parse(decryptedText);
                if (!credentials.id || !credentials.secret) {
                    throw new Error("解密后的凭证格式不正确");
                }
                
                // 自动去除可能存在的首尾空格/换行
                const cleanId = credentials.id.trim();
                const cleanSecret = credentials.secret.trim();
                
                console.log("解密凭证成功！");
                console.log("AccessKeyId 长度:", cleanId.length, "首尾预览:", cleanId.substring(0, 4) + "..." + cleanId.substring(cleanId.length - 4));
                console.log("AccessKeySecret 长度:", cleanSecret.length, "首尾预览:", cleanSecret.substring(0, 4) + "..." + cleanSecret.substring(cleanSecret.length - 4));

                // 初始化 OSS 客户端
                ossClient.value = new OSS({
                    region: 'oss-cn-hangzhou',
                    accessKeyId: cleanId,
                    accessKeySecret: cleanSecret,
                    bucket: 'www-seikai',
                    secure: true
                });
                
                // 关闭输入模态框
                showSecPwdModal.value = false;
                
                // 执行等待的操作
                if (pendingAction) {
                    const action = pendingAction;
                    pendingAction = null;
                    action(ossClient.value);
                }
            } catch (err) {
                console.error("解密或解析 JSON 失败，详细错误：", err);
                alert("二级密码验证失败，密码错误或凭证损坏！");
            }
        };

        const favorites = ref({ seikai: [], echo: [] });
        
        const loadFavorites = async () => {
            try {
                const res = await fetch(ASSET_BASE + 'favorites.json?t=' + Date.now());
                if (res.ok) {
                    favorites.value = await res.json();
                } else {
                    favorites.value = { seikai: [], echo: [] };
                }
                // 如果当前在收藏 Tab，重新分发数据
                if (currentTab.value === 'favorites') {
                    filteredPosts.value = getBasePosts();
                    distributePosts();
                }
            } catch (e) {
                console.warn("加载收藏数据失败，可能尚未初始化收藏文件", e);
                favorites.value = { seikai: [], echo: [] };
            }
        };

        const isFavorited = (postId) => {
            const user = username.value || 'seikai';
            const userFavs = favorites.value[user] || [];
            return userFavs.includes(postId);
        };

        const toggleFavorite = (post) => {
            if (!post) return;
            const postId = post.id;
            const user = username.value || 'seikai';
            
            executeWithOSS(async (client) => {
                let userFavs = [...(favorites.value[user] || [])];
                const index = userFavs.indexOf(postId);
                if (index > -1) {
                    userFavs.splice(index, 1);
                } else {
                    userFavs.push(postId);
                }
                
                favorites.value[user] = userFavs;
                
                // 如果在收藏 Tab 实时过滤移出
                if (currentTab.value === 'favorites') {
                    filteredPosts.value = getBasePosts();
                    distributePosts();
                }
                
                try {
                    const favsBlob = new Blob([JSON.stringify(favorites.value, null, 2)], { type: 'application/json' });
                    await client.put('dandawang/public/favorites.json', favsBlob);
                } catch (e) {
                    console.error("同步收藏到 OSS 失败", e);
                    alert("同步收藏状态失败，请检查网络权限！");
                    if (index > -1) {
                        userFavs.push(postId);
                    } else {
                        userFavs.splice(userFavs.indexOf(postId), 1);
                    }
                    favorites.value[user] = userFavs;
                    
                    if (currentTab.value === 'favorites') {
                        filteredPosts.value = getBasePosts();
                        distributePosts();
                    }
                }
            });
        };

        const showDeleteDropdown = ref(false);
        const deletePost = (post) => {
            if (!post) return;
            if (!confirm("确认删除此图文吗？此操作将永久删除该图文及其所有云端图片与评论，且无法恢复！")) return;
            
            showDeleteDropdown.value = false;
            
            executeWithOSS(async (client) => {
                isSyncingToOSS.value = true;
                try {
                    const postId = post.id;
                    
                    // 1. 删除帖子图片/视频
                    if (post.images && post.images.length > 0) {
                        for (const imgPath of post.images) {
                            if (!imgPath.startsWith('data:')) {
                                try {
                                    await client.delete(`dandawang/public/${imgPath}`);
                                } catch (e) {
                                    console.warn(`删除图片失败: ${imgPath}`, e);
                                }
                            }
                        }
                    }
                    if (post.video) {
                        try {
                            await client.delete(`dandawang/public/${post.video}`);
                        } catch (e) {
                            console.warn(`删除视频失败: ${post.video}`, e);
                        }
                    }
                    if (post.videoRaw) {
                        try {
                            await client.delete(`dandawang/public/${post.videoRaw}`);
                        } catch (e) {
                            console.warn(`删除原始视频失败: ${post.videoRaw}`, e);
                        }
                    }
                    
                    // 2. 删除评论里的图片
                    if (post.comments && post.comments.length > 0) {
                        for (const comment of post.comments) {
                            if (comment.image && !comment.image.startsWith('data:')) {
                                try {
                                    await client.delete(`dandawang/public/${comment.image}`);
                                } catch (e) {
                                    console.warn(`删除评论图片失败: ${comment.image}`, e);
                                }
                            }
                        }
                    }
                    
                    // 3. 获取并更新 meta.json 及月度 JSON
                    let currentMeta = { totalPosts: 0, months: [] };
                    const metaRes = await fetch(ASSET_BASE + 'meta.json?t=' + Date.now());
                    if (metaRes.ok) {
                        currentMeta = await metaRes.json();
                    }
                    
                    const postDate = new Date(post.timestamp);
                    const YYYY = postDate.getFullYear();
                    const MM = String(postDate.getMonth() + 1).padStart(2, '0');
                    const monthId = `${YYYY}-${MM}`;
                    
                    let monthMeta = currentMeta.months.find(m => m.id === monthId);
                    if (monthMeta) {
                        let monthPosts = [];
                        const postsRes = await fetch(ASSET_BASE + monthMeta.jsonPath + '?t=' + Date.now());
                        if (postsRes.ok) {
                            monthPosts = await postsRes.json();
                        }
                        
                        const originalLength = monthPosts.length;
                        monthPosts = monthPosts.filter(p => p.id !== postId);
                        
                        if (monthPosts.length !== originalLength) {
                            if (monthPosts.length > 0) {
                                const monthJsonBlob = new Blob([JSON.stringify(monthPosts, null, 2)], { type: 'application/json' });
                                await client.put(`dandawang/public/${monthMeta.jsonPath}`, monthJsonBlob);
                                monthMeta.postCount = monthPosts.length;
                            } else {
                                try {
                                    await client.delete(`dandawang/public/${monthMeta.jsonPath}`);
                                } catch (e) {
                                    console.warn(`删除空月份 JSON 失败: ${monthMeta.jsonPath}`, e);
                                }
                                currentMeta.months = currentMeta.months.filter(m => m.id !== monthId);
                            }
                            
                            currentMeta.totalPosts = Math.max(0, (currentMeta.totalPosts || 0) - 1);
                            const metaBlob = new Blob([JSON.stringify(currentMeta, null, 2)], { type: 'application/json' });
                            await client.put('dandawang/public/meta.json', metaBlob);
                        }
                    }
                    
                    // 同步本地数据
                    posts.value = posts.value.filter(p => p.id !== postId);
                    filteredPosts.value = filteredPosts.value.filter(p => p.id !== postId);
                    meta.value = currentMeta;
                    
                    distributePosts();
                    selectedPost.value = null;
                    alert("删除成功！");
                } catch (err) {
                    console.error("删除失败", err);
                    alert("删除失败，请检查网络或密钥权限！");
                } finally {
                    isSyncingToOSS.value = false;
                }
            });
        };

        const commentText = ref('');
        const commentsImageFile = ref(null);
        const commentsImagePreview = ref(null);
        const isSubmittingComment = ref(false);

        const handleCommentImageSelect = (event) => {
            const file = event.target.files ? event.target.files[0] : null;
            if (!file) return;
            
            commentsImageFile.value = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                commentsImagePreview.value = e.target.result;
            };
            reader.readAsDataURL(file);
        };
        
        const clearCommentImage = () => {
            commentsImageFile.value = null;
            commentsImagePreview.value = null;
            const fileInput = document.getElementById('comment-file-input');
            if (fileInput) fileInput.value = '';
        };

        const compressCommentImage = (file) => {
            return new Promise((resolve, reject) => {
                const objectUrl = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    try {
                        URL.revokeObjectURL(objectUrl);
                        let width = img.width;
                        let height = img.height;
                        const maxLongEdge = 2160;
                        if (width > maxLongEdge || height > maxLongEdge) {
                            if (width > height) {
                                height = Math.round((height * maxLongEdge) / width);
                                width = maxLongEdge;
                            } else {
                                width = Math.round((width * maxLongEdge) / height);
                                height = maxLongEdge;
                            }
                        }
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        const webpDataUrl = canvas.toDataURL('image/webp', 0.8);
                        resolve(webpDataUrl);
                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = (err) => {
                    URL.revokeObjectURL(objectUrl);
                    reject(err);
                };
                img.src = objectUrl;
            });
        };

        const addComment = () => {
            if (!commentText.value.trim() && !commentsImagePreview.value) {
                alert("请输入评论内容或上传图片！");
                return;
            }
            
            const post = selectedPost.value;
            if (!post) return;
            
            isSubmittingComment.value = true;
            
            executeWithOSS(async (client) => {
                try {
                    let attachedImagePath = null;
                    
                    if (commentsImageFile.value) {
                        const compressedBase64 = await compressCommentImage(commentsImageFile.value);
                        const blob = base64ToBlob(compressedBase64);
                        
                        const postDate = new Date(post.timestamp);
                        const YYYY = postDate.getFullYear();
                        const MM = String(postDate.getMonth() + 1).padStart(2, '0');
                        const monthId = `${YYYY}-${MM}`;
                        
                        const relativePath = `images/comments/${monthId}/c_${Date.now()}.webp`;
                        const ossKey = `dandawang/public/${relativePath}`;
                        
                        await client.put(ossKey, blob);
                        attachedImagePath = relativePath;
                    }
                    
                    const commentObj = {
                        id: "c_" + Date.now(),
                        commenter: username.value || 'seikai',
                        text: commentText.value.trim(),
                        image: attachedImagePath,
                        timestamp: Date.now()
                    };
                    
                    const postDate = new Date(post.timestamp);
                    const YYYY = postDate.getFullYear();
                    const MM = String(postDate.getMonth() + 1).padStart(2, '0');
                    const monthId = `${YYYY}-${MM}`;
                    const jsonPath = `posts/${monthId}.json`;
                    
                    let monthPosts = [];
                    const postsRes = await fetch(ASSET_BASE + jsonPath + '?t=' + Date.now());
                    if (postsRes.ok) {
                        monthPosts = await postsRes.json();
                    }
                    
                    const targetPost = monthPosts.find(p => p.id === post.id);
                    if (targetPost) {
                        if (!targetPost.comments) targetPost.comments = [];
                        targetPost.comments.push(commentObj);
                        
                        const monthJsonBlob = new Blob([JSON.stringify(monthPosts, null, 2)], { type: 'application/json' });
                        await client.put(`dandawang/public/${jsonPath}`, monthJsonBlob);
                        
                        if (!post.comments) post.comments = [];
                        post.comments.push(commentObj);
                        
                        // 注意：post.comments 与 posts.value 内部指向同一个对象引用，不可二次 push，否则会发生重复渲染 Bug
                    }
                    
                    commentText.value = '';
                    clearCommentImage();
                    
                    setTimeout(() => {
                        const commentsArea = document.querySelector('.detail-view');
                        if (commentsArea) {
                            commentsArea.scrollTop = commentsArea.scrollHeight;
                        }
                    }, 100);
                    
                } catch (e) {
                    console.error("发表评论失败", e);
                    alert("评论发表失败，请重试！");
                } finally {
                    isSubmittingComment.value = false;
                }
            });
        };

        const deleteComment = (comment) => {
            if (!comment) return;
            const post = selectedPost.value;
            if (!post) return;
            
            // 校验权限：只能删除自己发表的评论
            if (comment.commenter !== username.value) {
                alert("无删除权限！只能删除自己发表的评论");
                return;
            }
            
            if (!confirm("确认删除这条评论吗？此操作无法恢复！")) return;
            
            executeWithOSS(async (client) => {
                isSubmittingComment.value = true;
                try {
                    // 1. 如果评论有附加的图片，需要删除图片
                    if (comment.image) {
                        try {
                            await client.delete(`dandawang/public/${comment.image}`);
                        } catch (e) {
                            console.warn(`删除评论图片失败: ${comment.image}`, e);
                        }
                    }
                    
                    // 2. 更新本月的 posts.json
                    const postDate = new Date(post.timestamp);
                    const YYYY = postDate.getFullYear();
                    const MM = String(postDate.getMonth() + 1).padStart(2, '0');
                    const monthId = `${YYYY}-${MM}`;
                    const jsonPath = `posts/${monthId}.json`;
                    
                    let monthPosts = [];
                    const postsRes = await fetch(ASSET_BASE + jsonPath + '?t=' + Date.now());
                    if (postsRes.ok) {
                        monthPosts = await postsRes.json();
                    }
                    
                    const targetPost = monthPosts.find(p => p.id === post.id);
                    if (targetPost && targetPost.comments) {
                        targetPost.comments = targetPost.comments.filter(c => c.id !== comment.id);
                        
                        const monthJsonBlob = new Blob([JSON.stringify(monthPosts, null, 2)], { type: 'application/json' });
                        await client.put(`dandawang/public/${jsonPath}`, monthJsonBlob);
                        
                        // 3. 更新本地视图数据
                        post.comments = post.comments.filter(c => c.id !== comment.id);
                    }
                    
                    alert("评论已删除！");
                } catch (e) {
                    console.error("删除评论失败", e);
                    alert("删除评论失败，请重试！");
                } finally {
                    isSubmittingComment.value = false;
                }
            });
        };

        const getAvatarUrl = (user) => {
            const cleanUser = (user || 'seikai').toLowerCase();
            // 头像 CSS 尺寸约 32-50px，DPR 2 → 最大 100px 物理像素，取 bucket=300 保证质量与缓存命中
            return `${ASSET_BASE}avatars/${cleanUser}.webp?x-oss-process=image/resize,w_300`;
        };

        const base64ToBlob = (base64Str) => {
            const parts = base64Str.split(';base64,');
            const contentType = parts[0].split(':')[1];
            const raw = window.atob(parts[1]);
            const rawLength = raw.length;
            const uInt8Array = new Uint8Array(rawLength);
            for (let i = 0; i < rawLength; ++i) {
                uInt8Array[i] = raw.charCodeAt(i);
            }
            return new Blob([uInt8Array], { type: contentType });
        };

        const syncPostToOSS = async () => {
            if (!canSubmit.value || !ossClient.value) return;
            
            isSyncingToOSS.value = true;
            
            try {
                const now = new Date();
                const YYYY = now.getFullYear();
                const MM = String(now.getMonth() + 1).padStart(2, '0');
                const DD = String(now.getDate()).padStart(2, '0');
                const monthId = `${YYYY}-${MM}`;
                const dateStr = `${YYYY}-${MM}-${DD}`;
                
                const cleanTitle = publishTitle.value.trim().replace(/[\\\/:*?"<>|]/g, "_") || "untitled";
                const folderPath = `images/${monthId}/${dateStr}_${cleanTitle}`;
                
                let finalImages = [];
                let customGridData = null;
                let customRows = null;
                let relativeVideoPath = '';
                
                if (publishMode.value === 'custom') {
                    const sortedSlots = [...customGridSlots.value].sort((a, b) => {
                        if (a.r !== b.r) return a.r - b.r;
                        return a.c - b.c;
                    });
                    
                    const uploadPromises = sortedSlots.map(async (slot, idx) => {
                        if (!slot.image) return;
                        
                        const blob = base64ToBlob(slot.image);
                        const relativePath = `${folderPath}/${idx + 1}.webp`;
                        const ossKey = `dandawang/public/${relativePath}`;
                        
                        await ossClient.value.put(ossKey, blob);
                        slot.image = relativePath; // 用 OSS 相对路径替换 base64
                        return relativePath;
                    });
                    
                    const uploadedPaths = await Promise.all(uploadPromises);
                    finalImages = uploadedPaths.filter(p => p !== undefined);
                    customGridData = sortedSlots;
                    customRows = customGridRows.value;
                } else if (publishMode.value === 'video') {
                    const videoFile = publishVideoFile.value;
                    const ts = Date.now();
                    const ext = videoFile.name.split('.').pop() || 'mp4';
                    const rawPath = `video/raw/${ts}.${ext}`;
                    relativeVideoPath = `video/compress/${ts}.${ext}`;
                    const ossKey = `dandawang/public/${rawPath}`;
                    
                    uploadProgress.value = 0;
                    // 分片上传支持进度条和大文件稳定上传
                    await ossClient.value.multipartUpload(ossKey, videoFile, {
                        progress: (p) => {
                            uploadProgress.value = Math.round(p * 100);
                        }
                    });
                } else {
                    const uploadPromises = publishImages.value.map(async (img, idx) => {
                        const blob = base64ToBlob(img.url);
                        const relativePath = `${folderPath}/${idx + 1}.webp`;
                        const ossKey = `dandawang/public/${relativePath}`;
                        
                        await ossClient.value.put(ossKey, blob);
                        return relativePath;
                    });
                    
                    finalImages = await Promise.all(uploadPromises);
                }
                
                // 1. 获取最新的 meta.json
                let currentMeta = { totalPosts: 0, months: [] };
                try {
                    const metaRes = await fetch(ASSET_BASE + 'meta.json?t=' + Date.now());
                    if (metaRes.ok) {
                        currentMeta = await metaRes.json();
                    }
                } catch (e) {
                    console.warn("获取 meta.json 失败，使用初始值", e);
                }
                
                // 2. 查找是否有当前月份
                let monthMeta = currentMeta.months.find(m => m.id === monthId);
                let monthPosts = [];
                
                if (monthMeta) {
                    // 获取该月份对应的 JSON 文章列表
                    try {
                        const postsRes = await fetch(ASSET_BASE + monthMeta.jsonPath + '?t=' + Date.now());
                        if (postsRes.ok) {
                            monthPosts = await postsRes.json();
                        }
                    } catch (e) {
                        console.warn("获取本月文章列表失败，使用空列表", e);
                    }
                } else {
                    // 如果是新的月份，创建月份索引信息并排在最前面
                    monthMeta = {
                        id: monthId,
                        postCount: 0,
                        jsonPath: `posts/${monthId}.json`
                    };
                    currentMeta.months.unshift(monthMeta);
                    currentMeta.months.sort((a, b) => b.id.localeCompare(a.id));
                }
                
                // 3. 构建全新笔记对象
                const newPost = {
                    id: "post_" + Date.now(),
                    timestamp: Date.now(),
                    layout: publishMode.value,
                    type: publishMode.value, // 兼容老的字段
                    title: publishTitle.value.trim(),
                    content: publishContent.value.trim(),
                    images: finalImages,
                    video: relativeVideoPath || undefined,
                    videoRaw: publishMode.value === 'video' ? `video/raw/${Date.now()}.${publishVideoFile.value?.name.split('.').pop() || 'mp4'}` : undefined,
                    customGridData,
                    customRows,
                    layout_config: customGridData, // 兼容老的字段
                    publisher: username.value || 'seikai',
                    comments: []
                };
                
                // 4. 追加到本月列表开头
                monthPosts.unshift(newPost);
                
                // 5. 上传本月 posts JSON
                const monthJsonBlob = new Blob([JSON.stringify(monthPosts, null, 2)], { type: 'application/json' });
                await ossClient.value.put(`dandawang/public/${monthMeta.jsonPath}`, monthJsonBlob);
                
                // 6. 更新 meta.json 数据并上传
                monthMeta.postCount = monthPosts.length;
                currentMeta.totalPosts = (currentMeta.totalPosts || 0) + 1;
                
                const metaBlob = new Blob([JSON.stringify(currentMeta, null, 2)], { type: 'application/json' });
                await ossClient.value.put('dandawang/public/meta.json', metaBlob);
                
                // 7. 同步本地 Vue 数据
                meta.value = currentMeta;
                
                // 自动刷新视图列表
                if (currentMonthId.value === 'all') {
                    await loadAllMonths();
                } else if (currentMonthId.value === monthId) {
                    await loadMonth(monthMeta);
                    filteredPosts.value = posts.value;
                    distributePosts();
                } else {
                    await loadAllMonths();
                }
                
                alert("发布并同步成功！");
                closePublish();
            } catch (err) {
                console.error("同步到 OSS 失败", err);
                alert("同步数据到 OSS 失败，请检查密钥权限、CORS设置或网络！");
            } finally {
                isSyncingToOSS.value = false;
            }
        };

        const submitPost = () => {
            if (!canSubmit.value) return;
            executeWithOSS(() => {
                syncPostToOSS();
            });
        };

        const handleVideoCoverError = async (e, post) => {
            if (e.target.dataset.fallbackState) return; 

            if (!post.videoRaw) {
                e.target.dataset.fallbackState = 'invalid';
                e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="%23f1f2f6"/><text x="50%" y="45%" text-anchor="middle" font-size="16" fill="%23a4b0be">视频资源已失效</text><text x="50%" y="55%" text-anchor="middle" font-size="12" fill="%23a4b0be">可能格式不支持或已删除</text></svg>';
                return;
            }

            e.target.dataset.fallbackState = 'checking';
            
            // 使用时间来判断是否在转码中，避免 OSS 截图延迟导致误判
            const now = Date.now();
            const postTime = post.timestamp;
            const TRANSCODING_TIMEOUT = 30 * 60 * 1000; // 30 分钟内都认为是转码中

            if (now - postTime < TRANSCODING_TIMEOUT) {
                e.target.dataset.fallbackState = 'transcoding';
                e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="%23fff5f5"/><text x="50%" y="45%" text-anchor="middle" font-size="16" fill="%23ff7675">努力转码中...</text><text x="50%" y="55%" text-anchor="middle" font-size="12" fill="%23ff7675">稍后即可播放</text></svg>';
            } else {
                e.target.dataset.fallbackState = 'invalid';
                e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="%23f1f2f6"/><text x="50%" y="45%" text-anchor="middle" font-size="16" fill="%23a4b0be">视频资源已失效</text><text x="50%" y="55%" text-anchor="middle" font-size="12" fill="%23a4b0be">可能格式不支持或已删除</text></svg>';
            }
        };

        const handleVideoPlayerError = (e, post) => {
            if (e.target.dataset.fallbackState) return; 
            e.target.dataset.fallbackState = 'true';
            if (post.videoRaw) {
                // 如果转码还没好，强行播放原画质兜底
                e.target.src = ASSET_BASE + post.videoRaw;
                e.target.load();
            }
        };

        // 监听视口宽度变化，防抖后重新分配（distributePosts 内部自行判断列数）
        let resizeTimeout = null;
        const handleResize = () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                distributePosts();
            }, 120);
        };

        onMounted(() => {
            checkLogin();
            window.addEventListener('resize', handleResize);
        });

        onBeforeUnmount(() => {
            window.removeEventListener('resize', handleResize);
        });

        return {
            isLoggedIn,
            username,
            password,
            loginError,
            handleLogin,
            logout,
            meta,
            posts,
            columns,
            filteredPosts,
            searchInput,
            startDateInput,
            endDateInput,
            isSearchActive,
            searchStatusText,
            showDateFilter,
            applySearch,
            clearSearch,
            currentMonthId,
            loadMonth,
            loadAllMonths,
            formatDate,
            ASSET_BASE,
            getImageUrlWithHash,
            userStats,
            getAvatarUrl,
            openPost,
            closePost,
            selectedPost,
            handleVideoCoverError,
            handleVideoPlayerError,
            currentSlideIndex,
            onSliderScroll,
            sliderRef,
            prevSlide,
            nextSlide,
            isFabOpen,
            toggleFab,
            publishMode,
            startPublish,
            isPublishOpen,
            publishTitle,
            publishContent,
            publishImages,
            fileInputRef,
            publishVideoFile,
            publishVideoUrl,
            publishVideoLoading,
            uploadProgress,
            videoFileInputRef,
            detailVideoPlayerRef,
            triggerVideoUpload,
            handleVideoSelect,
            removeVideo,
            getVideoSnapshotUrl,
            customGridRows,
            customGridSlots,
            customGridState,
            initCustomGrid,
            onDragStart,
            onSlotClick,
            onMouseEnter,
            onTouchMove,
            onDragEnd,
            isSlotInDragPreview,
            resetCustomGrid,
            closePublish,
            triggerImageUpload,
            handleImageSelect,
            removeImage,
            dragImgId,
            dragImgCurrentId,
            normalDragIndex,
            normalDragCurrentIndex,
            onNormalDragStart,
            onNormalDragOver,
            onNormalDrop,
            onNormalTouchStart,
            onNormalTouchMove,
            onNormalTouchEnd,
            canSubmit,
            submitPost,
            showSecPwdModal,
            secPassword,
            isSyncingToOSS,
            verifySecPassword,
            favorites,
            isFavorited,
            toggleFavorite,
            showDeleteDropdown,
            deletePost,
            commentText,
            commentsImageFile,
            commentsImagePreview,
            isSubmittingComment,
            handleCommentImageSelect,
            clearCommentImage,
            addComment,
            deleteComment,
            getAvatarUrl,
            currentTab,
            setTab,
            totalPhotosCount,
            favoritedPostsCount,
            allPhotos,
            selectedPhoto,
            openPhotoLightbox,
            closePhotoLightbox,
            selectedCommentImage,
            openCommentImageLightbox,
            closeCommentImageLightbox,
            viewFullPostFromPhoto,
            showHomeDropdown,
            handleVideoUploadPlaceholder: () => {
                startPublish('video');
            }
        };
    }
}).mount('#app');
