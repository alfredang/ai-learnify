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
    <section className="border-t py-8 md:py-10">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            {t("home.compliance.title")}
          </h2>
          <p className="text-muted-foreground">{t("home.compliance.subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(({ key, Icon }) => (
            <Card key={key} className="h-full">
              <CardContent className="p-5">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary mb-3">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-1">
                  {t(`home.compliance.cards.${key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(`home.compliance.cards.${key}.desc`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
