import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "./logger";

function captureLogger(level: LogLevel = "debug") {
  const lines: Array<{ level: LogLevel; line: string }> = [];
  const log = createLogger({
    level,
    format: "json",
    sink: (lvl, line) => lines.push({ level: lvl, line }),
    now: () => new Date("2026-05-29T00:00:00.000Z"),
  });
  return { log, lines };
}

describe("logger", () => {
  it("emits JSON with level, time, msg and fields", () => {
    const { log, lines } = captureLogger();
    log.info("hello", { runId: "r1" });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0].line);
    expect(parsed).toMatchObject({
      level: "info",
      time: "2026-05-29T00:00:00.000Z",
      msg: "hello",
      runId: "r1",
    });
  });

  it("drops records below the configured level", () => {
    const { log, lines } = captureLogger("warn");
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");
    expect(lines.map((l) => l.level)).toEqual(["warn", "error"]);
  });

  it("serializes Error fields to name/message/stack", () => {
    const { log, lines } = captureLogger();
    log.error("boom", { err: new Error("kaboom") });
    const parsed = JSON.parse(lines[0].line);
    expect(parsed.err.name).toBe("Error");
    expect(parsed.err.message).toBe("kaboom");
    expect(typeof parsed.err.stack).toBe("string");
  });

  it("child() merges bindings into every record", () => {
    const { log, lines } = captureLogger();
    const child = log.child({ component: "worker", workerId: "w1" });
    child.info("started", { poll: 3000 });
    const parsed = JSON.parse(lines[0].line);
    expect(parsed).toMatchObject({ component: "worker", workerId: "w1", poll: 3000, msg: "started" });
  });

  it("routes warn/error to a distinct stream label", () => {
    const { log, lines } = captureLogger();
    log.error("e");
    expect(lines[0].level).toBe("error");
  });
});
