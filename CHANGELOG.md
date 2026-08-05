# Changelog

All notable changes to this package will be documented in this file.

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
