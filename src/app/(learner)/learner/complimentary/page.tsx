import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Gift } from "lucide-react"

export default async function ComplimentaryProgrammePage() {
  const session = await auth()
  if (!session?.user) return null

  const grant = await prisma.accessGrant.findFirst({
    where: {
      userId: session.user.id,
      productType: "COMPLIMENTARY",
      isActive: true,
    },
    include: {
      programme: {
        include: {
          courses: {
            orderBy: { position: "asc" },
            include: { course: { select: { id: true, title: true, slug: true, thumbnail: true } } },
          },
        },
      },
    },
  })

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <Gift className="h-10 w-10 text-amber-500 mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Complimentary Programme</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Free for every registered learner. No expiry. No certificate.
          </p>
        </div>
      </div>

      {!grant?.programme ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No complimentary programme has been set up for your academy yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{grant.programme.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {grant.programme.description && (
                <p className="text-sm text-muted-foreground mb-4">
                  {grant.programme.description}
                </p>
              )}
              {grant.programme.courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Courses will appear here as the academy publishes them.
                </p>
              ) : (
                <ul className="space-y-2">
                  {grant.programme.courses.map((pc) => (
                    <li
                      key={pc.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{pc.course.title}</div>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/courses/${pc.course.slug}`}>Open</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
