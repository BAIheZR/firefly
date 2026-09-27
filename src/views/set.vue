<template>
  <div class="set-page">
    <el-backtop :right="100" :bottom="100" />
    <div class="set-body">
      <!-- 左侧：设置导航（固钉固定） -->
      <aside class="set-nav">
        <el-affix :offset="40">
          <div class="nav-title">快速导航</div>
          <div class="nav-divider"></div>
          <div class="nav-list">
            <div
              v-for="item in navItems"
              :key="item.key"
              class="nav-item"
              :class="{ active: activeNav === item.key }"
              @click="handleNavClick(item)"
            >
              <i :class="item.icon"></i>
              <span>{{ item.label }}</span>
            </div>
          </div>
          <button class="save-btn" @click="handleSave">
            <i class="fa-solid fa-save"></i>
            <span>保存设置</span>
          </button>
        </el-affix>
      </aside>

      <!-- 右侧：所有内容纵向排列，整体滚动 -->
      <main class="set-main">
        <!-- 账户设置 -->
        <section id="account" ref="sectionRefs" class="content-section">
          <div class="page-title">
            <i class="fa-solid fa-user"></i>
            <span>账户设置</span>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">头像</div>
              <div class="form-sub">上传或修改您的头像，支持任意格式和大小</div>
            </div>
            <div class="avatar-upload">
              <div class="avatar-circle">
                <img v-if="avatarData" :src="avatarData" class="avatar-img" />
                <i v-else class="fa-solid fa-user"></i>
              </div>
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                style="display:none"
                @change="onFileSelect"
              />
              <button class="btn-gold" @click="triggerUpload">
                <i class="fa-solid fa-upload"></i>
                上传头像
              </button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">用户名</div>
              <div class="form-sub">
                {{ usernameLocked ? '已确认' : '设置您的显示名称（确认后不可修改）' }}
              </div>
            </div>
            <div class="username-confirm-group">
              <input
                type="text"
                class="form-input"
                placeholder="输入用户名"
                v-model="account.username"
                :disabled="usernameLocked"
                @keyup.enter="confirmUsername"
              />
              <button v-if="!usernameLocked" class="btn-gold" @click="confirmUsername" :disabled="!account.username.trim()">
                <i class="fa-solid fa-check"></i>
                确认
              </button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">使用条款</div>
              <div class="form-sub">查看《软件使用同意条款（含免责声明）》</div>
            </div>
            <button class="btn-gold" @click="showAgreement = true">
              <i class="fa-solid fa-file-contract"></i>
              查看使用条款
            </button>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">保存存档</div>
              <div class="form-sub">导出游戏数据到本地文件，便于备份或迁移</div>
            </div>
            <button class="btn-gold" @click="handleSaveArchive">
              <i class="fa-solid fa-floppy-disk"></i>
              保存存档
            </button>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">导入存档</div>
              <div class="form-sub">从本地文件恢复游戏数据</div>
            </div>
            <input
              ref="importFileInput"
              type="file"
              accept=".json"
              style="display:none"
              @change="handleImportArchive"
            />
            <button class="btn-gold" @click="triggerImport">
              <i class="fa-solid fa-file-import"></i>
              选择存档文件
            </button>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">切换角色 / 存档槽</div>
              <div class="form-sub">在 5 个存档位之间切换，可分别保存「大号」「小号」互不干扰</div>
            </div>
            <button class="btn-gold" @click="handleSwitchSlot">
              <i class="fa-solid fa-arrows-rotate"></i>
              切换角色
            </button>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">AI 对话（流萤）</div>
              <div class="form-sub">配置 AI 接口后，点击主页人物立绘即可与流萤对话。人物设定已内置、不可修改；支持任意 OpenAI 兼容接口（OpenAI / DeepSeek / Kimi / 智谱 / 通义千问 / Ollama 等）</div>
            </div>
            <div class="ai-config">
              <div class="ai-field">
                <span class="ai-label">选择模型</span>
                <el-select v-model="aiConfig.modelId" class="ai-select" placeholder="请选择 AI 模型" @change="onModelChange">
                  <el-option v-for="m in AI_MODELS" :key="m.id" :label="m.label" :value="m.id" />
                </el-select>
              </div>
              <div class="ai-field">
                <span class="ai-label">API 地址</span>
                <input type="text" class="form-input" placeholder="选择模型后自动填充" v-model="aiConfig.baseUrl" :disabled="aiConfig.modelId !== 'custom'" />
              </div>
              <div class="ai-field">
                <span class="ai-label">模型名称</span>
                <input type="text" class="form-input" placeholder="选择模型后自动填充" v-model="aiConfig.model" :disabled="aiConfig.modelId !== 'custom'" />
              </div>
              <div class="ai-field">
                <span class="ai-label">API Key</span>
                <input type="password" class="form-input" placeholder="sk-..." v-model="aiConfig.apiKey" :disabled="aiConfig.modelId === 'ollama'" />
              </div>
              <div class="ai-tip">
                <i class="fa-solid fa-circle-info"></i>
                <span>选择预置模型会自动匹配对应 API 地址与模型名，只需填写 API Key；Ollama 本地模型无需 Key。</span>
              </div>
              <button class="btn-gold" @click="handleSaveAIConfig">
                <i class="fa-solid fa-floppy-disk"></i>
                保存 AI 配置
              </button>
            </div>
          </div>

          <div class="form-row danger-row">
            <div class="form-info">
              <div class="form-label">清空所有数据</div>
              <div class="form-sub">清除所有游戏进度、任务、统计数据、账户设置和头像。此操作不可撤销！</div>
            </div>
            <button class="btn-danger" @click="handleClearData">
              <i class="fa-solid fa-trash-can"></i>
              清空所有数据
            </button>
          </div>
        </section>

        <!-- 游戏设置 -->
        <section id="game" ref="sectionRefs" class="content-section">
          <div class="page-title">
            <i class="fa-solid fa-gamepad"></i>
            <span>游戏设置</span>
          </div>

          <div class="section-title">音频</div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">主音量</div>
              <div class="form-sub">控制游戏总体音量</div>
            </div>
            <div class="slider-row">
              <input type="range" min="0" max="100" v-model="game.masterVolume" class="slider" />
              <span class="slider-val">{{ game.masterVolume }}%</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">背景音乐</div>
              <div class="form-sub">BGM 音量</div>
            </div>
            <div class="slider-row">
              <input type="range" min="0" max="100" v-model="game.bgmVolume" class="slider" />
              <span class="slider-val">{{ game.bgmVolume }}%</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">音效</div>
              <div class="form-sub">点击、操作提示等音效</div>
            </div>
            <div class="slider-row">
              <input type="range" min="0" max="100" v-model="game.sfxVolume" class="slider" />
              <span class="slider-val">{{ game.sfxVolume }}%</span>
            </div>
          </div>


          <div class="section-title">画面</div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">显示模式</div>
              <div class="form-sub">切换全屏 / 窗口模式</div>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="game.fullscreen" />
              <span class="slider-check"></span>
            </label>
          </div>
        </section>

        <!-- 外观设置 -->
        <section id="appearance" ref="sectionRefs" class="content-section">
          <div class="page-title">
            <i class="fa-solid fa-palette"></i>
            <span>外观设置</span>
          </div>

          <div class="section-title">主题</div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">暗黑模式</div>
              <div class="form-sub">切换深色主题（功能暂不开放）</div>
            </div>
            <label class="switch switch-disabled" @click.prevent="notAvailable">
              <input type="checkbox" :checked="isDark" disabled />
              <span class="slider-check"></span>
            </label>
          </div>

          <div class="section-title">全局背景</div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">启用全局背景</div>
              <div class="form-sub">开启后，除首页外所有页面都会显示你设置的背景</div>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="bgEnabledLocal" @change="handleToggleBg" />
              <span class="slider-check"></span>
            </label>
          </div>

          <div class="form-row" v-if="bgStore.enabled">
            <div class="form-info">
              <div class="form-label">预设背景</div>
              <div class="form-sub">从默认背景库中选择</div>
            </div>
            <div class="preset-list">
              <div
                v-for="bg in PRESET_BACKGROUNDS"
                :key="bg.id"
                class="preset-item"
                :class="{ active: bgStore.type === 'preset' && bgStore.presetId === bg.id }"
                @click="handleSelectPreset(bg.id)"
              >
                <img :src="bg.value" :alt="bg.name" class="preset-thumb" />
                <div class="preset-name">{{ bg.name }}</div>
              </div>
            </div>
          </div>

          <div class="form-row" v-if="bgStore.enabled">
            <div class="form-info">
              <div class="form-label">自定义背景</div>
              <div class="form-sub">上传你自己的图片作为全局背景（建议使用宽屏图片）</div>
            </div>
            <div class="custom-bg-actions">
              <button class="btn-gold" @click="triggerBgUpload">
                <i class="fa-solid fa-upload"></i>
                上传图片
              </button>
              <input
                ref="bgFileInput"
                type="file"
                accept="image/*"
                style="display:none"
                @change="handleBgUpload"
              />
              <div v-if="bgStore.type === 'custom' && bgStore.customData" class="custom-preview">
                <img :src="bgStore.customData" alt="自定义背景" class="custom-thumb" />
                <button class="btn-secondary" @click="handleClearCustom" title="清除自定义背景">
                  <i class="fa-solid fa-times"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="form-row" v-if="bgStore.enabled">
            <div class="form-info">
              <div class="form-label">背景透明度</div>
              <div class="form-sub">调整背景图的透明度，数值越高越清晰</div>
            </div>
            <div class="slider-row">
              <input type="range" min="10" max="100" v-model.number="bgOpacityLocal" class="slider" @change="handleBgOpacityChange" />
              <span class="slider-val">{{ bgOpacityLocal }}%</span>
            </div>
          </div>

          <div class="form-row" v-if="bgStore.enabled">
            <div class="form-info">
              <div class="form-label">页面内容透明度</div>
              <div class="form-sub">调整页面内容区域的透明度，数值越低背景越透出</div>
            </div>
            <div class="slider-row">
              <input type="range" min="20" max="100" v-model.number="contentOpacityLocal" class="slider" @change="handleContentOpacityChange" />
              <span class="slider-val">{{ contentOpacityLocal }}%</span>
            </div>
          </div>

          <div class="section-title">首页背景</div>

          <div class="form-row">
            <div class="form-info">
              <div class="form-label">启用首页专属背景</div>
              <div class="form-sub">开启后，首页将显示你独立设置的背景（不影响其它页面）</div>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="homeBgEnabledLocal" @change="handleToggleHomeBg" />
              <span class="slider-check"></span>
            </label>
          </div>

          <div class="form-row" v-if="bgStore.homeEnabled">
            <div class="form-info">
              <div class="form-label">预设背景</div>
              <div class="form-sub">从默认背景库中选择首页背景</div>
            </div>
            <div class="preset-list">
              <div
                v-for="bg in PRESET_BACKGROUNDS"
                :key="bg.id"
                class="preset-item"
                :class="{ active: bgStore.homeType === 'preset' && bgStore.homePresetId === bg.id }"
                @click="handleSelectHomePreset(bg.id)"
              >
                <img :src="bg.value" :alt="bg.name" class="preset-thumb" />
                <div class="preset-name">{{ bg.name }}</div>
              </div>
            </div>
          </div>

          <div class="form-row" v-if="bgStore.homeEnabled">
            <div class="form-info">
              <div class="form-label">自定义背景</div>
              <div class="form-sub">上传你自己的图片作为首页背景（建议使用宽屏图片）</div>
            </div>
            <div class="custom-bg-actions">
              <button class="btn-gold" @click="triggerHomeBgUpload">
                <i class="fa-solid fa-upload"></i>
                上传图片
              </button>
              <input
                ref="homeBgFileInput"
                type="file"
                accept="image/*"
                style="display:none"
                @change="handleHomeBgUpload"
              />
              <div v-if="bgStore.homeType === 'custom' && bgStore.homeCustomData" class="custom-preview">
                <img :src="bgStore.homeCustomData" alt="首页自定义背景" class="custom-thumb" />
                <button class="btn-secondary" @click="handleClearHomeCustom" title="清除自定义背景">
                  <i class="fa-solid fa-times"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="form-row" v-if="bgStore.homeEnabled">
            <div class="form-info">
              <div class="form-label">首页背景透明度</div>
              <div class="form-sub">调整首页背景图的透明度，数值越高越清晰</div>
            </div>
            <div class="slider-row">
              <input type="range" min="10" max="100" v-model.number="homeBgOpacityLocal" class="slider" @change="handleHomeBgOpacityChange" />
              <span class="slider-val">{{ homeBgOpacityLocal }}%</span>
            </div>
          </div>
        </section>

        <!-- 关于 -->
        <section id="about" ref="sectionRefs" class="content-section">
          <div class="page-title">
            <i class="fa-solid fa-circle-info"></i>
            <span>关于</span>
          </div>

          <div class="about-card">
            <div class="about-logo">
              <i class="fa-solid fa-cube"></i>
            </div>
            <div class="about-name">萤光纪游</div>
            <div class="about-ver">版本 v1.1.0</div>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-key">发布日期</div>
              <div class="info-val">2026 年 8 月</div>
            </div>
            <div class="info-item">
              <div class="info-key">联系开发者个人邮箱</div>
              <div class="info-val">cynework@163.com</div>
            </div>
            <div class="info-item">
              <div class="info-key">反馈社区群</div>
              <div class="info-val">1104426831</div>
            </div>
          </div>

          <div class="about-text">
            <div class="about-text-title">简介</div>
            <p>
              本项目是一个养成类二创游戏，或许有bug和未完善的地方,请及时反馈给开发者
            </p>
          </div>
        </section>

        <!-- 感谢墙 -->
        <section id="thanks" ref="sectionRefs" class="content-section">
          <div class="page-title">
            <i class="fa-solid fa-heart"></i>
            <span>感谢墙</span>
          </div>

          <div class="thanks-lead">
            欢迎大家游玩此作品
          </div>

          <div class="thanks-section">
            <div class="thanks-cat">开发</div>
            <div class="thanks-list">
              <div class="thanks-card" v-for="i in 4" :key="'d'+i">
                <div class="thanks-avatar">
                  <i class="fa-solid fa-user"></i>
                </div>
                <div class="thanks-name">
   {{ ['个人+群友','个人+AI','群友',"米哈游"][i-1] }}
