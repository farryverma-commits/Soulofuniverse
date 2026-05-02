import React from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { Layout, Calendar, BookOpen, Video, User, Home as HomeIcon, LogOut, Loader2, Shield, ArrowUpRight } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { supabase } from './services/supabaseClient'

function App() {
  const { user, loading, role } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-light flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/" />} />

      {/* Protected Meeting Route (Full Screen) */}
      <Route 
        path="/meeting/:sessionId" 
        element={user ? <MeetingPage /> : <Navigate to="/login" />} 
      />

      {/* Protected App Routes */}
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
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Logout failed:', error.message)
    }
    // Force redirect to login as a fallback
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-surface-light pb-20 md:pb-0">
      <nav className="glass-nav px-4 md:px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
            <Layout className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-lg md:text-xl tracking-tight text-dark">Soul of Universe</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8">
          <NavLink to="/" icon={<HomeIcon className="w-4 h-4" />} label="Dashboard" />
          <NavLink to="/library" icon={<BookOpen className="w-4 h-4" />} label="Library" />
          {role === 'student' && (
            <NavLink to="/scheduler" icon={<Calendar className="w-4 h-4" />} label="Book Session" />
          )}
          {role === 'admin' && (
            <NavLink to="/admin" icon={<Shield className="w-4 h-4" />} label="User Management" />
          )}
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-red-50 rounded-full transition-colors group"
            title="Log Out"
          >
            <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
          </button>
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
             <User className="w-5 h-5 text-gray-500" />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <Routes>
          <Route path="/" element={<Home user={user} role={role} />} />
          <Route path="/library" element={<VideoLibraryPage />} />
          <Route path="/scheduler" element={role === 'student' ? <BookingPage /> : <Navigate to="/" />} />
          <Route path="/admin" element={role === 'admin' ? <UserManagement /> : <Navigate to="/" />} />
        </Routes>
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
        <MobileNavLink to="/" icon={<HomeIcon />} label="Home" />
        <MobileNavLink to="/library" icon={<BookOpen />} label="Library" />
        {role === 'student' && <MobileNavLink to="/scheduler" icon={<Calendar />} label="Book" />}
        {role === 'admin' && <MobileNavLink to="/admin" icon={<Layout />} label="Admin" />}
        <button onClick={handleLogout} className="flex flex-col items-center gap-1">
          <div className="p-1 rounded-lg text-gray-400">
            <LogOut className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Exit</span>
        </button>
      </div>
    </div>
  )
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation()
  const isActive = location.pathname === to
  
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-2 text-sm font-semibold transition-all ${
        isActive ? 'text-primary' : 'text-gray-500 hover:text-primary'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}

function MobileNavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link to={to} className="flex flex-col items-center gap-1">
      <div className={`p-1 rounded-lg transition-colors ${isActive ? 'text-primary bg-blue-50' : 'text-gray-400'}`}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { 
          className: 'w-6 h-6' 
        })}
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-primary' : 'text-gray-400'}`}>
        {label}
      </span>
    </Link>
  )
}

