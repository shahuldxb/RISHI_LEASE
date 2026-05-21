/**
 * JV Line Dr/Cr Grouping Utility
 * 
 * Groups journal voucher lines by matching Debit and Credit amounts.
 * Each group contains one or more Dr lines paired with their matching Cr lines.
 * 
 * Algorithm:
 * 1. Exact 1:1 match — a single Dr matches a single Cr by amount
 * 2. 1:N match — a single Dr matches multiple Cr lines whose amounts sum to the Dr
 * 3. N:1 match — multiple Dr lines whose amounts sum to a single Cr
 * 4. Unmatched lines form their own group at the end
 */

export interface JVLine {
  line_id?: number;
  line_seq?: number;
  dr_cr: 'Dr' | 'Cr';
  account_code: string;
  account_name: string;
  amount: number;
  description?: string;
  currency?: string;
  calc_explanation?: string;
  [key: string]: any;
}

export interface JVGroup {
  id: number;
  label: string;
  drLines: JVLine[];
  crLines: JVLine[];
  drTotal: number;
  crTotal: number;
  balanced: boolean;
}

/**
 * Group JV lines by matching Dr/Cr amounts.
 * Returns an array of groups, each containing related Dr and Cr lines.
 */
export function groupDrCrByAmount(lines: JVLine[]): JVGroup[] {
  const drLines = lines.filter(l => l.dr_cr?.toUpperCase() === 'DR').map(l => ({ ...l, _matched: false }));
  const crLines = lines.filter(l => l.dr_cr?.toUpperCase() === 'CR').map(l => ({ ...l, _matched: false }));
  const groups: JVGroup[] = [];
  let groupId = 0;

  // Pass 1: Exact 1:1 matches (Dr amount === Cr amount)
  for (const dr of drLines) {
    if (dr._matched) continue;
    const matchIdx = crLines.findIndex(cr => !cr._matched && Math.abs(cr.amount - dr.amount) < 0.01);
    if (matchIdx !== -1) {
      const cr = crLines[matchIdx];
      dr._matched = true;
      cr._matched = true;
      groupId++;
      groups.push({
        id: groupId,
        label: `${dr.account_name} → ${cr.account_name}`,
        drLines: [dr],
        crLines: [cr],
        drTotal: dr.amount,
        crTotal: cr.amount,
        balanced: true,
      });
    }
  }

  // Pass 2: 1:N matches — one Dr matches multiple unmatched Cr lines summing to Dr amount
  for (const dr of drLines) {
    if (dr._matched) continue;
    const unmatchedCr = crLines.filter(cr => !cr._matched);
    const matchingCrs = findSubsetSum(unmatchedCr, dr.amount);
    if (matchingCrs.length > 0) {
      dr._matched = true;
      matchingCrs.forEach(cr => { cr._matched = true; });
      groupId++;
      const crTotal = matchingCrs.reduce((s, cr) => s + cr.amount, 0);
      groups.push({
        id: groupId,
        label: `${dr.account_name} → ${matchingCrs.map(cr => cr.account_name).join(' + ')}`,
        drLines: [dr],
        crLines: matchingCrs,
        drTotal: dr.amount,
        crTotal,
        balanced: Math.abs(dr.amount - crTotal) < 0.01,
      });
    }
  }

  // Pass 3: N:1 matches — multiple unmatched Dr lines sum to a single unmatched Cr
  for (const cr of crLines) {
    if (cr._matched) continue;
    const unmatchedDr = drLines.filter(d => !d._matched);
    const matchingDrs = findSubsetSum(unmatchedDr, cr.amount);
    if (matchingDrs.length > 0) {
      cr._matched = true;
      matchingDrs.forEach(d => { d._matched = true; });
      groupId++;
      const drTotal = matchingDrs.reduce((s, d) => s + d.amount, 0);
      groups.push({
        id: groupId,
        label: `${matchingDrs.map(d => d.account_name).join(' + ')} → ${cr.account_name}`,
        drLines: matchingDrs,
        crLines: [cr],
        drTotal,
        crTotal: cr.amount,
        balanced: Math.abs(drTotal - cr.amount) < 0.01,
      });
    }
  }

  // Pass 4: Remaining unmatched lines — group all remaining Dr and Cr together
  const remainDr = drLines.filter(d => !d._matched);
  const remainCr = crLines.filter(c => !c._matched);
  if (remainDr.length > 0 || remainCr.length > 0) {
    groupId++;
    const drTotal = remainDr.reduce((s, d) => s + d.amount, 0);
    const crTotal = remainCr.reduce((s, c) => s + c.amount, 0);
    groups.push({
      id: groupId,
      label: remainDr.length > 0 && remainCr.length > 0
        ? 'Other Entries'
        : remainDr.length > 0 ? 'Unmatched Debits' : 'Unmatched Credits',
      drLines: remainDr,
      crLines: remainCr,
      drTotal,
      crTotal,
      balanced: Math.abs(drTotal - crTotal) < 0.01,
    });
  }

  return groups;
}

/**
 * Find a subset of lines whose amounts sum to the target (within 0.01 tolerance).
 * Uses a greedy approach for performance (works well for typical JV sizes of 2-10 lines).
 * Falls back to brute-force for small sets (≤8 lines).
 */
function findSubsetSum<T extends { amount: number; _matched: boolean }>(
  lines: T[],
  target: number
): T[] {
  const candidates = lines.filter(l => !l._matched && l.amount <= target + 0.01);
  if (candidates.length === 0) return [];

  // For small sets, try all combinations (2^n where n ≤ 8 = 256 max)
  if (candidates.length <= 8) {
    const n = candidates.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      let sum = 0;
      const subset: T[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          sum += candidates[i].amount;
          subset.push(candidates[i]);
        }
      }
      if (Math.abs(sum - target) < 0.01 && subset.length > 1) {
        return subset;
      }
    }
  } else {
    // Greedy: sort descending, pick lines until we hit the target
    const sorted = [...candidates].sort((a, b) => b.amount - a.amount);
    let remaining = target;
    const result: T[] = [];
    for (const line of sorted) {
      if (line.amount <= remaining + 0.01) {
        result.push(line);
        remaining -= line.amount;
        if (Math.abs(remaining) < 0.01) return result;
      }
    }
  }

  return [];
}

/**
 * Format amount with currency for display.
 */
export function fmtAmount(n: number | null | undefined, cur = "QAR"): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-QA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + cur;
}
