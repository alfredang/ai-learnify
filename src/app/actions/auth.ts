"use server"

import { cookies } from "next/headers"

export async function serverSignOut() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  for (const cookie of allCookies) {
    if (cookie.name.includes("authjs") || cookie.name.includes("next-auth")) {
      cookieStore.delete(cookie.name)
    }
  }
}
