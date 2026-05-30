import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../layouts/AuthLayout'
import { supabase } from '../../services/supabaseClient'
import { Mail, Lock, ArrowRight, Eye, EyeOff, User, Calendar } from 'lucide-react'
import { OrbitalLoader } from '../../components/OrbitalLoader'

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'student' | 'mentor'>('student')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          dob: dob,
          role: role,
        }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/login?registered=true')
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your collaborative learning experience."
    >
      <form onSubmit={handleRegister} className="space-y-4">
        {/* Role toggle */}
        <div className="flex bg-canvas rounded-md p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setRole('student')}
            className={`flex-1 py-2 text-xs font-semibold rounded transition-all ${
              role === 'student' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Student
          </button>
          <button
            type="button"
            onClick={() => setRole('mentor')}
            className={`flex-1 py-2 text-xs font-semibold rounded transition-all ${
              role === 'mentor' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Mentor
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-name" className="text-xs font-semibold text-text">Full name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              id="register-name"
              type="text"
              required
              className="input pl-10"
              placeholder="Your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-dob" className="text-xs font-semibold text-text">Date of birth</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              id="register-dob"
              type="date"
              required
              className="input pl-10"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-email" className="text-xs font-semibold text-text">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              id="register-email"
              type="email"
              required
              className="input pl-10"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="register-password" className="text-xs font-semibold text-text">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              required
              className="input pl-10 pr-10"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-error-light text-error p-3 rounded-md text-sm font-medium border border-error/10 animate-fade-in">
            {error}
          </div>
        )}

        <button
          disabled={loading}
          className="btn-primary w-full py-2.5 mt-2"
        >
          {loading ? <OrbitalLoader variant="button" /> : (
            <>
              Create account <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="text-center text-sm text-text-secondary pt-2">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
