import React, { useState, useEffect } from 'react'
import { Users, Video, Calendar, Activity, ArrowUpRight, Shield, Settings, Server, ExternalLink, MoreHorizontal, UserCheck, UserPlus } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'

interface Stats {
  totalStudents: number
  totalMentors: number
  totalSessions: number
  activeBookings: number
}

export const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    totalMentors: 0,
    totalSessions: 0,
    activeBookings: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    // Fetch counts from Supabase
    const { count: students } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student')
    const { count: mentors } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'mentor')
    const { count: sessions } = await supabase.from('sessions').select('*', { count: 'exact', head: true })
    const { count: bookings } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'scheduled')

    setStats({
      totalStudents: students || 0,
      totalMentors: mentors || 0,
      totalSessions: sessions || 0,
      activeBookings: bookings || 0
    })
    setLoading(false)
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-md border border-primary/10">System Admin</span>
          </div>
          <h1 className="text-3xl font-black text-dark tracking-tighter">Platform Control Center</h1>
          <p className="text-gray-500 font-medium">Monitoring the pulse of Soul of Universe LMS.</p>
        </div>
        
        <div className="flex gap-3">
          <button className="p-3 bg-white rounded-2xl border border-gray-100 shadow-sm text-gray-400 hover:text-primary transition-all">
            <Settings className="w-6 h-6" />
          </button>
          <button className="btn-primary px-6 py-3 flex items-center gap-2 shadow-lg shadow-primary/20">
            <Shield className="w-5 h-5" /> Global Security
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Active Students" value={stats.totalStudents} icon={<Users />} trend="+12%" color="bg-blue-500" />
        <StatCard title="Total Mentors" value={stats.totalMentors} icon={<UserCheck />} trend="+3%" color="bg-purple-500" />
        <StatCard title="VOD Content" value={stats.totalSessions} icon={<Video />} trend="+5%" color="bg-orange-500" />
        <StatCard title="Active Bookings" value={stats.activeBookings} icon={<Calendar />} trend="+18%" color="bg-green-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card-premium">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-black text-dark tracking-tight">System Logs</h2>
              <button className="text-xs font-bold text-primary hover:underline">Download CSV</button>
            </div>
            
            <div className="space-y-1">
              <LogItem icon={<UserPlus />} title="New Student Registration" description="jendh@soulofuniverse.com joined the platform" time="2 mins ago" />
              <LogItem icon={<Calendar />} title="Session Scheduled" description="Quantum Mechanics with Mentor Sharan" time="15 mins ago" />
              <LogItem icon={<Activity />} title="LiveKit Token Generated" description="Session ID: session_99283 - Peer: student_01" time="1 hour ago" />
              <LogItem icon={<Server />} title="MediaCMS Sync Complete" description="Successfully ingested 4 new HLS streams" time="3 hours ago" />
            </div>
            
            <button className="w-full mt-8 py-4 bg-surface-light text-gray-500 text-sm font-bold rounded-2xl hover:bg-gray-100 transition-all">
              View Full Audit Trail
            </button>
          </div>
        </div>

        {/* System Health */}
        <div className="space-y-6">
          <div className="card-premium h-fit">
            <h2 className="text-xl font-black text-dark tracking-tight mb-8">Infrastructure</h2>
            
            <div className="space-y-6">
              <HealthItem label="Supabase Auth & DB" status="Operational" delay="12ms" />
              <HealthItem label="MediaCMS (Self-Hosted)" status="Operational" delay="45ms" />
              <HealthItem label="LiveKit SFU" status="Operational" delay="8ms" />
            </div>

            <div className="mt-10 p-5 bg-dark rounded-[2rem] text-white">
              <h4 className="text-xs font-black uppercase tracking-widest text-primary mb-2">Cloud Usage</h4>
              <div className="flex justify-between items-end mb-2">
                <span className="text-2xl font-black">42%</span>
                <span className="text-[10px] text-gray-500 font-bold">Storage Capacity</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full w-[42%]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, trend, color }: { title: string; value: number; icon: React.ReactNode; trend: string; color: string }) {
  return (
    <div className="card-premium group hover:border-primary/20 transition-all">
      <div className="flex justify-between items-start mb-6">
        <div className={`p-3 rounded-2xl text-white shadow-lg ${color} shadow-${color.split('-')[1]}-500/20`}>
          {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}
        </div>
        <span className="text-[10px] font-black text-green-500 bg-green-50 px-2 py-1 rounded-lg flex items-center gap-1">
          {trend} <ArrowUpRight className="w-3 h-3" />
        </span>
      </div>
      <h3 className="text-gray-400 font-bold text-xs uppercase tracking-widest mb-1">{title}</h3>
      <p className="text-4xl font-black text-dark tracking-tighter">{value}</p>
    </div>
  )
}

function LogItem({ icon, title, description, time }: { icon: React.ReactNode; title: string; description: string; time: string }) {
  return (
    <div className="flex gap-4 p-4 hover:bg-surface-light rounded-2xl transition-all group">
      <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors border border-gray-50">
        {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start">
          <h4 className="text-sm font-black text-dark tracking-tight">{title}</h4>
          <span className="text-[10px] text-gray-300 font-bold uppercase">{time}</span>
        </div>
        <p className="text-xs text-gray-500 font-medium">{description}</p>
      </div>
    </div>
  )
}

function HealthItem({ label, status, delay }: { label: string; status: string; delay: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h4 className="text-xs font-black text-dark uppercase tracking-tight">{label}</h4>
        <span className="text-[10px] text-gray-400 font-bold italic">Lat: {delay}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">{status}</span>
      </div>
    </div>
  )
}
