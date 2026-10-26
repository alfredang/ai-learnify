import { Card, CardContent } from "@/components/ui/card"
import { Languages, Type, Coins, Receipt, FileText, ShieldCheck } from "lucide-react"
import { getT } from "@/lib/i18n-server"

const cards = [
  { key: "multilang", Icon: Languages },
  { key: "utf8", Icon: Type },
  { key: "multicurrency", Icon: Coins },
  { key: "tax", Icon: Receipt },
  { key: "invoice", Icon: FileText },
  { key: "gdpr", Icon: ShieldCheck },
] as const

export async function ComplianceStrip() {
  const t = await getT()
  return (
    <section className="border-t py-6 md:py-8">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-5">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            {t("home.compliance.title")}
          </h2>
          <p className="text-muted-foreground">{t("home.compliance.subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map(({ key, Icon }) => (
            <Card key={key} className="h-full gap-0 py-0 shadow-none">
              <CardContent className="flex gap-3 p-4">
                <div className="inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-lg border">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold leading-tight">
                    {t(`home.compliance.cards.${key}.title`)}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`home.compliance.cards.${key}.desc`)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
