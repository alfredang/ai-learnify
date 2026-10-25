import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Code,
  Briefcase,
  Palette,
  Megaphone,
  Server,
  User,
  ArrowRight,
  CheckCircle,
  Award,
  Search,
  PlayCircle,
  Clock,
  Smartphone,
  BadgeCheck,
} from "lucide-react"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getFavouritedCourseIds } from "@/lib/favourites"
import { getCartItemCourseIds } from "@/lib/cart"
import { getEnrolledCourseMap } from "@/lib/enrollment"
import { CourseGrid } from "@/components/courses/course-grid"
import { AdvertisingCarousel } from "@/components/layout/advertising-carousel"
import { ComplianceStrip } from "@/components/home/compliance-strip"
import { getT } from "@/lib/i18n-server"

const iconMap: Record<string, React.ElementType> = {
  Code,
  Briefcase,
  Palette,
  Megaphone,
  Server,
  User,
}

async function getFeaturedCourses() {
  try {
    // Featured courses first; when none are flagged, fall back to the most
    // enrolled and newest published courses so the home page always
    // showcases real content.
    const courses = await prisma.course.findMany({
      where: {
        status: "PUBLISHED",
      },
      include: {
        instructor: {
          select: {
            id: true,
            name: true,
            image: true,
            headline: true,
          },
        },
        category: true,
      },
      orderBy: [
        { isFeatured: "desc" },
        { featuredOrder: "asc" },
        { totalStudents: "desc" },
        { createdAt: "desc" },
      ],
      take: 8,
    })
    // Serialize to convert Prisma Decimal/Date to plain JSON types
    return JSON.parse(JSON.stringify(courses))
  } catch {
    return []
  }
}

async function getCategories() {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { courses: true },
        },
      },
      orderBy: {
        courses: {
          _count: "desc",
        },
      },
      take: 6,
    })
    return categories
  } catch {
    return []
  }
}

const valueProps = [
  { icon: Clock, title: "Learn at your own pace", body: "Self-paced lessons you can start, pause and resume on your schedule." },
  { icon: BadgeCheck, title: "CPD-accredited", body: "Earn CPD points that count towards your professional development." },
  { icon: Award, title: "Verifiable certificates", body: "Every certificate carries a QR code employers can verify online." },
  { icon: Smartphone, title: "Any device", body: "Pick up where you left off on your phone, tablet or laptop." },
]

const steps = [
  { icon: Search, title: "Choose a course", body: "Browse by category or search for the skill you need." },
  { icon: PlayCircle, title: "Learn by watching and doing", body: "Short video lectures with quizzes to check your understanding." },
  { icon: Award, title: "Earn your certificate", body: "Complete the course and assessment to receive your certificate." },
]

