'use client'

import * as React from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'

type ProvidersProps = {
  children: React.ReactNode
}

export function AppProviders({ children }: ProvidersProps) {
  const [isTouch, setIsTouch] = React.useState(false)

  React.useEffect(() => {
    const hasTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        (navigator as any).maxTouchPoints > 0 ||
        (navigator as any).msMaxTouchPoints > 0)
    setIsTouch(Boolean(hasTouch))
  }, [])

  return (
    <TooltipProvider delayDuration={isTouch ? 150 : 0} disableHoverableContent={isTouch}>
      {children}
    </TooltipProvider>
  )
}


