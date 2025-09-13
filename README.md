# USDT OBS 抖內系統

一個基於尾數識別的 USDT 捐款監聽系統，支援即時 OBS 通知和 Binance API 自動監聽。

## 🚀 系統特色

- **尾數識別技術**: 通過精確的小數位數自動識別捐款
- **雙重監聽保障**: Binance API + BSC 區塊鏈同時監聽
- **即時通知**: 入賬即時播報到 OBS/前端
- **自動化流程**: 無需手動干預的完全自動化系統
- **容錯設計**: 支援記憶體模式和資料庫模式

## 📊 工作原理

### 尾數識別流程

1. **用戶創建捐款**: 輸入基礎金額（如 5 USDT）
2. **系統生成尾數**: 自動生成 6 位小數尾數（如 0.003542）
3. **顯示付款金額**: 用戶需轉帳精確金額（如 5.003542 USDT）
4. **自動監聽**: 系統監聽 Binance 錢包餘額變化
5. **即時匹配**: 檢測到金額變化時自動匹配對應訂單
6. **立即播報**: 匹配成功後即時發送到 OBS/前端

### 技術架構

```
前端介面 (8080) ←→ API 服務器 (3001) ←→ Binance API
                    ↓
               WebSocket 即時通知
                    ↓
                OBS 瀏覽器源
```

## ⚙️ 系統配置

### 環境需求

- Node.js 18.x+
- npm 包管理器
- Binance API 金鑰（現貨交易權限）

### 安裝步驟

1. **克隆專案**
```bash
git clone <repository-url>
cd USDT_OBS
```

2. **安裝依賴**
```bash
npm install
```

3. **配置環境變數**

複製並編輯 `.env` 檔案：

```env
# Binance API 配置 (必須)
BINANCE_API_KEY=你的_API_KEY
BINANCE_API_SECRET=你的_API_SECRET

# BSC 網路配置 (備用)
BSC_RPC_URL=https://bsc-dataseed1.binance.org/
USDT_BEP20=0x55d398326f99059fF775485246999027B3197955
RECEIVE_ADDRESS=你的_BSC_錢包地址

# 系統參數
CONFIRMATIONS=12
TIME_WINDOW_MIN=30
TOLERANCE=0.001
MIN_ALERT_AMOUNT=1.00

# 服務器配置
PORT=3001
NODE_ENV=development
```

## 🖥️ 使用方法

### 1. 啟動系統

```bash
# 使用穩定版服務器（推薦）
node stable-server.js

# 或使用完整版本
npm run build
npm start
```

### 2. 啟動前端

```bash
# 開啟新終端
cd frontend
node server.js
```

### 3. 訪問前端

打開瀏覽器訪問：`http://localhost:8080`

### 4. 創建捐款

1. 輸入捐款金額（最少 1 USDT）
2. 填寫暱稱和留言（可選）
3. 點擊「創建捐款」
4. 記錄顯示的精確付款金額

### 5. 完成付款

使用 Binance 轉帳到指定地址，金額必須精確匹配系統顯示的數值。

### 6. 等待確認

系統每 10 秒檢查一次餘額變化，檢測到匹配金額會立即播報。

## 🔧 OBS 設置

### 添加瀏覽器源

1. 在 OBS 中添加「瀏覽器」源
2. **URL 設為**：`http://localhost:8080/obs` ⬅️ **專用 OBS 覆層頁面**
3. **建議尺寸**：寬度 1920，高度 1080
4. 勾選「控制音訊（透過OBS）」

### 網址分工說明

- **`http://localhost:8080`** - 抖內表單頁面（觀眾填寫捐款資訊）
- **`http://localhost:8080/obs`** - OBS 通知覆層（直播通知專用）
- **`http://localhost:3001`** - 後端 API 服務器

### OBS 通知效果

- ✨ 右上角滑入式綠色通知卡片
- 🎯 顯示捐款者暱稱、精確金額和留言
- ⏰ 自動 6 秒後消失
- 🔊 包含通知音效（可選）
- 🎨 專業視覺效果，適合直播使用

### 自訂樣式

可以修改 `frontend/obs-overlay.html` 的 CSS 來調整 OBS 通知顯示效果。

## 📡 API 文檔

### 健康檢查
```
GET /healthz
```

回應：
```json
{
  "success": true,
  "status": "healthy",
  "binanceEnabled": true,
  "balance": 123.456789,
  "uptime": 3600
}
```

### 創建捐款
```
POST /api/donations
```

請求：
```json
{
  "amount": 5,
  "nickname": "用戶名稱",
  "message": "感謝支持！"
}
```

回應：
```json
{
  "success": true,
  "data": {
    "id": "donation_xxx",
    "payAmount": 5.003542,
    "address": "0x315ece6b7ea18ea207cfed077b0f332efe397cfc",
    "expiresAt": "2025-01-15T10:30:00.000Z"
  }
}
```

### 查詢捐款
```
GET /api/donations/:id
```

## 🎯 重要配置說明

### Binance API 設置

1. **登入 Binance 帳戶**，進入 API 管理頁面
2. **創建新的 API**，僅勾選「讀取」權限（不要勾選交易權限）
3. **記錄 API Key 和 Secret**，配置到 `.env` 檔案
4. **建議使用子帳戶**，降低安全風險

### 系統參數調整

- **TOLERANCE**: 匹配容差，預設 0.001 USDT
- **TIME_WINDOW_MIN**: 訂單有效期，預設 30 分鐘
- **MIN_ALERT_AMOUNT**: 最小播報金額，預設 1 USDT

