import { Canvas } from "@react-three/fiber"
import { Container, Fullscreen, Text } from "@react-three/uikit"
import { OrbitControls } from "@react-three/drei"
import { inconsolata } from "@pmndrs/msdfonts"
import { structuredPatch, type Hunk } from "diff"
import { useScreenBreakpoint } from "./hooks"
import { createHighlighter, type BundledLanguage, type GrammarState, type ThemedToken } from "shiki"

// Initialize syntax highlighter
const theme = "github-dark-default"
const highlighter = await createHighlighter({
  themes: [theme],
  langs: [
    "javascript",
    "typescript",
    "tsx",
    "jsx",
    "json",
    "markdown",
    "html",
    "css",
    "python",
    "rust",
    "go",
    "java",
    "c",
    "cpp",
    "yaml",
    "toml",
    "bash",
    "sh",
    "sql",
  ],
})

function detectLanguage(filePath: string): BundledLanguage {
  const ext = filePath.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts":
      return "typescript"
    case "tsx":
      return "tsx"
    case "jsx":
      return "jsx"
    case "js":
    case "mjs":
    case "cjs":
      return "javascript"
    case "json":
      return "json"
    case "md":
    case "mdx":
    case "markdown":
      return "markdown"
    case "html":
    case "htm":
      return "html"
    case "css":
      return "css"
    case "py":
      return "python"
    case "rs":
      return "rust"
    case "go":
      return "go"
    case "java":
      return "java"
    case "c":
    case "h":
      return "c"
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hxx":
      return "cpp"
    case "yaml":
    case "yml":
      return "yaml"
    case "toml":
      return "toml"
    case "sh":
      return "sh"
    case "bash":
      return "bash"
    case "sql":
      return "sql"
    default:
      return "javascript"
  }
}

function renderHighlightedTokens(tokens: ThemedToken[], fontSize: number) {
  return tokens.map((token, tokenIdx) => {
    const color = token.color || "#e5e5e5"
    return (

      <Text key={tokenIdx}  fontSize={fontSize} color={color} flexShrink={0} whiteSpace="pre" >
        {token.content}
      </Text>
    )
  })
}

// Import example content from the parent folder
const beforeContent = `import React from 'react'
import PropTypes from 'prop-types'
import { cn } from '../utils/cn'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Loader2, AlertCircle } from 'lucide-react'

// Button component with enhanced features
function Button({
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  leftIcon = null,
  rightIcon = null,
  className,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  ariaLabel,
  tabIndex = 0,
  fullWidth = false,
  ...props
}) {
  const [isPressed, setIsPressed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement === buttonRef.current) {
          e.preventDefault()
          onClick?.(e)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClick])

  const buttonRef = React.useRef(null)

  const handleClick = (e) => {
    if (disabled || loading) return

    // Add ripple effect
    const button = buttonRef.current
    const rect = button.getBoundingClientRect()
    const ripple = document.createElement('span')
    const size = Math.max(rect.width, rect.height)
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2

    ripple.style.cssText = \`
      position: absolute;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.2;
      width: \${size}px;
      height: \${size}px;
      left: \${x}px;
      top: \${y}px;
      animation: ripple 600ms ease-out;
    \`

    button.appendChild(ripple)
    setTimeout(() => ripple.remove(), 600)

    onClick?.(e)
  }

  return (
    <motion.button
      ref={buttonRef}
      className="button"
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {children}
    </motion.button>
  )
}

export default Button`

