# 萤光纪游 (Firefly)

基于 Electron + Vue 3 + Element Plus 开发的桌面养成类小游戏，内置 3D MMD 角色流萤。

## 功能

- 3D 角色互动（好感度、行动点系统）
- 商品商店 / 装饰品 / 永久加成
- AI 对话（需自行配置 API）
- 多人联机（房主模式，WebSocket + 内网穿透）
- 本地音乐播放、桌面宠物等

## 技术栈

- Electron
- Vue 3 (Composition API)
- Element Plus
- Three.js (MMD 渲染)
- Vite

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 打包 Windows 安装版
npm run dist
```

## ⚠️ 关于素材

本仓库**不包含**任何美术素材（3D 模型、2D 立绘、动作数据、背景图等）。

这些素材的知识产权归原作者所有，部分模型的授权协议明确禁止二次配布，
因此未纳入版本控制。

如需运行，请自行准备以下目录的素材：

- `src/images/` — 2D 立绘、商品图、背景图
- `public/models/` — MMD 3D 模型
- `public/animations/` — MMD 动作数据 (.vmd)

## 许可证

程序代码采用 [MIT License](LICENSE)。
第三方依赖的许可证见 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)。
素材版权归原作者所有，使用时请遵守原作者授权协议。

## 联系方式

- 开发者：BAIheZR
- 邮箱：3437248857@qq.com
