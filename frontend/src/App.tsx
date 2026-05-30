import React from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { Home, Calendar, BookOpen, Shield, LogOut, Layout, User } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { supabase } from './services/supabaseClient'
import { OrbitalLoader } from './components/OrbitalLoader'

function App() {
  const { user, loading, role } = useAuth()

  if (loading) {
    return <OrbitalLoader variant="page" label="Soul of Universe" />
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/" />} />
      <Route
        path="/meeting/:sessionId"
        element={user ? <MeetingPage /> : <Navigate to="/login" />}
      />
      <Route
        path="/*"
        element={user ? <DashboardLayout user={user} role={role} /> : <Navigate to="/login" />}
      />
    </Routes>
  )
}

import { AdminSchedulerPage } from './features/scheduler/AdminSchedulerPage'
import { BookingPage } from './features/scheduler/BookingPage'
import { VideoLibraryPage } from './features/library/VideoLibraryPage'
import { AdminDashboardPage } from './features/admin/AdminDashboardPage'
import { UserManagement } from './features/admin/UserManagement'
import { MeetingPage } from './features/conferencing/MeetingPage'

function DashboardLayout({ user, role }: { user: any; role: any }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false)

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Logout failed:', error.message)
    }
    window.location.href = '/login'
  }

  const confirmLogout = () => {
    setShowLogoutConfirm(true)
  }

  const cancelLogout = () => {
    setShowLogoutConfirm(false)
  }

  const navItems = [
    { to: '/', icon: <Home size={18} />, label: 'Dashboard' },
    { to: '/library', icon: <BookOpen size={18} />, label: 'Library' },
    ...(role === 'student' ? [{ to: '/scheduler', icon: <Calendar size={18} />, label: 'Schedule' }] : []),
    ...(role === 'admin' ? [{ to: '/admin', icon: <Shield size={18} />, label: 'Admin' }] : []),
  ]

  return (
    <div className="min-h-screen bg-canvas">
      {/* Skip to content */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
        Skip to content
      </a>

      {/* Desktop Sidebar */}
      <nav className="nav-sidebar" aria-label="Main navigation">
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: '#3D3BF3' }}>
              <Layout className="text-white" size={16} />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">Soul of Universe</span>
          </div>
        </div>

        <div className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <SidebarLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
          ))}
        </div>

        <div className="px-3 py-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-white/60">
              <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/80 truncate">{user?.email}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{role}</p>
            </div>
          </div>
          <button
            onClick={confirmLogout}
            className="nav-item w-full text-white/40 hover:text-white/70"
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </nav>

      {/* Content Area */}
      <div className="content-area">
        <main id="main-content" className="max-w-[1200px] mx-auto px-6 py-8" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<HomePage user={user} role={role} />} />
            <Route path="/library" element={<VideoLibraryPage />} />
            <Route path="/scheduler" element={role === 'student' ? <BookingPage /> : <Navigate to="/" />} />
            <Route path="/admin" element={role === 'admin' ? <UserManagement /> : <Navigate to="/" />} />
          </Routes>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-50 px-2 py-2 flex justify-around">
        {navItems.map(item => (
          <MobileNavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
        ))}
        <button onClick={confirmLogout} className="flex flex-col items-center gap-1 py-1 px-3 text-text-muted">
          <LogOut size={20} />
          <span className="text-[10px] font-semibold">Exit</span>
        </button>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-surface rounded-xl border border-border p-6 max-w-sm w-full shadow-xl animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <LogOut size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text">Sign out?</h3>
                <p className="text-xs text-text-secondary">You'll need to sign in again to access your account.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={cancelLogout}
                className="btn-secondary flex-1 text-xs"
              >
                Stay signed in
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 text-xs font-semibold px-4 py-2 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SidebarLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}

function MobileNavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link to={to} className="flex flex-col items-center gap-1 py-1 px-3" aria-label={label}>
      <div className={`${isActive ? 'text-primary' : 'text-text-muted'}`}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { size: 20 })}
      </div>
      <span className={`text-[10px] font-semibold ${isActive ? 'text-primary' : 'text-text-muted'}`}>{label}</span>
    </Link>
  )
}

