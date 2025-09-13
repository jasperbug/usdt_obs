// USDT 抖內系統前端應用程式 - 尾數識別版本
class DonationApp {
    constructor() {
        this.apiBase = 'http://localhost:3001/api';
        this.wsUrl = 'http://localhost:3001';
        this.socket = null;
        this.currentDonation = null;
        this.statusCheckInterval = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        this.initializeEventListeners();
        this.initializeWebSocket();
        this.updateConnectionStatus('connecting');
    }

    // 事件監聽器初始化
    initializeEventListeners() {
        // 快速金額選擇
        document.querySelectorAll('.quick-amount').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const amount = e.target.dataset.amount;
                document.getElementById('amount').value = amount;
                this.updateAmountDisplay();
            });
        });

        // 留言字數統計
        const messageInput = document.getElementById('message');
        const messageCount = document.getElementById('messageCount');
        messageInput.addEventListener('input', () => {
            messageCount.textContent = messageInput.value.length;
        });

        // 表單提交
        document.getElementById('donationFormElement').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        // 返回按鈕
        document.getElementById('backBtn')?.addEventListener('click', () => {
            this.showDonationForm();
        });

        // 重新整理按鈕
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.refreshPaymentStatus();
        });

        // 新抖內按鈕
        document.getElementById('newDonationBtn')?.addEventListener('click', () => {
            this.resetForm();
            this.showDonationForm();
        });
    }

    // WebSocket 初始化
    initializeWebSocket() {
        try {
            this.socket = io(this.wsUrl);

            this.socket.on('connect', () => {
                console.log('WebSocket 連接成功');
                this.updateConnectionStatus('connected');
            });

            this.socket.on('disconnect', () => {
                console.log('WebSocket 連接中斷');
                this.updateConnectionStatus('disconnected');
            });

            this.socket.on('connect_error', (error) => {
                console.error('WebSocket 連接錯誤:', error);
                this.updateConnectionStatus('error');
            });

            this.socket.on('donation', (data) => {
                // 顯示 OBS 通知
                this.showOBSNotification(data);
                
                if (this.currentDonation && data.id === this.currentDonation.id) {
                    this.handleDonationConfirmed(data);
                }
            });

        } catch (error) {
            console.error('WebSocket 初始化失敗:', error);
            this.updateConnectionStatus('error');
        }
    }

    // 更新連接狀態
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        
        statusElement.className = 'status-indicator';
        
        switch (status) {
            case 'connecting':
                statusElement.classList.add('connecting');
                statusElement.innerHTML = '<i class="fas fa-circle"></i> 連接中...';
                break;
            case 'connected':
                statusElement.classList.add('connected');
                statusElement.innerHTML = '<i class="fas fa-circle"></i> 已連接';
                break;
            case 'disconnected':
            case 'error':
                statusElement.classList.add('disconnected');
                statusElement.innerHTML = '<i class="fas fa-circle"></i> 連接中斷';
                break;
        }
    }

    // 更新金額顯示
    updateAmountDisplay() {
        const amountInput = document.getElementById('amount');
        const amount = parseFloat(amountInput.value);
        
        // 移除所有快速選擇按鈕的 active 狀態
        document.querySelectorAll('.quick-amount').forEach(btn => {
            btn.classList.remove('active');
            if (parseFloat(btn.dataset.amount) === amount) {
                btn.classList.add('active');
            }
        });
    }

    // 獲取表單資料
    getFormData() {
        return {
            amount: parseFloat(document.getElementById('amount').value),
            nickname: document.getElementById('nickname').value.trim() || null,
            message: document.getElementById('message').value.trim() || null
        };
    }

    // 驗證表單資料
    validateFormData(data) {
        if (!data.amount || data.amount < 1) {
            this.showError('金額必須至少 1 USDT');
            return false;
        }
        
        if (data.amount > 10000) {
            this.showError('金額不能超過 10,000 USDT');
            return false;
        }

        return true;
    }

    // 表單提交處理
    async handleFormSubmit() {
        const formData = this.getFormData();
        
        if (!this.validateFormData(formData)) {
            return;
        }

        this.setLoading(true);
        
        try {
            const response = await fetch(`${this.apiBase}/donations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '創建抖內失敗');
            }

            this.currentDonation = result.data;
            this.showPaymentInstructions(result.data);
            this.startStatusChecking();
            this.updateStepIndicator(2);

        } catch (error) {
            console.error('抖內創建錯誤:', error);
            this.showError(error.message || '創建抖內時發生錯誤，請稍後再試');
        } finally {
            this.setLoading(false);
        }
    }

    // 顯示付款指示
    showPaymentInstructions(donation) {
        // 隱藏表單，顯示付款指示
        document.getElementById('donationForm').classList.add('hidden');
        document.getElementById('paymentInstructions').classList.remove('hidden');

        // 更新捐贈摘要
        const summaryElement = document.getElementById('donationSummary');
        summaryElement.innerHTML = `
            <div class="summary-item">
                <span>抖內金額:</span>
                <strong>${donation.payAmount.toFixed(6)} USDT</strong>
            </div>
            <div class="summary-item">
                <span>暱稱:</span>
                <span>${this.getFormData().nickname || '匿名'}</span>
            </div>
        `;

        // 更新付款信息
        const paymentInfoElement = document.getElementById('paymentInfo');
        const expiresAt = new Date(donation.expiresAt);
        const remainingMinutes = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000));

        paymentInfoElement.innerHTML = `
            <div class="payment-method-detail">
                <h3><i class="fas fa-info-circle"></i> BSC 鏈上轉帳指引</h3>
                <div class="payment-instructions">
                    <div class="instruction-item">
                        <h4>1. 精確轉帳金額</h4>
                        <div class="amount-display">
                            <strong>${donation.payAmount.toFixed(6)} USDT</strong>
                            <button class="copy-btn" onclick="navigator.clipboard.writeText('${donation.payAmount.toFixed(6)}')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <p><strong>必須精確到小數點後六位</strong>，系統通過尾數識別您的抖內</p>
                    </div>
                    
                    <div class="instruction-item">
                        <h4>2. 收款地址</h4>
                        <div class="address-display">
                            <span class="address">${donation.address}</span>
                            <button class="copy-btn" onclick="navigator.clipboard.writeText('${donation.address}')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <p>請使用 BSC (BEP-20) 網路轉帳 USDT</p>
                    </div>
                    
                    <div class="instruction-item">
                        <h4>3. 使用錢包轉帳</h4>
                        <p>建議使用 MetaMask、Trust Wallet、OKX 等錢包進行鏈上轉帳</p>
                        <p><strong>注意：</strong>交易所提幣通常只支持兩位小數，無法使用此頁面的六位尾數識別</p>
                    </div>
                    
                    <div class="instruction-item">
                        <h4>4. 完成轉帳</h4>
                        <p>轉帳成功入塊後，畫面將立即顯示並播報，無需手動提交交易序號</p>
                    </div>
                </div>
                
                <div class="expiry-info">
                    <i class="fas fa-clock"></i>
                    <span>此訂單將在 ${remainingMinutes} 分鐘後過期</span>
                </div>
            </div>
        `;

        this.updatePaymentStatus('pending', '等待付款中...', '請按照上方指示完成 BSC 鏈上轉帳');
    }

    // 更新付款狀態
    updatePaymentStatus(status, title, message, showSuccess = false) {
        const statusElement = document.getElementById('paymentStatus');
        const statusIcon = statusElement.querySelector('.status-icon i');
        const statusTitle = statusElement.querySelector('.status-text h3');
        const statusMessage = statusElement.querySelector('.status-text p');

        statusElement.className = 'status-indicator-large';
        
        switch (status) {
            case 'pending':
                statusElement.classList.add('pending');
                statusIcon.className = 'fas fa-clock';
                break;
            case 'confirming':
                statusElement.classList.add('confirming');
                statusIcon.className = 'fas fa-spinner fa-spin';
                break;
            case 'confirmed':
                statusElement.classList.add('confirmed');
                statusIcon.className = 'fas fa-check-circle';
                if (showSuccess) {
                    setTimeout(() => this.showSuccessMessage(), 2000);
                }
                break;
            case 'expired':
                statusElement.classList.add('expired');
                statusIcon.className = 'fas fa-times-circle';
                break;
        }

        statusTitle.textContent = title;
        statusMessage.textContent = message;
    }

    // 開始狀態檢查
    startStatusChecking() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }

        this.statusCheckInterval = setInterval(() => {
            this.checkDonationStatus();
        }, 5000); // 每 5 秒檢查一次
    }

    // 檢查抖內狀態
    async checkDonationStatus() {
        if (!this.currentDonation) return;

        try {
            const response = await fetch(`${this.apiBase}/donations/${this.currentDonation.id}`);
            const result = await response.json();

            if (response.ok && result.data) {
                const donation = result.data;
                
                if (donation.status === 'PENDING_SHOWN') {
                    this.updatePaymentStatus('confirming', '交易檢測到！', '等待區塊確認中...');
                } else if (donation.status === 'CONFIRMED') {
                    this.updatePaymentStatus('confirmed', '付款成功！', '感謝您的抖內支持！', true);
                    this.updateStepIndicator(3);
                    clearInterval(this.statusCheckInterval);
                } else if (donation.status === 'EXPIRED') {
                    this.updatePaymentStatus('expired', '訂單已過期', '請重新創建抖內訂單');
                    clearInterval(this.statusCheckInterval);
                }
            }
        } catch (error) {
            console.error('狀態檢查錯誤:', error);
        }
    }

    // 重新整理付款狀態
    refreshPaymentStatus() {
        if (this.currentDonation) {
            this.checkDonationStatus();
        }
    }

    // WebSocket 抖內確認處理
    handleDonationConfirmed(data) {
        console.log('收到抖內確認:', data);
        this.updatePaymentStatus('confirmed', '付款成功！', '感謝您的抖內支持！', true);
        this.updateStepIndicator(3);
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
    }

    // 顯示成功訊息
    showSuccessMessage() {
        document.getElementById('paymentInstructions').classList.add('hidden');
        document.getElementById('successMessage').classList.remove('hidden');
    }

    // 顯示抖內表單
    showDonationForm() {
        document.getElementById('paymentInstructions').classList.add('hidden');
        document.getElementById('successMessage').classList.add('hidden');
        document.getElementById('donationForm').classList.remove('hidden');
        this.updateStepIndicator(1);
        
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
        }
    }

    // 重置表單
    resetForm() {
        document.getElementById('donationFormElement').reset();
        document.getElementById('messageCount').textContent = '0';
        document.querySelectorAll('.quick-amount').forEach(btn => btn.classList.remove('active'));
        this.currentDonation = null;
    }

    // 更新步驟指示器
    updateStepIndicator(activeStep) {
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNumber = index + 1;
            step.classList.remove('active', 'completed');
            
            if (stepNumber < activeStep) {
                step.classList.add('completed');
            } else if (stepNumber === activeStep) {
                step.classList.add('active');
            }
        });
    }

    // 設定載入狀態
    setLoading(loading) {
        const submitBtn = document.getElementById('submitBtn');
        const btnLoader = document.getElementById('btnLoader');
        const btnText = submitBtn.querySelector('span');

        if (loading) {
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            btnLoader.style.display = 'block';
            btnText.textContent = '處理中...';
        } else {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            btnLoader.style.display = 'none';
            btnText.textContent = '送出抖內';
        }
    }

    // 顯示錯誤訊息
    showError(message) {
        // 簡單的錯誤顯示，您可以改為更好看的 modal 或 toast
        alert(message);
    }

    // 顯示 OBS 通知
    showOBSNotification(data) {
        console.log('🎉 顯示 OBS 通知:', data);
        
        // 移除現有通知
        const existingNotification = document.querySelector('.obs-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // 創建通知元素
        const notification = document.createElement('div');
        notification.className = 'obs-notification';
        
        const nickname = data.nickname || '匿名';
        const amount = typeof data.amount === 'number' ? data.amount.toFixed(6) : data.amount;
        const message = data.message || '';
        const method = data.method || 'USDT';
        
        notification.innerHTML = `
            <div class="obs-notification-header">
                <div class="obs-notification-icon">🎉</div>
                <div class="obs-notification-title">收到抖內！</div>
            </div>
            <div class="obs-notification-content">
                <div class="obs-notification-nickname">${nickname}</div>
                <div class="obs-notification-amount">💰 ${amount} USDT</div>
                ${message ? `<div class="obs-notification-message">"${message}"</div>` : ''}
                <div class="obs-notification-method">透過 ${method}</div>
            </div>
        `;
        
        // 添加到頁面
        document.body.appendChild(notification);
        
        // 顯示動畫
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 播放音效（如果有的話）
        this.playNotificationSound();
        
        // 5秒後自動隱藏
        setTimeout(() => {
            notification.classList.remove('show');
            notification.classList.add('hide');
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 5000);
    }

    // 播放通知音效
    playNotificationSound() {
        try {
            // 創建音效（如果需要）
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvGUrBSl+ze7NdygCCJfnmWPMriT4k8C6j2oNJCjJbS5yxBUwk8C6kHoOJChUw7+kCyjS8gVGFmtdZfJqSRdQM8Xm+g==');
            audio.volume = 0.3;
            audio.play().catch(() => {
                // 忽略音效播放失敗
                console.log('音效播放被瀏覽器阻擋（正常現象）');
            });
        } catch (error) {
            // 忽略音效相關錯誤
        }
    }
}

// 當頁面載入完成後初始化應用程式
document.addEventListener('DOMContentLoaded', () => {
    new DonationApp();
});