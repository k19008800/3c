/**
 * useOnboarding — 新用户引导状态管理 Hook
 *
 * 管理引导进度、跳过状态、步骤完成情况
 * 使用 localStorage 持久化状态
 */

import { useState, useEffect, useCallback } from 'react'

export type OnboardingStep = 'create-key' | 'copy-example' | 'first-call'

export interface OnboardingState {
  /** 当前步骤 */
  currentStep: OnboardingStep
  /** 已完成的步骤 */
  completedSteps: OnboardingStep[]
  /** 是否跳过引导 */
  skipped: boolean
  /** 是否显示引导 */
  visible: boolean
  /** 引导开始时间 */
  startedAt: number | null
  /** 引导完成时间 */
  completedAt: number | null
}

const STORAGE_KEY = 'onboarding_state'

const STEP_ORDER: OnboardingStep[] = ['create-key', 'copy-example', 'first-call']

const DEFAULT_STATE: OnboardingState = {
  currentStep: 'create-key',
  completedSteps: [],
  skipped: false,
  visible: true,
  startedAt: null,
  completedAt: null,
}

/**
 * 获取下一步
 */
function getNextStep(current: OnboardingStep): OnboardingStep | null {
  const idx = STEP_ORDER.indexOf(current)
  return idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : null
}

/**
 * 获取步骤索引
 */
function getStepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step)
}

/**
 * useOnboarding Hook
 */
export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<OnboardingState>
        return { ...DEFAULT_STATE, ...parsed }
      }
    } catch {}
    return DEFAULT_STATE
  })

  // 持久化状态
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }, [state])

  /**
   * 开始引导
   */
  const start = useCallback(() => {
    setState(prev => ({
      ...prev,
      visible: true,
      skipped: false,
      startedAt: prev.startedAt ?? Date.now(),
    }))
  }, [])

  /**
   * 完成当前步骤，进入下一步
   */
  const completeStep = useCallback((step: OnboardingStep) => {
    setState(prev => {
      const newCompleted = prev.completedSteps.includes(step)
        ? prev.completedSteps
        : [...prev.completedSteps, step]

      const nextStep = getNextStep(step)

      // 如果是最后一步完成，标记引导完成
      if (!nextStep) {
        return {
          ...prev,
          completedSteps: newCompleted,
          completedAt: Date.now(),
          visible: false,
        }
      }

      return {
        ...prev,
        completedSteps: newCompleted,
        currentStep: nextStep,
      }
    })
  }, [])

  /**
   * 跳到指定步骤
   */
  const goToStep = useCallback((step: OnboardingStep) => {
    setState(prev => ({
      ...prev,
      currentStep: step,
    }))
  }, [])

  /**
   * 跳过引导
   */
  const skip = useCallback(() => {
    setState(prev => ({
      ...prev,
      skipped: true,
      visible: false,
    }))
  }, [])

  /**
   * 重置引导
   */
  const reset = useCallback(() => {
    setState(DEFAULT_STATE)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }, [])

  /**
   * 隐藏引导
   */
  const hide = useCallback(() => {
    setState(prev => ({
      ...prev,
      visible: false,
    }))
  }, [])

  /**
   * 显示引导
   */
  const show = useCallback(() => {
    setState(prev => ({
      ...prev,
      visible: true,
    }))
  }, [])

  return {
    ...state,
    stepIndex: getStepIndex(state.currentStep),
    totalSteps: STEP_ORDER.length,
    progress: (state.completedSteps.length / STEP_ORDER.length) * 100,
    stepOrder: STEP_ORDER,
    start,
    completeStep,
    goToStep,
    skip,
    reset,
    hide,
    show,
    isStepCompleted: (step: OnboardingStep) => state.completedSteps.includes(step),
    isCurrentStep: (step: OnboardingStep) => state.currentStep === step,
  }
}

export type UseOnboardingReturn = ReturnType<typeof useOnboarding>
