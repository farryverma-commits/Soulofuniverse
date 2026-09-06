import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  Mail,
  Calendar,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import toast from "react-hot-toast";

interface ApprovalRequest {
  id: string;
  user_id: string;
  status: string;
  requested_at: string;
  profiles: {
    full_name: string;
    email: string;
    role: string;
    dob: string | null;
  } | null; // Handle potential empty rows safely
}

export const UserApproval: React.FC = () => {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    const { data, error } = await supabase
      .from("user_approval_requests")
      .select(
        `
      id,
      user_id,
      status,
      requested_at,
      profiles:user_id (
        full_name,
        email,
        role,
        dob
      )
    `,
      )
      .eq("status", "pending")
      .order("requested_at", { ascending: true });

    if (error) {
      console.error("Error fetching requests:", error);
      return;
    }

    // Cast the returned data to match your clean ApprovalRequest interface shape
    setRequests((data as unknown as ApprovalRequest[]) || []);
    setLoading(false);
  };

  const handleApproval = async (userId: string, approved: boolean) => {
    setProcessingId(userId);

    const { data, error } = await supabase.rpc("approve_user", {
      target_user_id: userId,
      approved: approved,
      admin_notes: null,
    });

    if (error) {
      toast.error("Failed to process request");
      console.error("Error:", error);
    } else if (data?.success) {
      toast.success(approved ? "User approved" : "User rejected");
      fetchPendingRequests();
    } else {
      toast.error(data?.error || "Failed to process request");
    }

    setProcessingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text tracking-tight">
            Pending Approvals
          </h2>
          <p className="text-text-secondary text-sm mt-1">
            {requests.length} request{requests.length !== 1 ? "s" : ""} awaiting
            review
          </p>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
          <p className="text-text font-medium">All caught up!</p>
          <p className="text-text-muted text-sm mt-1">
            No pending approval requests
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          <AnimatePresence>
            {requests.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <h3 className="text-text font-medium truncate">
                        {request.profiles?.full_name || "Unknown User"}
                      </h3>
                      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 mt-1 text-sm">
                        <span className="text-text-secondary flex items-center gap-1 min-w-0">
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {request.profiles?.email || "No email"}
                          </span>
                        </span>
                        {request.profiles?.dob && (
                          <span className="text-text-muted flex items-center gap-1">
                            <Calendar className="w-3 h-3 shrink-0" />
                            {new Date(
                              request.profiles.dob,
                            ).toLocaleDateString()}
                          </span>
                        )}
                        <span className="text-text-muted flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          Requested{" "}
                          {new Date(request.requested_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="inline-block mt-2 px-2 py-1 text-xs rounded-full bg-accent/20 text-accent">
                        {request.profiles?.role || "student"}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 w-full sm:w-auto shrink-0">
                    <button
                      onClick={() => handleApproval(request.user_id, false)}
                      disabled={processingId === request.user_id}
                      title="Reject"
                      className="flex-1 sm:flex-none h-11 px-4 rounded-lg bg-error/10 hover:bg-error/20 text-error text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproval(request.user_id, true)}
                      disabled={processingId === request.user_id}
                      title="Approve"
                      className="flex-1 sm:flex-none h-11 px-4 rounded-lg bg-success/10 hover:bg-success/20 text-success text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
