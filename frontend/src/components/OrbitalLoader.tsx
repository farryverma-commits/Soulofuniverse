/**
 * Branded "Soul of Universe" orbital loader.
 *
 * Variants:
 *  - "page"   → Full-screen centered loader with brand text (for page-level loading states)
 *  - "inline" → Compact orbital spinner for inline / card-level loading
 *  - "button" → Tiny spinner for inside buttons (replaces Loader2 in action buttons)
 */

interface OrbitalLoaderProps {
  variant?: 'page' | 'inline' | 'button'
  label?: string
}

export function OrbitalLoader({ variant = 'page', label }: OrbitalLoaderProps) {
  if (variant === 'button') {
    return (
      <span className="inline-block relative w-5 h-5">
        <span className="absolute inset-0 rounded-full border-2 border-current/20 animate-spin" style={{ animationDuration: '0.8s' }}>
          <span className="absolute w-1 h-1 bg-current rounded-full -top-0.5 left-1/2 -translate-x-1/2 shadow-[0_0_4px_currentColor]" />
        </span>
      </span>
    )
  }

  const size = variant === 'inline' ? 'w-12 h-12' : 'w-20 h-20'

  const loader = (
    <div className="flex flex-col items-center gap-6">
      <div className={`relative ${size}`}>
        {/* Core glow */}
        <div className="absolute inset-[30%] rounded-full bg-primary/40 animate-[breath_2s_ease-in-out_infinite]" />
        <div className="absolute inset-[35%] rounded-full bg-primary" />
        {/* Orbit ring 1 */}
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-spin" style={{ animationDuration: '3s' }}>
          <div className="absolute w-2 h-2 bg-primary rounded-full -top-1 left-1/2 -translate-x-1/2 shadow-[0_0_8px_rgba(33,150,243,0.6)]" />
        </div>
        {/* Orbit ring 2 */}
        <div className="absolute inset-1 rounded-full border border-primary/10 animate-spin" style={{ animationDuration: '5s', animationDirection: 'reverse' }}>
          <div className="absolute w-1.5 h-1.5 bg-primary/60 rounded-full -bottom-0.5 left-1/2 -translate-x-1/2" />
        </div>
      </div>
      {label && (
        <p className="text-sm font-bold tracking-[0.2em] uppercase text-gray-400 animate-pulse">
          {label}
        </p>
      )}
    </div>
  )

  if (variant === 'page') {
    return (
      <div className="min-h-screen bg-surface-light flex items-center justify-center">
        {loader}
      </div>
    )
  }

  return loader
}
