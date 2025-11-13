# 更新日志

## 2025-10-30 - 完整高级搜索系统（同义词 + FTS5 + 智能路由）

### 🎉 新功能总览

实现了完整的三层搜索系统：
1. ✅ **同义词搜索** - 英文同义词、中文翻译、缩写
2. ✅ **FTS5 全文搜索** - Boolean 运算、短语搜索、前缀匹配
3. ✅ **智能搜索路由** - 自动选择最佳搜索策略

### 阶段 1: 同义词支持 ✅
- **同义词搜索系统**：支持通过同义词、翻译、缩写查找产品
  - 新增 `product_keywords` 表存储关键词映射
  - 英文同义词：`"panel board"` → SWITCHBOARDS
  - 中文翻译：`"配电柜"` → SWITCHBOARDS  
  - 缩写：`"MCC"` → MOTOR CONTROL CENTER
  - 大小写不敏感，支持部分匹配

- **28 个预置关键词**：
  - SWITCHBOARDS: 10 个关键词（含中英文）
  - MOTOR CONTROL CENTER: 8 个关键词（含缩写）
  - LOW VOLTAGE BUSWAYS: 10 个关键词

### 技术实现
- `searchSectionsWithSynonyms(db, keyword)` - 核心搜索函数
  1. 优先在 `product_keywords` 表搜索
  2. 回退到 `sections.title` 搜索
  3. 返回匹配的 sections
- `insertProductKeywords(db, keywords)` - 批量插入关键词
- `loadKeywordSeeds(db, sqlContent)` - 加载种子数据
- `getKeywordsForSection(db, sectionId)` - 获取 section 的所有关键词

### 数据库变更
```sql
CREATE TABLE product_keywords (
  section_id TEXT NOT NULL,
  keyword TEXT NOT NULL,              -- 小写存储
  keyword_type TEXT NOT NULL,         -- 'primary', 'synonym', 'translation', 'abbreviation'
  language TEXT NOT NULL,             -- 'en', 'zh', 'ar'
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(section_id, keyword)
);
```

### 使用示例
```bash
# 英文同义词
./src/cli/query.js "panel board"           # → SWITCHBOARDS
./src/cli/query.js "distribution panel"    # → SWITCHBOARDS

# 缩写
./src/cli/query.js "MCC"                   # → MOTOR CONTROL CENTER

# 中文翻译
./src/cli/query.js "配电柜"                # → SWITCHBOARDS
./src/cli/query.js "电机控制中心"          # → MOTOR CONTROL CENTER

# 部分匹配
./src/cli/query.js "busbar"                # → LOW VOLTAGE BUSWAYS
```

### 向后兼容
- ✅ Section ID 查询继续工作：`"26 24 13"`
- ✅ 原有 title 搜索作为回退机制
- ✅ 所有现有测试通过 (55/55)

### 文件变更
- **新增**：
  - `src/db/search-schema.js` - 搜索 schema 和函数
  - `seeds/product-keywords.sql` - 关键词种子数据
  - `test/search-synonyms.test.js` - 8 个新测试
  - `docs/search-enhancement-plan.md` - 详细实施计划

- **更新**：
  - `src/db/sqlite.js` - 集成同义词搜索函数
  - `src/cli/query.js` - 使用新搜索API
  - 所有测试通过 ✓

### 测试覆盖
- ✅ 单元测试：8 个同义词搜索测试
- ✅ 集成测试：5 个 CLI 查询测试  
- ✅ 端到端测试：真实数据库查询验证
- ✅ 总计：55 个测试全部通过

### 阶段 2: FTS5 全文搜索 ✅

- **FTS5 虚拟表**：`sections_fts` 支持全文搜索
  ```sql
  CREATE VIRTUAL TABLE sections_fts USING fts5(
    section_id UNINDEXED,
    title, overview, keywords,
    tokenize='unicode61'
  );
  ```

- **Boolean 运算符**：
  - `AND`: `"motor AND control"` → 同时包含两个词
  - `OR`: `"switchboard OR busway"` → 包含任一词
  - `NOT`: `"control NOT motor"` → 排除特定词

- **高级语法**：
  - 短语搜索：`"low voltage"` → 精确短语匹配
  - 前缀搜索：`switch*` → 匹配 switch 开头的词
  - 相关性排序：BM25 算法自动排序

- **搜索范围**：title + overview + keywords（同义词）

- **新增函数**：
  - `syncFTSTable(db)` - 同步 FTS 表数据
  - `searchSectionsFullText(db, query, options)` - FTS5 搜索
  - 返回相关性评分和高亮片段