</div>
                <div class="thanks-role">{{ ['策划','程序','测试',"素材提供"][i-1] }}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- 官方游戏启动 -->
        <section id="launch" ref="sectionRefs" class="content-section">
          <div class="page-title">
            <i class="fa-solid fa-rocket"></i>
            <span>官方游戏</span>
          </div>

          <div class="game-path-setting">
            <div class="form-row">
              <div class="form-info">
                <div class="form-label">官方游戏路径</div>
                <div class="form-sub">请选择本机上 官方游戏 所在路径</div>
              </div>
              <div class="path-input-row">
                <input
                  type="text"
                  class="path-input"
                  v-model="gamePath"
                  disabled
                  placeholder="请选择 官方游戏 所在路径"
                />
                <button class="btn-gold" @click="selectPath" title="选择 官方游戏 路径">
                  <i class="fa-solid fa-folder-open"></i>
                  选择路径
                </button>
              </div>
            </div>

            <div class="path-hint">
              <i class="fa-solid fa-circle-info"></i>
              <span>配置好后，在主页右下角悬浮按钮即可启动游戏；若未配置或路径失效，点击悬浮按钮将自动跳转官网下载页（Windows则是优先使用Edge浏览器打开）。</span>
            </div>

            <div class="launch-row">
              <button
                v-if="gamePath"
                class="btn-ghost clear-path-btn"
                @click="clearGamePath"
                title="清除已配置路径"
              >
                <i class="fa-solid fa-eraser"></i>
                清除路径
              </button>
            </div>
          </div>
        </section>

        <!-- 模型借物致谢 -->
        <section id="credits" ref="sectionRefs" class="content-section">
          <div class="page-title">
            <i class="fa-solid fa-cube"></i>
            <span>模型借物致谢</span>
          </div>

          <div class="credits-lead">
            <i class="fa-solid fa-handshake-angle"></i>
            <span>本作品所使用的 3D 模型及素材均来自 MMD 社区创作者和原游戏中（崩坏：星穹铁道），在此对所有作者表示诚挚感谢。</span>
          </div>

          <div class="credits-table">
            <div class="credits-head">
              <div class="credits-col credits-col-name">人物 / 模型</div>
              <div class="credits-col credits-col-author">作者</div>
              <div class="credits-col credits-col-link">作者主页</div>
              <div class="credits-col credits-col-link">模型链接</div>
            </div>
            <div
              v-for="item in creditsList"
              :key="item.name"
              class="credits-row"
            >
              <div class="credits-col credits-col-name">{{ item.name }}</div>
              <div class="credits-col credits-col-author">{{ item.author }}</div>
              <div class="credits-col credits-col-link">
                <a
                  v-if="item.homeLink"
                  :href="item.homeLink"
                  @click.prevent="openCreditsLink(item.homeLink)"
                  class="credits-link"
                >
                  <i class="fa-solid fa-arrow-up-right-from-square"></i>
                  {{ item.homeLinkText || '主页' }}
                </a>
                <span v-else class="credits-link-empty">暂无</span>
              </div>
              <div class="credits-col credits-col-link">
                <a
                  v-if="item.modelLink"
                  :href="item.modelLink"
                  @click.prevent="openCreditsLink(item.modelLink)"
                  class="credits-link"
                >
                  <i class="fa-solid fa-arrow-up-right-from-square"></i>
                  {{ item.modelLinkText || '模型' }}
                </a>
                <span v-else class="credits-link-empty">暂无</span>
              </div>
            </div>
          </div>

          <div class="credits-tip">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>链接可能会失效，作者可能更换名称，如发现请及时联系本软件作者。</span>
          </div>
        </section>
      </main>
    </div>

    <!-- 使用条款查看弹窗 -->
    <AgreementModal
      v-model="showAgreement"
      mode="view"
      :pre-checked="agreementAccepted"
      @accepted="handleAgreementAccepted"
      @uncheck="handleAgreementUncheck"
    />

    <!-- 头像裁剪弹窗 -->
    <div
      v-if="showCropper"
      class="cropper-overlay"
      @click.self="closeCropper"
      @wheel.prevent.stop="noop"
      @touchmove.prevent.stop="noop"
    >
      <div class="cropper-modal" @wheel.prevent.stop="noop" @touchmove.prevent.stop="noop">
        <div class="cropper-header">裁剪头像</div>
        <div class="cropper-body">
          <div
            class="crop-container"
            ref="cropContainer"
            @wheel.prevent.stop="onImageWheel"
            @touchstart="onCropTouchStart"
            @touchmove.prevent.stop="onCropTouchMove"
            @touchend="onCropTouchEnd"
            @touchcancel="onCropTouchEnd"
          >
            <img
              ref="cropImage"
              :src="cropSrc"
              class="crop-image"
              :style="imgTransform"
              @pointerdown.prevent.stop="onImageMouseDown"
              @dragstart.prevent="() => false"
              @wheel.prevent.stop="onImageWheel"
            />
            <div
              class="crop-area"
              ref="cropAreaEl"
              :style="cropAreaStyle"
              @pointerdown.prevent.stop="onCropAreaMouseDown"
            >
              <div class="resize-handle top-left" @pointerdown.prevent.stop="onResizeStart($event, 'top-left')"></div>
              <div class="resize-handle top-right" @pointerdown.prevent.stop="onResizeStart($event, 'top-right')"></div>
              <div class="resize-handle bottom-left" @pointerdown.prevent.stop="onResizeStart($event, 'bottom-left')"></div>
              <div class="resize-handle bottom-right" @pointerdown.prevent.stop="onResizeStart($event, 'bottom-right')"></div>
            </div>
          </div>
          <div class="crop-hint">{{ cropHint }}</div>
        </div>
        <div class="cropper-footer">
          <button class="btn-ghost" @click="closeCropper">取消</button>
          <button class="btn-gold" @click="confirmCrop">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useDark } from '@vueuse/core'
