# 使用说明

## 安装与测试
- 安装依赖：pnpm install
- 运行测试：pnpm test

## 步骤一：读取 + 分析 + 切片 PDF
- 命令：
  - 单文件处理：
    pnpm ingest path/to/file.pdf
    # 将自动写入 last-ingest.json，并在 stdout 打印 done/failed
  - 可选参数：
    --max 4000    # 每个切片最大字符数
    --pages 3     # 仅解析前 N 页（调试/加速可选）
    --db db.sqlite # 同步将切片写入本地 sqlite（better-sqlite3）

- 行为说明：
  - parsePdf 自动识别真实 PDF；非 PDF（纯文本等）回退为单页文本，便于调试
  - 使用 pdfjs-dist 提取逐页文本，已适配 Node 环境（以 Uint8Array 读取）
  - buildSections 自动检测"Section X Y Z"字面标识并按 section 聚合
  - chunkSections 以章节/段落为主进行切片（无重叠）
  - 输出：默认写入 last-ingest.json，stdout 仅输出 done/failed
  - 切片：按章节/小节划分（无重叠），Part 1 提取 overview（至 1.2 前）、1.4/1.5/1.7/1.8 区段
  - 结构化提取：
    - 1.2 Related Sections：提取 Section X Y Z 引用，建立 section_relations 表
    - 1.3 References：提取技术规范（IEC、BS、DEWA 等），建立 std_refs 和 section_std_refs_relations 表
    - 1.6 Definitions/Acronyms：提取缩写和定义，建立 definitions 和 section_definition_relations 表

  - DB 写入：
    - 环境变量 SUNNY_SQLITE 指定 sqlite 文件路径；若未设置且未传 --db，则使用内存数据库
    - CLI 优先顺序：--db > SUNNY_SQLITE > :memory:
    - 支持 .env（使用 dotenv），命令行会自动加载 .env 中的环境变量

- 示例：
  pnpm ingest assets/demo.pdf --pages 3 --max 800
  # 输出文件：last-ingest.json
  # 同时写入数据库（如配置了 SUNNY_SQLITE）

## 步骤二：AI智能解析（NEW）

### 环境配置

系统使用 **Vercel AI SDK** 和 **Vercel AI Gateway** 提供统一的AI接入方式。

```bash
# .env 文件示例（复制 .env.example 并修改）
SUNNY_SQLITE=./data.sqlite

# AI提供商配置（支持：openai, anthropic, google/gemini, mock）
AI_PROVIDER=openai

# OpenAI 配置
OPENAI_API_KEY=sk-your-openai-api-key-here
# AI_MODEL=gpt-5  # 可选，默认值

# Anthropic 配置（如使用 Claude）
# ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here
# AI_MODEL=claude-sonnet-4-5  # 可选

# Google/Gemini 配置（如使用 Gemini）
# GOOGLE_API_KEY=your-google-api-key-here
# AI_MODEL=gemini-2.5-pro  # 可选

# Vercel AI Gateway（可选，用于统一管理、成本追踪、速率限制）
# AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID

# Debug 模式
DEBUG=1
```

**关键特性：**
- 使用 Vercel AI SDK 统一接口，支持 OpenAI、Anthropic 和 Google/Gemini
- 可选 Vercel AI Gateway 进行请求路由、成本监控和速率限制
- Mock 模式用于测试，不消耗 API 配额
- 灵活的模型配置，支持各提供商的最新模型

### 解析命令（parse）

从Part 2/3的chunks中提取结构化requirements：

```bash
# 查看帮助
./src/cli/parse.js --help

# 查看处理统计
./src/cli/parse.js stats

# 处理前10个未处理的chunks
./src/cli/parse.js parse --limit 10

# 处理特定Section的所有chunks（推荐用于测试短Section）
./src/cli/parse.js parse --section-id "26 24 13"

# 使用真实OpenAI API处理（带速率限制）
AI_PROVIDER=openai ./src/cli/parse.js parse --limit 5 --concurrency 1 --delay 5000

# 针对免费API额度限制：单并发 + 5秒延迟
./src/cli/parse.js parse --concurrency 1 --delay 5000

# 调整并发数（无延迟，适用于无限制API）
./src/cli/parse.js parse --concurrency 5 --limit 20
```

