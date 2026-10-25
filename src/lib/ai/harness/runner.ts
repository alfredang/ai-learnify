/**
 * Generic agent harness — a deterministic, observable step runner.
 *
 * An "agent" here is an ordered list of steps that share a mutable
 * context. The harness:
 *   - runs steps in order, timing each one,
 *   - persists a trace after every step (so UIs can show live progress),
 *   - retries a step when it opts in,
 *   - stops on the first hard failure and records the reason,
 *   - lets a step mark itself skipped (e.g. optional AI enrichment).
 *
 * The model-facing work (OpenAI → DeepSeek fallback) lives inside
 * individual steps via `runAgentQuery` / `runAiAssist`; the harness is
 * provider-agnostic.
 */

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped"

export type StepTrace = {
  id: string
  label: string
  status: StepStatus
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  attempts?: number
  /** Short human-readable note shown in the UI. */
  detail?: string
  /** Structured data worth surfacing (counts, ids). Never secrets. */
  data?: Record<string, unknown>
}

export type StepOutcome =
  | { status: "done"; detail?: string; data?: Record<string, unknown> }
  | { status: "skipped"; detail?: string; data?: Record<string, unknown> }

export type StepDef<Ctx> = {
  id: string
  label: string
  /** Number of attempts before the step is considered failed. Default 1. */
  retries?: number
  run: (ctx: Ctx, trace: StepTrace) => Promise<StepOutcome | void>
}

export type HarnessEvents = {
  onTrace?: (trace: StepTrace[], current: StepTrace) => Promise<void> | void
}

export class HarnessError extends Error {
  constructor(public stepId: string, message: string) {
    super(message)
    this.name = "HarnessError"
  }
}

export async function runHarness<Ctx>(
  steps: StepDef<Ctx>[],
  ctx: Ctx,
  events: HarnessEvents = {}
): Promise<StepTrace[]> {
  const trace: StepTrace[] = steps.map((s) => ({ id: s.id, label: s.label, status: "pending" }))

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const t = trace[i]
    t.status = "running"
    t.startedAt = new Date().toISOString()
    t.attempts = 0
    await events.onTrace?.(trace, t)

    const maxAttempts = Math.max(1, (step.retries ?? 0) + 1)
    let lastError: unknown = null
    const started = Date.now()

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      t.attempts = attempt
      try {
        const out = await step.run(ctx, t)
        t.status = out?.status === "skipped" ? "skipped" : "done"
        if (out?.detail) t.detail = out.detail
        if (out?.data) t.data = { ...(t.data ?? {}), ...out.data }
        lastError = null
        break
      } catch (e) {
        lastError = e
        if (attempt < maxAttempts) {
          t.detail = `Attempt ${attempt} failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300)
          await events.onTrace?.(trace, t)
        }
      }
    }

    t.finishedAt = new Date().toISOString()
    t.durationMs = Date.now() - started

    if (lastError) {
      t.status = "failed"
      t.detail = (lastError instanceof Error ? lastError.message : String(lastError)).slice(0, 500)
      await events.onTrace?.(trace, t)
      throw new HarnessError(step.id, t.detail)
    }
    await events.onTrace?.(trace, t)
  }
  return trace
}