const afterContent = `import React from 'react'
import PropTypes from 'prop-types'
import { cn } from '../utils/cn'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Loader2, AlertCircle, Check } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { analytics } from '../utils/analytics'

// Enhanced Button component with new features
function Button({
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  leftIcon = null,
  rightIcon = null,
  className,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ariaLabel,
  ariaPressed,
  ariaExpanded,
  tabIndex = 0,
  fullWidth = false,
  rounded = true,
  tooltip = null,
  tooltipPosition = "top",
  successMessage = "Success!",
  errorMessage = "Error occurred",
  analyticsEvent = null,
  hapticFeedback = true,
  soundEnabled = true,
  ...props
}) {
  const [isPressed, setIsPressed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showError, setShowError] = useState(false)
  const [ripples, setRipples] = useState([])

  const { theme, isDarkMode } = useTheme()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const buttonRef = React.useRef(null)
  const audioRef = React.useRef(null)

  // Initialize audio for button clicks
  useEffect(() => {
    if (soundEnabled && !prefersReducedMotion) {
      audioRef.current = new Audio('/sounds/button-click.mp3')
      audioRef.current.volume = 0.3
    }

    return () => {
      if (audioRef.current) {
        audioRef.current = null
      }
    }
  }, [soundEnabled, prefersReducedMotion])

  // Handle keyboard navigation with better accessibility
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && isFocused) {
        e.preventDefault()
        setIsPressed(true)
        handleClick(e)
      }
    }

    const handleKeyUp = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && isFocused) {
        setIsPressed(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isFocused, onClick])

  // Memoized click handler
  const handleClick = useCallback(async (e) => {
    if (disabled || loading) return

    // Play click sound
    if (soundEnabled && audioRef.current && !prefersReducedMotion) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }

    // Haptic feedback for mobile
    if (hapticFeedback && isMobile && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }

    // Execute click handler
    try {
      const result = onClick?.(e)
      if (result instanceof Promise) {
        await result
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 2000)
      }
    } catch (error) {
      console.error('Button click error:', error)
      setShowError(true)
      setTimeout(() => setShowError(false), 2000)
    }
  }, [disabled, loading, onClick, soundEnabled, hapticFeedback, isMobile, analyticsEvent, variant, size, children, prefersReducedMotion])

  return (
    <motion.button
      ref={buttonRef}
      className="button enhanced"
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {children}
    </motion.button>
  )
}

export default Button`

const filePath = "/src/components/Button.tsx"

const patch = structuredPatch(filePath, filePath, beforeContent, afterContent, undefined, undefined, { context: 3, ignoreWhitespace: true })
const hunks = patch.hunks

const em = 16

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 50 }} style={{ height: "100vh", touchAction: "none" }} gl={{ localClippingEnabled: true }}>
      <color attach="background" args={["#0a0a0a"]} />
      <OrbitControls enableRotate={false} enableZoom={false} enablePan={false} />
      <ambientLight intensity={1} />
      <pointLight position={[10, 10, 10]} />

      <Fullscreen flexDirection="column" padding={10} gap={2} backgroundColor="#0f0f0f" fontFamilies={{ inconsolata }}>
        <Container padding={8} backgroundColor="#1a1a1a" flexShrink={0}>
          <Text fontSize={20} color="#ffffff">
            {filePath}
          </Text>
        </Container>

        <Container flexGrow={1} flexShrink={0} overflow="scroll" backgroundColor="#0a0a0a" scrollbarColor="#444444">
          <Container flexDirection="column" gap={4} flexShrink={0} width="100%">
            {hunks.map((hunk, i) => (
              <DiffHunk key={i} hunk={hunk} />
            ))}
          </Container>
        </Container>
      </Fullscreen>
    </Canvas>
  )
}

