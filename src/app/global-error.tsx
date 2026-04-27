"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global error:", error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif"
        }}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
              Something went wrong!
            </h2>
            <p style={{ color: "#666", marginBottom: "1rem" }}>
              {error.message || "An unexpected error occurred"}
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#999", marginBottom: "1rem" }}>
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={() => reset()}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                marginRight: "0.5rem"
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.href = "/"}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#fff",
                color: "#000",
                border: "1px solid #ccc",
                borderRadius: "0.25rem",
                cursor: "pointer"
              }}
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
