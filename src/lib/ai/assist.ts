import { createHash } from "node:crypto"
import { AiCapability, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts"
import { runAgentQuery, tryParseJson } from "@/lib/ai/agent"

/**
 * Phase 7 — central AI assist service (spec §8).
 *
 *   - All capabilities run through `runAgentQuery()` from
 *     `@anthropic-ai/claude-agent-sdk` so the same per-tenant Claude
 *     credential, audit trail, and chokepoint applies to every draft.
 *   - The single shared system prompt per capability stays stable across
 *     calls so the model's prompt cache (5-min TTL prefix match) keeps
 *     warm. Volatile content (course title, existing copy) is sent in the
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
  /** Override model (default claude-opus-4-7). */
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

/** Pick `n` distinct items from an array at random. */
function pick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(n, arr.length))
}

/** One random pick from an array (used for sentence variation). */
function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Local-dev mock for when ANTHROPIC_API_KEY is missing. Generates a
 * plausible templated response based on the course topic extracted from
 * the user prompt. Allows the editor flow to be exercised without a
 * real Anthropic key. Production always uses the real model.
 */
function buildMockResponse(
  capability: AiCapability,
  userPrompt: string
): { rawText: string; usage: { inputTokens: number; outputTokens: number; cachedTokens: number; model: string; costUsd: number } } {
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
      const wantedObjectives = 4 + Math.floor(Math.random() * 2) // 4 or 5
      // Always include focus-driven objectives first, then top up from
      // the generic pool. Guarantees the saved description is reflected
      // in the outcomes the learner sees.
      const remainingCount = Math.max(0, wantedObjectives - focusObjectives.length)
      const genericObjectives = pick(
        objectivePool.filter((o) => !focusObjectives.includes(o)),
        remainingCount
      )
      const finalObjectives = [
        ...focusObjectives.slice(0, wantedObjectives),
        ...genericObjectives,
      ].slice(0, wantedObjectives)
      rawText = JSON.stringify({
        objectives: finalObjectives,
        requirements: pick(requirementPool, 1 + Math.floor(Math.random() * 2)),
        audience: pick(audiencePool, 2 + Math.floor(Math.random() * 2)),
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
                sectionCount - focusSectionTitles.length
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
          summary: pickOne(summaryPool)(sectionTitle),
          lectures: pick(pool, lecturesPer).map((tpl) => ({
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
        pickOne(heroOpeners),
        spacer,
        `<p><strong>What you'll learn</strong></p>`,
        pickOne(learnSections),
        spacer,
        `<p><strong>How the course is structured</strong></p>`,
        pickOne(structureSections),
        spacer,
        `<p><strong>Who this course is for</strong></p>`,
        pickOne(audienceSections),
        spacer,
        `<p><strong>What you'll walk away with</strong></p>`,
        pickOne(takeawayLists),
        spacer,
        pickOne(closers),
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
      const builtSubtitle = subtitle || pickOne(subtitlePool)
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
    case "SUMMARISE":
      rawText = JSON.stringify({
        summary: `${topic} is a practical subject area covering the foundations and applied techniques you need to be effective. ${subtitle || `This course walks through the essentials step by step.`}`,
      })
      break
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

  // Try the real Claude path first. If no credential is available
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
      msg.toLowerCase().includes("anthropic_api_key")
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
      model: usage.model,
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
