#!/bin/bash
# Vercel AI SDK 集成验证脚本

echo "🔍 验证 Vercel AI SDK 集成..."
echo ""

# 检查依赖
echo "1️⃣ 检查 npm 包..."
if grep -q '"ai":' package.json && grep -q '"@ai-sdk/openai":' package.json; then
  echo "   ✅ Vercel AI SDK 依赖已安装"
else
  echo "   ❌ 缺少 Vercel AI SDK 依赖"
  exit 1
fi

# 检查环境变量模板
echo ""
echo "2️⃣ 检查环境配置..."
if [ -f ".env.example" ]; then
  echo "   ✅ .env.example 存在"
else
  echo "   ❌ 缺少 .env.example"
  exit 1
fi

# 检查核心文件
echo ""
echo "3️⃣ 检查核心文件..."
files=(
  "src/ai/client.js"
  "src/ai/parser.js"
  "src/cli/parse.js"
)
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✅ $file"
  else
    echo "   ❌ $file 缺失"
    exit 1
  fi
done

# 检查文档
echo ""
echo "4️⃣ 检查文档..."
docs=(
  "QUICKSTART-AI.md"
  "docs/ai-sdk-guide.md"
  "docs/usage.md"
  "README.md"
)
for doc in "${docs[@]}"; do
  if [ -f "$doc" ]; then
    echo "   ✅ $doc"
  else
    echo "   ❌ $doc 缺失"
    exit 1
  fi
done

# 运行测试
echo ""
echo "5️⃣ 运行测试..."
if npm test > /dev/null 2>&1; then
  echo "   ✅ 所有测试通过"
else
  echo "   ❌ 测试失败"
  exit 1
fi

# 检查 VercelAIClient
echo ""
echo "6️⃣ 检查 VercelAIClient 实现..."
if grep -q "class VercelAIClient" src/ai/client.js; then
  echo "   ✅ VercelAIClient 已实现"
else
  echo "   ❌ VercelAIClient 缺失"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 验证完成！Vercel AI SDK 集成成功！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📖 下一步："
echo "   1. 复制 .env.example 为 .env"
echo "   2. 配置 AI_PROVIDER 和 API_KEY"
echo "   3. 运行: ./src/cli/parse.js parse --section-id '26 24 13' --limit 1"
echo ""
echo "📚 完整文档: QUICKSTART-AI.md"
