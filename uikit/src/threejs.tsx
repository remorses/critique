import { Canvas } from "@react-three/fiber"
import { Container, Fullscreen, Text } from "@react-three/uikit"
import { OrbitControls } from "@react-three/drei"
import { inconsolata } from "@pmndrs/msdfonts"
import { structuredPatch, type Hunk } from "diff"

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

        <Container flexGrow={1} flexShrink={1} overflow="scroll" backgroundColor="#0a0a0a" scrollbarColor="#444444">
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
  // Process lines and build split view
  const processedLines = hunk.lines.map((code) => {
    if (code.startsWith("+")) {
      return { code: code.slice(1), type: "add" }
    }
    if (code.startsWith("-")) {
      return { code: code.slice(1), type: "remove" }
    }
    return { code: code.slice(1), type: "nochange" }
  })

  // Build split lines structure
  const splitLines: Array<{
    left: { code: string; lineNumber: number | null; type: string }
    right: { code: string; lineNumber: number | null; type: string }
  }> = []

  let oldLineNum = hunk.oldStart
  let newLineNum = hunk.newStart
  let i = 0

  while (i < processedLines.length) {
    const line = processedLines[i]
    if (!line) break

    if (line.type === "remove") {
      // Collect consecutive removes
      const removes: Array<{ code: string; lineNum: number }> = []
      while (i < processedLines.length && processedLines[i]?.type === "remove") {
        removes.push({ code: processedLines[i]!.code, lineNum: oldLineNum++ })
        i++
      }

      // Collect consecutive adds that follow
      const adds: Array<{ code: string; lineNum: number }> = []
      while (i < processedLines.length && processedLines[i]?.type === "add") {
        adds.push({ code: processedLines[i]!.code, lineNum: newLineNum++ })
        i++
      }

      // Pair them up
      const maxLength = Math.max(removes.length, adds.length)
      for (let j = 0; j < maxLength; j++) {
        splitLines.push({
          left: removes[j]
            ? { code: removes[j].code, lineNumber: removes[j].lineNum, type: "remove" }
            : { code: "", lineNumber: null, type: "empty" },
          right: adds[j] ? { code: adds[j].code, lineNumber: adds[j].lineNum, type: "add" } : { code: "", lineNumber: null, type: "empty" },
        })
      }
    } else if (line.type === "add") {
      // Unpaired add
      splitLines.push({
        left: { code: "", lineNumber: null, type: "empty" },
        right: { code: line.code, lineNumber: newLineNum++, type: "add" },
      })
      i++
    } else {
      // Unchanged line
      splitLines.push({
        left: { code: line.code, lineNumber: oldLineNum++, type: "nochange" },
        right: { code: line.code, lineNumber: newLineNum++, type: "nochange" },
      })
      i++
    }
  }

  return (
    <Container fontFamily={"inconsolata"} flexDirection="column" gap={0} flexShrink={0} width="100%">
      {splitLines.map((splitLine, idx) => {
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
                flexShrink={1}
                backgroundColor={splitLine.left.type === "remove" ? "#2a0000" : "#0f0f0f"}
                paddingX={4}
                paddingY={2}
                overflow="hidden"
              >
                <Text fontSize={em} color="#e5e5e5" whiteSpace="pre" wordBreak="break-word" flexShrink={1}>
                  {splitLine.left.code || " "}
                </Text>
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
                flexShrink={1}
                backgroundColor={splitLine.right.type === "add" ? "#002a00" : "#0f0f0f"}
                paddingX={4}
                paddingY={2}
                overflow="hidden"
              >
                <Text fontSize={em} color="#e5e5e5" whiteSpace="pre" wordBreak="break-word" flexShrink={1}>
                  {splitLine.right.code || " "}
                </Text>
              </Container>
            </Container>
          </Container>
        )
      })}
    </Container>
  )
}
