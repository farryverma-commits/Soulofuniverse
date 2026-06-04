import React, { useMemo } from 'react'

interface Star {
  top: number
  left: number
  size: number
  delay: number
  duration: number
  opacity: number
}

export const CosmicBrandPanel: React.FC = () => {
  const stars = useMemo<Star[]>(() => {
    return Array.from({ length: 60 }, () => ({
      top: Math.random() * 100,
      left: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      delay: Math.random() * 4,
      duration: Math.random() * 3 + 2,
      opacity: Math.random() * 0.5 + 0.2,
    }))
  }, [])

  return (
    <div className="relative flex-1 hidden lg:flex items-center justify-center overflow-hidden" style={{ background: '#060610' }}>
      {/* Cosmic background image */}
      <img
        src="/images/IMG_1732.PNG"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-[0.12] scale-110"
        style={{ filter: 'saturate(0.6)' }}
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(6,6,16,0.9), rgba(6,6,16,0.6), rgba(6,6,16,0.95))' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top right, rgba(123,94,168,0.05), transparent, rgba(212,168,83,0.05))' }} />

      {/* Subtle radial glow behind logo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(212,168,83,0.04)_0%,rgba(212,168,83,0.01)_40%,transparent_70%)] blur-3xl" />

      {/* Starfield */}
      <div className="absolute inset-0">
        {stars.map((star, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
        {/* A few "bright" stars with gold tint */}
        {stars.slice(0, 8).map((star, i) => (
          <div
            key={`bright-${i}`}
            className="absolute rounded-full bg-primary/60"
            style={{
              top: `${star.top}%`,
              left: `${(star.left + 7) % 100}%`,
              width: `${star.size + 1}px`,
              height: `${star.size + 1}px`,
              animation: `twinkle ${star.duration * 0.7}s ease-in-out ${star.delay + 1}s infinite`,
              boxShadow: '0 0 4px rgba(212, 168, 83, 0.3)',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-12 py-16 max-w-sm">
        {/* Logo */}
        <div className="relative inline-block mb-8">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/10 to-transparent blur-xl scale-125" />
          <img
            src="/images/logo soul of universe.png"
            alt="Soul of Universe"
            className="relative w-24 h-24 rounded-2xl object-contain mx-auto"
            style={{ filter: 'drop-shadow(0 0 40px rgba(212, 168, 83, 0.15))' }}
          />
        </div>

        {/* Brand name */}
        <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-tight mb-3">
          Soul of<br />Universe
        </h1>

        {/* Tagline */}
        <p className="text-sm text-white/35 leading-relaxed max-w-[240px] mx-auto">
          A focused space for deep learning, high-impact mentorship, and cosmic exploration.
        </p>

        {/* Orbital rings */}
        <div className="mt-14 flex justify-center">
          <div className="relative w-28 h-28">
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border border-white/[0.04]" />
            {/* Primary orbit */}
            <div className="absolute inset-0 rounded-full border border-primary/[0.08] animate-spin" style={{ animationDuration: '12s' }}>
              <div className="absolute w-2 h-2 bg-primary/40 rounded-full -top-1 left-1/2 -translate-x-1/2 shadow-lg shadow-primary/20" />
            </div>
            {/* Accent orbit - reverse */}
            <div className="absolute inset-3 rounded-full border border-accent/[0.08] animate-spin" style={{ animationDuration: '18s', animationDirection: 'reverse' }}>
              <div className="absolute w-1.5 h-1.5 bg-accent/30 rounded-full -bottom-0.5 left-2/3" />
            </div>
            {/* Inner orbit */}
            <div className="absolute inset-6 rounded-full border border-primary/[0.04] animate-spin" style={{ animationDuration: '8s' }}>
              <div className="absolute w-1 h-1 bg-white/20 rounded-full top-0 right-1/3" />
            </div>
            {/* Center dot */}
            <div className="absolute inset-[42%] rounded-full bg-primary/10 backdrop-blur-sm" />
          </div>
        </div>
      </div>

    </div>
  )
}
