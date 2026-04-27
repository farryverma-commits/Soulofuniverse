import React, { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, Clock, User, ArrowRight, CheckCircle2, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { useSelector } from 'react-redux'
import { RootState } from '../../store'

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

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

    // Calculate next occurrence of this day of week
    const now = new Date()
    const resultDate = new Date()
    resultDate.setDate(now.getDate() + (slot.day_of_week + 7 - now.getDay()) % 7)
    
    const [startH, startM] = slot.start_time.split(':')
    const [endH, endM] = slot.end_time.split(':')
    
    const startTime = new Date(resultDate.setHours(parseInt(startH), parseInt(startM), 0, 0)).toISOString()
    const endTime = new Date(resultDate.setHours(parseInt(endH), parseInt(endM), 0, 0)).toISOString()

    const { error } = await supabase
      .from('appointments')
      .insert([
        {
          mentor_id: selectedMentor.id,
          student_id: user.id,
          start_time: startTime,
          end_time: endTime,
          status: 'pending'
        }
      ])

    if (!error) {
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setSelectedMentor(null)
      }, 3000)
    } else {
      console.error(error)
      alert(`Booking failed: ${error.message}`)
    }
    setBooking(false)
  }

  if (loading && !selectedMentor) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-6 animate-in zoom-in-95 duration-300">
        <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-green-500/10">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black text-dark">Session Booked!</h2>
        <p className="text-gray-500 font-medium">Your request has been sent to the mentor. You'll be notified once they approve it.</p>
        <button 
          onClick={() => setSuccess(false)}
          className="btn-primary px-8"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-dark tracking-tight">
          Book a <span className="text-primary italic">Discussion Session</span>
        </h1>
        <p className="text-gray-500 mt-2 font-medium">Choose a mentor and find a time that works for you.</p>
      </header>

      {!selectedMentor ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mentors.map(mentor => (
            <div key={mentor.id} className="card-premium group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-surface-light flex items-center justify-center text-primary font-black text-xl border border-gray-100 shadow-sm overflow-hidden">
                  {mentor.avatar_url ? <img src={mentor.avatar_url} alt={mentor.full_name || 'Mentor'} className="w-full h-full object-cover" /> : (mentor.full_name ? mentor.full_name[0] : '?')}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-dark">{mentor.full_name || 'Anonymous Mentor'}</h3>
                  <span className="text-xs font-bold text-primary bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-wider">Mentor</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 line-clamp-2 font-medium leading-relaxed mb-6">
                {mentor.bio || "No bio available. This mentor is ready to discuss and guide you through your journey."}
              </p>
              <button 
                onClick={() => handleSelectMentor(mentor)}
                className="w-full py-3 bg-surface-light group-hover:bg-primary group-hover:text-white text-gray-600 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                View Availability <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-300">
          <button 
            onClick={() => setSelectedMentor(null)}
            className="text-sm font-bold text-gray-400 hover:text-primary transition-colors flex items-center gap-1"
          >
            ← Back to Mentors
          </button>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                 <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                   <CalendarIcon className="w-5 h-5 text-primary" />
                   Available Slots for {selectedMentor.full_name || 'Mentor'}
                 </h2>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {days.map((day, dayIdx) => {
                     const daySlots = availability.filter(a => a.day_of_week === dayIdx)
                     if (daySlots.length === 0) return null
                     
                     return (
                       <div key={day} className="space-y-3">
                         <h4 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">{day}</h4>
                         <div className="grid grid-cols-1 gap-2">
                           {daySlots.map(slot => {
                             const isBooked = bookedSlots.includes(getSlotStartTime(slot))
                             return (
                               <button
                                 key={slot.id}
                                 disabled={booking || isBooked}
                                 onClick={() => handleBookSession(slot)}
                                 className={`flex items-center justify-between p-4 bg-surface-light hover:bg-white hover:border-primary/30 border-2 border-transparent rounded-2xl transition-all group active:scale-[0.98] ${isBooked ? 'opacity-50 cursor-not-allowed hover:bg-surface-light hover:border-transparent' : ''}`}
                               >
                                 <span className="font-bold text-dark group-hover:text-primary transition-colors">
                                   {slot.start_time.slice(0,5)} - {slot.end_time.slice(0,5)}
                                 </span>
                                 <span className="text-[10px] font-black uppercase text-primary opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1">
                                   {isBooked ? 'Already Booked' : <>Book Now <ArrowRight className="w-3 h-3" /></>}
                                 </span>
                               </button>
                             )
                           })}
                         </div>
                       </div>
                     )
                   })}
                 </div>
              </div>
            </div>

            <aside className="w-full lg:w-80">
              <div className="card-premium bg-dark text-white border-none shadow-2xl">
                <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center text-primary font-black">
                      {selectedMentor.full_name ? selectedMentor.full_name[0] : '?'}
                   </div>
                   <div>
                      <h4 className="font-bold">{selectedMentor.full_name || 'Anonymous Mentor'}</h4>
                      <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Selected Mentor</p>
                   </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">Personalized 1-on-1 Session</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">60 Minute Discussion</span>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-6 leading-relaxed italic">
                  * Note: Bookings are pending mentor approval. You will receive an email confirmation once approved.
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