## 🔍 故障排除

### 常見問題

**Q: Binance API 連接失敗**
A: 檢查 API 金鑰權限，確保有現貨交易權限

**Q: 轉帳後沒有播報**
A: 確認轉帳金額與系統顯示完全一致（包含所有小數位）

**Q: 前端顯示連接中斷**
A: 檢查後端服務是否正常運行，瀏覽器重新整理

**Q: 系統容差設置**
A: 默認容差為 0.001 USDT，可在 .env 中調整 TOLERANCE 值

### 日誌檢查

系統會輸出詳細日誌：
- 🚀 服務器啟動
- 💼 Binance 餘額檢查  
- 📝 捐款創建
- 💰 餘額變化檢測
- 🎉 匹配成功確認

### 測試命令

```bash
# 測試 API 連通性
curl http://localhost:3001/healthz

# 測試捐款創建
curl -X POST http://localhost:3001/api/donations \
  -H "Content-Type: application/json" \
  -d '{"amount": 1, "nickname": "測試", "message": "測試捐款"}'
```

## 🛡️ 安全說明

- API 金鑰僅需現貨查詢權限，無需交易權限
- 系統不會進行任何自動交易操作
- 所有資金操作需要用戶手動完成
- 建議使用子帳戶 API 金鑰

## 📈 系統優勢

### vs 傳統方案
- ❌ 傳統：手動確認 → ✅ 本系統：自動識別
- ❌ 傳統：容易出錯 → ✅ 本系統：精確匹配
- ❌ 傳統：延遲播報 → ✅ 本系統：即時通知

### 技術亮點
- **尾數識別**: 獨特的金額識別技術
- **雙重監聽**: Binance API + 區塊鏈雙保險
- **容錯設計**: 支援無資料庫模式運行
- **即時通信**: WebSocket 零延遲通知

## 🔄 測試記錄

### 最新測試狀況 (2025-09-13)

✅ **測試完成項目**：
- 前端介面創建捐款：正常 ✓
- 尾數生成格式：6位小數 (X.00XXXX) ✓
- Binance API 連接：正常 ✓
- 餘額監聽功能：正常 ✓ 
- 轉帳檢測：成功檢測到 1.009526 USDT 轉帳 ✓
- OBS 覆層通知：專用頁面已完成 ✓
- WebSocket 實時通知：正常運作 ✓
- 系統容錯：在 API 異常時仍可運行 ✓

✅ **系統狀態**：
- 後端服務：Port 3001 運行正常
- 前端服務：Port 8080 運行正常
- 抖內表單：http://localhost:8080 ✓
- OBS 覆層：http://localhost:8080/obs ✓  
- WebSocket：連接正常
- Binance 監聽：每10秒檢查餘額變化
- 當前餘額：2.019052 USDT

✅ **OBS 整合完成**：
- 專用 OBS 覆層頁面
- 滑入式通知動畫
- 自動音效播放
- 6秒自動消失

## 📞 技術支援

如遇問題，請檢查：

1. **環境變數配置**是否正確
2. **Binance API**權限是否足夠
3. **網路連接**是否正常
4. **系統日誌**錯誤訊息

## ⚡ 快速啟動檢查清單

- [ ] Node.js 18.x+ 已安裝
- [ ] 複製並配置 `.env` 檔案
- [ ] 設置 Binance API 金鑰
- [ ] 運行 `npm install`
- [ ] 啟動後端：`node stable-server.js`
- [ ] 啟動前端：`cd frontend && node server.js`
- [ ] 測試訪問：`http://localhost:8080`
- [ ] API 健康檢查：`curl http://localhost:3001/healthz`

## 📋 系統要求

- **最小配置**: 1GB RAM, 10GB 硬碟空間
- **推薦配置**: 2GB RAM, 20GB 硬碟空間
- **網路要求**: 穩定的網際網路連接
- **API 限制**: Binance API 每分鐘 1200 次請求

## 🎪 實際使用案例

### 成功案例
- ✅ 用戶轉帳 **1.009526 USDT**，系統成功檢測餘額變化
- ✅ 前端顯示完成付款頁面  
- ✅ WebSocket 連接穩定，即時通信正常
- ✅ **OBS 覆層通知**正常顯示，直播整合成功
- ✅ 系統在 Binance API 異常時自動恢復
- ✅ 餘額從 1.009526 更新至 2.019052，多筆測試成功

### OBS 直播整合
- 🎮 **OBS 設置**：使用 `http://localhost:8080/obs` 作為瀏覽器源
- 🎯 **通知效果**：右上角滑入綠色卡片，顯示捐款資訊
- ⏰ **自動管理**：6秒後自動消失，不影響直播畫面
- 🔊 **音效支援**：可選擇是否播放通知音效

### 使用建議
1. **小額測試**：建議先用 1-2 USDT 測試完整流程
2. **OBS 測試**：先在 OBS 中設置覆層，確認通知顯示正常
3. **定期檢查**：監控系統日誌和 Binance API 狀態  
4. **備用方案**：保持 BSC 監聽功能作為備用
5. **安全實踐**：定期更換 API 金鑰，使用子帳戶

---

🎯 **系統已完全整合測試通過，可用於生產環境！**

📧 **問題回報**: 請提供完整的錯誤日誌和復現步驟

💡 **小提示**: 系統支援記憶體模式，即使沒有資料庫也能正常運行