const { createApp, ref, onMounted } = Vue;

// 测试用的密码 "123456" 的 SHA256 哈希值
const CORRECT_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

createApp({
    setup() {
        const isLoggedIn = ref(false);
        const password = ref('');
        const loginError = ref(false);

        // 初始化检查是否已登录
        const checkLogin = () => {
            const token = localStorage.getItem('auth_token');
            if (token === CORRECT_HASH) {
                isLoggedIn.value = true;
            }
        };

        // 处理登录验证
        const handleLogin = () => {
            // 使用 CryptoJS 进行 SHA256 单向哈希运算
            const hash = CryptoJS.SHA256(password.value).toString();
            
            if (hash === CORRECT_HASH) {
                localStorage.setItem('auth_token', hash);
                isLoggedIn.value = true;
                password.value = '';
            } else {
                loginError.value = true;
                // 2秒后清除震动错误状态
                setTimeout(() => {
                    loginError.value = false;
                }, 2000);
            }
        };

        // 退出登录
        const logout = () => {
            localStorage.removeItem('auth_token');
            isLoggedIn.value = false;
        };

        onMounted(() => {
            checkLogin();
        });

        return {
            isLoggedIn,
            password,
            loginError,
            handleLogin,
            logout
        };
    }
}).mount('#app');
