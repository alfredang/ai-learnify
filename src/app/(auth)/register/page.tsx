import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { RegisterForm } from "@/components/auth/register-form"

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Sign up and start learning",
}

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl sm:p-10">
      <div className="flex flex-col space-y-2 text-center">
        <Link href="/" className="mx-auto">
          <span className="text-2xl font-bold">Learnify</span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign up and start learning
        </h1>
      </div>
      <Suspense fallback={<div className="h-[400px]" />}>
        <RegisterForm />
      </Suspense>
    </div>
  )
}
