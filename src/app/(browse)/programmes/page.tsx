import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { Layers } from "lucide-react"
import { formatPrice } from "@/lib/stripe"

export const metadata: Metadata = {
  title: "Browse Programmes",
  description: "Explore bundled course programmes",
}

async function getPublishedProgrammes() {
  const programmes = await prisma.programme.findMany({
    where: { status: "PUBLISHED" },
    include: {
      courses: {
        orderBy: { position: "asc" },
        include: {
          course: {
            select: { id: true, title: true, thumbnail: true },
          },
        },
      },
    },
    orderBy: { publishedAt: "desc" },
  })
  return JSON.parse(JSON.stringify(programmes))
}

export default async function ProgrammesPage() {
  const programmes = await getPublishedProgrammes()

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">All Programmes</h1>
        <p className="text-muted-foreground">
          {programmes.length} programme{programmes.length !== 1 ? "s" : ""} available.
          Each programme bundles multiple courses with a single payment and shared access window.
        </p>
      </div>

      {programmes.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {programmes.map((programme: {
            id: string
            slug: string
            title: string
            subtitle: string | null
            thumbnail: string | null
            price: string | number
            isFree: boolean
            accessDurationDays: number
            courses: { id: string; course: { id: string; title: string; thumbnail: string | null } }[]
          }) => (
            <Link key={programme.id} href={`/programmes/${programme.slug}`}>
              <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow">
                <div className="relative aspect-video bg-muted">
                  {programme.thumbnail ? (
                    <Image
                      src={programme.thumbnail}
                      alt={programme.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Layers className="h-12 w-12 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold line-clamp-2">{programme.title}</h3>
                  {programme.subtitle && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {programme.subtitle}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">
                      {programme.courses.length} course{programme.courses.length !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="outline">
                      {programme.accessDurationDays}-day access
                    </Badge>
                  </div>
                  <div className="pt-1">
                    {programme.isFree ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
                        Complimentary
                      </Badge>
                    ) : (
                      <span className="text-lg font-bold">
                        {formatPrice(Number(programme.price))}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Layers}
          title="No programmes available yet"
          description="Check back soon for bundled course programmes"
        />
      )}
    </div>
  )
}
