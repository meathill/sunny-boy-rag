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


输出期望
---

- 变更范围小
- 附带必要说明
- 遵守现有约定