import React from 'react'
import { Layout } from 'lucide-react'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen flex">
      {/* Left side: form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-20 bg-surface">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: '#3D3BF3' }}>
              <Layout className="text-white" size={16} />
            </div>
            <span className="text-sm font-bold text-text tracking-tight">Soul of Universe</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text tracking-tight">{title}</h1>
            <p className="text-text-secondary text-sm mt-1.5">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>

      {/* Right side: brand panel */}
      <div className="hidden lg:flex flex-1 bg-nav items-center justify-center relative overflow-hidden">
        <div className="relative z-10 text-center max-w-sm px-12">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-6" style={{ background: '#3D3BF3' }}>
            <Layout className="text-white" size={24} />
          </div>
          <h2 className="text-2xl font-bold text-white leading-snug mb-3">
            Master the art of universal intelligence
          </h2>
          <p className="text-sm text-white/40 leading-relaxed">
            A focused space for deep learning, high-impact mentorship, and cosmic exploration.
          </p>
        </div>

        {/* Subtle geometric accents */}
        <div className="absolute top-[15%] left-[10%] w-32 h-32 border border-white/5 rounded-lg rotate-12" />
        <div className="absolute bottom-[20%] right-[15%] w-24 h-24 border border-white/5 rounded-lg -rotate-6" />
        <div className="absolute top-[60%] left-[20%] w-2 h-2 bg-primary/30 rounded-full" />
        <div className="absolute top-[25%] right-[25%] w-1.5 h-1.5 bg-white/10 rounded-full" />
      </div>
    </div>
  )
}
