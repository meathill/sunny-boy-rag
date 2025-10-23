# AI解析系统实现文档

## 概述

本系统实现了对技术规范PDF文档Part 2和Part 3内容的AI智能解析，将自然语言描述的规范要求提取为结构化数据，便于查询和分析。

## 系统架构

### 数据模型

#### 核心表结构

1. **compliance_requirements** - 标准合规要求
   - 存储所有标准引用和认证要求
   - 关联到具体的标准ID（std_refs表）
   - 记录强制性、适用对象等

2. **technical_specs** - 技术规格
   - 电气参数（电压、电流、频率等）
   - 环境条件（温度、湿度、防护等级等）
   - 机械性能（尺寸、重量等）
   - 性能指标（效率、容量等）

3. **design_requirements** - 设计与安装要求
   - 设计规范（颜色、外壳、材料等）
   - 安装要求（高度、位置、间隙等）
   - 配置要求（备用容量、附件等）
   - 安全特性（急停按钮、联锁等）

4. **testing_requirements** - 测试与验收要求
   - FAT/SAT测试
   - 型式试验
   - 常规测试
   - 文档交付
   - 培训要求

5. **ai_processing_status** - AI处理状态跟踪
   - 记录每个chunk的处理状态
   - 支持错误重试
   - 便于监控处理进度

### AI解析流程

```
PDF chunks (Part 2/3)
  ↓
AI Parser (parallel extraction)
  ├→ extractComplianceRequirements
  ├→ extractTechnicalSpecs
  ├→ extractDesignRequirements
  └→ extractTestingRequirements
  ↓
Structured data → Database tables
```

## 使用指南

### 环境配置

```bash
# .env 文件
SUNNY_SQLITE=./data.sqlite

# 使用真实AI服务（可选）
AI_PROVIDER=openai  # 或 anthropic
AI_API_KEY=your-api-key
AI_MODEL=gpt-5  # 可选
```

### 命令行工具

#### 1. AI解析命令 (`parse.js`)

处理未解析的chunks，提取结构化数据：

```bash
# 查看帮助
./src/cli/parse.js --help

# 查看处理统计
./src/cli/parse.js stats

# 处理前10个chunks
./src/cli/parse.js parse --limit 10

# 使用真实OpenAI API（带速率限制）
AI_PROVIDER=openai ./src/cli/parse.js parse --limit 5 --concurrency 1 --delay 5000

# 自定义并发数（无延迟）
./src/cli/parse.js parse --concurrency 3 --limit 20

# 针对免费API额度限制：单并发 + 5秒延迟
./src/cli/parse.js parse --concurrency 1 --delay 5000
```

**速率限制说明：**
- `--concurrency 1`: 一次只处理一个chunk（适用于免费API额度）
- `--delay 5000`: 每次AI请求之间暂停5秒（5000毫秒）
- **重要**：每个chunk包含4次AI请求，当有delay时串行执行
- 示例：`--delay 5000` 时，每个chunk需要约15秒（4次请求，3个间隔）

#### 2. 查询命令 (`query.js`)

查询Section的所有要求：

```bash
# 查看帮助
./src/cli/query.js --help

# 查询特定Section（JSON格式）
./src/cli/query.js "26 24 13"

# 查询并包含关联Section（文本格式）
./src/cli/query.js "26 24 13" --recursive --format text

# 查询特定数据库
./src/cli/query.js "26 25 13" --db ./data.sqlite
```

### 编程接口

#### 处理单个chunk

```javascript
import { processChunk } from './src/ai/parser.js';
import { createAIClient } from './src/ai/client.js';

const aiClient = createAIClient();
const chunk = {
  id: 'chunk-1',
  section_id: '26 24 13',
  part_no: 2,
  text: 'Your chunk text...'
};

const results = await processChunk(chunk, aiClient);
// results = {
//   compliance: [{ sectionId, stdRefId, requirementText, ... }],
//   technical: [{ sectionId, specCategory, parameterName, value, ... }],
//   design: [{ sectionId, requirementCategory, requirementText, ... }],
//   testing: [{ sectionId, testType, requirementText, ... }]
// }
// 所有数据都是结构化对象，无需额外解析
```

#### 批量处理

```javascript
import { batchProcessChunks } from './src/ai/parser.js';
import { getUnprocessedChunks } from './src/db/sqlite.js';

const chunks = getUnprocessedChunks(db, { limit: 10 });

const { results, errors } = await batchProcessChunks(chunks, aiClient, {
  concurrency: 3,
  onProgress: ({ chunk, result, processed, total }) => {
    console.log(`[${processed}/${total}] Processed ${chunk.id}`);
  },
  onError: ({ chunk, error }) => {
    console.error(`Error processing ${chunk.id}:`, error);
  }
});
```

