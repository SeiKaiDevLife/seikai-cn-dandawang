import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CryptoJS from 'crypto-js';
import styles from './Login.module.css';

// 临时假定正确的哈希值 (密码 "123456" 的 SHA256 加盐)
// 实际项目会通过环境变量或专门的配置文件注入
const CORRECT_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 基础防线：前端单向哈希
    const hash = CryptoJS.SHA256(password).toString();
    
    if (hash === CORRECT_HASH) {
      localStorage.setItem('auth_token', hash);
      // 跳转到首页
      navigate('/');
    } else {
      setError(true);
      // 2秒后移除震动错误状态
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.glassCard}>
        <div className={styles.avatarPlaceholder}>🐾</div>
        <h1 className={styles.title}>Private Album</h1>
        <p className={styles.subtitle}>Danda & Wang's Memories</p>
        
        <form onSubmit={handleLogin} className={styles.form}>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${styles.input} ${error ? styles.errorShake : ''}`}
            placeholder="Enter access code..."
          />
          <button type="submit" className={styles.button}>Enter</button>
        </form>
      </div>
    </div>
  );
}
