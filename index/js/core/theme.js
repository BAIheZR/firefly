// 背景音乐播放器 - 使用 localStorage 状态保存与恢复
const STORAGE_KEY = 'electron_music_state';
let bgmAudio = null;

function getSoundVolume() {
    const settings = JSON.parse(localStorage.getItem('userSettings')) || {};
    return (settings.soundVolume !== undefined ? settings.soundVolume : 80) / 100;
}

function getMusicVolume() {
    const settings = JSON.parse(localStorage.getItem('userSettings')) || {};
    return (settings.musicVolume !== undefined ? settings.musicVolume : 60) / 100;
}

function saveAudioState(audio) {
    const state = {
        src: audio.src,
        currentTime: audio.currentTime,
        paused: audio.paused,
        volume: audio.volume
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreAudioState(audio) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
        const state = JSON.parse(raw);
        if (state.src && audio.src !== state.src) {
            audio.src = state.src;
        }
        audio.currentTime = state.currentTime || 0;
        audio.volume = state.volume !== undefined ? state.volume : getMusicVolume();
        if (!state.paused) {
            audio.play().catch(e => console.warn('自动播放被阻止', e));
        }
    } catch(e) {}
}

function initMusicPlayer() {
    bgmAudio = document.createElement('audio');
    bgmAudio.id = 'bgm';
    bgmAudio.src = '../sound/home.flac';
    bgmAudio.loop = true;
    bgmAudio.volume = getMusicVolume();
    bgmAudio.style.display = 'none';
    document.body.appendChild(bgmAudio);

    restoreAudioState(bgmAudio);

    if (bgmAudio.paused) {
        bgmAudio.play().catch(e => console.log('背景音乐播放失败:', e));
    }

    setInterval(() => {
        if (bgmAudio) {
            bgmAudio.volume = getMusicVolume();
            if (!bgmAudio.paused) saveAudioState(bgmAudio);
        }
    }, 3000);

    window.addEventListener('beforeunload', () => {
        if (bgmAudio) saveAudioState(bgmAudio);
    });
}

function initClickSound() {
    let audioUnlocked = false;
    document.addEventListener('click', function(e) {
        if (window.location.pathname.includes('game/')) {
            return;
        }
        // 第一次点击时解锁音频
        if (!audioUnlocked) {
            const unlockAudio = new Audio('../sound/click4.ogg');
            unlockAudio.volume = 0;
            unlockAudio.play().then(() => {
                audioUnlocked = true;
            }).catch(() => {
                audioUnlocked = true;
            });
        }
        const audio = new Audio('../sound/click4.ogg');
        audio.volume = getSoundVolume();
        audio.play().catch(err => console.log('音效播放失败:', err));
    }, true);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initMusicPlayer();
        initClickSound();
    });
} else {
    initMusicPlayer();
    initClickSound();
}

