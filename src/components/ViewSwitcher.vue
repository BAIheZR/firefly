<template>
  <div class="view-switcher">
    <!-- 顶部工具栏：视图切换按钮 + 额外插槽（同一行） -->
    <div class="view-toolbar">
      <!-- 使用按钮组展示所有视图选项 -->
      <el-button-group>
        <el-button
          v-for="opt in options"
          :key="opt.value"
          :type="modelValue === opt.value ? 'primary' : ''"
          @click="handleSwitch(opt.value)"
        >
          {{ opt.label }}
        </el-button>
      </el-button-group>

      <!-- 工具栏额外插槽（用于放置开关、筛选器等） -->
      <slot name="toolbar"></slot>
    </div>

    <!-- 内容区域：父组件通过默认插槽传入内容，我们提供一个作用域插槽把当前值传回去 -->
    <div class="view-content">
      <!-- 卡片/列表切换过渡：mode="out-in" 让旧视图先退场、新视图再进场，避免重叠 -->
      <transition name="view-swap" mode="out-in">
        <slot :current="modelValue"></slot>
      </transition>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  options: {
    type: Array,
    required: true,
    // 期望格式：[{ label: '卡片', value: 'card' }, ...]
  },
  modelValue: {
    type: [String, Number],
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

const handleSwitch = (value) => {
  if (value !== props.modelValue) {
    emit('update:modelValue', value)
  }
}
</script>

<style scoped>
.view-switcher {
  
}

/* 顶部工具栏：按钮组 + 额外控件同一行 */
.view-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.view-switcher :deep(.el-button-group) {
  display: inline-flex;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #3FA98A;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.view-switcher :deep(.el-button) {
  background: #ffffff;
  color: #3FA98A;
  border: none;
  font-weight: 600;
  font-size: 14px;
  padding: 8px 20px;
  transition: all 0.25s ease;
}

.view-switcher :deep(.el-button:hover) {
  color: #5BC9A0;
  background: rgba(91, 201, 160, 0.1);
}

.view-switcher :deep(.el-button.is-active) {
  background: linear-gradient(135deg, #3FA98A 0%, #5BC9A0 100%);
  color: #1a1a1a;
  border: none;
}

.view-switcher :deep(.el-button.is-active:hover) {
  background: linear-gradient(135deg, #5BC9A0 0%, #2E8B6F 100%);
  transform: scale(1.03);
}

.view-content {
  margin-top: 16px;
}

/*  卡片/列表切换过渡 
   过渡类由 Vue 加到 slot 渲染出的根元素上（属父组件作用域），
   故用 :deep() 穿透 scoped；active 类只放 transition 属性，from/to 只放可插值属性，
   避免与卡片/列表自身布局样式冲突。*/
.view-content :deep(.view-swap-enter-active),
.view-content :deep(.view-swap-leave-active) {
  transition: opacity 0.28s ease, transform 0.28s ease;
}
.view-content :deep(.view-swap-enter-from) {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}
.view-content :deep(.view-swap-leave-to) {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}
</style>
