import { Canvas } from '@react-three/fiber'
import { Container, Fullscreen, Text, Root } from '@react-three/uikit'
import { structuredPatch, type Hunk } from 'diff'
import { OrbitControls } from '@react-three/drei'

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

export default Button`;

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

export default Button`;

const filePath = '/src/components/Button.tsx'
const hunks = structuredPatch(
  filePath,
  filePath,
  beforeContent,
  afterContent,
  undefined,
  undefined,
  { context: 3, ignoreWhitespace: true },
).hunks

export default function App() {
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 50 }}
      style={{ height: '100vh', touchAction: 'none' }}
      gl={{ localClippingEnabled: true }}
    >
      <color attach="background" args={['#0a0a0a']} />
      <OrbitControls />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      
      <Root pixelSize={0.002} sizeX={8} flexDirection="column">
        <Fullscreen flexDirection="column" padding={20} gap={20} backgroundColor="#0f0f0f">
          <FileEditPreviewTitle filePath={filePath} hunks={hunks} />
          <Container flexGrow={1} backgroundColor="#1a1a1a" borderRadius={8} padding={16} overflow="scroll">
            <FileEditPreview hunks={hunks} />
          </Container>
        </Fullscreen>
      </Root>
    </Canvas>
  )
}

function FileEditPreviewTitle({
  filePath,
  hunks,
}: {
  filePath: string
  hunks: Hunk[]
}) {
  const numAdditions = hunks.reduce(
    (count, hunk) => count + hunk.lines.filter((line: string) => line.startsWith('+')).length,
    0,
  )
  const numRemovals = hunks.reduce(
    (count, hunk) => count + hunk.lines.filter((line: string) => line.startsWith('-')).length,
    0,
  )

  const isNewFile = numAdditions > 0 && numRemovals === 0
  const isDeleted = numRemovals > 0 && numAdditions === 0

  return (
    <Container flexDirection="row" gap={8} alignItems="center">
      <Text fontSize={24} fontWeight="bold" color="#ffffff">
        {isNewFile ? 'Created' : isDeleted ? 'Deleted' : 'Updated'} {filePath}
      </Text>
      {numAdditions > 0 && (
        <Text fontSize={18} color="#22c55e">
          +{numAdditions}
        </Text>
      )}
      {numRemovals > 0 && (
        <Text fontSize={18} color="#ef4444">
          -{numRemovals}
        </Text>
      )}
    </Container>
  )
}

function FileEditPreview({
  hunks,
}: {
  hunks: Hunk[]
}) {
  return (
    <Container flexDirection="column" gap={10}>
      {hunks.map((hunk, i) => (
        <Container key={i} flexDirection="column">
          <DiffHunk hunk={hunk} />
        </Container>
      ))}
    </Container>
  )
}

function DiffHunk({ hunk }: { hunk: Hunk }) {
  let oldLineNum = hunk.oldStart
  let newLineNum = hunk.newStart

  return (
    <Container flexDirection="column" gap={2}>
      {hunk.lines.map((line: string, idx: number) => {
        const type = line.startsWith('+')
          ? 'add'
          : line.startsWith('-')
            ? 'remove'
            : 'nochange'

        const code = line.slice(1)
        const currentOldLine = type !== 'add' ? oldLineNum : undefined
        const currentNewLine = type !== 'remove' ? newLineNum : undefined

        if (type === 'remove') {
          oldLineNum++
        } else if (type === 'add') {
          newLineNum++
        } else {
          oldLineNum++
          newLineNum++
        }

        const bgColor =
          type === 'add'
            ? '#1a3a1a'
            : type === 'remove'
              ? '#3a1a1a'
              : '#0f0f0f'

        const lineNumColor =
          type === 'add'
            ? '#22c55e'
            : type === 'remove'
              ? '#ef4444'
              : '#666666'

        return (
          <Container
            key={idx}
            flexDirection="row"
            backgroundColor={bgColor}
            paddingY={4}
            paddingX={8}
            gap={12}
          >
            <Container width={80} flexDirection="row" gap={8} justifyContent="flex-end">
              <Text fontSize={14} color={lineNumColor} fontFamily="monospace">
                {currentOldLine !== undefined ? currentOldLine.toString().padStart(4, ' ') : '    '}
              </Text>
              <Text fontSize={14} color={lineNumColor} fontFamily="monospace">
                {currentNewLine !== undefined ? currentNewLine.toString().padStart(4, ' ') : '    '}
              </Text>
            </Container>
            <Container flexGrow={1}>
              <Text
                fontSize={14}
                color={type === 'add' ? '#22c55e' : type === 'remove' ? '#ef4444' : '#e5e5e5'}
                fontFamily="monospace"
              >
                {code}
              </Text>
            </Container>
          </Container>
        )
      })}
    </Container>
  )
}
