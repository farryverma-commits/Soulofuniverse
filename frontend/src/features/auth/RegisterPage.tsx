import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../layouts/AuthLayout'
import { supabase } from '../../services/supabaseClient'
import { Mail, Lock, Loader2, ArrowRight } from 'lucide-react'
import { signInWithGoogle } from './authService'

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'student' | 'mentor'>('student')
  const [loading, setLoading] = useState(false)
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

  const handleGoogleRegister = async () => {
    try {
      setLoading(true)
      await signInWithGoogle(role)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout 
      title="Join the Universe" 
      subtitle="Start your collaborative learning experience today."
    >
      <div className="space-y-6">
        <div className="flex bg-surface-light p-1 rounded-2xl gap-1">
          <button 
            type="button"
            onClick={() => setRole('student')}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
              role === 'student' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Student
          </button>
          <button 
            type="button"
            onClick={() => setRole('mentor')}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${
              role === 'mentor' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Mentor
          </button>
        </div>

        <button 
          onClick={handleGoogleRegister}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-100 py-3.5 rounded-2xl font-bold text-dark hover:bg-gray-50 transition-all active:scale-[0.98] shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Register with Google
        </button>

        <div className="relative flex items-center gap-4 text-gray-400">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Or with email</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-dark uppercase tracking-widest ml-1">Full Name</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary transition-colors flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <input 
                type="text" 
                required
                className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-12 py-4 outline-none transition-all font-medium text-dark placeholder:text-gray-400"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-dark uppercase tracking-widest ml-1">Date of Birth</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary transition-colors flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>
              </div>
              <input 
                type="date" 
                required
                className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-12 py-4 outline-none transition-all font-medium text-dark placeholder:text-gray-400"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-dark uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary transition-colors" />
              <input 
                type="email" 
                required
                className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-12 py-4 outline-none transition-all font-medium text-dark placeholder:text-gray-400"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-dark uppercase tracking-widest ml-1">Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary transition-colors" />
              <input 
                type="password" 
                required
                className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-12 py-4 outline-none transition-all font-medium text-dark placeholder:text-gray-400"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-100 animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <button 
            disabled={loading}
            className="btn-primary w-full py-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                Get Started <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-500 font-medium">
            Already have an account? {' '}
            <Link to="/login" className="text-primary font-bold hover:underline transition-all">Sign In</Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  )
}
