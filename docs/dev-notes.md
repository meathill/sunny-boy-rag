# 开发笔记

## PDF解析与分片（阶段一）

- Section 检测：仅以"Section X Y Z"为边界，section id="X Y Z"。
- Part 识别：支持"PART 1./PART 1 – …"等变体。
- Part 1 切片：
  - overview：Part 1 开头至 1.2 前（不含 1.2 标题）
  - 1.4/1.5/1.7/1.8：各自从标题起至下一个同级编号前，或至 PART 2/END OF SECTION
- Section relations：仅从 Part 1 的 1.2 文本抽取"Section X Y Z"，保存 (section_id, related_section_id)。
- Std refs (1.3)：从 Part 1 的 1.3 References 提取，支持多种格式：
  - 基础：`IEC 51`, `BS 7671`, `DEWA Regulations`
  - 带斜杠：`IEC/EN 61000-4-5`（前缀可含斜杠）
  - 跨行共享title：`IEC 60947-2 / \n BS EN 60898-2 ...`（行尾斜杠表示下行同类），两者共用下一行title
  - 尾部冒号清理：`IEC 337-2:` → `IEC 337-2`
  - 提取后存入 std_refs(id, title)，并建立 section_std_refs_relations(section_id, reference_id)
- Definitions (1.6)：从 Part 1 的 1.6 Definitions/Acronyms/Abbreviations 提取：
  - 格式：每行 `ABBR   Full Definition Text`（三个空格分隔）
  - 支持特殊格式：
    - 标准大写：`AC`, `ASTA`
    - 带斜杠：`ATS/ATC`
    - 多token缩写：`Cu ETP`, `PDS (MV)` （使用启发式判断第二token是否属于缩写）
    - 带连字符空格：`O - C - O`, `TN - S` （token内部允许 ` - ` 模式）
    - 小写开头单位：`kV`, `kVA`, `mA`
    - 混合大小写：`RoHS`
  - 启发式规则：第二token如果是全大写或包含括号或≤3字符且全大写，则作为缩写的一部分
  - 存入 definitions(id, definition)，建立 section_definition_relations(section_id, definition_id)
  - 提取范围：从 1.6 标题起至 1.7 标题前
- 页眉页脚：移除结尾 "Pages?: N of M" 行；对以 "DMBLP - RTA - N0001 … Pages?: N of M" 结尾的页尾块进行剔除，保守回退避免误删整页。
- CLI：默认将结果写入 last-ingest.json，stdout 仅输出 done/failed；dotenv 读取 .env，优先级 --db > SUNNY_SQLITE > :memory:
- DB：sections.id=Section Code（X Y Z），去掉 section_code 字段；保存 overview/p14/p15/p17/p18 原文切片；section_relations、section_std_refs_relations、section_definition_relations 唯一约束。
- 测试：新增 demo.pdf e2e 覆盖切分、清洗、Section/Std/Definition关联、边界情况（共享title、冒号清理、斜杠缩写等）；回归防止 1.2/页脚混入。

## AI智能解析（阶段二）

### 架构设计

- **目标**：将Part 2/3的自然语言技术规范提取为结构化数据
- **AI技术栈**：
  - **Vercel AI SDK**：统一的AI接口层，支持多提供商
  - **Vercel AI Gateway**（可选）：请求路由、成本追踪、速率限制
  - **支持的提供商**：OpenAI (gpt-5), Anthropic (claude-3-5-sonnet), Google (gemini-2.5-pro)
  - **环境配置**：通过 .env 灵活配置 AI_PROVIDER, API_KEY, MODEL, GATEWAY_URL
- **四大数据类型**：
  1. compliance_requirements：标准合规（IEC/ISO/BS等）
  2. technical_specs：技术规格（电气/环境/保护参数）
  3. design_requirements：设计与安装要求
  4. testing_requirements：测试与验收要求

### Vercel AI SDK 集成

- **client.js**：实现 VercelAIClient 类，使用 generateText() API
  - 支持 OpenAI 和 Anthropic 的统一接口
  - 可选 Gateway URL 配置（通过 baseURL 参数）
  - 保留 MockAIClient 用于测试
- **createAIClient() 工厂函数**：
  - 根据 AI_PROVIDER 环境变量选择提供商
  - 自动处理 API Key 和 Model 配置
  - 支持 AI_GATEWAY_URL 环境变量
