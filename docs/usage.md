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
  - buildSections 自动检测“1.”、“1.1”式标题并聚合
  - chunkSections 以章节/段落为主进行切片（无重叠）
  - 输出：默认写入 last-ingest.json，stdout 仅输出 done/failed
  - 切片：按章节/小节划分（无重叠），Part 1 提取 overview（至 1.2 前）、1.4/1.5/1.7/1.8 区段

  - DB 写入：
    - 环境变量 SUNNY_SQLITE 指定 sqlite 文件路径；若未设置且未传 --db，则使用内存数据库
    - CLI 优先顺序：--db > SUNNY_SQLITE > :memory:
    - 支持 .env（使用 dotenv），命令行会自动加载 .env 中的环境变量

- 示例：
  pnpm ingest assets/demo.pdf --pages 3 --max 800
  # 输出文件：last-ingest.json

## 查询子命令
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
