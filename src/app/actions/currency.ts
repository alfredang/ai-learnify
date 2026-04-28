"use server"

import { cookies } from "next/headers"
import { isSupportedCurrency, type Currency } from "@/lib/currency"
import { CURRENCY_COOKIE } from "@/lib/currency-server"

export async function setCurrencyAction(currency: Currency) {
  if (!isSupportedCurrency(currency)) return
  const cookieStore = await cookies()
  cookieStore.set(CURRENCY_COOKIE, currency, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
}
