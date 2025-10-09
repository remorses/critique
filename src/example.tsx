import { structuredPatch } from "diff";
import {
  render,
  useKeyboard,
  useOnResize,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import * as React from "react";
import {
  ErrorBoundary,
  FileEditPreviewTitle,
  FileEditPreview,
} from "./diff.tsx";

function App() {
  const renderer = useRenderer();
  const { width: initialWidth } = useTerminalDimensions();
  const [width, setWidth] = React.useState(initialWidth);

  useOnResize(
    React.useCallback((newWidth: number) => {
      setWidth(newWidth);
    }, []),
  );
  const useSplitView = width >= 100;
  useKeyboard((key) => {
    if (key.name === "z" && key.ctrl) {
      renderer.console.toggle();
    }
  });
  return (
    <box style={{ flexDirection: "column", height: "100%", padding: 1 }}>
      <FileEditPreviewTitle filePath={filePath} hunks={hunks} />
      <box paddingTop={3} />
      <scrollbox
        style={{
          flexGrow: 1,
          rootOptions: {
            backgroundColor: "transparent",
            border: false,
          },
          scrollbarOptions: {
            showArrows: false,
            trackOptions: {
              foregroundColor: "#4a4a4a",
              backgroundColor: "transparent",
            },
          },
        }}
        focused
      >
        <FileEditPreview hunks={hunks} paddingLeft={0} filePath={filePath} />
      </scrollbox>
    </box>
  );
}

// Example file content before and after - Extended version for scrolling demo
export const beforeContent = `import React from 'react'
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

  const sizeClasses = {
    small: "px-3 py-1.5 text-sm",
    medium: "px-4 py-2 text-base",
    large: "px-6 py-3 text-lg",
    xlarge: "px-8 py-4 text-xl"
  }

  const variantClasses = {
    primary: "bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-300 active:bg-blue-700",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-300 active:bg-gray-400",
    success: "bg-green-500 text-white hover:bg-green-600 focus:ring-green-300 active:bg-green-700",
    danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-300 active:bg-red-700",
    warning: "bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-300 active:bg-yellow-700",
    info: "bg-cyan-500 text-white hover:bg-cyan-600 focus:ring-cyan-300 active:bg-cyan-700",
    outline: "border-2 border-current hover:bg-opacity-10 focus:ring-opacity-30",
    ghost: "hover:bg-opacity-10 active:bg-opacity-20"
  }

  const disabledClasses = disabled || loading
    ? "opacity-50 cursor-not-allowed pointer-events-none"
    : "cursor-pointer"

  return (
    <motion.button
      ref={buttonRef}
      className={cn(
        "relative inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        sizeClasses[size],
        variantClasses[variant],
        disabledClasses,
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseEnter={(e) => {
        setIsHovered(true)
        onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        setIsHovered(false)
        setIsPressed(false)
        onMouseLeave?.(e)
      }}
      aria-label={ariaLabel || children}
      tabIndex={disabled || loading ? -1 : tabIndex}
      animate={{
        scale: isPressed ? 0.98 : 1,
        boxShadow: isHovered
          ? "0 10px 30px rgba(0, 0, 0, 0.2)"
          : "0 4px 15px rgba(0, 0, 0, 0.1)"
      }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      {...props}
    >
      <AnimatePresence>
        {loading && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Loader2 className="animate-spin" size={20} />
          </motion.span>
        )}
      </AnimatePresence>

      <span
        className={cn(
          "inline-flex items-center gap-2",
          loading && "opacity-0"
        )}
      >
        {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </span>
    </motion.button>
  )
}

export default Button

// Additional utility functions for button groups
export function ButtonGroup({ children, className, ...props }) {
  return (
    <div
      className={cn("inline-flex rounded-lg shadow-sm", className)}
      role="group"
      {...props}
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child

        const isFirst = index === 0
        const isLast = index === React.Children.count(children) - 1

        return React.cloneElement(child, {
          className: cn(
            child.props.className,
            !isFirst && "rounded-l-none",
            !isLast && "rounded-r-none border-r-0"
          )
        })
      })}
    </div>
  )
}

// Icon button variant
export function IconButton({ icon, size = "medium", ...props }) {
  const iconSizeMap = {
    small: 16,
    medium: 20,
    large: 24,
    xlarge: 32
  }

  return (
    <Button
      {...props}
      size={size}
      className={cn(
        "aspect-square p-0",
        props.className
      )}
    >
      {React.cloneElement(icon, { size: iconSizeMap[size] })}
    </Button>
  )
}

Button.propTypes = {
  variant: PropTypes.oneOf(["primary", "secondary", "success", "danger", "warning", "info", "outline", "ghost"]),
  size: PropTypes.oneOf(["small", "medium", "large", "xlarge"]),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  leftIcon: PropTypes.node,
  rightIcon: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  onMouseEnter: PropTypes.func,
  onMouseLeave: PropTypes.func,
  ariaLabel: PropTypes.string,
  tabIndex: PropTypes.number,
  fullWidth: PropTypes.bool
}

ButtonGroup.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
}

IconButton.propTypes = {
  icon: PropTypes.element.isRequired,
  size: PropTypes.oneOf(["small", "medium", "large", "xlarge"])
}`;

export const afterContent = `import React from 'react'
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

    // Add ripple effect
    const button = buttonRef.current
    const rect = button.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2

    const newRipple = {
      x,
      y,
      size,
      id: Date.now()
    }

    setRipples(prev => [...prev, newRipple])

    // Track analytics event
    if (analyticsEvent) {
      analytics.track(analyticsEvent, {
        variant,
        size,
        label: children
      })
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

  // Remove ripples after animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setRipples([])
    }, 1000)

    return () => clearTimeout(timer)
  }, [ripples.length])

  // Memoized classes
  const sizeClasses = useMemo(() => ({
    small: "px-3 py-1.5 text-sm gap-1.5",
    medium: "px-4 py-2 text-base gap-2",
    large: "px-6 py-3 text-lg gap-2.5",
    xlarge: "px-8 py-4 text-xl gap-3"
  }), [])

  const variantClasses = useMemo(() => {
    const baseVariants = {
      primary: \`bg-\${theme.primary}-500 text-white hover:bg-\${theme.primary}-600 focus:ring-\${theme.primary}-300 active:bg-\${theme.primary}-700 dark:bg-\${theme.primary}-600 dark:hover:bg-\${theme.primary}-700\`,
      secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-300 active:bg-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
      success: "bg-green-500 text-white hover:bg-green-600 focus:ring-green-300 active:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700",
      danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-300 active:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700",
      warning: "bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-300 active:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700",
      info: "bg-cyan-500 text-white hover:bg-cyan-600 focus:ring-cyan-300 active:bg-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-700",
      outline: \`border-2 border-\${theme.primary}-500 text-\${theme.primary}-500 hover:bg-\${theme.primary}-50 focus:ring-\${theme.primary}-300 dark:border-\${theme.primary}-400 dark:text-\${theme.primary}-400 dark:hover:bg-\${theme.primary}-950\`,
      ghost: "hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700",
      gradient: \`bg-gradient-to-r from-\${theme.primary}-500 to-\${theme.secondary}-500 text-white hover:from-\${theme.primary}-600 hover:to-\${theme.secondary}-600\`
    }

    return baseVariants
  }, [theme, isDarkMode])

  const buttonClasses = cn(
    "relative inline-flex items-center justify-center font-medium transition-all duration-200",
    "focus:outline-none focus:ring-2 focus:ring-offset-2 transform-gpu will-change-transform",
    rounded ? "rounded-lg" : "rounded-none",
    sizeClasses[size],
    variantClasses[variant],
    (disabled || loading) ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    fullWidth && "w-full",
    isPressed && "scale-[0.97]",
    isHovered && !disabled && "shadow-lg",
    isFocused && "ring-2 ring-offset-2",
    className
  )

  const contentClasses = cn(
    "inline-flex items-center justify-center relative z-10",
    loading && "opacity-0",
    showSuccess && "opacity-0",
    showError && "opacity-0"
  )

  return (
    <>
      <motion.button
        ref={buttonRef}
        className={buttonClasses}
        disabled={disabled || loading}
        onClick={handleClick}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseEnter={(e) => {
          setIsHovered(true)
          onMouseEnter?.(e)
        }}
        onMouseLeave={(e) => {
          setIsHovered(false)
          setIsPressed(false)
          onMouseLeave?.(e)
        }}
        onFocus={(e) => {
          setIsFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setIsFocused(false)
          onBlur?.(e)
        }}
        aria-label={ariaLabel || children}
        aria-pressed={ariaPressed}
        aria-expanded={ariaExpanded}
        tabIndex={disabled || loading ? -1 : tabIndex}
        animate={{
          y: isHovered && !disabled ? -2 : 0,
          boxShadow: isHovered && !disabled
            ? "0 10px 30px rgba(0, 0, 0, 0.2)"
            : "0 4px 15px rgba(0, 0, 0, 0.1)"
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 30
        }}
        {...props}
      >
        {/* Ripple effects */}
        <span className="absolute inset-0 overflow-hidden rounded-lg">
          <AnimatePresence>
            {ripples.map(ripple => (
              <motion.span
                key={ripple.id}
                className="absolute rounded-full bg-current opacity-20"
                initial={{
                  width: 0,
                  height: 0,
                  x: ripple.x,
                  y: ripple.y
                }}
                animate={{
                  width: ripple.size,
                  height: ripple.size,
                  x: ripple.x,
                  y: ripple.y,
                  opacity: 0
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            ))}
          </AnimatePresence>
        </span>

        {/* Loading state */}
        <AnimatePresence>
          {loading && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2 className="animate-spin" size={20} />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Success state */}
        <AnimatePresence>
          {showSuccess && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center gap-2"
            >
              <Check size={20} className="text-green-600" />
              <span className="text-sm font-medium">{successMessage}</span>
            </motion.span>
          )}
        </AnimatePresence>

        {/* Error state */}
        <AnimatePresence>
          {showError && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute inset-0 flex items-center justify-center gap-2"
            >
              <AlertCircle size={20} className="text-red-600" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </motion.span>
          )}
        </AnimatePresence>

        {/* Button content */}
        <span className={contentClasses}>
          {leftIcon && (
            <motion.span
              className="flex-shrink-0"
              animate={{ rotate: isHovered ? 360 : 0 }}
              transition={{ duration: 0.3 }}
            >
              {leftIcon}
            </motion.span>
          )}
          <span>{children}</span>
          {rightIcon && (
            <motion.span
              className="flex-shrink-0"
              animate={{ x: isHovered ? 2 : 0 }}
            >
              {rightIcon}
            </motion.span>
          )}
        </span>
      </motion.button>

      {/* Tooltip */}
      {tooltip && (
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                "absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded-md shadow-lg pointer-events-none",
                tooltipPosition === "top" && "bottom-full mb-2 left-1/2 transform -translate-x-1/2",
                tooltipPosition === "bottom" && "top-full mt-2 left-1/2 transform -translate-x-1/2",
                tooltipPosition === "left" && "right-full mr-2 top-1/2 transform -translate-y-1/2",
                tooltipPosition === "right" && "left-full ml-2 top-1/2 transform -translate-y-1/2"
              )}
            >
              {tooltip}
              <span
                className={cn(
                  "absolute w-2 h-2 bg-gray-900 transform rotate-45",
                  tooltipPosition === "top" && "bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1",
                  tooltipPosition === "bottom" && "top-0 left-1/2 transform -translate-x-1/2 -translate-y-1",
                  tooltipPosition === "left" && "right-0 top-1/2 transform translate-x-1 -translate-y-1/2",
                  tooltipPosition === "right" && "left-0 top-1/2 transform -translate-x-1 -translate-y-1/2"
                )}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  )
}

export default Button

// Enhanced ButtonGroup with better layout options
export function ButtonGroup({
  children,
  className,
  orientation = "horizontal",
  spacing = "none",
  size = "medium",
  variant = "primary",
  fullWidth = false,
  ...props
}) {
  const spacingClasses = {
    none: "",
    small: orientation === "horizontal" ? "gap-1" : "gap-1",
    medium: orientation === "horizontal" ? "gap-2" : "gap-2",
    large: orientation === "horizontal" ? "gap-4" : "gap-4"
  }

  return (
    <div
      className={cn(
        "inline-flex",
        orientation === "horizontal" ? "flex-row" : "flex-col",
        spacing !== "none" && spacingClasses[spacing],
        fullWidth && "w-full",
        className
      )}
      role="group"
      {...props}
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child

        const isFirst = index === 0
        const isLast = index === React.Children.count(children) - 1
        const isMiddle = !isFirst && !isLast

        // Pass down default props if not specified on child
        const childProps = {
          size: child.props.size || size,
          variant: child.props.variant || variant,
          fullWidth: orientation === "vertical" || fullWidth
        }

        // Apply connected button styles only when spacing is "none"
        if (spacing === "none") {
          if (orientation === "horizontal") {
            childProps.className = cn(
              child.props.className,
              isMiddle && "rounded-none",
              isFirst && "rounded-r-none",
              isLast && "rounded-l-none",
              !isLast && "border-r-0"
            )
          } else {
            childProps.className = cn(
              child.props.className,
              isMiddle && "rounded-none",
              isFirst && "rounded-b-none",
              isLast && "rounded-t-none",
              !isLast && "border-b-0"
            )
          }
        }

        return React.cloneElement(child, childProps)
      })}
    </div>
  )
}

// Enhanced IconButton with better accessibility
export function IconButton({
  icon,
  size = "medium",
  tooltip,
  ariaLabel,
  badge,
  badgeColor = "red",
  animate = false,
  ...props
}) {
  const iconSizeMap = {
    small: 14,
    medium: 18,
    large: 24,
    xlarge: 32
  }

  const paddingMap = {
    small: "p-1.5",
    medium: "p-2",
    large: "p-3",
    xlarge: "p-4"
  }

  return (
    <div className="relative inline-block">
      <Button
        {...props}
        size={size}
        tooltip={tooltip}
        ariaLabel={ariaLabel || tooltip}
        className={cn(
          paddingMap[size],
          props.className
        )}
      >
        <motion.div
          animate={animate ? {
            rotate: [0, 10, -10, 10, 0],
          } : {}}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatDelay: 3
          }}
        >
          {React.cloneElement(icon, { size: iconSizeMap[size] })}
        </motion.div>
      </Button>

      {badge && (
        <span className={cn(
          "absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold text-white",
          \`bg-\${badgeColor}-500\`
        )}>
          {badge}
        </span>
      )}
    </div>
  )
}

// New SplitButton component
export function SplitButton({
  children,
  dropdownItems = [],
  variant = "primary",
  size = "medium",
  ...props
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <ButtonGroup spacing="none" {...props}>
      <Button variant={variant} size={size}>
        {children}
      </Button>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsOpen(!isOpen)}
        ariaExpanded={isOpen}
        className="px-2"
      >
        <ChevronDown size={16} />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full mt-1 right-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
          >
            {dropdownItems.map((item, index) => (
              <button
                key={index}
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  item.onClick?.()
                  setIsOpen(false)
                }}
              >
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </ButtonGroup>
  )
}

// Toggle Button component
export function ToggleButton({
  isOn,
  onToggle,
  size = "medium",
  variant = "primary",
  icons = { on: <Check />, off: null },
  labels = { on: "On", off: "Off" },
  ...props
}) {
  return (
    <Button
      size={size}
      variant={isOn ? variant : "outline"}
      onClick={() => onToggle(!isOn)}
      ariaPressed={isOn}
      leftIcon={isOn ? icons.on : icons.off}
      {...props}
    >
      {isOn ? labels.on : labels.off}
    </Button>
  )
}

Button.propTypes = {
  variant: PropTypes.oneOf(["primary", "secondary", "success", "danger", "warning", "info", "outline", "ghost", "gradient"]),
  size: PropTypes.oneOf(["small", "medium", "large", "xlarge"]),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  leftIcon: PropTypes.node,
  rightIcon: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  onMouseEnter: PropTypes.func,
  onMouseLeave: PropTypes.func,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
  ariaLabel: PropTypes.string,
  ariaPressed: PropTypes.bool,
  ariaExpanded: PropTypes.bool,
  tabIndex: PropTypes.number,
  fullWidth: PropTypes.bool,
  rounded: PropTypes.bool,
  tooltip: PropTypes.string,
  tooltipPosition: PropTypes.oneOf(["top", "bottom", "left", "right"]),
  successMessage: PropTypes.string,
  errorMessage: PropTypes.string,
  analyticsEvent: PropTypes.string,
  hapticFeedback: PropTypes.bool,
  soundEnabled: PropTypes.bool
}

ButtonGroup.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  orientation: PropTypes.oneOf(["horizontal", "vertical"]),
  spacing: PropTypes.oneOf(["none", "small", "medium", "large"]),
  size: PropTypes.oneOf(["small", "medium", "large", "xlarge"]),
  variant: PropTypes.oneOf(["primary", "secondary", "success", "danger", "warning", "info", "outline", "ghost", "gradient"]),
  fullWidth: PropTypes.bool
}

IconButton.propTypes = {
  icon: PropTypes.element.isRequired,
  size: PropTypes.oneOf(["small", "medium", "large", "xlarge"]),
  tooltip: PropTypes.string,
  ariaLabel: PropTypes.string,
  badge: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  badgeColor: PropTypes.string,
  animate: PropTypes.bool
}

SplitButton.propTypes = {
  children: PropTypes.node.isRequired,
  dropdownItems: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func
  })),
  variant: PropTypes.oneOf(["primary", "secondary", "success", "danger", "warning", "info", "outline", "ghost", "gradient"]),
  size: PropTypes.oneOf(["small", "medium", "large", "xlarge"])
}

ToggleButton.propTypes = {
  isOn: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  size: PropTypes.oneOf(["small", "medium", "large", "xlarge"]),
  variant: PropTypes.oneOf(["primary", "secondary", "success", "danger", "warning", "info", "outline", "ghost", "gradient"]),
  icons: PropTypes.shape({
    on: PropTypes.node,
    off: PropTypes.node
  }),
  labels: PropTypes.shape({
    on: PropTypes.string,
    off: PropTypes.string
  })
}`;

const filePath = "/src/components/Button.tsx";
const hunks = structuredPatch(
  filePath,
  filePath,
  beforeContent,
  afterContent,
  undefined,
  undefined,
  { context: 3, ignoreWhitespace: true, stripTrailingCr: true },
).hunks;

await render(
  React.createElement(ErrorBoundary, null, React.createElement(App)),
);
