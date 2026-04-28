import type { Metadata } from "next"
import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your account",
}

export default function LoginPage() {
  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <img
          src="/images/ies-logo.svg"
          alt="IES Digital Academy"
          width={64}
          height={64}
          className="mx-auto"
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          Log in to your IES Digital account
        </h1>
      </div>
      <Suspense fallback={<div className="h-[400px]" />}>
        <LoginForm />
      </Suspense>
    </>
  )
}
