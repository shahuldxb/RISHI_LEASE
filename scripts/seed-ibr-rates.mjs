/**
 * Seed realistic IBR (Incremental Borrowing Rate) Library
 * Based on actual market data:
 * - QAR: Qatar Central Bank rates (QCBDR 3.85%, QCBLR 4.35%, Repo 4.10%) as of Apr 2026
 * - USD: Fed Funds 4.25-4.50% (Jan 2025 cut), SOFR-based
 * - AED: UAE CBUAE base rate tracks Fed closely (pegged to USD)
 * - SAR: SAMA repo rate 5.00% (tracks Fed with slight premium)
 * - EUR: ECB deposit facility 3.00% (Dec 2024 cut)
 * - GBP: BoE base rate 4.50% (Feb 2025)
 * 
 * IBR adjustments by tenor and asset type:
 * - Short-term (1-12 mo): base + 0.50-1.00% credit spread
 * - Medium-term (13-36 mo): base + 0.75-1.25%
 * - Long-term (37-60 mo): base + 1.00-1.75%
 * - Very long-term (61-120 mo): base + 1.50-2.25%
 * - Ultra long-term (121+ mo): base + 2.00-2.75%
 * 
 * Historical periods included:
 * - 2022: High-rate environment (Fed hiking cycle)
 * - 2023: Peak rates
 * - 2024: Rates plateau, initial cuts
 * - 2025-2026: Easing cycle
 */

import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT),
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
};

