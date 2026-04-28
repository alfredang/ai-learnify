"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, Menu, Heart, Bell, User as UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserMenu } from "./user-menu"
import { MobileNav } from "./mobile-nav"
import { RoleSwitcher } from "./role-switcher"
import { HeaderDateTime } from "./header-datetime"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useRouter } from "next/navigation"

const mainNav = [
  { href: "/courses", label: "Courses" },
  { href: "/categories", label: "Categories" },
]

export function Header() {
  const pathname = usePathname()
  const { user, isAuthenticated, isInstructor, isAdmin } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  // Hide on instructor routes (they have their own layout)
  if (pathname.startsWith("/instructor")) {
    return null
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-2 md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="overflow-y-auto pr-0">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <MobileNav />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/" className="mr-6 flex items-center gap-2">
          <img src="/images/ies-logo.svg" alt="IES Logo" width={36} height={36} className="flex-shrink-0" />
          <span className="font-bold text-xl">IES Digital Academy</span>
        </Link>

        {/* Main nav */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "transition-colors hover:text-foreground/80",
                pathname === item.href
                  ? "text-foreground"
                  : "text-foreground/60"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Search */}
        <form
          onSubmit={handleSearch}
          className="hidden md:flex flex-1 items-center px-6"
        >
          <div className="relative w-full max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search for courses..."
              className="w-full pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </form>

        {/* Right side */}
        <div className="flex items-center space-x-2">
          {isAuthenticated ? (
            <>
              <div className="hidden md:flex items-center gap-3">
                <RoleSwitcher
                  platformRole={(user as Record<string, unknown>)?.platformRole as string ?? "NONE"}
                  memberships={((user as Record<string, unknown>)?.memberships as { academyId: string; role: string }[]) ?? []}
                  legacyRole={user?.role}
                />
                {user?.image ? (
                  <img
                    src={user.image}
                    alt={user?.name ?? "Profile"}
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-offset-1 ring-primary"
                  />
                ) : null}
                <HeaderDateTime />
              </div>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/favourites">
                  <Heart className="h-5 w-5" />
                  <span className="sr-only">Favourites</span>
                </Link>
              </Button>
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" aria-label="Notifications">
                <Bell className="h-5 w-5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label="Account menu"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        <UserIcon className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem asChild>
                    <Link href="/login">Log in</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/register">Sign up</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
