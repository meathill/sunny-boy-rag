Sunny boy RAG
=====

我们公司是一家电子元器件生产销售公司。在向全球扩张的时候，我们遇到一个关于技术标准问题：
当我们去国外竞标的时候，需要保证我们的产品能够符合国外的标准。但是国外标准很多，缺少系统的、
结构化的数据。公司希望我使用最新的AI技术解决这个问题。我认为这个场景下，定制化的 RAG
会是个不错的选择。

理由如下：

1. 我看了他国的技术规范文档，虽然不是结构化数据，但作为专业文档，格式比较统一
2. 我认为使用AI从中提取数据是可行的
3. 所以拆分技术文档，批量处理，整理成数据库应该也是可行的
4. 然后配合AI自然语言理解，从我们的技术文档中提取产品类型，生成sql查询数据

于是关于本产品，我设计的使用流程是：

1. 上传国外标准技术文档（通常是PDF）
2. 对文档进行拆分，因为文档数量巨大，几乎不可能一次性处理
3. 使用LLM逐片解析，并生成准确的数据库
4. 暂时使用本地数据库 sqlite 存储
5. 因为涉及到引用，比如："不锈钢元器件需遵守 ABC-001 规范"，
   所以数据可能需要多轮处理
6. 开发 Web UI，提供简单的输入，然后生成 SQL，并检索结果
7. 然后通过AI生成语义化结果

进度
---

- ✅ **阶段一：PDF解析与分片**（已完成）
  - 支持解析真实 PDF（pdfjs-dist），文本文件将回退为单页解析
  - 自动检测"Section X Y Z"字面标识并聚合为 Section
  - 支持 Part 1/2/3 识别，从 Part 1 提取结构化数据：
    - 1.2 Related Sections：建立 Section 间引用关系
    - 1.3 References：提取技术规范（IEC、BS、DEWA 等）
    - 1.6 Definitions：提取缩写和定义（AC、DEWA、ATS/ATC 等）
  - 支持按字符长度切片（默认无重叠，按章节/段落分片）
  - 提供 CLI（ingest）默认写入 last-ingest.json，并写入 sqlite（--db > SUNNY_SQLITE > 内存），stdout 仅打印 done/failed
  
- ✅ **阶段二：AI智能解析**（已完成）
  - 实现AI驱动的requirements提取系统
  - **AI技术栈**：集成 Vercel AI SDK + Vercel AI Gateway
    - 统一的AI接口，支持 OpenAI、Anthropic 和 Google/Gemini
    - 可选 AI Gateway 用于请求路由、成本监控、速率限制
    - Mock模式用于测试，不消耗API配额
  - 四大类型要求自动提取：
    - **标准合规要求**：IEC、ISO、BS等国际标准引用
    - **技术规格**：电气参数、环境条件、保护等级等
    - **设计与安装要求**：物理设计、安装规范、配置要求
    - **测试与验收要求**：FAT/SAT、型式试验、文档交付
  - 支持多AI提供商（OpenAI、Anthropic、Google/Gemini、Mock）
  - 提供parse CLI工具进行批量处理
    - 支持 --section-id 参数按Section精准处理（节省API消耗）
  - 提供query CLI工具查询Section要求（支持递归查询关联Section）
  - 完整的处理状态跟踪和错误重试机制
  
- 🚧 **阶段三：Web UI**（规划中）
  - 产品规范查询界面
  - 可视化展示requirements
  - 支持导出和分享

- 测试：包含单元测试、真实 PDF（demo.pdf）的 e2e 测试；数据库相关测试在本地可用原生绑定时执行
  - Section 按"Section X Y Z"识别，id 即"X Y Z"；Part 1 中切出 overview（至 1.2 前）及 1.4/1.5/1.7/1.8 段
  - 从 Part 1 的 1.2/1.3/1.6 分别抽取 section_relations、std_refs、definitions 及关联表
  - 清洗页眉页脚（含 Pages: N of M、DMBLP - RTA - N0001 块）
  - AI解析功能完整测试覆盖（MockAI、数据库操作、查询功能）



工具使用说明
---

- [基础使用说明（Usage）](docs/usage.md)
- [AI解析系统实现文档](docs/ai-implementation.md)
- [开发笔记（Dev Notes）](docs/dev-notes.md)
