import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

const publicRoutes = [
  "/",
  "/login",
  "/select-role",
  "/register",
  "/forgot-password",
  "/verify-email",
  "/verify", // Phase 5: public certificate verification page (spec §13 QR)
  "/courses",
  "/categories",
  "/instructors",
  "/search",
  "/about",
  "/contact",
  "/become-instructor",
]

const authRoutes = ["/login", "/select-role", "/register", "/forgot-password"]

const studentRoutes = ["/my-courses", "/favourites", "/purchases", "/profile", "/learner"]
const instructorRoutes = ["/instructor"]
const adminRoutes = ["/admin"]

// Phase 8: new role-scoped dashboards. /platform/ops is a sub-section of
// /platform reserved for Platform Support; we list it first so the more
// specific match wins.
const platformSupportRoutes = ["/platform/ops"]
const platformOwnerRoutes = ["/platform"]
const academyAdminRoutes = ["/academy"]
const marketerRoutes = ["/marketer"]

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const userRole = req.auth?.user?.role
  const platformRole = req.auth?.user?.platformRole ?? "NONE"
  const memberships = req.auth?.user?.memberships ?? []

  const pathname = nextUrl.pathname

  const startsWithAny = (list: string[]) =>
    list.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  const isPublicRoute = startsWithAny(publicRoutes)
  const isAuthRoute = startsWithAny(authRoutes)
  const isStudentRoute = startsWithAny(studentRoutes)
  const isInstructorRoute = startsWithAny(instructorRoutes)
  const isAdminRoute = startsWithAny(adminRoutes)

  // Phase 8 role gates.
  const isPlatformSupportRoute = startsWithAny(platformSupportRoutes)
  const isPlatformOwnerRoute =
    startsWithAny(platformOwnerRoutes) && !isPlatformSupportRoute
  const isAcademyAdminRoute = startsWithAny(academyAdminRoutes)
  const isMarketerRoute = startsWithAny(marketerRoutes)

  // Allow API routes and static files
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  // Redirect logged-in users away from auth routes
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/", nextUrl))
  }

  // Require auth for onboarding wizard (must be before public route check)
  if (pathname === "/become-instructor/onboarding") {
    if (!isLoggedIn) {
      return NextResponse.redirect(
        new URL("/login?callbackUrl=/become-instructor/onboarding", nextUrl)
      )
    }
    if (userRole === "INSTRUCTOR" || userRole === "ADMIN") {
      return NextResponse.redirect(new URL("/instructor", nextUrl))
    }
    return NextResponse.next()
  }

  // Allow public routes
  if (
    isPublicRoute &&
    !isStudentRoute &&
    !isInstructorRoute &&
    !isAdminRoute &&
    !isPlatformSupportRoute &&
    !isPlatformOwnerRoute &&
    !isAcademyAdminRoute &&
    !isMarketerRoute
  ) {
    return NextResponse.next()
  }

  // Require authentication for protected routes
  if (!isLoggedIn) {
    const callbackUrl = encodeURIComponent(pathname)
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl)
    )
  }

  // Platform Support: platformRole === PLATFORM_SUPPORT, or Platform Owner
  // (owner can see support screens too).
  if (isPlatformSupportRoute) {
    if (platformRole !== "PLATFORM_SUPPORT" && platformRole !== "PLATFORM_OWNER") {
      return NextResponse.redirect(new URL("/", nextUrl))
    }
    return NextResponse.next()
  }

  // Platform Owner
  if (isPlatformOwnerRoute) {
    if (platformRole !== "PLATFORM_OWNER") {
      return NextResponse.redirect(new URL("/", nextUrl))
    }
    return NextResponse.next()
  }

  // Academy Admin
  if (isAcademyAdminRoute) {
    const isAcademyAdmin = memberships.some((m) => m.role === "ACADEMY_ADMIN")
    const isOwner = platformRole === "PLATFORM_OWNER"
    if (!isAcademyAdmin && !isOwner) {
      return NextResponse.redirect(new URL("/", nextUrl))
    }
    return NextResponse.next()
  }

  // Marketer
  if (isMarketerRoute) {
    const isMarketer = memberships.some((m) => m.role === "MARKETER")
    const isAcademyAdmin = memberships.some((m) => m.role === "ACADEMY_ADMIN")
    const isOwner = platformRole === "PLATFORM_OWNER"
    if (!isMarketer && !isAcademyAdmin && !isOwner) {
      return NextResponse.redirect(new URL("/", nextUrl))
    }
    return NextResponse.next()
  }

  // Legacy instructor routes (unchanged)
  if (isInstructorRoute) {
    if (userRole !== "INSTRUCTOR" && userRole !== "ADMIN") {
      return NextResponse.redirect(new URL("/become-instructor", nextUrl))
    }
  }

  // Legacy admin routes (unchanged)
  if (isAdminRoute) {
    if (userRole !== "ADMIN") {
      return NextResponse.redirect(new URL("/", nextUrl))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
}
