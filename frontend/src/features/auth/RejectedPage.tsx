import React from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../services/supabaseClient'
import { XCircle, Mail, LogOut, ArrowRight } from 'lucide-react'
import { CosmicBrandPanel } from '../../components/CosmicBrandPanel'

export const RejectedPage: React.FC = () => {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex bg-canvas">
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-16 lg:px-12 bg-canvas">
        <div className="w-full max-w-[380px]">
          <div className="flex items-center gap-2.5 mb-14">
            <img
              src="/images/logo soul of universe.png"
              alt=""
              className="w-7 h-7 rounded-lg object-contain opacity-80"
            />
            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-text-muted">
              Soul of Universe
            </span>
          </div>

          <div className="animate-fade-in">
            <div className="w-14 h-14 mb-6 rounded-2xl bg-error/10 flex items-center justify-center">
              <XCircle className="w-7 h-7 text-error" />
            </div>

            <h1 className="text-[26px] font-extrabold text-text tracking-tight leading-tight mb-3">
              Request Not Approved
            </h1>

            <p className="text-sm text-text-secondary leading-relaxed mb-6">
              Unfortunately, your registration request was not approved at this time. Contact our support team if you believe this was an error.
            </p>

            <div className="inline-flex items-center gap-2 px-4 py-2 bg-error/10 rounded-full mb-8">
              <XCircle className="w-4 h-4 text-error" />
              <span className="text-error text-sm font-medium">Request Denied</span>
            </div>

            <div className="card p-4 mb-8">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-text-muted mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-text text-sm font-medium">Need help?</p>
                  <p className="text-text-muted text-xs mt-1 leading-relaxed">
                    If you believe this was a mistake or have questions, please reach out to our support team.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 card card-hover text-text-secondary hover:text-text transition-all group rounded-xl"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
              <ArrowRight size={16} className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
            </button>
          </div>
        </div>
      </div>

      <CosmicBrandPanel />
    </div>
  )
}
