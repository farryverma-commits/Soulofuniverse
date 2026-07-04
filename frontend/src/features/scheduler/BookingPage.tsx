import React, { useState, useEffect, useCallback } from 'react'
import { Calendar as CalendarIcon, Clock, ArrowRight, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react'
import { OrbitalLoader } from '../../components/OrbitalLoader'
import { supabase } from '../../services/supabaseClient'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'

interface Mentor {
  id: string
  full_name: string
  avatar_url: string
  bio: string
}

interface Availability {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

export const BookingPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth)
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null)
  const [availability, setAvailability] = useState<Availability[]>([])
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const clearError = useCallback(() => setError(null), [])

  useEffect(() => {
    fetchMentors()
  }, [])

  const fetchMentors = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'mentor')

    if (!error && data) setMentors(data)
    setLoading(false)
  }

  const fetchAvailability = async (mentorId: string) => {
    setLoading(true)
    const [availabilityResponse, appointmentsResponse] = await Promise.all([
      supabase
        .from('mentor_availability')
        .select('*')
        .eq('mentor_id', mentorId)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true }),
      user ? supabase
        .from('appointments')
        .select('start_time')
        .eq('student_id', user.id)
        .in('status', ['scheduled', 'pending']) : Promise.resolve({ data: [], error: null })
    ])

    if (!availabilityResponse.error && availabilityResponse.data) setAvailability(availabilityResponse.data)
    if (!appointmentsResponse.error && appointmentsResponse.data) {
      setBookedSlots(appointmentsResponse.data.map((a: any) => new Date(a.start_time).getTime().toString()))
    }
    setLoading(false)
  }

  const getSlotStartTime = (slot: Availability) => {
    const now = new Date()
    const resultDate = new Date()
    resultDate.setDate(now.getDate() + (slot.day_of_week + 7 - now.getDay()) % 7)
    const [startH, startM] = slot.start_time.split(':')
    return new Date(resultDate.setHours(parseInt(startH), parseInt(startM), 0, 0)).getTime().toString()
  }

  const handleSelectMentor = (mentor: Mentor) => {
    setSelectedMentor(mentor)
    fetchAvailability(mentor.id)
  }

  const handleBookSession = async (slot: Availability) => {
    if (!user || !selectedMentor) return
    setBooking(true)

    const now = new Date()
    const resultDate = new Date()
    resultDate.setDate(now.getDate() + (slot.day_of_week + 7 - now.getDay()) % 7)

    const [startH, startM] = slot.start_time.split(':')
    const [endH, endM] = slot.end_time.split(':')

    const startTime = new Date(resultDate.setHours(parseInt(startH), parseInt(startM), 0, 0)).toISOString()
    const endTime = new Date(resultDate.setHours(parseInt(endH), parseInt(endM), 0, 0)).toISOString()

    const { error } = await supabase
      .from('appointments')
      .insert([{
        mentor_id: selectedMentor.id,
        student_id: user.id,
        start_time: startTime,
        end_time: endTime,
        status: 'pending'
      }])

    if (!error) {
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setSelectedMentor(null)
      }, 3000)
    } else {
      setError(error.message || 'Booking failed. Please try again.')
    }
    setBooking(false)
  }

  if (loading && !selectedMentor) {
    return (
      <div className="flex items-center justify-center py-20">
        <OrbitalLoader />
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-sm mx-auto py-20 text-center space-y-5 animate-scale-in">
        <div className="w-16 h-16 bg-success-light text-success rounded-2xl flex items-center justify-center mx-auto">
          <Sparkles size={28} />
        </div>
        <h2 className="text-xl font-bold text-text">Session requested</h2>
        <p className="text-sm text-text-secondary">Your request has been sent. The mentor will respond as the cosmos aligns.</p>
        <button onClick={() => setSuccess(false)} className="btn-primary text-sm">
          Return to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text tracking-tight">
          Book a <span className="text-primary">session</span>
        </h1>
        <p className="text-text-secondary text-sm mt-1">Choose a mentor and find a time that works for you.</p>
      </header>

      {error && (
        <div className="bg-error-light border border-error/10 rounded-xl p-3.5 flex items-center justify-between animate-fade-in">
          <p className="text-xs font-semibold text-error">{error}</p>
          <button onClick={clearError} className="text-error/60 hover:text-error transition-colors p-1 rounded-md" aria-label="Dismiss error">
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
      )}

      {!selectedMentor ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mentors.map((mentor, i) => (
            <div key={mentor.id} className="card card-hover p-5 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center text-primary font-bold text-sm">
                  {mentor.avatar_url ? (
                    <img src={mentor.avatar_url} alt={mentor.full_name || 'Mentor'} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    mentor.full_name ? mentor.full_name[0] : '?'
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text">{mentor.full_name || 'Anonymous Mentor'}</h3>
                  <span className="badge badge-primary text-[9px] mt-0.5">Mentor</span>
                </div>
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed mb-4">
                {mentor.bio || "Ready to discuss and guide you through your journey."}
              </p>
              <button onClick={() => handleSelectMentor(mentor)} className="btn-secondary w-full text-xs py-2 justify-between">
                View availability <ChevronRight size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          <button
            onClick={() => setSelectedMentor(null)}
            className="text-xs font-semibold text-text-muted hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            &larr; Back to mentors
          </button>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              <div className="card card-glow p-6">
                <h2 className="text-sm font-bold text-text mb-5 flex items-center gap-2">
                  <CalendarIcon size={16} className="text-primary" />
                  Available slots for {selectedMentor.full_name || 'Mentor'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {days.map((day, dayIdx) => {
                    const daySlots = availability.filter(a => a.day_of_week === dayIdx)
                    if (daySlots.length === 0) return null

                    return (
                      <div key={day} className="space-y-2">
                        <h4 className="section-label">{day}</h4>
                        <div className="space-y-1.5">
                          {daySlots.map(slot => {
                            const isBooked = bookedSlots.includes(getSlotStartTime(slot))
                            return (
                              <button
                                key={slot.id}
                                disabled={booking || isBooked}
                                onClick={() => handleBookSession(slot)}
                                className={`w-full group flex items-center justify-between p-3 rounded-lg text-sm transition-all ${
                                  isBooked
                                    ? 'bg-surface text-text-muted cursor-not-allowed border border-border'
                                    : 'bg-surface hover:bg-primary-light border border-border hover:border-primary/20 text-text hover:text-text'
                                }`}
                              >
                                <span className="font-semibold">
                                  {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                  {isBooked ? 'Booked' : 'Book'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {availability.length === 0 && (
                  <p className="text-center text-xs text-text-muted py-4">No availability configured yet.</p>
                )}
              </div>
            </div>

            <aside className="w-full lg:w-72">
              <div className="card card-glow p-5 bg-gradient-to-br from-accent/10 via-surface to-surface">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center text-primary font-bold text-sm">
                    {selectedMentor.full_name ? selectedMentor.full_name[0] : '?'}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-text">{selectedMentor.full_name || 'Anonymous Mentor'}</h4>
                    <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">Selected mentor</p>
                  </div>
                </div>
                <div className="space-y-2.5 text-xs text-text-secondary">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                    <span>Personalized 1-on-1 session</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                    <span>60 minute discussion</span>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted mt-4 leading-relaxed">
                  Bookings are pending mentor approval. Confirmation arrives when the stars align.
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
