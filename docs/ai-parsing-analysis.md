# AI解析阶段分析与设计

## 当前数据现状

根据对demo.pdf的分析，我们已经成功提取：

### Part 1 (General) 数据
- ✅ Section基本信息（id, title, start/end pages）
- ✅ Overview（概览部分）
- ✅ Section Relations（1.2 Related Sections）- 存储在 `section_relations` 表
- ✅ Standard References（1.3 References）- 存储在 `std_refs` 和 `section_std_refs_relations` 表
- ✅ Definitions（1.6 Definitions/Acronyms）- 存储在 `definitions` 和 `section_definition_relations` 表
- ✅ Quality Requirements（1.4）
- ✅ Submittals（1.5）
- ✅ Warranty（1.7）
- ✅ Spare Parts（1.8）

### Part 2/3 数据
- ✅ Chunks按照3级标题正确切分
- ✅ 每个chunk包含完整的小节内容
- ⚠️ 需要AI进一步提取结构化规范信息

## 用户需求分析

用户最终目标：**根据产品类型（Section），快速查询所有需要遵守的规范和认证标准**

## 规范类型层级分析

通过阅读demo.pdf的Part 2和Part 3，我发现规范可以分为以下几类：

### 1. 引用其他Section的规范（跨Section依赖）
**示例：**
- "The Contractor shall comply with the requirements of Section 01 81 13 Sustainability Design Requirements"
- "The Contractor shall comply with the requirements of Section 01 80 60 Environmental Design Criteria"

**特点：**
- 明确引用其他Section编号
- 表示当前产品需要遵守引用Section的规范
- 形成Section之间的依赖关系

**存储：** 已存储在 `section_relations` 表中（从Part 1的1.2提取）

### 2. 国际/行业标准认证要求（Standard Compliance）
**示例：**
- "All switchboards shall comply with IEC 61439-1, IEC 61439-2, and IEC 61439-3"
- "All switchgears and circuit breakers shall comply with IEC 60947-2 / BS EN 60898-2"
- "All the proposed products shall be certified by ASTA/KEMA/LOVAG"
- "Selected product manufacturing facility shall be ISO 9001 accredited"

**特点：**
- 引用具体的标准编号（IEC, BS, EN, ISO, DEWA等）
- 可能要求认证证书
- 明确的合规要求

**存储：** 部分已存储在 `std_refs` 表中（从Part 1的1.3提取），但Part 2/3中还有更多标准引用

### 3. 技术性能指标（Technical Requirements）
**示例：**
- "All switchboards and components shall be temperature compensated to give the design current rating at 52°C"
- "All switchboards shall be suitable for use on a 400V, three phase and neutral, (TPN +PE) 4 wire 50Hz, AC system"
- "All floor mounted switchboards shall conform to IK 10 for the mechanical impact to IEC 62262"
- "The breaking capacity performance certificates shall be available for category B"

**特点：**
- 具体的技术参数（温度、电压、频率、防护等级等）
- 可能引用标准中的测试方法
- 可量化的性能指标

**存储：** 目前仅存储在 `chunks` 的原始文本中

### 4. 设计与施工要求（Design & Installation Requirements）
**示例：**
- "All floor mounted switchboards shall be provided with cable entry from bottom side only"
- "All wall mounted SMDBs shall be installed at a minimum height of 600mm from the finished floor level"
- "Internal LED lights with door switch shall be provided inside each switchboard and cubicle"
- "Emergency push button shall be provided on all switchboards excluding final DBs"

**特点：**
- 设计规范（材料、结构、配置）
- 安装要求（位置、高度、方式）
- 配置要求（spare capacity, accessories）

**存储：** 目前仅存储在 `chunks` 的原始文本中

### 5. 测试与验收要求（Testing & Acceptance）
**示例（来自Part 3）：**
- "The Contractor shall comply with the requirements of Section 01 45 24 Testing Program Requirements"
- "FAT shall be carried out in the presence and to the approval of the Employer and Engineer"

**特点：**
- 测试流程要求
- 验收标准
- 文档交付要求

**存储：** 目前仅存储在 `chunks` 的原始文本中

## 数据结构设计建议

### 方案A：完全结构化（推荐用于标准合规）