- **测试策略**：默认使用 Mock，真实 API 需显式配置
- **兼容性**：保留旧版 OpenAIClient/AnthropicClient，标记为 deprecated

### AI提示词策略

- **标准合规提取**：
  - 识别标准ID模式（IEC/BS/EN/ISO/DEWA等）
  - 区分强制性（shall/must）vs推荐性（should）
  - 分类：standard_compliance, certification, accreditation, test_method
  - 自动补充std_refs表和section_std_refs_relations关系

- **技术规格提取**：
  - 分类：electrical, mechanical, environmental, protection, performance, material
  - 提取参数名、数值、单位
  - 关联测试标准（如IEC 62262）
  - 适用对象识别（applies_to字段）

- **设计要求提取**：
  - 分类：design, construction, installation, configuration, safety, accessibility
  - 提取完整要求文本
  - 识别强制性和适用对象

- **测试要求提取**：
  - 分类：FAT, SAT, type_test, routine_test, inspection, documentation, training, warranty
  - 提取测试流程和验收标准

### AI客户端实现

- **支持多提供商**：
  - OpenAI（GPT-5）：生产环境首选，通过 @ai-sdk/openai
  - Anthropic（Claude）：备选方案，通过 @ai-sdk/anthropic
  - Google（Gemini）：通过 @ai-sdk/google，支持 gemini-2.5-pro, gemini-2.5-flash 等模型
  - MockAIClient：开发测试用，基于正则匹配

- **Google/Gemini 集成**（2025年10月）：
  - 依赖：@ai-sdk/google@2.0.23
  - API Key：使用 GOOGLE_API_KEY 环境变量
  - 默认模型：gemini-2.5-pro（可通过 AI_MODEL 配置）
  - 支持 AI Gateway
  - 成本效益：Gemini 通常比 OpenAI 更实惠，特别适合使用 Vercel AI Gateway 的 $5 额度
  - 强项：技术文档理解、复杂推理

- **配置方式**（2025年10月重构）：
  - 环境变量：AI_PROVIDER（openai/anthropic/google/gemini/mock）
  - AI SDK 自动处理 API Key 和 Gateway URL（通过各提供商的环境变量）
  - 提供商对应的 API Key：`AI_GATEWAY_API_KEY`
  - createAIClient 工厂函数自动选择提供商
  - 使用私有字段 `#model` 存储模型实例

- **结构化输出**（2025年10月）：
  - 使用 `generateObject` 替代 `generateText`
  - 通过 zod schema 定义数据结构
  - AI 直接返回验证后的结构化对象
  - 消除 JSON 解析错误风险
  - 统一接口：`generateStructured(prompt, schema)`

- **错误处理**：
  - AI SDK 自动验证响应结构
  - 支持空结果返回（`{ items: [] }`）
  - 详细错误日志

### 批处理系统

- **并发控制**：
  - 默认concurrency=3（避免API限流）
  - 可配置并发数
  - 批次处理避免内存溢出

- **进度跟踪**：
  - ai_processing_status表记录状态
  - 支持onProgress/onError回调
  - 错误重试机制（retry_count字段）

- **增量处理**：
  - getUnprocessedChunks自动筛选Part 2/3未处理chunks
  - 支持--section-id参数过滤特定Section
  - 支持断点续传
  - 可重新处理（改进prompt后）

### 查询系统

- **直接查询**：getSectionRequirements
  - 返回所有四类requirements
  - 包含std_refs的title join
  - 按category分组

- **递归查询**：getAllSectionRequirementsRecursive
  - 通过section_relations递归查询
  - 防止循环引用（visited set）
  - 返回嵌套结构（direct + indirect）

- **输出格式**：
  - JSON：结构化数据
  - Text：人类可读格式
  - 支持--recursive模式

### CLI工具

- **parse.js**：AI解析命令
  - stats子命令：查看处理统计
  - parse子命令：批量处理chunks
  - 参数：--limit, --offset, --concurrency, --section-id, --db
  - --section-id：仅处理特定Section的chunks（格式："X Y Z"），便于测试短Section，节省API消耗
  - 自动保存提取结果到数据库
  - 实时进度输出（stderr）

- **query.js**：查询命令
  - 支持JSON/text输出格式
  - --recursive模式包含关联Section
  - --db指定数据库路径
  - 文本格式分category展示

### 数据库设计