#### 查询要求

```javascript
import { getSectionRequirements, getAllSectionRequirementsRecursive } from './src/db/sqlite.js';

// 直接查询
const reqs = getSectionRequirements(db, '26 24 13');

// 递归查询（包含关联Section）
const allReqs = getAllSectionRequirementsRecursive(db, '26 24 13');
```

## AI提示词设计

### 结构化输出（Zod Schema）

系统使用 Vercel AI SDK 的 `generateObject` 功能，通过 zod schema 定义数据结构。AI 直接返回验证后的结构化对象，无需手动解析 JSON。

### 提取标准合规要求

**Zod Schema 定义：**
```javascript
const complianceRequirementSchema = z.object({
  items: z.array(z.object({
    std_ref_id: z.string().nullable(),
    requirement_text: z.string(),
    applies_to: z.string().nullable(),
    is_mandatory: z.number(),
    requirement_type: z.enum(['standard_compliance', 'certification', 'accreditation', 'test_method'])
  }))
});
```

系统识别以下模式：
- 国际/行业标准ID（IEC, BS, EN, ISO, ASTM等）
- 认证要求（"certified by ASTA/KEMA"）
- 质量体系认证（"ISO 9001 accredited"）

对每个要求提取：
- 标准ID
- 完整要求文本
- 适用对象
- 强制性（shall/must vs should）
- 要求类型（合规/认证/质量体系等）

### 提取技术规格

识别以下类型：
- **electrical**: 电压、电流、频率、功率
- **mechanical**: 尺寸、重量、安装方式
- **environmental**: 温度、湿度、IP/IK等级
- **protection**: 过载、短路、漏电保护
- **performance**: 效率、容量、额定值
- **material**: 材料规格

对每个规格提取：
- 参数名称
- 数值和单位
- 测试标准（如果有）
- 完整要求文本

### 提取设计要求

识别以下类别：
- **design**: 物理设计（颜色、外壳等）
- **construction**: 构造要求（材料、组装等）
- **installation**: 安装规范（高度、位置等）
- **configuration**: 配置要求（备用容量等）
- **safety**: 安全特性（急停、联锁等）
- **accessibility**: 可访问性要求

### 提取测试要求

识别以下类型：
- **FAT**: 工厂验收测试
- **SAT**: 现场验收测试
- **type_test**: 型式试验
- **routine_test**: 常规测试
- **inspection**: 检验要求
- **documentation**: 文档交付
- **training**: 培训要求
- **warranty**: 质保要求

## AI客户端实现

### 支持的AI提供商

1. **OpenAI** (GPT-4, GPT-3.5等)
2. **Anthropic** (Claude系列)
3. **Google** (Gemini系列)
4. **Mock** (测试用，基于正则匹配)

### 配置示例

```javascript
// Mock客户端（默认，用于测试）
const mockClient = createAIClient({ provider: 'mock' });

// OpenAI客户端（API Key 通过 OPENAI_API_KEY 环境变量）
const openaiClient = createAIClient({
  provider: 'openai',
  model: 'gpt-5'  // 可选
});

// Anthropic客户端（API Key 通过 ANTHROPIC_API_KEY 环境变量）
const claudeClient = createAIClient({
  provider: 'anthropic',
  model: 'claude-sonnet-4-5'  // 可选
});

// Google客户端（API Key 通过 GOOGLE_API_KEY 环境变量）
const geminiClient = createAIClient({
  provider: 'google',
  model: 'gemini-2.5-pro'  // 可选
});
```

### 结构化输出接口

所有客户端实现统一的 `generateStructured(prompt, schema)` 接口：

```javascript
import { z } from 'zod';

const schema = z.object({
  items: z.array(z.object({
    field1: z.string(),
    field2: z.number(),
  }))
});

const result = await client.generateStructured('Extract data...', schema);
// result = { items: [{ field1: '...', field2: 123 }, ...] }
```

## 数据查询模式

### 基础查询

```sql
-- 查询Section的所有合规要求
SELECT * FROM compliance_requirements WHERE section_id = '26 24 13';

-- 查询特定类型的技术规格
SELECT * FROM technical_specs 
WHERE section_id = '26 24 13' 
  AND spec_category = 'electrical';
```

### 复杂查询