**速率限制参数：**
- `--concurrency N`: 并发chunk数（默认：1）
- `--delay N`: AI请求间延迟毫秒数（默认：0）
- 推荐免费额度：`--concurrency 1 --delay 5000`

**重要说明：**
- 每个 chunk 包含 4 次 AI 请求（compliance、technical、design、testing）
- 当 `--delay > 0` 时，这 4 次请求**串行执行**，每次间隔 `delay` 毫秒
- 示例：`--delay 5000` 时，每个 chunk 约需 15 秒（3 个间隔 × 5 秒）
- 当 `--delay 0` 时（默认），4 次请求并行执行，速度快

**提取的数据类型：**
- **标准合规要求**（compliance_requirements）：IEC、ISO、BS等标准引用和认证要求
- **技术规格**（technical_specs）：电气参数、环境条件、保护等级等
- **设计与安装要求**（design_requirements）：物理设计、安装规范、配置要求
- **测试与验收要求**（testing_requirements）：FAT/SAT、型式试验、文档交付

### 查询命令（query）

查询电子元器件的所有requirements：

```bash
# 查看帮助
./src/cli/query.js --help

# 按产品名称搜索（推荐）- 大小写不敏感，支持部分匹配
./src/cli/query.js "switchboard"
./src/cli/query.js "motor control"
./src/cli/query.js "busway"

# 按 Section ID 搜索（精确查询）
./src/cli/query.js "26 24 13"
./src/cli/query.js "26.24.13"  # 也支持点分隔

# 查询并包含关联Section（文本格式）
./src/cli/query.js "switchboard" --recursive --format text

# 查询特定数据库
./src/cli/query.js "motor" --db ./data.sqlite
```

**智能搜索模式：**
- 自动检测输入格式：
  - `"26 24 13"` 或 `"26.24.13"` → Section ID 搜索
  - 其他任何文本 → 产品名称搜索
- 产品名称搜索：大小写不敏感，支持部分匹配
- 返回所有匹配的 sections 及其 requirements

详细使用说明请参考：[AI解析系统实现文档](ai-implementation.md)

## 查询子命令（ingest）

- 列表：pnpm ingest list [--source <file>] [--limit N] [--offset N] [--db path]
  - 结合 SUNNY_SQLITE：直接执行 pnpm ingest list 即从默认数据库读取
- 单条：pnpm ingest get <id> [--db path]
- 总表：pnpm ingest status [--source <file>] [--limit N] [--offset N] [--db path]
  - 输出每个源文件的 page_count / processed_pages / chunk_count 等，支持增量处理记录

- 示例：
  - 列表（限制 3 条）：pnpm ingest list --limit 3
  - 指定来源文件：pnpm ingest list --source path/to/file.pdf
  - 获取单条：pnpm ingest get ch:xxxx

- 输出结构（简要）：
  {
    "meta": { "pageCount": number },
    "sections": [{ id, title, section, startPage, endPage, text }],
    "chunks": [{ id, sourceId, sectionId, title, startPage, endPage, text }]
  }

## 数据库结构

### 基础表（阶段一）
- sections：存储 Section 信息（id=Section Code 'X Y Z'），包含 overview、p14/p15/p17/p18 等关键切片
- std_refs：存储技术规范引用（IEC、BS、DEWA 等）
- definitions：存储缩写定义（AC、DEWA、ATS/ATC 等）
- section_relations：Section 之间的引用关系
- section_std_refs_relations：Section 与技术规范的关联
- section_definition_relations：Section 与缩写定义的关联
- parts/chunks/documents：其他辅助表

### AI解析表（阶段二）
- compliance_requirements：标准合规要求
- technical_specs：技术规格
- design_requirements：设计与安装要求
- testing_requirements：测试与验收要求
- ai_processing_status：AI处理状态跟踪