### 阶段 3: 智能搜索路由 ✅

- **smartSearch() 统一接口**：
  ```javascript
  const result = smartSearch(db, query, {
    useFTS: true,
    useSynonyms: true,
    limit: 10
  });
  // → { results: [...], strategy: 'fts5'|'synonym'|'section_id'|'basic' }
  ```

- **自动策略选择**（按优先级）：
  1. **Section ID** - 检测 `"X Y Z"` 格式 → 直接查询
  2. **FTS5 语法** - 检测 AND/OR/" → FTS5 搜索
  3. **同义词表** - 在 keywords 表查询 → 精确匹配
  4. **FTS5 回退** - 简单文本 → 全文搜索
  5. **基础搜索** - 最后手段 → LIKE 查询

- **CLI 参数**：
  - `--search-mode auto|synonym|fts|basic` - 强制指定模式
  - `--sync-fts` - 搜索前同步 FTS 表
  - 自动显示使用的策略（stderr）

### 使用示例（完整版）

```bash
# 1. 同义词搜索（快速精确）
./src/cli/query.js "panel board"           # strategy: synonym
./src/cli/query.js "配电柜"                # strategy: synonym
./src/cli/query.js "MCC"                   # strategy: synonym

# 2. FTS5 Boolean 搜索（强大灵活）
./src/cli/query.js "motor AND control"     # strategy: fts5
./src/cli/query.js "switch* OR busway"     # strategy: fts5
./src/cli/query.js '"low voltage"'         # strategy: fts5 (phrase)

# 3. Section ID（传统方式）
./src/cli/query.js "26 24 13"              # strategy: section_id

# 4. 强制指定模式
./src/cli/query.js "switchboard" --search-mode fts

# 5. 同步FTS表（首次使用或数据更新后）
./src/cli/query.js "voltage" --sync-fts
```

### 完整测试覆盖

```
阶段 1 测试：8 个 (同义词)
阶段 2 测试：8 个 (FTS5)
阶段 3 测试：11 个 (智能路由)
其他测试：47 个 (原有功能)
────────────────────────────
总计：74/74 通过 ✅
```

### 性能优化

- **索引优化**：
  - `product_keywords(keyword)` - 同义词快速查询
  - `product_keywords(section_id)` - Section 关键词查询
  - FTS5 内置索引 - 全文搜索优化

- **搜索时间**：
  - 同义词搜索：<1ms
  - FTS5 搜索：<5ms（当前数据量）
  - Section ID：<1ms

### 技术亮点

1. **三层防护**：同义词 → FTS5 → 基础搜索，确保总能找到结果
2. **智能切换**：根据查询语法自动选择最优策略
3. **相关性排序**：FTS5 BM25 算法，相关度高的排前面
4. **高亮支持**：返回匹配片段（snippet）用于UI显示
5. **向后兼容**：所有原有功能继续工作

### 数据库完整 Schema

```sql
-- 同义词表（阶段 1）
CREATE TABLE product_keywords (...);
CREATE INDEX idx_product_keywords_keyword ON product_keywords(keyword);
CREATE INDEX idx_product_keywords_section ON product_keywords(section_id);

-- FTS5 全文搜索（阶段 2）  
CREATE VIRTUAL TABLE sections_fts USING fts5(
  section_id UNINDEXED, title, overview, keywords, 
  tokenize='unicode61'
);
```

### 新增 API（完整列表）

```javascript
// 阶段 1
insertProductKeywords(db, keywords)
searchSectionsWithSynonyms(db, keyword)
getKeywordsForSection(db, sectionId)
loadKeywordSeeds(db, sqlContent)

// 阶段 2
syncFTSTable(db)
searchSectionsFullText(db, query, {limit})

// 阶段 3
smartSearch(db, query, {useFTS, useSynonyms, limit})
```

### 文件变更（总计）

**新增**：
- `src/db/search-schema.js` (119 行)
- `seeds/product-keywords.sql` (42 行)
- `test/search-synonyms.test.js` (218 行)
- `test/search-advanced.test.js` (265 行)
- `docs/search-enhancement-plan.md` (362 行)
- `docs/IMPLEMENTATION_SUMMARY.md` (367 行)

**更新**：
- `src/db/sqlite.js` (+245 行) - FTS5 + smartSearch
- `src/cli/query.js` (+120 行) - 新参数和逻辑
- `CHANGELOG.md` (+150 行)
- `docs/usage.md` (+40 行)
- `docs/dev-notes.md` (+30 行)

**总计**：+1800 行代码和文档

---

## 2025-10-23 - 产品名称搜索功能（方案 A）

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

