import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getFavouritedCourseIds } from "@/lib/favourites"
import { getCartItemCourseIds } from "@/lib/cart"
import { getEnrolledCourseMap } from "@/lib/enrollment"
import { CourseGrid } from "@/components/courses/course-grid"
import { CourseFiltersWrapper } from "@/components/courses/course-filters-wrapper"
import { AdvertisingCarousel } from "@/components/layout/advertising-carousel"
import { EmptyState } from "@/components/shared/empty-state"
import { BookOpen } from "lucide-react"
import { ITEMS_PER_PAGE } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Browse Courses",
  description: "Explore our wide range of courses and start learning today",
}

interface CoursesPageProps {
  searchParams: Promise<{
    category?: string
    sector?: string
    cpd?: string
    partner?: string
    productType?: string
    level?: string
    price?: string
    rating?: string
    sort?: string
    page?: string
    q?: string
  }>
}

async function getCourses(searchParams: CoursesPageProps["searchParams"]) {
  const params = await searchParams
  const page = parseInt(params.page || "1")
  const skip = (page - 1) * ITEMS_PER_PAGE

  const where: Record<string, unknown> = {
    status: "PUBLISHED",
  }

  if (params.category) {
    where.category = { slug: params.category }
  }

  // Phase 2: Sector filter (spec §4.3)
  if (params.sector && params.sector !== "all") {
    where.sector = { slug: params.sector }
  }

  // Phase 2: CPD filter (spec §4.3)
  if (params.cpd && params.cpd !== "all") {
    where.cpdCatalogId = params.cpd
  }

  // Phase 2: Partner filter (spec §4.3)
  if (params.partner && params.partner !== "all") {
    where.partnerName = params.partner
  }

  // Phase 2: Product type — currently Courses are always COURSE.
  // Programme catalogue is served from /programmes (Phase 3). When
  // productType=PROGRAMME is selected we suppress courses entirely so the
  // empty state nudges the learner toward /programmes.
  if (params.productType && params.productType !== "all" && params.productType !== "COURSE") {
    where.id = "__never_match__"
  }

  if (params.level && params.level !== "all") {
    where.level = params.level
  }

  // Spec §4.3 — Price filter (Free / Paid)
  if (params.price === "free") {
    where.isFree = true
  } else if (params.price === "paid") {
    where.isFree = false
  }

  if (params.rating && params.rating !== "all") {
    where.averageRating = { gte: parseFloat(params.rating) }
  }

  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: "insensitive" } },
      { subtitle: { contains: params.q, mode: "insensitive" } },
      { description: { contains: params.q, mode: "insensitive" } },
      { partnerName: { contains: params.q, mode: "insensitive" } },
    ]
  }

  let orderBy: Record<string, unknown> | Record<string, unknown>[] = { totalStudents: "desc" }

  switch (params.sort) {
    case "rating":
      orderBy = { averageRating: "desc" }
      break
    case "newest":
      orderBy = { publishedAt: "desc" }
      break
    case "alphabetical":
      orderBy = { title: "asc" }
      break
    case "partner":
      orderBy = [{ partnerName: "asc" }, { title: "asc" }]
      break
    case "cpd":
      orderBy = [{ cpdCatalog: { points: "desc" } }, { title: "asc" }]
      break
    case "price-low":
      orderBy = { price: "asc" }
      break
    case "price-high":
      orderBy = { price: "desc" }
      break
  }

  const [coursesRaw, total] = await Promise.all([
    prisma.course.findMany({
      where,
      include: {
        instructor: {
          select: { id: true, name: true, image: true, headline: true },
        },
        category: true,
        sector: { select: { id: true, name: true, slug: true } },
        cpdCatalog: { select: { id: true, name: true, points: true, badgeUrl: true } },
      },
      orderBy,
      skip,
      take: ITEMS_PER_PAGE,
    }),
    prisma.course.count({ where }),
  ])

  const courses = JSON.parse(JSON.stringify(coursesRaw))

  return {
    courses,
    total,
    totalPages: Math.ceil(total / ITEMS_PER_PAGE),
    currentPage: page,
  }
}

async function getFilterData() {
  const [categories, sectors, cpdEntries, partners] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.sector.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.cpdCatalog.findMany({
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED", partnerName: { not: null } },
      select: { partnerName: true },
      distinct: ["partnerName"],
      orderBy: { partnerName: "asc" },
    }),
  ])

  return {
    categories: JSON.parse(JSON.stringify(categories)),
    sectors: JSON.parse(JSON.stringify(sectors)),
    cpdEntries: cpdEntries.map((c) => ({ id: c.id, name: c.name, slug: c.id })),
    partners: partners
      .map((p) => p.partnerName)
      .filter((p): p is string => Boolean(p)),
  }
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const [{ courses, total, totalPages, currentPage }, filterData, session, academy] =
    await Promise.all([
      getCourses(searchParams),
      getFilterData(),
      auth(),
      prisma.academy.findFirst({
        where: { isActive: true },
        select: { coursesIntroHtml: true },
      }),
    ])
  const [favouritedCourseIds, cartCourseIds, enrolledCourseMap] = await Promise.all([
    getFavouritedCourseIds(session?.user?.id),
    getCartItemCourseIds(session?.user?.id),
    getEnrolledCourseMap(session?.user?.id),
  ])

  const params = await searchParams

  return (
    <div className="container py-8">
      {/* Phase 2: catalogue carousel (spec §4.1) */}
      <div className="mb-6">
        <AdvertisingCarousel />
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">All Courses</h1>
        <p className="text-muted-foreground">{total} courses available</p>
        {academy?.coursesIntroHtml && (
          <div
            className="prose prose-sm prose-slate max-w-3xl mt-3 prose-p:text-muted-foreground prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: academy.coursesIntroHtml }}
          />
        )}
      </div>

      <div className="mb-8">
        <CourseFiltersWrapper
          categories={filterData.categories}
          sectors={filterData.sectors}
          cpdEntries={filterData.cpdEntries}
          partners={filterData.partners}
        />
      </div>

      {courses.length > 0 ? (
        <>
          <CourseGrid
            courses={courses}
            favouritedCourseIds={favouritedCourseIds}
            cartCourseIds={cartCourseIds}
            enrolledCourseMap={enrolledCourseMap}
          />

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {currentPage > 1 && (
                <Button variant="outline" asChild>
                  <Link
                    href={{
                      pathname: "/courses",
                      query: { ...params, page: currentPage - 1 },
                    }}
                  >
                    Previous
                  </Link>
                </Button>
              )}
              <div className="flex items-center px-4">
                Page {currentPage} of {totalPages}
              </div>
              {currentPage < totalPages && (
                <Button variant="outline" asChild>
                  <Link
                    href={{
                      pathname: "/courses",
                      query: { ...params, page: currentPage + 1 },
                    }}
                  >
                    Next
                  </Link>
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No courses found"
          description="Try adjusting your filters or search query"
          actionLabel="Clear filters"
          actionHref="/courses"
        />
      )}
    </div>
  )
}
