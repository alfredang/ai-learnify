"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useT } from "@/hooks/use-t"

export function Footer() {
  const pathname = usePathname()
  const t = useT()

  // Hide on instructor/admin routes (they have their own layout)
  if (pathname.startsWith("/instructor") || pathname.startsWith("/admin")) {
    return null
  }

  const footerLinks = {
    platform: [
      { href: "/courses", label: t("footer.browseCourses") },
      { href: "/categories", label: t("footer.categories") },
      { href: "/become-instructor", label: t("footer.becomeDeveloper") },
    ],
    company: [
      { href: "/about", label: t("footer.aboutUs") },
      { href: "/contact", label: t("footer.contact") },
      { href: "/careers", label: t("footer.careers") },
    ],
    support: [
      { href: "/help", label: t("footer.helpCenter") },
      { href: "/faq", label: t("footer.faq") },
      { href: "/terms", label: t("footer.terms") },
      { href: "/privacy", label: t("footer.privacyPolicy") },
      { href: "/refund-policy", label: t("footer.refundPolicy") },
    ],
  }

  return (
    <footer className="border-t bg-background">
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center space-x-2">
              <img src="/images/ies-logo.svg" alt="IES Logo" width={32} height={32} />
              <span className="font-bold text-xl">IES Digital Academy</span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("footer.description")}
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-semibold mb-4">{t("footer.platform")}</h4>
            <ul className="space-y-2">
              {footerLinks.platform.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold mb-4">{t("footer.company")}</h4>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4">{t("footer.support")}</h4>
            <ul className="space-y-2">
              {footerLinks.support.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} IES Digital Academy. {t("footer.allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  )
}
