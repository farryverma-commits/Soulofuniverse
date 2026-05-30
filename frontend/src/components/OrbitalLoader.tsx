interface OrbitalLoaderProps {
  variant?: 'page' | 'inline' | 'button'
  label?: string
}

export function OrbitalLoader({ variant = 'page', label }: OrbitalLoaderProps) {
  if (variant === 'button') {
    return (
      <span className="inline-block relative w-4 h-4">
        <span className="absolute inset-0 rounded-full border-2 border-current/20 animate-spin" style={{ animationDuration: '0.8s' }}>
          <span className="absolute w-0.5 h-0.5 bg-current rounded-full -top-0.5 left-1/2 -translate-x-1/2" />
        </span>
      </span>
    )
  }

  const size = variant === 'inline' ? 'w-10 h-10' : 'w-16 h-16'

  const loader = (
    <div className="flex flex-col items-center gap-4">
      <div className={`relative ${size}`}>
        <div className="absolute inset-[30%] rounded-full bg-primary/20" />
        <div className="absolute inset-[35%] rounded-full bg-primary" />
        <div className="absolute inset-0 rounded-full border border-primary/20 animate-spin" style={{ animationDuration: '3s' }}>
          <div className="absolute w-1.5 h-1.5 bg-primary rounded-full -top-0.5 left-1/2 -translate-x-1/2" />
        </div>
        <div className="absolute inset-1 rounded-full border border-primary/10 animate-spin" style={{ animationDuration: '5s', animationDirection: 'reverse' }}>
          <div className="absolute w-1 h-1 bg-primary/50 rounded-full -bottom-0.5 left-1/2 -translate-x-1/2" />
        </div>
      </div>
      {label && (
        <p className="text-[11px] font-semibold tracking-wider uppercase text-text-muted">
          {label}
        </p>
      )}
    </div>
  )

  if (variant === 'page') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        {loader}
      </div>
    )
  }

  return loader
}
