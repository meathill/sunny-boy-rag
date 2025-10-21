# 更新日志

## 2025-10-21 - 重构AI客户端使用generateObject

### 重构
- **AI客户端简化**：大幅简化 VercelAIClient 实现
  - 移除手动 API Key 和 Gateway URL 配置，完全依赖 AI SDK 环境变量
  - 使用私有字段 `#model` 存储模型实例
  - 简化 provider 配置逻辑
- **结构化输出**：从 `generateText` 升级到 `generateObject`
  - 引入 zod schema 定义所有数据结构
  - AI 直接返回结构化对象，无需手动解析 JSON
  - 移除 `parseAIResponse` 函数和所有 JSON 解析逻辑
  - 消除 markdown 代码块、格式错误等解析问题
- **统一接口**：`AIClient.generateStructured(prompt, schema)` 替代 `complete()`
  - MockAIClient 同步更新，返回 `{ items: [] }` 格式
  - 所有提取器使用统一的结构化输出接口

### 改进
- **类型安全**：zod schema 确保数据结构正确性
- **可靠性提升**：消除 JSON 解析失败风险
- **代码简化**：-131 行代码，逻辑更清晰
- **更好的错误处理**：AI SDK 自动处理响应验证

### 依赖
- 新增 `zod@^4.1.12` 用于 schema 定义

### 测试
- 更新测试用例以适配新接口
- 所有 47 个测试通过

## 2025-10-13 - Chunks切分优化

### 修复
- **智能切片边界**：修复了chunks按字符长度切分导致小节被切断的问题
  - 现在切片时会识别4级标题（X.Y.Z.W），并在小节边界处切分
  - 确保每个4级小节保持完整，不会被切成两段
  - 如果section没有4级标题，则退回到字符长度切分

### 测试
- 添加测试用例验证小节边界切分功能
- 验证每个4级小节只出现在一个chunk中

### 影响
- Part 2/3的chunks质量显著提高
- 为后续AI解析提供更好的数据单元

### 文档
- 更新 `docs/dev-notes.md` 记录切片逻辑
- 更新 `.github/copilot-instructions.md` 说明chunks切分策略

