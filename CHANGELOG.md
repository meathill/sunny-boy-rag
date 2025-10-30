# 更新日志

## 2025-10-23 - 产品名称搜索功能

### 新功能
- **智能搜索模式**：query CLI 现在支持按产品名称搜索
  - 自动识别输入格式（Section ID vs 产品名称）
  - Section ID 格式：`"26 24 13"` 或 `"26.24.13"`
  - 产品名称：任何其他文本（如 `"switchboard"`, `"motor control"`）
  
- **产品搜索 API**：
  - `searchSectionsByProduct(db, keyword)` - 搜索匹配的 sections
  - `getRequirementsByProduct(db, productName, recursive)` - 获取产品的所有 requirements
  - 大小写不敏感，支持部分匹配（LIKE `%keyword%`）

### 使用示例
```bash
# 按产品名称搜索（推荐）
./src/cli/query.js "switchboard"
./src/cli/query.js "motor control"

# 仍然支持 Section ID
./src/cli/query.js "26 24 13"

# 递归查询关联 sections
./src/cli/query.js "busway" --recursive --format text
```

### 实现细节
- 利用现有 `sections.title` 字段，无需修改数据库结构
- 正则检测 `^\d+[\s.]\d+[\s.]\d+$` 判断是否为 Section ID
- 简单 LIKE 查询实现产品搜索（方案 A）

### 文档更新
- 更新 usage.md 和 ai-implementation.md 的查询示例
- 在 dev-notes.md 添加未来优化计划（方案 B）
  - 同义词与多语言支持
  - FTS5 全文搜索
  - AI 辅助搜索
  - 搜索历史与智能建议

### 后续优化
详见 `docs/dev-notes.md` 的"高级搜索优化（方案 B）"章节

## 2025-10-22 - 添加速率限制支持

### 新功能
- **请求延迟控制**：新增 `--delay` 参数
  - 控制AI请求之间的延迟（毫秒）
  - 适应免费API额度限制
  - 默认值：0（无延迟）
  
### 重要优化
- **智能串行处理**：
  - 当 `delayMs > 0` 时，每个 chunk 的 4 次 AI 请求（compliance、technical、design、testing）改为**串行执行**
  - 每次请求之间等待 `delayMs` 毫秒
  - 示例：`--delay 5000` 时，每个 chunk 需要 ~15 秒（3个延迟 × 5秒）
  - 当 `delayMs = 0` 时，保持并行执行以提高效率
  
### 修改
- **默认并发数**：从 3 改为 1
  - 更适合免费API额度
  - 避免触发速率限制
  
### 使用示例
```bash
# 针对免费API：串行请求 + 每次间隔5秒
# 每个chunk需要约15秒（4次请求，3个延迟）
./src/cli/parse.js parse --concurrency 1 --delay 5000

# 无限制API：并行处理，更高效
./src/cli/parse.js parse --concurrency 5
```

### 技术细节
- 每个 chunk 包含 4 个提取器（compliance、technical、design、testing）
- 无延迟（默认）：4 个请求并行执行，速度快
- 有延迟：4 个请求串行执行，每次间隔 `delayMs`，避免超过速率限制

### 文档
- 更新 CLI 帮助信息
- 更新使用文档和开发笔记
- 添加技术说明

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

