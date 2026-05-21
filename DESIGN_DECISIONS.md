# VodaLease Enterprise — Design Decisions & Future Requirements

This file records architectural decisions and future requirements communicated by the product owner.
Any future development session MUST read this file before making changes.

---

## 1. GL Codes → Business Rules Table (Recorded: 2026-05-03)

**Decision:** In future, ALL General Ledger (GL) codes will be stored in the `business_rules` table (or a related rules table). The Business Rules Engine will become the **single source of truth** for GL account codes used across the entire application.

**Scope:** This applies to:
- Journal entry posting (JV lines)
- CPI escalation entries
- Lease modifications
- Lease terminations
- Lease renewals
- Sub-lease entries
- Impairment entries
- Any other accounting transaction

**Implementation guidance:**
- Store GL codes as rules with category `GL_CODE` or add a dedicated `gl_code` column to the `business_rules` table
- Each screen's business rules should define which GL accounts are debited/credited
- The AI generation (Alt+4) should include GL code assignments in the `journalEntryPattern` section
- When posting journals, the system should look up GL codes from the rules engine rather than hardcoding them

**Current state:** GL codes are currently seeded in the Chart of Accounts (`coa` schema) and referenced directly in posting logic. Migration to rules-based GL lookup is a future enhancement.

---

## 2. JV Lines — Group Dr/Cr by Matching Amounts (Recorded: 2026-05-03)

**Decision:** All journal voucher (JV) line displays across the application MUST group related Debit and Credit entries together by matching amounts, rather than showing all debits first then all credits.

**Rationale:** In IFRS 16 lease accounting, each debit has one or more corresponding credits. Displaying them as paired groups makes the accounting logic immediately clear. For example:
- Dr 10100 ROU Asset (658,113.80) is paired with Cr 21020 Lease Liability (608,113.80) + Cr 20020 IDC Accrued (50,000.00) — these credits sum to the debit.
- Dr 12020 Security Deposit (37,000.00) is paired with Cr 11000 Bank Account (37,000.00) — exact match.

**Grouping Algorithm:**
1. For each Dr line, find Cr lines whose amounts sum to the Dr amount (exact match first, then closest match).
2. If a single Cr matches a Dr exactly, pair them as a 1:1 group.
3. If multiple Cr lines sum to a Dr amount, pair them as a 1:N group.
4. Any unmatched Dr or Cr lines form their own group at the end.

**Visual Design:**
- Each group is visually separated with a subtle border/divider.
- Within a group, the Dr line appears first (green tint), followed by its matching Cr lines (red tint), indented slightly.
- A group connector line or bracket visually links the Dr to its Cr entries.
- Group total shown at the end of each group.

**Scope — All JV Display Screens:**
- `JournalVoucher.tsx` — Main JV ledger
- `TransactionEngine.tsx` — Transaction centre JV tab
- `GLJournals.tsx` — GL journal entries
- `NewLease.tsx` — Inception JV preview
- `CPIEscalation.tsx` — CPI remeasurement JV
- `RemeasurementEngine.tsx` — Remeasurement JV
- `PeriodClose.tsx` — Period-end close JV
- `CalcExplanationModal` — Calculation breakdown modal
- Any future screen that displays JV lines

**Implementation:** A shared utility function `groupDrCrByAmount()` in `client/src/lib/jvGrouping.ts` handles the grouping logic. All screens import and use this function.

---