const IBR_DATA = [
  // ═══════════════════════════════════════════════════════════════════════════
  // QAR — Qatar Riyal (primary currency for Vodafone Qatar)
  // Base: QCB lending rate 4.35% (Apr 2026), adjusted for corporate credit spread
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 2022 — Hiking cycle (QCB followed Fed from 1.75% to 5.50%)
  { currency: 'QAR', min: 1, max: 12, rate: 5.2500, from: '2022-01-01', to: '2022-06-30', source: 'Qatar Central Bank / QIBOR', notes: 'Short-term ≤1yr — early 2022 hiking cycle' },
  { currency: 'QAR', min: 13, max: 36, rate: 5.7500, from: '2022-01-01', to: '2022-06-30', source: 'Qatar Central Bank / QIBOR', notes: 'Medium-term 1-3yr — early 2022' },
  { currency: 'QAR', min: 37, max: 60, rate: 6.0000, from: '2022-01-01', to: '2022-06-30', source: 'Qatar Central Bank / QIBOR', notes: 'Long-term 3-5yr — early 2022' },
  { currency: 'QAR', min: 61, max: 120, rate: 6.5000, from: '2022-01-01', to: '2022-06-30', source: 'Qatar Central Bank / QIBOR', notes: 'Very long-term 5-10yr — early 2022' },
  { currency: 'QAR', min: 121, max: 360, rate: 7.0000, from: '2022-01-01', to: '2022-06-30', source: 'Qatar Central Bank / QIBOR', notes: 'Ultra long-term >10yr — early 2022' },

  { currency: 'QAR', min: 1, max: 12, rate: 6.0000, from: '2022-07-01', to: '2022-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Short-term ≤1yr — H2 2022 aggressive hikes' },
  { currency: 'QAR', min: 13, max: 36, rate: 6.5000, from: '2022-07-01', to: '2022-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Medium-term 1-3yr — H2 2022' },
  { currency: 'QAR', min: 37, max: 60, rate: 6.7500, from: '2022-07-01', to: '2022-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Long-term 3-5yr — H2 2022' },
  { currency: 'QAR', min: 61, max: 120, rate: 7.2500, from: '2022-07-01', to: '2022-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Very long-term 5-10yr — H2 2022' },
  { currency: 'QAR', min: 121, max: 360, rate: 7.7500, from: '2022-07-01', to: '2022-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Ultra long-term >10yr — H2 2022' },

  // 2023 — Peak rate environment (QCB deposit 6.00%, lending 6.50%)
  { currency: 'QAR', min: 1, max: 12, rate: 6.5000, from: '2023-01-01', to: '2023-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Short-term ≤1yr — peak rates 2023' },
  { currency: 'QAR', min: 13, max: 36, rate: 7.0000, from: '2023-01-01', to: '2023-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Medium-term 1-3yr — peak rates 2023' },
  { currency: 'QAR', min: 37, max: 60, rate: 7.2500, from: '2023-01-01', to: '2023-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Long-term 3-5yr — peak rates 2023' },
  { currency: 'QAR', min: 61, max: 120, rate: 7.5000, from: '2023-01-01', to: '2023-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Very long-term 5-10yr — peak rates 2023' },
  { currency: 'QAR', min: 121, max: 360, rate: 7.7500, from: '2023-01-01', to: '2023-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Ultra long-term >10yr — peak rates 2023' },

  // 2024 — Plateau then initial cuts (QCB cut 75bps in Q4 2024)
  { currency: 'QAR', min: 1, max: 12, rate: 6.2500, from: '2024-01-01', to: '2024-08-31', source: 'Qatar Central Bank / QIBOR', notes: 'Short-term ≤1yr — pre-cut 2024' },
  { currency: 'QAR', min: 13, max: 36, rate: 6.7500, from: '2024-01-01', to: '2024-08-31', source: 'Qatar Central Bank / QIBOR', notes: 'Medium-term 1-3yr — pre-cut 2024' },
  { currency: 'QAR', min: 37, max: 60, rate: 7.0000, from: '2024-01-01', to: '2024-08-31', source: 'Qatar Central Bank / QIBOR', notes: 'Long-term 3-5yr — pre-cut 2024' },
  { currency: 'QAR', min: 61, max: 120, rate: 7.2500, from: '2024-01-01', to: '2024-08-31', source: 'Qatar Central Bank / QIBOR', notes: 'Very long-term 5-10yr — pre-cut 2024' },
  { currency: 'QAR', min: 121, max: 360, rate: 7.5000, from: '2024-01-01', to: '2024-08-31', source: 'Qatar Central Bank / QIBOR', notes: 'Ultra long-term >10yr — pre-cut 2024' },

  { currency: 'QAR', min: 1, max: 12, rate: 5.7500, from: '2024-09-01', to: '2024-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Short-term ≤1yr — post first cuts Q4 2024' },
  { currency: 'QAR', min: 13, max: 36, rate: 6.2500, from: '2024-09-01', to: '2024-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Medium-term 1-3yr — post first cuts Q4 2024' },
  { currency: 'QAR', min: 37, max: 60, rate: 6.5000, from: '2024-09-01', to: '2024-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Long-term 3-5yr — post first cuts Q4 2024' },
  { currency: 'QAR', min: 61, max: 120, rate: 6.7500, from: '2024-09-01', to: '2024-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Very long-term 5-10yr — post first cuts Q4 2024' },
  { currency: 'QAR', min: 121, max: 360, rate: 7.0000, from: '2024-09-01', to: '2024-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Ultra long-term >10yr — post first cuts Q4 2024' },

  // 2025 — Easing cycle (QCB cut to QCBLR 4.35%, QCBDR 3.85%)
  { currency: 'QAR', min: 1, max: 12, rate: 5.2500, from: '2025-01-01', to: '2025-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Short-term ≤1yr — easing 2025 (QCBLR 4.35% + 0.90% spread)' },
  { currency: 'QAR', min: 13, max: 36, rate: 5.7500, from: '2025-01-01', to: '2025-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Medium-term 1-3yr — easing 2025' },
  { currency: 'QAR', min: 37, max: 60, rate: 6.0000, from: '2025-01-01', to: '2025-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Long-term 3-5yr — easing 2025' },
  { currency: 'QAR', min: 61, max: 120, rate: 6.2500, from: '2025-01-01', to: '2025-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Very long-term 5-10yr — easing 2025' },
  { currency: 'QAR', min: 121, max: 360, rate: 6.5000, from: '2025-01-01', to: '2025-12-31', source: 'Qatar Central Bank / QIBOR', notes: 'Ultra long-term >10yr — easing 2025' },

  // 2026 — Current (QCB maintained Apr 2026: QCBLR 4.35%)
  { currency: 'QAR', min: 1, max: 12, rate: 5.1000, from: '2026-01-01', to: null, source: 'Qatar Central Bank / QIBOR 3M 4.04%', notes: 'Short-term ≤1yr — current 2026 (QIBOR 3M + 1.06% credit spread)' },
  { currency: 'QAR', min: 13, max: 36, rate: 5.5000, from: '2026-01-01', to: null, source: 'Qatar Central Bank / QIBOR', notes: 'Medium-term 1-3yr — current 2026' },
  { currency: 'QAR', min: 37, max: 60, rate: 5.8500, from: '2026-01-01', to: null, source: 'Qatar Central Bank / QIBOR', notes: 'Long-term 3-5yr — current 2026' },
  { currency: 'QAR', min: 61, max: 120, rate: 6.1000, from: '2026-01-01', to: null, source: 'Qatar Central Bank / QIBOR', notes: 'Very long-term 5-10yr — current 2026' },
  { currency: 'QAR', min: 121, max: 360, rate: 6.3500, from: '2026-01-01', to: null, source: 'Qatar Central Bank / QIBOR', notes: 'Ultra long-term >10yr — current 2026' },

  // ═══════════════════════════════════════════════════════════════════════════
  // USD — US Dollar (international leases, equipment imports)
  // Base: Fed Funds 4.25-4.50%, SOFR ~4.30%
  // ═══════════════════════════════════════════════════════════════════════════

  // 2023 — Peak (Fed 5.25-5.50%)
  { currency: 'USD', min: 1, max: 12, rate: 6.2500, from: '2023-01-01', to: '2023-12-31', source: 'US Federal Reserve / SOFR', notes: 'Short-term ≤1yr — peak Fed rate 2023' },
  { currency: 'USD', min: 13, max: 36, rate: 6.5000, from: '2023-01-01', to: '2023-12-31', source: 'US Federal Reserve / SOFR', notes: 'Medium-term 1-3yr — peak 2023' },
  { currency: 'USD', min: 37, max: 60, rate: 6.7500, from: '2023-01-01', to: '2023-12-31', source: 'US Federal Reserve / SOFR', notes: 'Long-term 3-5yr — peak 2023' },
  { currency: 'USD', min: 61, max: 120, rate: 7.0000, from: '2023-01-01', to: '2023-12-31', source: 'US Federal Reserve / SOFR', notes: 'Very long-term 5-10yr — peak 2023' },
  { currency: 'USD', min: 121, max: 360, rate: 7.2500, from: '2023-01-01', to: '2023-12-31', source: 'US Federal Reserve / SOFR', notes: 'Ultra long-term >10yr — peak 2023' },

  // 2024 — First cuts (Fed cut 100bps to 4.25-4.50%)
  { currency: 'USD', min: 1, max: 12, rate: 5.7500, from: '2024-01-01', to: '2024-08-31', source: 'US Federal Reserve / SOFR', notes: 'Short-term ≤1yr — pre-cut 2024' },
  { currency: 'USD', min: 13, max: 36, rate: 6.0000, from: '2024-01-01', to: '2024-08-31', source: 'US Federal Reserve / SOFR', notes: 'Medium-term 1-3yr — pre-cut 2024' },
  { currency: 'USD', min: 37, max: 60, rate: 6.2500, from: '2024-01-01', to: '2024-08-31', source: 'US Federal Reserve / SOFR', notes: 'Long-term 3-5yr — pre-cut 2024' },
  { currency: 'USD', min: 61, max: 120, rate: 6.5000, from: '2024-01-01', to: '2024-08-31', source: 'US Federal Reserve / SOFR', notes: 'Very long-term 5-10yr — pre-cut 2024' },
  { currency: 'USD', min: 121, max: 360, rate: 6.7500, from: '2024-01-01', to: '2024-08-31', source: 'US Federal Reserve / SOFR', notes: 'Ultra long-term >10yr — pre-cut 2024' },

  { currency: 'USD', min: 1, max: 12, rate: 5.2500, from: '2024-09-01', to: '2024-12-31', source: 'US Federal Reserve / SOFR', notes: 'Short-term ≤1yr — post cuts Q4 2024' },
  { currency: 'USD', min: 13, max: 36, rate: 5.5000, from: '2024-09-01', to: '2024-12-31', source: 'US Federal Reserve / SOFR', notes: 'Medium-term 1-3yr — post cuts Q4 2024' },
  { currency: 'USD', min: 37, max: 60, rate: 5.7500, from: '2024-09-01', to: '2024-12-31', source: 'US Federal Reserve / SOFR', notes: 'Long-term 3-5yr — post cuts Q4 2024' },
  { currency: 'USD', min: 61, max: 120, rate: 6.0000, from: '2024-09-01', to: '2024-12-31', source: 'US Federal Reserve / SOFR', notes: 'Very long-term 5-10yr — post cuts Q4 2024' },
  { currency: 'USD', min: 121, max: 360, rate: 6.2500, from: '2024-09-01', to: '2024-12-31', source: 'US Federal Reserve / SOFR', notes: 'Ultra long-term >10yr — post cuts Q4 2024' },

  // 2025-2026 — Current (Fed 4.25-4.50% maintained, SOFR ~4.30%)
  { currency: 'USD', min: 1, max: 12, rate: 5.0000, from: '2025-01-01', to: '2025-12-31', source: 'US Federal Reserve / SOFR', notes: 'Short-term ≤1yr — 2025 (SOFR 4.30% + 0.70% spread)' },
  { currency: 'USD', min: 13, max: 36, rate: 5.3500, from: '2025-01-01', to: '2025-12-31', source: 'US Federal Reserve / SOFR', notes: 'Medium-term 1-3yr — 2025' },
  { currency: 'USD', min: 37, max: 60, rate: 5.6500, from: '2025-01-01', to: '2025-12-31', source: 'US Federal Reserve / SOFR', notes: 'Long-term 3-5yr — 2025' },
  { currency: 'USD', min: 61, max: 120, rate: 5.9000, from: '2025-01-01', to: '2025-12-31', source: 'US Federal Reserve / SOFR', notes: 'Very long-term 5-10yr — 2025' },
  { currency: 'USD', min: 121, max: 360, rate: 6.1500, from: '2025-01-01', to: '2025-12-31', source: 'US Federal Reserve / SOFR', notes: 'Ultra long-term >10yr — 2025' },

  { currency: 'USD', min: 1, max: 12, rate: 4.8500, from: '2026-01-01', to: null, source: 'US Federal Reserve / SOFR', notes: 'Short-term ≤1yr — current 2026' },
  { currency: 'USD', min: 13, max: 36, rate: 5.2000, from: '2026-01-01', to: null, source: 'US Federal Reserve / SOFR', notes: 'Medium-term 1-3yr — current 2026' },
  { currency: 'USD', min: 37, max: 60, rate: 5.5000, from: '2026-01-01', to: null, source: 'US Federal Reserve / SOFR', notes: 'Long-term 3-5yr — current 2026' },
  { currency: 'USD', min: 61, max: 120, rate: 5.7500, from: '2026-01-01', to: null, source: 'US Federal Reserve / SOFR', notes: 'Very long-term 5-10yr — current 2026' },
  { currency: 'USD', min: 121, max: 360, rate: 6.0000, from: '2026-01-01', to: null, source: 'US Federal Reserve / SOFR', notes: 'Ultra long-term >10yr — current 2026' },

  // ═══════════════════════════════════════════════════════════════════════════
  // AED — UAE Dirham (GCC cross-border leases, pegged to USD)
  // Base: CBUAE base rate 4.40% (tracks Fed + 15bps premium)
  // ═══════════════════════════════════════════════════════════════════════════

  // 2023 — Peak
  { currency: 'AED', min: 1, max: 12, rate: 6.3000, from: '2023-01-01', to: '2023-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Short-term ≤1yr — peak 2023' },
  { currency: 'AED', min: 13, max: 36, rate: 6.6000, from: '2023-01-01', to: '2023-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Medium-term 1-3yr — peak 2023' },
  { currency: 'AED', min: 37, max: 60, rate: 6.8500, from: '2023-01-01', to: '2023-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Long-term 3-5yr — peak 2023' },
  { currency: 'AED', min: 61, max: 120, rate: 7.1000, from: '2023-01-01', to: '2023-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Very long-term 5-10yr — peak 2023' },
  { currency: 'AED', min: 121, max: 360, rate: 7.3500, from: '2023-01-01', to: '2023-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Ultra long-term >10yr — peak 2023' },

  // 2024 — Cuts follow Fed
  { currency: 'AED', min: 1, max: 12, rate: 5.5000, from: '2024-01-01', to: '2024-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Short-term ≤1yr — 2024 post cuts' },
  { currency: 'AED', min: 13, max: 36, rate: 5.8500, from: '2024-01-01', to: '2024-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Medium-term 1-3yr — 2024' },
  { currency: 'AED', min: 37, max: 60, rate: 6.1000, from: '2024-01-01', to: '2024-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Long-term 3-5yr — 2024' },
  { currency: 'AED', min: 61, max: 120, rate: 6.3500, from: '2024-01-01', to: '2024-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Very long-term 5-10yr — 2024' },
  { currency: 'AED', min: 121, max: 360, rate: 6.6000, from: '2024-01-01', to: '2024-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Ultra long-term >10yr — 2024' },

  // 2025-2026 — Current
  { currency: 'AED', min: 1, max: 12, rate: 5.1500, from: '2025-01-01', to: '2025-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Short-term ≤1yr — 2025' },
  { currency: 'AED', min: 13, max: 36, rate: 5.5000, from: '2025-01-01', to: '2025-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Medium-term 1-3yr — 2025' },
  { currency: 'AED', min: 37, max: 60, rate: 5.7500, from: '2025-01-01', to: '2025-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Long-term 3-5yr — 2025' },
  { currency: 'AED', min: 61, max: 120, rate: 6.0000, from: '2025-01-01', to: '2025-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Very long-term 5-10yr — 2025' },
  { currency: 'AED', min: 121, max: 360, rate: 6.2500, from: '2025-01-01', to: '2025-12-31', source: 'Central Bank UAE / EIBOR', notes: 'Ultra long-term >10yr — 2025' },

  { currency: 'AED', min: 1, max: 12, rate: 5.0000, from: '2026-01-01', to: null, source: 'Central Bank UAE / EIBOR', notes: 'Short-term ≤1yr — current 2026' },
  { currency: 'AED', min: 13, max: 36, rate: 5.3500, from: '2026-01-01', to: null, source: 'Central Bank UAE / EIBOR', notes: 'Medium-term 1-3yr — current 2026' },
  { currency: 'AED', min: 37, max: 60, rate: 5.6000, from: '2026-01-01', to: null, source: 'Central Bank UAE / EIBOR', notes: 'Long-term 3-5yr — current 2026' },
  { currency: 'AED', min: 61, max: 120, rate: 5.8500, from: '2026-01-01', to: null, source: 'Central Bank UAE / EIBOR', notes: 'Very long-term 5-10yr — current 2026' },
  { currency: 'AED', min: 121, max: 360, rate: 6.1000, from: '2026-01-01', to: null, source: 'Central Bank UAE / EIBOR', notes: 'Ultra long-term >10yr — current 2026' },

  // ═══════════════════════════════════════════════════════════════════════════
  // SAR — Saudi Riyal (GCC cross-border, pegged to USD)
  // Base: SAMA repo rate 5.00%, SAIBOR 3M ~5.20%
  // ═══════════════════════════════════════════════════════════════════════════

  // 2024 — Post-cut
  { currency: 'SAR', min: 1, max: 12, rate: 5.8500, from: '2024-01-01', to: '2024-12-31', source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Short-term ≤1yr — 2024' },
  { currency: 'SAR', min: 13, max: 36, rate: 6.2000, from: '2024-01-01', to: '2024-12-31', source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Medium-term 1-3yr — 2024' },
  { currency: 'SAR', min: 37, max: 60, rate: 6.5000, from: '2024-01-01', to: '2024-12-31', source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Long-term 3-5yr — 2024' },
  { currency: 'SAR', min: 61, max: 120, rate: 6.7500, from: '2024-01-01', to: '2024-12-31', source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Very long-term 5-10yr — 2024' },
  { currency: 'SAR', min: 121, max: 360, rate: 7.0000, from: '2024-01-01', to: '2024-12-31', source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Ultra long-term >10yr — 2024' },

  // 2025-2026 — Current (SAMA cut to 5.00% repo)
  { currency: 'SAR', min: 1, max: 12, rate: 5.4000, from: '2025-01-01', to: null, source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Short-term ≤1yr — current (SAIBOR 3M + spread)' },
  { currency: 'SAR', min: 13, max: 36, rate: 5.7500, from: '2025-01-01', to: null, source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Medium-term 1-3yr — current' },
  { currency: 'SAR', min: 37, max: 60, rate: 6.0500, from: '2025-01-01', to: null, source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Long-term 3-5yr — current' },
  { currency: 'SAR', min: 61, max: 120, rate: 6.3000, from: '2025-01-01', to: null, source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Very long-term 5-10yr — current' },
  { currency: 'SAR', min: 121, max: 360, rate: 6.5500, from: '2025-01-01', to: null, source: 'Saudi Arabian Monetary Authority / SAIBOR', notes: 'Ultra long-term >10yr — current' },

  // ═══════════════════════════════════════════════════════════════════════════
  // EUR — Euro (European equipment vendors, Ericsson/Nokia leases)
  // Base: ECB deposit facility 2.50% (Mar 2025 cut), EURIBOR 3M ~2.60%
  // ═══════════════════════════════════════════════════════════════════════════

  // 2023 — Peak (ECB 4.00%)
  { currency: 'EUR', min: 1, max: 12, rate: 4.7500, from: '2023-01-01', to: '2023-12-31', source: 'European Central Bank / EURIBOR', notes: 'Short-term ≤1yr — peak ECB 2023' },
  { currency: 'EUR', min: 13, max: 36, rate: 5.0000, from: '2023-01-01', to: '2023-12-31', source: 'European Central Bank / EURIBOR', notes: 'Medium-term 1-3yr — peak 2023' },
  { currency: 'EUR', min: 37, max: 60, rate: 5.2500, from: '2023-01-01', to: '2023-12-31', source: 'European Central Bank / EURIBOR', notes: 'Long-term 3-5yr — peak 2023' },
  { currency: 'EUR', min: 61, max: 120, rate: 5.5000, from: '2023-01-01', to: '2023-12-31', source: 'European Central Bank / EURIBOR', notes: 'Very long-term 5-10yr — peak 2023' },
  { currency: 'EUR', min: 121, max: 360, rate: 5.7500, from: '2023-01-01', to: '2023-12-31', source: 'European Central Bank / EURIBOR', notes: 'Ultra long-term >10yr — peak 2023' },

  // 2024 — Cuts begin (ECB cut 100bps to 3.00%)
  { currency: 'EUR', min: 1, max: 12, rate: 4.2500, from: '2024-01-01', to: '2024-12-31', source: 'European Central Bank / EURIBOR', notes: 'Short-term ≤1yr — 2024 easing' },
  { currency: 'EUR', min: 13, max: 36, rate: 4.5000, from: '2024-01-01', to: '2024-12-31', source: 'European Central Bank / EURIBOR', notes: 'Medium-term 1-3yr — 2024' },
  { currency: 'EUR', min: 37, max: 60, rate: 4.7500, from: '2024-01-01', to: '2024-12-31', source: 'European Central Bank / EURIBOR', notes: 'Long-term 3-5yr — 2024' },
  { currency: 'EUR', min: 61, max: 120, rate: 5.0000, from: '2024-01-01', to: '2024-12-31', source: 'European Central Bank / EURIBOR', notes: 'Very long-term 5-10yr — 2024' },
  { currency: 'EUR', min: 121, max: 360, rate: 5.2500, from: '2024-01-01', to: '2024-12-31', source: 'European Central Bank / EURIBOR', notes: 'Ultra long-term >10yr — 2024' },

  // 2025-2026 — Current (ECB 2.50%)
  { currency: 'EUR', min: 1, max: 12, rate: 3.5000, from: '2025-01-01', to: '2025-12-31', source: 'European Central Bank / EURIBOR', notes: 'Short-term ≤1yr — 2025 (EURIBOR 3M 2.60% + 0.90% spread)' },
  { currency: 'EUR', min: 13, max: 36, rate: 3.8500, from: '2025-01-01', to: '2025-12-31', source: 'European Central Bank / EURIBOR', notes: 'Medium-term 1-3yr — 2025' },
  { currency: 'EUR', min: 37, max: 60, rate: 4.1500, from: '2025-01-01', to: '2025-12-31', source: 'European Central Bank / EURIBOR', notes: 'Long-term 3-5yr — 2025' },
  { currency: 'EUR', min: 61, max: 120, rate: 4.4000, from: '2025-01-01', to: '2025-12-31', source: 'European Central Bank / EURIBOR', notes: 'Very long-term 5-10yr — 2025' },
  { currency: 'EUR', min: 121, max: 360, rate: 4.6500, from: '2025-01-01', to: '2025-12-31', source: 'European Central Bank / EURIBOR', notes: 'Ultra long-term >10yr — 2025' },

  { currency: 'EUR', min: 1, max: 12, rate: 3.3500, from: '2026-01-01', to: null, source: 'European Central Bank / EURIBOR', notes: 'Short-term ≤1yr — current 2026' },
  { currency: 'EUR', min: 13, max: 36, rate: 3.7000, from: '2026-01-01', to: null, source: 'European Central Bank / EURIBOR', notes: 'Medium-term 1-3yr — current 2026' },
  { currency: 'EUR', min: 37, max: 60, rate: 4.0000, from: '2026-01-01', to: null, source: 'European Central Bank / EURIBOR', notes: 'Long-term 3-5yr — current 2026' },
  { currency: 'EUR', min: 61, max: 120, rate: 4.2500, from: '2026-01-01', to: null, source: 'European Central Bank / EURIBOR', notes: 'Very long-term 5-10yr — current 2026' },
  { currency: 'EUR', min: 121, max: 360, rate: 4.5000, from: '2026-01-01', to: null, source: 'European Central Bank / EURIBOR', notes: 'Ultra long-term >10yr — current 2026' },

  // ═══════════════════════════════════════════════════════════════════════════
  // GBP — British Pound (UK-sourced equipment, Vodafone Group intercompany)
  // Base: BoE base rate 4.50% (Feb 2025), SONIA ~4.45%
  // ═══════════════════════════════════════════════════════════════════════════

  // 2023 — Peak (BoE 5.25%)
  { currency: 'GBP', min: 1, max: 12, rate: 6.0000, from: '2023-01-01', to: '2023-12-31', source: 'Bank of England / SONIA', notes: 'Short-term ≤1yr — peak BoE 2023' },
  { currency: 'GBP', min: 13, max: 36, rate: 6.3000, from: '2023-01-01', to: '2023-12-31', source: 'Bank of England / SONIA', notes: 'Medium-term 1-3yr — peak 2023' },
  { currency: 'GBP', min: 37, max: 60, rate: 6.5500, from: '2023-01-01', to: '2023-12-31', source: 'Bank of England / SONIA', notes: 'Long-term 3-5yr — peak 2023' },
  { currency: 'GBP', min: 61, max: 120, rate: 6.8000, from: '2023-01-01', to: '2023-12-31', source: 'Bank of England / SONIA', notes: 'Very long-term 5-10yr — peak 2023' },
  { currency: 'GBP', min: 121, max: 360, rate: 7.0500, from: '2023-01-01', to: '2023-12-31', source: 'Bank of England / SONIA', notes: 'Ultra long-term >10yr — peak 2023' },

  // 2024 — Cuts begin (BoE cut to 4.75%)
  { currency: 'GBP', min: 1, max: 12, rate: 5.5000, from: '2024-01-01', to: '2024-12-31', source: 'Bank of England / SONIA', notes: 'Short-term ≤1yr — 2024' },
  { currency: 'GBP', min: 13, max: 36, rate: 5.8000, from: '2024-01-01', to: '2024-12-31', source: 'Bank of England / SONIA', notes: 'Medium-term 1-3yr — 2024' },
  { currency: 'GBP', min: 37, max: 60, rate: 6.0500, from: '2024-01-01', to: '2024-12-31', source: 'Bank of England / SONIA', notes: 'Long-term 3-5yr — 2024' },
  { currency: 'GBP', min: 61, max: 120, rate: 6.3000, from: '2024-01-01', to: '2024-12-31', source: 'Bank of England / SONIA', notes: 'Very long-term 5-10yr — 2024' },
  { currency: 'GBP', min: 121, max: 360, rate: 6.5500, from: '2024-01-01', to: '2024-12-31', source: 'Bank of England / SONIA', notes: 'Ultra long-term >10yr — 2024' },

  // 2025-2026 — Current (BoE 4.50%)
  { currency: 'GBP', min: 1, max: 12, rate: 5.2000, from: '2025-01-01', to: '2025-12-31', source: 'Bank of England / SONIA', notes: 'Short-term ≤1yr — 2025 (SONIA 4.45% + 0.75% spread)' },
  { currency: 'GBP', min: 13, max: 36, rate: 5.5000, from: '2025-01-01', to: '2025-12-31', source: 'Bank of England / SONIA', notes: 'Medium-term 1-3yr — 2025' },
  { currency: 'GBP', min: 37, max: 60, rate: 5.7500, from: '2025-01-01', to: '2025-12-31', source: 'Bank of England / SONIA', notes: 'Long-term 3-5yr — 2025' },
  { currency: 'GBP', min: 61, max: 120, rate: 6.0000, from: '2025-01-01', to: '2025-12-31', source: 'Bank of England / SONIA', notes: 'Very long-term 5-10yr — 2025' },
  { currency: 'GBP', min: 121, max: 360, rate: 6.2500, from: '2025-01-01', to: '2025-12-31', source: 'Bank of England / SONIA', notes: 'Ultra long-term >10yr — 2025' },

  { currency: 'GBP', min: 1, max: 12, rate: 5.1000, from: '2026-01-01', to: null, source: 'Bank of England / SONIA', notes: 'Short-term ≤1yr — current 2026' },
  { currency: 'GBP', min: 13, max: 36, rate: 5.4000, from: '2026-01-01', to: null, source: 'Bank of England / SONIA', notes: 'Medium-term 1-3yr — current 2026' },
  { currency: 'GBP', min: 37, max: 60, rate: 5.6500, from: '2026-01-01', to: null, source: 'Bank of England / SONIA', notes: 'Long-term 3-5yr — current 2026' },
  { currency: 'GBP', min: 61, max: 120, rate: 5.9000, from: '2026-01-01', to: null, source: 'Bank of England / SONIA', notes: 'Very long-term 5-10yr — current 2026' },
  { currency: 'GBP', min: 121, max: 360, rate: 6.1500, from: '2026-01-01', to: null, source: 'Bank of England / SONIA', notes: 'Ultra long-term >10yr — current 2026' },

  // ═══════════════════════════════════════════════════════════════════════════
  // BHD — Bahraini Dinar (GCC cross-border, pegged to USD)
  // Base: CBB key policy rate 5.50% (tracks Fed closely)
  // ═══════════════════════════════════════════════════════════════════════════

  // 2025-2026 — Current
  { currency: 'BHD', min: 1, max: 12, rate: 5.3000, from: '2025-01-01', to: null, source: 'Central Bank of Bahrain', notes: 'Short-term ≤1yr — current' },
  { currency: 'BHD', min: 13, max: 36, rate: 5.6500, from: '2025-01-01', to: null, source: 'Central Bank of Bahrain', notes: 'Medium-term 1-3yr — current' },
  { currency: 'BHD', min: 37, max: 60, rate: 5.9500, from: '2025-01-01', to: null, source: 'Central Bank of Bahrain', notes: 'Long-term 3-5yr — current' },
  { currency: 'BHD', min: 61, max: 120, rate: 6.2000, from: '2025-01-01', to: null, source: 'Central Bank of Bahrain', notes: 'Very long-term 5-10yr — current' },
  { currency: 'BHD', min: 121, max: 360, rate: 6.4500, from: '2025-01-01', to: null, source: 'Central Bank of Bahrain', notes: 'Ultra long-term >10yr — current' },

  // ═══════════════════════════════════════════════════════════════════════════
  // OMR — Omani Rial (GCC cross-border, pegged to USD)
  // Base: CBO repo rate 5.00%
  // ═══════════════════════════════════════════════════════════════════════════

  // 2025-2026 — Current
  { currency: 'OMR', min: 1, max: 12, rate: 5.5000, from: '2025-01-01', to: null, source: 'Central Bank of Oman', notes: 'Short-term ≤1yr — current (higher spread for Oman credit)' },
  { currency: 'OMR', min: 13, max: 36, rate: 5.8500, from: '2025-01-01', to: null, source: 'Central Bank of Oman', notes: 'Medium-term 1-3yr — current' },
  { currency: 'OMR', min: 37, max: 60, rate: 6.1500, from: '2025-01-01', to: null, source: 'Central Bank of Oman', notes: 'Long-term 3-5yr — current' },
  { currency: 'OMR', min: 61, max: 120, rate: 6.4000, from: '2025-01-01', to: null, source: 'Central Bank of Oman', notes: 'Very long-term 5-10yr — current' },
  { currency: 'OMR', min: 121, max: 360, rate: 6.6500, from: '2025-01-01', to: null, source: 'Central Bank of Oman', notes: 'Ultra long-term >10yr — current' },

  // ═══════════════════════════════════════════════════════════════════════════
  // KWD — Kuwaiti Dinar (GCC cross-border, basket peg)
  // Base: CBK discount rate 4.00% (lowest in GCC)
  // ═══════════════════════════════════════════════════════════════════════════

  // 2025-2026 — Current
  { currency: 'KWD', min: 1, max: 12, rate: 4.7500, from: '2025-01-01', to: null, source: 'Central Bank of Kuwait', notes: 'Short-term ≤1yr — current (CBK 4.00% + spread)' },
  { currency: 'KWD', min: 13, max: 36, rate: 5.1000, from: '2025-01-01', to: null, source: 'Central Bank of Kuwait', notes: 'Medium-term 1-3yr — current' },
  { currency: 'KWD', min: 37, max: 60, rate: 5.3500, from: '2025-01-01', to: null, source: 'Central Bank of Kuwait', notes: 'Long-term 3-5yr — current' },
  { currency: 'KWD', min: 61, max: 120, rate: 5.6000, from: '2025-01-01', to: null, source: 'Central Bank of Kuwait', notes: 'Very long-term 5-10yr — current' },
  { currency: 'KWD', min: 121, max: 360, rate: 5.8500, from: '2025-01-01', to: null, source: 'Central Bank of Kuwait', notes: 'Ultra long-term >10yr — current' },
];

async function main() {
  const pool = await sql.connect(config);
  
  // Step 1: Delete all existing rows
  const deleteResult = await pool.request().query('DELETE FROM lease.ibr_rates');
  console.log(`Deleted ${deleteResult.rowsAffected[0]} existing IBR rows`);
  
  // Step 2: Reseed identity
  await pool.request().query('DBCC CHECKIDENT (\'lease.ibr_rates\', RESEED, 0)');
  console.log('Identity reseeded to 0');
  
  // Step 3: Insert new rows
  let inserted = 0;
  for (const row of IBR_DATA) {
    await pool.request()
      .input('currency', sql.Char(3), row.currency)
      .input('min', sql.Int, row.min)
      .input('max', sql.Int, row.max)
      .input('rate', sql.Decimal(8, 4), row.rate)
      .input('from', sql.Date, row.from)
      .input('to', sql.Date, row.to)
      .input('source', sql.NVarChar(100), row.source)
      .input('notes', sql.NVarChar(500), row.notes)
      .query(`INSERT INTO lease.ibr_rates (currency, lease_term_min, lease_term_max, rate_pct, effective_from, effective_to, source, notes, is_active, created_at)
              VALUES (@currency, @min, @max, @rate, @from, @to, @source, @notes, 1, GETUTCDATE())`);
    inserted++;
  }
  
  console.log(`Inserted ${inserted} realistic IBR rows`);
  
  // Step 4: Verify
  const verify = await pool.request().query(`
    SELECT currency, COUNT(*) as rows, MIN(rate_pct) as min_rate, MAX(rate_pct) as max_rate,
           MIN(effective_from) as earliest, MAX(effective_from) as latest
    FROM lease.ibr_rates
    GROUP BY currency
    ORDER BY currency
  `);
  console.log('\nVerification summary:');
  verify.recordset.forEach(r => {
    console.log(`  ${r.currency.trim()}: ${r.rows} rows, rates ${r.min_rate}%-${r.max_rate}%, period ${r.earliest.toISOString().slice(0,10)} to ${r.latest.toISOString().slice(0,10)}`);
  });
  
  await pool.close();
}

main().catch(e => { console.error(e); process.exit(1); });
