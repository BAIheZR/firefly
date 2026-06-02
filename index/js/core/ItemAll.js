
		// 加载配置文件
		async function loadConfig() {
			try {
				const response = await fetch('../main/configStart.json');
				const config = await response.json();
				return config;
			} catch (error) {
				console.error('加载配置文件失败:', error);
				return null;
			}
		}

		// 加载用户头像和性别
		async function loadUserAvatar() {
			const avatarImg = document.getElementById('avatarImg');
			const avatarPlaceholder = document.getElementById('avatarPlaceholder');
			const sexIcon = document.getElementById('sexIcon');
			const userSex = localStorage.getItem('userSex');

			// 优先从localStorage获取用户自定义头像（设置页面上传的）
			let userAvatar = localStorage.getItem('userAvatar');
			
			// 如果localStorage中没有头像，再从配置文件获取默认头像
			if (!userAvatar || userAvatar.trim() === '') {
				const config = await loadConfig();
				userAvatar = config?.user?.avatar;
			}

			// 如果有头像，显示头像图片
			if (userAvatar && userAvatar.trim() !== '') {
				avatarImg.src = userAvatar;
				avatarImg.style.display = 'block';
				avatarPlaceholder.style.display = 'none';
			} else {
				// 显示默认用户图标
				avatarImg.style.display = 'none';
				avatarPlaceholder.style.display = 'block';
			}

			// 根据性别显示图标
			if (userSex === 'male') {
				sexIcon.className = 'fas fa-mars';
				sexIcon.style.display = 'block';
			} else if (userSex === 'female') {
				sexIcon.className = 'fas fa-venus';
				sexIcon.style.display = 'block';
			} else {
				sexIcon.style.display = 'none';
			}
		}

		// 加载用户信息
		async function loadUserInfo() {
			// 从localStorage获取用户数据
			let userAchievements = JSON.parse(localStorage.getItem('unlockedAchievements')) || [];
			if (userAchievements.length === 0) {
				userAchievements = JSON.parse(localStorage.getItem('userAchievements')) || [];
			}
			const userLevel = localStorage.getItem('userLevel') || 0;
			const userPlayTime = localStorage.getItem('userPlayTime') || '0.0';
			const userGameCount = localStorage.getItem('userGameCount') || 0;
			const userPreferredModes = JSON.parse(localStorage.getItem('userPreferredModes')) || [];
			const userRecentMode = localStorage.getItem('userRecentMode') || '-';
			const userCurrency = localStorage.getItem('userCurrency') || 0;

			document.getElementById('userLevel').textContent = userLevel;
			document.getElementById('userPlayTime').textContent = userPlayTime;
			document.getElementById('userGameCount').textContent = userGameCount;
			document.getElementById('userAchievements').textContent = userAchievements.length;
			document.getElementById('userPreferredModes').textContent = userPreferredModes.length > 0 ? userPreferredModes[0] : '-';
			document.getElementById('userRecentMode').textContent = userRecentMode;
			if (document.getElementById('currencyValue')) {
				document.getElementById('currencyValue').textContent = userCurrency;
			}
		}

		// 加载进度条逻辑
		document.addEventListener('DOMContentLoaded', function() {
			const loader = document.getElementById('loader');
			const loaderBar = document.querySelector('.loader-bar');
			const loaderPercentage = document.querySelector('.loader-percentage');
			const content = document.getElementById('content');

			// 检查是否是初次加载或关闭后重新打开
			// 使用sessionStorage而不是localStorage，因为sessionStorage在标签页关闭后会自动清除
			if (!sessionStorage.getItem('pageLoaded')) {
				// 显示加载动画
				let progress = 0;
				const duration = 2000; // 2秒
				const interval = 20; // 每20毫秒更新一次
				const steps = duration / interval;
				const increment = 100 / steps;

				const loadingInterval = setInterval(function() {
					progress += increment;
					if (progress >= 100) {
						progress = 100;
						clearInterval(loadingInterval);

						// 加载完成，隐藏加载器，显示内容
						setTimeout(function() {
							loader.style.opacity = '0';
							setTimeout(function() {
								loader.style.display = 'none';
								// 检查是否已选择性别
								if (!localStorage.getItem('userSex')) {
									// 显示性别选择器
									const sexSelector = document.getElementById('sexSelector');
									sexSelector.style.display = 'flex';
									// 播放性别选择出现音效
									const soundFirst = new Audio('../sound/Sound_first.mp3');
									soundFirst.play();
								} else {
									// 已选择性别，直接显示内容
									content.style.display = 'block';
									// 检查并补发初来乍到成就
									const userAchievements = JSON.parse(localStorage.getItem('userAchievements')) || [];
									if (!userAchievements.includes('first_try')) {
										userAchievements.push('first_try');
										localStorage.setItem('userAchievements', JSON.stringify(userAchievements));
									}
								}
								// 加载用户头像
								loadUserAvatar();
								// 延迟加载用户信息，确保checkFirstTime函数已经执行完毕
								setTimeout(loadUserInfo, 100);
								// 设置页面已加载标记
								sessionStorage.setItem('pageLoaded', 'true');
							}, 500);
						}, 500);
					}

					loaderBar.style.width = progress + '%';
					loaderPercentage.textContent = Math.round(progress) + '%';
				}, interval);
			} else {
				// 直接显示内容，不显示加载动画
					loader.style.display = 'none';
					// 检查是否已选择性别
					if (!localStorage.getItem('userSex')) {
						// 显示性别选择器
						const sexSelector = document.getElementById('sexSelector');
						sexSelector.style.display = 'flex';
						// 播放性别选择出现音效
						const soundFirst = new Audio('../sound/Sound_first.mp3');
						soundFirst.play();
					} else {
						// 已选择性别，直接显示内容
						content.style.display = 'block';
						// 检查并补发初来乍到成就
						const userAchievements = JSON.parse(localStorage.getItem('userAchievements')) || [];
						if (!userAchievements.includes('first_try')) {
							userAchievements.push('first_try');
							localStorage.setItem('userAchievements', JSON.stringify(userAchievements));
						}
					}
					// 加载用户头像
					loadUserAvatar();
					// 延迟加载用户信息
					setTimeout(loadUserInfo, 100);
				}
			});

			// 性别选择函数
			function selectSex(sex) {
				// 播放选择音效
				const sound = new Audio('../sound/Sound_inset_Start.mp3');
				sound.play();

				// 保存到localStorage（持久化存储）
				localStorage.setItem('userSex', sex);

				// 解锁初来乍到成就
				const userAchievements = JSON.parse(localStorage.getItem('userAchievements')) || [];
				if (!userAchievements.includes('first_try')) {
					userAchievements.push('first_try');
					localStorage.setItem('userAchievements', JSON.stringify(userAchievements));
				}

				// 隐藏性别选择器
				const sexSelector = document.getElementById('sexSelector');
				sexSelector.style.opacity = '0';
				setTimeout(function() {
					sexSelector.style.display = 'none';
					// 显示主内容
					const content = document.getElementById('content');
					content.style.display = 'block';
					// 加载用户头像
					loadUserAvatar();
					// 加载用户信息
					loadUserInfo();
				}, 300);
			}

			// 打开设置页面
			function openSettings() {
				window.location.href = 'setting.html';
			}
			
			function openShop() {
				window.location.href = 'shop.html';
			}
			
			function openChat() {
				window.location.href = 'chat.html';
			}
			
			function openWarehouse() {
				window.location.href = 'warehouse.html';
			}

			// GalGame 启动函数
			function startGalGame() {
				showCustomAlert('GalGame 功能开发中，敬请期待！', 'info');
			}

			// 用于存储当前正在播放的主题音效
			let currentThemeSound = null;

			// 主题切换函数
			function setTheme(theme) {
				const currentTheme = localStorage.getItem('currentTheme') || 'light';
				
				// 停止之前正在播放的音效
				if (currentThemeSound && !currentThemeSound.paused) {
					currentThemeSound.pause();
					currentThemeSound.currentTime = 0;
				}
				
				// 播放主题切换音效
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
				currentThemeSound = new Audio(soundSrc);
				currentThemeSound.play();
				
				if (theme === 'light' && currentTheme === 'light') {
					showThemeToast('当前已是默认UI');
					return;
				}
				
				if (theme === 'dark') {
					showThemeToast('当前已切换深色模式');
				}
				
				localStorage.setItem('currentTheme', theme);
				applyTheme(theme);
			}

			// 显示主题切换提示框
			function showThemeToast(message) {
				// 添加动画样式（只添加一次）
				if (!document.querySelector('#theme-toast-style')) {
					const style = document.createElement('style');
					style.id = 'theme-toast-style';
					style.textContent = `
						@keyframes toastFadeIn {
							from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
							to { opacity: 1; transform: translateX(-50%) translateY(0); }
						}
						@keyframes toastFadeOut {
							from { opacity: 1; transform: translateX(-50%) translateY(0); }
							to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
						}
					`;
					document.head.appendChild(style);
				}
				
				const existingToast = document.querySelector('.theme-toast');
				if (existingToast) {
					existingToast.remove();
				}
				
				const toast = document.createElement('div');
				toast.className = 'theme-toast';
				toast.textContent = message;
				toast.style.cssText = `
					position: fixed;
					top: 80px;
					left: 50%;
					transform: translateX(-50%);
					background: rgba(0, 0, 0, 0.8);
					color: #fff;
					padding: 12px 24px;
					border-radius: 8px;
					font-size: 14px;
					z-index: 10000;
					animation: toastFadeIn 0.3s ease;
				`;
				document.body.appendChild(toast);
				
				setTimeout(() => {
					toast.style.animation = 'toastFadeOut 0.3s ease';
					setTimeout(() => toast.remove(), 300);
				}, 2000);
			}

			// 应用主题
			function applyTheme(theme) {
				const body = document.body;
				const navBar = document.querySelector('.navBar');
				const userInfoItems = document.querySelectorAll('.userInfoItem');
				const userInfoValues = document.querySelectorAll('.userInfoValue');
				const navMiddle = document.querySelector('.navMiddle');

				// 检查是否有自定义背景
				const pageBackgrounds = JSON.parse(localStorage.getItem('pageBackgrounds')) || {};
				const hasCustomBackground = Object.keys(pageBackgrounds).length > 0;

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
				}
			}

			// 页面加载时应用保存的主题
			window.addEventListener('load', function() {
				const savedTheme = localStorage.getItem('currentTheme') || 'light';
				applyTheme(savedTheme);
			});

			// 查看全部左侧内容
			function viewAllLeft() {
				showCustomAlert('查看全部左侧内容', 'info');
			}

			// 查看全部右侧内容
			function viewAllRight() {
				showCustomAlert('查看全部右侧内容', 'info');
			}

			console.log(localStorage.getItem('userSex'));
