import React, { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, Clock, Plus, Bell, MoreVertical, Trash2, CheckCircle2, X, Loader2 } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'

interface Availability {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

export const AdminSchedulerPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth)
  const [availability, setAvailability] = useState<Availability[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newSlot, setNewSlot] = useState({ day_of_week: 1, start_time: '09:00', end_time: '10:00' })
  const [saving, setSaving] = useState(false)
  const [groupSessions, setGroupSessions] = useState<any[]>([])
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [newGroup, setNewGroup] = useState({ title: '', description: '', scheduled_start_time: '', scheduled_end_time: '', require_approval: false, is_recorded: false })
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  useEffect(() => {
    fetchAvailability()
    fetchRequests()
    fetchGroupSessions()
  }, [user])

  const fetchGroupSessions = async () => {
    if (!user) return
    const { data } = await supabase
      .from('group_sessions')
      .select('*')
      .eq('mentor_id', user.id)
      .order('scheduled_start_time', { ascending: true })
    
    if (data) setGroupSessions(data)
  }

  const fetchRequests = async () => {
    if (!user) return
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('mentor_id', user.id)
      .eq('status', 'pending')
      .order('start_time', { ascending: true })

    if (data) {
      const studentIds = data.map(d => d.student_id)
      if (studentIds.length > 0) {
        const { data: students } = await supabase.from('profiles').select('id, full_name').in('id', studentIds)
        const requestsWithStudents = data.map(req => ({
          ...req,
          student: students?.find(s => s.id === req.student_id)
        }))
        setRequests(requestsWithStudents)
      } else {
        setRequests([])
      }
    }
  }

  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleUpdateStatus = async (id: string, status: 'scheduled' | 'declined') => {
    console.log('Updating appointment:', id, 'to status:', status)
    setUpdatingId(id)
    const { data, error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select()
    
    setUpdatingId(null)
    if (!error) {
      if (data && data.length > 0) {
        console.log('Update successful, updated row:', data[0])
        fetchRequests()
      } else {
        console.warn('Update affected 0 rows. This is usually an RLS policy issue.')
        alert('Update failed: You might not have permission to update this appointment. Please check your Supabase RLS policies.')
      }
    } else {
      console.error('Update failed:', error)
      alert(`Failed to update status: ${error.message}`)
    }
  }

  const fetchAvailability = async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('mentor_availability')
      .select('*')
      .eq('mentor_id', user.id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    if (!error && data) {
      setAvailability(data)
    }
    setLoading(false)
  }

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)

    const { error } = await supabase
      .from('mentor_availability')
      .insert([
        { 
          mentor_id: user.id, 
          day_of_week: newSlot.day_of_week, 
          start_time: newSlot.start_time, 
          end_time: newSlot.end_time 
        }
      ])

    if (!error) {
      setIsModalOpen(false)
      fetchAvailability()
    }
    setSaving(false)
  }

  const handleDeleteSlot = async (id: string) => {
    const { error } = await supabase
      .from('mentor_availability')
      .delete()
      .eq('id', id)

    if (!error) {
      fetchAvailability()
    }
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)

    const { error } = await supabase
      .from('group_sessions')
      .insert([
        { 
          mentor_id: user.id, 
          title: newGroup.title,
          description: newGroup.description,
          scheduled_start_time: new Date(newGroup.scheduled_start_time).toISOString(),
          scheduled_end_time: new Date(newGroup.scheduled_end_time).toISOString(),
          require_approval: newGroup.require_approval,
          is_recorded: newGroup.is_recorded,
          status: 'scheduled'
        }
      ])

    if (!error) {
      setIsGroupModalOpen(false)
      fetchGroupSessions()
    }
    setSaving(false)
  }

  const handleUpdateGroupStatus = async (id: string, action: 'start' | 'end') => {
    if (action === 'start') setStartingSessionId(id);
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ session_id: id, action }),
    });
    
    if (response.ok) {
      await fetchGroupSessions();
    } else {
      const err = await response.json();
      alert(`Error updating session: ${err.error}`);
    }
    if (action === 'start') setStartingSessionId(null);
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 relative">
      {/* Left Side: Weekly Availability Grid */}
      <div className="flex-1 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-dark tracking-tight">Weekly Availability</h1>
            <p className="text-sm text-gray-500 font-medium">Set your recurring time blocks for student bookings.</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setIsGroupModalOpen(true)}
              className="px-6 py-2.5 bg-dark text-white rounded-xl font-bold text-sm shadow-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New Masterclass
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="btn-primary flex items-center gap-2 py-2.5 shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Add Time Block
            </button>
          </div>
        </header>

        <div className="space-y-4">
           <h3 className="text-lg font-black text-dark tracking-tight">Scheduled Masterclasses</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupSessions.length > 0 ? (
                groupSessions.map(session => (
                  <div key={session.id} className="card-premium flex flex-col gap-4 border-2 border-transparent hover:border-primary/10 transition-all">
                    <div className="flex justify-between items-start">
                      <div className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${session.status === 'live' ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-50 text-primary'}`}>
                        {session.status}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-400 font-bold">
                          {new Date(session.scheduled_start_time).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-primary font-black">
                          {new Date(session.scheduled_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(session.scheduled_end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-black text-dark leading-tight mb-1">{session.title}</h4>
                      <p className="text-xs text-gray-500 line-clamp-2">{session.description}</p>
                    </div>
                    <div className="flex gap-2">
                      {session.status === 'scheduled' && (
                        <button 
                          onClick={() => handleUpdateGroupStatus(session.id, 'start')}
                          disabled={startingSessionId === session.id}
                          className="flex-1 py-2 bg-primary text-white text-xs font-black rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {startingSessionId === session.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Start Session'
                          )}
                        </button>
                      )}
                      {session.status === 'live' && (
                        <>
                          <button 
                            onClick={() => window.open(`/meeting/${session.id}`, '_blank')}
                            className="flex-1 py-2 bg-green-500 text-white text-xs font-black rounded-xl"
                          >
                            Enter Room
                          </button>
                          <button 
                            onClick={() => handleUpdateGroupStatus(session.id, 'end')}
                            className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-black rounded-xl"
                          >
                            End
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-8 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                  <p className="text-sm text-gray-400 font-medium">No masterclasses scheduled yet.</p>
                </div>
              )}
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {days.map((day, index) => (
            <DayCard 
              key={day} 
              day={day} 
              slots={availability.filter(a => a.day_of_week === index)} 
              onDelete={handleDeleteSlot}
            />
          ))}
        </div>
      </div>

      {/* Right Side: Request Management Sidebar */}
      <aside className="w-full lg:w-80 space-y-6">
        <div className="card-premium h-fit">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-lg text-dark">Session Requests</h2>
            <div className="relative">
              <Bell className="w-5 h-5 text-gray-400" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </div>
          </div>

          <div className="space-y-4">
            {requests.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No pending requests.</p>
            ) : (
              requests.map(req => (
                <RequestItem 
                  key={req.id}
                  student={req.student?.full_name || 'Anonymous Student'}
                  session="1-on-1 Session"
                  time={new Date(req.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  status="new"
                  isUpdating={updatingId === req.id}
                  onApprove={() => handleUpdateStatus(req.id, 'scheduled')}
                  onDecline={() => handleUpdateStatus(req.id, 'declined')}
                />
              ))
            )}
          </div>

          <button className="w-full mt-6 py-2 text-sm font-bold text-primary hover:underline transition-all">
            View All Requests
          </button>
        </div>

        <div className="card-premium bg-primary text-white border-none shadow-xl shadow-primary/20 relative overflow-hidden group">
          <div className="relative z-10">
            <h3 className="font-bold mb-1">Quick Broadcast</h3>
            <p className="text-xs text-blue-100 mb-4 opacity-80">Notify all students about newly available slots.</p>
            <button className="w-full bg-white text-primary py-2.5 rounded-xl text-sm font-black active:scale-95 transition-all shadow-lg">
              Broadcast Now
            </button>
          </div>
          <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
        </div>
      </aside>

      {/* Add Slot Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-xl text-dark">Add Availability</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleAddSlot} className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-dark uppercase tracking-widest ml-1">Day of the Week</label>
                <select 
                  className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-4 py-3 outline-none transition-all font-bold text-dark"
                  value={newSlot.day_of_week}
                  onChange={(e) => setNewSlot({ ...newSlot, day_of_week: parseInt(e.target.value) })}
                >
                  {days.map((day, i) => <option key={day} value={i}>{day}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-dark uppercase tracking-widest ml-1 text-center block">Start Time</label>
                  <input 
                    type="time" 
                    className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-4 py-3 outline-none transition-all font-bold text-dark text-center"
                    value={newSlot.start_time}
                    onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-dark uppercase tracking-widest ml-1 text-center block">End Time</label>
                  <input 
                    type="time" 
                    className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl px-4 py-3 outline-none transition-all font-bold text-dark text-center"
                    value={newSlot.end_time}
                    onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })}
                  />
                </div>
              </div>

              <button 
                disabled={saving}
                className="btn-primary w-full py-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Availability"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Group Session Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-xl text-dark">Schedule Masterclass</h2>
              <button onClick={() => setIsGroupModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <form onSubmit={handleCreateGroup} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-dark uppercase tracking-widest ml-1">Title</label>
                <input 
                  required
                  className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-xl px-4 py-3 outline-none transition-all font-bold text-dark"
                  value={newGroup.title}
                  onChange={(e) => setNewGroup({ ...newGroup, title: e.target.value })}
                  placeholder="The Quantum Soul"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-dark uppercase tracking-widest ml-1">Description</label>
                <textarea 
                  className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-xl px-4 py-3 outline-none transition-all font-medium text-dark text-sm h-24"
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  placeholder="Deep dive into quantum consciousness..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-dark uppercase tracking-widest ml-1">Start Time</label>
                  <input 
                    required
                    type="datetime-local"
                    className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-xl px-4 py-3 outline-none transition-all font-bold text-dark text-sm"
                    value={newGroup.scheduled_start_time}
                    onChange={(e) => setNewGroup({ ...newGroup, scheduled_start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-dark uppercase tracking-widest ml-1">End Time</label>
                  <input 
                    required
                    type="datetime-local"
                    className="w-full bg-surface-light border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-xl px-4 py-3 outline-none transition-all font-bold text-dark text-sm"
                    value={newGroup.scheduled_end_time}
                    onChange={(e) => setNewGroup({ ...newGroup, scheduled_end_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex-1 flex items-center gap-2 cursor-pointer p-3 bg-surface-light rounded-xl border border-transparent hover:border-primary/10">
                  <input 
                    type="checkbox" 
                    checked={newGroup.require_approval}
                    onChange={(e) => setNewGroup({ ...newGroup, require_approval: e.target.checked })}
                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary"
                  />
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Wait Room</span>
                </label>
                <label className="flex-1 flex items-center gap-2 cursor-pointer p-3 bg-surface-light rounded-xl border border-transparent hover:border-primary/10">
                  <input 
                    type="checkbox" 
                    checked={newGroup.is_recorded}
                    onChange={(e) => setNewGroup({ ...newGroup, is_recorded: e.target.checked })}
                    className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary"
                  />
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Record</span>
                </label>
              </div>

              <button 
                disabled={saving}
                className="btn-primary w-full py-4 mt-2 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Masterclass"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function DayCard({ day, slots, onDelete }: { day: string; slots: Availability[]; onDelete: (id: string) => void }) {
  return (
    <div className="card-premium hover:border-primary/20 transition-all border-2 border-transparent">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-black text-dark tracking-tight">{day}</h3>
        <button className="text-gray-300 hover:text-primary transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
      
      <div className="space-y-2">
        {slots.length > 0 ? slots.map(slot => (
          <div key={slot.id} className="flex items-center justify-between group bg-surface-light p-2.5 rounded-xl border border-transparent hover:border-primary/10 transition-all">
            <div className="flex items-center gap-2 text-xs font-black text-gray-700">
              <Clock className="w-3.5 h-3.5 text-primary" />
              {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
            </div>
            <button 
              onClick={() => onDelete(slot.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all active:scale-90"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )) : (
          <div className="py-4 flex flex-col items-center justify-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">No slots</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RequestItem({ student, session, time, status = 'new', isUpdating, onApprove, onDecline }: { student: string; session: string; time: string; status?: string; isUpdating?: boolean; onApprove: () => void; onDecline: () => void }) {
  return (
    <div className={`p-3 bg-surface-light rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all group ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center text-primary font-black text-xs border border-gray-100">
            {student ? student.split(' ').map(n => n[0]).join('').substring(0, 2) : '?'}
          </div>
          <div>
            <h4 className="text-[11px] font-black text-dark leading-none">{student}</h4>
            <span className="text-[10px] text-gray-400 font-bold">{time}</span>
          </div>
        </div>
        {status === 'new' && <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />}
      </div>
      <p className="text-[10px] font-bold text-gray-500 truncate pl-11">{session}</p>
      
      <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
        <button 
          onClick={(e) => { e.stopPropagation(); onApprove(); }} 
          className="flex-1 bg-primary text-white text-[10px] font-black py-2 rounded-xl active:scale-95 transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-1"
        >
          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDecline(); }} 
          className="flex-1 bg-white text-gray-400 border border-gray-100 text-[10px] font-black py-2 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1"
        >
          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Decline"}
        </button>
      </div>
    </div>
  )
}
