"use client"

import { AuthProvider } from "./auth-provider"
import { QueryProvider } from "./query-provider"
import { LocaleProvider } from "./locale-provider"
import { CurrencyProvider } from "./currency-provider"
import { Toaster } from "@/components/ui/sonner"
import type { ReactNode } from "react"
import type { Locale } from "@/lib/i18n"
import type { Currency } from "@/lib/currency"

interface ProvidersProps {
  children: ReactNode
  initialLocale?: Locale
  initialCurrency?: Currency
}

export function Providers({ children, initialLocale, initialCurrency }: ProvidersProps) {
  return (
    <AuthProvider>
      <QueryProvider>
        <LocaleProvider initialLocale={initialLocale}>
          <CurrencyProvider initialCurrency={initialCurrency}>
            {children}
            <Toaster position="bottom-right" richColors />
          </CurrencyProvider>
        </LocaleProvider>
      </QueryProvider>
    </AuthProvider>
  )
}
