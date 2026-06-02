// 自定义提示框组件
class CustomModal {
    constructor() {
        this.initStyles();
    }

    // 初始化样式
    initStyles() {
        if (document.getElementById('custom-modal-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'custom-modal-styles';
        style.textContent = `
            @keyframes customModalFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes customModalSlideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .custom-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                animation: customModalFadeIn 0.2s ease;
            }
            .custom-modal-content {
                border-radius: 20px;
                padding: 30px 40px;
                max-width: 400px;
                width: 90%;
                text-align: center;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                animation: customModalSlideUp 0.3s ease;
                border: 2px solid rgba(255, 255, 255, 0.8);
                background: url('../img/card_img/alter.jpg') center center / cover no-repeat;
            }
            .custom-modal-icon {
                font-size: 48px;
                margin-bottom: 15px;
            }
            .custom-modal-message {
                color: #333;
                font-size: 16px;
                line-height: 1.6;
            }
            .custom-modal-button {
                margin-top: 20px;
                padding: 12px 30px;
                background: #D2B48C;
                color: white;
                border: none;
                border-radius: 30px;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s;
                font-weight: bold;
            }
            .custom-modal-button:hover {
                background: #E6C200;
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
            }
            .custom-modal-button.cancel {
                background: #e0e0e0;
                color: #333;
            }
            .custom-modal-button.cancel:hover {
                background: #bdbdbd;
                box-shadow: none;
            }
            .custom-modal-buttons {
                margin-top: 20px;
                display: flex;
                gap: 15px;
                justify-content: center;
            }
        `;
        document.head.appendChild(style);
    }

    // 提示框类型配置
    getTypeConfig(type) {
        const configs = {
            info: {
                icon: '<i class="fas fa-info-circle" style="color: #4CAF50;"></i>',
                bg: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)'
            },
            error: {
                icon: '<i class="fas fa-exclamation-circle" style="color: #f44336;"></i>',
                bg: 'linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)'
            },
            warning: {
                icon: '<i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i>',
                bg: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)'
            },
            success: {
                icon: '<i class="fas fa-check-circle" style="color: #2196F3;"></i>',
                bg: 'linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)'
            },
            confirm: {
                icon: '<i class="fas fa-question-circle" style="color: #ff9800;"></i>',
                bg: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)'
            }
        };
        return configs[type] || configs.info;
    }

    // 显示提示框
    alert(message, type = 'info') {
        return new Promise((resolve) => {
            const config = this.getTypeConfig(type);
            const overlay = document.createElement('div');
            overlay.className = 'custom-modal-overlay';

            overlay.innerHTML = `
                <div class="custom-modal-content">
                    <div class="custom-modal-icon">${config.icon}</div>
                    <div class="custom-modal-message">${message}</div>
                    <button class="custom-modal-button ok-btn">
                        确定
                    </button>
                </div>
            `;

            // 使用事件监听器代替内联onclick
            const okBtn = overlay.querySelector('.ok-btn');
            okBtn.onclick = () => {
                overlay.remove();
                resolve();
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve();
                }
            });

            document.body.appendChild(overlay);
        });
    }

    // 显示确认框
    confirm(message) {
        return new Promise((resolve) => {
            const config = this.getTypeConfig('confirm');
            const overlay = document.createElement('div');
            overlay.className = 'custom-modal-overlay';

            overlay.innerHTML = `
                <div class="custom-modal-content">
                    <div class="custom-modal-icon">${config.icon}</div>
                    <div class="custom-modal-message">${message}</div>
                    <div class="custom-modal-buttons">
                        <button class="custom-modal-button confirm-btn">
                            确定
                        </button>
                        <button class="custom-modal-button cancel cancel-btn">
                            取消
                        </button>
                    </div>
                </div>
            `;

            // 使用事件监听器代替内联onclick
            const confirmBtn = overlay.querySelector('.confirm-btn');
            const cancelBtn = overlay.querySelector('.cancel-btn');

            confirmBtn.onclick = () => {
                overlay.remove();
                resolve(true);
            };

            cancelBtn.onclick = () => {
                overlay.remove();
                resolve(false);
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve(false);
                }
            });

            document.body.appendChild(overlay);
        });
    }

    // 快捷方法
    info(message) {
        return this.alert(message, 'info');
    }

    error(message) {
        return this.alert(message, 'error');
    }

    warning(message) {
        return this.alert(message, 'warning');
    }

    success(message) {
        return this.alert(message, 'success');
    }
}

// 创建全局实例
const modal = new CustomModal();

// 为了兼容旧代码，也暴露全局函数
window.showCustomAlert = (message, type) => modal.alert(message, type);
window.showCustomConfirm = (message) => modal.confirm(message);