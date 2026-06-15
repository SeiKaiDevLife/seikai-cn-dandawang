const { createApp, ref, onMounted } = Vue;

const CORRECT_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

createApp({
    setup() {
        const isLoggedIn = ref(localStorage.getItem('isLoggedIn') === 'true');
        const username = ref(localStorage.getItem('username') || '');
        const password = ref('');
        const loginError = ref(false);
        const scrollPosition = ref(0);
        
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
                const postRes = await fetch(ASSET_BASE + m.jsonPath);
                if (postRes.ok) {
                    posts.value = await postRes.json();
                }
            } catch (e) {
                console.error("加载月份失败", e);
            }
        };

        const loadAllMonths = async () => {
            currentMonthId.value = 'all';
            let allPosts = [];
            try {
                const reqs = meta.value.months.map(m => fetch(ASSET_BASE + m.jsonPath).then(r => r.json()));
                const results = await Promise.all(reqs);
                results.forEach(res => {
                    allPosts = allPosts.concat(res);
                });
                posts.value = allPosts.sort((a, b) => b.timestamp - a.timestamp);
                
                if (isSearchActive.value) {
                    applySearch();
                } else {
                    filteredPosts.value = posts.value;
                    distributePosts();
                }
            } catch (e) {
                console.error("加载全部失败", e);
            }
        };

        const loadData = async () => {
            try {
                const metaRes = await fetch(ASSET_BASE + 'meta.json');
                if (metaRes.ok) {
                    meta.value = await metaRes.json();
                    if (meta.value.months.length > 0) {
                        await loadAllMonths();
                    }
                }
            } catch (e) {
                console.error("加载失败", e);
            }
        };

        // 瀑布流
        const leftCol = ref([]);
        const rightCol = ref([]);
        const selectedPost = ref(null);

        // 搜索功能替换为内嵌式
        const searchInput = ref('');
        const startDateInput = ref('');
        const endDateInput = ref('');
        const isSearchActive = ref(false);
        const searchStatusText = ref('');
        const filteredPosts = ref([]);
        const showDateFilter = ref(false);

        const applySearch = () => {
            isSearchActive.value = true;
            showDateFilter.value = false;
            let res = posts.value;
            
            const q = searchInput.value.trim().toLowerCase();
            const start = startDateInput.value ? new Date(startDateInput.value).getTime() : 0;
            const end = endDateInput.value ? new Date(endDateInput.value + 'T23:59:59.999').getTime() : Infinity;

            res = res.filter(p => {
                const matchKeyword = q ? ((p.title && p.title.toLowerCase().includes(q)) || (p.content && p.content.toLowerCase().includes(q))) : true;
                const matchTime = p.timestamp >= start && p.timestamp <= end;
                return matchKeyword && matchTime;
            });
            
            filteredPosts.value = res;
            
            let status = [];
            if (q) status.push('关键词"' + q + '"');
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
            filteredPosts.value = posts.value;
            distributePosts();
        };

        // 获取图片地址并处理 Data URL (临时发布的图片不支持加 ?v=后缀)
        const getImageUrlWithHash = (img, hash) => {
            const url = typeof img === 'string' ? img : img.url;
            if (url.startsWith('data:')) return url;
            return ASSET_BASE + url + '?v=' + hash;
        };

        let currentRenderId = 0;
        const distributePosts = async () => {
            const renderId = ++currentRenderId;
            let tempLeft = [];
            let tempRight = [];
            let leftHeight = 0;
            let rightHeight = 0;

            for (const post of filteredPosts.value) {
                if (!post.hash) post.hash = post.timestamp;
                
                let ratio = 1; // 默认 1:1
                if (post.images && post.images.length > 0) {
                    try {
                        const imgUrl = getImageUrlWithHash(post.images[0], post.hash);
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

                // 判断哪列较矮，放入哪一列
                if (leftHeight <= rightHeight) {
                    tempLeft.push(post);
                    leftHeight += estimatedHeight;
                } else {
                    tempRight.push(post);
                    rightHeight += estimatedHeight;
                }
            }
            
            if (renderId === currentRenderId) {
                leftCol.value = tempLeft;
                rightCol.value = tempRight;
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

        // 自定义网格状态
        const customGridRows = ref(3);
        const customGridSlots = ref([]);
        const customGridState = ref('edit-layout'); // 'edit-layout' | 'fill-images'
        const currentUploadSlotId = ref(null);

        const initCustomGrid = () => {
            let slots = [];
            for (let r = 0; r < customGridRows.value; r++) {
                for (let c = 0; c < 3; c++) {
                    slots.push({ id: `r${r}c${c}`, r, c, rowSpan: 1, colSpan: 1, image: null, selected: false });
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
                        const temp = sourceSlot.image;
                        sourceSlot.image = targetSlot.image;
                        targetSlot.image = temp;
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
                selected: false
            });
        };

        const unmergeSlot = (slot) => {
            customGridSlots.value = customGridSlots.value.filter(s => s.id !== slot.id);
            for (let r = slot.r; r < slot.r + slot.rowSpan; r++) {
                for (let c = slot.c; c < slot.c + slot.colSpan; c++) {
                    customGridSlots.value.push({
                        id: `r${r}c${c}_${Date.now()}`,
                        r, c, rowSpan: 1, colSpan: 1, image: null, selected: false
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
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                            targetSlots[index].image = ev.target.result;
                        };
                        reader.readAsDataURL(file);
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
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        publishImages.value.push(ev.target.result);
                    };
                    reader.readAsDataURL(file);
                });
                e.target.value = '';
            }
        };

        const removeImage = (idx) => {
            publishImages.value.splice(idx, 1);
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
                return customGridState.value === 'fill-images' && customGridSlots.value.every(s => s.image !== null);
            }
            return publishImages.value.length > 0;
        });

        const submitPost = () => {
            if (!canSubmit.value) return;

            let finalImages = [];
            let postLayout = publishMode.value;
            let customGridData = null;
            let customRows = null;

            if (publishMode.value === 'custom') {
                // sort slots so images array is ordered left-to-right, top-to-bottom based on (r, c)
                const sortedSlots = [...customGridSlots.value].sort((a, b) => {
                    if (a.r !== b.r) return a.r - b.r;
                    return a.c - b.c;
                });
                finalImages = sortedSlots.map(s => s.image);
                customGridData = sortedSlots;
                customRows = customGridRows.value;
            } else {
                finalImages = [...publishImages.value];
            }

            const newPost = {
                id: "temp_" + Date.now(),
                title: publishTitle.value.trim(),
                content: publishContent.value.trim(),
                timestamp: Date.now(),
                images: finalImages,
                hash: "temp_" + Date.now(),
                layout: postLayout,
                customGridData,
                customRows
            };

            // 添加到所有推文列表头部
            posts.value.unshift(newPost);
            
            // 如果在搜索模式下，或者直接刷新列表
            if (isSearchActive.value) {
                applySearch();
            } else {
                filteredPosts.value = posts.value;
                distributePosts();
            }

            closePublish();
        };

        onMounted(() => {
            checkLogin();
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
            leftCol,
            rightCol,
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
            openPost,
            closePost,
            selectedPost,
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
            submitPost
        };
    }
}).mount('#app');
