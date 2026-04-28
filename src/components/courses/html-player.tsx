"use client"

import { Button } from "@/components/ui/button"
import { CheckCircle, Code2 } from "lucide-react"

export interface HtmlPayload {
  html: string
}

interface Props {
  payload: HtmlPayload
  title: string
  alreadyCompleted: boolean
  onMarkComplete: () => void
}

export function HtmlPlayer({ payload, title, alreadyCompleted, onMarkComplete }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Code2 className="h-4 w-4" />
          <span className="font-medium">{title}</span>
        </div>
        {!alreadyCompleted && (
          <Button size="sm" onClick={onMarkComplete}>
            <CheckCircle className="h-4 w-4 mr-1.5" />
            Mark complete
          </Button>
        )}
      </div>
      <div className="flex-1 bg-white">
        <iframe
          title={title}
          sandbox="allow-scripts"
          srcDoc={payload.html}
          className="w-full h-full min-h-[480px] border-0"
        />
      </div>
    </div>
  )
}