import { useUserStore } from '@/config/user'
import { useBackgroundStore, PRESET_BACKGROUNDS } from '@/config/background'
import { useAudioSettingsStore } from '@/config/music'
import { useGoldStore } from '@/config/gold'
import { useInventoryStore } from '@/config/inventory'
import { useTasksStore } from '@/config/tasks'
import { useSaveSlotsStore, SAVE_KEYS } from '@/config/saveSlots'
import { loadAIConfig, saveAIConfig, AI_MODELS } from '@/services/ai'
import AgreementModal from '@/components/AgreementModal.vue'
import { AGREEMENT_ACCEPTED_KEY } from '@/config/agreement'
import { isTouchDevice } from '@/utils/device'

const router = useRouter()
const userStore = useUserStore()
const bgStore = useBackgroundStore()
const audioStore = useAudioSettingsStore()
const goldStore = useGoldStore()
const inventoryStore = useInventoryStore()
const tasksStore = useTasksStore()
const saveSlotsStore = useSaveSlotsStore()

// 暗黑模式（useDark 自动持久化并切换 <html class="dark">）
const isDark = useDark({ storageKey: 'theme_dark', initialValue: 'light' })

const activeNav = ref('account')
const navItems = [
  { key: 'back', label: '返回', icon: 'fa-solid fa-arrow-left' },
  { key: 'home', label: '主页', icon: 'fa-solid fa-house' },
  { key: 'account', label: '账户设置', icon: 'fa-solid fa-user' },
  { key: 'game', label: '游戏设置', icon: 'fa-solid fa-gamepad' },
  { key: 'appearance', label: '外观', icon: 'fa-solid fa-palette' },
  { key: 'about', label: '关于', icon: 'fa-solid fa-circle-info' },
  { key: 'thanks', label: '感谢墙', icon: 'fa-solid fa-heart' },
  { key: 'launch', label: '官方游戏', icon: 'fa-solid fa-rocket' },
  { key: 'credits', label: '借物致谢', icon: 'fa-solid fa-cube' }
]

