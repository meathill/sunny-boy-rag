# AI 集成快速开始

## 1分钟配置

### 第一步：复制环境变量模板
```bash
cp .env.example .env
```

### 第二步：编辑 .env 文件
```bash
# 必需配置
SUNNY_SQLITE=./data.sqlite
AI_PROVIDER=openai

# OpenAI 用户
OPENAI_API_KEY=sk-proj-your-key-here

# Anthropic 用户
# AI_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 第三步：测试（使用 Mock）
```bash
# 不消耗 API，快速验证系统
./src/cli/parse.js parse --section-id "26 24 13" --limit 1
```

### 第四步：真实运行
```bash
# 使用真实 AI 处理最短的 Section
./src/cli/parse.js parse --section-id "26 24 13" --limit 3
```

## 常用命令

### 处理特定 Section（推荐）
```bash
# 处理 Section 26 24 13 的所有 chunks
./src/cli/parse.js parse --section-id "26 24 13"

# 限制数量（测试用）
./src/cli/parse.js parse --section-id "26 25 13" --limit 5
```

### 批量处理
```bash
# 处理前 10 个未处理的 chunks
./src/cli/parse.js parse --limit 10

# 调整并发数（默认 3）
./src/cli/parse.js parse --concurrency 5 --limit 20
```

### 查看统计
```bash
# 查看处理进度
./src/cli/parse.js stats

# 查看帮助
./src/cli/parse.js --help
```

### 查询结果
```bash
# 查询 Section 的所有 requirements
./src/cli/query.js "26 24 13"

# 递归查询（包含关联的 Sections）
./src/cli/query.js "26 24 13" --recursive

# 文本格式输出
./src/cli/query.js "26 24 13" --format text
```

## 提供商选择

### OpenAI（推荐新手）
- 模型成熟稳定
- 文档完善
- 中文支持好

```bash
# .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-xxx
AI_MODEL=gpt-5  # 可选
```

### Anthropic（推荐性价比）
- Claude 3.5 Sonnet 性能优秀
- 成本更低（约 OpenAI 的 1/3）
- 长文本处理能力强

```bash
# .env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
AI_MODEL=claude-sonnet-4-5  # 可选
```

### Mock（推荐测试）
- 不消耗 API 配额
- 快速验证逻辑
- 返回模拟数据

```bash
# .env
AI_PROVIDER=mock
# 无需 API Key
```

## 成本估算

### 每个 Chunk 的成本
- OpenAI GPT-4 Turbo: $0.01-0.05
- Anthropic Claude 3.5: $0.005-0.02

### 测试建议
1. 先用 Mock 模式验证逻辑（免费）
2. 处理最短的 Section（~10 chunks，成本 $0.05-0.50）
3. 确认质量后批量处理

### 完整文档成本估算
- Demo PDF (3 Sections, ~50 chunks): $0.50-2.50
- 完整 PDF (几十个 Sections): 取决于总 chunks 数量

## AI Gateway（可选）

如需成本追踪、速率限制等高级功能：

```bash
# .env 添加
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT/YOUR_GATEWAY
```

详见：`docs/ai-sdk-guide.md`

## 故障排除

### 问题：API Key 错误
```
Error: AI API error: 401 Unauthorized
```
**解决**：检查 .env 中的 API Key 是否正确

### 问题：没有数据返回
```
Processed 0 chunks
```
**解决**：先运行 `ingest` 命令处理 PDF，然后再运行 `parse`

### 问题：解析失败
```
Failed to parse AI response
```
**解决**：这是正常的，AI 偶尔会返回非 JSON。系统会自动跳过继续处理。

## 下一步

1. ✅ 测试 Mock 模式
2. ✅ 配置真实 API Key
3. ✅ 处理最短的 Section
4. ⬜ 验证数据质量
5. ⬜ 批量处理
6. ⬜ 开发 Web UI

## 完整文档

- [使用说明](docs/usage.md)
- [AI SDK 指南](docs/ai-sdk-guide.md)
- [AI 实现文档](docs/ai-implementation.md)
- [开发笔记](docs/dev-notes.md)

---

💡 **提示**：首次使用建议从 `--section-id "26 24 13" --limit 1` 开始测试！
