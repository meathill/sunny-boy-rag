# 使用说明

## 安装与测试
- 安装依赖：pnpm install
- 运行测试：pnpm test

## 步骤一：读取 + 分析 + 切片 PDF
- 命令：
  - 单文件处理并输出 JSON：
    pnpm ingest path/to/file.pdf > output.json
  - 可选参数：
    --max 4000    # 每个切片最大字符数
    --overlap 200 # 切片之间重叠字符数
    --pages 3     # 仅解析前 N 页（调试/加速可选）

- 行为说明：
  - parsePdf 自动识别真实 PDF；非 PDF（纯文本等）回退为单页文本，便于调试
  - 使用 pdfjs-dist 提取逐页文本，已适配 Node 环境（以 Uint8Array 读取）
  - buildSections 自动检测“1.”、“1.1”式标题并聚合
  - chunkSections 按 max/overlap 切片

- 示例：
  pnpm ingest "assets/V06_Particular Specifications_P03 26 24 13 26 25 13.pdf" --pages 3 --max 800 --overlap 50 > out.json

- 输出结构（简要）：
  {
    "meta": { "pageCount": number },
    "sections": [{ id, title, section, startPage, endPage, text }],
    "chunks": [{ id, sourceId, sectionId, title, startPage, endPage, text }]
  }
