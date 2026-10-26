import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
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

const img = (id: string) => `https://images.unsplash.com/${id}?w=640&h=480&fit=crop&q=75`

/** Photo per category slug; unknown categories use a general learning image. */
const categoryImages: Record<string, string> = {
  "it-software": img("photo-1517694712202-14dd9538aa97"),
  marketing: img("photo-1460925895917-afdab827c52f"),
  design: img("photo-1561070791-2526d30994b5"),
  "personal-development": img("photo-1546410531-bb4caa6b424d"),
  business: img("photo-1557804506-669a67965ba0"),
  development: img("photo-1498050108023-c5249f4df085"),
}
const categoryImageFallback = img("photo-1588196749597-9ff075ee6b5b")

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
      <section className="relative py-5 md:py-8 bg-white overflow-hidden">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
            <div className="space-y-4 md:space-y-5 text-center lg:text-left">
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
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
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
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 justify-center lg:justify-start">
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
              <div className="relative w-full aspect-[16/10] lg:aspect-auto lg:h-[400px]">
                <Image
                  src="https://images.unsplash.com/photo-1531545514256-b1400bc00f31?w=1200&h=800&fit=crop&q=80"
                  alt="Smiling learners working through an online course together"
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
        <div className="container py-4 md:py-5">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <section className="py-6 md:py-8">
          <div className="container">
            <div className="mb-4 flex items-end justify-between gap-4">
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
            <Button variant="outline" asChild className="mt-4 w-full sm:hidden">
              <Link href="/courses">
                View all courses <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="border-t py-6 md:py-8">
        <div className="container">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">How it works</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-lg border p-4 md:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <step.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="mt-3 font-semibold">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Phase 2: Advertising Banner Carousel (spec §4.1) */}
      <section className="container pb-6 md:pb-8">
        <AdvertisingCarousel />
      </section>

      {/* Compliance & Localization Strip */}
      <ComplianceStrip />

      {/* Categories Section */}
      {categories.length > 0 && (
        <section className="border-t py-6 md:py-8">
          <div className="container">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold">Browse categories</h2>
                <p className="mt-1 text-muted-foreground">Find the right course for your next step</p>
              </div>
              <Button variant="outline" asChild className="hidden sm:inline-flex">
                <Link href="/categories">
                  View all <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categories.map((category) => {
                const IconComponent = iconMap[category.icon || "Code"] || Code
                const image = categoryImages[category.slug] ?? categoryImageFallback
                return (
                  <Link
                    key={category.id}
                    href={`/categories/${category.slug}`}
                    className="group relative block aspect-[4/3] overflow-hidden rounded-xl"
                  >
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 p-3 text-white">
                      <span className="mb-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-white/20 backdrop-blur-sm">
                        <IconComponent className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="block text-sm font-semibold leading-tight">{category.name}</span>
                      <span className="block text-xs text-white/80">
                        {category._count.courses} {category._count.courses === 1 ? "course" : "courses"}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="pb-6 md:pb-8">
        <div className="container">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-8 md:px-12 md:py-10">
            <div className="relative z-10 max-w-2xl">
              <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-2">
                Share Your Expertise
              </h2>
              <p className="text-base md:text-lg text-primary-foreground/80 mb-5">
                Become a course developer and help professionals upskill. Create
                CPD-accredited courses in your field of expertise.
              </p>
              <Button size="lg" variant="secondary" asChild className="font-semibold">
                <Link href={isCourseDeveloper ? "/instructor" : "/become-instructor"}>
                  {isCourseDeveloper ? "Go to Course Developer" : "Start creating courses"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
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
