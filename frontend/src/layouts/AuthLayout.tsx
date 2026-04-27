import React from 'react'
import { Layout } from 'lucide-react'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Side: Form */}
      <div className="flex flex-col justify-center px-6 py-12 lg:px-24 bg-white">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Layout className="text-white w-6 h-6" />
            </div>
            <span className="font-bold text-2xl tracking-tight text-dark">Soul of Universe</span>
          </div>
          
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-dark tracking-tight">{title}</h1>
            <p className="text-gray-500 mt-2 font-medium">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>

      {/* Right Side: Visual/Branding (Hidden on Mobile) */}
      <div className="hidden lg:flex relative bg-surface-light items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent z-0" />
        
        {/* Abstract "Intellectual" UI Elements */}
        <div className="relative z-10 text-center max-w-md p-12">
          <div className="mb-8 inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl shadow-xl shadow-blue-900/5 rotate-3 transition-transform hover:rotate-0">
            <Layout className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-4xl font-black text-dark leading-tight mb-4">
            Master the art of <span className="text-primary italic">Universal Intelligence.</span>
          </h2>
          <p className="text-gray-500 text-lg font-medium leading-relaxed">
            A minimalist space designed for deep learning, high-impact mentorship, and cosmic exploration.
          </p>
        </div>

        {/* Decorative Circles */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-2xl" />
      </div>
    </div>
  )
}
