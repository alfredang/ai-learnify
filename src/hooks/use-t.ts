"use client"

import { t } from "@/lib/i18n"
import { useLocale } from "@/providers/locale-provider"

export function useT() {
  const { locale } = useLocale()
  return (key: string, vars?: Record<string, string | number>) =>
    t(key, { locale, vars })
}
