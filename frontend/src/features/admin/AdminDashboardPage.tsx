import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Video,
  Calendar,
  Activity,
  ArrowUpRight,
  Shield,
  Settings,
  Server,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { UserApproval } from "./UserApproval";
import { CreateMentor } from "./CreateMentor";
import { OrbitalLoader } from "../../components/OrbitalLoader";

interface Stats {
  totalStudents: number;
  totalMentors: number;
  totalSessions: number;
  activeBookings: number;
}

export const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    totalMentors: 0,
    totalSessions: 0,
    activeBookings: 0,
  });
  const [groupSessions, setGroupSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchGroupSessions();
  }, []);

  const fetchStats = async () => {
    const { count: students } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "student");
    const { count: mentors } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "mentor");
    const { count: sessions } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true });
    const { count: bookings } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("status", "scheduled");

    setStats({
      totalStudents: students || 0,
      totalMentors: mentors || 0,
      totalSessions: sessions || 0,
      activeBookings: bookings || 0,
    });
    setLoading(false);
  };

  const fetchGroupSessions = async () => {
    setSessionsLoading(true);
    const { data } = await supabase
      .from("group_sessions")
      .select(`*, mentor:profiles!group_sessions_mentor_id_fkey(full_name)`)
      .in("status", ["scheduled", "live"])
      .order("scheduled_start_time", { ascending: true })
      .limit(10);
    setGroupSessions(data || []);
    setSessionsLoading(false);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge badge-accent">System admin</span>
          </div>
          <h1 className="text-2xl font-bold text-text tracking-tight">
            Platform control center
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Monitoring the pulse of Soul of Universe.
          </p>
        </div>
        <div className="flex gap-2">
          <CreateMentor />
          <button className="btn-secondary text-xs py-2">
            <Settings size={14} /> Settings
          </button>
          <button className="btn-primary text-xs py-2">
            <Shield size={14} /> Security
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Seekers"
          value={stats.totalStudents}
          icon={<Users size={16} />}
          trend="+12%"
          color="var(--color-primary)"
        />
        <StatCard
          title="Mentors"
          value={stats.totalMentors}
          icon={<UserCheck size={16} />}
          trend="+3%"
          color="var(--color-accent)"
        />
        <StatCard
          title="VOD content"
          value={stats.totalSessions}
          icon={<Video size={16} />}
          trend="+5%"
          color="var(--color-warning)"
        />
        <StatCard
          title="Active bookings"
          value={stats.activeBookings}
          icon={<Calendar size={16} />}
          trend="+18%"
          color="var(--color-success)"
        />
      </div>

      {/* Pending Approvals Section */}
      <div className="card card-glow p-6">
        <UserApproval />
      </div>

      {/* Group Sessions — admin can monitor and join any session */}
      <div className="card card-glow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-text">Group Sessions</h2>
          {!sessionsLoading && (
            <span className="section-label">
              {groupSessions.length} sessions
            </span>
          )}
        </div>

        {sessionsLoading ? (
          <div className="py-8 flex items-center justify-center">
            <OrbitalLoader variant="inline" />
          </div>
        ) : groupSessions.length === 0 ? (
          <p className="text-sm text-text-secondary text-center py-8">
            No group sessions scheduled.
          </p>
        ) : (
          <div className="space-y-2">
            {groupSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border hover:border-border-strong transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    {session.status === "live" ? (
                      <span className="badge badge-live">Live</span>
                    ) : (
                      <span className="badge badge-primary">Upcoming</span>
                    )}
                    <span className="text-xs text-text-muted font-medium">
                      {new Date(session.scheduled_start_time).toLocaleString(
                        [],
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        },
                      )}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-text truncate">
                    {session.title}
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Mentor: {session.mentor?.full_name || "—"}
                  </p>
                </div>
                <Link
                  to={`/meeting/${session.id}`}
                  className="btn-primary text-xs px-4 py-2 shrink-0 ml-3"
                >
                  Join
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function StatCard({
  title,
  value,
  icon,
  trend,
  color,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend: string;
  color: string;
}) {
  return (
    <div className="card card-hover p-4">
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
          style={{ background: color }}
        >
          {icon}
        </div>
        <span className="text-[10px] font-semibold text-success flex items-center gap-0.5">
          {trend} <ArrowUpRight size={10} />
        </span>
      </div>
      <p className="section-label mb-1">{title}</p>
      <p className="text-2xl font-bold text-text tracking-tight">{value}</p>
    </div>
  );
}

function LogItem({
  icon,
  title,
  description,
  time,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="flex gap-3 py-3.5 hover:bg-surface-raised transition-colors -mx-1 px-1 rounded-lg">
      <div className="w-8 h-8 rounded-xl bg-surface-raised border border-border flex items-center justify-center text-text-muted shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <h4 className="text-xs font-semibold text-text truncate">{title}</h4>
          <span className="text-[10px] text-text-muted font-medium shrink-0">
            {time}
          </span>
        </div>
        <p className="text-xs text-text-secondary mt-0.5 truncate">
          {description}
        </p>
      </div>
    </div>
  );
}

function HealthItem({
  label,
  status,
  delay,
}: {
  label: string;
  status: string;
  delay: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h4 className="text-xs font-semibold text-text">{label}</h4>
        <span className="text-[10px] text-text-muted font-medium">
          Lat: {delay}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 bg-success rounded-full" />
        <span className="text-[10px] font-semibold text-success uppercase tracking-wider">
          {status}
        </span>
      </div>
    </div>
  );
}
