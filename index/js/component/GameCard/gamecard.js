class GameCard extends HTMLElement {
    static get observedAttributes() {
        return ['icon', 'name', 'description', 'game-id'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.render();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    getTeamVehicles() {
        const teamSettings = JSON.parse(localStorage.getItem('vehicleTeamSettings')) || { vehicles: [] };
        return (teamSettings.vehicles || []).filter(id => id && id.trim() !== '');
    }

    handleGameClick(gameId) {
        switch(gameId) {
            case 'infinity':
                window.location.href = 'game/game_one.html';
                break;
            case 'medal':
                window.location.href = 'game/game_two.html';
                break;
            default:
                window.location.href = 'game/game_one.html';
        }
    }

    render() {
        const icon = this.getAttribute('icon') || '🎮';
        const name = this.getAttribute('name') || '游戏名字';
        const description = this.getAttribute('description') || '回合制策略冒险，率领英雄挑战虚空领主。';
        const gameId = this.getAttribute('game-id') || 'default';
        
        const teamVehicles = this.getTeamVehicles();
        
        // 获取当前主题
        const theme = localStorage.getItem('currentTheme') || 'light';
        
        // 根据主题设置颜色
        const bgColor = theme === 'dark' ? '#1a1a2e' : '#fff';
        const cardShadow = theme === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)';
        const cardHoverShadow = theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)';
        const gameNameColor = theme === 'dark' ? '#fff' : '#1e2a3a';
        const gameDescColor = theme === 'dark' ? '#a0a0a0' : '#4a5568';
        const teamLabelColor = theme === 'dark' ? '#888' : '#888';
        const teamBorderColor = theme === 'dark' ? '#333' : '#eee';
        const vehicleTagBg = '#D2B48C';
        const vehicleTagColor = '#1e2a3a';
        
        console.log('GameCard icon:', icon);
        const isImage = icon.includes('.png') || icon.includes('.jpg') || icon.includes('.jpeg') || icon.includes('.gif');
        console.log('Is image:', isImage);
        
        let iconContent;
        if (isImage) {
            iconContent = `<img src="${icon}" style="width: 80px; height: 80px; object-fit: cover;">`;
            console.log('Image content:', iconContent);
        } else {
            iconContent = icon;
        }
        
        let teamHtml = '';
        if (teamVehicles.length > 0 && gameId === 'infinity') {
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
            teamHtml = `
                <div class="team-section">
                    <div class="team-label">队伍载具 (${teamVehicles.length}/2)</div>
                    <div class="team-vehicles">
                        ${teamVehicles.map((vehicleId) => {
                            return `<div class="vehicle-tag">${vehicleNames[vehicleId] || vehicleId}</div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                }
                .game-card {
                    border-radius: 12px;
                    background-color: ${bgColor};
                    padding: 18px 20px;
                    display: flex;
                    align-items: flex-start;
                    gap: 18px;
                    cursor: pointer;
                    font-family: system-ui, 'Segoe UI', sans-serif;
                    box-shadow: 0 2px 4px ${cardShadow};
                    transition: transform 0.25s ease, box-shadow 0.25s ease;
                }
                .game-card:hover {
                    transform: translateY(-6px);
                    box-shadow: 0 12px 20px ${cardHoverShadow};
                }
                .game-icon {
                    font-size: 80px;
                    line-height: 1;
                }
                .game-info {
                    flex: 1;
                }
                .game-name {
                    font-size: 26px;
                    font-weight: bold;
                    color: ${gameNameColor};
                    margin-bottom: 8px;
                    letter-spacing: 1px;
                }
                .game-description {
                    font-size: 14px;
                    color: ${gameDescColor};
                    white-space: pre-wrap;
                    line-height: 1.4;
                    margin-bottom: 12px;
                }
                .team-section {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid ${teamBorderColor};
                }
                .team-label {
                    font-size: 12px;
                    color: ${teamLabelColor};
                    margin-bottom: 8px;
                }
                .team-vehicles {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                .vehicle-tag {
                    padding: 4px 10px;
                    background: ${vehicleTagBg};
                    color: ${vehicleTagColor};
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                }
            </style>
            <div class="game-card">
                <div class="game-icon">${iconContent}</div>
                <div class="game-info">
                    <div class="game-name">${name}</div>
                    <div class="game-description">${description}</div>
                    ${teamHtml}
                </div>
            </div>
        `;
        this.shadowRoot.querySelector('.game-card').addEventListener('click', () => {
            this.handleGameClick(gameId);
        });
    }
}
customElements.define('game-card', GameCard);