// 定义WinLoCard自定义元素
class WinLoCard extends HTMLElement {
    constructor() {
        super();
        // 创建shadow DOM
        this.attachShadow({ mode: 'open' });

        // 获取属性值
        this.result = this.getAttribute('result') || '胜利';
        this.time = this.getAttribute('time') || '23m20s';
        this.currency = Math.floor(parseFloat(this.getAttribute('currency') || '0')).toString();
        this.mode = this.getAttribute('mode') || '排位赛';
        this.vehicles = this.getAttribute('vehicles') || '';

        // 渲染组件
        this.render();
    }

    render() {
        // 样式
        const style = `
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            .preference-card {
                background: rgba(255, 255, 255, 0.7);
                backdrop-filter: blur(2px);
                border-radius: 2rem;
                box-shadow: 0 20px 35px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
                padding: 1rem 1rem;
                width: 100%;
                max-width: 90vw;
                transition: all 0.2s ease;
                border: 1px solid rgba(255, 255, 255, 0.6);
                position: relative;
                overflow: hidden;
            }

            /* 响应式 */
            @media (max-width: 560px) {
                .preference-card {
                    min-width: 280px;
                    padding: 0.9rem 0.8rem;
                }
                .preference-card .custom-border-bar {
                    width: calc(100% + 1.6rem);
                    margin: -0.9rem -0.8rem 1rem -0.8rem;
                }
                .stats-grid {
                    gap: 0.4rem;
                }
                .stat-value {
                    font-size: 0.9rem;
                }
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(40px, 1fr));
                gap: 0.4rem;
                align-items: start;
            }

            .stat-item {
                text-align: center;
                display: flex;
                flex-direction: column;
            }

            .stat-label {
                font-size: 0.7rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #2c4a3e;
                background: rgba(74, 184, 160, 0.15);
                display: inline-block;
                align-self: center;
                padding: 0.2rem 0.8rem;
                border-radius: 30px;
                backdrop-filter: blur(2px);
            }

            .stat-value {
                font-size: 10px;
                font-weight: 800;
                color: #1f2c24;
                line-height: 1.3;
                word-break: keep-all;
                white-space: nowrap;
            }

            .stat-value.victory {
                color: #2b7c64;
                text-shadow: 0 0 2px rgba(74,184,160,0.2);
            }
            .stat-value.defeat {
                color: #c25b4a;
            }

            .time-digits {
                font-family: 'JetBrains Mono', monospace, 'Inter';
                letter-spacing: 0.5px;
            }

            .currency-amount {
                font-weight: 800;
            }

            .mode-name {
                font-weight: 800;
                background: linear-gradient(135deg, #1f4e42, #2b7c64);
                background-clip: text;
                -webkit-background-clip: text;
                color: transparent;
            }

            .preference-card .custom-border-bar {
                width: calc(100% + 2rem);
                height: 10px;
                background-color: #000;
                position: relative;
                overflow: hidden;
                margin: -1rem -1rem 1rem -1rem;
            }

            .preference-card .custom-border-bar::before,
            .preference-card .custom-border-bar::after {
                content: '';
                position: absolute;
                left: 30%;
                width: 10%;
                height: 100%;
                background: linear-gradient(135deg, #4ecdc4, #a8e6cf);
            }

            .preference-card .custom-border-bar::before {
                transform: skewX(-45deg);
            }

            .preference-card .custom-border-bar::after {
                transform: skewX(45deg);
                opacity: 0.8;
                box-shadow: 0 0 0 10px #D2B48C;
                z-index: 2;
            }

            .stat-value, .stat-label {
                font-style: normal;
            }

            .vehicles-section {
                margin-top: 1rem;
                padding-top: 1rem;
                border-top: 1px solid rgba(74, 184, 160, 0.3);
            }

            .vehicles-label {
                font-size: 0.65rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #2c4a3e;
                margin-bottom: 0.5rem;
                text-align: center;
            }

            .vehicles-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 0.3rem;
                justify-content: center;
            }

            .vehicle-tag {
                padding: 0.2rem 0.5rem;
                background: #D2B48C;
                color: #1e2a3a;
                border-radius: 8px;
                font-size: 9px;
                font-weight: 600;
            }
        `;

        // 解析载具数据（兼容新格式数组和旧格式字符串）
        let vehiclesHtml = '';
        if (this.vehicles) {
            const vehicleNames = {
                'vehicle_1': 'T-80BVM',
                'vehicle_2': 'T90M',
                'vehicle_3': 'T-72B3A',
                'vehicle_4': '豹2A7V',
                'vehicle_5': 'M1A2',
                'vehicle_6': 'M3A3布兰德利',
                'vehicle_7': '挑战者2',
                'vehicle_8': 'PzH2000',
                'vehicle_9': 'PLZ-05',
                'vehicle_10': 'EF2000',
                'vehicle_11': 'F-15E',
                'vehicle_12': 'Su-30SM',
                'vehicle_13': 'J-15T',
                'vehicle_14': 'J-11B',
                'vehicle_15': 'J-10C',
                'vehicle_16': 'JAS-39C',
                'vehicle_17': '阵风',
                'vehicle_18': 'F-16I',
                'vehicle_19': 'A-10C',
                'vehicle_20': 'AC-130'
            };
            
            let vehicleList = [];
            
            // 尝试解析vehicles属性（可能是字符串或JSON数组）
            if (this.vehicles.startsWith('[')) {
                // 新格式：JSON数组字符串
                try {
                    const vehiclesArray = JSON.parse(this.vehicles);
                    vehicleList = vehiclesArray.map(v => v.name || vehicleNames[v.id] || v.id);
                } catch (e) {
                    // 解析失败，尝试按旧格式处理
                    vehicleList = this.vehicles.split(',');
                }
            } else if (this.vehicles.startsWith('{')) {
                // 新格式：单个载具JSON对象
                try {
                    const vehicleObj = JSON.parse(this.vehicles);
                    vehicleList = [vehicleObj.name || vehicleNames[vehicleObj.id] || vehicleObj.id];
                } catch (e) {
                    vehicleList = this.vehicles.split(',');
                }
            } else {
                // 旧格式：逗号分隔的字符串
                vehicleList = this.vehicles.split(',');
            }
            
            // 如果解析后是对象数组，提取名称
            if (vehicleList.length > 0 && typeof vehicleList[0] === 'object') {
                vehicleList = vehicleList.map(v => v.name || vehicleNames[v.id] || v.id);
            }
            
            // 映射到显示名称（如果已经是名称则直接使用，否则查找映射）
            vehicleList = vehicleList.map(v => {
                // 如果已经是完整名称（包含字母且长度大于3），直接使用
                if (/^[A-Za-z0-9\u4e00-\u9fa5]+/.test(v) && v.length > 3) {
                    // 检查是否是载具ID（以vehicle_开头）
                    if (v.startsWith('vehicle_')) {
                        return vehicleNames[v] || v;
                    }
                    return v; // 已经是名称
                }
                return vehicleNames[v] || v;
            });
            
            vehiclesHtml = `
                <div class="vehicles-section">
                    <div class="vehicles-label">载具队列</div>
                    <div class="vehicles-tags">
                        ${vehicleList.map(v => `<span class="vehicle-tag">${v}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // HTML模板
        const html = `
            <div class="preference-card">
                <div class="custom-border-bar"></div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-label">战果</div>
                        <div class="stat-value ${this.result === '胜利' ? 'victory' : 'defeat'}">${this.result}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">时长</div>
                        <div class="stat-value time-digits">${this.time}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">货币</div>
                        <div class="stat-value currency-amount">${this.currency}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">偏好</div>
                        <div class="stat-value mode-name">${this.mode}</div>
                    </div>
                </div>
                ${vehiclesHtml}
            </div>
        `;

        // 渲染到shadow DOM
        this.shadowRoot.innerHTML = `<style>${style}</style>${html}`;
    }

    // 当属性变化时更新组件
    static get observedAttributes() {
        return ['result', 'time', 'currency', 'mode', 'vehicles'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this[name] = newValue;
            this.render();
        }
    }
}

// 注册自定义元素
customElements.define('win-lo-card', WinLoCard);