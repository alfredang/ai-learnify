"use client"

import { Globe, Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { SUPPORTED_LOCALES, localeDisplayName, type Locale } from "@/lib/i18n"
import { useLocale } from "@/providers/locale-provider"
import { useT } from "@/hooks/use-t"

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale()
  const t = useT()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2">
          <Globe className="h-4 w-4" />
          <span className="hidden lg:inline text-xs font-medium">
            {localeDisplayName(locale)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuLabel>{t("nav.language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LOCALES.map((l: Locale) => (
          <DropdownMenuItem
            key={l}
            onSelect={() => {
              void setLocale(l)
            }}
            className="flex items-center justify-between gap-3"
          >
            <span>{localeDisplayName(l)}</span>
            {l === locale ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
