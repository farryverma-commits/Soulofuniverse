import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Plus,
  Bell,
  X,
  Users,
  Video,
  ChevronDown,
  ChevronUp,
  Radio,
  Sparkles,
} from "lucide-react";
import { OrbitalLoader } from "../../components/OrbitalLoader";
import { supabase } from "../../services/supabaseClient";
import { useSelector } from "react-redux";
import { RootState } from "../../store";

interface Availability {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export const AdminSchedulerPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSlot, setNewSlot] = useState({
    day_of_week: 1,
    start_time: "09:00",
    end_time: "10:00",
  });
  const [saving, setSaving] = useState(false);
  const [groupSessions, setGroupSessions] = useState<any[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const toLocalDatetime = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const getDefaultStart = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return toLocalDatetime(now);
  };

  const getDefaultEnd = () => {
    const end = new Date();
    end.setMinutes(0, 0, 0);
    end.setHours(end.getHours() + 2);
    return toLocalDatetime(end);
  };

  const [newGroup, setNewGroup] = useState({
    title: "",
    description: "",
    scheduled_start_time: getDefaultStart(),
    scheduled_end_time: getDefaultEnd(),
    require_approval: false,
    is_recorded: false,
  });
  const [startingSessionId, setStartingSessionId] = useState<string | null>(
    null,
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);

  const openGroupModal = () => {
    setNewGroup({
      title: "",
      description: "",
      scheduled_start_time: getDefaultStart(),
      scheduled_end_time: getDefaultEnd(),
      require_approval: false,
      is_recorded: false,
    });
    setIsGroupModalOpen(true);
  };

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fullDays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const closeSlotModal = useCallback(() => setIsModalOpen(false), []);
  const closeGroupModal = useCallback(() => setIsGroupModalOpen(false), []);

  useEffect(() => {
    if (!isModalOpen && !isGroupModalOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isModalOpen) closeSlotModal();
        else if (isGroupModalOpen) closeGroupModal();
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isModalOpen, isGroupModalOpen, closeSlotModal, closeGroupModal]);

  useEffect(() => {
    fetchAvailability();
    fetchRequests();
    fetchGroupSessions();
  }, [user]);

  const fetchGroupSessions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("group_sessions")
      .select("*")
      .eq("mentor_id", user.id)
      .order("scheduled_start_time", { ascending: true });
    if (data) setGroupSessions(data);
  };

  const fetchRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("mentor_id", user.id)
      .eq("status", "pending")
      .order("start_time", { ascending: true });
    if (data) {
      const studentIds = data.map((d) => d.student_id);
      if (studentIds.length > 0) {
        const { data: students } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);
        setRequests(
          data.map((req) => ({
            ...req,
            student: students?.find((s) => s.id === req.student_id),
          })),
        );
      } else {
        setRequests([]);
      }
    }
  };

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleUpdateStatus = async (
    id: string,
    status: "scheduled" | "declined",
  ) => {
    setUpdatingId(id);
    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id)
      .select();
    setUpdatingId(null);
    if (!error && data && data.length > 0) {
      fetchRequests();
    } else if (error) {
      setSessionError(error.message || "Failed to update appointment");
    }
  };

  const fetchAvailability = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("mentor_availability")
      .select("*")
      .eq("mentor_id", user.id)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });
    if (!error && data) setAvailability(data);
    setLoading(false);
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("mentor_availability").insert([
      {
        mentor_id: user.id,
        day_of_week: newSlot.day_of_week,
        start_time: newSlot.start_time,
        end_time: newSlot.end_time,
      },
    ]);
    if (!error) {
      setIsModalOpen(false);
      fetchAvailability();
    }
    setSaving(false);
  };

  const handleDeleteSlot = async (id: string) => {
    const { error } = await supabase
      .from("mentor_availability")
      .delete()
      .eq("id", id);
    if (!error) fetchAvailability();
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const start = new Date(newGroup.scheduled_start_time);
    const end = new Date(newGroup.scheduled_end_time);

    if (end <= start) {
      setSessionError("End time must be after start time");
      return;
    }

    if (start < new Date()) {
      setSessionError("Cannot schedule masterclass in the past");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("group_sessions").insert([
      {
        mentor_id: user.id,
        title: newGroup.title,
        description: newGroup.description,
        scheduled_start_time: new Date(
          newGroup.scheduled_start_time,
        ).toISOString(),
        scheduled_end_time: new Date(newGroup.scheduled_end_time).toISOString(),
        require_approval: newGroup.require_approval,
        is_recorded: newGroup.is_recorded,
        status: "scheduled",
      },
    ]);
    if (!error) {
      setIsGroupModalOpen(false);
      setNewGroup({
        title: "",
        description: "",
        scheduled_start_time: getDefaultStart(),
        scheduled_end_time: getDefaultEnd(),
        require_approval: false,
        is_recorded: false,
      });
      fetchGroupSessions();
    } else {
      setSessionError(error.message || "Failed to create masterclass");
    }
    setSaving(false);
  };

  const handleUpdateGroupStatus = async (
    id: string,
    action: "start" | "end",
  ) => {
    if (action === "start") setStartingSessionId(id);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-manage-session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ session_id: id, action }),
      },
    );
    if (response.ok) {
      await fetchGroupSessions();
      setSessionError(null);
    } else {
      const err = await response.json();
      setSessionError(err.error || "Session action failed. Please try again.");
    }
    if (action === "start") setStartingSessionId(null);
  };

  const liveSessions = groupSessions.filter((s) => s.status === "live");
  const upcomingSessions = groupSessions.filter(
    (s) => s.status === "scheduled",
  );
  const totalSlots = availability.length;
  const visibleSessions = showAllSessions
    ? groupSessions
    : groupSessions.slice(0, 4);

  return (
    <div className="space-y-5">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">
            Mentor Studio
          </h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Guide seekers through the cosmos
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openGroupModal()}
            className="btn-secondary text-xs py-2"
          >
            <Plus size={14} /> New masterclass
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-primary text-xs py-2"
          >
            <Plus size={14} /> Add time block
          </button>
        </div>
      </header>

      {sessionError && (
        <div className="bg-error-light border border-error/10 rounded-xl p-3.5 flex items-center justify-between animate-fade-in">
          <p className="text-xs font-semibold text-error">{sessionError}</p>
          <button
            onClick={() => setSessionError(null)}
            className="text-error/60 hover:text-error transition-colors p-1 rounded-md"
            aria-label="Dismiss error"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
      )}

      {liveSessions.length > 0 && (
        <div className="bg-success/5 border border-success/20 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-xs font-bold text-success uppercase tracking-wider">
              Live now
            </span>
          </div>
          <div className="space-y-2">
            {liveSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between bg-surface rounded-xl p-3.5 border border-success/20"
              >
                <div className="flex items-center gap-3">
                  <Radio size={16} className="text-success animate-pulse" />
                  <div>
                    <h4 className="text-sm font-semibold text-text">
                      {session.title}
                    </h4>
                    <p className="text-[10px] text-text-muted">
                      Started{" "}
                      {new Date(
                        session.scheduled_start_time,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    window.open(`/meeting/${session.id}`, "_blank")
                  }
                  className="btn-primary text-xs py-1.5 px-4 bg-success hover:bg-success/90"
                >
                  Join now
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <div className="card card-glow">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-text">Masterclasses</h2>
                <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                  {groupSessions.length}
                </span>
              </div>
              <button
                onClick={() => openGroupModal()}
                className="text-[10px] text-primary font-semibold hover:text-primary-hover transition-colors flex items-center gap-1"
              >
                <Plus size={12} /> New
              </button>
            </div>

            {groupSessions.length > 0 ? (
              <>
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-surface-raised text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-border">
                  <div className="col-span-5">Session</div>
                  <div className="col-span-3">Date & Time</div>
                  <div className="col-span-2 text-center">Status</div>
                  <div className="col-span-2 text-right">Action</div>
                </div>

                <div className="divide-y divide-border">
                  {visibleSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isStarting={startingSessionId === session.id}
                      onStart={() =>
                        handleUpdateGroupStatus(session.id, "start")
                      }
                      onEnd={() => handleUpdateGroupStatus(session.id, "end")}
                      onJoin={() =>
                        window.open(`/meeting/${session.id}`, "_blank")
                      }
                    />
                  ))}
                </div>

                {groupSessions.length > 4 && (
                  <div className="p-3 border-t border-border">
                    <button
                      onClick={() => setShowAllSessions(!showAllSessions)}
                      className="w-full text-center text-xs font-semibold text-primary hover:text-primary-hover transition-colors flex items-center justify-center gap-1"
                    >
                      {showAllSessions ? (
                        <>
                          Show less <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          View all {groupSessions.length} sessions{" "}
                          <ChevronDown size={14} />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="p-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mx-auto mb-3">
                  <Video size={20} className="text-text-muted" />
                </div>
                <p className="text-sm font-semibold text-text">
                  No masterclasses yet
                </p>
                <p className="text-xs text-text-secondary mt-1 mb-5">
                  Create your first masterclass to guide the seekers.
                </p>
                <button
                  onClick={() => openGroupModal()}
                  className="btn-primary text-xs py-2 px-4"
                >
                  <Plus size={14} /> New masterclass
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card card-glow">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-text">Requests</h2>
                {requests.length > 0 && (
                  <span className="text-[10px] bg-error/10 text-error font-bold px-2 py-0.5 rounded-full">
                    {requests.length}
                  </span>
                )}
              </div>
              <Bell size={16} className="text-text-muted" />
            </div>

            <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
              {requests.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-text-muted font-medium">
                    No pending requests
                  </p>
                  <p className="text-[10px] text-text-muted/70 mt-1">
                    Seekers will appear here when they book.
                  </p>
                </div>
              ) : (
                requests.map((req) => (
                  <RequestItem
                    key={req.id}
                    student={req.student?.full_name || "Anonymous"}
                    time={new Date(req.start_time).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    isUpdating={updatingId === req.id}
                    onApprove={() => handleUpdateStatus(req.id, "scheduled")}
                    onDecline={() => handleUpdateStatus(req.id, "declined")}
                  />
                ))
              )}
            </div>
          </div>

          <div className="card card-glow">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold text-text">Availability</h2>
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-[10px] text-primary font-semibold hover:text-primary-hover transition-colors flex items-center gap-1"
              >
                <Plus size={12} /> Add
              </button>
            </div>

            <div className="p-3">
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => {
                  const daySlots = availability.filter(
                    (a) => a.day_of_week === i,
                  );
                  return (
                    <div key={day} className="text-center">
                      <span
                        className={`text-[10px] font-bold ${daySlots.length > 0 ? "text-primary" : "text-text-muted"}`}
                      >
                        {day}
                      </span>
                      <div className="mt-1 space-y-1 min-h-[40px]">
                        {daySlots.length > 0 ? (
                          daySlots.map((slot) => (
                            <div
                              key={slot.id}
                              className="group relative bg-primary-light border border-primary/10 rounded-lg px-1 py-1 text-center hover:bg-primary/15 transition-colors"
                            >
                              <p className="text-[9px] font-bold text-primary leading-tight">
                                {slot.start_time.slice(0, 5)}
                              </p>
                              <button
                                onClick={() => handleDeleteSlot(slot.id)}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-error text-white rounded-full text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                aria-label="Remove"
                              >
                                ×
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-[8px] text-text-muted/30">
                              —
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalSlots > 0 && (
                <p className="text-[10px] text-text-muted text-center mt-3">
                  {totalSlots} slots configured
                </p>
              )}
            </div>
          </div>

          <div className="card card-glow p-4 bg-gradient-to-br from-accent/10 via-surface to-surface">
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
              Quick broadcast
            </p>
            <p className="text-xs text-text-secondary mb-3">
              Notify seekers about new availability.
            </p>
            <button className="btn-primary w-full text-xs py-2.5">
              <Sparkles size={12} /> Broadcast now
            </button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 bg-nav/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Add availability"
        >
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-sm font-bold text-text">Add availability</h2>
              <button
                onClick={closeSlotModal}
                className="p-2 hover:bg-surface-raised rounded-xl transition-colors"
                aria-label="Close"
              >
                <X size={16} className="text-text-muted" />
              </button>
            </div>
            <form onSubmit={handleAddSlot} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="slot-day"
                  className="text-xs font-semibold text-text"
                >
                  Day of the week
                </label>
                <select
                  id="slot-day"
                  className="input text-sm"
                  value={newSlot.day_of_week}
                  onChange={(e) =>
                    setNewSlot({
                      ...newSlot,
                      day_of_week: parseInt(e.target.value),
                    })
                  }
                >
                  {fullDays.map((day, i) => (
                    <option key={day} value={i}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="slot-start"
                    className="text-xs font-semibold text-text"
                  >
                    Start time
                  </label>
                  <input
                    id="slot-start"
                    type="time"
                    className="input text-sm text-center"
                    value={newSlot.start_time}
                    onChange={(e) =>
                      setNewSlot({ ...newSlot, start_time: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="slot-end"
                    className="text-xs font-semibold text-text"
                  >
                    End time
                  </label>
                  <input
                    id="slot-end"
                    type="time"
                    className="input text-sm text-center"
                    value={newSlot.end_time}
                    onChange={(e) =>
                      setNewSlot({ ...newSlot, end_time: e.target.value })
                    }
                  />
                </div>
              </div>
              <button disabled={saving} className="btn-primary w-full py-2.5">
                {saving ? (
                  <OrbitalLoader variant="button" />
                ) : (
                  "Save availability"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {isGroupModalOpen && (
        <div
          className="fixed inset-0 bg-nav/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Schedule masterclass"
        >
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-sm font-bold text-text">
                Schedule masterclass
              </h2>
              <button
                onClick={closeGroupModal}
                className="p-2 hover:bg-surface-raised rounded-xl transition-colors"
                aria-label="Close"
              >
                <X size={16} className="text-text-muted" />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className="p-5 space-y-3.5">
              <div className="space-y-1.5">
                <label
                  htmlFor="group-title"
                  className="text-xs font-semibold text-text"
                >
                  Title
                </label>
                <input
                  id="group-title"
                  required
                  className="input text-sm"
                  value={newGroup.title}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, title: e.target.value })
                  }
                  placeholder="The quantum soul"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="group-desc"
                  className="text-xs font-semibold text-text"
                >
                  Description
                </label>
                <textarea
                  id="group-desc"
                  className="input text-sm h-20 resize-none"
                  value={newGroup.description}
                  onChange={(e) =>
                    setNewGroup({ ...newGroup, description: e.target.value })
                  }
                  placeholder="Deep dive into quantum consciousness..."
                />
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text">
                    Start time
                  </label>
                  <div className="flex gap-2">
                    <input
                      required
                      type="date"
                      lang="en-GB"
                      className="input text-sm flex-1"
                      value={newGroup.scheduled_start_time.split("T")[0]}
                      onChange={(e) =>
                        setNewGroup({
                          ...newGroup,
                          scheduled_start_time:
                            e.target.value +
                            "T" +
                            newGroup.scheduled_start_time.split("T")[1],
                        })
                      }
                    />
                    <input
                      required
                      type="time"
                      className="input text-sm w-28"
                      value={newGroup.scheduled_start_time.split("T")[1]}
                      onChange={(e) =>
                        setNewGroup({
                          ...newGroup,
                          scheduled_start_time:
                            newGroup.scheduled_start_time.split("T")[0] +
                            "T" +
                            e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text">
                    End time
                  </label>
                  <div className="flex gap-2">
                    <input
                      required
                      type="date"
                      lang="en-GB"
                      className="input text-sm flex-1"
                      value={newGroup.scheduled_end_time.split("T")[0]}
                      onChange={(e) =>
                        setNewGroup({
                          ...newGroup,
                          scheduled_end_time:
                            e.target.value +
                            "T" +
                            newGroup.scheduled_end_time.split("T")[1],
                        })
                      }
                    />
                    <input
                      required
                      type="time"
                      className="input text-sm w-28"
                      value={newGroup.scheduled_end_time.split("T")[1]}
                      onChange={(e) =>
                        setNewGroup({
                          ...newGroup,
                          scheduled_end_time:
                            newGroup.scheduled_end_time.split("T")[0] +
                            "T" +
                            e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
              {/* <div className="flex gap-3">
                <label className="flex-1 flex items-center gap-2 cursor-pointer p-3 bg-surface-raised rounded-xl border border-border hover:border-border-strong transition-colors">
                  <input
                    type="checkbox"
                    checked={newGroup.require_approval}
                    onChange={(e) =>
                      setNewGroup({
                        ...newGroup,
                        require_approval: e.target.checked,
                      })
                    }
                    className="w-3.5 h-3.5 rounded accent-primary"
                  />
                  <span className="text-[11px] font-semibold text-text-secondary">
                    Wait room
                  </span>
                </label>
                
              </div> */}
              <button
                disabled={saving}
                className="btn-primary w-full py-2.5 mt-1"
              >
                {saving ? (
                  <OrbitalLoader variant="button" />
                ) : (
                  "Create masterclass"
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function SessionRow({
  session,
  isStarting,
  onStart,
  onEnd,
  onJoin,
}: {
  session: any;
  isStarting: boolean;
  onStart: () => void;
  onEnd: () => void;
  onJoin: () => void;
}) {
  const startDate = new Date(session.scheduled_start_time);
  const endDate = new Date(session.scheduled_end_time);
  const isLive = session.status === "live";
  const isPast = endDate < new Date();

  const getStatusBadge = () => {
    if (isLive)
      return (
        <span className="text-[9px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
          Live
        </span>
      );
    if (isPast)
      return (
        <span className="text-[9px] font-bold text-text-muted bg-surface-raised px-2.5 py-1 rounded-full">
          Done
        </span>
      );
    return (
      <span className="text-[9px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
        Upcoming
      </span>
    );
  };

  const getAction = () => {
    if (session.status === "scheduled") {
      return (
        <button
          onClick={onStart}
          disabled={isStarting}
          className="btn-primary text-[10px] py-1.5 px-3"
        >
          {isStarting ? <OrbitalLoader variant="button" /> : "Start"}
        </button>
      );
    }
    if (isLive) {
      return (
        <div className="flex gap-1">
          <button
            onClick={onJoin}
            className="btn-primary text-[10px] py-1.5 px-3 bg-success hover:bg-success/90"
          >
            Join
          </button>
          <button
            onClick={onEnd}
            className="btn-secondary text-[10px] py-1.5 px-2"
          >
            End
          </button>
        </div>
      );
    }
    return <span className="text-[10px] text-text-muted">—</span>;
  };

  return (
    <div
      className={`grid grid-cols-12 gap-2 items-center px-4 py-3.5 hover:bg-surface-raised transition-colors ${isLive ? "bg-success/[0.02]" : ""}`}
    >
      <div className="col-span-5 flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 ${isLive ? "bg-success/10" : "bg-primary/10"}`}
        >
          <span
            className={`text-[8px] font-bold uppercase ${isLive ? "text-success" : "text-primary"}`}
          >
            {startDate.toLocaleDateString("en-US", { month: "short" })}
          </span>
          <span
            className={`text-sm font-bold leading-none ${isLive ? "text-success" : "text-text"}`}
          >
            {startDate.getDate()}
          </span>
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-text truncate">
            {session.title}
          </h4>
          <p className="text-[10px] text-text-muted truncate">
            {startDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            —{" "}
            {endDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
      <div className="col-span-3">
        <p className="text-[10px] text-text-muted">
          {startDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </p>
        {session.is_recorded && (
          <p className="text-[9px] text-text-muted flex items-center gap-1 mt-0.5">
            <Video size={8} /> Recorded
          </p>
        )}
      </div>
      <div className="col-span-2 text-center">{getStatusBadge()}</div>
      <div className="col-span-2 flex justify-end">{getAction()}</div>
    </div>
  );
}

function RequestItem({
  student,
  time,
  isUpdating,
  onApprove,
  onDecline,
}: {
  student: string;
  time: string;
  isUpdating?: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className={`p-3.5 bg-surface-raised rounded-xl border border-border transition-all ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px]">
          {student
            ? student
                .split(" ")
                .filter((n) => n.length > 0)
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
                .toUpperCase()
            : "?"}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-text truncate">
            {student}
          </h4>
          <span className="text-[10px] text-text-muted font-medium">
            {time}
          </span>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={onApprove}
          className="flex-1 btn-primary text-[10px] py-1.5"
        >
          {isUpdating ? <OrbitalLoader variant="button" /> : "Approve"}
        </button>
        <button
          onClick={onDecline}
          className="flex-1 btn-secondary text-[10px] py-1.5"
        >
          {isUpdating ? <OrbitalLoader variant="button" /> : "Decline"}
        </button>
      </div>
    </div>
  );
}
