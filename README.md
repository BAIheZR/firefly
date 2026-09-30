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
- `public/live2d/` — Live2D 模型资产（运行时核心 `public/live2dcubismcore.min.js` 已随仓库提供，模型本体需自备）

### Live2D 模型命名规范

`public/live2d/` 下每个模型一个子目录，**目录名 = 模型名**，目录内需包含同名的 `.model3.json`：

```
public/live2d/
  └── <模型名>/
        ├── <模型名>.model3.json   ← 入口文件，名字必须与目录一致
        ├── <模型名>.moc3
        ├── 纹理、物理、动作等文件
```

当前代码（`src/views/Home.vue` 的 `LIVE2D_MAP`）已映射四款模型，目录名需严格对应：

| 目录名 / model3.json 名 | 用途 |
|---|---|
| `firefly_spring` | 流萤·春日手信 |
| `small_loli` | 流萤·小不点 |
| `firefly_zx` | 流萤·仲夏萤火之约 |
| `firefly_war` | 流萤·战斗服 |

> 模型内部引用的纹理/动作文件名以 `.model3.json` 内的 `FileReferences` 为准；若重命名了内层文件，需同步修改 `.model3.json`。加载失败时会自动回退为 2D 立绘。

### 商店与仓库素材命名规范

商品数据定义在 `src/config/inventory.js` 的 `ALL_ITEMS`，所有图标与立绘放在 `src/images/`（该目录已被 `.gitignore` 排除，不进仓库，需自备）。代码通过 `import` 引用，**引用变量名 = 文件名（去扩展名）**。

- **物品 / 装饰品图标**：PNG，放 `src/images/` 根目录或 `src/images/item/` 子目录。例如 `src/images/xmdgj.png` → 顶部 `import xmdgj from "@/images/xmdgj.png"`，再在条目里写 `icon: xmdgj`。
- **装饰品图标**：建议用 `model_` 前缀命名（`model_1.png` …）。注意：仓库现存个别文件误拼为 `medel_`（如 `medel_4.png`、`medel_samu.png`），**新增请勿沿用此拼写**。
- **纯图标占位**：`icon` 也可直接填 font-awesome 类名字符串（如 `'fa-solid fa-bread-slice'`），无需提供图片文件。
- **服装主页立绘**：PNG，放 `src/images/game/`，在服装条目里用 `gameImg` 字段引用。**缺 `gameImg` 的服装买了也穿不上**（换装列表会过滤掉）。现有四款：`firefly_spring` / `small_loli` / `firefly_zx` / `firefly_war`。
- **新增商品**：在 `src/config/inventory.js` 顶部加 `import`，再在 `ALL_ITEMS` 追加条目——物品用 id 1–99，服装用 id 100+，服装的 `category` 必须为 `'clothing'`。

## 许可证

程序代码采用 [MIT License](LICENSE)。
第三方依赖的许可证见 [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES)。
素材版权归原作者所有，使用时请遵守原作者授权协议。

## 联系方式

- 开发者：BAIheZR
- 邮箱：3437248857@qq.com
