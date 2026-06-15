const { createApp, ref, onMounted } = Vue;

const CORRECT_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

createApp({
    setup() {
        const isLoggedIn = ref(false);
        const password = ref('');
        const loginError = ref(false);
        
        const meta = ref({ totalPosts: 0, months: [] });
        const posts = ref([]);
        const currentMonthId = ref('');
        
        // 资源基础路径：当前是在 GitHub Pages 根目录，所以静态数据在 public/ 下
        // 以后如果图片和 JSON 搬迁到 OSS，只需要把这里改成 "https://你的OSS域名.com/" 即可
        const ASSET_BASE = 'public/';

        const checkLogin = () => {
            const token = localStorage.getItem('auth_token');
            if (token === CORRECT_HASH) {
                isLoggedIn.value = true;
                loadData();
            }
        };

        const handleLogin = () => {
            const hash = CryptoJS.SHA256(password.value).toString();
            if (hash === CORRECT_HASH) {
                localStorage.setItem('auth_token', hash);
                isLoggedIn.value = true;
                password.value = '';
                loadData();
            } else {
                loginError.value = true;
                setTimeout(() => {
                    loginError.value = false;
                }, 2000);
            }
        };

        const logout = () => {
            localStorage.removeItem('auth_token');
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
                // 并发请求所有月份的JSON
                const reqs = meta.value.months.map(m => fetch(ASSET_BASE + m.jsonPath).then(r => r.json()));
                const results = await Promise.all(reqs);
                results.forEach(res => {
                    allPosts = allPosts.concat(res);
                });
                // 按时间倒序排序合并后的所有文章
                posts.value = allPosts.sort((a, b) => b.timestamp - a.timestamp);
            } catch (e) {
                console.error("加载全部数据失败", e);
            }
        };

        const loadData = async () => {
            try {
                // 请求全局索引
                const metaRes = await fetch(ASSET_BASE + 'meta.json');
                if (metaRes.ok) {
                    meta.value = await metaRes.json();
                    if (meta.value.months.length > 0) {
                        // 默认加载全部动态
                        await loadAllMonths();
                    }
                }
            } catch (e) {
                console.error("加载数据失败", e);
            }
        };

        // 格式化时间为可见文本
        const formatDate = (ts) => {
            const d = new Date(ts);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };

        onMounted(() => {
            checkLogin();
        });

        return {
            isLoggedIn,
            password,
            loginError,
            handleLogin,
            logout,
            meta,
            posts,
            currentMonthId,
            loadMonth,
            loadAllMonths,
            formatDate,
            ASSET_BASE
        };
    }
}).mount('#app');