function DiffHunk({ hunk }: { hunk: Hunk }) {
  const breakpoint = useScreenBreakpoint()
  const useSplitView = breakpoint === "md" || breakpoint === "lg" || breakpoint === "xl" || breakpoint === "2xl"

  // Process lines
  const processedLines = hunk.lines.map((code) => {
    if (code.startsWith("+")) {
      return { code: code.slice(1), type: "add" }
    }
    if (code.startsWith("-")) {
      return { code: code.slice(1), type: "remove" }
    }
    return { code: code.slice(1), type: "nochange" }
  })

  // Tokenize code with syntax highlighting
  const lang = detectLanguage(filePath)

  // Tokenize "before" state (removed/unchanged lines)
  let beforeState: GrammarState | undefined
  const beforeTokens: (ThemedToken[] | null)[] = []

  for (const line of processedLines) {
    if (line.type === "remove" || line.type === "nochange") {
      const result = highlighter.codeToTokens(line.code, {
        lang,
        theme,
        grammarState: beforeState,
      })
      const tokens = result.tokens[0] || null
      beforeTokens.push(tokens)
      beforeState = highlighter.getLastGrammarState(result.tokens)
    } else {
      beforeTokens.push(null)
    }
  }

  // Tokenize "after" state (added/unchanged lines)
  let afterState: GrammarState | undefined
  const afterTokens: (ThemedToken[] | null)[] = []

  for (const line of processedLines) {
    if (line.type === "add" || line.type === "nochange") {
      const result = highlighter.codeToTokens(line.code, {
        lang,
        theme,
        grammarState: afterState,
      })
      const tokens = result.tokens[0] || null
      afterTokens.push(tokens)
      afterState = highlighter.getLastGrammarState(result.tokens)
    } else {
      afterTokens.push(null)
    }
  }

  if (useSplitView) {
    // Build split lines structure (for larger screens)
    const splitLines: Array<{
      left: { code: string; lineNumber: number | null; type: string; originalIdx: number | null }
      right: { code: string; lineNumber: number | null; type: string; originalIdx: number | null }
    }> = []

    let oldLineNum = hunk.oldStart
    let newLineNum = hunk.newStart
    let i = 0

    while (i < processedLines.length) {
      const line = processedLines[i]
      if (!line) break

      if (line.type === "remove") {
        // Collect consecutive removes
        const removes: Array<{ code: string; lineNum: number; idx: number }> = []
        while (i < processedLines.length && processedLines[i]?.type === "remove") {
          removes.push({ code: processedLines[i]!.code, lineNum: oldLineNum++, idx: i })
          i++
        }

        // Collect consecutive adds that follow
        const adds: Array<{ code: string; lineNum: number; idx: number }> = []
        while (i < processedLines.length && processedLines[i]?.type === "add") {
          adds.push({ code: processedLines[i]!.code, lineNum: newLineNum++, idx: i })
          i++
        }

        // Pair them up
        const maxLength = Math.max(removes.length, adds.length)
        for (let j = 0; j < maxLength; j++) {
          splitLines.push({
            left: removes[j]
              ? { code: removes[j].code, lineNumber: removes[j].lineNum, type: "remove", originalIdx: removes[j].idx }
              : { code: "", lineNumber: null, type: "empty", originalIdx: null },
            right: adds[j]
              ? { code: adds[j].code, lineNumber: adds[j].lineNum, type: "add", originalIdx: adds[j].idx }
              : { code: "", lineNumber: null, type: "empty", originalIdx: null },
          })
        }
      } else if (line.type === "add") {
        // Unpaired add
        splitLines.push({
          left: { code: "", lineNumber: null, type: "empty", originalIdx: null },
          right: { code: line.code, lineNumber: newLineNum++, type: "add", originalIdx: i },
        })
        i++
      } else {
        // Unchanged line
        splitLines.push({
          left: { code: line.code, lineNumber: oldLineNum++, type: "nochange", originalIdx: i },
          right: { code: line.code, lineNumber: newLineNum++, type: "nochange", originalIdx: i },
        })
        i++
      }
    }

    // Split view for larger screens
    return (
      <Container fontFamily={"inconsolata"} flexDirection="column" gap={0} flexShrink={0} width="100%">
        {splitLines.map((splitLine, idx) => {
          // Get tokens for left line using original index
          const leftTokens = splitLine.left.originalIdx !== null ? beforeTokens[splitLine.left.originalIdx] : null

          // Get tokens for right line using original index
          const rightTokens = splitLine.right.originalIdx !== null ? afterTokens[splitLine.right.originalIdx] : null

          return (
            <Container key={idx} flexDirection="row" flexShrink={0} width="100%" alignItems="flex-start">
              {/* Left side (old/removed) */}
              <Container flexDirection="row" width="50%" flexShrink={0} alignItems="stretch">
                <Container
                  width={em * 3}
                  flexShrink={0}
                  backgroundColor={splitLine.left.type === "remove" ? "#3a0a0a" : "#1a1a1a"}
                  paddingX={4}
                  paddingY={2}
                >
                  <Text fontSize={em} color={splitLine.left.type === "remove" ? "#ff6666" : "#666666"} flexShrink={0}>
                    {splitLine.left.lineNumber !== null ? splitLine.left.lineNumber.toString().padStart(4, " ") : "    "}
                  </Text>
                </Container>
                <Container
                  flexGrow={1}
                  flexShrink={0}
                  backgroundColor={splitLine.left.type === "remove" ? "#2a0000" : "#0f0f0f"}
                  paddingX={4}
                  paddingY={2}
                  overflow="hidden"
                  flexDirection="row"
                >
                  {leftTokens && leftTokens.length > 0 ? (
                    renderHighlightedTokens(leftTokens, em)
                  ) : (
                    <Text fontSize={em} color="#e5e5e5" whiteSpace="pre">
                      {splitLine.left.code || " "}
                    </Text>
                  )}
                </Container>
              </Container>

              {/* Right side (new/added) */}
              <Container flexDirection="row" width="50%" flexShrink={0} alignItems="stretch">
                <Container
                  width={em * 3}
                  flexShrink={0}
                  backgroundColor={splitLine.right.type === "add" ? "#0a3a0a" : "#1a1a1a"}
                  paddingX={4}
                  paddingY={2}
                >
                  <Text fontSize={em} color={splitLine.right.type === "add" ? "#66ff66" : "#666666"} flexShrink={0}>
                    {splitLine.right.lineNumber !== null ? splitLine.right.lineNumber.toString().padStart(4, " ") : "    "}
                  </Text>
                </Container>
                <Container
                  flexGrow={1}
                  flexShrink={0}
                  backgroundColor={splitLine.right.type === "add" ? "#002a00" : "#0f0f0f"}
                  paddingX={4}
                  paddingY={2}
                  overflow="hidden"
                  flexDirection="row"
                >
                  {rightTokens && rightTokens.length > 0 ? (
                    renderHighlightedTokens(rightTokens, em)
                  ) : (
                    <Text fontSize={em} color="#e5e5e5" whiteSpace="pre">
                      {splitLine.right.code || " "}
                    </Text>
                  )}
                </Container>
              </Container>
            </Container>
          )
        })}
      </Container>
    )
  }

  // Build unified lines structure (for smaller screens)
  const unifiedLines: Array<{
    code: string
    lineNumber: number
    type: string
  }> = []

  let oldLineNum = hunk.oldStart
  let newLineNum = hunk.newStart

  for (const line of processedLines) {
    if (line.type === "remove") {
      unifiedLines.push({
        code: line.code,
        lineNumber: oldLineNum++,
        type: "remove",
      })
    } else if (line.type === "add") {
      unifiedLines.push({
        code: line.code,
        lineNumber: newLineNum++,
        type: "add",
      })
    } else {
      unifiedLines.push({
        code: line.code,
        lineNumber: newLineNum++,
        type: "nochange",
      })
      oldLineNum++
    }
  }

  // Unified view for smaller screens
  return (
    <Container fontFamily={"inconsolata"} flexDirection="column" gap={0} flexShrink={0} width="100%">
      {unifiedLines.map((line, idx) => {
        // Get the original line index to access tokens
        let originalIdx = 0
        let count = 0
        for (let i = 0; i < processedLines.length; i++) {
          if (count === idx) {
            originalIdx = i
            break
          }
          count++
        }

        // Determine which tokens to use based on line type
        const tokens =
          line.type === "remove"
            ? beforeTokens[originalIdx]
            : line.type === "add" || line.type === "nochange"
              ? afterTokens[originalIdx]
              : null

        return (
          <Container key={idx} flexDirection="row" flexShrink={0} width="100%" alignItems="stretch">
            <Container
              width={em * 3}
              flexShrink={0}
              backgroundColor={line.type === "add" ? "#0a3a0a" : line.type === "remove" ? "#3a0a0a" : "#1a1a1a"}
              paddingX={4}
              paddingY={2}
            >
              <Text fontSize={em} color={line.type === "add" ? "#66ff66" : line.type === "remove" ? "#ff6666" : "#666666"} flexShrink={0}>
                {line.lineNumber.toString().padStart(4, " ")}
              </Text>
            </Container>
            <Container
              flexGrow={1}
              flexShrink={0}
              backgroundColor={line.type === "add" ? "#002a00" : line.type === "remove" ? "#2a0000" : "#0f0f0f"}
              paddingX={4}
              paddingY={2}
              overflow="hidden"
              flexDirection="row"
            >
              {tokens && tokens.length > 0 ? (
                renderHighlightedTokens(tokens, em)
              ) : (
                <Text fontSize={em} color="#e5e5e5" whiteSpace="pre">
                  {line.code || " "}
                </Text>
              )}
            </Container>
          </Container>
        )
      })}
    </Container>
  )
}
