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
        
        const ASSET_BASE = 'public/';

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

        const openPost = (post) => {
            scrollPosition.value = window.scrollY || document.documentElement.scrollTop;
            selectedPost.value = post;
            currentSlideIndex.value = 0;
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'auto' });
            }, 0);
        };

        const closePost = () => {
            selectedPost.value = null;
            setTimeout(() => {
                window.scrollTo({ top: scrollPosition.value, behavior: 'auto' });
            }, 0);
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

        const toggleFab = () => {
            isFabOpen.value = !isFabOpen.value;
        };

        const startPublish = (mode) => {
            publishMode.value = mode;
            isFabOpen.value = false;
            isPublishOpen.value = true;
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
            const remainingSlots = 9 - publishImages.value.length;
            const filesToProcess = files.slice(0, remainingSlots);

            filesToProcess.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    publishImages.value.push(e.target.result);
                };
                reader.readAsDataURL(file);
            });
            // 重置 input 以允许再次选择同一文件
            e.target.value = '';
        };

        const removeImage = (idx) => {
            publishImages.value.splice(idx, 1);
        };

        const canSubmit = Vue.computed(() => {
            return publishImages.value.length > 0 && (publishTitle.value.trim() !== '' || publishContent.value.trim() !== '');
        });

        const submitPost = () => {
            if (!canSubmit.value) return;

            const newPost = {
                id: "temp_" + Date.now(),
                title: publishTitle.value.trim(),
                content: publishContent.value.trim(),
                timestamp: Date.now(),
                images: [...publishImages.value],
                hash: "temp_" + Date.now(),
                layout: publishMode.value
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
            closePublish,
            triggerImageUpload,
            handleImageSelect,
            removeImage,
            canSubmit,
            submitPost
        };
    }
}).mount('#app');
