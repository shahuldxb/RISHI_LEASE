import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockCtx(): TrpcContext {
  return {
    user: {
      id: 1, openId: "test-user", email: "test@vodafone.com",
      name: "Test User", loginMethod: "manus", role: "admin",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("cheque router", () => {
  it("cheque router is registered in appRouter", () => {
    expect(appRouter._def.procedures).toBeDefined();
    const keys = Object.keys(appRouter._def.record ?? {});
    expect(keys).toContain("cheque");
  });

  it("cheque.getSummary procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.getSummary).toBe("function");
  });

  it("cheque.getBankAccounts procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.getBankAccounts).toBe("function");
  });

  it("cheque.getChequeBooks procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.getChequeBooks).toBe("function");
  });

  it("cheque.getChequeRegister procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.getChequeRegister).toBe("function");
  });

  it("cheque.issueCheque procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.issueCheque).toBe("function");
  });

  it("cheque.bounceCheque procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.bounceCheque).toBe("function");
  });

  it("cheque.voidCheque procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.voidCheque).toBe("function");
  });

  it("cheque.reissueCheque procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.reissueCheque).toBe("function");
  });

  it("cheque.getStaleCheques procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.getStaleCheques).toBe("function");
  });

  it("cheque.getSignatories procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.getSignatories).toBe("function");
  });

  it("cheque.upsertSignatory procedure exists", () => {
    const caller = appRouter.createCaller(createMockCtx());
    expect(typeof caller.cheque.upsertSignatory).toBe("function");
  });
});
