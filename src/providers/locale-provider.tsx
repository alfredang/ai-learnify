"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n"
import { setLocaleAction } from "@/app/actions/locale"

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => Promise<void>
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: async () => {},
})

interface LocaleProviderProps {
  initialLocale?: Locale
  children: ReactNode
}

export function LocaleProvider({ initialLocale = DEFAULT_LOCALE, children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const router = useRouter()

  const setLocale = useCallback(
    async (next: Locale) => {
      setLocaleState(next)
      await setLocaleAction(next)
      router.refresh()
    },
    [router]
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}
