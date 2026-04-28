import type { Metadata } from "next"
import Link from "next/link"
import {
  Crown,
  LifeBuoy,
  Building2,
  PencilRuler,
  Megaphone,
  GraduationCap,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Choose your role",
  description: "Select your role to sign in",
}

type Role = {
  slug: string
  name: string
  description: string
  icon: LucideIcon
  callbackUrl: string
}

const ROLES: Role[] = [
  {
    slug: "platform-owner",
    name: "Platform Owner",
    description: "Commercial owner, monetisation policy",
    icon: Crown,
    callbackUrl: "/platform",
  },
  {
    slug: "platform-support",
    name: "Platform Support",
    description: "Security, uptime, technical support",
    icon: LifeBuoy,
    callbackUrl: "/platform",
  },
  {
    slug: "academy-admin",
    name: "Academy Admin",
    description: "Organisation / Academy administrator",
    icon: Building2,
    callbackUrl: "/academy",
  },
  {
    slug: "course-developer",
    name: "Course Developer",
    description: "Content creation & maintenance",
    icon: PencilRuler,
    callbackUrl: "/instructor",
  },
  {
    slug: "marketer",
    name: "Marketer / Affiliate",
    description: "Promotion via promo codes",
    icon: Megaphone,
    callbackUrl: "/marketer",
  },
  {
    slug: "learner",
    name: "Learner",
    description: "End-user consumer",
    icon: GraduationCap,
    callbackUrl: "/learner",
  },
]

export default function SelectRolePage() {
  return (
    <div className="w-full max-w-xl space-y-8 rounded-2xl bg-white p-8 shadow-xl sm:p-10">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Choose your role
        </h1>
        <p className="text-sm text-muted-foreground">
          Select how you&apos;ll be signing in today
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {ROLES.map((role) => {
          const Icon = role.icon
          const href = `/login?role=${role.slug}&callbackUrl=${encodeURIComponent(
            role.callbackUrl
          )}`
          return (
            <Link
              key={role.slug}
              href={href}
              className="group flex items-center gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-[#1e2a5e] hover:bg-slate-50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1e2a5e]/10 text-[#1e2a5e]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 leading-tight">
                  {role.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                  {role.description}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#1e2a5e]" />
            </Link>
          )
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-semibold text-foreground hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  )
}
