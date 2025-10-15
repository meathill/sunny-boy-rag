# Vercel AI SDK 集成指南

## 概述

本项目使用 Vercel AI SDK 实现 AI 驱动的技术规范提取，具有以下优势：

- **统一接口**：一套代码支持多个 AI 提供商
- **类型安全**：完整的 TypeScript 类型支持
- **流式响应**：支持流式输出（虽然当前使用 generateText）
- **Gateway 支持**：可选接入 Vercel AI Gateway 进行管理

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
# 必需：数据库路径
SUNNY_SQLITE=./data.sqlite

# 必需：AI 提供商
AI_PROVIDER=openai  # 或 anthropic

# OpenAI 配置
OPENAI_API_KEY=sk-proj-xxxxx
AI_MODEL=gpt-5  # 可选，默认值

# 或者使用 Anthropic
# ANTHROPIC_API_KEY=sk-ant-xxxxx
# AI_MODEL=claude-sonnet-4-5

# 可选：使用 AI Gateway
# AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT/YOUR_GATEWAY
```

### 2. 测试 Mock 模式

在不消耗 API 配额的情况下测试系统：

```bash
# 默认使用 Mock 模式
./src/cli/parse.js parse --section-id "26 24 13" --limit 1
```

### 3. 使用真实 AI

配置好 API Key 后：

```bash
# 使用 OpenAI
AI_PROVIDER=openai ./src/cli/parse.js parse --section-id "26 24 13" --limit 3

# 使用 Anthropic
AI_PROVIDER=anthropic ./src/cli/parse.js parse --section-id "26 25 13" --limit 3
```

## AI Gateway 配置

### 为什么使用 AI Gateway？

- **成本追踪**：统一追踪所有 AI 请求的成本
- **速率限制**：避免超出 API 配额
- **请求路由**：智能路由到不同的提供商
- **缓存**：减少重复请求的成本

### Vercel AI Gateway 设置

1. 访问 Vercel 控制台创建 Gateway
2. 获取 Gateway URL
3. 配置环境变量：
   ```bash
   AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT/YOUR_GATEWAY
   ```

### Cloudflare AI Gateway 设置

Cloudflare 也提供类似的服务：

1. 访问 Cloudflare 控制台 → AI → AI Gateway
2. 创建新的 Gateway
3. 配置 URL：
   ```bash
   AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_NAME
   ```

## 代码示例

### 基本使用

```javascript
import { createAIClient } from './src/ai/client.js';

// 自动从环境变量读取配置
const client = createAIClient();

// 或手动配置
const client = createAIClient({
  provider: 'openai',
  apiKey: 'sk-xxx',
  model: 'gpt-5',
  gatewayUrl: 'https://...'
});

// 发送请求
const response = await client.complete('Analyze this text...');
```

### 处理 Chunks

```javascript
import { processChunk } from './src/ai/parser.js';
import { createAIClient } from './src/ai/client.js';

const client = createAIClient();
const chunk = { 
  id: 1, 
  section_id: '26 24 13', 
  text: '...',
  part_no: 2 
};

const results = await processChunk(chunk, client);
// results 包含 compliance, technical, design, testing 四类提取结果
```

### 批量处理

```javascript
import { batchProcessChunks } from './src/ai/parser.js';

const results = await batchProcessChunks(chunks, client, {
  concurrency: 3,  // 并发数
  onProgress: ({ processed, total }) => {
    console.log(`Progress: ${processed}/${total}`);
  },
  onError: ({ chunk, error }) => {
    console.error(`Error processing chunk ${chunk.id}:`, error);
  }
});
```

## 成本估算

### OpenAI GPT-4 Turbo

- Input: ~$10 / 1M tokens
- Output: ~$30 / 1M tokens
- 每个 chunk 约 1000-3000 input tokens
- 每个 chunk 约 500-1500 output tokens
- **估算成本**: $0.01-0.05 / chunk

### Anthropic Claude 3.5 Sonnet

- Input: ~$3 / 1M tokens
- Output: ~$15 / 1M tokens
- **估算成本**: $0.005-0.02 / chunk

### 建议

- 先用 `--section-id` 处理最短的 Section 进行测试
- 使用 Mock 模式验证逻辑
- 逐步增加 `--limit` 参数
- 考虑使用 Claude 3.5 Sonnet（性价比更高）

## 故障排除

### API Key 错误

```
Error: AI API error: 401 Unauthorized
```

解决：检查 `.env` 文件中的 API Key 是否正确。

### Gateway 连接错误

```
Error: AI API error: Failed to fetch
```

解决：检查 AI_GATEWAY_URL 是否正确，确保网络连接正常。

### 响应解析失败

```
Failed to parse AI response: Unexpected token
```

这通常是 AI 返回了非 JSON 格式。系统会自动尝试提取 markdown 代码块中的 JSON，如果仍然失败，该 chunk 会返回空结果但不会中断处理。

## 扩展支持

### 添加新的提供商

在 `src/ai/client.js` 中添加新的 provider 分支：

```javascript
case 'newprovider':
  return new VercelAIClient({
    provider: 'newprovider',
    model,
    apiKey,
    gatewayUrl,
  });
```

### 自定义提示词

编辑 `src/ai/parser.js` 中的提示词函数：
- `extractComplianceRequirements()`
- `extractTechnicalSpecs()`
- `extractDesignRequirements()`
- `extractTestingRequirements()`

## 最佳实践

1. **先测试后批量**：使用 Mock 或小数据集验证逻辑
2. **监控成本**：使用 AI Gateway 追踪成本
3. **错误处理**：系统已内置重试和错误恢复
4. **并发控制**：根据 API 配额调整 `--concurrency`
5. **增量处理**：使用 `--section-id` 逐个 Section 处理
6. **结果验证**：定期抽查 AI 提取的准确性

## 相关文档

- [使用说明](./usage.md)
- [AI 实现文档](./ai-implementation.md)
- [开发笔记](./dev-notes.md)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
