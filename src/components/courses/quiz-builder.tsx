"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  QUIZ_QUESTION_TYPES,
  MAX_QUIZ_OPTIONS,
  MIN_QUIZ_OPTIONS,
  MAX_QUIZ_QUESTIONS,
} from "@/lib/constants"
import type {
  QuizData,
  QuizQuestion,
  QuizOption,
  QuizQuestionType,
} from "@/types"

// ─── Helpers ──────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID()
}

function createDefaultOption(): QuizOption {
  return { id: generateId(), text: "", isCorrect: false }
}

function createDefaultQuestion(): QuizQuestion {
  return {
    id: generateId(),
    type: "multiple_choice",
    text: "",
    options: [createDefaultOption(), createDefaultOption()],
    points: 1,
  }
}

function createDefaultQuizData(): QuizData {
  return { version: 1, questions: [createDefaultQuestion()] }
}

function parseQuizContent(content: string): QuizData {
  if (!content || !content.trim()) return createDefaultQuizData()
  try {
    const parsed = JSON.parse(content)
    if (parsed.version === 1 && Array.isArray(parsed.questions)) {
      return parsed as QuizData
    }
  } catch {
    // Not valid JSON — old format or empty
  }
  return createDefaultQuizData()
}

// ─── OptionRow ────────────────────────────────────────────

interface OptionRowProps {
  option: QuizOption
  questionType: QuizQuestionType
  canDelete: boolean
  disabled?: boolean
  onTextChange: (text: string) => void
  onCorrectToggle: () => void
  onDelete: () => void
}

function OptionRow({
  option,
  questionType,
  canDelete,
  disabled,
  onTextChange,
  onCorrectToggle,
  onDelete,
}: OptionRowProps) {
  return (
    <div className="flex items-center gap-2 group">
      <Checkbox
        checked={option.isCorrect}
        onCheckedChange={onCorrectToggle}
        disabled={disabled}
        className={cn(
          "shrink-0 border-foreground/40 data-[state=checked]:border-primary",
          questionType === "multiple_choice" && "rounded-full"
        )}
      />
      <Input
        value={option.text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Option text..."
        disabled={disabled}
        className="h-8 text-sm border-foreground/40 focus-visible:border-foreground/60"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        disabled={disabled || !canDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── QuestionCard ─────────────────────────────────────────

interface QuestionCardProps {
  question: QuizQuestion
  index: number
  total: number
  disabled?: boolean
  onUpdate: (question: QuizQuestion) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function QuestionCard({
  question,
  index,
  total,
  disabled,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: QuestionCardProps) {
  const [showExplanation, setShowExplanation] = useState(
    !!question.explanation
  )

  function updateField<K extends keyof QuizQuestion>(
    field: K,
    value: QuizQuestion[K]
  ) {
    onUpdate({ ...question, [field]: value })
  }

  function handleTypeChange(newType: QuizQuestionType) {
    const updated = { ...question, type: newType }

    if (newType === "open_ended") {
      updated.options = []
    } else if (newType === "true_false") {
      // Spec §7.3: True/False is exactly two options with fixed labels;
      // the author only picks which one is correct.
      updated.options = [
        { id: generateId(), text: "True", isCorrect: true },
        { id: generateId(), text: "False", isCorrect: false },
      ]
    } else if (newType === "drag_drop") {
      // Seed with 3 items in authored order — authors should shuffle the
      // list before showing, but we preserve correctOrder as the truth.
      const base =
        question.type === "open_ended"
          ? [createDefaultOption(), createDefaultOption(), createDefaultOption()]
          : question.options.length > 0
          ? question.options
          : [createDefaultOption(), createDefaultOption(), createDefaultOption()]
      updated.options = base.map((o, idx) => ({
        ...o,
        isCorrect: true, // not meaningful for drag-drop, but keeps validation green
        correctOrder: idx,
      }))
    } else if (question.type === "open_ended") {
      updated.options = [createDefaultOption(), createDefaultOption()]
    } else if (question.type === "drag_drop") {
      // Dropping drag_drop ordering; strip correctOrder.
      updated.options = question.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: false,
      }))
    }

    // Reset correctness when switching between selection types
    const selectTypes: QuizQuestionType[] = [
      "multiple_choice",
      "multiple_select",
      "true_false",
    ]
    if (
      newType !== question.type &&
      selectTypes.includes(newType) &&
      selectTypes.includes(question.type) &&
      newType !== "true_false" // we already set correctness above
    ) {
      updated.options = updated.options.map((o) => ({
        ...o,
        isCorrect: false,
      }))
    }

    onUpdate(updated)
  }

  function handleCorrectToggle(optionId: string) {
    if (
      question.type === "multiple_choice" ||
      question.type === "true_false"
    ) {
      // Radio behavior: exactly one correct
      const updated = question.options.map((o) => ({
        ...o,
        isCorrect: o.id === optionId,
      }))
      updateField("options", updated)
    } else {
      // Checkbox behavior: toggle individual (multiple_select, drag_drop)
      const updated = question.options.map((o) =>
        o.id === optionId ? { ...o, isCorrect: !o.isCorrect } : o
      )
      updateField("options", updated)
    }
  }

  function handleOptionTextChange(optionId: string, text: string) {
    const updated = question.options.map((o) =>
      o.id === optionId ? { ...o, text } : o
    )
    updateField("options", updated)
  }

  function handleDeleteOption(optionId: string) {
    updateField(
      "options",
      question.options.filter((o) => o.id !== optionId)
    )
  }

  function handleAddOption() {
    updateField("options", [...question.options, createDefaultOption()])
  }

  const typeLabel =
    QUIZ_QUESTION_TYPES.find((t) => t.value === question.type)?.label ??
    question.type

  return (
    <Card className="overflow-hidden border-foreground/30 shadow-sm">
      <CardContent className="p-4 space-y-3">
        {/* Header: number, type select, delete */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="shrink-0 text-xs font-mono">
            Q{index + 1}
          </Badge>
          <Select
            value={question.type}
            onValueChange={(v) => handleTypeChange(v as QuizQuestionType)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUIZ_QUESTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onMoveUp}
              disabled={disabled || index === 0}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onMoveDown}
              disabled={disabled || index === total - 1}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Question text */}
        <Input
          value={question.text}
          onChange={(e) => updateField("text", e.target.value)}
          placeholder="Enter your question..."
          disabled={disabled}
          className="text-sm border-foreground/40 focus-visible:border-foreground/60"
        />

        {/* Options (MC and MS only) */}
        {question.type !== "open_ended" && (
          <div className="space-y-2 pl-1">
            <Label className="text-xs text-muted-foreground">
              {question.type === "multiple_choice"
                ? "Select the correct answer"
                : "Select all correct answers"}
            </Label>
            {question.options.map((option) => (
              <OptionRow
                key={option.id}
                option={option}
                questionType={question.type}
                canDelete={question.options.length > MIN_QUIZ_OPTIONS}
                disabled={disabled}
                onTextChange={(text) =>
                  handleOptionTextChange(option.id, text)
                }
                onCorrectToggle={() => handleCorrectToggle(option.id)}
                onDelete={() => handleDeleteOption(option.id)}
              />
            ))}
            {question.options.length < MAX_QUIZ_OPTIONS && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7"
                onClick={handleAddOption}
                disabled={disabled}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Option
              </Button>
            )}
          </div>
        )}

        {question.type === "open_ended" && (
          <p className="text-xs text-muted-foreground italic pl-1">
            Students will provide a free-text response. No auto-grading for this
            question type.
          </p>
        )}

        <Separator />

        {/* Footer: explanation toggle + points */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowExplanation(!showExplanation)}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform",
                showExplanation && "rotate-90"
              )}
            />
            Explanation
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Points:</Label>
            <Input
              type="number"
              min={1}
              value={question.points}
              onChange={(e) =>
                updateField("points", Math.max(1, parseInt(e.target.value) || 1))
              }
              disabled={disabled}
              className="h-7 w-16 text-xs text-center border-foreground/40 focus-visible:border-foreground/60"
            />
          </div>
        </div>

        {showExplanation && (
          <Textarea
            value={question.explanation || ""}
            onChange={(e) => updateField("explanation", e.target.value)}
            placeholder="Explain the correct answer (shown after submission)..."
            disabled={disabled}
            rows={2}
            className="text-sm"
          />
        )}
      </CardContent>
    </Card>
  )
}

