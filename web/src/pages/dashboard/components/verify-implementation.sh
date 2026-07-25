#!/bin/bash
# 新用户引导功能验证脚本

echo "========================================="
echo "新用户空状态引导功能 - 实现验证"
echo "========================================="
echo ""

# 检查文件是否存在
echo "1. 检查文件完整性..."
files=(
  "src/hooks/useOnboarding.ts"
  "src/pages/dashboard/components/OnboardingGuide.tsx"
  "src/pages/dashboard/components/OnboardingDemo.tsx"
  "src/pages/dashboard/components/ONBOARDING_README.md"
  "src/pages/dashboard/components/IMPLEMENTATION_SUMMARY.md"
)

all_exist=true
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    size=$(wc -c < "$file")
    echo "  ✅ $file ($size bytes)"
  else
    echo "  ❌ $file (NOT FOUND)"
    all_exist=false
  fi
done

if [ "$all_exist" = true ]; then
  echo ""
  echo "  ✅ 所有文件已创建"
else
  echo ""
  echo "  ❌ 部分文件缺失"
  exit 1
fi

echo ""
echo "2. 检查 Dashboard 集成..."

# 检查 Dashboard.tsx 是否导入 OnboardingGuide
if grep -q "import OnboardingGuide" src/pages/Dashboard.tsx; then
  echo "  ✅ OnboardingGuide 已导入到 Dashboard"
else
  echo "  ❌ OnboardingGuide 未导入到 Dashboard"
  exit 1
fi

# 检查是否使用组件
if grep -q "<OnboardingGuide" src/pages/Dashboard.tsx; then
  echo "  ✅ OnboardingGuide 已在 Dashboard 中使用"
else
  echo "  ❌ OnboardingGuide 未在 Dashboard 中使用"
  exit 1
fi

echo ""
echo "3. 检查核心功能..."

# 检查三步引导
if grep -q "create-key" src/hooks/useOnboarding.ts && \
   grep -q "copy-example" src/hooks/useOnboarding.ts && \
   grep -q "first-call" src/hooks/useOnboarding.ts; then
  echo "  ✅ 三步引导流程已定义"
else
  echo "  ❌ 三步引导流程不完整"
  exit 1
fi

# 检查 localStorage 持久化
if grep -q "localStorage" src/hooks/useOnboarding.ts; then
  echo "  ✅ localStorage 持久化已实现"
else
  echo "  ❌ localStorage 持久化未实现"
  exit 1
fi

# 检查动画
if grep -q "animate-fade-in" src/pages/dashboard/components/OnboardingGuide.tsx && \
   grep -q "animate-scale-in" src/pages/dashboard/components/OnboardingGuide.tsx; then
  echo "  ✅ 动画效果已实现"
else
  echo "  ❌ 动画效果未实现"
  exit 1
fi

# 检查多语言支持
if grep -q "curl" src/pages/dashboard/components/OnboardingGuide.tsx && \
   grep -q "python" src/pages/dashboard/components/OnboardingGuide.tsx && \
   grep -q "javascript" src/pages/dashboard/components/OnboardingGuide.tsx && \
   grep -q "go" src/pages/dashboard/components/OnboardingGuide.tsx; then
  echo "  ✅ 多语言示例代码已支持"
else
  echo "  ❌ 多语言示例代码不完整"
  exit 1
fi

echo ""
echo "========================================="
echo "✅ 所有检查通过！"
echo "========================================="
echo ""
echo "实现摘要："
echo "  - 状态管理 Hook: useOnboarding.ts"
echo "  - 引导组件: OnboardingGuide.tsx"
echo "  - 演示页面: OnboardingDemo.tsx"
echo "  - 使用文档: ONBOARDING_README.md"
echo "  - 实现总结: IMPLEMENTATION_SUMMARY.md"
echo ""
echo "已集成到 Dashboard.tsx"
echo ""
echo "测试方法："
echo "  1. 清除 localStorage: localStorage.removeItem('onboarding_state')"
echo "  2. 刷新页面"
echo "  3. 引导组件将自动显示"
echo ""
