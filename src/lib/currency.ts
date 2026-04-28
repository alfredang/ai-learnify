export const SUPPORTED_CURRENCIES = ["SGD", "MYR", "USD", "THB", "VND"] as const

export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

export const DEFAULT_CURRENCY: Currency = "SGD"

export const CURRENCY_META: Record<
  Currency,
  { symbol: string; name: string; decimals: number; locale: string }
> = {
  SGD: { symbol: "S$", name: "Singapore Dollar", decimals: 2, locale: "en-SG" },
  MYR: { symbol: "RM", name: "Malaysian Ringgit", decimals: 2, locale: "ms-MY" },
  USD: { symbol: "US$", name: "US Dollar", decimals: 2, locale: "en-US" },
  THB: { symbol: "฿", name: "Thai Baht", decimals: 2, locale: "th-TH" },
  VND: { symbol: "₫", name: "Vietnamese Dong", decimals: 0, locale: "vi-VN" },
}

// Display only — illustrative FX rates relative to USD = 1.
// Not used for charging. Stripe still settles in the course's stored currency.
export const FX_USD: Record<Currency, number> = {
  USD: 1,
  SGD: 1.35,
  MYR: 4.7,
  THB: 36,
  VND: 25_400,
}

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
}

export function convertFromUsd(amountUsd: number, currency: Currency): number {
  return amountUsd * FX_USD[currency]
}

export function formatCurrency(amountUsd: number, currency: Currency): string {
  const meta = CURRENCY_META[currency]
  const converted = convertFromUsd(amountUsd, currency)
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(converted)
}