创建新表 `requirements`：
```sql
CREATE TABLE requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  requirement_type TEXT NOT NULL,  -- 'standard_compliance', 'technical_spec', 'design_requirement', 'testing', 'other'
  std_ref_id TEXT,                 -- 外键关联到std_refs（如果是标准合规）
  related_section_id TEXT,         -- 外键关联到sections（如果是跨section引用）
  category TEXT,                   -- 更细的分类，如'temperature', 'voltage', 'certification', 'installation'
  description TEXT NOT NULL,       -- AI提取的规范描述
  original_text TEXT NOT NULL,     -- 原始文本
  is_mandatory BOOLEAN DEFAULT 1,  -- 是否强制要求
  applies_to TEXT,                 -- 适用范围（如果有特定的子产品/组件）
  FOREIGN KEY (section_id) REFERENCES sections(id),
  FOREIGN KEY (chunk_id) REFERENCES chunks(id),
  FOREIGN KEY (std_ref_id) REFERENCES std_refs(id),
  FOREIGN KEY (related_section_id) REFERENCES sections(id)
);

CREATE INDEX idx_requirements_section ON requirements(section_id);
CREATE INDEX idx_requirements_type ON requirements(requirement_type);
CREATE INDEX idx_requirements_std_ref ON requirements(std_ref_id);
```

### 方案B：半结构化（推荐用于快速实现）

扩展 `chunks` 表，添加AI提取的结构化字段：
```sql
ALTER TABLE chunks ADD COLUMN requirements_json TEXT;
-- 存储JSON格式的提取结果，如：
-- {
--   "standard_refs": ["IEC 61439-1", "IEC 61439-2"],
--   "section_refs": ["01 81 13", "01 80 60"],
--   "technical_specs": [
--     {"param": "temperature", "value": "52°C", "type": "rating"},
--     {"param": "voltage", "value": "400V", "type": "system"}
--   ],
--   "design_requirements": [...],
--   "testing_requirements": [...]
-- }
```

### 方案C：混合方案（最佳平衡）

1. **标准合规** - 使用方案A的 `requirements` 表，专门存储标准引用
2. **技术指标** - 创建单独的 `technical_specs` 表
3. **其他要求** - 保留在 `chunks` 中，通过全文检索

```sql
-- 标准合规要求
CREATE TABLE compliance_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  std_ref_id TEXT,
  requirement_text TEXT NOT NULL,
  applies_to TEXT,
  is_mandatory BOOLEAN DEFAULT 1,
  FOREIGN KEY (section_id) REFERENCES sections(id),
  FOREIGN KEY (chunk_id) REFERENCES chunks(id),
  FOREIGN KEY (std_ref_id) REFERENCES std_refs(id)
);

-- 技术规格
CREATE TABLE technical_specs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  spec_category TEXT,     -- 'electrical', 'mechanical', 'environmental', 'protection'
  parameter_name TEXT,    -- 'voltage', 'temperature', 'IP_rating', 'IK_rating'
  value TEXT,
  unit TEXT,
  test_standard TEXT,     -- 如 'IEC 62262'
  requirement_text TEXT NOT NULL,
  FOREIGN KEY (section_id) REFERENCES sections(id),
  FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);
```

## AI Prompt设计思路

### 提取标准合规要求
```
Analyze the following technical specification chunk and extract all standard compliance requirements.

For each requirement, identify:
1. Standard reference ID (e.g., "IEC 61439-1", "BS 7671", "ISO 9001")
2. What it applies to (component/product)
3. Whether it's mandatory or optional
4. The original sentence

Return as JSON array.
```

### 提取技术规格
```
Analyze the following technical specification chunk and extract all technical specifications and performance requirements.

For each specification, identify:
1. Category (electrical/mechanical/environmental/protection)
2. Parameter name (voltage/temperature/IP rating/etc.)
3. Value and unit
4. Test standard (if mentioned)
5. The original sentence

Return as JSON array.
```

## 实施建议

### 阶段1：标准合规提取（优先级最高）
- 实现 `compliance_requirements` 表
- AI提取Part 2/3中的标准引用
- 关联到已存在的 `std_refs` 表
- 补充 `std_refs` 表（Part 2/3中可能有新的标准）

### 阶段2：技术规格提取
- 实现 `technical_specs` 表
- AI提取可量化的技术指标
- 建立参数分类体系

### 阶段3：查询接口
- 根据Section ID查询所有合规要求
- 聚合所有相关Section的要求（通过section_relations递归）
- 提供按标准、按参数类型的筛选

## 疑问与讨论点

1. **是否需要处理条件性要求？**
   - 有些要求带有"if/when"条件，如"All Motors shall be provided with earth leakage protections"
   - 是否需要提取条件逻辑？

2. **粒度控制**
   - Part 2/3的每个小点（如2.1.1.1, 2.1.1.2）都是一个独立要求
   - 是否每个小点都单独存储，还是按主题聚合？

3. **产品组件层次**
   - Section可能包含多个子产品（如MDB, SMDB, FDB, ACB, MCCB）
   - 是否需要建立产品/组件表，关联到不同的要求？

4. **优先级与强制性**
   - "shall"通常表示强制
   - "should"表示推荐
   - 是否需要区分？

5. **版本控制**
   - 如果PDF更新，如何处理历史数据？
   - 是否需要version字段？
