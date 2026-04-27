import Link from "next/link"
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
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

export default async function AcademyCoursesPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return null

  const [pending, published] = await Promise.all([
    prisma.course.findMany({
      where: { academyId, status: "PENDING_REVIEW" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        title: true,
        slug: true,
        createdAt: true,
        instructor: { select: { name: true, email: true } },
      },
    }),
    prisma.course.findMany({
      where: { academyId, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        totalStudents: true,
        averageRating: true,
        instructor: { select: { name: true } },
      },
    }),
  ])

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Catalogue governance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review submissions (spec §4 step 3). Approve to publish, reject with
          feedback.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Awaiting review{" "}
            <Badge variant={pending.length > 0 ? "destructive" : "outline"}>
              {pending.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nothing awaiting review.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/courses/${c.slug}`} className="hover:underline">
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.instructor.name ?? c.instructor.email}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      Review UI ships Phase 8c
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Published <Badge variant="outline">{published.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead>Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {published.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/courses/${c.slug}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{c.instructor.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{c.totalStudents}</TableCell>
                  <TableCell className="text-right">
                    {Number(c.averageRating).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.publishedAt
                      ? new Date(c.publishedAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
