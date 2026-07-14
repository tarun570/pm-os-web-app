import { useEffect, useRef, useState } from 'react'

/**
 * Returns [ref, isInView]. Attach the ref to an element; `isInView` flips
 * to true the first time the element scrolls into view (then stays true).
 * Used for fade-up entry animations without a heavy animation library.
 */
export default function useInView({ threshold = 0.15, rootMargin = '0px' } = {}) {
  const ref = useRef(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return [ref, isInView]
}
