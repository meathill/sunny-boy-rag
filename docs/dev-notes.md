# 开发笔记

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


## 技术决策与约定
- PDF 解析：使用 pdfjs-dist legacy/build；必须传入 Uint8Array（不要直接传 Buffer）。
- 非 PDF 回退：parsePdf 在非 %PDF 开头时按单页文本处理，便于调试与测试稳定。
- 分页限制：parsePdf(input, {maxPages}) 支持仅解析前 N 页，用于 e2e 与性能验证。
- 章节识别：正则 `^\s*(\d+(?:\.\d+){0,3})[.)]?\s+(.{2,80})$`；detectHeadings 返回 {page,line,section,title}。
- 分段构建：buildSections 数字序排序；段 id 模板 `sec: ${section}, ${title}`；无标题时添加 `sec:document`。
- 引用提取：先将连字符两侧空格规整为 `-`，再用模式 `[A-Z]{2,}-\d{2,}|[A-Z]{2,}\d{2,}|[A-Z]{2,}-\d{3,}[A-Z]?`。
- 切片：chunkSections 默认 maxChars=4000, minChars=1500（无重叠）；末尾过小切片会并入前一块；chunk.id 使用 sha1 截断。按章节/段落为主进行切分。
- CLI：`src/cli/ingest.js` 将 parsePdf + buildSections + chunkSections 串联，输出 {meta,sections,chunks} 到 stdout；参数：--max, --pages, --db；环境变量通过 dotenv 自动加载（.env），数据库路径覆盖顺序：--db > SUNNY_SQLITE > :memory:。
- DB API：saveSections(db, sourceId, sections), saveDefinitions(db, definitions), saveSectionDefinitionRelations(db, relations), getChunk(db, id), getChunksBySource(db, sourceId, {limit, offset}), getDocuments(db), getDocument(db, sourceId), refreshDocument(db, sourceId, {pageCount, processedPages}).
- Schema：sections(id=section_code 'X Y Z'/title/start_page/end_page/source_id, overview, p14, p15, p17, p18)、parts(section_id,part_no,title)、chunks(section_id, part_no, level2_code, level3_code, text)、documents(汇总)、std_refs(id, title)、section_std_refs_relations、definitions(id=abbreviation, definition)、section_definition_relations（拆分阶段完成）。

## 测试策略
- 使用 Node test（node --test）。
- 单元测试：analyze、chunk、pipeline、ingest 文本输入。
- e2e：demo.pdf（真实 PDF），使用 --pages 50 控制耗时；断言 sections/std_refs/definitions 提取正确，relations 建立，边界情况处理。
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
