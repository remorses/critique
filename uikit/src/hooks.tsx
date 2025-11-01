import { useState, useEffect } from "react"

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl"

export function useScreenBreakpoint(): Breakpoint {
  const getBreakpoint = (width: number): Breakpoint => {
    if (width >= 1536) return "2xl"
    if (width >= 1280) return "xl"
    if (width >= 1024) return "lg"
    if (width >= 768) return "md"
    if (width >= 640) return "sm"
    return "xs"
  }

  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth))

  useEffect(() => {
    const handleResize = () => {
      const newBreakpoint = getBreakpoint(window.innerWidth)
      setBreakpoint((current) => {
        // Only update if breakpoint actually changed
        if (current !== newBreakpoint) {
          return newBreakpoint
        }
        return current
      })
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return breakpoint
}
