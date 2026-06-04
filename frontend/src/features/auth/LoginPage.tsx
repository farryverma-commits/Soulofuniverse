import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../layouts/AuthLayout'
import { supabase } from '../../services/supabaseClient'
import { Mail, Lock, ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react'
import { OrbitalLoader } from '../../components/OrbitalLoader'

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your journey."
    >
      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="login-email" className="text-xs font-semibold text-text-secondary tracking-wide">Email address</label>
          <div className="relative group">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors duration-200" />
            <input
              id="login-email"
              type="email"
              required
              className="input pl-11"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label htmlFor="login-password" className="text-xs font-semibold text-text-secondary tracking-wide">Password</label>
            <Link to="/forgot-password" className="text-[11px] font-medium text-primary hover:text-primary-hover transition-colors">Forgot?</Link>
          </div>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors duration-200" />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              required
              className="input pl-11 pr-11"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded-lg hover:bg-surface"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-error/8 text-error px-4 py-3 rounded-xl text-sm font-medium border border-error/10 animate-fade-in">
            {error}
          </div>
        )}

        <button disabled={loading} className="btn-primary w-full py-3 mt-2 text-sm">
          {loading ? <OrbitalLoader variant="button" /> : (
            <><Sparkles size={15} /> Sign in</>
          )}
        </button>

        <p className="text-center text-sm text-text-secondary pt-3">
          New to the cosmos?{' '}
          <Link to="/register" className="text-primary font-semibold hover:text-primary-hover transition-colors">Create account</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
