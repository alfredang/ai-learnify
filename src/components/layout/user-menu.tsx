"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { serverSignOut } from "@/app/actions/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { User, LogOut, Settings } from "lucide-react"
import { useT } from "@/hooks/use-t"
import type { UserRole } from "@prisma/client"

interface UserMenuProps {
  user?: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    role: UserRole
  }
}

export function UserMenu({ user }: UserMenuProps) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const t = useT()

  if (!user) return null

  const handleSignOut = async () => {
    setIsOpen(false)
    queryClient.clear()
    await serverSignOut()
    window.location.href = "/"
  }

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative h-9 w-9 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Avatar className="h-9 w-9">
          <AvatarImage src={user.image || ""} alt={user.name || ""} />
          <AvatarFallback>{initials || "U"}</AvatarFallback>
        </Avatar>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-lg shadow-2xl border z-50">
            <div className="px-3 py-3 border-b">
              <p className="text-sm font-semibold">{user.name || "User"}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <div className="p-2">
              <Link
                href="/learner/profile"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md hover:bg-muted/50 transition-colors"
              >
                <User className="h-4 w-4" />
                {t("nav.myProfile")}
              </Link>
              <Link
                href="/account"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-md hover:bg-muted/50 transition-colors"
              >
                <Settings className="h-4 w-4" />
                {t("nav.accountSettings")}
              </Link>
            </div>
            <div className="p-2 border-t">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t("auth.logout")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
