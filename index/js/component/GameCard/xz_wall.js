class XzWall extends HTMLElement {
    static get observedAttributes() {
        return ['achievement-id'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.render();
        this.previousDataHash = null;
        setTimeout(() => {
            this.loadAchievement();
            setInterval(() => this.checkDataChange(), 500);
        }, 100);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'achievement-id' && oldValue !== newValue) {
            this.loadAchievement();
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .effect-shine {
                    position: relative;
                    overflow: hidden;
                }
                .effect-shine::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -75%;
                    width: 50%;
                    height: 100%;
                    background: linear-gradient(90deg,
                        rgba(255,255,255,0) 0%,
                        rgba(255,255,255,0.5) 50%,
                        rgba(255,255,255,0) 100%);
                    transform: skewX(-20deg);
                    transition: left 0.55s cubic-bezier(0.2, 0.9, 0.4, 1.1);
                    pointer-events: none;
                }
                .effect-shine:hover::after {
                    left: 125%;
                }
                .effect-pulse {
                    transition: box-shadow 0.2s;
                }
                .effect-pulse:hover {
                    animation: pulseRing 0.7s ease-out 2;
                    box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.7);
                }
                @keyframes pulseRing {
                    0% {
                        box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.7);
                    }
                    70% {
                        box-shadow: 0 0 0 14px rgba(212, 175, 55, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(212, 175, 55, 0);
                    }
                }
                .effect-float {
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                .effect-float:hover {
                    transform: translateY(-8px);
                    box-shadow: 0 30px 35px -12px rgba(0, 0, 0, 0.5);
                }
                .medal-standalone {
                    background: #1e2024;
                    border: 1px solid #5a5d64;
                    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5);
                    width: 160px;
                    height: 260px;
                    margin: 0;
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    flex-shrink: 0;
                }
                .medal-card {
                    background: #2a2c2f;
                    border: 1px solid #b1975c;
                    padding: 1.2rem 0.5rem 1rem;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                }
                .medal-icon {
                    width: 70px;
                    height: 70px;
                    background: #1f2125;
                    border-radius: 0px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 3rem;
                    border: 2px solid #c4a35a;
                    box-shadow: inset 0 1px 3px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.3);
                    margin-bottom: 0.2rem;
                }
                .medal-name {
                    font-weight: 700;
                    font-size: 1rem;
                    letter-spacing: 1px;
                    color: #e2dfc7;
                    background: rgba(0,0,0,0.4);
                    padding: 0.2rem 0.5rem;
                    font-family: 'Segoe UI', 'Impact', serif;
                    white-space: nowrap;
                }
                .medal-sub {
                    font-size: 0.58rem;
                    color: #b8b08a;
                    letter-spacing: 0.5px;
                    font-family: monospace;
                    text-transform: uppercase;
                    white-space: nowrap;
                }
                .status-mark {
                    margin-top: 0.2rem;
                    font-size: 0.8rem;
                    color: #e6c87a;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 500;
                    flex-direction: column;
                }
                .status-mark > div {
                    margin: 2px 0;
                    text-align: center;
                }
                .divider {
                    width: 40px;
                    height: 1px;
                    background: #7e7c6e;
                    margin: 0.2rem 0;
                }
            </style>
            <div class="medal-standalone effect-shine effect-pulse effect-float">
                <div class="medal-card">
                    <div class="medal-icon">
                        ⭐
                    </div>
                    <div class="medal-name">加载中...</div>
                    <div class="medal-sub">LOADING</div>
                    <div class="divider"></div>
                    <div class="status-mark">
                        <span>✨</span> 加载中 <span>✨</span>
                    </div>
                </div>
            </div>
        `;
    }

    loadAchievement() {
        try {
            const achievementId = this.getAttribute('achievement-id') || 'first_try';

            if (typeof achievementData !== 'undefined') {
                let targetAchievement = null;
                Object.values(achievementData.achievementGroups).forEach(group => {
                    const found = group.achievements.find(ach => ach.id === achievementId);
                    if (found) targetAchievement = found;
                });

                if (!targetAchievement) {
                    Object.values(achievementData.achievementGroups).forEach(group => {
                        const found = group.achievements.find(ach => ach.id === 'first_try');
                        if (found) targetAchievement = found;
                    });
                }

                if (targetAchievement) {
                    this.shadowRoot.querySelector('.medal-name').textContent = targetAchievement.name;
                    this.shadowRoot.querySelector('.medal-sub').textContent = targetAchievement.english_name || '';

                    const medalIcon = this.shadowRoot.querySelector('.medal-icon');
                    if (targetAchievement.icon) {
                        if (targetAchievement.icon.startsWith('http') || targetAchievement.icon.startsWith('data:')) {
                            medalIcon.innerHTML = `<img src="${targetAchievement.icon}" style="width: 60px; height: 60px; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='⭐'">`;
                        } else {
                            medalIcon.innerHTML = `<img src="../img/key/${targetAchievement.icon}.png" style="width: 60px; height: 60px; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='⭐'">`;
                        }
                    }

                    const statusMark = this.shadowRoot.querySelector('.status-mark');
                    let statusText = '';
                    const descriptions = [];

                    if (targetAchievement.description && targetAchievement.description.trim() !== '') {
                        descriptions.push(targetAchievement.description.trim());
                    }

                    if (targetAchievement.description2 && targetAchievement.description2.trim() !== '') {
                        descriptions.push(targetAchievement.description2.trim());
                    }

                    if (targetAchievement.description3 && targetAchievement.description3.trim() !== '') {
                        descriptions.push(targetAchievement.description3.trim());
                    }

                    if (descriptions.length > 0) {
                        statusText = descriptions.map(desc => `<div>${desc}</div>`).join('');
                        statusMark.innerHTML = `<span>✨</span>${statusText}<span>✨</span>`;
                    } else {
                        statusMark.innerHTML = `<span>✨</span><div>无描述</div><span>✨</span>`;
                    }
                }
            } else {
                const firstTry = {
                    "id": "first_try",
                    "name": "初来乍到",
                    "english_name": "NEWCOMER'S HONOR",
                    "description": "第一次打开此游戏",
                    "description2": "",
                    "description3": ""
                };

                this.shadowRoot.querySelector('.medal-name').textContent = firstTry.name;
                this.shadowRoot.querySelector('.medal-sub').textContent = firstTry.english_name || '';

                const statusMark = this.shadowRoot.querySelector('.status-mark');
                let statusText = '';
                const descriptions = [];

                if (firstTry.description && firstTry.description.trim() !== '') {
                    descriptions.push(firstTry.description.trim());
                }

                if (firstTry.description2 && firstTry.description2.trim() !== '') {
                    descriptions.push(firstTry.description2.trim());
                }

                if (firstTry.description3 && firstTry.description3.trim() !== '') {
                    descriptions.push(firstTry.description3.trim());
                }

                if (descriptions.length > 0) {
                    statusText = descriptions.map(desc => `<div>${desc}</div>`).join('');
                    statusMark.innerHTML = `<span>✨</span>${statusText}<span>✨</span>`;
                } else {
                    statusMark.innerHTML = `<span>✨</span><div>无描述</div><span>✨</span>`;
                }
            }
        } catch (error) {
            console.error('加载成就数据失败:', error);
        }
    }

    checkDataChange() {
        try {
            if (typeof achievementData !== 'undefined') {
                const currentDataHash = JSON.stringify(achievementData);

                if (currentDataHash !== this.previousDataHash) {
                    this.previousDataHash = currentDataHash;
                    this.loadAchievement();
                }
            }
        } catch (error) {
            console.error('检查数据变化失败:', error);
        }
    }
}

customElements.define('xz-wall', XzWall);