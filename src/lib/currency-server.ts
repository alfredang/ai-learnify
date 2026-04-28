import { cookies } from "next/headers"
import { DEFAULT_CURRENCY, isSupportedCurrency, type Currency } from "@/lib/currency"

export const CURRENCY_COOKIE = "currency"

export async function getCurrency(): Promise<Currency> {
  const cookieStore = await cookies()
  const value = cookieStore.get(CURRENCY_COOKIE)?.value
  if (value && isSupportedCurrency(value)) return value
  return DEFAULT_CURRENCY
}
