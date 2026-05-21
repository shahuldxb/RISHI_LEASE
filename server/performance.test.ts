import { describe, expect, it, vi, beforeEach } from "vitest";

// Test the in-memory query stats module
describe("Database Performance Monitoring", () => {
  describe("getQueryStats / getPoolStatus exports", () => {
    it("exports getQueryStats and getPoolStatus from db-sqlserver", async () => {
      const mod = await import("./db-sqlserver");
      expect(typeof mod.getQueryStats).toBe("function");
      expect(typeof mod.getPoolStatus).toBe("function");
    });

    it("getQueryStats returns the expected shape", async () => {
      const { getQueryStats } = await import("./db-sqlserver");
      const result = getQueryStats();
      expect(result).toHaveProperty("stats");
      expect(result).toHaveProperty("totalExecuted");
      expect(result).toHaveProperty("totalSlow");
      expect(Array.isArray(result.stats)).toBe(true);
      expect(typeof result.totalExecuted).toBe("number");
      expect(typeof result.totalSlow).toBe("number");
    });

    it("getPoolStatus returns the expected shape when pool is not connected", async () => {
      const { getPoolStatus } = await import("./db-sqlserver");
      const result = getPoolStatus();
      expect(result).toHaveProperty("connected");
      expect(result).toHaveProperty("size");
      expect(result).toHaveProperty("available");
      expect(result).toHaveProperty("pending");
      expect(result).toHaveProperty("borrowed");
      expect(typeof result.connected).toBe("boolean");
    });
  });

  describe("Performance router input validation", () => {
    it("performance router exists in appRouter", async () => {
      const { appRouter } = await import("./routers");
      // Check that the performance router is registered
      expect(appRouter._def.procedures).toHaveProperty("performance.getSlowQueries");
      expect(appRouter._def.procedures).toHaveProperty("performance.getSlowQueryStats");
      expect(appRouter._def.procedures).toHaveProperty("performance.getIndexRecommendations");
      expect(appRouter._def.procedures).toHaveProperty("performance.getRealtimeStats");
      expect(appRouter._def.procedures).toHaveProperty("performance.getPoolStatus");
      expect(appRouter._def.procedures).toHaveProperty("performance.resolveSlowQuery");
      expect(appRouter._def.procedures).toHaveProperty("performance.purgeOldRecords");
    });

    it("rejects non-admin users for getSlowQueries", async () => {
      const { appRouter } = await import("./routers");
      const type = await import("./_core/context");

      const ctx = {
        user: {
          id: 99,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus" as const,
          role: "user" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        },
        req: { protocol: "https", headers: {} } as any,
        res: { clearCookie: vi.fn() } as any,
      };

      const caller = appRouter.createCaller(ctx);

      await expect(caller.performance.getSlowQueries()).rejects.toThrow("Admin access required");
    });

    it("rejects non-admin users for getRealtimeStats", async () => {
      const { appRouter } = await import("./routers");

      const ctx = {
        user: {
          id: 99,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus" as const,
          role: "user" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        },
        req: { protocol: "https", headers: {} } as any,
        res: { clearCookie: vi.fn() } as any,
      };

      const caller = appRouter.createCaller(ctx);

      await expect(caller.performance.getRealtimeStats()).rejects.toThrow("Admin access required");
    });

    it("rejects non-admin users for getPoolStatus", async () => {
      const { appRouter } = await import("./routers");

      const ctx = {
        user: {
          id: 99,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus" as const,
          role: "user" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        },
        req: { protocol: "https", headers: {} } as any,
        res: { clearCookie: vi.fn() } as any,
      };

      const caller = appRouter.createCaller(ctx);

      await expect(caller.performance.getPoolStatus()).rejects.toThrow("Admin access required");
    });
  });

  describe("SLOW_QUERY_THRESHOLD_MS configuration", () => {
    it("threshold is set to 500ms", async () => {
      // Read the source file to verify the threshold constant
      const fs = await import("fs");
      const source = fs.readFileSync("./server/db-sqlserver.ts", "utf-8");
      expect(source).toContain("SLOW_QUERY_THRESHOLD_MS = 500");
    });
  });

  describe("Connection pool configuration", () => {
    it("pool max is set to 30", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("./server/db-sqlserver.ts", "utf-8");
      expect(source).toContain("max: 30");
    });

    it("pool min is set to 5", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("./server/db-sqlserver.ts", "utf-8");
      expect(source).toContain("min: 5");
    });

    it("keep-alive interval is 2 minutes", async () => {
      const fs = await import("fs");
      const source = fs.readFileSync("./server/db-sqlserver.ts", "utf-8");
      expect(source).toContain("2 * 60 * 1000");
    });
  });
});
