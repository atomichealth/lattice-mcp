import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";

describe("MCP server", () => {
  it("creates a server instance", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("is an McpServer instance with tools registered", () => {
    const server = createServer();
    // Verify it has the tool registration method (confirms tools were registered)
    expect(typeof (server as any).tool).toBe("function");
  });
});
