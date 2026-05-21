/**
 * VodaLease Enterprise — Credential Validation Tests
 * Validates SQL Server and Azure OpenAI connectivity using environment secrets.
 */
import { describe, it, expect } from "vitest";
import sql from "mssql";

describe("SQL Server credentials", () => {
  it("connects to the leasing database and returns a result", async () => {
    const config: sql.config = {
      server:   process.env.MSSQL_HOST   ?? "SQL_SERVER_HOST_REDACTED",
      port:     Number(process.env.MSSQL_PORT ?? 1433),
      user:     process.env.MSSQL_USER   ?? "SQL_USER_REDACTED",
      password: process.env.MSSQL_PASSWORD ?? "",
      database: process.env.MSSQL_DATABASE ?? "leasing",
      options: {
        encrypt:              true,
        trustServerCertificate: true,
        connectTimeout:       10000,
        requestTimeout:       10000,
      },
    };

    const pool = await sql.connect(config);
    const result = await pool.request().query("SELECT 1 AS ok");
    await pool.close();

    expect(result.recordset[0].ok).toBe(1);
  }, 20000);
});

describe("Azure OpenAI credentials", () => {
  it("reaches the Azure OpenAI endpoint and returns a valid response", async () => {
    const endpoint   = process.env.AZURE_OPENAI_ENDPOINT  ?? "";
    const apiKey     = process.env.AZURE_OPENAI_KEY        ?? "";
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o";
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview";

    expect(endpoint).toBeTruthy();
    expect(apiKey).toBeTruthy();

    const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Reply with the single word: OK" }],
        max_tokens: 5,
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json() as any;
    expect(json.choices).toBeDefined();
    expect(json.choices.length).toBeGreaterThan(0);
  }, 30000);
});
