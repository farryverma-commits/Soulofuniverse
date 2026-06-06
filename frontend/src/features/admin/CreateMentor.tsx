import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, Mail, Lock, User, Calendar, X, CheckCircle } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import toast from 'react-hot-toast'

export const CreateMentor: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-mentor`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          dob: dob || null,
        }),
      }
    )

    const result = await response.json()

    if (response.ok && result.success) {
      toast.success('Mentor account created!')
      setFullName('')
      setEmail('')
      setPassword('')
      setDob('')
      setIsOpen(false)
    } else {
      toast.error(result.error || 'Failed to create mentor')
    }

    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn-primary text-xs py-2"
      >
        <UserPlus size={14} />
        Create Mentor
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 bg-nav/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-2xl border border-border p-6 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-text">Create Mentor Account</h2>
                  <p className="text-text-secondary text-xs mt-0.5">
                    Mentors are created by admins only
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg hover:bg-surface-raised text-text-muted hover:text-text transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="mentor-full-name" className="text-xs font-semibold text-text">Full name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      id="mentor-full-name"
                      type="text"
                      required
                      className="input pl-10"
                      placeholder="Mentor's full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mentor-email" className="text-xs font-semibold text-text">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      id="mentor-email"
                      type="email"
                      required
                      className="input pl-10"
                      placeholder="mentor@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mentor-password" className="text-xs font-semibold text-text">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      id="mentor-password"
                      type="password"
                      required
                      className="input pl-10"
                      placeholder="Minimum 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mentor-dob" className="text-xs font-semibold text-text">Date of birth (optional)</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      id="mentor-dob"
                      type="date"
                      className="input pl-10"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-2.5 mt-2"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  ) : (
                    <>
                      <CheckCircle size={14} />
                      Create Mentor
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
