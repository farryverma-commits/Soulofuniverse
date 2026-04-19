import React, { useState, useEffect } from 'react'
import { Search, Filter, MoreVertical, UserCircle, Mail, Calendar, Shield, Trash2, Edit } from 'lucide-react'
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
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-dark tracking-tighter">User Management</h1>
          <p className="text-gray-500 font-medium">Manage permissions and oversee the Soul of Universe community.</p>
        </div>
        <button className="btn-primary px-6 py-2.5 flex items-center gap-2">
          <UserCircle className="w-5 h-5" /> Export Users
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by name or email..." 
            className="w-full bg-white border border-gray-100 rounded-2xl py-3 pl-12 pr-4 font-bold text-dark outline-none shadow-sm focus:border-primary/20 transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select className="bg-white border border-gray-100 rounded-xl px-4 py-2 text-xs font-bold text-gray-500 outline-none shadow-sm">
            <option>All Roles</option>
            <option>Students</option>
            <option>Mentors</option>
            <option>Admins</option>
          </select>
          <button className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm text-gray-400">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="card-premium overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-light border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">User</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Role</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">Joined</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-light flex items-center justify-center text-primary font-black text-xs border border-gray-100">
                        {user.full_name?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-dark leading-none">{user.full_name || 'New Seeker'}</h4>
                        <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1 mt-1">
                          <Mail className="w-3 h-3" /> {user.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                      user.role === 'admin' ? 'bg-purple-50 text-purple-600' :
                      user.role === 'mentor' ? 'bg-blue-50 text-blue-600' :
                      'bg-green-50 text-green-600'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-500 font-bold flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-300" /> 
                      {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button className="p-2 text-gray-400 hover:text-primary hover:bg-white rounded-lg transition-all shadow-sm">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-all shadow-sm">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && !loading && (
          <div className="py-20 text-center space-y-2">
            <UserCircle className="w-12 h-12 text-gray-200 mx-auto" />
            <p className="text-gray-400 font-bold">No users found on the platform yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
