<template>
  <div class="warehouse">
    <div class="warehouse-body">
      <button class="back-btn" title="返回主页" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回</span>
      </button>
      <div class="shop-title">商店</div>

      <!-- 金币 + 仓库图标 -->
      <div class="top-actions">
        <div class="gold-display" title="金币">
          <i class="fa-solid fa-coins"></i>
          <span>{{ goldStore.currentGold }}</span>
        </div>
        <button class="warehouse-btn" title="仓库" @click="goWarehouse">
          <i class="fa-solid fa-warehouse"></i>
        </button>
      </div>

      <!-- 标签页 -->
      <div class="nav">
        <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick">
          <el-tab-pane label="物品" name="first">
            
            <ViewSwitcher v-model="itemView" :options="viewOptions">
              <template #default="{ current }">
                <div v-if="current === 'card'" class="item-cards">
                  <div v-for="item in itemData" :key="item.id" class="item-card">
                    <div class="card-icon">
                      <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                      <i v-else :class="item.icon || 'fa-solid fa-box'"></i>
                    </div>
                    <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                      <template #reference>
                        <div class="card-name">{{ item.name }}</div>
                      </template>
                    </el-popover>
                    <div class="card-desc">{{ item.desc }}</div>
                    <div class="card-price">
                      <i class="fa-solid fa-coins"></i>
                      {{ item.price }}
                    </div>
                    <button class="buy-btn" @click="handleBuy(item)">购买</button>
                  </div>
                </div>
                <!-- 列表式 -->
                <div v-else class="item-list">
                  <div v-for="item in itemData" :key="item.id" class="list-item">
                    <div class="list-icon">
                      <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                      <i v-else :class="item.icon || 'fa-solid fa-box'"></i>
                    </div>
                    <div class="list-info">
                      <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                        <template #reference>
                          <div class="list-name">{{ item.name }}</div>
                        </template>
                      </el-popover>
                      <div class="list-desc">{{ item.desc }}</div>
                    </div>
                    <div class="list-price">
                      <i class="fa-solid fa-coins"></i>
                      {{ item.price }}
                    </div>
                    <button class="list-buy-btn" @click="handleBuy(item)">购买</button>
                  </div>
                </div>
              </template>
            </ViewSwitcher>
          </el-tab-pane>

          <el-tab-pane label="服装" name="second">
            <ViewSwitcher v-model="clothingView" :options="viewOptions">
              <template #toolbar>
                <div class="clothing-controls">
                  <el-switch
                    v-model="clothingBuyDisabled"
                    
                  />
                  <span class="clothing-status-text">
                    {{ clothingBuyDisabled ? '不可购买服装显示' : '可购买服装显示' }}
                  </span>
                </div>
              </template>
              <template #default="{ current }">
                <div v-if="current === 'card'" class="clothing-cards">
                  <div v-for="item in clothingData" :key="item.id" class="clothing-card">
                    <div class="clothing-portrait">
                      <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="portrait-img" :class="{ 'portrait-img-hanld': item.id === 108, 'portrait-img-xbd': item.id === 103 }" />
                      <div v-else class="portrait-fallback">
                        <i :class="item.icon || 'fa-solid fa-shirt'"></i>
                      </div>
                      <div v-if="isOwned(item)" class="owned-badge">已拥有</div>
                    </div>
                    <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                      <template #reference>
                        <div class="clothing-name">{{ item.name }}</div>
                      </template>
                    </el-popover>
                    <div class="clothing-footer">
                      <div class="clothing-price">
                        <i class="fa-solid fa-coins"></i>
                        {{ item.price }}
                      </div>
                      <button class="clothing-buy-btn" @click="handleBuy(item)" :disabled="clothingBuyDisabled && isOwned(item)">
                        {{ isOwned(item) ? '已拥有' : '购买' }}
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else class="item-list">
                  <div v-for="item in clothingData" :key="item.id" class="list-item">
                    <div class="list-icon">
                      <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                      <i v-else :class="item.icon || 'fa-solid fa-shirt'"></i>
                    </div>
                    <div class="list-info">
                      <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                        <template #reference>
                          <div class="list-name">{{ item.name }}</div>
                        </template>
                      </el-popover>
                      <div class="list-desc">{{ item.desc }}</div>
                    </div>
                    <div class="list-price">
                      <i class="fa-solid fa-coins"></i>
                      {{ item.price }}
                    </div>
                    <button class="list-buy-btn" @click="handleBuy(item)" :disabled="clothingBuyDisabled && isOwned(item)">购买</button>
                  </div>
                </div>
              </template>
            </ViewSwitcher>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 购买确认框 -->
    <ConfirmDialog
      v-model="showConfirm"
      title="提示"
      message="确定购买此物品？"
      confirm-text="确定"
      @confirm="confirmBuy"
    />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ref, computed } from 'vue'
import ViewSwitcher from '@/components/ViewSwitcher.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useInventoryStore } from '@/config/inventory'
import { useGoldStore } from '@/config/gold'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const store = useInventoryStore()
const goldStore = useGoldStore()

// 判断 icon 是否为图片（非字体图标）
const isImg = (icon) => icon && !icon.startsWith('fa')

const activeName = ref('first')

const viewOptions = [
  { label: '卡片', value: 'card' },
  { label: '列表', value: 'list' }
]
const itemView = ref('card')
const clothingView = ref('card')

// 服装购买开关：true=禁止购买已拥有的（按钮禁用）/ false=允许购买所有（含重复警告）
const clothingBuyDisabled = ref(false)

const itemData = computed(() => store.shopItems('item'))
const clothingData = computed(() => store.shopItems('clothing'))

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

const handleClick = (tab) => {
  console.log('切换标签:', tab)
}

const handleBuy = (item) => {
  // 服装且已拥有 → 弹出警告
  if (item.category === 'clothing' && (store.inventory[item.id] || 0) > 0) {
    ElMessageBox.alert('您已拥有该服装，不可重复购买！', '提示', {
      confirmButtonText: '知道了',
      type: 'warning',
    })
    return
  }
  // 正常弹出确认框
  confirmItem.value = item
  showConfirm.value = true
}

const showConfirm = ref(false)
const confirmItem = ref(null)

const confirmBuy = () => {
  if (confirmItem.value) {
    store.buyItem(confirmItem.value.id, 1)
    confirmItem.value = null
  }
}

const goWarehouse = () => {
  router.push('/warehouse')
}
const isOwned = (item) => {
  // 仅服装类
  if (item.category === 'clothing') {
    return (store.inventory[item.id] || 0) > 0
  }
  return false
}

</script>

<style scoped src="@/assets/styles/shop.css"></style>
