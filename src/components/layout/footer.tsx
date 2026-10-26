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
      <div className="container py-8 md:py-10">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center space-x-2">
              <img src="/images/learnify-logo.svg" alt="Learnify logo" width={32} height={32} />
              <span className="font-bold text-xl">Learnify</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              {t("footer.description")}
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-semibold mb-3">{t("footer.platform")}</h4>
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
            <h4 className="font-semibold mb-3">{t("footer.company")}</h4>
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
            <h4 className="font-semibold mb-3">{t("footer.support")}</h4>
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

        <div className="mt-8 border-t pt-5 flex flex-col md:flex-row justify-between items-center gap-2">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Learnify. {t("footer.allRightsReserved")}
          </p>
          <p className="powered-by text-sm text-muted-foreground">
            Powered by{" "}
            <a
              href="https://www.tertiaryinfotech.com/"
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Tertiary Infotech Academy Pte Ltd
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
