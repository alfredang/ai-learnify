import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Layers } from "lucide-react"

export default async function LearnerProgrammesPage() {
  const session = await auth()
  if (!session?.user) return null

  const grants = await prisma.accessGrant.findMany({
    where: {
      userId: session.user.id,
      productType: "PROGRAMME",
      isActive: true,
    },
    orderBy: { expiresAt: "asc" },
    include: {
      programme: {
        include: {
          courses: { include: { course: { select: { id: true, title: true, slug: true } } } },
        },
      },
    },
  })

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Programmes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §6.3. Each programme uses one shared 90-day access window.
        </p>
      </div>

      {grants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Layers className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              No programmes yet.{" "}
              <Link href="/courses" className="underline">Browse the catalogue</Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grants.map((g) => {
            if (!g.programme) return null
            const days = Math.round((g.expiresAt.getTime() - Date.now()) / 86_400_000)
            return (
              <Card key={g.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">{g.programme.title}</CardTitle>
                  <Badge variant={days <= 14 ? "destructive" : "outline"}>
                    {days}d left
                  </Badge>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {g.programme.courses.map((pc) => (
                      <li key={pc.id} className="flex items-center justify-between text-sm">
                        <Link href={`/courses/${pc.course.slug}`} className="hover:underline truncate">
                          {pc.course.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