export default async function HomePage() {
  const [featuredCourses, categories, session, t] = await Promise.all([
    getFeaturedCourses(),
    getCategories(),
    auth(),
    getT(),
  ])
  const isCourseDeveloper = session?.user?.role === "INSTRUCTOR" || session?.user?.role === "ADMIN"
  let favouritedCourseIds = new Set<string>()
  let cartCourseIds = new Set<string>()
  let enrolledCourseMap = new Map<string, number>()
  try {
    ;[favouritedCourseIds, cartCourseIds, enrolledCourseMap] = await Promise.all([
      getFavouritedCourseIds(session?.user?.id),
      getCartItemCourseIds(session?.user?.id),
      getEnrolledCourseMap(session?.user?.id),
    ])
  } catch {
    // Gracefully handle database errors (e.g., database restart)
  }

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative py-6 md:py-8 bg-white overflow-hidden">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="space-y-6 md:space-y-8 text-center lg:text-left">
              <Badge variant="secondary" className="px-4 py-1">
                {t("home.hero.badge")}
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
                {t("home.hero.title")}{" "}
                <span className="text-primary">{t("home.hero.titleAccent")}</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto lg:mx-0">
                {t("home.hero.subtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="lg" asChild>
                  <Link href="/courses">
                    {t("home.hero.exploreCta")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-primary text-primary font-semibold hover:bg-primary hover:text-primary-foreground" asChild>
                  <Link href={isCourseDeveloper ? "/instructor" : "/become-instructor"}>
                    {isCourseDeveloper ? t("home.hero.developerCtaActive") : t("home.hero.developerCta")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4 md:gap-6 pt-4 justify-center lg:justify-start">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm">{t("home.hero.feature1")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm">{t("home.hero.feature2")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm">{t("home.hero.feature3")}</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-[460px]">
                <Image
                  src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&q=80"
                  alt="Professionals learning together on laptops"
                  fill
                  className="object-cover rounded-2xl shadow-xl"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value propositions */}
      <section className="border-y">
        <div className="container py-6 md:py-8">
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {valueProps.map((v) => (
              <li key={v.title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border">
                  <v.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold leading-tight">{v.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{v.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Popular courses */}
      {featuredCourses.length > 0 && (
        <section className="py-8 md:py-10">
          <div className="container">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold">Popular courses</h2>
                <p className="mt-1 text-muted-foreground">Start learning today — enrol and press play.</p>
              </div>
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href="/courses">
                  View all courses <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CourseGrid courses={featuredCourses} favouritedCourseIds={favouritedCourseIds} cartCourseIds={cartCourseIds} enrolledCourseMap={enrolledCourseMap} />
            <Button variant="outline" asChild className="mt-6 w-full sm:hidden">
              <Link href="/courses">
                View all courses <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t py-8 md:py-10">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold mb-6">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-lg border p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <step.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="mt-4 font-semibold">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Phase 2: Advertising Banner Carousel (spec §4.1) */}
      <section className="container py-4">
        <AdvertisingCarousel />
      </section>

      {/* Compliance & Localization Strip */}
      <ComplianceStrip />

      {/* Categories Section */}
      {categories.length > 0 && (
        <section className="pt-8 md:pt-10 pb-4 md:pb-6">
          <div className="container">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div className="text-center sm:text-left">
                <h2 className="text-2xl md:text-3xl font-bold mb-2">Browse Categories</h2>
                <p className="text-muted-foreground">
                  Explore our wide range of course categories
                </p>
              </div>
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/categories">View All</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {categories.map((category) => {
                const IconComponent = iconMap[category.icon || "Code"] || Code
                return (
                  <Link
                    key={category.id}
                    href={`/categories/${category.slug}`}
                    className="group"
                  >
                    <Card className="h-full transition-colors hover:bg-muted/50">
                      <CardContent className="p-6 text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <IconComponent className="h-6 w-6" />
                        </div>
                        <h3 className="font-semibold mb-1">{category.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {category._count.courses} courses
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-8 md:py-12">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-12 md:px-16 md:py-16">
            <div className="relative z-10 max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                Share Your Expertise
              </h2>
              <p className="text-lg text-primary-foreground/80 mb-8">
                Become a course developer and help professionals upskill. Create
                CPD-accredited courses in your field of expertise.
              </p>
              <button className="inline-flex items-center justify-center gap-3 rounded-xl bg-white text-primary font-extrabold text-lg md:text-xl px-10 md:px-14 py-5 md:py-6 shadow-lg shadow-white/10 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-white/20 active:scale-100">
                <Link href={isCourseDeveloper ? "/instructor" : "/become-instructor"} className="flex items-center gap-3">
                  {isCourseDeveloper ? "Go to Course Developer" : "Start Creating Courses"}
                  <ArrowRight className="h-6 w-6" />
                </Link>
              </button>
            </div>
            <div className="absolute right-0 top-0 -z-0 h-full w-1/2 opacity-10">
              <svg
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
                className="h-full w-full"
              >
                <path
                  fill="currentColor"
                  d="M45.3,-52.7C59.1,-42.2,71.2,-28.4,74.8,-12.6C78.3,3.2,73.3,21,63.4,35.1C53.5,49.2,38.7,59.6,22.2,65.4C5.7,71.2,-12.5,72.4,-28.9,66.4C-45.3,60.4,-59.9,47.2,-68.1,30.8C-76.3,14.4,-78.1,-5.2,-72.2,-22.2C-66.3,-39.2,-52.7,-53.6,-37.6,-63.8C-22.5,-74,-5.6,-80,8.4,-77.8C22.4,-75.5,31.5,-63.2,45.3,-52.7Z"
                  transform="translate(100 100)"
                />
              </svg>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
