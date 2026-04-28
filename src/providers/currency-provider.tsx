"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { DEFAULT_CURRENCY, type Currency } from "@/lib/currency"
import { setCurrencyAction } from "@/app/actions/currency"

interface CurrencyContextValue {
  currency: Currency
  setCurrency: (currency: Currency) => Promise<void>
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  setCurrency: async () => {},
})

interface CurrencyProviderProps {
  initialCurrency?: Currency
  children: ReactNode
}

export function CurrencyProvider({ initialCurrency = DEFAULT_CURRENCY, children }: CurrencyProviderProps) {
  const [currency, setCurrencyState] = useState<Currency>(initialCurrency)
  const router = useRouter()

  const setCurrency = useCallback(
    async (next: Currency) => {
      setCurrencyState(next)
      await setCurrencyAction(next)
      router.refresh()
    },
    [router]
  )

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>{children}</CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
