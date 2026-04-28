import { cookies, headers } from "next/headers"
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, t, type Locale } from "@/lib/i18n"

export const LOCALE_COOKIE = "locale"

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  if (cookieLocale && isSupportedLocale(cookieLocale)) return cookieLocale

  const headerStore = await headers()
  const accept = headerStore.get("accept-language")
  if (accept) {
    const tags = accept
      .split(",")
      .map((part) => part.split(";")[0].trim().toLowerCase())
    for (const tag of tags) {
      const base = tag.split("-")[0]
      const candidate = SUPPORTED_LOCALES.find((l) => l === base)
      if (candidate) return candidate
    }
  }
  return DEFAULT_LOCALE
}

export async function getT() {
  const locale = await getLocale()
  return (key: string, vars?: Record<string, string | number>) =>
    t(key, { locale, vars })
}
