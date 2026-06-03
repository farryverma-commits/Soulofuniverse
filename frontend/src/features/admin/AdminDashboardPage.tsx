import React, { useState, useEffect } from 'react'
import { Users, Video, Calendar, Activity, ArrowUpRight, Shield, Settings, Server, UserCheck, UserPlus } from 'lucide-react'
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
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge badge-accent">System admin</span>
          </div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Platform control center</h1>
          <p className="text-text-secondary text-sm mt-0.5">Monitoring the pulse of Soul of Universe.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs py-2">
            <Settings size={14} /> Settings
          </button>
          <button className="btn-primary text-xs py-2">
            <Shield size={14} /> Security
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Seekers" value={stats.totalStudents} icon={<Users size={16} />} trend="+12%" color="var(--color-primary)" />
        <StatCard title="Mentors" value={stats.totalMentors} icon={<UserCheck size={16} />} trend="+3%" color="var(--color-accent)" />
        <StatCard title="VOD content" value={stats.totalSessions} icon={<Video size={16} />} trend="+5%" color="var(--color-warning)" />
        <StatCard title="Active bookings" value={stats.activeBookings} icon={<Calendar size={16} />} trend="+18%" color="var(--color-success)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card card-glow p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-text">System logs</h2>
              <button className="text-xs font-semibold text-primary hover:text-primary-hover transition-colors">Export CSV</button>
            </div>

            <div className="divide-y divide-border">
              <LogItem icon={<UserPlus size={14} />} title="New seeker joined" description="jendh@soulofuniverse.com began their journey" time="2 min ago" />
              <LogItem icon={<Calendar size={14} />} title="Session scheduled" description="Quantum Mechanics with Mentor Sharan" time="15 min ago" />
              <LogItem icon={<Activity size={14} />} title="LiveKit token generated" description="Session ID: session_99283" time="1 hr ago" />
              <LogItem icon={<Server size={14} />} title="MediaCMS sync complete" description="Ingested 4 new HLS streams" time="3 hr ago" />
            </div>

            <button className="w-full mt-4 py-2.5 bg-surface-raised text-text-secondary text-xs font-semibold rounded-lg hover:text-text transition-colors">
              View full audit trail
            </button>
          </div>
        </div>

        <div>
          <div className="card card-glow p-5">
            <h2 className="text-sm font-bold text-text mb-5">Infrastructure</h2>

            <div className="space-y-3">
              <HealthItem label="Supabase Auth & DB" status="Operational" delay="12ms" />
              <HealthItem label="MediaCMS (Self-Hosted)" status="Operational" delay="45ms" />
              <HealthItem label="LiveKit SFU" status="Operational" delay="8ms" />
            </div>

            <div className="mt-5 p-4 bg-surface-raised rounded-xl border border-border">
              <p className="section-label mb-2">Cloud usage</p>
              <div className="flex justify-between items-end mb-2.5">
                <span className="text-2xl font-bold text-text">42%</span>
                <span className="text-[10px] text-text-muted font-medium">Storage capacity</span>
              </div>
              <div className="w-full bg-white/[0.04] h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: '42%' }} />
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
    <div className="card card-hover p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: color }}>
          {icon}
        </div>
        <span className="text-[10px] font-semibold text-success flex items-center gap-0.5">
          {trend} <ArrowUpRight size={10} />
        </span>
      </div>
      <p className="section-label mb-1">{title}</p>
      <p className="text-2xl font-bold text-text tracking-tight">{value}</p>
    </div>
  )
}

function LogItem({ icon, title, description, time }: { icon: React.ReactNode; title: string; description: string; time: string }) {
  return (
    <div className="flex gap-3 py-3.5 hover:bg-surface-raised transition-colors -mx-1 px-1 rounded-lg">
      <div className="w-8 h-8 rounded-xl bg-surface-raised border border-border flex items-center justify-center text-text-muted shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <h4 className="text-xs font-semibold text-text truncate">{title}</h4>
          <span className="text-[10px] text-text-muted font-medium shrink-0">{time}</span>
        </div>
        <p className="text-xs text-text-secondary mt-0.5 truncate">{description}</p>
      </div>
    </div>
  )
}

function HealthItem({ label, status, delay }: { label: string; status: string; delay: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h4 className="text-xs font-semibold text-text">{label}</h4>
        <span className="text-[10px] text-text-muted font-medium">Lat: {delay}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 bg-success rounded-full" />
        <span className="text-[10px] font-semibold text-success uppercase tracking-wider">{status}</span>
      </div>
    </div>
  )
}
