import { Suspense } from "react"
import { VerifyEmailChangeClient } from "./verify-email-change-client"

export const metadata = {
  title: "Verify Email Change",
}

export default function VerifyEmailChangePage() {
  return (
    <div className="container max-w-md py-16">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <VerifyEmailChangeClient />
      </Suspense>
    </div>
  )
}
