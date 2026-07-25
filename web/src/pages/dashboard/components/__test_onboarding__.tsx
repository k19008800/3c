// 测试导入是否正常
import { useOnboarding } from '@/hooks/useOnboarding'
import OnboardingGuide from './OnboardingGuide'

// 类型检查
type Step = 'create-key' | 'copy-example' | 'first-call'

// 简单验证
console.log('Onboarding imports OK')