// 主题切换函数
function setTheme(theme) {
    const currentTheme = localStorage.getItem('currentTheme');
    const volume = getSoundVolume();
    let soundSrc;
    if (currentTheme === theme) {
        if (theme === 'light') {
            soundSrc = '../sound/UI_white_last.mp3';
        } else {
            soundSrc = '../sound/UI_black_last.mp3';
        }
    } else {
        if (theme === 'light') {
            soundSrc = '../sound/UI_white.mp3';
        } else {
            soundSrc = '../sound/UI_black.mp3';
        }
    }
    const sound = new Audio(soundSrc);
    sound.volume = volume;
    sound.play().catch(err => {});
    localStorage.setItem('currentTheme', theme);
    applyTheme(theme);
}
// 应用主题
function applyTheme(theme) {
    const body = document.body;
    const navBar = document.querySelector('.navBar');
    const userInfoItems = document.querySelectorAll('.userInfoItem');
    const userInfoValues = document.querySelectorAll('.userInfoValue');
    const navMiddle = document.querySelector('.navMiddle');
    const containers = document.querySelectorAll('.container');
    const headers = document.querySelectorAll('.header');
    const cards = document.querySelectorAll('.achievement-card, .shop-item-card, .battle-card, .stat-card');
    const statsContainers = document.querySelectorAll('.stats-container');
    const buttons = document.querySelectorAll('button, .back-button');
    const statCards = document.querySelectorAll('.stat-card');
    const statsTitles = document.querySelectorAll('.stats-title');
    const battlesTitles = document.querySelectorAll('.battles-title');
    
    // 设置页面元素
    const settingsContainer = document.querySelector('.settings-container');
    const settingsSidebar = document.querySelector('.settings-sidebar');
    const navItems = document.querySelectorAll('.nav-item');
    
    // 检查是否有自定义背景
    const pageBackgrounds = JSON.parse(localStorage.getItem('pageBackgrounds')) || {};
    const hasCustomBackground = Object.keys(pageBackgrounds).length > 0;
    const settingsSections = document.querySelectorAll('.settings-section');
    const settingLabels = document.querySelectorAll('.setting-label');
    const settingDescriptions = document.querySelectorAll('.setting-description');
    const settingInputs = document.querySelectorAll('.setting-input');
    const settingSelects = document.querySelectorAll('.setting-select');
    const settingValues = document.querySelectorAll('.setting-value');
    const sidebarTitles = document.querySelectorAll('.sidebar-title');
    const settingsHeaders = document.querySelectorAll('.settings-header h1');
    const avatarPreviews = document.querySelectorAll('.avatar-preview');
    const keyboardModalContents = document.querySelectorAll('.keyboard-modal-content');
    const keySettingLabels = document.querySelectorAll('.key-setting-label');
    const keySettingInputs = document.querySelectorAll('.key-setting-input');
    const keySectionTitles = document.querySelectorAll('.key-section-title');
    const keyboardModalTips = document.querySelectorAll('.keyboard-modal-tip');
    
    // 商店页面和仓库页面元素
    const shopContainers = document.querySelectorAll('.shop-container');
    const shopNavBars = document.querySelectorAll('.shop-navBar');
    const shopCategories = document.querySelectorAll('.shop-categories');
    const shopGrids = document.querySelectorAll('.shop-grid');
    const shopCategoryBtns = document.querySelectorAll('.shop-category-btn');
    const shopModals = document.querySelectorAll('.shop-modal');
    const shopModalContents = document.querySelectorAll('.shop-modal-content');
    const shopItems = document.querySelectorAll('.shop-item');
    const currencyItems = document.querySelectorAll('.currency-item');
    
    // 仓库页面特定元素
    const teamConfigContents = document.querySelectorAll('.team-config-content');
    const selectVehicleContents = document.querySelectorAll('.select-vehicle-content');
    const teamConfigLists = document.querySelectorAll('.team-config-list');
    const vehicleSelectLists = document.querySelectorAll('.vehicle-select-list');
    const configBtns = document.querySelectorAll('.config-btn');
    const shopBtns = document.querySelectorAll('.shop-btn');
    const warehouseBtns = document.querySelectorAll('.warehouse-btn');

    if (theme === 'dark') {
        // 黑夜模式
        if (!hasCustomBackground) {
            body.style.background = 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)';
        }
        body.style.color = '#e0e0e0';
        if (navBar) navBar.style.background = 'rgba(30, 30, 50, 0.9)';
        userInfoItems.forEach(item => item.style.color = '#e0e0e0');
        userInfoValues.forEach(val => val.style.color = '#FFD700');
        if (navMiddle) navMiddle.style.background = 'rgba(30, 30, 50, 0.7)';
        
        // 设置页面
        if (settingsContainer) settingsContainer.style.background = 'rgba(30, 30, 50, 0.9)';
        if (settingsSidebar) settingsSidebar.style.background = 'rgba(40, 40, 60, 0.9)';
        navItems.forEach(item => {
            item.style.color = '#c0c0c0';
            item.style.background = 'rgba(50, 50, 70, 0.5)';
        });
        
        // 设置页面详细元素
        settingsSections.forEach(section => {
            section.style.background = 'rgba(40, 40, 60, 0.9)';
            section.style.borderLeftColor = 'rgba(210, 180, 140, 0.8)';
        });
        settingLabels.forEach(label => {
            label.style.color = '#e0e0e0';
        });
        settingDescriptions.forEach(desc => {
            desc.style.color = '#a0a0a0';
        });
        settingInputs.forEach(input => {
            input.style.background = 'rgba(50, 50, 70, 0.9)';
            input.style.borderColor = 'rgba(100, 100, 120, 0.8)';
            input.style.color = '#e0e0e0';
        });
        settingSelects.forEach(select => {
            select.style.background = 'rgba(50, 50, 70, 0.9)';
            select.style.borderColor = 'rgba(100, 100, 120, 0.8)';
            select.style.color = '#e0e0e0';
        });
        settingValues.forEach(value => {
            value.style.color = '#D2B48C';
        });
        sidebarTitles.forEach(title => {
            title.style.color = '#e0e0e0';
            title.style.borderBottomColor = 'rgba(100, 100, 120, 0.5)';
        });
        settingsHeaders.forEach(header => {
            header.style.color = '#e0e0e0';
        });
        avatarPreviews.forEach(preview => {
            preview.style.background = 'rgba(50, 50, 70, 0.9)';
            preview.style.borderColor = 'rgba(210, 180, 140, 0.8)';
        });
        keyboardModalContents.forEach(content => {
            content.style.background = 'rgba(40, 40, 60, 0.95)';
        });
        keySettingLabels.forEach(label => {
            label.style.color = '#e0e0e0';
        });
        keySettingInputs.forEach(input => {
            input.style.background = 'rgba(50, 50, 70, 0.9)';
            input.style.borderColor = 'rgba(100, 100, 120, 0.8)';
            input.style.color = '#e0e0e0';
        });
        keySectionTitles.forEach(title => {
            title.style.color = '#D2B48C';
            title.style.borderBottomColor = 'rgba(210, 180, 140, 0.5)';
        });
        keyboardModalTips.forEach(tip => {
            tip.style.color = '#a0a0a0';
        });
        
        // 商店页面和仓库页面 - 黑夜模式
        shopContainers.forEach(container => {
            container.style.background = 'rgba(20, 20, 40, 0.9)';
        });
        shopNavBars.forEach(nav => {
            nav.style.background = 'rgba(30, 30, 50, 0.9)';
        });
        shopCategories.forEach(cat => {
            cat.style.background = 'transparent';
        });
        shopGrids.forEach(grid => {
            grid.style.background = 'transparent';
        });
        shopCategoryBtns.forEach(btn => {
            btn.style.background = 'rgba(50, 50, 70, 0.6)';
            btn.style.color = '#e0e0e0';
            btn.style.borderColor = 'rgba(100, 100, 120, 0.5)';
            if (btn.classList.contains('active')) {
                btn.style.background = 'rgba(210, 180, 140, 0.8)';
                btn.style.color = '#1a1a2e';
            }
        });
        shopItems.forEach(item => {
            item.style.background = 'rgba(40, 40, 60, 0.9)';
            item.style.borderColor = '#555';
            // 仓库页面的卡片使用 h3 和 p
            const title = item.querySelector('h3');
            if (title) title.style.color = '#FFFFFF';
            const desc = item.querySelector('p');
            if (desc) desc.style.color = '#e0e0e0';
            // 商店页面的卡片使用 shop-item-name 和 shop-item-desc
            const shopTitle = item.querySelector('.shop-item-name');
            if (shopTitle) shopTitle.style.color = '#FFFFFF';
            const shopDesc = item.querySelector('.shop-item-desc');
            if (shopDesc) shopDesc.style.color = '#e0e0e0';
            const price = item.querySelector('.price');
            if (price) price.style.color = '#FFD700';
            const shopPrice = item.querySelector('.shop-item-price');
            if (shopPrice) shopPrice.style.color = '#FFD700';
            const owned = item.querySelector('.owned');
            if (owned) owned.style.color = '#FFFFFF';
            const useBtn = item.querySelector('.use-btn');
            if (useBtn) {
                useBtn.style.background = '#61c4ae';
                useBtn.style.color = 'white';
            }
            const buyBtn = item.querySelector('.shop-buy-btn');
            if (buyBtn) {
                buyBtn.style.background = '#61c4ae';
                buyBtn.style.color = 'white';
            }
        });
        currencyItems.forEach(item => {
            item.style.background = 'rgba(40, 40, 60, 0.8)';
            item.style.borderRadius = '8px';
            item.style.padding = '5px 12px';
            const spans = item.querySelectorAll('span');
            spans.forEach(span => {
                span.style.color = '#FFD700';
                span.style.fontWeight = 'bold';
            });
            const icons = item.querySelectorAll('i');
            icons.forEach(icon => {
                icon.style.color = '#FFD700';
            });
        });
        shopModals.forEach(modal => {
            modal.style.background = 'rgba(0, 0, 0, 0.7)';
        });
        shopModalContents.forEach(content => {
            content.style.background = 'rgba(245, 245, 245, 0.95)';
            const h2 = content.querySelector('h2');
            if (h2) h2.style.color = '#000000';
            const p = content.querySelector('p');
            if (p) p.style.color = '#333333';
            const buttons = content.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.textContent.includes('确认购买') || btn.textContent.includes('确定')) {
                    btn.style.background = 'rgba(210, 180, 140, 0.8)';
                    btn.style.color = '#1a1a2e';
                } else {
                    btn.style.background = '#e0e0e0';
                    btn.style.color = '#333333';
                }
            });
            const labels = content.querySelectorAll('label');
            labels.forEach(label => {
                label.style.color = '#333333';
            });
            const inputs = content.querySelectorAll('input');
            inputs.forEach(input => {
                input.style.background = 'white';
                input.style.borderColor = '#ddd';
                input.style.color = '#333333';
            });
        });
        
        // 仓库页面特定元素 - 黑夜模式
        teamConfigContents.forEach(content => {
            content.style.background = 'rgba(40, 40, 60, 0.95)';
            content.style.color = '#FFFFFF';
            const h2 = content.querySelector('h2');
            if (h2) h2.style.color = '#FFFFFF';
            // 处理队伍载具计数区域 - 直接修改背景和文字颜色
            const teamVehicleCount = document.getElementById('teamVehicleCount');
            if (teamVehicleCount) {
                const parentSpan = teamVehicleCount.parentElement;
                const grandParentDiv = parentSpan ? parentSpan.parentElement : null;
                if (grandParentDiv) {
                    grandParentDiv.style.background = '#f5f5f5';
                    grandParentDiv.style.color = '#000000';
                    parentSpan.style.setProperty('color', '#000000', 'important');
                    teamVehicleCount.style.setProperty('color', '#000000', 'important');
                }
            }
            const spans = content.querySelectorAll('span');
            spans.forEach(span => {
                // 排除队伍载具计数区域的span，其他span设为白色
                if (span.id !== 'teamVehicleCount') {
                    const parentDiv = span.parentElement;
                    const grandParentDiv = parentDiv ? parentDiv.parentElement : null;
                    if (grandParentDiv && grandParentDiv.style.background && grandParentDiv.style.background.includes('#f5f5f5')) {
                        span.style.color = '#000000';
                    } else {
                        span.style.color = '#FFFFFF';
                    }
                }
            });
            const divs = content.querySelectorAll('div');
            divs.forEach(div => {
                // 如果div包含"队伍载具"文字，设为浅色背景黑色文字
                if (div.textContent && div.textContent.includes('队伍载具')) {
                    div.style.background = '#f5f5f5';
                    div.style.color = '#000000';
                } else {
                    div.style.color = '#FFFFFF';
                }
            });
            const ps = content.querySelectorAll('p');
            ps.forEach(p => {
                p.style.color = '#FFFFFF';
            });
            const buttons = content.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.style.color = '#FFFFFF';
            });
            const labels = content.querySelectorAll('label');
            labels.forEach(label => {
                label.style.color = '#FFFFFF';
            });
            const lis = content.querySelectorAll('li');
            lis.forEach(li => {
                li.style.color = '#FFFFFF';
                li.style.fontWeight = 'bold';
            });
        });
        selectVehicleContents.forEach(content => {
            content.style.background = 'rgba(40, 40, 60, 0.95)';
            content.style.color = '#FFFFFF';
            const h3 = content.querySelector('h3');
            if (h3) h3.style.color = '#FFFFFF';
            const spans = content.querySelectorAll('span');
            spans.forEach(span => {
                span.style.color = '#FFFFFF';
            });
            const divs = content.querySelectorAll('div');
            divs.forEach(div => {
                div.style.color = '#FFFFFF';
            });
            const ps = content.querySelectorAll('p');
            ps.forEach(p => {
                p.style.color = '#FFFFFF';
            });
            const buttons = content.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.style.color = '#FFFFFF';
            });
            const labels = content.querySelectorAll('label');
            labels.forEach(label => {
                label.style.color = '#FFFFFF';
            });
            const lis = content.querySelectorAll('li');
            lis.forEach(li => {
                li.style.color = '#FFFFFF';
                li.style.fontWeight = 'bold';
                li.style.fontSize = '16px';
            });
        });
        teamConfigLists.forEach(list => {
            list.style.background = 'rgba(30, 30, 50, 0.8)';
        });
        vehicleSelectLists.forEach(list => {
            list.style.background = 'rgba(30, 30, 50, 0.8)';
        });
        configBtns.forEach(btn => {
            btn.style.background = 'rgba(50, 50, 70, 0.8)';
            btn.style.color = '#e0e0e0';
        });
        shopBtns.forEach(btn => {
            btn.style.background = 'rgba(50, 50, 70, 0.8)';
            btn.style.color = '#e0e0e0';
        });
        warehouseBtns.forEach(btn => {
            btn.style.background = 'rgba(50, 50, 70, 0.8)';
            btn.style.color = '#e0e0e0';
        });
        
        // 按钮样式
        buttons.forEach(btn => {
            const bg = btn.style.background;
            if (bg && (bg.includes('#667eea') || bg.includes('#61c4ae'))) {
                btn.style.background = '#2d3a4b';
                btn.style.color = '#e0e0e0';
            }
        });
        
        // 容器和卡片
        containers.forEach(container => {
            const bg = container.style.background;
            if (bg && bg.includes('rgba(255, 255, 255')) {
                container.style.background = 'rgba(30, 30, 50, 0.8)';
            }
        });
        headers.forEach(header => {
            const bg = header.style.background;
            if (bg && bg.includes('rgba(255, 255, 255')) {
                header.style.background = 'rgba(30, 30, 50, 0.8)';
            }
            const h1 = header.querySelector('h1');
            if (h1) h1.style.color = '#e0e0e0';
            const p = header.querySelector('p');
            if (p) p.style.color = '#a0a0a0';
        });
        cards.forEach(card => {
            const bg = card.style.background;
            if (bg && bg.includes('rgba(255, 255, 255')) {
                card.style.background = 'rgba(40, 40, 60, 0.8)';
            }
        });
        statsContainers.forEach(container => {
            const bg = container.style.background;
            if (bg && bg.includes('rgba(255, 255, 255')) {
                container.style.background = 'rgba(30, 30, 50, 0.8)';
            }
        });
        
        // 战绩页面
        statCards.forEach(card => {
            const bg = card.style.background;
            if (bg && bg.includes('rgba(255, 255, 255')) {
                card.style.background = 'rgba(30, 30, 50, 0.8)';
            }
            const title = card.querySelector('h3');
            if (title) title.style.color = '#e0e0e0';
            const value = card.querySelector('.stat-value');
            if (value) value.style.color = '#D2B48C';
            const label = card.querySelector('.stat-label');
            if (label) label.style.color = '#a0a0a0';
        });
        statsTitles.forEach(title => {
            title.style.color = '#e0e0e0';
        });
        battlesTitles.forEach(title => {
            title.style.color = '#e0e0e0';
        });
    } else {
        // 白天模式（默认）
        if (!hasCustomBackground) {
            body.style.background = 'linear-gradient(180deg, #4AB8A0 0%, #000000 100%)';
        }
        body.style.color = '#333';
        if (navBar) navBar.style.background = 'rgba(255, 255, 255, 0.8)';
        userInfoItems.forEach(item => item.style.color = '#333');
        userInfoValues.forEach(val => val.style.color = '#333');
        if (navMiddle) navMiddle.style.background = 'rgba(255, 255, 255, 0.7)';
        
        // 设置页面恢复默认
        if (settingsContainer) settingsContainer.style.background = '#52c7ae';
        if (settingsSidebar) settingsSidebar.style.background = '#f8f9fa';
        navItems.forEach(item => {
            item.style.color = '#555';
            item.style.background = 'transparent';
        });
        
        // 设置页面详细元素恢复默认
        settingsSections.forEach(section => {
            section.style.background = '#f8f9fa';
            section.style.borderLeftColor = '#D2B48C';
        });
        settingLabels.forEach(label => {
            label.style.color = '#555';
        });
        settingDescriptions.forEach(desc => {
            desc.style.color = '#888';
        });
        settingInputs.forEach(input => {
            input.style.background = 'white';
            input.style.borderColor = '#ddd';
            input.style.color = '#333';
        });
        settingSelects.forEach(select => {
            select.style.background = 'white';
            select.style.borderColor = '#ddd';
            select.style.color = '#333';
        });
        settingValues.forEach(value => {
            value.style.color = '#D2B48C';
        });
        sidebarTitles.forEach(title => {
            title.style.color = '#333';
            title.style.borderBottomColor = '#e0e0e0';
        });
        settingsHeaders.forEach(header => {
            header.style.color = '#333';
        });
        avatarPreviews.forEach(preview => {
            preview.style.background = '#f0f0f0';
            preview.style.borderColor = '#D2B48C';
        });
        keyboardModalContents.forEach(content => {
            content.style.background = 'white';
        });
        keySettingLabels.forEach(label => {
            label.style.color = '#666';
        });
        keySettingInputs.forEach(input => {
            input.style.background = 'white';
            input.style.borderColor = '#e0e0e0';
            input.style.color = '#333';
        });
        keySectionTitles.forEach(title => {
            title.style.color = '#D2B48C';
            title.style.borderBottomColor = '#D2B48C';
        });
        keyboardModalTips.forEach(tip => {
            tip.style.color = '#666';
        });
        
        // 商店页面和仓库页面 - 白天模式恢复默认
        shopContainers.forEach(container => {
            container.style.background = 'transparent';
        });
        shopNavBars.forEach(nav => {
            nav.style.background = 'rgba(255, 255, 255, 0.9)';
        });
        shopCategories.forEach(cat => {
            cat.style.background = 'transparent';
        });
        shopGrids.forEach(grid => {
            grid.style.background = 'transparent';
        });
        shopCategoryBtns.forEach(btn => {
            btn.style.background = '#f0f0f0';
            btn.style.color = '#555';
            btn.style.borderColor = '#ddd';
            if (btn.classList.contains('active')) {
                btn.style.background = '#D2B48C';
                btn.style.color = '#333';
            }
        });
        shopItems.forEach(item => {
            item.style.background = 'rgba(255, 255, 255, 0.9)';
            item.style.borderColor = '#ddd';
            const title = item.querySelector('h3');
            if (title) title.style.color = '#333';
            const desc = item.querySelector('p');
            if (desc) desc.style.color = '#666';
            const price = item.querySelector('.price');
            if (price) price.style.color = '#D2B48C';
            const owned = item.querySelector('.owned');
            if (owned) owned.style.color = '#666';
            const useBtn = item.querySelector('.use-btn');
            if (useBtn) {
                useBtn.style.background = '#61c4ae';
                useBtn.style.color = 'white';
            }
        });
        currencyItems.forEach(item => {
            item.style.color = '#D2B48C';
            const label = item.querySelector('span');
            if (label && label.textContent.includes('货币')) {
                label.style.color = '#666';
            }
        });
        shopModals.forEach(modal => {
            modal.style.background = 'rgba(0, 0, 0, 0.5)';
        });
        shopModalContents.forEach(content => {
            content.style.background = 'white';
            const h2 = content.querySelector('h2');
            if (h2) h2.style.color = '#333';
            const p = content.querySelector('p');
            if (p) p.style.color = '#666';
            const buttons = content.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.textContent.includes('确认购买')) {
                    btn.style.background = '#4CAF50';
                    btn.style.color = 'white';
                } else if (btn.textContent.includes('确定')) {
                    btn.style.background = '#667eea';
                    btn.style.color = 'white';
                } else {
                    btn.style.background = '#f0f0f0';
                    btn.style.color = '#333';
                }
            });
            const labels = content.querySelectorAll('label');
            labels.forEach(label => {
                label.style.color = '#666';
            });
            const inputs = content.querySelectorAll('input');
            inputs.forEach(input => {
                input.style.background = 'white';
                input.style.borderColor = '#ddd';
                input.style.color = '#333';
            });
        });
        
        // 仓库页面特定元素 - 白天模式恢复默认
        teamConfigContents.forEach(content => {
            content.style.background = 'white';
            const h2 = content.querySelector('h2');
            if (h2) h2.style.color = '#333';
            const spans = content.querySelectorAll('span');
            spans.forEach(span => {
                if (!span.textContent.includes('/')) {
                    span.style.color = '#666';
                }
            });
        });
        selectVehicleContents.forEach(content => {
            content.style.background = 'white';
            const h3 = content.querySelector('h3');
            if (h3) h3.style.color = '#333';
        });
        teamConfigLists.forEach(list => {
            list.style.background = '#f5f5f5';
        });
        vehicleSelectLists.forEach(list => {
            list.style.background = '#f5f5f5';
        });
        configBtns.forEach(btn => {
            btn.style.background = 'rgba(255, 255, 255, 0.9)';
            btn.style.color = '#555';
        });
        shopBtns.forEach(btn => {
            btn.style.background = 'rgba(255, 255, 255, 0.9)';
            btn.style.color = '#555';
        });
        warehouseBtns.forEach(btn => {
            btn.style.background = 'rgba(255, 255, 255, 0.9)';
            btn.style.color = '#555';
        });
        
        // 按钮样式恢复
        buttons.forEach(btn => {
            const bg = btn.style.background;
            if (bg && bg.includes('#2d3a4b')) {
                btn.style.background = '#667eea';
                btn.style.color = 'white';
            }
        });
        
        // 容器和卡片恢复默认
        containers.forEach(container => {
            const bg = container.style.background;
            if (bg && bg.includes('rgba(30, 30, 50')) {
                container.style.background = 'rgba(255, 255, 255, 0.8)';
            }
        });
        headers.forEach(header => {
            const bg = header.style.background;
            if (bg && bg.includes('rgba(30, 30, 50')) {
                header.style.background = 'rgba(255, 255, 255, 0.8)';
            }
            const h1 = header.querySelector('h1');
            if (h1) h1.style.color = '#333';
            const p = header.querySelector('p');
            if (p) p.style.color = '#666';
        });
        cards.forEach(card => {
            const bg = card.style.background;
            if (bg && bg.includes('rgba(40, 40, 60')) {
                card.style.background = 'rgba(255, 255, 255, 0.8)';
            }
        });
        statsContainers.forEach(container => {
            const bg = container.style.background;
            if (bg && bg.includes('rgba(30, 30, 50')) {
                container.style.background = 'rgba(255, 255, 255, 0.8)';
            }
        });
        
        // 战绩页面恢复默认
        statCards.forEach(card => {
            const bg = card.style.background;
            if (bg && bg.includes('rgba(30, 30, 50')) {
                card.style.background = 'rgba(255, 255, 255, 0.8)';
            }
            const title = card.querySelector('h3');
            if (title) title.style.color = '#333';
            const value = card.querySelector('.stat-value');
            if (value) value.style.color = '#4AB8A0';
            const label = card.querySelector('.stat-label');
            if (label) label.style.color = '#666';
        });
        statsTitles.forEach(title => {
            title.style.color = '#333';
        });
        battlesTitles.forEach(title => {
            title.style.color = '#333';
        });
    }
}

// 页面加载时应用保存的主题
window.addEventListener('load', function() {
    const savedTheme = localStorage.getItem('currentTheme') || 'light';
    applyTheme(savedTheme);
});