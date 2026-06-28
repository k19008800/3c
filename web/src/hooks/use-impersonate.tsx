import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface ImpersonateState {
  isImpersonating: boolean
  targetEmail: string | null
  targetUserId: number | null
  expiresAt: string | null
}

interface ImpersonateContextType extends ImpersonateState {
  startImpersonate: (token: string, userId: number, email: string, expiresIn: number) => void
  stopImpersonate: () => void
}

const ImpersonateContext = createContext<ImpersonateContextType | undefined>(undefined)

export function ImpersonateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ImpersonateState>({
    isImpersonating: false,
    targetEmail: null,
    targetUserId: null,
    expiresAt: null,
  })

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('isImpersonating')
    if (stored === 'true') {
      const userRaw = localStorage.getItem('impersonatingUser')
      const expiresAt = localStorage.getItem('impersonateExpiresAt')
      const token = localStorage.getItem('impersonateToken')
      if (token && userRaw) {
        try {
          const user = JSON.parse(userRaw)
          setState({
            isImpersonating: true,
            targetEmail: user.email,
            targetUserId: user.userId,
            expiresAt,
          })
        } catch {
          localStorage.removeItem('isImpersonating')
          localStorage.removeItem('impersonateToken')
          localStorage.removeItem('impersonatingUser')
          localStorage.removeItem('impersonateExpiresAt')
        }
      }
    }
  }, [])

  const startImpersonate = useCallback((token: string, userId: number, email: string, expiresIn: number) => {
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    localStorage.setItem('isImpersonating', 'true')
    localStorage.setItem('impersonateToken', token)
    localStorage.setItem('impersonatingUser', JSON.stringify({ userId, email }))
    localStorage.setItem('impersonateExpiresAt', expiresAt)

    setState({ isImpersonating: true, targetEmail: email, targetUserId: userId, expiresAt })
  }, [])

  const stopImpersonate = useCallback(() => {
    localStorage.removeItem('isImpersonating')
    localStorage.removeItem('impersonateToken')
    localStorage.removeItem('impersonatingUser')
    localStorage.removeItem('impersonateExpiresAt')

    setState({ isImpersonating: false, targetEmail: null, targetUserId: null, expiresAt: null })
  }, [])

  return (
    <ImpersonateContext.Provider value={{ ...state, startImpersonate, stopImpersonate }}>
      {children}
    </ImpersonateContext.Provider>
  )
}

export function useImpersonate(): ImpersonateContextType {
  const context = useContext(ImpersonateContext)
  if (!context) {
    throw new Error('useImpersonate must be used within an ImpersonateProvider')
  }
  return context
}
