// Shared telemetry authorization for livekit-manage-session.
// Pure decision logic (no network) so it can be unit-tested.

export type CallerProfile = {
  role?: string | null;
  status?: string | null;
};

export type ParticipantRow = {
  // The participant's user id (NOT the DB row id) — must equal the caller's
  // authenticated user id for the row to authorize this caller.
  participantUserId: string;
  status: string | null;
} | null;

export type TelemetryAuthResult =
  | { allowed: true; callerIsHost: boolean }
  | { allowed: false; reason: string };

/**
 * Decide whether `callerUserId` may write telemetry for a session hosted by
 * `hostUserId`.
 *
 * Rules (per the documented conferencing-resilience behavior):
 * - The session host is always allowed (hosts are created approved via
 *   create-mentor / approve_user()).
 * - Other admins/mentors are allowed only once their profile is `approved`.
 * - Students need an admitted session_participants row (`approved` or
 *   `joined`); `waiting` (pending) and rejected rows are denied.
 */
export function authorizeTelemetry(params: {
  hostUserId: string;
  callerUserId: string;
  callerProfile: CallerProfile | null;
  participantRow: ParticipantRow;
}): TelemetryAuthResult {
  const { hostUserId, callerUserId, callerProfile, participantRow } = params;

  if (hostUserId === callerUserId) {
    return { allowed: true, callerIsHost: true };
  }

  const isTrustedCaller =
    (callerProfile?.role === "admin" || callerProfile?.role === "mentor") &&
    callerProfile?.status === "approved";

  if (isTrustedCaller) {
    return { allowed: true, callerIsHost: false };
  }

  // Students need an admitted session_participants row (`approved` or
  // `joined`); `waiting` (pending) and rejected rows are denied. The status
  // and identity rules live here — the caller passes the row without
  // pre-filtering it, so a future query change can't silently admit
  // waiting/rejected participants or another user's row.
  if (
    participantRow?.participantUserId === callerUserId &&
    (participantRow.status === "approved" ||
      participantRow.status === "joined")
  ) {
    return { allowed: true, callerIsHost: false };
  }

  return {
    allowed: false,
    reason: "Not an admitted participant of this session",
  };
}
