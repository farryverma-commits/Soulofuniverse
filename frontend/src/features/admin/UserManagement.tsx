import React, { useState, useEffect } from 'react'
import { Search, Filter, UserCircle, Mail, Calendar, Edit, Trash2 } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'

interface Profile {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) setUsers(data)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">User management</h1>
          <p className="text-text-secondary text-sm mt-0.5">Oversee the community across the cosmos.</p>
        </div>
        <button className="btn-primary text-xs py-2">
          <UserCircle size={14} /> Export users
        </button>
      </header>

      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name or email..."
            className="input pl-10 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <select className="input text-xs py-2 pr-8 w-auto">
            <option>All roles</option>
            <option>Students</option>
            <option>Mentors</option>
            <option>Admins</option>
          </select>
          <button className="btn-secondary text-xs py-2 px-3">
            <Filter size={14} />
          </button>
        </div>
      </div>

      <div className="card overflow-hidden card-glow">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3.5 section-label">User</th>
                <th className="px-4 py-3.5 section-label">Role</th>
                <th className="px-4 py-3.5 section-label">Joined</th>
                <th className="px-4 py-3.5 section-label text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-surface-raised transition-colors group">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center text-primary font-bold text-xs">
                        {user.full_name?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-text truncate">{user.full_name || 'New seeker'}</h4>
                        <span className="text-[11px] text-text-muted font-medium flex items-center gap-1 mt-0.5">
                          <Mail size={10} /> {user.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`badge ${
                      user.role === 'admin' ? 'badge-accent' :
                      user.role === 'mentor' ? 'badge-primary' :
                      'badge-success'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-text-secondary font-medium flex items-center gap-1">
                      <Calendar size={12} className="text-text-muted" />
                      {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-text-muted hover:text-primary hover:bg-primary-light rounded-lg transition-colors">
                        <Edit size={14} />
                      </button>
                      <button className="p-2 text-text-muted hover:text-error hover:bg-error-light rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && !loading && (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mx-auto">
              <UserCircle className="w-6 h-6 text-text-muted" />
            </div>
            <p className="text-sm text-text-secondary font-medium">No seekers in the cosmos yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
