import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../src/logger.js";

describe("logger", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should log info messages to stderr", () => {
    logger.info("Test message");

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    expect(logOutput).toContain("[INFO]");
    expect(logOutput).toContain("Test message");
  });

  it("should log error messages with error details", () => {
    const error = new Error("Test error");
    logger.error("Something failed", error);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    expect(logOutput).toContain("[ERROR]");
    expect(logOutput).toContain("Something failed");
    expect(logOutput).toContain("Test error");
  });

  it("should include metadata in log output", () => {
    logger.info("Operation complete", { count: 5, status: "success" });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    expect(logOutput).toContain("count");
    expect(logOutput).toContain("5");
    expect(logOutput).toContain("success");
  });

  it("should include timestamp in log output", () => {
    logger.info("Timestamped message");

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    // ISO timestamp format: 2024-01-01T00:00:00.000Z
    expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should log warn messages", () => {
    logger.warn("Warning message");

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    expect(logOutput).toContain("[WARN]");
    expect(logOutput).toContain("Warning message");
  });
});
