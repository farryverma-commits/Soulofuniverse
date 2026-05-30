import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar as CalendarIcon, Clock, Plus, Bell, Trash2, X } from 'lucide-react'
import { OrbitalLoader } from '../../components/OrbitalLoader'
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
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const closeSlotModal = useCallback(() => setIsModalOpen(false), [])
  const closeGroupModal = useCallback(() => setIsGroupModalOpen(false), [])

  useEffect(() => {
    if (!isModalOpen && !isGroupModalOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isModalOpen) closeSlotModal()
        else if (isGroupModalOpen) closeGroupModal()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isModalOpen, isGroupModalOpen, closeSlotModal, closeGroupModal])

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
        setRequests(data.map(req => ({
          ...req,
          student: students?.find(s => s.id === req.student_id)
        })))
      } else {
        setRequests([])
      }
    }
  }

  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const handleUpdateStatus = async (id: string, status: 'scheduled' | 'declined') => {
    setUpdatingId(id)
    const { data, error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select()
    setUpdatingId(null)
    if (!error && data && data.length > 0) {
      fetchRequests()
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
    if (!error && data) setAvailability(data)
    setLoading(false)
  }

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('mentor_availability')
      .insert([{ mentor_id: user.id, day_of_week: newSlot.day_of_week, start_time: newSlot.start_time, end_time: newSlot.end_time }])
    if (!error) { setIsModalOpen(false); fetchAvailability() }
    setSaving(false)
  }

  const handleDeleteSlot = async (id: string) => {
    const { error } = await supabase.from('mentor_availability').delete().eq('id', id)
    if (!error) fetchAvailability()
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('group_sessions')
      .insert([{
        mentor_id: user.id,
        title: newGroup.title,
        description: newGroup.description,
        scheduled_start_time: new Date(newGroup.scheduled_start_time).toISOString(),
        scheduled_end_time: new Date(newGroup.scheduled_end_time).toISOString(),
        require_approval: newGroup.require_approval,
        is_recorded: newGroup.is_recorded,
        status: 'scheduled'
      }])
    if (!error) { setIsGroupModalOpen(false); fetchGroupSessions() }
    setSaving(false)
  }

  const handleUpdateGroupStatus = async (id: string, action: 'start' | 'end') => {
    if (action === 'start') setStartingSessionId(id)
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ session_id: id, action }),
    })
    if (response.ok) {
      await fetchGroupSessions()
      setSessionError(null)
    } else {
      const err = await response.json()
      setSessionError(err.error || 'Session action failed. Please try again.')
    }
    if (action === 'start') setStartingSessionId(null)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 relative">
      {/* Main: availability + masterclasses */}
      <div className="flex-1 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">Weekly availability</h1>
            <p className="text-text-secondary text-sm mt-0.5">Set your recurring time blocks for student bookings.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsGroupModalOpen(true)} className="btn-secondary text-xs py-2">
              <Plus size={14} /> New masterclass
            </button>
            <button onClick={() => setIsModalOpen(true)} className="btn-primary text-xs py-2">
              <Plus size={14} /> Add time block
            </button>
          </div>
        </header>

        {sessionError && (
          <div className="bg-error-light border border-error/20 rounded-md p-3 flex items-center justify-between animate-fade-in">
            <p className="text-xs font-semibold text-error">{sessionError}</p>
            <button onClick={() => setSessionError(null)} className="text-error/60 hover:text-error transition-colors p-1" aria-label="Dismiss error">
              <span className="text-lg leading-none">&times;</span>
            </button>
          </div>
        )}

        {/* Group sessions */}
        <section>
          <h3 className="text-sm font-bold text-text mb-3">Scheduled masterclasses</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupSessions.length > 0 ? (
              groupSessions.map(session => (
                <div key={session.id} className="card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`badge ${session.status === 'live' ? 'badge-live' : 'badge-primary'}`}>
                      {session.status}
                    </span>
                    <span className="text-[10px] text-text-muted font-medium">
                      {new Date(session.scheduled_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-text mb-1">{session.title}</h4>
                  <p className="text-xs text-text-secondary line-clamp-2 mb-3">{session.description}</p>
                  <div className="flex gap-2">
                    {session.status === 'scheduled' && (
                      <button
                        onClick={() => handleUpdateGroupStatus(session.id, 'start')}
                        disabled={startingSessionId === session.id}
                        className="btn-primary text-xs py-1.5 flex-1"
                      >
                        {startingSessionId === session.id ? <OrbitalLoader variant="button" /> : 'Start session'}
                      </button>
                    )}
                    {session.status === 'live' && (
                      <>
                        <button onClick={() => window.open(`/meeting/${session.id}`, '_blank')} className="btn-primary text-xs py-1.5 flex-1 bg-success hover:bg-success/90">
                          Enter room
                        </button>
                        <button onClick={() => handleUpdateGroupStatus(session.id, 'end')} className="btn-secondary text-xs py-1.5">
                          End
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-8 text-center border border-dashed border-border rounded-md">
                <p className="text-xs text-text-muted font-medium">No masterclasses scheduled yet.</p>
              </div>
            )}
          </div>
        </section>

        {/* Day grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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

      {/* Sidebar: requests + broadcast */}
      <aside className="w-full lg:w-72 space-y-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-text">Session requests</h2>
            <div className="relative">
              <Bell size={16} className="text-text-muted" />
              {requests.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-error rounded-full" />
              )}
            </div>
          </div>

          <div className="space-y-3">
            {requests.length === 0 ? (
              <p className="text-xs text-text-muted italic">No pending requests.</p>
            ) : (
              requests.map(req => (
                <RequestItem
                  key={req.id}
                  student={req.student?.full_name || 'Anonymous'}
                  time={new Date(req.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  isUpdating={updatingId === req.id}
                  onApprove={() => handleUpdateStatus(req.id, 'scheduled')}
                  onDecline={() => handleUpdateStatus(req.id, 'declined')}
                />
              ))
            )}
          </div>
        </div>

        <div className="card p-4 bg-nav text-white">
          <p className="section-label text-white/30 mb-1">Quick broadcast</p>
          <p className="text-xs text-white/50 mb-3">Notify all students about new slots.</p>
          <button className="btn-primary w-full text-xs py-2">
            Broadcast now
          </button>
        </div>
      </aside>

      {/* Add Slot Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-nav/40 z-[60] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Add availability">
          <div className="bg-surface w-full max-w-md rounded-lg shadow-2xl border border-border overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-sm font-bold text-text">Add availability</h2>
              <button onClick={closeSlotModal} className="p-1.5 hover:bg-canvas rounded transition-colors" aria-label="Close">
                <X size={16} className="text-text-muted" />
              </button>
            </div>
            <form onSubmit={handleAddSlot} className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="slot-day" className="text-xs font-semibold text-text">Day of the week</label>
                <select id="slot-day" className="input text-sm" value={newSlot.day_of_week} onChange={(e) => setNewSlot({ ...newSlot, day_of_week: parseInt(e.target.value) })}>
                  {days.map((day, i) => <option key={day} value={i}>{day}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="slot-start" className="text-xs font-semibold text-text">Start time</label>
                  <input id="slot-start" type="time" className="input text-sm text-center" value={newSlot.start_time} onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="slot-end" className="text-xs font-semibold text-text">End time</label>
                  <input id="slot-end" type="time" className="input text-sm text-center" value={newSlot.end_time} onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })} />
                </div>
              </div>
              <button disabled={saving} className="btn-primary w-full py-2.5">
                {saving ? <OrbitalLoader variant="button" /> : "Save availability"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Group Session Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-nav/40 z-[60] flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Schedule masterclass">
          <div className="bg-surface w-full max-w-md rounded-lg shadow-2xl border border-border overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-sm font-bold text-text">Schedule masterclass</h2>
              <button onClick={closeGroupModal} className="p-1.5 hover:bg-canvas rounded transition-colors" aria-label="Close">
                <X size={16} className="text-text-muted" />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="p-4 space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="group-title" className="text-xs font-semibold text-text">Title</label>
                <input id="group-title" required className="input text-sm" value={newGroup.title} onChange={(e) => setNewGroup({ ...newGroup, title: e.target.value })} placeholder="The quantum soul" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="group-desc" className="text-xs font-semibold text-text">Description</label>
                <textarea id="group-desc" className="input text-sm h-20 resize-none" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} placeholder="Deep dive into quantum consciousness..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="group-start" className="text-xs font-semibold text-text">Start time</label>
                  <input id="group-start" required type="datetime-local" className="input text-sm" value={newGroup.scheduled_start_time} onChange={(e) => setNewGroup({ ...newGroup, scheduled_start_time: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="group-end" className="text-xs font-semibold text-text">End time</label>
                  <input id="group-end" required type="datetime-local" className="input text-sm" value={newGroup.scheduled_end_time} onChange={(e) => setNewGroup({ ...newGroup, scheduled_end_time: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3">
                <label className="flex-1 flex items-center gap-2 cursor-pointer p-2.5 bg-canvas rounded-md border border-border hover:border-border-strong transition-colors">
                  <input type="checkbox" checked={newGroup.require_approval} onChange={(e) => setNewGroup({ ...newGroup, require_approval: e.target.checked })} className="w-3.5 h-3.5 rounded accent-primary" />
                  <span className="text-[11px] font-semibold text-text-secondary">Wait room</span>
                </label>
                <label className="flex-1 flex items-center gap-2 cursor-pointer p-2.5 bg-canvas rounded-md border border-border hover:border-border-strong transition-colors">
                  <input type="checkbox" checked={newGroup.is_recorded} onChange={(e) => setNewGroup({ ...newGroup, is_recorded: e.target.checked })} className="w-3.5 h-3.5 rounded accent-primary" />
                  <span className="text-[11px] font-semibold text-text-secondary">Record</span>
                </label>
              </div>
              <button disabled={saving} className="btn-primary w-full py-2.5 mt-1">
                {saving ? <OrbitalLoader variant="button" /> : "Create masterclass"}
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
    <div className="card p-3">
      <h3 className="text-xs font-bold text-text mb-2">{day}</h3>
      <div className="space-y-1.5">
        {slots.length > 0 ? slots.map(slot => (
          <div key={slot.id} className="flex items-center justify-between group bg-canvas p-2 rounded border border-border hover:border-border-strong transition-colors">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <Clock size={12} className="text-primary" />
              {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
            </div>
            <button
              onClick={() => onDelete(slot.id)}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all p-0.5"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )) : (
          <div className="py-3 text-center border border-dashed border-border rounded">
            <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">No slots</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RequestItem({ student, time, isUpdating, onApprove, onDecline }: { student: string; time: string; isUpdating?: boolean; onApprove: () => void; onDecline: () => void }) {
  return (
    <div className={`p-3 bg-canvas rounded border border-border transition-all ${isUpdating ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-7 h-7 rounded bg-primary-light flex items-center justify-center text-primary font-bold text-[10px]">
          {student ? student.split(' ').map(n => n[0]).join('').substring(0, 2) : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-text truncate">{student}</h4>
          <span className="text-[10px] text-text-muted font-medium">{time}</span>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={onApprove} className="flex-1 btn-primary text-[10px] py-1.5">
          {isUpdating ? <OrbitalLoader variant="button" /> : "Approve"}
        </button>
        <button onClick={onDecline} className="flex-1 btn-secondary text-[10px] py-1.5">
          {isUpdating ? <OrbitalLoader variant="button" /> : "Decline"}
        </button>
      </div>
    </div>
  )
}