```sql
-- 查询Section及其关联Section的所有标准
WITH RECURSIVE section_tree AS (
  SELECT section_id, related_section_id FROM section_relations
  WHERE section_id = '26 24 13'
  UNION
  SELECT sr.section_id, sr.related_section_id
  FROM section_relations sr
  JOIN section_tree st ON sr.section_id = st.related_section_id
)
SELECT DISTINCT std_ref_id, requirement_text
FROM compliance_requirements
WHERE section_id IN (SELECT related_section_id FROM section_tree)
  AND std_ref_id IS NOT NULL;
```

### 统计查询

```sql
-- 统计每个Section的要求数量
SELECT 
  section_id,
  COUNT(*) as total_requirements,
  SUM(CASE WHEN is_mandatory = 1 THEN 1 ELSE 0 END) as mandatory_count
FROM compliance_requirements
GROUP BY section_id;

-- 统计最常引用的标准
SELECT 
  std_ref_id,
  COUNT(DISTINCT section_id) as section_count,
  COUNT(*) as reference_count
FROM compliance_requirements
WHERE std_ref_id IS NOT NULL
GROUP BY std_ref_id
ORDER BY reference_count DESC;
```

## 性能考虑

### 批处理策略

- 默认并发度：3（避免API限流）
- 推荐batch size：10-20个chunks
- 支持断点续传（通过ai_processing_status表）

### 成本优化

- 使用MockAIClient进行开发和测试
- 生产环境建议使用GPT-3.5-turbo（成本低、速度快）
- 对复杂内容可升级使用GPT-4
- 支持增量处理，避免重复解析

### 错误处理

- 自动记录失败的chunks
- 支持重试机制（retry_count字段）
- 详细的错误日志
- 可选的人工审核流程

## 扩展性

### 添加新的提取器

```javascript
import { z } from 'zod';

// 1. 定义 zod schema
const newRequirementSchema = z.object({
  items: z.array(z.object({
    field1: z.string().describe('Field 1 description'),
    field2: z.number().describe('Field 2 description'),
  }))
});

// 2. 实现提取函数
export async function extractNewRequirement(text, context, aiClient) {
  const prompt = `Your custom prompt...
  
Text to analyze:
---
${text}
---`;

  const result = await aiClient.generateStructured(prompt, newRequirementSchema);
  
  return result.items.map(req => ({
    sectionId: context.sectionId,
    chunkId: context.chunkId,
    field1: req.field1,
    field2: req.field2,
  }));
}
```

### 添加新的AI提供商

如果 Vercel AI SDK 支持新提供商，只需在 `createAIClient` 中添加：

```javascript
case 'newprovider':
  return new VercelAIClient({
    provider: 'newprovider',
    model
  });
```

并在 `VercelAIClient` 构造函数中初始化模型：

```javascript
case 'newprovider': 
  this.#model = newprovider(model); 
  break;
```

## 测试

### 运行测试

```bash
npm test
```

### 测试覆盖

- ✅ AI schema创建
- ✅ 数据保存函数
- ✅ 查询函数
- ✅ MockAI客户端提取
- ✅ 处理状态跟踪
- ✅ 递归查询
- ✅ 批处理逻辑

## 最佳实践

1. **分步处理**: 先处理少量chunks验证效果，再批量处理
2. **定期验证**: 抽查AI提取结果，确保质量
3. **增量更新**: 利用ai_processing_status表实现断点续传
4. **成本控制**: 开发测试使用Mock，生产使用真实API
5. **数据备份**: 定期备份SQLite数据库
6. **监控日志**: 关注处理进度和错误信息

## 常见问题

### Q: AI提取不准确怎么办？
A: 1) 优化prompt; 2) 使用更强大的模型(GPT-4); 3) 增加few-shot示例

### Q: 处理中断如何恢复？
A: 系统自动记录处理状态，重新运行parse命令即可继续

### Q: 如何重新处理某个Section？
A: 删除该Section的ai_processing_status记录，重新运行parse

### Q: 支持哪些AI模型？
A: OpenAI (GPT-3.5/4)、Anthropic (Claude)、Google (Gemini)、或自定义实现

## 未来改进方向

1. **提示词优化**: 基于实际数据反馈持续优化
2. **多语言支持**: 支持英文以外的技术文档
3. **细粒度分类**: 更详细的requirement_type分类
4. **关系抽取**: 自动识别requirement之间的依赖关系
5. **可视化界面**: Web UI展示分析结果
6. **导出功能**: 支持导出为Excel、PDF等格式
