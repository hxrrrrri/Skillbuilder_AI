import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  runCopilotTurn: vi.fn(),
  prisma: { chatSession: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<any>("@/lib/auth/session");
  return { ...actual, getCurrentUser: mocks.getCurrentUser };
});
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/copilot/engine", () => ({
  runCopilotTurn: mocks.runCopilotTurn,
  CopilotProviderNotReadyError: class extends Error {},
  CopilotForbiddenError: class extends Error {},
}));

function makeReq(body: any): Request {
  return new Request("http://test.local/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/chat (#2 admin mode is admin-only)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 when a candidate requests admin mode, without invoking the engine", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "c1", role: "candidate" });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ session_id: "s1", message: "do admin things", mode: "admin" }));
    expect(res.status).toBe(403);
    expect(mocks.runCopilotTurn).not.toHaveBeenCalled();
  });

  it("allows a help-mode turn for an anonymous user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.prisma.chatSession.findUnique.mockResolvedValue({ id: "s1", mode: "help", userId: null });
    mocks.runCopilotTurn.mockResolvedValue({ sessionId: "s1", reply: "hello", providerId: "anthropic_api", model: "claude" });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ session_id: "s1", message: "what is skillproof?", mode: "help" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("hello");
  });
});
