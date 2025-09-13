import { Router } from 'express';
import path from 'path';

const router = Router();

// OBS 瀏覽器源碼頁面
router.get('/', (req, res) => {
  const obsHtml = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>USDT 抖內通知 - OBS</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: transparent;
            font-family: 'Microsoft JhengHei', Arial, sans-serif;
            overflow: hidden;
        }
        
        .notification {
            position: absolute;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            min-width: 350px;
            max-width: 500px;
            transform: translateX(600px);
            opacity: 0;
            transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .notification.show {
            transform: translateX(0);
            opacity: 1;
        }
        
        .notification.hide {
            transform: translateX(600px);
            opacity: 0;
        }
        
        .notification-header {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .notification-icon {
            font-size: 24px;
            margin-right: 10px;
        }
        
        .notification-title {
            font-size: 18px;
            font-weight: bold;
        }
        
        .donation-amount {
            font-size: 28px;
            font-weight: bold;
            color: #00d4ff;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .donation-info {
            margin: 8px 0;
        }
        
        .donation-nickname {
            font-size: 16px;
            font-weight: 600;
        }
        
        .donation-message {
            font-size: 14px;
            opacity: 0.9;
            margin-top: 5px;
            line-height: 1.4;
        }
        
        .donation-method {
            font-size: 12px;
            background: rgba(255, 255, 255, 0.2);
            padding: 4px 8px;
            border-radius: 4px;
            display: inline-block;
            margin-top: 8px;
        }
        
        .status {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 12px;
            opacity: 0.7;
        }
        
        .connected {
            color: #00d4ff;
        }
        
        .disconnected {
            color: #ff4444;
        }
    </style>
</head>
<body>
    <div class="status" id="status">
        <span id="connectionStatus" class="disconnected">連接中...</span>
    </div>
    
    <!-- 通知容器 -->
    <div id="notificationContainer"></div>
    
    <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
    <script>
        let socket = null;
        let notificationCount = 0;
        
        // 連接 WebSocket
        function connectWebSocket() {
            socket = io('http://localhost:3000', {
                transports: ['websocket', 'polling']
            });
            
            socket.on('connect', () => {
                console.log('WebSocket 已連接:', socket.id);
                updateStatus('已連接', true);
                socket.emit('join_room', 'obs');
            });
            
            socket.on('disconnect', () => {
                console.log('WebSocket 已斷線');
                updateStatus('連接中斷', false);
                // 3秒後重新連接
                setTimeout(connectWebSocket, 3000);
            });
            
            socket.on('connect_error', (error) => {
                console.error('WebSocket 連接錯誤:', error);
                updateStatus('連接失敗', false);
                setTimeout(connectWebSocket, 5000);
            });
            
            // 監聽捐贈事件
            socket.on('donation', (event) => {
                console.log('收到捐贈通知:', event);
                showDonationNotification(event.data);
            });
            
            socket.on('joined', (data) => {
                console.log('加入房間:', data.room);
            });
        }
        
        // 更新連接狀態
        function updateStatus(message, connected) {
            const statusEl = document.getElementById('connectionStatus');
            statusEl.textContent = message;
            statusEl.className = connected ? 'connected' : 'disconnected';
        }
        
        // 顯示捐贈通知
        function showDonationNotification(donation) {
            const container = document.getElementById('notificationContainer');
            const notification = createNotificationElement(donation);
            
            container.appendChild(notification);
            
            // 觸發顯示動畫
            setTimeout(() => {
                notification.classList.add('show');
            }, 100);
            
            // 語音播報 (如果有留言)
            if (donation.message && donation.message.trim()) {
                speakMessage(\`感謝 \${donation.nickname} 的 \${donation.amount} USDT 抖內！留言：\${donation.message}\`);
            } else {
                speakMessage(\`感謝 \${donation.nickname} 的 \${donation.amount} USDT 抖內！\`);
            }
            
            // 5秒後隱藏
            setTimeout(() => {
                notification.classList.remove('show');
                notification.classList.add('hide');
                
                // 動畫完成後移除元素
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 500);
            }, 5000);
        }
        
        // 創建通知元素
        function createNotificationElement(donation) {
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.style.top = \`\${20 + (notificationCount * 10)}px\`;
            
            const methodName = donation.method === 'BSC' ? 'BSC 鏈上轉帳' : '幣安內轉';
            
            notification.innerHTML = \`
                <div class="notification-header">
                    <span class="notification-icon">💰</span>
                    <span class="notification-title">收到抖內！</span>
                </div>
                <div class="donation-amount">\${donation.amount} USDT</div>
                <div class="donation-info">
                    <div class="donation-nickname">來自：\${donation.nickname}</div>
                    \${donation.message ? \`<div class="donation-message">\${donation.message}</div>\` : ''}
                    <div class="donation-method">\${methodName}</div>
                </div>
            \`;
            
            notificationCount++;
            return notification;
        }
        
        // 語音播報
        function speakMessage(text) {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'zh-TW';
                utterance.rate = 0.9;
                utterance.volume = 0.8;
                speechSynthesis.speak(utterance);
            }
        }
        
        // 初始化
        connectWebSocket();
    </script>
</body>
</html>
  `;
  
  res.send(obsHtml);
});

export default router;