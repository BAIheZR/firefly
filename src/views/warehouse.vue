<template>
  <div class="warehouse">
    <div class="warehouse-body">
      <button class="back-btn" title="返回主页" @click="goBack">
        <i class="fa-solid fa-arrow-left"></i>
        <span>返回</span>
      </button>
      <div class="shop-title">仓库</div>

      <!-- 金币 -->
      <div class="top-actions">
        <div class="gold-display" title="金币">
          <i class="fa-solid fa-coins"></i>
          <span>{{ goldStore.currentGold }}</span>
        </div>
      </div>

      <!-- 标签页 -->
      <div class="nav">
        <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick">
          <el-tab-pane label="全部" name="all">
            <ViewSwitcher v-model="allView" :options="viewOptions">
              <template #default="{ current }">
                <div v-if="allData.length" :key="current" :class="current === 'card' ? 'item-cards' : 'item-list'">
                  <div v-for="item in allData" :key="item.id" :class="current === 'card' ? 'item-card' : 'list-item'">
                    <div :class="current === 'card' ? 'card-icon' : 'list-icon'">
                      <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                      <i v-else :class="item.icon || 'fa-solid fa-box'"></i>
                    </div>
                    <template v-if="current === 'card'">
                      <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                        <template #reference>
                          <div class="card-name">{{ item.name }}</div>
                        </template>
                      </el-popover>
                      <div class="card-desc">{{ item.desc }}</div>
                      <div class="card-price">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        {{ item.count }}
                      </div>
                      <div v-if="item.category !== 'clothing'" class="card-sell">
                        <i class="fa-solid fa-coins"></i> 出售 +{{ sellPriceOf(item) }}
                      </div>
                      <button v-if="item.category === 'clothing'" class="buy-btn" disabled>不可出售</button>
                      <div v-else class="card-btns">
                        <button class="buy-btn" @click="handleUse(item)">使用</button>
                        <button class="buy-btn" @click="handleSell(item)">出售</button>
                      </div>
                    </template>
                    <template v-else>
                      <div class="list-info">
                        <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                          <template #reference>
                            <div class="list-name">{{ item.name }}</div>
                          </template>
                        </el-popover>
                        <div class="list-desc">{{ item.desc }}</div>
                      </div>
                      <div class="list-price">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        {{ item.count }}
                        <span v-if="item.category !== 'clothing'" class="list-sell">
                          <i class="fa-solid fa-coins"></i>+{{ sellPriceOf(item) }}
                        </span>
                      </div>
                      <button v-if="item.category === 'clothing'" class="list-buy-btn" disabled>不可出售</button>
                      <div v-else class="list-btns">
                        <button class="list-buy-btn" @click="handleUse(item)">使用</button>
                        <button class="list-buy-btn" @click="handleSell(item)">出售</button>
                      </div>
                    </template>
                  </div>
                </div>
                <div v-else class="empty-state">
                  <i class="fa-regular fa-folder-open"></i>
                  <p>仓库空空如也</p>
                </div>
              </template>
            </ViewSwitcher>
          </el-tab-pane>

          <el-tab-pane label="物品" name="first">
            <ViewSwitcher v-model="itemView" :options="viewOptions">
              <template #default="{ current }">
                <div v-if="itemData.length" :key="current" :class="current === 'card' ? 'item-cards' : 'item-list'">
                  <div v-for="item in itemData" :key="item.id" :class="current === 'card' ? 'item-card' : 'list-item'">
                    <div :class="current === 'card' ? 'card-icon' : 'list-icon'">
                      <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="item-img" />
                      <i v-else :class="item.icon || 'fa-solid fa-box'"></i>
                    </div>
                    <template v-if="current === 'card'">
                      <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                        <template #reference>
                          <div class="card-name">{{ item.name }}</div>
                        </template>
                      </el-popover>
                      <div class="card-desc">{{ item.desc }}</div>
                      <div class="card-price">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        {{ item.count }}
                      </div>
                      <div class="card-sell">
                        <i class="fa-solid fa-coins"></i> 出售 +{{ sellPriceOf(item) }}
                      </div>
                      <div class="card-btns">
                        <button class="buy-btn" @click="handleUse(item)">使用</button>
                        <button class="buy-btn" @click="handleSell(item)">出售</button>
                      </div>
                    </template>
                    <template v-else>
                      <div class="list-info">
                        <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                          <template #reference>
                            <div class="list-name">{{ item.name }}</div>
                          </template>
                        </el-popover>
                        <div class="list-desc">{{ item.desc }}</div>
                      </div>
                      <div class="list-price">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        {{ item.count }}
                        <span class="list-sell">
                          <i class="fa-solid fa-coins"></i>+{{ sellPriceOf(item) }}
                        </span>
                      </div>
                      <div class="list-btns">
                        <button class="list-buy-btn" @click="handleUse(item)">使用</button>
                        <button class="list-buy-btn" @click="handleSell(item)">出售</button>
                      </div>
                    </template>
                  </div>
                </div>
                <div v-else class="empty-state">
                  <i class="fa-regular fa-folder-open"></i>
                  <p>仓库空空如也</p>
                </div>
              </template>
            </ViewSwitcher>
          </el-tab-pane>

          <el-tab-pane label="服装" name="second">
            <ViewSwitcher v-model="clothingView" :options="viewOptions">
              <template #default="{ current }">
                <div v-if="current === 'card' && clothingData.length" key="card" class="clothing-cards">
                  <div v-for="item in clothingData" :key="item.id" class="clothing-card">
                    <div class="clothing-portrait">
                      <img v-if="isImg(item.icon)" :src="item.icon" :alt="item.name" class="portrait-img" :class="{ 'portrait-img-hanld': item.id === 108, 'portrait-img-xbd': item.id === 103 }" />
                      <div v-else class="portrait-fallback">
                        <i :class="item.icon || 'fa-solid fa-shirt'"></i>
                      </div>
                    </div>
                    <el-popover title="效果" :content="item.decs2 || item.desc" placement="top" trigger="hover" :width="220" popper-class="gold-popover">
                      <template #reference>
                        <div class="clothing-name">{{ item.name }}</div>
                      </template>
                    </el-popover>
                    <div class="clothing-footer">
                      <div class="clothing-price">
                        <i class="fa-solid fa-boxes-stacked"></i>
                        {{ item.count }}
                      </div>
                      <button class="clothing-buy-btn" disabled>不可出售</button>
                    </div>
                  </div>
                </div>
                <div v-else-if="current === 'list' && clothingData.length" key="list" class="item-list">
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
                      <i class="fa-solid fa-boxes-stacked"></i>
                      {{ item.count }}
                    </div>
                    <button class="list-buy-btn" disabled>不可出售</button>
                  </div>
                </div>
                <div v-else key="empty" class="empty-state">
                  <i class="fa-regular fa-folder-open"></i>
                  <p>仓库空空如也</p>
                </div>
              </template>
            </ViewSwitcher>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 出售确认框 -->
    <ConfirmDialog
      v-model="showConfirm"
      title="提示"
      message="确定售卖此物品？"
      confirm-text="出售"
      @confirm="confirmSell"
    />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import ViewSwitcher from '@/components/ViewSwitcher.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useInventoryStore } from '@/config/inventory'