// ─── QuizBuilder (main export) ────────────────────────────

interface QuizBuilderProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function QuizBuilder({ value, onChange, disabled }: QuizBuilderProps) {
  const [quiz, setQuiz] = useState<QuizData>(() => parseQuizContent(value))
  const [showSettings, setShowSettings] = useState(!!quiz.passingScore)

  // Sync outward whenever quiz state changes
  const syncToParent = useCallback(
    (updated: QuizData) => {
      setQuiz(updated)
      onChange(JSON.stringify(updated))
    },
    [onChange]
  )

  // Re-parse if the value prop changes externally (e.g. dialog reopened)
  useEffect(() => {
    setQuiz(parseQuizContent(value))
  }, [value])

  function updateQuestion(index: number, question: QuizQuestion) {
    const updated = { ...quiz, questions: [...quiz.questions] }
    updated.questions[index] = question
    syncToParent(updated)
  }

  function deleteQuestion(index: number) {
    const updated = {
      ...quiz,
      questions: quiz.questions.filter((_, i) => i !== index),
    }
    syncToParent(updated)
  }

  function addQuestion() {
    syncToParent({
      ...quiz,
      questions: [...quiz.questions, createDefaultQuestion()],
    })
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= quiz.questions.length) return
    const questions = [...quiz.questions]
    ;[questions[index], questions[target]] = [
      questions[target],
      questions[index],
    ]
    syncToParent({ ...quiz, questions })
  }

  function updatePassingScore(score: number | undefined) {
    syncToParent({ ...quiz, passingScore: score })
  }

  const totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0)

  return (
    <div className="space-y-3">
      {/* Settings */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowSettings(!showSettings)}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            showSettings && "rotate-90"
          )}
        />
        Quiz Settings
      </button>

      {showSettings && (
        <div className="flex items-center gap-2 pl-5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            Passing Score:
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={quiz.passingScore ?? ""}
            onChange={(e) => {
              const v = e.target.value
              updatePassingScore(v ? Math.min(100, Math.max(0, parseInt(v))) : undefined)
            }}
            placeholder="Optional"
            disabled={disabled}
            className="h-7 w-20 text-xs border-foreground/40 focus-visible:border-foreground/60"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {quiz.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            total={quiz.questions.length}
            disabled={disabled}
            onUpdate={(q) => updateQuestion(index, q)}
            onDelete={() => deleteQuestion(index)}
            onMoveUp={() => moveQuestion(index, -1)}
            onMoveDown={() => moveQuestion(index, 1)}
          />
        ))}
      </div>

      {/* Add question */}
      {quiz.questions.length < MAX_QUIZ_QUESTIONS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={addQuestion}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Question
        </Button>
      )}

      {/* Summary */}
      <p className="text-xs text-muted-foreground text-center">
        {quiz.questions.length} question{quiz.questions.length !== 1 ? "s" : ""}{" "}
        &middot; {totalPoints} point{totalPoints !== 1 ? "s" : ""} total
        {quiz.passingScore != null && ` \u00b7 Pass: ${quiz.passingScore}%`}
      </p>
    </div>
  )
}
