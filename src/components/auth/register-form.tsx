"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { SocialButtons } from "./social-buttons"
import Link from "next/link"

// IESA LMS spec §3.1 / §5.1 required fields. certificateIdNumber is optional.
const signupSchema = z.object({
  nameToBeCalled: z
    .string()
    .min(2, "Name to be called must be at least 2 characters")
    .max(80),
  certificateName: z
    .string()
    .min(2, "Name on certificate must be at least 2 characters")
    .max(120),
  certificateIdNumber: z.string().max(64).optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Must contain uppercase, lowercase, and number"
    ),
})

type SignupInput = z.infer<typeof signupSchema>

export function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/"
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      nameToBeCalled: "",
      certificateName: "",
      certificateIdNumber: "",
      email: "",
      password: "",
    },
  })

  async function onSubmit(data: SignupInput) {
    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameToBeCalled: data.nameToBeCalled,
          certificateName: data.certificateName,
          certificateIdNumber: data.certificateIdNumber || undefined,
          email: data.email,
          password: data.password,
          confirmPassword: data.password,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Registration failed")
      }

      // Auto sign-in after registration
      const signInResult = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      })

      if (signInResult?.error) {
        toast.success("Account created! Please sign in.")
        router.push(
          callbackUrl !== "/"
            ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
            : "/login"
        )
        return
      }

      toast.success(`Welcome to Learnify, ${data.nameToBeCalled}!`)
      router.push(callbackUrl)
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      )
    } finally {
      setIsLoading(false)
    }
  }

  // When the user types a "name to be called" we auto-fill certificate name
  // on first keystroke so they don't have to type it twice — they can still
  // edit it after.
  const nameToBeCalled = form.watch("nameToBeCalled")
  const certificateName = form.watch("certificateName")
  if (nameToBeCalled && !certificateName && !form.formState.dirtyFields.certificateName) {
    form.setValue("certificateName", nameToBeCalled, { shouldDirty: false })
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="nameToBeCalled"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name to be called</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Alex"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>Shown throughout the LMS.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="certificateName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name on certificate</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Full legal name for certificates"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  This is printed exactly as typed on every certificate.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="certificateIdNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  ID number <span className="text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Included on certificate if provided"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="Email"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold"
            size="lg"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign up
          </Button>
        </form>
      </Form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Other sign up options
          </span>
        </div>
      </div>

      <SocialButtons isLoading={isLoading} callbackUrl={callbackUrl} />

      <p className="text-xs text-center text-muted-foreground">
        By signing up, you agree to our{" "}
        <span className="underline">Terms of Use</span> and{" "}
        <span className="underline">Privacy Policy</span>.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={
            callbackUrl !== "/"
              ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
              : "/login"
          }
          className="text-primary font-medium hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  )
}
