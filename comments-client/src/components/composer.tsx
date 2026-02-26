// Composer — text input for writing a new comment or reply.
// Simple textarea with submit on Enter, Shift+Enter for newline.

import { useState, useRef, type KeyboardEvent, type FormEvent } from "react"

export interface ComposerProps {
  /** Called when the user submits a comment */
  onSubmit: (body: string) => void
  /** Called when the user cancels (Escape key) */
  onCancel?: () => void
  /** Placeholder text */
  placeholder?: string
  /** Auto-focus the textarea on mount */
  autoFocus?: boolean
}

export function Composer({
  onSubmit,
  onCancel,
  placeholder = "Write a comment...",
  autoFocus = false,
}: ComposerProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if (e.key === "Escape" && onCancel) {
      onCancel()
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submit()
  }

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setValue("")
  }

  return (
    <form className="cw-composer" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="cw-composer-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
      />
      <button
        type="submit"
        className="cw-composer-submit"
        disabled={!value.trim()}
        aria-label="Send comment"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M14.5 1.5L7 9M14.5 1.5L10 14.5L7 9M14.5 1.5L1.5 6L7 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  )
}
