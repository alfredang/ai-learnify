"use server"

import { cookies } from "next/headers"
import { isSupportedLocale, type Locale } from "@/lib/i18n"
import { LOCALE_COOKIE } from "@/lib/i18n-server"

export async function setLocaleAction(locale: Locale) {
  if (!isSupportedLocale(locale)) return
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
}