function Home({ user, role }: { user: any; role: any }) {
  const [upcomingSession, setUpcomingSession] = React.useState<any>(null)
  const [groupSessions, setGroupSessions] = React.useState<any[]>([])

  React.useEffect(() => {
    if (!user) return

    const fetchSessions = async () => {
      // 1. Fetch individual appointments if student
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

      // 2. Fetch upcoming group sessions
      const { data: groups } = await supabase
        .from('group_sessions')
        .select(`
          *,
          mentor:profiles!group_sessions_mentor_id_fkey(full_name)
        `)
        .in('status', ['scheduled', 'live'])
        .gte('scheduled_start_time', new Date(Date.now() - 3600000).toISOString()) // Include currently live ones
        .order('scheduled_start_time', { ascending: true })
        .limit(5)

      setGroupSessions(groups || [])
    }

    fetchSessions()
  }, [user, role])

  if (role === 'admin') return <AdminDashboardPage />
  if (role === 'mentor') return <AdminSchedulerPage />

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl md:text-5xl font-black text-dark tracking-tighter leading-tight">
            Welcome back, <span className="text-primary italic">Seeker</span>
          </h1>
          <p className="text-gray-500 font-medium text-lg">{user.email}</p>
        </div>
        <div className="flex gap-4">
          <div className="px-6 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-dark">System Online</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          <section className="card-premium h-64 flex flex-col justify-center items-center text-center space-y-4 bg-primary text-white border-none shadow-2xl shadow-primary/20 relative overflow-hidden group">
            <div className="relative z-10">
              <h2 className="text-2xl font-black tracking-tight">Your Next Session</h2>
              {upcomingSession ? (
                <>
                  <p className="text-blue-100 font-medium opacity-80 mb-2">
                    {new Date(upcomingSession.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                  <p className="text-white font-bold mb-6">
                    With {upcomingSession.mentor?.full_name || 'Mentor'}
                  </p>
                  <button className="bg-white text-primary px-8 py-3 rounded-xl font-black text-sm active:scale-95 transition-all shadow-xl inline-block">
                    Join Session
                  </button>
                </>
              ) : (
                <>
                  <p className="text-blue-100 font-medium opacity-80 mb-6">You have no upcoming sessions today.</p>
                  <Link 
                    to="/scheduler"
                    className="bg-white text-primary px-8 py-3 rounded-xl font-black text-sm active:scale-95 transition-all shadow-xl inline-block"
                  >
                    Browse Mentors
                  </Link>
                </>
              )}
            </div>
            <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-black text-dark tracking-tight">Continue Learning</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group cursor-pointer">
                <div className="h-48 bg-gray-100 rounded-[2.5rem] overflow-hidden border border-gray-200 relative">
                  <img src="https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80" className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-dark/60 to-transparent" />
                </div>
                <h4 className="mt-4 font-bold text-dark group-hover:text-primary transition-colors">Philosophy of Space</h4>
                <p className="text-xs text-gray-400 font-medium">Mentor Jendh • 45m</p>
              </div>
              <div className="group cursor-pointer">
                <div className="h-48 bg-gray-100 rounded-[2.5rem] overflow-hidden border border-gray-200 relative">
                  <img src="https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=800&q=80" className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-dark/60 to-transparent" />
                </div>
                <h4 className="mt-4 font-bold text-dark group-hover:text-primary transition-colors">Quantum Basics</h4>
                <p className="text-xs text-gray-400 font-medium">Mentor Sharan • 1h 20m</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <div className="card-premium space-y-6">
             <h3 className="font-black text-dark tracking-tight">Group Sessions</h3>
             <div className="space-y-4">
               {groupSessions.length > 0 ? (
                 groupSessions.map(session => (
                   <div key={session.id} className="flex flex-col gap-3 p-4 bg-surface-light rounded-2xl border border-gray-100 hover:border-primary/20 transition-all group">
                     <div className="flex justify-between items-start">
                        <div className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${session.status === 'live' ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-50 text-primary'}`}>
                          {session.status === 'live' ? 'Live Now' : 'Upcoming'}
                        </div>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {new Date(session.scheduled_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                     </div>
                     <div>
                       <h4 className="text-sm font-black text-dark leading-tight mb-1 group-hover:text-primary transition-colors">{session.title}</h4>
                       <p className="text-[10px] text-gray-500 font-medium">With {session.mentor?.full_name || 'Mentor'}</p>
                     </div>
                     <Link 
                        to={`/meeting/${session.id}`}
                        className="w-full py-2 bg-white border border-gray-200 rounded-xl text-center text-xs font-black text-dark hover:bg-primary hover:text-white hover:border-primary transition-all"
                      >
                        Join Room
                      </Link>
                   </div>
                 ))
               ) : (
                 <p className="text-xs text-gray-400 font-medium text-center py-4">No sessions scheduled.</p>
               )}
             </div>
             {role === 'mentor' && (
               <button className="w-full py-3 text-xs font-black text-primary hover:underline">+ Schedule Masterclass</button>
             )}
          </div>

          <div className="card-premium bg-dark text-white border-none space-y-4 shadow-xl">
            <h3 className="font-black">Daily Insight</h3>
            <p className="text-xs text-gray-400 font-medium leading-relaxed italic">
              "The universe is not outside of you. Look inside yourself; everything that you want, you already are."
            </p>
            <div className="pt-2 flex justify-between items-center">
              <span className="text-[10px] font-black uppercase text-primary tracking-widest">Rumi</span>
              <button className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all text-white">
                 <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
        <Layout className="w-10 h-10 text-gray-300" />
      </div>
      <h2 className="text-2xl font-bold text-dark">{title}</h2>
      <p className="text-gray-400 max-w-xs">We are currently building this section to give you the best experience.</p>
    </div>
  )
}

export default App
