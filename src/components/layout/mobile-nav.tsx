"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import { Search, Home, Library, BookOpen, Grid3X3, Heart, Receipt, GraduationCap, LayoutDashboard } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { useRouter } from "next/navigation"

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/courses", label: "All Courses", icon: Library },
  { href: "/categories", label: "Categories", icon: Grid3X3 },
]

const studentItems = [
  { href: "/my-courses", label: "My Learning", icon: BookOpen },
  { href: "/favourites", label: "Favourites", icon: Heart },
  { href: "/account/purchases", label: "Purchases", icon: Receipt },
]

export function MobileNav() {
  const pathname = usePathname()
  const { isAuthenticated, isInstructor, isAdmin } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <div className="flex flex-col space-y-4 py-4">
      <Link href="/" className="flex items-center gap-2 px-4">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
          <circle cx="14" cy="14" r="14" className="fill-foreground" />
          <path d="M8.5 19L14 7.5L19.5 19H8.5Z" className="fill-background" />
        </svg>
        <span className="font-bold text-xl">Learnify</span>
      </Link>

      <form onSubmit={handleSearch} className="px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search courses..."
            className="w-full pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </form>

      <nav className="flex flex-col space-y-1 px-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === item.href
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}

        {isAuthenticated && (
          <>
            <div className="my-2 border-t" />
            {studentItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === item.href
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </>
        )}

        {isInstructor && (
          <>
            <div className="my-2 border-t" />
            <Link
              href="/instructor"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname.startsWith("/instructor")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <GraduationCap className="h-4 w-4" />
              Instructor Dashboard
            </Link>
          </>
        )}

        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname.startsWith("/admin")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Admin Dashboard
          </Link>
        )}
      </nav>

      {!isAuthenticated && (
        <div className="flex flex-col space-y-2 px-4 pt-4 border-t">
          <Button asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/register">Sign up</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
