import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────────
const fmt = (v: number, cur = "QAR") =>
  `${cur} ${(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v: number) => `${(v * 100).toFixed(4)}%`;

interface ScheduleRow {
  contract_id: number;
  contract_ref: string;
  asset_description: string;
  currency: string;
  monthly_payment: number;
  ibr: number;
  term_months: number;
  commencement_date: string;
  expiry_date: string;
  ifrs16_classification: string;
  lessor_name: string;
  period_date: string;
  period_year: number;
  period_month: number;
  month_name: string;
  opening_liability: number;
  interest_expense: number;
  payment: number;
  principal: number;
  closing_liability: number;
  rou_nbv: number;
  depreciation: number;
  cumulative_depr: number;
  [key: string]: unknown;
}

function groupByContract(rows: ScheduleRow[]) {
  const map = new Map<number, { meta: ScheduleRow; rows: ScheduleRow[] }>();
  for (const r of rows) {
    if (!map.has(r.contract_id)) map.set(r.contract_id, { meta: r, rows: [] });
    map.get(r.contract_id)!.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.meta.contract_ref.localeCompare(b.meta.contract_ref)
  );
}

// ── Chalk line divider ─────────────────────────────────────────────────────────
function ChalkLine() {
  return (
    <div
      className="w-full my-4"
      style={{
        height: "1px",
        background:
          "repeating-linear-gradient(90deg, rgba(74,222,128,0.35) 0px, rgba(74,222,128,0.35) 8px, transparent 8px, transparent 14px)",
      }}
    />
  );
}

// ── Step block ─────────────────────────────────────────────────────────────────
function Step({
  num,
  title,
  formula,
  substitution,
  result,
  resultColor = "#fde68a",
}: {
  num: number;
  title: string;
  formula: React.ReactNode;
  substitution: React.ReactNode;
  result: React.ReactNode;
  resultColor?: string;
}) {
  return (
    <div className="space-y-2">
      <div
        className="text-base font-bold tracking-wide"
        style={{ color: "#fde68a", fontFamily: "'Courier New', monospace" }}
      >
        STEP {num} &mdash; {title}
      </div>
      <div
        className="text-lg pl-6"
        style={{ color: "#c8ffc8", fontFamily: "'Courier New', monospace" }}
      >
        {formula}
      </div>
      <div
        className="text-base pl-6"
        style={{ color: "#86efac", fontFamily: "'Courier New', monospace" }}
      >
        {substitution}
      </div>
      <div
        className="text-xl pl-6 font-bold"
        style={{ color: resultColor, fontFamily: "'Courier New', monospace" }}
      >
        {result}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AmortisationBlackboard() {
  const [, navigate] = useLocation();

  // Read contractId from URL query param
  const params = new URLSearchParams(window.location.search);
  const contractIdParam = params.get("contractId");
  const contractId = contractIdParam ? parseInt(contractIdParam, 10) : null;

  // Fetch all schedule rows (year=0 means all)
  const { data: rawSchedule, isLoading } =
    trpc.lease.getAmortisationScheduleAll.useQuery({ year: 0, viewMode: "monthly" });

  const scheduleRows: ScheduleRow[] = Array.isArray(rawSchedule)
    ? (rawSchedule as ScheduleRow[])
    : [];

  const grouped = useMemo(() => groupByContract(scheduleRows), [scheduleRows]);

  // Find selected contract index
  const selectedIdx = contractId
    ? grouped.findIndex((g) => g.meta.contract_id === contractId)
    : 0;
  const [idx, setIdx] = useState(Math.max(0, selectedIdx));

  const current = grouped[idx];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div
          className="flex items-center justify-center h-full text-lg"
          style={{ color: "#4ade80", fontFamily: "'Courier New', monospace" }}
        >
          Loading amortisation data...
        </div>
      </DashboardLayout>
    );
  }

  if (!current) {
    return (
      <DashboardLayout>
        <div
          className="flex flex-col items-center justify-center h-full gap-4"
          style={{ color: "#4ade80", fontFamily: "'Courier New', monospace" }}
        >
          <div className="text-lg">No amortisation data found.</div>
          <div className="text-sm" style={{ color: "rgba(74,222,128,0.6)" }}>
            Please run Calculate Amortisation first.
          </div>
          <Button variant="outline" onClick={() => navigate("/leases/amortisation")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Amortisation
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const ex = current.rows[0];
  const cur = ex.currency || "QAR";
  const PMT = ex.monthly_payment;
  const IBR = ex.ibr;
  const N = ex.term_months;
  const r = IBR / 12 / 100;
  const PV = PMT * (1 - Math.pow(1 + r, -N)) / r;
  const INT = PV * r;
  const PRIN = PMT - INT;
  const CL = PV - PRIN;
  const DEPR = PV / N;

  return (
    <DashboardLayout>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(74,222,128,0.25)", background: "#0d1f0d" }}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/leases/amortisation")}
            style={{ color: "#4ade80", borderColor: "rgba(74,222,128,0.3)" }}
            className="border"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <div
              className="text-base font-bold"
              style={{ color: "#4ade80", fontFamily: "'Courier New', monospace" }}
            >
              IFRS 16 — Amortisation Calculation Walkthrough
            </div>
            <div className="text-xs" style={{ color: "rgba(74,222,128,0.55)" }}>
              {ex.contract_ref} &nbsp;·&nbsp; {ex.asset_description} &nbsp;·&nbsp;{" "}
              {ex.lessor_name}
            </div>
          </div>
        </div>

        {/* Lease navigator */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={idx === 0}
            onClick={() => setIdx((i) => i - 1)}
            style={{ color: "#4ade80" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span
            className="text-sm px-3 py-1 rounded"
            style={{
              color: "#4ade80",
              background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.25)",
              fontFamily: "'Courier New', monospace",
            }}
          >
            {idx + 1} / {grouped.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={idx === grouped.length - 1}
            onClick={() => setIdx((i) => i + 1)}
            style={{ color: "#4ade80" }}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* ── Blackboard canvas ───────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto p-8"
        style={{
          background: "#0f1f0f",
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 34px, rgba(74,222,128,0.04) 34px, rgba(74,222,128,0.04) 35px)",
        }}
      >
        {/* Given values banner */}
        <div
          className="grid grid-cols-3 gap-4 mb-8 rounded-xl p-5"
          style={{
            background: "rgba(74,222,128,0.05)",
            border: "1px solid rgba(74,222,128,0.2)",
          }}
        >
          <div className="text-center">
            <div
              className="text-xs mb-1"
              style={{ color: "rgba(74,222,128,0.5)", fontFamily: "'Courier New', monospace" }}
            >
              MONTHLY RENT (PMT)
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: "#86efac", fontFamily: "'Courier New', monospace" }}
            >
              {fmt(PMT, cur)}
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-xs mb-1"
              style={{ color: "rgba(74,222,128,0.5)", fontFamily: "'Courier New', monospace" }}
            >
              IBR (ANNUAL %)
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: "#86efac", fontFamily: "'Courier New', monospace" }}
            >
              {IBR}%
            </div>
          </div>
          <div className="text-center">
            <div
              className="text-xs mb-1"
              style={{ color: "rgba(74,222,128,0.5)", fontFamily: "'Courier New', monospace" }}
            >
              TERM
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: "#86efac", fontFamily: "'Courier New', monospace" }}
            >
              {N} months
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto space-y-0">
          {/* Step 1 */}
          <Step
            num={1}
            title="Monthly Interest Rate (r)"
            formula={<>r &nbsp;= &nbsp;IBR &divide; 12 &divide; 100</>}
            substitution={
              <>
                r &nbsp;= &nbsp;{IBR}% &divide; 12 &divide; 100
              </>
            }
            result={<>r &nbsp;= &nbsp;{fmtPct(r)}</>}
          />
          <ChalkLine />

          {/* Step 2 */}
          <Step
            num={2}
            title="Opening Liability — Present Value of all future rents"
            formula={
              <>
                <span style={{ color: "#93c5fd" }}>Opening Liability</span>
                &nbsp;= &nbsp;PMT &times; (1 &minus; (1 + r)<sup>&minus;N</sup>) &divide; r
              </>
            }
            substitution={
              <>
                = &nbsp;{fmt(PMT, cur)} &times; (1 &minus; (1 + {fmtPct(r)})<sup>&minus;{N}</sup>) &divide; {fmtPct(r)}
              </>
            }
            result={
              <>
                <span style={{ color: "#93c5fd" }}>Opening Liability</span>
                &nbsp;= &nbsp;{fmt(PV, cur)}
              </>
            }
            resultColor="#93c5fd"
          />
          <ChalkLine />

          {/* Step 3 */}
          <Step
            num={3}
            title="Interest — Finance cost for Month 1"
            formula={
              <>
                <span style={{ color: "#fbbf24" }}>Interest</span>
                &nbsp;= &nbsp;
                <span style={{ color: "#93c5fd" }}>Opening Liability</span>
                &nbsp;&times;&nbsp;r
              </>
            }
            substitution={
              <>
                = &nbsp;{fmt(PV, cur)} &times; {fmtPct(r)}
              </>
            }
            result={
              <>
                <span style={{ color: "#fbbf24" }}>Interest</span>
                &nbsp;= &nbsp;{fmt(INT, cur)}
              </>
            }
            resultColor="#fbbf24"
          />
          <ChalkLine />

          {/* Step 4 */}
          <Step
            num={4}
            title="Payment — Cash paid to landlord (fixed)"
            formula={
              <>
                <span style={{ color: "#60a5fa" }}>Payment</span>
                &nbsp;= &nbsp;Monthly Rent (fixed contractual amount)
              </>
            }
            substitution={<>&nbsp;</>}
            result={
              <>
                <span style={{ color: "#60a5fa" }}>Payment</span>
                &nbsp;= &nbsp;{fmt(PMT, cur)}
              </>
            }
            resultColor="#60a5fa"
          />
          <ChalkLine />

          {/* Step 5 */}
          <Step
            num={5}
            title="Principal — Portion of rent that reduces the liability"
            formula={
              <>
                <span style={{ color: "#34d399" }}>Principal</span>
                &nbsp;= &nbsp;
                <span style={{ color: "#60a5fa" }}>Payment</span>
                &nbsp;&minus;&nbsp;
                <span style={{ color: "#fbbf24" }}>Interest</span>
              </>
            }
            substitution={
              <>
                = &nbsp;{fmt(PMT, cur)} &minus; {fmt(INT, cur)}
              </>
            }
            result={
              <>
                <span style={{ color: "#34d399" }}>Principal</span>
                &nbsp;= &nbsp;{fmt(PRIN, cur)}
              </>
            }
            resultColor="#34d399"
          />
          <ChalkLine />

          {/* Step 6 */}
          <Step
            num={6}
            title="Closing Liability — Balance remaining after this month"
            formula={
              <>
                <span style={{ color: "#a78bfa" }}>Closing Liability</span>
                &nbsp;= &nbsp;
                <span style={{ color: "#93c5fd" }}>Opening Liability</span>
                &nbsp;&minus;&nbsp;
                <span style={{ color: "#34d399" }}>Principal</span>
              </>
            }
            substitution={
              <>
                = &nbsp;{fmt(PV, cur)} &minus; {fmt(PRIN, cur)}
              </>
            }
            result={
              <>
                <span style={{ color: "#a78bfa" }}>Closing Liability</span>
                &nbsp;= &nbsp;{fmt(CL, cur)}
              </>
            }
            resultColor="#a78bfa"
          />
          <ChalkLine />

          {/* Step 7 */}
          <Step
            num={7}
            title="Depreciation — ROU asset written off evenly each month"
            formula={
              <>
                <span style={{ color: "#c084fc" }}>Depreciation</span>
                &nbsp;= &nbsp;
                <span style={{ color: "#93c5fd" }}>Opening Liability</span>
                &nbsp;&divide;&nbsp;Term
              </>
            }
            substitution={
              <>
                = &nbsp;{fmt(PV, cur)} &divide; {N}
              </>
            }
            result={
              <>
                <span style={{ color: "#c084fc" }}>Depreciation</span>
                &nbsp;= &nbsp;{fmt(DEPR, cur)}
              </>
            }
            resultColor="#c084fc"
          />

          <ChalkLine />

          {/* Summary board */}
          <div
            className="rounded-2xl p-6 mt-2"
            style={{
              background: "rgba(74,222,128,0.05)",
              border: "2px dashed rgba(74,222,128,0.3)",
            }}
          >
            <div
              className="text-sm font-bold mb-5 tracking-widest"
              style={{ color: "#4ade80", fontFamily: "'Courier New', monospace" }}
            >
              &#x2713;&nbsp; MONTH 1 SUMMARY &mdash; {ex.contract_ref}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { lbl: "Opening Liability", val: fmt(PV, cur),   col: "#93c5fd" },
                { lbl: "Interest",          val: fmt(INT, cur),  col: "#fbbf24" },
                { lbl: "Payment",           val: fmt(PMT, cur),  col: "#60a5fa" },
                { lbl: "Principal",         val: fmt(PRIN, cur), col: "#34d399" },
                { lbl: "Closing Liability", val: fmt(CL, cur),   col: "#a78bfa" },
                { lbl: "Depreciation",      val: fmt(DEPR, cur), col: "#c084fc" },
              ].map(({ lbl, val, col }) => (
                <div
                  key={lbl}
                  className="rounded-lg p-3 text-center"
                  style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${col}33` }}
                >
                  <div
                    className="text-[11px] mb-1"
                    style={{ color: "rgba(226,255,226,0.5)", fontFamily: "'Courier New', monospace" }}
                  >
                    {lbl}
                  </div>
                  <div
                    className="text-base font-bold"
                    style={{ color: col, fontFamily: "'Courier New', monospace" }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>

            {/* P&L vs Cash */}
            <div
              className="mt-5 pt-4 flex flex-wrap gap-6 text-sm"
              style={{
                borderTop: "1px solid rgba(74,222,128,0.2)",
                fontFamily: "'Courier New', monospace",
                color: "rgba(74,222,128,0.7)",
              }}
            >
              <span>
                P&amp;L charge this month:&nbsp;
                <span style={{ color: "#fbbf24" }}>{fmt(INT, cur)}</span>
                &nbsp;+&nbsp;
                <span style={{ color: "#c084fc" }}>{fmt(DEPR, cur)}</span>
                &nbsp;=&nbsp;
                <span style={{ color: "#fde68a", fontWeight: "bold" }}>{fmt(INT + DEPR, cur)}</span>
              </span>
              <span>
                Cash paid:&nbsp;
                <span style={{ color: "#60a5fa", fontWeight: "bold" }}>{fmt(PMT, cur)}</span>
              </span>
              <span>
                Difference (non-cash):&nbsp;
                <span style={{ color: "#f87171", fontWeight: "bold" }}>
                  {fmt(INT + DEPR - PMT, cur)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