- **无外键约束**：避免顺序依赖问题
- **索引优化**：
  - section_id索引（所有requirements表）
  - chunk_id索引
  - spec_category/test_type等分类索引

- **处理状态表**：ai_processing_status
  - chunk_id主键
  - processed标志
  - 时间戳（started/completed）
  - error_message和retry_count

### 性能优化

- **并行提取**：4个提取器并行调用（Promise.all）
- **批量写入**：transaction保证原子性
- **索引加速**：合理的索引设计
- **增量处理**：只处理未处理的chunks

### 测试覆盖

- **单元测试**：
  - MockAIClient各提取器
  - parseAIResponse边界情况
  - processChunk综合测试

- **集成测试**：
  - AI schema创建
  - 各save函数
  - 查询函数（直接+递归）
  - 处理状态跟踪
  - 幂等性测试（可重处理）

## 技术决策与约定

- PDF 解析：使用 pdfjs-dist legacy/build；必须传入 Uint8Array（不要直接传 Buffer）。
- 非 PDF 回退：parsePdf 在非 %PDF 开头时按单页文本处理，便于调试与测试稳定。
- 分页限制：parsePdf(input, {maxPages}) 支持仅解析前 N 页，用于 e2e 与性能验证。
- 章节识别：正则 `^\s*(\d+(?:\.\d+){0,3})[.)]?\s+(.{2,80})$`；detectHeadings 返回 {page,line,section,title}。
- 分段构建：buildSections 数字序排序；段 id 模板 `sec: ${section}, ${title}`；无标题时添加 `sec:document`。
- 引用提取：先将连字符两侧空格规整为 `-`，再用模式 `[A-Z]{2,}-\d{2,}|[A-Z]{2,}\d{2,}|[A-Z]{2,}-\d{3,}[A-Z]?`。
- 切片：chunkSections 默认 maxChars=4000, minChars=1500（无重叠）；末尾过小切片会并入前一块；chunk.id 使用 sha1 截断。按章节/段落为主进行切分，**重要**：对于超长section（>maxChars），智能地在4级标题（X.Y.Z.W）边界处切分，确保不会把一个小节切成两段，保持小节完整性。如果没有4级标题，则退回到字符长度切分。
- CLI：`src/cli/ingest.js` 将 parsePdf + buildSections + chunkSections 串联，输出 {meta,sections,chunks} 到 stdout；参数：--max, --pages, --db；环境变量通过 dotenv 自动加载（.env），数据库路径覆盖顺序：--db > SUNNY_SQLITE > :memory:。
- AI处理：parse.js独立CLI，从chunks表读取Part 2/3，调用AI提取，写入4个requirements表；默认MockAI，可配置OpenAI/Anthropic；支持并发控制和错误重试。
- 查询接口：query.js提供Section级查询，支持递归包含关联Section；输出格式JSON/text可选。
- DB API：增加saveComplianceRequirements, saveTechnicalSpecs, saveDesignRequirements, saveTestingRequirements, getSectionRequirements, getAllSectionRequirementsRecursive, getUnprocessedChunks, updateAIProcessingStatus, getProcessingStats。
- Schema：新增compliance_requirements, technical_specs, design_requirements, testing_requirements, ai_processing_status表；无外键约束，使用索引优化查询。

## 测试策略

- 使用 Node test（node --test）。
- 单元测试：analyze、chunk、pipeline、ingest 文本输入。
- e2e：demo.pdf（真实 PDF），使用 --pages 50 控制耗时；断言 sections/std_refs/definitions 提取正确，relations 建立，边界情况处理。
- AI测试：MockAIClient各提取器功能；数据库save/query操作；处理状态跟踪；幂等性保证。
- DB 测试：依赖 better-sqlite3 原生绑定；若绑定不可用则自动跳过（CI/本地差异）。

## 代码风格与运行环境
- JS/TS，缩进 2 空格；严格 ESLint（后续补充配置）。
- package.json engines: node >=24（本地 22 会告警但功能可用）。

## 性能与稳定性
- 大体量 PDF 调试时优先使用 --pages 限制页数，避免长时运行与 OOM。
- pdfjs 提取文本按 hasEOL 插入换行，否则空格；页面文本最后 trim。

## 后续计划
- LLM 解析环节：对每个 chunk 提取结构化字段与引用回填（多轮）。
- Web UI：上传、检索、SQL 生成与语义化展示。
