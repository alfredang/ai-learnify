"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gift, BookOpen, Layers, Award, Receipt, UserCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const items = [
  { href: "/learner/complimentary", icon: Gift, label: "Free" },
  { href: "/my-courses", icon: BookOpen, label: "E-Courses" },
  { href: "/learner/programmes", icon: Layers, label: "Programmes" },
  { href: "/certificates", icon: Award, label: "Certs" },
  { href: "/learner/invoices", icon: Receipt, label: "Invoices" },
  { href: "/learner/profile", icon: UserCircle, label: "Profile" },
]

export function LearnerMobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background md:hidden">
      <div className="grid grid-cols-6">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] transition-colors",
                active
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
