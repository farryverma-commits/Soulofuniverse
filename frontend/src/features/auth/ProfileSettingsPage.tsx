import React, { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../services/supabaseClient'
import { User, Mail, Lock, Eye, EyeOff, Sparkles, Shield, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { OrbitalLoader } from '../../components/OrbitalLoader'
import toast from 'react-hot-toast'

export const ProfileSettingsPage: React.FC = () => {
  const { user, role } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    setLoading(true)

    // Re-authenticate first, then update
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: currentPassword,
    })

    if (signInError) {
      setError('Current password is incorrect.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }

    setLoading(false)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-text tracking-tight">Profile settings</h1>
        <p className="text-text-secondary text-sm mt-1">
          Manage your account and security preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Info Card */}
        <div className="lg:col-span-1">
          <div className="card card-glow p-6">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <User className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-text">{user?.email}</h2>
              <span className="badge badge-primary mt-2 capitalize">{role}</span>
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center gap-3 text-sm">
                <Mail size={14} className="text-text-muted shrink-0" />
                <span className="text-text-secondary truncate">{user?.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Shield size={14} className="text-text-muted shrink-0" />
                <span className="text-text-secondary capitalize">{role} account</span>
              </div>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="lg:col-span-2">
          <div className="card card-glow p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Lock size={18} className="text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text">Change password</h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Update your password to keep your account secure.
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-5">
              {/* Current Password */}
              <div className="space-y-2">
                <label htmlFor="current-password" className="text-xs font-semibold text-text-secondary tracking-wide">
                  Current password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                  <input
                    id="current-password"
                    type={showCurrent ? 'text' : 'password'}
                    required
                    className="input pl-11 pr-11"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded-lg hover:bg-surface"
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <label htmlFor="new-password" className="text-xs font-semibold text-text-secondary tracking-wide">
                  New password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                  <input
                    id="new-password"
                    type={showNew ? 'text' : 'password'}
                    required
                    className="input pl-11 pr-11"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded-lg hover:bg-surface"
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-xs font-semibold text-text-secondary tracking-wide">
                  Confirm new password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    required
                    className="input pl-11 pr-11"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-text-secondary transition-colors rounded-lg hover:bg-surface"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-error/8 text-error px-4 py-3 rounded-xl text-sm font-medium border border-error/10 animate-fade-in">
                  {error}
                </div>
              )}

              <button disabled={loading} className="btn-primary w-full py-3 text-sm">
                {loading ? <OrbitalLoader variant="button" /> : (
                  <><Sparkles size={15} /> Update password</>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
