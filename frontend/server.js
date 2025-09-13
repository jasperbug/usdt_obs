// 簡單的前端開發伺服器
const express = require('express');
const path = require('path');
const app = express();
const PORT = 8080;

// 靜態文件服務
app.use(express.static(path.join(__dirname)));

// 單頁應用路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 前端開發伺服器已啟動: http://localhost:${PORT}`);
    console.log('📁 服務目錄:', __dirname);
    console.log('🔗 請確保後端 API 服務也在 http://localhost:3000 運行');
});