// 模型借物表（人物 / 模型 名称、作者、作者主页链接、模型链接）
// 后续新增模型时在这里追加即可
const creditsList = ref([
  {
    name: '猫耳流萤',
    author: 'miHoYo|神帝宇|观海|鲜菓橙-Xan',
    homeLink: 'https://www.aplaybox.com/u/235791551',
    homeLinkText: 'PlayBox 主页',
    modelLink: 'https://www.aplaybox.com/details/model/3sZtUuHEbOOi',
    modelLinkText: 'PlayBox 模型',
  },
  {
    name: '商店仓库素材来源',
    author: '米哈游',
    homeLink: 'https://sr.mihoyo.com/',
    homeLinkText: '崩坏：星穹铁道官网',
    modelLink: '',
    modelLinkText: '',
  },
  {
    name: '看板娘icon',
    author: '萤萤昭耀',
    homeLink: ' https://b23.tv/NEpYdb3',
    homeLinkText: '萤萤昭耀的个人空间-哔哩哔哩',
    modelLink: '',
    modelLinkText: '',
  },
  {
    name: '背手动作',
    author: '李三岁',
    homeLink: 'https://www.aplaybox.com/u/394658396',
    homeLinkText: 'PlayBox 主页',
    modelLink: ' https://www.aplaybox.com/details/motion/DlS6SxrKhPBJ',
    modelLinkText: 'PlayBox 模型',
  },
])

