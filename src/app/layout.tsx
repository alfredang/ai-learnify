import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/providers"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: {
    default: "IES Digital Academy - Online Learning Platform",
    template: "%s | IES Digital Academy",
  },
  description:
    "The leading online learning platform. Learn new skills, advance your career, and explore new hobbies with expert-led courses.",
  keywords: [
    "online courses",
    "e-learning",
    "education",
    "tutorials",
    "skills",
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-white`}>
        <Providers>
          <div className="relative flex min-h-screen flex-col bg-white">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}
