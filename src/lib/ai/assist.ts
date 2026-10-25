import { createHash } from "node:crypto"
import { AiCapability, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts"
import { runAgentQuery, tryParseJson } from "@/lib/ai/agent"

/**
 * Phase 7 — central AI assist service (spec §8).
 *
 *   - All capabilities run through `runAgentQuery()` so the same
 *     per-tenant credential chain (OpenAI → DeepSeek), audit trail, and
 *     chokepoint applies to every draft.
 *   - The single shared system prompt per capability stays stable across
 *     calls so provider-side prompt caching keeps warm. Volatile content (course title, existing copy) is sent in the
 *     user turn after the cached prefix.
 *   - Every call writes an `AiInteraction` row + audit log entry.
 *   - Tenant gate: refuses if `academy.aiEnabled` is false.
 *   - Output is always a DRAFT — `approved=false` until the author hits
 *     "Use this draft" in the UI.
 */

export type AiAssistInput = {
  capability: AiCapability
  academyId: string
  userId: string
  /** Freeform per-capability input the author provides (topic, existing copy, slide context, etc.). */
  userPrompt: string
  /** Extra context recorded on the audit row — e.g. { courseId, lectureId }. */
  context?: Record<string, unknown>
  /** Override model (default OPENAI_MODEL / gpt-6.1-sol). */
  model?: string
  /** Override max conversation turns. Default 1 (single round-trip). */
  maxTurns?: number
}

export type AiAssistResult = {
  interactionId: string
  capability: AiCapability
  /** Raw text from the model — callers should JSON.parse per the prompt contract. */
  rawText: string
  /** Parsed JSON if the raw text was valid JSON; otherwise null. */
  parsed: unknown | null
  usage: {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    model: string
    costUsd: number
  }
  approvalRequired: true
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32)
}

// Deterministic-by-input random helpers. We seed Math from the user's
// prompt so the SAME course (same title + same context) always picks
// the same variants — anyone generating for that course on any
// machine sees identical output. Different courses still differ
// because their seeds differ.

