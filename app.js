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
                distributePosts();
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

        // 搜索扩展页逻辑
        const isSearchOpen = ref(false);
        const searchQuery = ref('');
        
        const openSearch = () => {
            isSearchOpen.value = true;
        };

        const closeSearch = () => {
            isSearchOpen.value = false;
        };

        const filterByMonth = async (monthId) => {
            if (monthId === 'all') {
                await loadAllMonths();
            } else {
                const m = meta.value.months.find(x => x.id === monthId);
                if (m) await loadMonth(m);
            }
            closeSearch();
        };

        // 数据过滤监听
        const filteredPosts = Vue.computed(() => {
            let res = posts.value;
            if (searchQuery.value.trim()) {
                const q = searchQuery.value.trim().toLowerCase();
                res = res.filter(p => 
                    (p.title && p.title.toLowerCase().includes(q)) || 
                    (p.content && p.content.toLowerCase().includes(q))
                );
            }
            return res;
        });

        Vue.watch(filteredPosts, () => {
            distributePosts();
        });

        // 瀑布流高度计算
        const getImageUrl = (img) => {
            return ASSET_BASE + (typeof img === 'string' ? img : img.url);
        };

        const distributePosts = async () => {
            leftCol.value = [];
            rightCol.value = [];
            let leftHeight = 0;
            let rightHeight = 0;

            for (const post of filteredPosts.value) {
                if (!post.hash) post.hash = post.timestamp;
                
                let ratio = 1; // 默认 1:1
                if (post.images && post.images.length > 0) {
                    try {
                        const imgUrl = getImageUrl(post.images[0]) + '?v=' + post.hash;
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
                
                // 估算卡片高度：图片按比例占的高度 + 文字信息大致高度(100)
                const estimatedHeight = ratio * 300 + 100;

                // 判断哪列矮，放在矮的那一列
                if (leftHeight <= rightHeight) {
                    leftCol.value.push(post);
                    leftHeight += estimatedHeight;
                } else {
                    rightCol.value.push(post);
                    rightHeight += estimatedHeight;
                }
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
            isSearchOpen,
            searchQuery,
            openSearch,
            closeSearch,
            filterByMonth,
            currentMonthId,
            loadMonth,
            loadAllMonths,
            formatDate,
            ASSET_BASE,
            getImageUrl,
            openPost,
            closePost,
            selectedPost,
            currentSlideIndex,
            onSliderScroll,
            sliderRef,
            prevSlide,
            nextSlide
        };
    }
}).mount('#app');
