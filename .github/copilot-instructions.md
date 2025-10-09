项目介绍
---

- 分析技术规范文档，通常是PDF文件
- 分片处理文档，使用AI提取内部数据
- 存入本地 SQLite 数据库
- 提供Web UI，可以检索数据


构建与运行
---

- 安装依赖：pnpm install
- 运行测试：pnpm test
- 执行步骤一（读取+分析+切片PDF）：pnpm ingest path/to/file.pdf > output.json

测试与校验
---

- 单元测试：node --test（已通过）
- parsePdf 自动识别非PDF缓冲并回退为单页文本，确保测试稳定


约束
---

- TypeScript / JavaScript
- 缩进使用2空格
- 使用严格 ESLint 规范
- 文件名 kebab-case
- 变量名 camelCase


PDF 信息结构
---

我们目前只考虑下面一种 PDF 格式，未来如果有其它格式需求，我们再设计方案。

- Section
    - Section 是此 PDF 的基础结构单元，每个 Section 对一类电子元器件做出规定。
        所以我们应该以 Section 为最大的数据结构单位。
    - Section 的格式为 `Section X Y Z`，其中 X Y Z 是数字，构成 Section ID，
        不同 Section 以 Section ID 互相关联。
    - Section 有标题，另起一行放在 `Section X Y Z` 下面。标识此 Section 针对
        的电子元器件类型。
- Part
    - Part 是 Section 的子单元，每个 Section 包含三个 Part：
        - Part 1: General 包含 Section 的通用信息，比如概览、相关 Sections、
            规范定义，等等。 
        - Part 2: Product 具体的技术规范，每个产品（电子元器件）需要遵守的技术标准，
            这里需要注意的是，有些规范是通用规范，即该类目下所有产品都要遵守；有些是
            专用规范，即只有某些特定产品需要遵守。
        - Part 3: Execution 包含测试、包装、仓储、交付、培训等规范。

基于以上这些信息结构，我们需要重新设计数据库架构，以便更好的存储和查询信息。      


输出期望
---

- 变更范围小
- 附带必要说明
- 遵守现有约定
