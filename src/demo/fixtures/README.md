# Real Structure Fixtures

该目录只放 **本地静态 JSON fixture**，供 `Storybook` 直接消费。

规则：

1. 每个结构使用固定文件名：`<structureId>.json`
2. 文件内容保持与 `structure-service /v1/scene/from-id` 返回结构一致：
   - `formula`
   - `nsites`
   - `legend`
   - `scene`
3. `Storybook` 不会在运行时请求任何远端或本地服务，只会读取这些已提交到仓库内的 JSON 文件。

当前已提交的真实结构：

- `8233.json`
- `294068.json`
- `304763.json`
- `372653.json`
- `379864.json`
- `463206.json`

这些文件已经由本地 `material-search` 结构数据离线生成，可直接用于 Storybook 演示和截图。
