# Changelog

All notable changes to this package will be documented in this file.

## 0.2.3 - 2026-08-27

Package: `@gnosys/matsci-crystal-viewer-kit`

- Improve stable crystal selection and preserve per-instance rendering colors.


## 0.2.2 - 2026-08-20

Package: `@gnosys/matsci-crystal-viewer-kit`

- Instance-aware selection and hover highlighting
- Batched atom and bond rendering with preserved per-instance colors
- Public API documentation and viewer UI cleanup


## 0.2.1 - 2026-08-13

Package: `@gnosys/matsci-crystal-viewer-kit`

- fix: keep the crystal settings panel open when a portaled Select menu is dismissed inside it; fix: improve settings-panel scrollbar visibility in light and dark themes


## 0.2.0 - 2026-08-13

Package: `@gnosys/matsci-crystal-viewer-kit`

- fix: keep crystal settings panel stable around portaled select interactions


## 0.1.8 - 2026-08-13

Package: `@gnosys/matsci-crystal-viewer-kit`

- fix: keep scene settings open while selecting from portaled menus


## 0.1.7 - 2026-08-13

Package: `@gnosys/matsci-crystal-viewer-kit`

- Upgrade use-resize-observer to v10 for React 19 compatibility
- Use the v10 named resize observer hook export


## 0.1.6 - 2026-08-10

Package: `@gnosys/matsci-crystal-viewer-kit`

- 批量渲染与交互性能优化；完善场景资源生命周期释放和多轮性能基准报告


## 0.1.5 - 2026-08-09

Package: `@gnosys/matsci-crystal-viewer-kit`

- 新增性能基准页面和多轮对照测试数据


## 0.1.4 - 2026-08-07

Package: `@gnosys/matsci-crystal-viewer-kit`

- Fix stale atom highlight when moving directly between atoms
- Coalesce camera state updates during interaction and skip duplicate updates


## 0.1.3 - 2026-08-06

Package: `@gnosys/matsci-crystal-viewer-kit`

- fix(Scene): 修复隐藏轴 inset 时未重绘主视口的问题
- release: bump version to 0.1.2 and update changelog
- feat(crystal-toolkit): 实现正交相机自适应渲染宽高比的功能
- feat(crystal-toolkit): 新增场景导出的自定义文件名支持
- docs(readme): 完善README，添加英文文档、包使用说明与贡献指南
- docs: 整理项目文档，删除旧文档并更新主README与示例说明
- chore(config): 移除.npmrc配置文件并将其加入gitignore
- feat: 新增Storybook演示环境，完善项目文档与优化组件样式
- chore(crystal-viewer-kit): 发布v0.1.1版本
- feat(晶体可视化套件): 发布v0.1.0版本，完善核心功能与文档
- 修复(crystal-viewer): 解决全屏弹窗、场景重挂载问题并调整样式
- fix(crystal-viewer): 修复全屏弹窗与场景重挂载问题，调整面板与工具栏样式
- chore: 发布v0.0.3版本并更新变更日志
- feat: 初始化晶体结构查看器套件并发布v0.0.2


## 0.1.2 - 2026-08-05

Package: `@gnosys/matsci-crystal-viewer-kit`

- feat(crystal-viewer): add adaptive orthographic camera projection for 4:3 embedded and fullscreen viewports


## 0.1.1 - 2026-06-24

Package: `@gnosys/matsci-crystal-viewer-kit`

- optimize scene lifecycle to avoid fullscreen remounts and resize regressions
- reduce runtime render overhead with cached outline and shared geometry/material reuse
- remove legacy modal close background and align viewer control styling


## 0.1.0 - 2026-05-14

Package: `@gnosys/matsci-crystal-viewer-kit`

- Documented architecture, API, usage, and styling in Chinese


## 0.0.5 - 2026-05-13

Package: `@gnosys/matsci-crystal-viewer-kit`

- fix(crystal-viewer): 修复全屏弹窗与场景重挂载问题，调整面板与工具栏样式
- chore: 发布v0.0.3版本并更新变更日志
- feat: 初始化晶体结构查看器套件并发布v0.0.2


## 0.0.4 - 2026-05-13

Package: `@gnosys/matsci-crystal-viewer-kit`

- fix: 修复 fullscreen overlay 和 scene remount 行为
- fix: 调整 settings panel 与 toolkit 样式覆盖


## 0.0.3 - 2026-05-12

Package: `@gnosys/matsci-crystal-viewer-kit`

- feat: 初始化晶体结构查看器套件并发布v0.0.2


## 0.0.2 - 2026-05-11

Package: `@gnosys/matsci-crystal-viewer-kit`

- 修复 style.css 出包后的样式资源路径
- 抽离后的晶体结构 Viewer 正式独立发布
- 补齐 themes 样式资产进入 tarball


## 0.0.1 - 2026-05-11

Package: `@gnosys/matsci-crystal-viewer-kit`

- 初始 @gnosys 发布
- 抽离晶体结构 Viewer 主路径
- 移除 legacy vis-network graph wrapper
