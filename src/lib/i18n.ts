import en from "@/i18n/messages/en.json"
import zh from "@/i18n/messages/zh.json"
import ms from "@/i18n/messages/ms.json"
import th from "@/i18n/messages/th.json"
import vi from "@/i18n/messages/vi.json"

/**
 * Phase 9 — Spec §18 internationalisation **scaffold**.
 *
 * SCOPE NOTE: This is intentionally minimal. A full locale-routed
 * deployment via `next-intl` + middleware rewrite is deferred to Phase 9b
 * because it touches every page. This helper exists so new code can start
 * reading strings from the JSON bundles today, and so we have concrete
 * ZH / MS translations on hand when we wire the full flow.
 *
 * UTF-8 is already supported end-to-end (Postgres, JSON API, Prisma).
 * CJK-safe PDF rendering for certificates / invoices remains a Phase 9b
 * task — it needs Noto Sans CJK embedded in the HTML-to-PDF pipeline.
 */

export type Locale = "en" | "zh" | "ms" | "th" | "vi"

const BUNDLES: Record<Locale, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  zh: zh as Record<string, unknown>,
  ms: ms as Record<string, unknown>,
  th: th as Record<string, unknown>,
  vi: vi as Record<string, unknown>,
}

export const SUPPORTED_LOCALES: Locale[] = ["en", "zh", "ms", "th", "vi"]
export const DEFAULT_LOCALE: Locale = "en"

export function isSupportedLocale(l: string): l is Locale {
  return SUPPORTED_LOCALES.includes(l as Locale)
}

/**
 * Lookup a dotted key like `"auth.login"` in the bundle for the given
 * locale. Falls back to English if the key is missing — never throws,
 * never returns undefined. Returns the key itself when both locales miss
 * (makes missing strings visible in the UI).
 */
function lookup(bundle: Record<string, unknown>, key: string): string | null {
  const parts = key.split(".")
  let node: unknown = bundle
  for (const p of parts) {
    if (typeof node !== "object" || node === null) return null
    node = (node as Record<string, unknown>)[p]
  }
  return typeof node === "string" ? node : null
}

/**
 * ICU-lite interpolation — replaces `{name}` with `vars.name`. No plurals
 * or number/date formatting (yet). Keep messages simple for now.
 */
function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_m, k) => {
    const v = vars[k]
    return v === undefined ? `{${k}}` : String(v)
  })
}

export function t(
  key: string,
  opts?: { locale?: Locale; vars?: Record<string, string | number> }
): string {
  const locale = opts?.locale ?? DEFAULT_LOCALE
  const bundle = BUNDLES[locale] ?? BUNDLES[DEFAULT_LOCALE]
  const str =
    lookup(bundle, key) ?? lookup(BUNDLES[DEFAULT_LOCALE], key) ?? key
  return interpolate(str, opts?.vars)
}

export function localeDisplayName(locale: Locale): string {
  const meta = (BUNDLES[locale] as { $meta?: { displayName?: string } }).$meta
  return meta?.displayName ?? locale
}
