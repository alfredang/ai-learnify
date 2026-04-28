import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TemplatesEditor } from "./templates-editor"

async function getAcademyTemplates(userId: string) {
  const membership = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })

  const academyId = membership?.academyId ??
    (await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } }))?.id

  if (!academyId) return null

  return prisma.academy.findUnique({
    where: { id: academyId },
    select: {
      refundPolicyHtml: true,
      privacyPolicyHtml: true,
      termsHtml: true,
      emailWelcomeHtml: true,
      emailInvoiceHtml: true,
      emailCertificateHtml: true,
      emailExpiryReminderHtml: true,
    },
  })
}

export default async function AcademyTemplatesPage() {
  const session = await auth()
  if (!session?.user) return null

  const templates = await getAcademyTemplates(session.user.id)

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Edit public pages and email templates. Changes publish immediately.
        </p>
      </div>

      <TemplatesEditor
        initial={{
          refundPolicyHtml: templates?.refundPolicyHtml ?? "",
          privacyPolicyHtml: templates?.privacyPolicyHtml ?? "",
          termsHtml: templates?.termsHtml ?? "",
          emailWelcomeHtml: templates?.emailWelcomeHtml ?? "",
          emailInvoiceHtml: templates?.emailInvoiceHtml ?? "",
          emailCertificateHtml: templates?.emailCertificateHtml ?? "",
          emailExpiryReminderHtml: templates?.emailExpiryReminderHtml ?? "",
        }}
      />
    </div>
  )
}