// 借物表链接：Electron 环境下用系统浏览器（Windows 优先 Edge）打开，浏览器环境降级为新标签页
const openCreditsLink = (url) => {
  if (!url) return
  if (window.electronAPI?.isElectron && window.electronAPI.openExternal) {
    window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

// 使用条款查看入口（设置→账户设置→查看使用条款）
const showAgreement = ref(false)
// 是否已同意条款（决定查看模式下勾选框是否默认选中）
const agreementAccepted = computed(() => localStorage.getItem(AGREEMENT_ACCEPTED_KEY) === 'true')
// 在查看模式下重新同意条款（未同意时）
const handleAgreementAccepted = () => {
  localStorage.setItem(AGREEMENT_ACCEPTED_KEY, 'true')
}
// 在查看模式下取消勾选：移除同意标记并强制退出游戏
const handleAgreementUncheck = () => {
  localStorage.removeItem(AGREEMENT_ACCEPTED_KEY)
  showAgreement.value = false
  // Electron 模式下调用主进程退出；浏览器模式尝试关闭窗口
  if (window.electronAPI?.isElectron) {
    window.electronAPI.quitApp?.()
  } else {
    window.close()
  }
}

// 账户设置
const account = ref({
  username: '',
})

// 用户名是否已确认（确认后不可修改）
const usernameLocked = computed(() => userStore.isUsernameSet)

// AI 对话配置
const aiConfig = ref({
  baseUrl: '',
  apiKey: '',
  model: '',
  modelId: 'custom',
})

// 选择预置模型后自动匹配 API 地址与模型名；自定义时手动填写
function onModelChange(modelId) {
  if (modelId === 'custom') {
    aiConfig.value.baseUrl = ''
    aiConfig.value.model = ''
    return
  }
  const preset = AI_MODELS.find((m) => m.id === modelId)
  if (preset) {
    aiConfig.value.baseUrl = preset.baseUrl
    aiConfig.value.model = preset.model
  }
}

// 游戏设置
const game = ref({
  masterVolume: 80,
  bgmVolume: 60,
  sfxVolume: 70,
  voiceVolume: 75,
  fullscreen: false
})

// 实时同步主音量 / BGM 音量 slider 到全局 audio（BGM）——拖动即可生效，无需点保存
watch(
  () => [game.value.masterVolume, game.value.bgmVolume],
  ([m, b]) => {
    audioStore.masterVolume = m
    audioStore.bgmVolume = b
    audioStore.applyBgmVolume()
  }
)

// 背景设置本地状态（与 bgStore 同步）
const bgEnabledLocal = ref(false)
const bgOpacityLocal = ref(100)
const contentOpacityLocal = ref(100)
const bgFileInput = ref(null)

// 首页专属背景本地状态（与 bgStore 同步）
const homeBgEnabledLocal = ref(false)
const homeBgOpacityLocal = ref(100)
const homeBgFileInput = ref(null)

// 初始化背景本地状态
const initBgLocalState = () => {
  bgEnabledLocal.value = bgStore.enabled
  bgOpacityLocal.value = bgStore.opacity
  contentOpacityLocal.value = bgStore.contentOpacity
  homeBgEnabledLocal.value = bgStore.homeEnabled
  homeBgOpacityLocal.value = bgStore.homeOpacity
}

// 背景相关方法
const handleToggleBg = () => {
  if (bgEnabledLocal.value) {
    // 启用：如果没有设置过背景，默认选第一个预设
    if (bgStore.type === 'none') {
      bgStore.setPreset(PRESET_BACKGROUNDS[0].id)
    } else {
      bgStore.enabled = true
      bgStore.saveData()
    }
  } else {
    bgStore.disable()
  }
}

const handleSelectPreset = (presetId) => {
  bgStore.setPreset(presetId)
  bgEnabledLocal.value = true
}

const handleBgUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  // 限制图片大小（5MB）
  if (file.size > 5 * 1024 * 1024) {
    showCustomAlert('图片不能超过 5MB', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    bgStore.setCustom(e.target.result)
    bgEnabledLocal.value = true
  }
  reader.readAsDataURL(file)
  // 清空 input value 以便再次选择同一文件
  event.target.value = ''
}

const triggerBgUpload = () => {
  bgFileInput.value?.click()
}

const handleClearCustom = () => {
  bgStore.disable()
  bgEnabledLocal.value = false
}

const handleBgOpacityChange = () => {
  bgStore.setOpacity(bgOpacityLocal.value)
}

const handleContentOpacityChange = () => {
  bgStore.setContentOpacity(contentOpacityLocal.value)
}

// ====== 首页专属背景相关方法 ======
const handleToggleHomeBg = () => {
  if (homeBgEnabledLocal.value) {
    // 启用：如果没有设置过首页背景，默认选第一个预设
    if (bgStore.homeType === 'none') {
      bgStore.setHomePreset(PRESET_BACKGROUNDS[0].id)
    } else {
      bgStore.homeEnabled = true
      bgStore.saveData()
    }
  } else {
    bgStore.disableHome()
  }
}

const handleSelectHomePreset = (presetId) => {
  bgStore.setHomePreset(presetId)
  homeBgEnabledLocal.value = true
}

const handleHomeBgUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  // 限制图片大小（5MB）
  if (file.size > 5 * 1024 * 1024) {
    showCustomAlert('图片不能超过 5MB', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    bgStore.setHomeCustom(e.target.result)
    homeBgEnabledLocal.value = true
  }
  reader.readAsDataURL(file)
  // 清空 input value 以便再次选择同一文件
  event.target.value = ''
}

const triggerHomeBgUpload = () => {
  homeBgFileInput.value?.click()
}

const handleClearHomeCustom = () => {
  bgStore.disableHome()
  homeBgEnabledLocal.value = false
}

const handleHomeBgOpacityChange = () => {
  bgStore.setHomeOpacity(homeBgOpacityLocal.value)
}

// 设置的 localStorage key
const SETTINGS_KEY = 'userSettings'

// 从 localStorage 恢复设置
const loadSettings = () => {
  const saved = localStorage.getItem(SETTINGS_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (parsed.masterVolume !== undefined) game.value.masterVolume = parsed.masterVolume
      if (parsed.bgmVolume !== undefined) game.value.bgmVolume = parsed.bgmVolume
      if (parsed.sfxVolume !== undefined) game.value.sfxVolume = parsed.sfxVolume
      if (parsed.voiceVolume !== undefined) game.value.voiceVolume = parsed.voiceVolume
      if (parsed.fullscreen !== undefined) game.value.fullscreen = parsed.fullscreen
    } catch (e) {
      console.warn('读取设置失败，使用默认值')
    }
  }
  // 从社区 store 同步用户名
  if (userStore.currentUser && userStore.currentUser !== '玩家') {
    account.value.username = userStore.currentUser
  }
}

// 导入存档文件引用
const importFileInput = ref(null)

// 感谢墙

// 头像裁剪逻辑（从 setting.html 移植，Vue 响应式重构）
const avatarData = ref(localStorage.getItem('avatarData') || '')

// 裁剪弹窗状态
const showCropper = ref(false)
const cropSrc = ref('')
const fileInput = ref(null)
const cropContainer = ref(null)
const cropImage = ref(null)
const cropAreaEl = ref(null)

// 图片变换状态
const imgState = reactive({
  scale: 1,
  translateX: 0,
  translateY: 0,
  startX: 0,
  startY: 0,
  isDragging: false
})

// 裁剪区域状态
const cropState = reactive({
  left: 0,
  top: 0,
  size: 150,
  isDragging: false,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0
})

// 缩放状态
const resizeState = reactive({
  isResizing: false,
  handle: null,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
  startSize: 0
})

const imgTransform = computed(() => {
  const { scale, translateX, translateY } = imgState
  return { transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)` }
})

const cropAreaStyle = computed(() => {
  const { left, top, size } = cropState
  return {
    left: left + 'px',
    top: top + 'px',
    width: size + 'px',
    height: size + 'px',
    transform: 'none'
  }
})

// 操作提示随输入方式变化：触屏没有滚轮与鼠标，按原提示操作会「没反应」
const cropHint = computed(() =>
  isTouchDevice
    ? '单指拖动图片或裁剪框调整位置，双指捏合缩放，拖拽四角调整大小'
    : '拖动裁剪框或图片调整位置，滚轮缩放，拖拽四角调整大小'
)

const triggerUpload = () => {
  fileInput.value?.click()
}

const onFileSelect = (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    cropSrc.value = ev.target.result
    // 重置状态
    imgState.scale = 1
    imgState.translateX = 0
    imgState.translateY = 0
    cropState.left = 0
    cropState.top = 0
    cropState.size = 150
    // 打开弹窗后，等图片加载完成再居中裁剪框
    showCropper.value = true
  }
  reader.readAsDataURL(file)
  e.target.value = ''
}

// 等待图片加载后居中裁剪框
const onCropImageLoad = () => {
  nextTick(() => {
    const container = cropContainer.value
    const img = cropImage.value
    if (!container || !img) return
    const cw = container.offsetWidth
    const ch = container.offsetHeight
    cropState.left = (cw - cropState.size) / 2
    cropState.top = (ch - cropState.size) / 2
  })
}

// 监听图片加载
watch(() => cropSrc.value, (val) => {
  if (val) {
    nextTick(onCropImageLoad)
  }
})

// 空事件捕获（吃掉滚轮/滑动，避免传去页面）
const noop = () => {}

// 打开/关闭弹窗时锁住/释放 body 滚动，以及移除全局捕获的滚轮事件
let savedBodyOverflow = ''
let savedHtmlOverflow = ''
function lockBodyScroll() {
  savedBodyOverflow = document.body.style.overflow
  savedHtmlOverflow = document.documentElement.style.overflow
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
}
function unlockBodyScroll() {
  document.body.style.overflow = savedBodyOverflow
  document.documentElement.style.overflow = savedHtmlOverflow
}
// showCropper 变化时锁滚动
watch(showCropper, (show) => {
  if (show) {
    lockBodyScroll()
    // 在 window 层再加一层非 passive 捕获（兜底，@wheel.prevent 也会拦）
    window.addEventListener('wheel', onWheelCapture, { capture: true, passive: false })
    window.addEventListener('touchmove', onWheelCapture, { capture: true, passive: false })
  } else {
    unlockBodyScroll()
    window.removeEventListener('wheel', onWheelCapture, true)
    window.removeEventListener('touchmove', onWheelCapture, true)
  }
})
function onWheelCapture(e) {
  // 只要裁剪弹窗还开着，任何滚轮/触屏滑动都拦住，不让页面任何位置滚动
  if (!showCropper.value) return
  const path = e.composedPath?.() || []
  const targetIsInsideCropper = path.some((el) => el instanceof HTMLElement && el.closest('.cropper-overlay'))
  // 如果滚轮没在弹窗内部（例如悬浮在弹窗外黑色遮罩），也不能让页面滚
  if (!targetIsInsideCropper) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  // 在弹窗内的滚轮：如果在 crop-container 或图片上，交给 onImageWheel 处理
  const onImgOrContainer = path.some((el) =>
    el instanceof HTMLElement && (el.classList.contains('crop-container') || el.classList.contains('crop-image'))
  )
  if (!onImgOrContainer) {
    // 在弹窗头部/底部/说明文字上滑动：拦截，避免带着 page 一起滚
    e.preventDefault()
    e.stopPropagation()
  }
}
onBeforeUnmount(() => {
  unlockBodyScroll()
  window.removeEventListener('wheel', onWheelCapture, true)
  window.removeEventListener('touchmove', onWheelCapture, true)
  // 注意必须与注册时的 capture 标志一致，否则 removeEventListener 不生效
  // （原先这几行漏了 true，导致注册在捕获阶段的监听器一直没被摘掉）
  window.removeEventListener('pointermove', onImageMouseMove, true)
  window.removeEventListener('pointerup', onImageMouseUp, true)
  window.removeEventListener('pointercancel', onImageMouseUp, true)
  window.removeEventListener('pointermove', onCropAreaMouseMove, true)
  window.removeEventListener('pointerup', onCropAreaMouseUp, true)
  window.removeEventListener('pointercancel', onCropAreaMouseUp, true)
  window.removeEventListener('pointermove', onResizeMove, true)
  window.removeEventListener('pointerup', onResizeEnd, true)
  window.removeEventListener('pointercancel', onResizeEnd, true)
})

// 图片拖拽
const onImageMouseDown = (e) => {
  // 如果点击的是裁剪区域或四角 resize 手柄，不启动图片拖动（target 都是裁剪区 DOM）
  const cropArea = cropAreaEl.value
  if (cropArea && (e.target === cropArea || cropArea.contains(e.target))) return

  imgState.isDragging = true
  imgState.startX = e.clientX
  imgState.startY = e.clientY
  // pointer 事件同时覆盖鼠标与触摸：触屏上 mousemove 不会持续触发，拖动会「粘住」
  window.addEventListener('pointermove', onImageMouseMove, true)
  window.addEventListener('pointerup', onImageMouseUp, true)
  window.addEventListener('pointercancel', onImageMouseUp, true)
  if (e.preventDefault) e.preventDefault()
  if (e.stopPropagation) e.stopPropagation()
}

const onImageMouseMove = (e) => {
  if (!imgState.isDragging) return
  const deltaX = e.clientX - imgState.startX
  const deltaY = e.clientY - imgState.startY
  imgState.translateX += deltaX
  imgState.translateY += deltaY
  imgState.startX = e.clientX
  imgState.startY = e.clientY
  if (e.preventDefault) e.preventDefault()
  if (e.stopPropagation) e.stopPropagation()
}

const onImageMouseUp = (e) => {
  if (!imgState.isDragging) return
  imgState.isDragging = false
  window.removeEventListener('pointermove', onImageMouseMove, true)
  window.removeEventListener('pointerup', onImageMouseUp, true)
  window.removeEventListener('pointercancel', onImageMouseUp, true)
  if (e?.preventDefault) e.preventDefault()
  if (e?.stopPropagation) e.stopPropagation()
}

// 图片滚轮缩放
const onImageWheel = (e) => {
  // 双重保险：无论在 img 还是 crop-container 上滚轮，都阻止页面滚动，并做缩放
  if (e.preventDefault) e.preventDefault()
  if (e.stopPropagation) e.stopPropagation()
  if (e.stopImmediatePropagation) e.stopImmediatePropagation()
  const delta = (e.deltaY || e.wheelDeltaY) > 0 ? 0.9 : 1.1
  imgState.scale = Math.max(0.1, Math.min(3, imgState.scale * delta))
}

// ===== 双指捏合缩放（移动端没有滚轮）=====
// 单独用 touch 事件实现，而不是往上面的 pointer 逻辑里塞：
// TouchEvent 直接给出 e.touches 列表，取两指距离一步到位，
// 不必自己按 pointerId 维护集合；且双指落下时把拖动标志关掉即可避免冲突。
const CROP_SCALE_MIN = 0.1
const CROP_SCALE_MAX = 3
let cropPinchStartDist = 0
let cropPinchStartScale = 1

function touchPairDistance(touches) {
  if (!touches || touches.length < 2) return 0
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

const onCropTouchStart = (e) => {
  if (e.touches.length !== 2) return
  // 进入捏合：终止单指平移，否则两指的位移会同时改 translate，画面乱跳
  imgState.isDragging = false
  cropState.isDragging = false
  resizeState.isResizing = false
  cropPinchStartDist = touchPairDistance(e.touches)
  cropPinchStartScale = imgState.scale
}

const onCropTouchMove = (e) => {
  if (e.touches.length !== 2 || !cropPinchStartDist) return
  if (e.preventDefault) e.preventDefault()
  const dist = touchPairDistance(e.touches)
  if (dist <= 0) return
  // 以捏合起点为基准换算，避免逐帧累乘产生漂移
  const next = cropPinchStartScale * (dist / cropPinchStartDist)
  imgState.scale = Math.max(CROP_SCALE_MIN, Math.min(CROP_SCALE_MAX, next))
}

const onCropTouchEnd = (e) => {
  // 手指少于两根即退出捏合；保留 imgState.scale 作为新基准
  if (!e.touches || e.touches.length < 2) cropPinchStartDist = 0
}

// --- 裁剪框拖拽 ---
const onCropAreaMouseDown = (e) => {
  cropState.isDragging = true
  cropState.startX = e.clientX
  cropState.startY = e.clientY
  cropState.startLeft = cropState.left
  cropState.startTop = cropState.top
  window.addEventListener('pointermove', onCropAreaMouseMove, true)
  window.addEventListener('pointerup', onCropAreaMouseUp, true)
  window.addEventListener('pointercancel', onCropAreaMouseUp, true)
  if (e.preventDefault) e.preventDefault()
  if (e.stopPropagation) e.stopPropagation()
}

const onCropAreaMouseMove = (e) => {
  if (!cropState.isDragging) return
  const deltaX = e.clientX - cropState.startX
  const deltaY = e.clientY - cropState.startY
  const container = cropContainer.value
  const maxLeft = container ? container.clientWidth - cropState.size : 0
  const maxTop = container ? container.clientHeight - cropState.size : 0
  cropState.left = Math.max(0, Math.min(maxLeft, cropState.startLeft + deltaX))
  cropState.top = Math.max(0, Math.min(maxTop, cropState.startTop + deltaY))
  if (e.preventDefault) e.preventDefault()
  if (e.stopPropagation) e.stopPropagation()
}

const onCropAreaMouseUp = (e) => {
  if (!cropState.isDragging) return
  cropState.isDragging = false
  window.removeEventListener('pointermove', onCropAreaMouseMove, true)
  window.removeEventListener('pointerup', onCropAreaMouseUp, true)
  window.removeEventListener('pointercancel', onCropAreaMouseUp, true)
  if (e?.preventDefault) e.preventDefault()
  if (e?.stopPropagation) e.stopPropagation()
}

// --- 裁剪框缩放 ---
const onResizeStart = (e, handle) => {
  resizeState.isResizing = true
  resizeState.handle = handle
  resizeState.startX = e.clientX
  resizeState.startY = e.clientY
  resizeState.startLeft = cropState.left
  resizeState.startTop = cropState.top
  resizeState.startSize = cropState.size
  window.addEventListener('pointermove', onResizeMove, true)
  window.addEventListener('pointerup', onResizeEnd, true)
  window.addEventListener('pointercancel', onResizeEnd, true)
  if (e.preventDefault) e.preventDefault()
  if (e.stopPropagation) e.stopPropagation()
}

const onResizeMove = (e) => {
  if (!resizeState.isResizing) return
  const deltaX = e.clientX - resizeState.startX
  const deltaY = e.clientY - resizeState.startY
  const handle = resizeState.handle
  const container = cropContainer.value
  const cw = container ? container.clientWidth : 600
  const ch = container ? container.clientHeight : 300
  let newSize = resizeState.startSize

  // 保持圆形：两个方向取最大的绝对增量
  const absDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY))
  // 对于左上/左下：拖向 左/下 要区分；统一以"离起点越远越变大"为基准：
  // top-left：deltaX>0 向右 → 变小，deltaY>0 向下 → 变小 → sign = -1
  // bottom-right：deltaX>0 → 变大 → sign = +1
  const signMap = {
    'top-left': -1,
    'top-right': (deltaX > 0 ? 1 : -1) === (deltaY > 0 ? -1 : 1) ? 1 : 1, // 实际 top-right 是 deltaX 决定
    'bottom-left': 1,
    'bottom-right': 1,
  }
  const expandRight = deltaX > 0 ? 1 : -1
  const expandDown  = deltaY > 0 ? 1 : -1
  let sign = 1
  if (handle === 'top-left')      sign = (expandRight < 0 && expandDown < 0) ? 1 : -1
  else if (handle === 'top-right') sign = (expandRight > 0 && expandDown < 0) ? 1 : -1
  else if (handle === 'bottom-left') sign = (expandRight < 0 && expandDown > 0) ? 1 : -1
  else sign = (expandRight > 0 && expandDown > 0) ? 1 : -1

  newSize = Math.max(50, Math.min(Math.min(cw, ch), resizeState.startSize + sign * absDelta))

  let newLeft = resizeState.startLeft
  let newTop = resizeState.startTop
  if (handle === 'top-left') {
    newLeft = resizeState.startLeft + (resizeState.startSize - newSize)
    newTop  = resizeState.startTop  + (resizeState.startSize - newSize)
  } else if (handle === 'top-right') {
    newTop  = resizeState.startTop  + (resizeState.startSize - newSize)
  } else if (handle === 'bottom-left') {
    newLeft = resizeState.startLeft + (resizeState.startSize - newSize)
  }
  // bottom-right：保持左上角不动，直接增大右下角

  // 夹到容器内
  newLeft = Math.max(0, Math.min(cw - newSize, newLeft))
  newTop  = Math.max(0, Math.min(ch - newSize, newTop))

  cropState.size = newSize
  cropState.left = newLeft
  cropState.top  = newTop
  if (e.preventDefault) e.preventDefault()
  if (e.stopPropagation) e.stopPropagation()
}

const onResizeEnd = (e) => {
  if (!resizeState.isResizing) return
  resizeState.isResizing = false
  resizeState.handle = null
  window.removeEventListener('pointermove', onResizeMove, true)
  window.removeEventListener('pointerup', onResizeEnd, true)
  window.removeEventListener('pointercancel', onResizeEnd, true)
  if (e?.preventDefault) e.preventDefault()
  if (e?.stopPropagation) e.stopPropagation()
}

const closeCropper = () => {
  showCropper.value = false
  cropSrc.value = ''
  imgState.scale = 1
  imgState.translateX = 0
  imgState.translateY = 0
  cropState.left = 0
  cropState.top = 0
  cropState.size = 150
}

const confirmCrop = () => {
  const img = cropImage.value
  const container = cropContainer.value
  if (!img || !container) return closeCropper()

  const canvas = document.createElement('canvas')
  const size = 200
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const cropArea = cropAreaEl.value
  const cropRect = cropArea.getBoundingClientRect()
  const imageRect = img.getBoundingClientRect()

  // 裁剪框相对于图片实际渲染区域的比例
  // imageRect 已包含 object-fit: contain 和 CSS transform 的全部效果
  const relX = (cropRect.left - imageRect.left) / imageRect.width
  const relY = (cropRect.top - imageRect.top) / imageRect.height
  const relW = cropRect.width / imageRect.width
  const relH = cropRect.height / imageRect.height

  // 映射到原始图片坐标
  const naturalW = img.naturalWidth
  const naturalH = img.naturalHeight
  const sx = relX * naturalW
  const sy = relY * naturalH
  const sw = relW * naturalW
  const sh = relH * naturalH

  // 圆形裁剪
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)

  // 保存结果
  avatarData.value = canvas.toDataURL('image/png')
  localStorage.setItem('avatarData', avatarData.value)
  showCustomAlert('头像上传成功！', 'success')
  closeCropper()
}

// 简单的提示弹窗
const showCustomAlert = (message, type = 'info') => {
  const div = document.createElement('div')
  div.className = `custom-alert custom-alert-${type}`
  div.textContent = message
  Object.assign(div.style, {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 28px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '10001',
    color: '#fff',
    background: type === 'success' ? '#52c41a' : '#1677ff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 0.3s ease'
  })
  document.body.appendChild(div)
  setTimeout(() => {
    div.style.opacity = '0'
    setTimeout(() => div.remove(), 300)
  }, 2000)
}

// 暂未开放的功能：点击统一提示
const notAvailable = () => showCustomAlert('功能暂不开放', 'error')

// 点击导航：返回或滚动到对应区域
const handleNavClick = (item) => {
  if (item.key === 'back') {
    handleBack()
    return
  }
  if (item.key === 'home') {
    router.push('/')
    return
  }
  activeNav.value = item.key
  const el = document.getElementById(item.key)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 滚动时自动高亮当前导航项
const sectionKeys = ['account', 'game', 'appearance', 'about', 'thanks', 'launch']

const handleScroll = () => {
  const scrollY = window.scrollY
  let current = 'account'
  for (const key of sectionKeys) {
    const el = document.getElementById(key)
    if (el) {
      const top = el.offsetTop - 80
      if (scrollY >= top) {
        current = key
      }
    }
  }
  activeNav.value = current
}

// 确认用户名
const confirmUsername = () => {
  const name = account.value.username.trim()
  if (!name) return
  if (!confirm(`确定使用「${name}」作为用户名吗？确认后不可修改。`)) return
  userStore.setCurrentUser(name)
  showCustomAlert(`用户名「${name}」已确认！`, 'success')
}

const handleSave = () => {
  const settings = {
    masterVolume: game.value.masterVolume,
    bgmVolume: game.value.bgmVolume,
    sfxVolume: game.value.sfxVolume,
    voiceVolume: game.value.voiceVolume,
    fullscreen: game.value.fullscreen,
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  // 同步到音频 store 并应用
  audioStore.masterVolume = game.value.masterVolume
  audioStore.bgmVolume = game.value.bgmVolume
  audioStore.applyBgmVolume()
  showCustomAlert('设置已保存！', 'success')
}

// 切换角色：打开存档槽选择界面
const handleSwitchSlot = () => {
  saveSlotsStore.openSelector()
}

function handleSaveAIConfig() {
  if (!aiConfig.value.modelId) {
    showCustomAlert('请先选择 AI 模型', 'error')
    return
  }
  if (!aiConfig.value.baseUrl.trim() || !aiConfig.value.model.trim()) {
    showCustomAlert('请填写 API 地址和模型名称', 'error')
    return
  }
  // Ollama 本地模型无需 API Key；其他模型需要
  if (aiConfig.value.modelId !== 'ollama' && !aiConfig.value.apiKey.trim()) {
    showCustomAlert('请填写 API Key', 'error')
    return
  }
  saveAIConfig(aiConfig.value)
  showCustomAlert('AI 配置已保存', 'success')
}

// 存档导出
// 导出清单 = 存档白名单（SAVE_KEYS，随槽位隔离的进度数据）+ 跨槽位的全局偏好。
// 统一从 saveSlots.js 取清单，避免以后新增字段时导出/导入漏项。
const EXPORT_EXTRA_KEYS = [
  'official_game_path',   // 官方游戏路径（本机路径，跨槽共享）
  'music_folder_path',    // 音乐文件夹路径（本机路径，跨槽共享）
]
const EXPORT_KEYS = [...SAVE_KEYS, ...EXPORT_EXTRA_KEYS]

const handleSaveArchive = async () => {
  const gameData = {}
  for (const k of EXPORT_KEYS) {
    const v = localStorage.getItem(k)
    if (v !== null) gameData[k] = v
  }
  gameData.createdAt = new Date().toISOString()
  const json = JSON.stringify(gameData, null, 2)
  const fileName = `save_${new Date().toISOString().slice(0, 10)}.json`

  // Electron 环境：使用原生保存对话框
  if (window.electronAPI?.isElectron) {
    try {
      const result = await window.electronAPI.showSaveDialog({
        title: '保存存档',
        defaultPath: fileName,
        filters: [{ name: '存档文件', extensions: ['json'] }],
      })
      if (!result.canceled && result.filePath) {
        await window.electronAPI.writeFile(result.filePath, json)
        showCustomAlert('存档已保存！', 'success')
      }
    } catch (err) {
      showCustomAlert('保存失败: ' + err.message, 'error')
    }
  } else {
    // 浏览器环境：降级为 Blob 下载
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    showCustomAlert('存档已保存到本地！', 'success')
  }
}

// 存档导入
const triggerImport = async () => {
  // Electron 环境：使用原生打开对话框
  if (window.electronAPI?.isElectron) {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: '选择存档文件',
        filters: [{ name: '存档文件', extensions: ['json'] }],
        properties: ['openFile'],
      })
      if (!result.canceled && result.filePaths?.length) {
        const fileData = await window.electronAPI.readFile(result.filePaths[0])
        if (fileData.success) {
          importFromData(fileData.content)
        } else {
          showCustomAlert('读取文件失败', 'error')
        }
      }
    } catch (err) {
      showCustomAlert('打开失败: ' + err.message, 'error')
    }
  } else {
    // 浏览器环境：使用 file input
    importFileInput.value?.click()
  }
}

const importFromData = (content) => {
  try {
    const data = JSON.parse(content)
    if (!confirm('确定要导入存档吗？这将覆盖当前的游戏数据！')) return

    // 按导出清单回写（空值 / null 跳过，避免把已有数据抹掉）
    for (const k of EXPORT_KEYS) {
      const v = data[k]
      if (v === null || v === undefined || v === '') continue
      localStorage.setItem(k, String(v))
    }

    // 兼容旧存档：旧版把签到记录存在 signin_data，实际读取的是 signin_calendar_data
    if (data.signin_data && !data.signin_calendar_data) {
      localStorage.setItem('signin_calendar_data', data.signin_data)
    }

    // 兼容旧存档：game_inventory 里如果包含 gold，也单独迁移一份出来
    if (data.game_inventory && !data.game_gold) {
      try {
        const inv = JSON.parse(data.game_inventory)
        if (typeof inv.gold === 'number') {
          localStorage.setItem('game_gold', JSON.stringify({ gold: inv.gold }))
        }
      } catch (_) { /* ignore parse errors */ }
    }

    // 刷新设置 UI + 各 store 内存状态
    loadSettings()
    loadGamePath?.()
    audioStore.loadSettings()
    audioStore.applyBgmVolume()
    userStore.loadData?.()
    bgStore.loadData?.()
    goldStore.loadData?.()
    inventoryStore.loadData?.()
    tasksStore.loadData?.()

    showCustomAlert('存档导入成功！请刷新页面以应用更改。', 'success')
  } catch (err) {
    showCustomAlert('无效的存档文件！', 'error')
  }
}

const handleImportArchive = (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    importFromData(event.target.result)
  }
  reader.readAsText(file)
  e.target.value = ''
}

//清空所有数据
const handleClearData = async () => {
  if (!confirm('确定要清空所有数据吗？这将删除所有游戏进度、账户设置、头像、全部存档槽，以及已落盘的存档文件与图片。此操作不可撤销！')) return

  // 1) 先清理落盘文件（存档槽 save_slot_*.cns、图片目录）
  //    必须赶在 localStorage.clear() 之前：槽位指针 current_slot_id 一旦被清掉，
  //    下次启动就会弹出存档选择，选回旧槽位即可把已删数据原样恢复回来。
  let fileNote = ''
  if (window.electronAPI?.clearAllData) {
    try {
      const res = await window.electronAPI.clearAllData()
      fileNote = res?.success
        ? `（同时删除了 ${res.removedSlots} 个存档文件、${res.removedImages} 个图片文件）`
        : `（注意：存档文件清理失败 ${res?.error || ''}，请手动删除数据目录）`
    } catch (e) {
      fileNote = '（注意：存档文件清理失败，请手动删除数据目录）'
    }
  }

  // 2) 清空 localStorage（浏览器端槽位数据也在此，会一并清除）
  localStorage.clear()

  // 重置当前页面状态
  account.value.username = ''
  game.value.masterVolume = 80
  game.value.bgmVolume = 60
  game.value.sfxVolume = 70
  game.value.voiceVolume = 75
  game.value.fullscreen = false
  avatarData.value = ''
  gamePath.value = ''

  // 重置 Pinia store 内存状态
  // options API store：使用内置 $reset 回到 state() 默认值
  saveSlotsStore.$reset?.()
  userStore.$reset?.()
  bgStore.$reset?.()
  goldStore.$reset?.()
  inventoryStore.$reset?.()
  tasksStore.$reset?.()
  // setup API audio store：手动回到默认
  audioStore.masterVolume = 80
  audioStore.bgmVolume = 60
  audioStore.sfxVolume = 70


  // 各 store 的 loadData 在 LS 为空时会写回默认（包含好感度 100、行动点默认等）
  goldStore.loadData?.()
  inventoryStore.loadData?.()
  userStore.loadData?.()
  tasksStore.loadData?.()
  bgStore.saveData?.()
  // 设置 UI：重新从空 LS 读取 → 得到默认值
  loadSettings()
  loadGamePath?.()
  // 音量应用到 audio 元素
  audioStore.applyBgmVolume?.()

  showCustomAlert(`所有数据已清空${fileNote}！请重启软件以应用更改。`, 'success')
}

//全屏切换
const toggleFullscreen = (val) => {
  if (val) {
    document.documentElement.requestFullscreen?.().catch(() => {})
  } else {
    if (document.fullscreenElement) document.exitFullscreen?.()
  }
}

watch(() => game.value.fullscreen, (val) => {
  toggleFullscreen(val)
})

const handleBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

//官方游戏
const GAME_PATH_KEY = 'official_game_path'
const gamePath = ref('')

const loadGamePath = () => {
  const saved = localStorage.getItem(GAME_PATH_KEY)
  if (saved) gamePath.value = saved
}

const selectPath = async () => {
  if (!window.electronAPI?.isElectron) {
    showCustomAlert('请在桌面端使用此功能', 'error')
    return
  }
  try {
    const result = await window.electronAPI.selectGamePath()
    if (!result) return
    // 兼容旧版纯字符串返回
    const path = typeof result === 'string' ? result : result.path
    const error = typeof result === 'string' ? '' : result.error
    if (error) {
      showCustomAlert(error, 'error')
      return
    }
    if (path) {
      gamePath.value = path
      localStorage.setItem(GAME_PATH_KEY, path)
      showCustomAlert('路径已保存！', 'success')
    }
  } catch (err) {
    showCustomAlert('选择路径失败: ' + err.message, 'error')
  }
}

const clearGamePath = () => {
  if (!confirm('确定清除已配置的游戏路径吗？')) return
  gamePath.value = ''
  localStorage.removeItem(GAME_PATH_KEY)
  showCustomAlert('已清除游戏路径', 'success')
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll)
  userStore.loadData()
  loadSettings()
  loadGamePath()
  aiConfig.value = loadAIConfig()
  bgStore.loadData()
  initBgLocalState()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped src="@/assets/styles/set.css"></style>