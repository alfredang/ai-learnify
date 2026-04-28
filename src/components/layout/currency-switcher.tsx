"use client"

import { Coins, Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  CURRENCY_META,
  SUPPORTED_CURRENCIES,
  type Currency,
} from "@/lib/currency"
import { useCurrency } from "@/providers/currency-provider"
import { useT } from "@/hooks/use-t"

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency()
  const t = useT()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2">
          <Coins className="h-4 w-4" />
          <span className="text-xs font-medium">{currency}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel>{t("nav.currency")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_CURRENCIES.map((c: Currency) => (
          <DropdownMenuItem
            key={c}
            onSelect={() => {
              void setCurrency(c)
            }}
            className="flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">{c}</span>
              <span className="text-xs text-muted-foreground">
                {CURRENCY_META[c].name}
              </span>
            </span>
            {c === currency ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {t("nav.currencyDisclaimer")}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
