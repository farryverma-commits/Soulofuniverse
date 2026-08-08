// Unit tests for telemetry authorization in livekit-manage-session.
// Run with: deno test supabase/functions/livekit-manage-session/telemetry_auth_test.ts

import { assertEquals } from "jsr:@std/assert";
import { authorizeTelemetry } from "./telemetry_auth.ts";
import type { TelemetryAuthResult } from "./telemetry_auth.ts";

const HOST = "host-1";
const OTHER = "user-2";

const authorized: TelemetryAuthResult = {
  allowed: true,
  callerIsHost: false,
};

function call(
  overrides: Partial<Parameters<typeof authorizeTelemetry>[0]> = {},
) {
  return authorizeTelemetry({
    hostUserId: HOST,
    callerUserId: OTHER,
    callerProfile: null,
    participantRow: null,
    ...overrides,
  });
}

Deno.test("host is always allowed", () => {
  const r = call({ callerUserId: HOST });
  assertEquals(r, { allowed: true, callerIsHost: true });
});

Deno.test("approved mentor is allowed", () => {
  const r = call({ callerProfile: { role: "mentor", status: "approved" } });
  assertEquals(r, authorized);
});

Deno.test("approved admin is allowed", () => {
  const r = call({ callerProfile: { role: "admin", status: "approved" } });
  assertEquals(r, authorized);
});

Deno.test("PENDING mentor is denied", () => {
  const r = call({ callerProfile: { role: "mentor", status: "pending" } });
  if (r.allowed) {
    throw new Error("expected denial");
  }
  assertEquals(r.reason, "Not an admitted participant of this session");
});

Deno.test("REJECTED mentor is denied", () => {
  const r = call({ callerProfile: { role: "mentor", status: "rejected" } });
  assertEquals(r.allowed, false);
});

Deno.test("PENDING (waiting) participant row is denied", () => {
  const r = call({
    participantRow: { participantUserId: OTHER, status: "waiting" },
  });
  assertEquals(r.allowed, false);
});

Deno.test("REJECTED participant row is denied", () => {
  const r = call({
    participantRow: { participantUserId: OTHER, status: "rejected" },
  });
  assertEquals(r.allowed, false);
});

Deno.test("participant row without status is denied", () => {
  const r = call({
    participantRow: { participantUserId: OTHER, status: null },
  });
  assertEquals(r.allowed, false);
});

Deno.test("approved participant row is allowed", () => {
  const r = call({
    participantRow: { participantUserId: OTHER, status: "approved" },
  });
  assertEquals(r, authorized);
});

Deno.test("joined participant row is allowed", () => {
  const r = call({
    participantRow: { participantUserId: OTHER, status: "joined" },
  });
  assertEquals(r, authorized);
});

Deno.test("approved row for ANOTHER user is denied (identity mismatch)", () => {
  const r = call({
    participantRow: {
      participantUserId: "someone-else",
      status: "approved",
    },
  });
  assertEquals(r.allowed, false);
});
