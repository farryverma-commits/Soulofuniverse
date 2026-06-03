import React from 'react'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen flex bg-canvas">
      {/* Left side: form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-20 bg-canvas">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-3 mb-12">
            <img
              src="/images/logo soul of universe.png"
              alt="Soul of Universe"
              className="w-9 h-9 rounded-lg object-contain"
            />
            <span className="text-sm font-bold text-white tracking-tight">Soul of Universe</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text tracking-tight">{title}</h1>
            <p className="text-text-secondary text-sm mt-2">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>

      {/* Right side: cosmic brand panel */}
      <div className="hidden lg:flex flex-1 bg-nav items-center justify-center relative overflow-hidden">
        <img
          src="/images/IMG_1732.PNG"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-nav via-nav/60 to-nav/30" />

        <div className="relative z-10 text-center max-w-xs px-10">
          <img
            src="/images/logo soul of universe.png"
            alt="Soul of Universe"
            className="w-16 h-16 rounded-xl object-contain mx-auto mb-6"
          />
          <h2 className="text-2xl font-bold text-white leading-snug mb-3 tracking-tight">
            Master the art of universal intelligence
          </h2>
          <p className="text-sm text-white/30 leading-relaxed">
            A focused space for deep learning, high-impact mentorship, and cosmic exploration.
          </p>

          {/* Subtle orbital accent */}
          <div className="mt-10 flex justify-center">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border border-white/[0.06]" />
              <div className="absolute inset-2 rounded-full border border-primary/10 animate-spin" style={{ animationDuration: '8s' }}>
                <div className="absolute w-1.5 h-1.5 bg-primary/40 rounded-full -top-0.5 left-1/2 -translate-x-1/2" />
              </div>
              <div className="absolute inset-4 rounded-full border border-accent/10 animate-spin" style={{ animationDuration: '12s', animationDirection: 'reverse' }}>
                <div className="absolute w-1 h-1 bg-accent/30 rounded-full -bottom-0.5 left-1/2 -translate-x-1/2" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
