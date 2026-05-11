# matsci-crystal-viewer-kit

`@gnosys/matsci-crystal-viewer-kit` 是从 `matsci-ui` 中抽离出来的晶体结构可视化组件包。

这个包保留了 React + Three.js 的 3D 场景主路径，并配套了 viewer 所需的最小控制 UI：

- 不依赖 Less
- 使用包内本地 CSS
- token 和样式覆盖边界清晰
- 不再包含历史上的 `vis-network` / graph wrapper 支线

## 安装

```bash
pnpm add @gnosys/matsci-crystal-viewer-kit
```

Peer Dependencies：

- `react >=18 <20`
- `react-dom >=18 <20`

## 对外 API

根入口导出的是 3D viewer 主路径：

- `CameraContextProvider`
- `CrystalToolkitScene`
- `CrystalToolkitAnimationScene`
- `Download`
- `PhononAnimationScene`
- `Scene`

## 快速开始

```tsx
import { CrystalToolkitScene } from '@gnosys/matsci-crystal-viewer-kit';
import '@gnosys/matsci-crystal-viewer-kit/style.css';

export function Viewer({ sceneJson }: { sceneJson: any }) {
  return (
    <CrystalToolkitScene
      data={sceneJson}
      sceneSize={480}
      settings={{
        renderer: 'webgl',
        background: '#ffffff',
        staticScene: true,
      }}
      toggleVisibility={{}}
      showControls
      showExpandButton
      showImageButton
      showExportButton
      showPositionButton
    />
  );
}
```

其中 `data` 是 viewer 消费的 scene JSON。通常这部分数据来自后端、Python 端 scene builder，或者宿主侧自己的 scene 生成逻辑。

## 常用 Props

大部分集成只会用到下面这些 props：

- `data`：要渲染的 scene JSON
- `settings`：viewer 运行时设置，例如 renderer、背景色、动画行为
- `toggleVisibility`：按场景 group name 控制显示/隐藏
- `sceneSize`：viewer 尺寸
- `showControls`：是否显示工具栏
- `showExpandButton`、`showImageButton`、`showExportButton`、`showPositionButton`：是否显示各个工具按钮
- `fileOptions`：宿主自定义导出菜单项
- `texts`：覆盖 tooltip 与导出菜单文案
- `children`：第一个子节点渲染到 settings panel，第二个子节点渲染到底部 panel

内置文案键由 `CrystalToolkitSceneTexts` 定义，常用项包括：

- `enterFullScreen`
- `exitFullScreen`
- `showSettings`
- `hideSettings`
- `returnToOriginalPosition`
- `downloadVisualizationAs`
- `exportAs`
- `screenshotPng`
- `modelGltf`
- `modelGlb`
- `augmentedRealityIosOnly`

## 样式使用方式

引入完整样式：

```ts
import '@gnosys/matsci-crystal-viewer-kit/style.css';
```

这个包的样式是 package-local 的，不会向宿主全局样式空间扩散。你可以在以下根节点上覆盖 token：

- `.mcv-theme`
- `.mcv-root`

常用覆盖锚点：

- `data-slot="viewer-shell"`
- `data-slot="scene-frame"`
- `data-slot="settings-panel"`
- `data-slot="legend-panel"`
- `data-slot="toolbar"`
- `data-slot="menu"`
- `data-slot="tooltip"`
- `data-slot="scrubber"`

宿主样式覆盖示例：

```css
.mcv-theme {
  --mcv-color-primary: #7c3aed;
  --mcv-border-radius: 8px;
}

.mcv-root [data-slot='settings-panel'] {
  max-width: 360px;
}
```

## 包含范围

这个抽离包刻意只包含：

- `src/components/crystal-toolkit/**`
- viewer 工具栏与 modal shell 所需的最小支持组件
- 支撑这些组件工作的最小共享样式

明确不包含：

- 更宽泛的 search UI
- 元素周期表相关能力
- publications 相关能力
- 历史 graph / `vis-network` wrapper

## 体积与接入建议

当前打包结果的主要特征：

- tarball 大小大约 `46 kB`
- 主要体积集中在三个 viewer wrapper、`Scene` runtime 和 `three_builder`
- 去掉 legacy graph wrapper 后，已经移除了旧的 `network/*.png` 资产链

接入时更实用的建议是：

- 直接从根入口导入 viewer
- scene JSON 生成逻辑放在宿主或后端，不在这个包里扩展
- 如果 viewer 不是首屏必需，优先在宿主侧做 lazy load

## 开发命令

常用命令：

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm release:pack`

已经配置了 `prepack`，因此 `npm pack` 和 `npm publish` 时会自动先构建 `dist`，不需要手动先跑一次 `build`。

## 发布

常见发布命令：

```bash
pnpm release:prepare patch
pnpm release:prepare 0.2.0 --notes "Initial @gnosys release"
pnpm release:publish
pnpm release minor --notes-file ./release-notes.md
```

`release:prepare` 会做这些事：

- 更新 `package.json` 里的版本号
- 在 `CHANGELOG.md` 顶部插入一条带日期的新版本记录
- 优先使用 `--notes` / `--notes-file`
- 如果没有手写说明，则在可用时退回到 git commit subject 生成 changelog 条目

`release:publish` 会做这些事：

- 运行 `typecheck`、`test`、`build`
- 将当前版本发布到配置好的 `@gnosys` registry
- 使用包目录内的本地 npm cache，避免全局 cache 权限问题
