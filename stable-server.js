require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const axios = require('axios');
const crypto = require('crypto');
const { Server } = require('socket.io');

// 最小化的捐款存儲
const donations = new Map();

// Binance API 配置
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;
const BINANCE_BASE_URL = 'https://api.binance.com';
const TOLERANCE = parseFloat(process.env.TOLERANCE || '0.001');

let lastBalance = 0;
let monitoringInterval = null;
let binanceEnabled = false;

function generateTail() {
  const randomNum = Math.floor(Math.random() * 9999) + 1;
  return randomNum / 1000000; // 0.000001-0.009999
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:8080",
    methods: ["GET", "POST"]
  }
});
const PORT = 3001;

// 中間件
app.use(cors());
app.use(express.json());

// Binance API 函數
function createSignature(queryString) {
  if (!BINANCE_API_SECRET) return '';
  return crypto
    .createHmac('sha256', BINANCE_API_SECRET)
    .update(queryString)
    .digest('hex');
}

async function getUSDTBalance() {
  try {
    if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
      return 0;
    }

    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = createSignature(queryString);
    
    const response = await axios.get(`${BINANCE_BASE_URL}/api/v3/account?${queryString}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': BINANCE_API_KEY
      },
      timeout: 10000 // 10秒超時
    });
    
    const usdtBalance = response.data.balances.find(balance => balance.asset === 'USDT');
    if (!usdtBalance) return 0;
    
    return parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked);
  } catch (error) {
    if (error.response) {
      console.error(`Binance API Error: ${error.response.status} - ${error.response.data?.msg || 'Unknown error'}`);
    } else {
      console.error('Network error:', error.message);
    }
    return lastBalance; // 返回上次的餘額，避免重複報錯
  }
}

function findMatchingDonation(amount) {
  for (const [id, donation] of donations) {
    if (donation.status === 'PENDING' && 
        new Date() < donation.expiresAt &&
        Math.abs(donation.payAmount - amount) <= TOLERANCE) {
      return donation;
    }
  }
  return null;
}

async function checkBalanceChanges() {
  if (!binanceEnabled) return;
  
  try {
    const currentBalance = await getUSDTBalance();
    
    if (currentBalance > lastBalance) {
      const increase = currentBalance - lastBalance;
      
      if (increase >= 1) { // 最小監聽金額
        console.log(`💰 Balance increase detected: +${increase} USDT (${lastBalance} → ${currentBalance})`);
        
        const donation = findMatchingDonation(increase);
        if (donation) {
          // 更新捐款狀態
          donation.status = 'CONFIRMED';
          donation.confirmedAt = new Date();
          donation.txHash = `BINANCE_${Date.now()}`;
          
          // 發送 WebSocket 通知
          io.emit('donation', {
            id: donation.id,
            nickname: donation.nickname || '匿名',
            amount: donation.payAmount,
            message: donation.message || '',
            method: 'Binance'
          });
          
          console.log(`🎉 Donation confirmed: ${donation.id} (${donation.payAmount} USDT)`);
        } else {
          console.log(`⚠️ No matching donation found for amount: ${increase}`);
        }
      }
    }
    
    if (currentBalance !== lastBalance && currentBalance > 0) {
      lastBalance = currentBalance;
    }
  } catch (error) {
    console.error('Error in balance check:', error.message);
  }
}

async function testBinanceConnection() {
  try {
    if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
      console.log('❌ Binance API credentials not provided');
      return false;
    }

    const balance = await getUSDTBalance();
    if (balance >= 0) {
      console.log(`✅ Binance API connected successfully - Balance: ${balance} USDT`);
      return true;
    } else {
      console.log('❌ Failed to get balance from Binance API');
      return false;
    }
  } catch (error) {
    console.log(`❌ Binance API connection failed: ${error.message}`);
    return false;
  }
}

async function startBinanceMonitoring() {
  const connected = await testBinanceConnection();
  if (!connected) {
    console.log('⚠️ Running without Binance monitoring');
    return false;
  }
  
  binanceEnabled = true;
  lastBalance = await getUSDTBalance();
  
  // 每10秒檢查一次餘額變化
  monitoringInterval = setInterval(checkBalanceChanges, 10000);
  console.log('🔄 Binance balance monitoring started');
  return true;
}

// 健康檢查
app.get('/healthz', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    binanceEnabled,
    balance: lastBalance,
    uptime: process.uptime()
  });
});

// 創建捐款
app.post('/api/donations', (req, res) => {
  try {
    const { amount, nickname, message } = req.body;
    
    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least 1 USDT'
      });
    }

    const id = 'donation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const tail = generateTail();
    const payAmount = parseFloat((amount + tail).toFixed(6));
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30分鐘

    const donation = {
      id,
      amount,
      payAmount,
      tail,
      nickname: nickname || null,
      message: message || null,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt
    };

    donations.set(id, donation);

    console.log(`📝 New donation created: ${id} - Pay: ${payAmount} USDT`);

    res.json({
      success: true,
      data: {
        id,
        payAmount,
        address: process.env.RECEIVE_ADDRESS || '0x315ece6b7ea18ea207cfed077b0f332efe397cfc',
        expiresAt
      }
    });
  } catch (error) {
    console.error('Error creating donation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// 查詢捐款
app.get('/api/donations/:id', (req, res) => {
  try {
    const donation = donations.get(req.params.id);
    
    if (!donation) {
      return res.status(404).json({
        success: false,
        error: 'Donation not found'
      });
    }

    res.json({
      success: true,
      data: donation
    });
  } catch (error) {
    console.error('Error fetching donation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// WebSocket 連接處理
io.on('connection', (socket) => {
  console.log(`🔌 WebSocket client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
  });
});

// 優雅關閉
process.on('SIGINT', () => {
  console.log('👋 Shutting down gracefully...');
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 USDT OBS server running on port ${PORT}`);
  console.log(`✅ API endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/healthz`);
  console.log(`   POST http://localhost:${PORT}/api/donations`);
  console.log(`   GET  http://localhost:${PORT}/api/donations/:id`);
  console.log(`🌐 Frontend: http://localhost:8080`);
  
  // 啟動 Binance 監聽
  setTimeout(async () => {
    const success = await startBinanceMonitoring();
    if (success) {
      console.log('🎯 System fully operational - ready for donations!');
    } else {
      console.log('⚠️ Running in API-only mode (Binance monitoring disabled)');
    }
    console.log(`📊 Current donations in memory: ${donations.size}`);
  }, 2000);
});