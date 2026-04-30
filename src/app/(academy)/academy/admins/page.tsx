import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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

export default async function AcademyAdminsPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) {
    return (
      <div className="container py-12">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No academy membership found.
          </CardContent>
        </Card>
      </div>
    )
  }

  const memberships = await prisma.academyMembership.findMany({
    where: { academyId, role: "ACADEMY_ADMIN" },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          nameToBeCalled: true,
          email: true,
          isActive: true,
          deactivatedAt: true,
          platformRole: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })

  const total = memberships.length
  const activeCount = memberships.filter((m) => m.user.isActive).length
  const deactivatedCount = total - activeCount

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admins</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Users with the Academy Admin role on this tenant. Admins can manage
          courses, programmes, learners, marketers, billing, and credentials.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={total} />
        <Stat label="Active" value={activeCount} />
        <Stat label="Deactivated" value={deactivatedCount} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All admins</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Platform role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Admin since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground py-10"
                  >
                    No admins assigned to this academy yet.
                  </TableCell>
                </TableRow>
              ) : (
                memberships.map((m) => (
                  <TableRow key={m.user.id}>
                    <TableCell className="font-medium">
                      {m.user.nameToBeCalled ?? m.user.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.user.email}
                    </TableCell>
                    <TableCell>
                      {m.user.platformRole === "NONE" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="secondary" className="text-[11px]">
                          {m.user.platformRole.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.user.isActive ? "default" : "outline"}>
                        {m.user.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}