import { useGoldStore } from '@/config/gold'

const router = useRouter()
const store = useInventoryStore()
const goldStore = useGoldStore()
// 判断 icon 是否为图片（非字体图标）
const isImg = (icon) => icon && !icon.startsWith('fa')
// 出售单价（半价，与 inventory.sellItem 的计算口径保持一致）
const sellPriceOf = (item) => Math.floor((item?.price || 0) * 0.5)

const activeName = ref('all')

const viewOptions = [
  { label: '卡片', value: 'card' },
  { label: '列表', value: 'list' }
]
const allView = ref('card')
const itemView = ref('card')
const clothingView = ref('card')

const allData = computed(() => store.allWarehouseItems)
const itemData = computed(() => store.warehouseItems('item'))
const clothingData = computed(() => store.warehouseItems('clothing'))

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

const showConfirm = ref(false)
const confirmItem = ref(null)

const handleSell = (item) => {
  confirmItem.value = item
  showConfirm.value = true
}

const handleUse = (item) => {
  const ok = store.useItem(item.id)
  if (ok) {
    ElMessage.success(`使用了「${item.name}」${item.decs2 ? '：' + item.decs2 : ''}`)
  }
}

const confirmSell = () => {
  const it = confirmItem.value
  if (!it) return
  const ok = store.sellItem(it.id)
  if (ok) {
    ElMessage.success(`出售「${it.name}」获得 ${sellPriceOf(it)} 金币`)
  }
  confirmItem.value = null
}
</script>

<style scoped src="@/assets/styles/shop.css"></style>
