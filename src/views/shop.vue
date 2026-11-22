<template>
  <div class="warehouse">
    <div class="warehouse-body">
      <button v-if="!embedded" class="back-btn" title="返回主页" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回</span>
      </button>
      <div v-if="!embedded" class="shop-title">商店</div>

      <!-- 金币 + 仓库图标（嵌进背包时由外壳统一显示金币，这里不再重复） -->
      <div v-if="!embedded" class="top-actions">
        <div class="gold-display" title="金币">
          <i class="fa-solid fa-coins"></i>
          <span>{{ goldStore.currentGold }}</span>
        </div>
        <button v-if="!embedded" class="warehouse-btn" title="仓库" @click="goWarehouse">
          <i class="fa-solid fa-warehouse"></i>
        </button>
      </div>

      <!-- 标签页 -->
      <div class="nav">
        <el-tabs v-model="activeName" class="demo-tabs">
          <el-tab-pane label="物品" name="first">
            
            <ViewSwitcher v-model="itemView" :options="viewOptions">
              <template #default="{ current }">
                <div v-if="current === 'card'" key="card" class="item-cards">
                  <el-popover v-for="item in itemData" :key="item.id" title="效果" :content="item.decs2 || item.desc" placement="top" trigger="click" :width="220" popper-class="gold-popover">
                    <template #reference>
                      <div class="item-card">
                        <div class="card-icon">
                          <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                          <i v-else :class="item.icon || 'fa-solid fa-box'"></i>
                        </div>
                        <div class="card-name">{{ item.name }}</div>
                        <div class="card-desc">{{ item.desc }}</div>
                        <div class="card-price">
                          <i class="fa-solid fa-coins"></i>
                          <span v-if="hasDiscount(item)" class="price-was">{{ item.price }}</span>
                          <span :class="{ 'price-now': hasDiscount(item) }">{{ finalPrice(item) }}</span>
                        </div>
                        <button class="buy-btn" @click.stop="handleBuy(item)">购买</button>
                      </div>
                    </template>
                  </el-popover>
                </div>
                <!-- 列表式 -->
                <div v-else key="list" class="item-list">
                  <el-popover v-for="item in itemData" :key="item.id" title="效果" :content="item.decs2 || item.desc" placement="top" trigger="click" :width="220" popper-class="gold-popover">
                    <template #reference>
                      <div class="list-item">
                        <div class="list-icon">
                          <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                          <i v-else :class="item.icon || 'fa-solid fa-box'"></i>
                        </div>
                        <div class="list-info">
                          <div class="list-name">{{ item.name }}</div>
                          <div class="list-desc">{{ item.desc }}</div>
                        </div>
                        <div class="list-price">
                          <i class="fa-solid fa-coins"></i>
                          <span v-if="hasDiscount(item)" class="price-was">{{ item.price }}</span>
                          <span :class="{ 'price-now': hasDiscount(item) }">{{ finalPrice(item) }}</span>
                        </div>
                        <button class="list-buy-btn" @click.stop="handleBuy(item)">购买</button>
                      </div>
                    </template>
                  </el-popover>
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
                <div v-if="current === 'card'" key="card" class="clothing-cards">
                  <el-popover v-for="item in clothingData" :key="item.id" title="效果" :content="item.decs2 || item.desc" placement="top" trigger="click" :width="220" popper-class="gold-popover">
                    <template #reference>
                      <div class="clothing-card">
                        <div class="clothing-portrait">
                          <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="portrait-img" :class="{ 'portrait-img-xbd': item.id === 102 }" />
                          <div v-else class="portrait-fallback">
                            <i :class="item.icon || 'fa-solid fa-shirt'"></i>
                          </div>
                          <div v-if="isOwned(item)" class="owned-badge">已拥有</div>
                        </div>
                        <div class="clothing-name">{{ item.name }}</div>
                        <div class="clothing-footer">
                          <div class="clothing-price">
                            <i class="fa-solid fa-coins"></i>
                            <span v-if="hasDiscount(item)" class="price-was">{{ item.price }}</span>
                            <span :class="{ 'price-now': hasDiscount(item) }">{{ finalPrice(item) }}</span>
                          </div>
                          <button class="clothing-buy-btn" @click.stop="handleBuy(item)" :disabled="clothingBuyDisabled && isOwned(item)">
                            {{ isOwned(item) ? '已拥有' : '购买' }}
                          </button>
                        </div>
                      </div>
                    </template>
                  </el-popover>
                </div>
                <div v-else key="list" class="item-list">
                  <el-popover v-for="item in clothingData" :key="item.id" title="效果" :content="item.decs2 || item.desc" placement="top" trigger="click" :width="220" popper-class="gold-popover">
                    <template #reference>
                      <div class="list-item">
                        <div class="list-icon">
                          <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                          <i v-else :class="item.icon || 'fa-solid fa-shirt'"></i>
                        </div>
                        <div class="list-info">
                          <div class="list-name">{{ item.name }}</div>
                          <div class="list-desc">{{ item.desc }}</div>
                        </div>
                        <div class="list-price">
                          <i class="fa-solid fa-coins"></i>
                          <span v-if="hasDiscount(item)" class="price-was">{{ item.price }}</span>
                          <span :class="{ 'price-now': hasDiscount(item) }">{{ finalPrice(item) }}</span>
                        </div>
                        <button class="list-buy-btn" @click.stop="handleBuy(item)" :disabled="clothingBuyDisabled && isOwned(item)">购买</button>
                      </div>
                    </template>
                  </el-popover>
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
import { useRouter, useRoute } from 'vue-router'
import { ref, computed } from 'vue'
import ViewSwitcher from '@/components/ViewSwitcher.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useInventoryStore } from '@/config/inventory'
import { useGoldStore } from '@/config/gold'
import { applyShopDiscount } from '@/config/affectionUnlocks'
import { ElMessageBox } from 'element-plus'
import { goBackOrHome } from '@/utils/nav'

const router = useRouter()
const route = useRoute()
// 作为「背包」的子页嵌入时，隐藏自己的返回键与标题（由 Bag.vue 提供外壳）
const embedded = computed(() => route.path.startsWith('/bag'))
const store = useInventoryStore()
const goldStore = useGoldStore()

// 商品实际售价（含好感度阶段折扣）。
// ★ 必须和 inventory.buyItem 里用的是同一个 applyShopDiscount ——
//   两边算法不一致就会出现「看着便宜、扣的是原价」（2026-10-09）
const finalPrice = (item) => applyShopDiscount(item?.price || 0, store.affection)
// 是否真的打了折 —— 决定「原价划掉 + 折后价高亮」这一组要不要出现。
// 没折扣时只显示一个价格，别给玩家看一个划掉的原价徒增困惑
const hasDiscount = (item) => finalPrice(item) < (item?.price || 0)

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

const goBack = () => goBackOrHome(router)

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
