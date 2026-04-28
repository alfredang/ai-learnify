import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CAPABILITY_LABELS } from "@/lib/ai/prompts"
import type { AiCapability } from "@prisma/client"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

export default async function AcademyAiAuditPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return null

  const rows = await prisma.aiInteraction.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  const totalTokens = rows.reduce(
    (a, r) => a + r.inputTokens + r.outputTokens,
    0
  )
  const cachedTokens = rows.reduce((a, r) => a + r.cachedTokens, 0)
  const approvedCount = rows.filter((r) => r.approved).length

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI usage audit</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §8.3 governance. Last 200 AI authoring interactions for this
          academy. Append-only. Drafts are never auto-published — author
          approval is recorded here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Interactions</p>
            <p className="text-2xl font-bold">{rows.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {approvedCount} approved
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Total tokens</p>
            <p className="text-2xl font-bold tabular-nums">
              {totalTokens.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {cachedTokens.toLocaleString()} cached
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground">Approval rate</p>
            <p className="text-2xl font-bold tabular-nums">
              {rows.length > 0
                ? Math.round((approvedCount / rows.length) * 100)
                : 0}
              %
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              of drafts marked &ldquo;use this&rdquo;
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-medium px-4 py-3">When</th>
                  <th className="text-left font-medium px-4 py-3">Author</th>
                  <th className="text-left font-medium px-4 py-3">
                    Capability
                  </th>
                  <th className="text-right font-medium px-4 py-3">
                    Tokens (in / out / cached)
                  </th>
                  <th className="text-left font-medium px-4 py-3">Model</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No AI interactions yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium">
                          {r.user?.name ?? r.user?.email ?? r.userId}
                        </div>
                        {r.user?.name && r.user.email && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {r.user.email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {CAPABILITY_LABELS[r.capability as AiCapability] ??
                          r.capability}
                      </td>
                      <td className="px-4 py-3 text-xs text-right tabular-nums">
                        {r.inputTokens} / {r.outputTokens}
                        {r.cachedTokens > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {r.cachedTokens} cached
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {r.model}
                      </td>
                      <td className="px-4 py-3">
                        {r.approved ? (
                          <Badge variant="default" className="text-[10px]">
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Draft
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