/** Hash a string into a 32-bit integer (cyrb32-style). Fast, stable. */
function seedFrom(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Mulberry32 PRNG — same seed → same sequence on every machine. */
function makeRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Pick `n` distinct items from an array using a seeded RNG. */
function pickSeeded<T>(arr: T[], n: number, rng: () => number): T[] {
  const indexed = arr.map((v, i) => ({ v, k: rng() + i * 1e-9 }))
  indexed.sort((a, b) => a.k - b.k)
  return indexed.slice(0, Math.min(n, arr.length)).map((x) => x.v)
}

/** One pick from an array using a seeded RNG. */
function pickOneSeeded<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

// Wrappers that match the previous API but use a passed-in RNG.
function pick<T>(arr: T[], n: number, rng?: () => number): T[] {
  if (rng) return pickSeeded(arr, n, rng)
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}
function pickOne<T>(arr: T[], rng?: () => number): T {
  if (rng) return pickOneSeeded(arr, rng)
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Local-dev mock for when no AI credential is configured. Generates a
 * plausible templated response based on the course topic extracted from
 * the user prompt. Allows the editor flow to be exercised without a
 * real credential. Production always uses the real model.
 */
function buildMockResponse(
  capability: AiCapability,
  userPrompt: string
): { rawText: string; usage: { inputTokens: number; outputTokens: number; cachedTokens: number; model: string; costUsd: number; provider: "mock" } } {
  // Topic extraction: try the structured "Course title: X" line first
  // (intended-learners flow), fall back to the first sentence of the
  // user's free-text prompt (AiAssistButton flow), capped to 80 chars.
  const titleMatch = userPrompt.match(/Course title:\s*([^\n]+)/i)
  const subtitleMatch = userPrompt.match(/Subtitle:\s*([^\n]+)/i)
  let rawTitle = titleMatch?.[1]?.trim() || ""
  if (!rawTitle) {
    const firstLine = userPrompt.split(/[\n.]/)[0]?.trim() ?? ""
    rawTitle = firstLine.length > 0 && firstLine.length < 120 ? firstLine : "this course"
  }
  const topic = rawTitle.replace(/^introduction (to|of)\s+/i, "").trim() || rawTitle
  const subtitle = subtitleMatch?.[1]?.trim() || ""

  // Seed the RNG from capability + course title + (optional) description
  // so the same course generated by anyone on any machine produces the
  // same draft. Different courses still diverge because their seeds
  // differ. Subsequent regenerations also stay stable until the title
  // or description changes — once the author edits the course copy,
  // the seed shifts and a fresh draft becomes available.
  const descSeedMatch = userPrompt.match(/Existing description:\s*([^\n]+)/i)
  const seedKey = `${capability}::${rawTitle}::${(descSeedMatch?.[1] ?? "").slice(0, 200)}`
  const rng = makeRng(seedFrom(seedKey))

  let rawText: string
  switch (capability) {
    case "OBJECTIVES": {
      // Extract specific themes/keywords from the description AND the
      // raw prompt (covers focus areas typed in the AI modal as well).
      const descMatch = userPrompt.match(/Existing description:\s*([^\n]+)/i)
      const promptText = (descMatch?.[1] ?? userPrompt).toLowerCase()
      const focusObjectives: string[] = []
      const has = (re: RegExp) => re.test(promptText)
      if (has(/intro|fundament|basic|foundation/)) focusObjectives.push(`Explain the foundational concepts of ${topic} and why they matter to practitioners today`)
      if (has(/benefit|value|impact/)) focusObjectives.push(`Articulate the concrete benefits of ${topic} to different stakeholders, with specific examples`)
      if (has(/strateg|plan/)) focusObjectives.push(`Develop ${topic} strategies that align with measurable business goals`)
      if (has(/tool|platform|software|tech/)) focusObjectives.push(`Select and configure the right ${topic} tools for a given project context`)
      if (has(/measur|metric|kpi|analytic|track/)) focusObjectives.push(`Define meaningful ${topic} metrics and interpret what they tell you`)
      if (has(/best practice|industry|standard/)) focusObjectives.push(`Apply ${topic} industry best practices to your own projects with confidence`)
      if (has(/challenge|pitfall|mistake|problem/)) focusObjectives.push(`Identify common ${topic} pitfalls early and apply proven techniques to avoid them`)
      if (has(/case stud|example|real.world/)) focusObjectives.push(`Critically analyse real-world ${topic} case studies and extract lessons you can apply`)
      if (has(/team|stakeholder|colleague|communicat/)) focusObjectives.push(`Communicate ${topic} decisions and trade-offs clearly to technical and non-technical audiences`)
      if (has(/produc|deploy|ship|launch/)) focusObjectives.push(`Take ${topic} work from prototype to production while maintaining quality and reliability`)
      if (has(/design|build|develop|create/)) focusObjectives.push(`Design and build ${topic} solutions that solve real problems`)
      if (has(/optim|improv|enhanc/)) focusObjectives.push(`Diagnose and optimise ${topic} performance using systematic techniques`)
      if (has(/security|safe|risk/)) focusObjectives.push(`Recognise ${topic} security and risk considerations in real deployments`)
      if (has(/automat|workflow|process/)) focusObjectives.push(`Automate routine ${topic} workflows so you can focus on higher-value work`)
      const objectivePool = [
        ...focusObjectives,
        `Apply ${topic} concepts to real-world projects with confidence`,
        `Build hands-on ${topic} examples that you can adapt to your own work`,
        `Diagnose and resolve the most common ${topic} issues practitioners face`,
        `Explain ${topic} principles in clear, jargon-free language`,
        `Evaluate the trade-offs of different ${topic} approaches before committing`,
        `Design ${topic} workflows that fit your team's constraints and goals`,
        `Recognise when ${topic} is — and isn't — the right choice for a problem`,
        `Implement professional ${topic} practices that hold up under real-world load`,
        `Troubleshoot ${topic} performance and reliability with a structured approach`,
        `Articulate the business value of ${topic} to leaders, peers, and clients`,
        `Critique existing ${topic} implementations and propose meaningful improvements`,
        `Integrate ${topic} into your existing toolchain without disrupting current work`,
        `Measure the real impact of ${topic} initiatives using clear, defensible metrics`,
        `Mentor colleagues on ${topic} fundamentals once you've internalised them yourself`,
      ]
      const requirementPool = [
        "No prior experience required — we build up every concept from first principles",
        "A computer with internet access and a modern browser is all the setup you need",
        "Willingness to follow along with hands-on examples rather than just watching passively",
        "Comfort with reading short pieces of text and following structured guides",
        `Helpful (not required): casual familiarity with the broader field surrounding ${topic}`,
        "Note-taking tool of your choice — we point at supporting materials throughout",
      ]
      const audiencePool = [
        `Professionals starting their journey in ${topic} and looking for a structured starting point`,
        `Students who want to add ${topic} to their portfolio with real, demonstrable skills`,
        `Career changers moving into ${topic}-adjacent roles and needing a solid foundation fast`,
        `Team leads evaluating ${topic} for their organisation who need conversational fluency`,
        `Self-taught learners filling specific gaps in their ${topic} knowledge`,
        `Curious hobbyists exploring how ${topic} applies to their own projects and ideas`,
        `Managers who support ${topic} work and want enough depth to make informed decisions`,
        `Practitioners from adjacent fields who need to integrate ${topic} into existing workflows`,
      ]
      const wantedObjectives = 4 + Math.floor(rng() * 2) // 4 or 5
      // Always include focus-driven objectives first, then top up from
      // the generic pool. Guarantees the saved description is reflected
      // in the outcomes the learner sees.
      const remainingCount = Math.max(0, wantedObjectives - focusObjectives.length)
      const genericObjectives = pick(
        objectivePool.filter((o) => !focusObjectives.includes(o)),
        remainingCount,
        rng
      )
      const finalObjectives = [
        ...focusObjectives.slice(0, wantedObjectives),
        ...genericObjectives,
      ].slice(0, wantedObjectives)
      rawText = JSON.stringify({
        objectives: finalObjectives,
        requirements: pick(requirementPool, 1 + Math.floor(rng() * 2), rng),
        audience: pick(audiencePool, 2 + Math.floor(rng() * 2), rng),
      })
      break
    }
    case "OUTLINE": {
      // Honor structured params if the user prompt includes them.
      // Format: "Sections: N", "Lectures per section: M", "Focus areas: a, b, c".
      const secMatch = userPrompt.match(/Sections:\s*(\d+)/i)
      const lectMatch = userPrompt.match(/Lectures per section:\s*(\d+)/i)
      const focusMatch = userPrompt.match(/Focus areas:\s*([^\n]+)/i)
      const sectionCount = secMatch ? Math.min(8, Math.max(1, parseInt(secMatch[1]))) : 4
      const lecturesPer = lectMatch ? Math.min(8, Math.max(1, parseInt(lectMatch[1]))) : 4
      // User-supplied focus areas drive the section titles directly so the
      // outline is actually aligned to what the author asked for.
      const focusAreas = (focusMatch?.[1] ?? "")
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const sectionThemePool = [
        `Foundations of ${topic}`,
        `Getting started with ${topic}`,
        `Core principles of ${topic}`,
        `Working with ${topic}`,
        `Hands-on with ${topic}`,
        `Going deeper into ${topic}`,
        `${topic} in practice`,
        `Advanced ${topic} techniques`,
        `${topic} in production`,
        `Real-world ${topic} projects`,
        `Scaling ${topic} for teams`,
        `Common ${topic} patterns and anti-patterns`,
        `${topic} performance and reliability`,
        `Where ${topic} is heading next`,
        `Mastery and next steps`,
      ]
      // Map each focus area to a section title that incorporates the topic.
      // E.g. "intro" + "Digital Marketing" → "Introduction to Digital Marketing"
      // "benefits" → "Benefits of Digital Marketing"
      const focusToTitle = (raw: string): string => {
        const cleaned = raw.toLowerCase().trim()
        if (/^intro/.test(cleaned)) return `Introduction to ${topic}`
        if (/benefit/.test(cleaned)) return `Benefits of ${topic}`
        if (/basic|fundamental|foundation/.test(cleaned)) return `${topic} fundamentals`
        if (/example|use case|case stud/.test(cleaned)) return `${topic} use cases`
        if (/tool|platform|software/.test(cleaned)) return `${topic} tools and platforms`
        if (/strateg/.test(cleaned)) return `${topic} strategy`
        if (/best practice|tip/.test(cleaned)) return `${topic} best practices`
        if (/challenge|pitfall|mistake/.test(cleaned)) return `Common ${topic} pitfalls`
        if (/practice|hands-on|exercise/.test(cleaned)) return `Hands-on ${topic} practice`
        if (/advanc/.test(cleaned)) return `Advanced ${topic}`
        if (/future|trend/.test(cleaned)) return `Trends and the future of ${topic}`
        if (/measur|metric|kpi|analytic/.test(cleaned)) return `Measuring ${topic} success`
        // Default: capitalise the focus phrase and append the topic if not present
        const titled = raw.charAt(0).toUpperCase() + raw.slice(1)
        return cleaned.includes(topic.toLowerCase()) ? titled : `${titled} in ${topic}`
      }
      const focusSectionTitles = focusAreas.map(focusToTitle)
      // If the user gave us focus areas, use them first; pad with generic
      // themes only if they asked for more sections than focus areas.
      const sectionThemes =
        focusSectionTitles.length >= sectionCount
          ? focusSectionTitles.slice(0, sectionCount)
          : [
              ...focusSectionTitles,
              ...pick(
                sectionThemePool.filter(
                  (t) => !focusSectionTitles.includes(t)
                ),
                sectionCount - focusSectionTitles.length,
                rng
              ),
            ]
      // Lecture pools split by section purpose — early sections lean on
      // intro/concept lectures, mid sections on applied work, late
      // sections on reflection / synthesis. Picks within a section feel
      // coherent rather than scrambled.
      const introLectures: Array<{ title: (s: string) => string; type: "VIDEO" | "TEXT" | "QUIZ" }> = [
        { title: (s) => `Welcome and what to expect`, type: "VIDEO" },
        { title: (s) => `What is ${s}?`, type: "VIDEO" },
        { title: (s) => `Why ${s} matters now`, type: "VIDEO" },
        { title: (s) => `Key terms and ideas`, type: "VIDEO" },
        { title: (s) => `${s} in a nutshell`, type: "VIDEO" },
        { title: (s) => `Section recap`, type: "TEXT" },
      ]
      const appliedLectures: Array<{ title: (s: string) => string; type: "VIDEO" | "TEXT" | "QUIZ" }> = [
        { title: (s) => `Worked example: a typical ${s} task`, type: "VIDEO" },
        { title: (s) => `Step-by-step walkthrough`, type: "VIDEO" },
        { title: (s) => `Hands-on practice`, type: "VIDEO" },
        { title: (s) => `When this approach works (and when it doesn't)`, type: "VIDEO" },
        { title: (s) => `Common mistakes to watch for`, type: "TEXT" },
        { title: (s) => `Knowledge check`, type: "QUIZ" },
        { title: (s) => `Quick reference`, type: "TEXT" },
        { title: (s) => `Mini-exercise: try it yourself`, type: "VIDEO" },
      ]
      const advancedLectures: Array<{ title: (s: string) => string; type: "VIDEO" | "TEXT" | "QUIZ" }> = [
        { title: (s) => `Real-world case study`, type: "VIDEO" },
        { title: (s) => `Performance and scaling considerations`, type: "VIDEO" },
        { title: (s) => `Advanced patterns and trade-offs`, type: "VIDEO" },
        { title: (s) => `Putting it all together`, type: "VIDEO" },
        { title: (s) => `Section assessment`, type: "QUIZ" },
        { title: (s) => `Where to go from here`, type: "TEXT" },
        { title: (s) => `End-of-section project`, type: "VIDEO" },
      ]
      // Multi-sentence summaries by section position. Each is 2-3
      // sentences explaining what learners cover and what they'll be
      // able to do by the end of the section.
      const introSummaries = [
        (sec: string) => `In this opening section we set the stage for the rest of the course. You'll learn what ${topic} actually is, where it fits in the broader landscape, and why practitioners reach for it. By the end you'll have a clear mental model and the vocabulary to follow along confidently with the rest of the course.`,
        (sec: string) => `Before diving into hands-on work, this section grounds you in the foundational ideas of ${topic}. We cover the core terminology, the problems ${topic} is designed to solve, and the situations where it shines. You'll finish with the conceptual scaffolding needed for everything that follows.`,
        (sec: string) => `${sec} starts you off with the essentials. You'll see how ${topic} came to be, what real-world problems it addresses, and how it compares to alternative approaches. Expect short, focused lessons that build your confidence quickly without overwhelming you with detail.`,
      ]
      const appliedSummaries = [
        (sec: string) => `This is where ${topic} starts feeling real. You'll work through carefully chosen examples that mirror the kind of scenarios you'll encounter in actual projects, with each step explained so you understand not just what to do but why. Knowledge checks at key moments confirm the material has clicked before you move on.`,
        (sec: string) => `In ${sec}, theory turns into muscle memory. You'll practise ${topic} techniques on realistic problems, see how experienced practitioners approach the same tasks, and learn the subtle decisions that distinguish good work from sloppy work. By section's end you'll have repeatable patterns you can apply on day one of your next project.`,
        (sec: string) => `Hands-on work takes centre stage in this section. We walk through worked examples step by step, pause to highlight common mistakes, and offer mini-exercises so you can try things yourself before moving on. You'll come away with concrete techniques — not just abstract knowledge.`,
      ]
      const advancedSummaries = [
        (sec: string) => `By this point you have the basics down — this section is about depth. You'll see how ${topic} plays out in real production environments, learn the trade-offs experienced practitioners weigh when scaling solutions, and study case studies that reveal what tends to go wrong (and what to do about it). The section ends with a project that ties the course together.`,
        (sec: string) => `${sec} pushes beyond the comfortable middle ground into the harder, more interesting cases. You'll explore advanced patterns, performance and reliability considerations, and the kind of nuanced thinking that separates someone who can get ${topic} working from someone who can do it well at scale. Expect dense but rewarding content.`,
        (sec: string) => `This concluding section pulls everything together. You'll work through richer case studies, see how the pieces fit at scale, and tackle a section project that demonstrates real mastery. We finish with concrete next steps so you know exactly where to take your ${topic} skills from here.`,
      ]
      const sections = Array.from({ length: sectionCount }).map((_, sIdx) => {
        // Pick the appropriate lecture pool based on where this section
        // sits in the course — first 1/3 = intro, middle = applied,
        // last 1/3 = advanced/synthesis.
        const positionRatio = sectionCount === 1 ? 0 : sIdx / (sectionCount - 1)
        const isIntro = positionRatio < 0.34
        const isApplied = positionRatio >= 0.34 && positionRatio < 0.7
        const pool = isIntro ? introLectures : isApplied ? appliedLectures : advancedLectures
        const summaryPool = isIntro
          ? introSummaries
          : isApplied
            ? appliedSummaries
            : advancedSummaries
        const sectionTitle = sectionThemes[sIdx]
        return {
          title: sectionTitle,
          summary: pickOne(summaryPool, rng)(sectionTitle),
          lectures: pick(pool, lecturesPer, rng).map((tpl) => ({
            title: tpl.title(topic),
            type: tpl.type,
          })),
        }
      })
      rawText = JSON.stringify({ sections })
      break
    }
    case "VOICE_OVER":
      rawText = JSON.stringify({
        voText: `Welcome to this lesson on ${topic}. ${subtitle ? subtitle + ". " : ""}In the next few minutes you'll see the key ideas in action. Take your time, pause whenever you need, and feel free to revisit any moment that's worth re-watching.`,
      })
      break
    case "QUIZ":
      rawText = JSON.stringify({
        questions: [
          {
            type: "multiple_choice",
            prompt: `Which of the following best describes ${topic}?`,
            options: [
              { text: `A practical area of study with real-world applications`, correct: true },
              { text: "A historical curiosity with no modern use", correct: false },
              { text: "A purely theoretical concept", correct: false },
              { text: "Not relevant to any industry", correct: false },
            ],
            points: 1,
          },
          {
            type: "multiple_select",
            prompt: `Which of these are common challenges when learning ${topic}?`,
            options: [
              { text: "Starting without a clear goal", correct: true },
              { text: "Skipping the fundamentals", correct: true },
              { text: "Practising too much", correct: false },
              { text: "Asking for help", correct: false },
            ],
            points: 2,
          },
        ],
      })
      break
    case "METADATA": {
      const t = topic
      const spacer = `<p></p>`
      // Pools of variations — each call randomly picks one from each, so
      // re-generating gives a different draft and different courses look
      // visibly different even though the structure stays consistent.
      const heroOpeners = [
        `<p><strong>Master ${t} with a practical, hands-on course built for working professionals.</strong> Whether you're brand new to ${t} or looking to sharpen the fundamentals, this course gives you a clear path from beginner to confident practitioner — no fluff, no padding.</p>`,
        `<p><strong>Learn ${t} the way it's actually used in the field.</strong> This course skips the theory dumps and walks you through what real practitioners do day-to-day, so you finish ready to contribute, not just to recite.</p>`,
        `<p><strong>Build real ${t} skills in self-paced, focused sessions.</strong> Each module pairs short videos with hands-on practice so you internalise the concepts instead of just nodding along.</p>`,
        `<p><strong>From "I've heard of ${t}" to "I can do ${t}" — without the usual filler.</strong> Practical exercises, common pitfalls, and the framing experienced practitioners use, distilled into a focused course you can finish without burning out.</p>`,
      ]
      const learnSections = [
        `<p>By the end of this course, you'll be able to apply core ${t} concepts to real projects, troubleshoot the most common issues, and explain your decisions clearly to colleagues and stakeholders. You'll work through step-by-step examples that mirror real-world scenarios — not contrived textbook problems.</p>`,
        `<p>You'll come away comfortable with the day-to-day vocabulary of ${t}, the patterns experienced practitioners reach for, and the failure modes most beginners hit. Every concept is paired with a worked example so you see exactly how it lands in practice.</p>`,
        `<p>Expect to leave this course able to evaluate ${t} options against real constraints, ship working solutions, and have informed conversations with peers and stakeholders. We focus on the parts you'll actually use, not exhaustive theoretical coverage.</p>`,
      ]
      const structureSections = [
        `<p>The course is broken into focused, bite-sized lectures so you can learn in short sessions and pick up exactly where you left off. Each section ends with a quick knowledge check so you can be sure the material has stuck before moving on. You'll have lifetime access and can revisit any topic as your skills grow.</p>`,
        `<p>Lessons are short and modular — drop in for ten minutes between meetings, or batch through a section on the weekend. Knowledge checks and practical exercises punctuate the content so you stay engaged instead of zoning out through long videos.</p>`,
        `<p>Each module follows the same rhythm: short concept video → applied walkthrough → quick check. That means you can pause anywhere, return tomorrow, and pick up exactly where you left off. Self-paced, no fixed schedule.</p>`,
      ]
      const audienceSections = [
        `<p>This course is designed for beginners and intermediates who want a structured, no-nonsense introduction to ${t}. No prior experience is required — we cover the foundations from scratch and build up gradually.</p>`,
        `<p>If you've tried scattered tutorials and YouTube videos but never quite got a coherent picture of ${t}, this is for you. We start from zero and end with a workable mental model you can build on independently.</p>`,
        `<p>Whether you're switching careers, upskilling for a current role, or just curious — as long as you can read documentation and follow along with examples, you're in the right place.</p>`,
      ]
      const takeawayLists = [
        `<ul><li>A solid working knowledge of ${t} you can apply immediately</li><li>Practical projects you can show in your portfolio</li><li>The vocabulary and frameworks to discuss ${t} confidently with peers</li><li>A self-paced foundation you can keep building on long after the course is done</li></ul>`,
        `<ul><li>Hands-on familiarity with the ${t} workflow from start to finish</li><li>A reference set of examples you can return to whenever you need a refresher</li><li>The pattern-recognition to spot ${t} pitfalls before they cost you time</li><li>Confidence to take on ${t} tasks at work or in personal projects</li></ul>`,
        `<ul><li>Real ${t} skills, not just trivia</li><li>Worked examples you can adapt for your own use cases</li><li>A clear sense of where to go next once you've finished</li><li>The kind of intuition that only comes from actually doing the work</li></ul>`,
      ]
      const closers = [
        `<p><em>Enrol now and start learning at your own pace — your future self will thank you.</em></p>`,
        `<p><em>Your time is valuable. This course respects that.</em></p>`,
        `<p><em>Start today, finish at your own speed, and keep the skills for life.</em></p>`,
      ]
      const descriptionHtml = [
        pickOne(heroOpeners, rng),
        spacer,
        `<p><strong>What you'll learn</strong></p>`,
        pickOne(learnSections, rng),
        spacer,
        `<p><strong>How the course is structured</strong></p>`,
        pickOne(structureSections, rng),
        spacer,
        `<p><strong>Who this course is for</strong></p>`,
        pickOne(audienceSections, rng),
        spacer,
        `<p><strong>What you'll walk away with</strong></p>`,
        pickOne(takeawayLists, rng),
        spacer,
        pickOne(closers, rng),
      ].join("")

      // Stay under the 120-char schema limit on subtitle. Build with the
      // topic interpolated, then truncate cleanly at a word boundary if
      // it would otherwise exceed. Pick from variation pool to avoid
      // identical subtitles across courses.
      const subtitlePool = [
        `Learn ${t} hands-on with practical projects and clear, no-fluff explanations`,
        `A focused, beginner-friendly path to confident ${t} practice`,
        `${t} from first principles to real-world application — at your own pace`,
        `Practical ${t} skills you can apply immediately, no prior experience required`,
        `Master ${t} fundamentals through worked examples and bite-sized lessons`,
      ]
      const builtSubtitle = subtitle || pickOne(subtitlePool, rng)
      const cappedSubtitle =
        builtSubtitle.length <= 120
          ? builtSubtitle
          : builtSubtitle.slice(0, 117).replace(/\s+\S*$/, "") + "..."
      rawText = JSON.stringify({
        title: rawTitle.slice(0, 100),
        subtitle: cappedSubtitle,
        description: descriptionHtml,
        seoKeywords: [
          t.toLowerCase(),
          `learn ${t.toLowerCase()}`,
          `${t.toLowerCase()} course`,
          `${t.toLowerCase()} for beginners`,
          `practical ${t.toLowerCase()}`,
        ],
      })
      break
    }
    case "SUMMARISE": {
      // Detect lecture-context prompts and produce a CONTENT-RICH
      // description with actual substance (definitions, examples, what's
      // covered) — not just meta-talk about the lecture. Designed so the
      // output can feed an AI video generator that needs real material
      // to work from.
      const lectureMatch = userPrompt.match(/Lecture title:\s*([^\n]+)/i)
      const lectureTitle = lectureMatch?.[1]?.trim()
      if (lectureTitle) {
        const lt = lectureTitle.toLowerCase()
        const topicLower = topic.toLowerCase()

        // Domain hints — adds topic-aware example/tool/concept phrases
        // so generic templates pick up category-specific texture.
        type DomainHint = {
          examples: string[]
          tools: string[]
          subConcepts: string[]
          useCases: string[]
        }
        const detectDomain = (): DomainHint => {
          // Programming / software dev
          if (/python|javascript|typescript|java\b|coding|programming|software|develop|web dev|react|node/.test(topicLower)) {
            return {
              examples: ["building a small command-line tool", "writing your first function", "calling an external API", "automating a repetitive task"],
              tools: ["a code editor like VS Code", "the terminal", "package managers (npm/pip)", "Git for version control"],
              subConcepts: ["variables and types", "control flow", "functions and modules", "error handling", "testing basics"],
              useCases: ["building web apps", "automating workflows", "data processing scripts", "internal tooling"],
            }
          }
          // Data / analytics / ML
          if (/data|machine learning|ml\b|ai\b|artificial intelligence|analytic|statistics|sql|pandas/.test(topicLower)) {
            return {
              examples: ["analysing a sales dataset", "predicting customer churn", "cleaning messy CSV data", "building a recommendation"],
              tools: ["Python with pandas", "SQL queries", "Jupyter notebooks", "visualisation libraries like matplotlib"],
              subConcepts: ["data types and structures", "exploratory analysis", "feature engineering", "model evaluation", "telling stories with data"],
              useCases: ["business reporting", "fraud detection", "demand forecasting", "personalised recommendations"],
            }
          }
          // Marketing / sales / business
          if (/marketing|sales|seo|social media|brand|advertis|growth|customer|business|finance|account/.test(topicLower)) {
            return {
              examples: ["crafting an email campaign", "writing a landing page", "analysing a competitor's funnel", "structuring a quarterly plan"],
              tools: ["Google Analytics", "spreadsheet software", "social media schedulers", "campaign-tracking dashboards"],
              subConcepts: ["audience segmentation", "value propositions", "metrics that matter (CAC, LTV, conversion rate)", "channel selection"],
              useCases: ["launching a new product", "improving conversion rates", "scaling content production", "B2B lead generation"],
            }
          }
          // Design / UX / UI / creative
          if (/design|ui\b|ux\b|figma|graphic|visual|art|photo|video edit|creative/.test(topicLower)) {
            return {
              examples: ["redesigning a sign-up screen", "creating a brand mood board", "designing an icon set", "wireframing a mobile flow"],
              tools: ["Figma or Sketch", "design systems and tokens", "prototyping tools", "version-controlled component libraries"],
              subConcepts: ["hierarchy and contrast", "spacing and grids", "colour theory", "typography choices", "user research"],
              useCases: ["product UI work", "marketing collateral", "internal dashboards", "client deliverables"],
            }
          }
          // Productivity / soft skills / management
          if (/productiv|management|leadership|communication|public speak|presentation|negotiation|career/.test(topicLower)) {
            return {
              examples: ["running an effective 1:1", "writing a project brief", "delivering a stakeholder update", "structuring your week"],
              tools: ["a calendar / time-blocking system", "a note-taking app", "shared docs for async collaboration", "a simple kanban board"],
              subConcepts: ["prioritisation frameworks", "feedback techniques", "decision-making under uncertainty", "building trust"],
              useCases: ["leading a small team", "managing your own work", "navigating cross-functional projects", "presenting to leadership"],
            }
          }
          // Health / fitness / wellness
          if (/health|fitness|nutrition|wellness|yoga|workout|mental|meditat/.test(topicLower)) {
            return {
              examples: ["a 20-minute beginner routine", "planning balanced meals", "building a sleep schedule", "tracking weekly progress"],
              tools: ["a fitness tracker or simple journal", "a basic kitchen setup", "household items for resistance training", "a quiet space for practice"],
              subConcepts: ["energy balance", "consistency over intensity", "form and technique", "recovery and rest"],
              useCases: ["building lasting habits", "preparing for an event", "improving everyday energy", "managing stress"],
            }
          }
          // Generic fallback
          return {
            examples: [`a typical ${topic} task`, `a real-world ${topic} scenario`, `applying ${topic} in your own work`, `troubleshooting a common ${topic} problem`],
            tools: [`the standard ${topic} toolkit`, `industry-recommended resources`, `the techniques covered earlier in the course`, `practical reference materials`],
            subConcepts: [`the core ideas of ${topic}`, `the vocabulary practitioners use`, `the trade-offs you'll weigh`, `the workflow most people follow`],
            useCases: [`day-to-day ${topic} work`, `common ${topic} projects`, `team and individual settings`, `real-world ${topic} applications`],
          }
        }
        const hint = detectDomain()

        type Pattern = "intro" | "setup" | "concept" | "applied" | "pitfall" | "case_study" | "quiz" | "recap" | "advanced" | "project" | "default"

        // Pattern-detect the lecture kind from its title.
        let pattern: Pattern = "default"
        if (/welcome|expect/.test(lt)) pattern = "intro"
        else if (/^(intro|introduction|getting started|what is|why .* matters)\b/.test(lt) || /\bnutshell\b/.test(lt)) pattern = "intro"
        else if (/setup|install|configur|environment|prerequis/.test(lt)) pattern = "setup"
        else if (/key terms|vocabulary|fundamental|core (concept|idea)|principle/.test(lt)) pattern = "concept"
        else if (/hands-on|practice|exercise|walkthrough|worked example|step.by.step|try it/.test(lt)) pattern = "applied"
        else if (/pitfall|mistake|gotcha|common .* error|anti.pattern/.test(lt)) pattern = "pitfall"
        else if (/case stud|real.world|in production|in the wild/.test(lt)) pattern = "case_study"
        else if (/quiz|knowledge check|assessment|test yourself/.test(lt)) pattern = "quiz"
        else if (/recap|summary|review|wrap.up/.test(lt)) pattern = "recap"
        else if (/advanced|deep dive|expert|edge case|scaling|performance/.test(lt)) pattern = "advanced"
        else if (/project|capstone|build .* end.to.end|mini.project/.test(lt)) pattern = "project"

        // Pattern templates now weave in domain-specific examples, tools,
        // and sub-concepts. Output is content-rich (5-7 sentences) so it
        // can be pasted into an AI video generator and produce something
        // useful — not just meta-talk about "this lecture covers X".
        const patternTemplates: Record<Pattern, Array<(t: string, lt: string) => string>> = {
          intro: [
            (t) => `${t} is a practical field used to ${pickOneSeeded(hint.useCases, rng)}. In this lecture we define what ${t} is, why it has become important today, and the kinds of problems practitioners actually solve with it. You'll get a clear introduction to the core ideas — ${pickSeeded(hint.subConcepts, 2, rng).join(", ")} — and see real examples like ${pickSeeded(hint.examples, 2, rng).join(" and ")}. We also cover the typical workflow and the tools you'll meet later, including ${pickSeeded(hint.tools, 2, rng).join(" and ")}. By the end you'll have a clear mental model of ${t} and the vocabulary to navigate the rest of the course confidently.`,
            (t) => `Welcome to ${t}. This lecture answers the foundational question — what is ${t} and why does it matter? We define ${t} simply, then ground it with concrete examples like ${pickOneSeeded(hint.examples, rng)} and ${pickOneSeeded(hint.examples, rng)}. You'll learn the high-level workflow practitioners follow, the most common tools (${pickSeeded(hint.tools, 2, rng).join(", ")}), and the kinds of problems ${t} is best suited for. We finish by mapping out the rest of the course so you know exactly what's coming and why each upcoming lecture matters.`,
          ],
          setup: [
            (t) => `Before doing real ${t} work, you need the right environment. In this lecture we install the essentials — ${pickSeeded(hint.tools, 2, rng).join(", ")} — and verify each piece is configured correctly. You'll run a small end-to-end example, like ${pickOneSeeded(hint.examples, rng)}, to confirm everything works as a sanity check. We also cover the most common installation snags learners hit and the fix for each. By the end you'll have a clean, repeatable ${t} setup you can return to whenever you start a new project.`,
            (t) => `This lecture walks through preparing your ${t} workspace step by step. You'll install ${pickSeeded(hint.tools, 2, rng).join(" and ")}, configure them with sensible defaults, and write a tiny test to make sure everything is talking properly. We also cover the version requirements, common platform-specific gotchas (Windows / macOS / Linux), and how to recover when something inevitably goes wrong. You'll come out with a tested setup and a checklist you can rerun anytime.`,
          ],
          concept: [
            (t) => `Every ${t} practitioner needs a strong grasp of the core concepts. In this lecture we define each one precisely — ${pickSeeded(hint.subConcepts, 3, rng).join(", ")} — and show how they connect to one another. Each idea is paired with a small concrete example so the abstraction stays grounded. We then connect these concepts back to real ${t} work, like ${pickOneSeeded(hint.examples, rng)}. You'll come away with a working glossary and the framework needed to reason about ${t} problems on your own.`,
            (t) => `This lecture lays the conceptual foundation for the rest of the ${t} course. We cover ${pickSeeded(hint.subConcepts, 3, rng).join(", ")} — defining each term, showing how they relate, and pointing at the practical situations where each one shows up. By tying every idea to a concrete example like ${pickOneSeeded(hint.examples, rng)}, the concepts stay actionable, not abstract. By the end you'll have the vocabulary and framework you need to keep up with the more applied lectures ahead.`,
          ],
          applied: [
            (t) => `This is where ${t} becomes real. We work through a complete example — ${pickOneSeeded(hint.examples, rng)} — start to finish, using ${pickSeeded(hint.tools, 2, rng).join(" and ")}. Each step is explained so you understand the reasoning behind every decision, not just the recipe. We pause at the points where most learners get stuck (covering ${pickSeeded(hint.subConcepts, 2, rng).join(" and ")}) and walk through how to think about them. By the end you'll have a repeatable pattern you can apply to similar ${t} problems on your own.`,
            (t) => `Time to put ${t} into practice. In this lecture we tackle ${pickOneSeeded(hint.examples, rng)} step by step, demonstrating the techniques covered earlier and pointing out the small decisions that distinguish good work from sloppy work. We use ${pickSeeded(hint.tools, 2, rng).join(" and ")} throughout, with all code and examples available for you to follow along on your own machine. You'll come away with hands-on muscle memory and a working example you can adapt for your own projects.`,
          ],
          pitfall: [
            (t) => `Most ${t} learners hit the same handful of issues — this lecture surfaces them upfront so you don't have to discover each one painfully. We catalogue the most common mistakes around ${pickSeeded(hint.subConcepts, 2, rng).join(" and ")}, explain the symptoms, the underlying causes, and the techniques experienced practitioners use to avoid them. Each pitfall is paired with a real example like ${pickOneSeeded(hint.examples, rng)} so the lesson sticks. You'll come away with a concrete checklist to run through whenever your ${t} work isn't behaving as expected.`,
            (t) => `Knowing ${t} isn't just about knowing what to do — it's knowing what NOT to do. This lecture covers the anti-patterns and traps that catch most learners: the subtle issues with ${pickOneSeeded(hint.subConcepts, rng)}, the wrong way to use ${pickOneSeeded(hint.tools, rng)}, and the mistakes that compound over time. For each, we show why it fails, what to do instead, and how to spot the warning signs early. Save yourself real frustration in your future ${t} work.`,
          ],
          case_study: [
            (t) => `This lecture analyses a real ${t} case study — ${pickOneSeeded(hint.useCases, rng)} — so you see how the concepts play out outside a textbook. We walk through the original problem, the constraints the team faced, the approach they chose using ${pickSeeded(hint.tools, 2, rng).join(" and ")}, and what worked (or didn't). You'll see the trade-offs they weighed, including ${pickSeeded(hint.subConcepts, 2, rng).join(" vs ")}. By the end you'll have a clearer sense of how ${t} decisions get made under real-world pressure and pattern-recognition you can apply to similar situations.`,
            (t) => `Theory only goes so far — this lecture grounds the ${t} concepts in an actual project. We dissect ${pickOneSeeded(hint.useCases, rng)}: the original requirements, the technical and team constraints, the choices around ${pickOneSeeded(hint.subConcepts, rng)}, and the lessons that emerged. You'll see why some approaches that look good on paper fail in practice and what experienced practitioners would do differently. Expect concrete patterns you can recognise and apply when you face similar ${t} situations.`,
          ],
          quiz: [
            (t) => `A short knowledge check to confirm the ${t} material has stuck before moving on. The questions cover ${pickSeeded(hint.subConcepts, 3, rng).join(", ")} with a mix of recognition (do you know this term?) and reasoning (can you apply it?). Take your time — there's no penalty for trying again, and the goal is for you to spot gaps before they compound. If anything feels shaky, scroll back and re-watch the relevant lecture.`,
          ],
          recap: [
            (t) => `A concise recap of this section's key ${t} ideas — ${pickSeeded(hint.subConcepts, 3, rng).join(", ")} — framed as a quick reference you can return to anytime. We pull the core concepts, the techniques covered, and the trade-offs to keep in mind into one focused summary. Use this as your cheat sheet when you start applying ${t} on your own work, like ${pickOneSeeded(hint.examples, rng)}.`,
          ],
          advanced: [
            (t) => `Now that you have the basics down, this lecture pushes deeper into ${t}. We explore advanced patterns around ${pickSeeded(hint.subConcepts, 2, rng).join(" and ")}, performance and scaling considerations, and the nuanced trade-offs experienced practitioners weigh. Expect dense but rewarding content — every minute should be earning its keep. We use ${pickSeeded(hint.tools, 2, rng).join(" and ")} throughout, with examples drawn from real production scenarios. The payoff is a level of ${t} understanding that separates strong practitioners from the merely competent.`,
            (t) => `This lecture goes beyond the comfortable middle ground in ${t}. You'll see the patterns that emerge once you're working at scale: the failure modes that only surface in production, the trade-offs around ${pickOneSeeded(hint.subConcepts, rng)}, and the techniques that distinguish careful work from quick fixes. We work through a substantial example — ${pickOneSeeded(hint.examples, rng)} — to ground the more abstract material. A challenging but rewarding lecture for anyone serious about ${t}.`,
          ],
          project: [
            (t) => `Time to put everything you've learned about ${t} into practice. This lecture guides you through building a complete project — ${pickOneSeeded(hint.examples, rng)} — end to end. You'll apply the concepts (${pickSeeded(hint.subConcepts, 2, rng).join(", ")}), use ${pickSeeded(hint.tools, 2, rng).join(" and ")}, and produce a real result you can show in a portfolio. Each step is explained so you can reproduce — and adapt — the approach for your own ${t} projects later.`,
            (t) => `In this lecture we build a real ${t} project from scratch. The goal is to integrate everything you've learned into one coherent piece of work: ${pickOneSeeded(hint.useCases, rng)}, using ${pickSeeded(hint.tools, 2, rng).join(" and ")}. We cover the design decisions, common pitfalls, and how to scope the work realistically. You'll finish with a tangible artefact and the confidence that comes from doing the work yourself.`,
          ],
          default: [
            (t, lt) => `This lecture covers ${lt} as part of the broader ${t} course. We define what it is, why it matters, and the role it plays in real ${t} work. You'll see concrete examples like ${pickOneSeeded(hint.examples, rng)}, learn the relevant tools (${pickSeeded(hint.tools, 2, rng).join(", ")}), and connect the topic back to the bigger picture. By the end you'll be ready to apply ${lt} in your own work and recognise where it fits in your overall ${t} skill set.`,
            (t, lt) => `In this lecture we focus on ${lt} and how it shows up in real ${t} work. We define the key ideas — ${pickSeeded(hint.subConcepts, 2, rng).join(" and ")} — walk through a worked example like ${pickOneSeeded(hint.examples, rng)}, and surface the trade-offs experienced practitioners weigh. You'll come away with practical knowledge you can apply immediately, not just theoretical familiarity.`,
          ],
        }
        const tpl = pickOne(patternTemplates[pattern], rng)
        rawText = JSON.stringify({ summary: tpl(topic, lt) })
      } else {
        rawText = JSON.stringify({
          summary: `${topic} is a practical subject area covering the foundations and applied techniques you need to be effective. ${subtitle || `This course walks through the essentials step by step.`}`,
        })
      }
      break
    }
    case "COURSE_SCOPING":
      rawText = JSON.stringify({
        positioning: `A focused, hands-on introduction to ${topic} for working professionals.`,
        differentiators: [
          `Real-world examples drawn from current ${topic} practice`,
          `Self-paced format with concise lectures (5–10 minutes each)`,
          `Quizzes at every section so you know what you've absorbed`,
        ],
      })
      break
    default:
      rawText = JSON.stringify({})
  }

  return {
    rawText,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      model: "mock-local-dev",
      costUsd: 0,
      provider: "mock",
    },
  }
}

/**
 * Core AI call. Reads the academy flag, runs the Agent SDK with a
 * cached system prompt + user turn, records the interaction, returns
 * a draft.
 */
export async function runAiAssist(
  input: AiAssistInput
): Promise<AiAssistResult> {
  const academy = await prisma.academy.findUnique({
    where: { id: input.academyId },
    select: { aiEnabled: true, slug: true },
  })
  if (!academy) throw new Error("Academy not found")
  if (!academy.aiEnabled) {
    throw new Error(
      "AI Assist is disabled for this academy. An Academy Admin can enable it in Settings."
    )
  }

  const systemPrompt = SYSTEM_PROMPTS[input.capability]
  if (!systemPrompt) {
    throw new Error(`No prompt registered for capability ${input.capability}`)
  }

  // Auto-inject course context whenever context.courseId is provided. This
  // keeps every AI Assist call aligned to the same course — generated
  // intended learners, descriptions, outlines, etc. all see the same
  // title/subtitle/existing copy, so they stay consistent. The caller's
  // userPrompt is appended after the injected context.
  const courseId =
    typeof input.context?.courseId === "string"
      ? (input.context.courseId as string)
      : null
  let effectivePrompt = input.userPrompt
  if (courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        subtitle: true,
        description: true,
        learningOutcomes: true,
        targetAudience: true,
      },
    })
    if (course) {
      const existingDesc = (course.description ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200)
      const ctxLines = [
        `Course title: ${course.title}`,
        course.subtitle ? `Subtitle: ${course.subtitle}` : null,
        existingDesc ? `Existing description: ${existingDesc}` : null,
        course.learningOutcomes?.length
          ? `Existing outcomes: ${course.learningOutcomes.slice(0, 5).join("; ")}`
          : null,
        course.targetAudience?.length
          ? `Existing audience: ${course.targetAudience.slice(0, 3).join("; ")}`
          : null,
      ].filter(Boolean)
      // Don't double up if the caller already included Course title.
      const callerHasTitle = /Course title:/i.test(input.userPrompt)
      effectivePrompt = callerHasTitle
        ? input.userPrompt
        : ctxLines.join("\n") + "\n\n" + input.userPrompt
    }
  }

  // Try the real provider chain first. If no credential is available
  // (env var missing AND academy token undecryptable / unset), fall
  // back to the templated mock so AI Assist still produces topic-aware
  // output for the author. The mock is clearly tagged in usage.model so
  // audit logs distinguish real from templated drafts. As soon as a
  // working credential is configured (env var or fresh academy token),
  // this fallback stops firing automatically.
  let result: Awaited<ReturnType<typeof runAgentQuery>>
  try {
    result = await runAgentQuery({
      academyId: input.academyId,
      systemPrompt,
      userPrompt: effectivePrompt,
      model: input.model,
      maxTurns: input.maxTurns ?? 1,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    const isCredentialIssue =
      msg.includes("AI is not configured") ||
      msg.includes("can't be decrypted") ||
      msg.includes("AI Assist is disabled") ||
      msg.toLowerCase().includes("openai_api_key")
    if (!isCredentialIssue) throw e
    console.warn("[ai.assist] credential unavailable — falling back to template", {
      capability: input.capability,
      reason: msg,
    })
    result = buildMockResponse(input.capability, effectivePrompt)
  }

  const { rawText, usage } = result

  const parsed = tryParseJson(rawText)

  const promptHash = sha(
    `${input.capability}::${systemPrompt}::${input.userPrompt}`
  )
  const outputHash = sha(rawText)

  const interaction = await prisma.aiInteraction.create({
    data: {
      academyId: input.academyId,
      userId: input.userId,
      capability: input.capability,
      promptHash,
      outputHash,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      model: `${usage.provider}:${usage.model}`,
      contextJson:
        (input.context as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  })

  await audit({
    action: "ai.assist",
    resourceType: "aiInteraction",
    resourceId: interaction.id,
    userId: input.userId,
    academyId: input.academyId,
    metadata: {
      capability: input.capability,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      costUsd: usage.costUsd,
    },
  })

  return {
    interactionId: interaction.id,
    capability: input.capability,
    rawText,
    parsed,
    usage,
    approvalRequired: true,
  }
}

/**
 * Mark a draft as author-approved. Per spec §8.1, only approved drafts
 * should be surfaced as canonical course content; unapproved rows stay
 * as audit history.
 */
export async function approveAiInteraction(
  interactionId: string,
  approverUserId: string
): Promise<void> {
  const interaction = await prisma.aiInteraction.findUnique({
    where: { id: interactionId },
    select: {
      id: true,
      academyId: true,
      approved: true,
      capability: true,
    },
  })
  if (!interaction) throw new Error("Interaction not found")
  if (interaction.approved) return

  await prisma.aiInteraction.update({
    where: { id: interactionId },
    data: { approved: true, approvedAt: new Date() },
  })
  await audit({
    action: "ai.approve",
    resourceType: "aiInteraction",
    resourceId: interaction.id,
    userId: approverUserId,
    academyId: interaction.academyId,
    metadata: { capability: interaction.capability },
  })
}
