import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login/Login';

import React from 'react';

// 简易路由守卫：检查本地哈希令牌
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('auth_token');
  const CORRECT_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"; // "123456"
  
  if (token !== CORRECT_HASH) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// 临时占位的首页
const Home = () => (
  <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
    <h1>相册首页瀑布流 (开发中...)</h1>
    <p>登录成功！</p>
    <button 
      onClick={() => {
        localStorage.removeItem('auth_token');
        window.location.reload();
      }}
      style={{
        marginTop: '1rem', padding: '0.5rem 1rem', background: '#333', color: '#fff', 
        border: 'none', borderRadius: '8px', cursor: 'pointer'
      }}
    >
      退出登录
    </button>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* 根路径受保护 */}
        <Route path="/" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
