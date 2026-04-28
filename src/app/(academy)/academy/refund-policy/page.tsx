import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { RefundPolicyEditor } from "./refund-policy-editor"

async function getAcademyPolicy(userId: string) {
  // Find the academy the admin belongs to
  const membership = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })

  if (!membership) {
    // Platform owner fallback
    const academy = await prisma.academy.findFirst({
      where: { isActive: true },
      select: { id: true, refundPolicyHtml: true },
    })
    return academy
  }

  return prisma.academy.findUnique({
    where: { id: membership.academyId },
    select: { id: true, refundPolicyHtml: true },
  })
}

export default async function AcademyRefundPolicyPage() {
  const session = await auth()
  if (!session?.user) return null

  const academy = await getAcademyPolicy(session.user.id)

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Refund Policy</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Edit the refund policy displayed to learners. Changes are published immediately.
        </p>
      </div>

      <RefundPolicyEditor initialHtml={academy?.refundPolicyHtml ?? ""} />
    </div>
  )
}