function HomePage({ user, role }: { user: any; role: any }) {
  const [upcomingSession, setUpcomingSession] = React.useState<any>(null)
  const [groupSessions, setGroupSessions] = React.useState<any[]>([])
  const [sessionsLoading, setSessionsLoading] = React.useState(true)

  React.useEffect(() => {
    if (!user) return

    const fetchSessions = async () => {
      setSessionsLoading(true)
      if (role === 'student') {
        const { data: appointments } = await supabase
          .from('appointments')
          .select('*')
          .eq('student_id', user.id)
          .eq('status', 'scheduled')
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(1)

        if (appointments && appointments.length > 0) {
          const session = appointments[0]
          const { data: mentorData } = await supabase.from('profiles').select('full_name').eq('id', session.mentor_id).single()
          setUpcomingSession({ ...session, mentor: mentorData })
        }
      }

      const { data: groups } = await supabase
        .from('group_sessions')
        .select(`
          *,
          mentor:profiles!group_sessions_mentor_id_fkey(full_name)
        `)
        .in('status', ['scheduled', 'live'])
        .gte('scheduled_start_time', new Date(Date.now() - 3600000).toISOString())
        .order('scheduled_start_time', { ascending: true })
        .limit(5)

      setGroupSessions(groups || [])
      setSessionsLoading(false)
    }

    fetchSessions()
  }, [user, role])

  if (role === 'admin') return <AdminDashboardPage />
  if (role === 'mentor') return <AdminSchedulerPage />

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-text tracking-tight">
          Welcome back, <span className="text-primary">Seeker</span>
        </h1>
        <p className="text-text-secondary text-sm mt-1">{user?.email}</p>
      </header>

      {/* Primary session card */}
      <section className="bg-primary rounded-lg p-6 text-white relative overflow-hidden">
        <div className="relative z-10">
          <p className="section-label text-white/50 mb-2">Your next session</p>
          {upcomingSession ? (
            <>
              <p className="text-sm text-white/70 font-medium mb-1">
                {new Date(upcomingSession.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
              <p className="text-lg font-bold mb-4">
                With {upcomingSession.mentor?.full_name || 'Mentor'}
              </p>
              <Link
                to={`/meeting/${upcomingSession.id}`}
                className="inline-flex items-center gap-2 bg-white text-primary px-5 py-2 rounded-md text-sm font-semibold active:scale-[0.98] transition-transform"
              >
                Join Session
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-white/70 mb-4">No upcoming sessions scheduled.</p>
              <Link
                to="/scheduler"
                className="inline-flex items-center gap-2 bg-white text-primary px-5 py-2 rounded-md text-sm font-semibold active:scale-[0.98] transition-transform"
              >
                Browse mentors
              </Link>
            </>
          )}
        </div>
        <div className="absolute top-[-30%] right-[-5%] w-48 h-48 bg-white/5 rounded-full" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Group Sessions */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-text tracking-tight">Group sessions</h2>
            <span className="section-label">{groupSessions.length} upcoming</span>
          </div>

          <div className="space-y-3">
            {sessionsLoading ? (
              <div className="card p-8 text-center">
                <OrbitalLoader variant="inline" />
              </div>
            ) : groupSessions.length > 0 ? (
              groupSessions.map((session, i) => (
                <div key={session.id} className={`card card-hover p-4 flex items-center gap-4 animate-fade-in stagger-${i + 1}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {session.status === 'live' ? (
                        <span className="badge badge-live">Live</span>
                      ) : (
                        <span className="badge badge-primary">Upcoming</span>
                      )}
                      <span className="text-xs text-text-muted font-medium">
                        {new Date(session.scheduled_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-text truncate">{session.title}</h3>
                    <p className="text-xs text-text-secondary mt-0.5">With {session.mentor?.full_name || 'Mentor'}</p>
                  </div>
                  <Link
                    to={`/meeting/${session.id}`}
                    className="btn-primary text-xs px-4 py-2 shrink-0"
                  >
                    Join
                  </Link>
                </div>
              ))
            ) : (
              <div className="card p-8 text-center space-y-2">
                <Calendar size={24} className="text-text-muted mx-auto" />
                <p className="text-sm font-semibold text-text">No upcoming sessions</p>
                <p className="text-xs text-text-secondary">Group sessions will appear here when scheduled.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar info */}
        <aside className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-bold text-text mb-3">Quick actions</h3>
            <div className="space-y-2">
              <Link to="/scheduler" className="btn-secondary w-full text-xs">
                <Calendar size={14} />
                Book a session
              </Link>
              <Link to="/library" className="btn-secondary w-full text-xs">
                <BookOpen size={14} />
                Browse library
              </Link>
            </div>
          </div>

          <div className="card p-5 bg-nav text-white">
            <p className="section-label text-white/30 mb-2">Daily insight</p>
            <p className="text-sm text-white/70 leading-relaxed italic">
              "The universe is not outside of you. Look inside yourself; everything that you want, you already are."
            </p>
            <p className="text-xs text-primary mt-3 font-semibold">Rumi</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
