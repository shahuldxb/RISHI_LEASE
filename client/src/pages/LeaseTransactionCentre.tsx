/**
 * VodaLease Enterprise — Lease Transaction Centre
 * Layout: full-width page, lease selector as top-bar dropdown,
 * all tabs use the entire remaining screen space.
 */
import React, { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import DashboardLayout from '@/components/DashboardLayout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

import { LeaseStatPill, LeaseStatDivider, LeaseStatStrip } from "@/components/LeaseStatPill";
import { groupDrCrByAmount, type JVLine } from "@/lib/jvGrouping";
import {
  Building2, DollarSign, FileText, RefreshCw, XCircle, History,
  ChevronRight, CheckCircle2, AlertTriangle, Info, Package,
  ChevronDown, Search, X, User, Layers, MapPin, Phone, Mail, CreditCard, Hash,
  GitBranch, Scissors, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Zap, ExternalLink, Calculator,
  Download, Printer,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: unknown) =>
  typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = (d: unknown) =>
  d ? new Date(d as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today = () => new Date().toISOString().slice(0, 10);
const toDateInput = (d: unknown) => {
  if (!d) return '';
  const dt = new Date(d as string);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
};
const toInputNumber = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '';
};
const toRateInput = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : '';
};
const toLeaseClass = (v: unknown): 'Finance'|'Operating'|'ShortTerm'|'LowValue' => {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('short')) return 'ShortTerm';
  if (s.includes('low')) return 'LowValue';
  if (s.includes('operating')) return 'Operating';
  return 'Finance';
};

const safeFileName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const normalizeCalculationText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2212/g, '-')
    .replace(/\u00d7/g, 'x')
    .replace(/\u0394/g, 'Delta')
    .replace(/\u00a7/g, 'Sec. ')
    .replace(/\u2192/g, '->')
    .replace(/\u2713/g, 'OK')
    .replace(/[\u2550\u2551\u2554\u2557\u255a\u255d]/g, '=')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => HTML_ESCAPE[ch] ?? ch);

type CalculationSection = {
  heading: string;
  body: string;
};

const getCalculationText = (contentId: string) => {
  const element = document.getElementById(contentId);
  return element ? normalizeCalculationText(element.innerText) : '';
};

const getCalculationSections = (contentId: string): CalculationSection[] => {
  const element = document.getElementById(contentId);
  if (!element) return [];

  return Array.from(element.children)
    .map(child => normalizeCalculationText((child as HTMLElement).innerText))
    .filter(Boolean)
    .map(sectionText => {
      const lines = sectionText.split('\n').map(line => line.trim()).filter(Boolean);
      const heading = lines[0] ?? 'Calculation Step';
      const body = lines.slice(1).join('\n');
      return { heading, body };
    });
};

function downloadCalculationPdf(title: string, contentId: string) {
  const sections = getCalculationSections(contentId);
  if (!sections.length) {
    toast.error('Calculation content is not available for export.');
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const cardPadding = 14;
  const lineHeight = 12;
  let y = margin;

  const drawHeader = () => {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(234, 179, 8);
    doc.roundedRect(margin, y, usableWidth, 48, 8, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(17, 24, 39);
    doc.text(title, margin + 14, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin + 14, y + 36);
    y += 66;
  };

  const addPageIfNeeded = (requiredHeight: number) => {
    if (y + requiredHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const drawCard = (heading: string, lines: string[]) => {
    let remaining = [...lines];
    let isContinuation = false;

    do {
      const availableHeight = pageHeight - margin - y;
      if (availableHeight < 90) {
        doc.addPage();
        y = margin;
      }

      const maxLines = Math.max(4, Math.floor((pageHeight - margin - y - cardPadding * 2 - 22) / lineHeight));
      const chunk = remaining.splice(0, maxLines);
      const cardHeight = cardPadding * 2 + 20 + chunk.length * lineHeight;
      addPageIfNeeded(cardHeight);

      doc.setFillColor(249, 250, 251);
      doc.setDrawColor(148, 163, 184);
      doc.roundedRect(margin, y, usableWidth, cardHeight, 8, 8, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(161, 98, 7);
      doc.text(isContinuation ? `${heading} (continued)` : heading, margin + cardPadding, y + cardPadding + 2);

      doc.setFont('courier', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(31, 41, 55);
      let textY = y + cardPadding + 22;
      for (const line of chunk) {
        doc.text(line, margin + cardPadding, textY);
        textY += lineHeight;
      }

      y += cardHeight + 14;
      isContinuation = true;
    } while (remaining.length);
  };

  drawHeader();

  for (const section of sections) {
    const wrappedBody = section.body
      ? (doc.splitTextToSize(section.body, usableWidth - cardPadding * 2) as string[])
      : [];
    drawCard(section.heading, wrappedBody);
  }

  doc.save(`${safeFileName(title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
  toast.success('Calculation PDF downloaded.');
}

function printCalculation(title: string, contentId: string) {
  const sections = getCalculationSections(contentId);
  if (!sections.length) {
    toast.error('Calculation content is not available for printing.');
    return;
  }

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    frame.remove();
    toast.error('Print preview is not available.');
    return;
  }

  const sectionHtml = sections.map(section => `
    <section class="calc-card">
      <h2>${escapeHtml(section.heading)}</h2>
      ${section.body ? `<pre>${escapeHtml(section.body)}</pre>` : ''}
    </section>
  `).join('');

  printDocument.open();
  printDocument.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; }
          .report { max-width: 820px; margin: 0 auto; padding: 28px; }
          .report-header {
            border: 1px solid #eab308;
            border-left: 5px solid #eab308;
            border-radius: 10px;
            background: #fffbeb;
            padding: 16px 18px;
            margin-bottom: 18px;
          }
          h1 { font-size: 20px; margin: 0 0 8px; }
          .meta { color: #6b7280; font-size: 11px; }
          .calc-card {
            border: 1px solid #94a3b8;
            border-radius: 10px;
            background: #ffffff;
            padding: 16px 18px;
            margin: 14px 0;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .calc-card h2 {
            color: #a16207;
            font: 700 12px/1.4 "Courier New", monospace;
            margin: 0 0 12px;
          }
          .calc-card pre {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            font: 11px/1.55 "Courier New", monospace;
            margin: 0;
          }
          @page { margin: 14mm; }
          @media print {
            body { background: #ffffff; }
            .report { max-width: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <main class="report">
          <header class="report-header">
            <h1>${escapeHtml(title)}</h1>
            <div class="meta">Generated: ${new Date().toLocaleString()}</div>
          </header>
          ${sectionHtml}
        </main>
      </body>
    </html>
  `);
  printDocument.close();

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }, 100);
}

function CalculationModalActions({
  title,
  contentId,
  onClose,
}: {
  title: string;
  contentId: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => downloadCalculationPdf(title, contentId)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 text-xs font-bold hover:bg-yellow-500/20 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Download PDF
      </button>
      <button
        type="button"
        onClick={() => printCalculation(title, contentId)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-xs font-bold hover:bg-gray-800 transition-colors"
      >
        <Printer className="w-3.5 h-3.5" />
        Print
      </button>
      <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-2xl font-bold px-2">X</button>
    </div>
  );
}

type TxnType = 'Details' | 'Modification' | 'Termination' | 'Renewal' | 'Purchase' | 'Extension' | 'OptionsBreaks';

const LIFECYCLE_COLORS: Record<string, string> = {
  Active:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Modified: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  Draft:    'bg-slate-500/15 text-slate-400 border-slate-500/30',
  Closed:   'bg-red-500/15 text-red-400 border-red-500/30',
};

const CURRENCIES = ['QAR','USD','AED','EUR','GBP','ZAR','KES','NGN','ZMW','GHS'];
const ASSET_TYPES = ['Villa','Apartment','Vehicle','Heavy Vehicle','Tower Site','Data Centre','Retail Outlet','Office','Warehouse','Fleet Vehicle','Network Equipment','Generator Site','Other'];

// ── Sub-components ────────────────────────────────────────────────────────────
function JETable({ lines }: { lines: Array<Record<string, unknown>> }) {
  if (!lines?.length) return <p className="text-sm text-muted-foreground italic">No journal entries to preview.</p>;
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {['#','Account','Account Name','Dr/Cr','Debit','Credit','Description'].map(h => (
              <th key={h} className={`px-3 py-2 text-xs font-semibold text-muted-foreground ${h === 'Debit' || h === 'Credit' ? 'text-right' : h === 'Dr/Cr' ? 'text-center' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const groups = groupDrCrByAmount(lines as JVLine[]);
            return groups.map((group, gIdx) => {
              const allLines = [...group.drLines, ...group.crLines];
              return allLines.map((l: any, i: number) => (
                <tr key={`${gIdx}-${i}`} className={`border-t border-border hover:bg-muted/30 ${i === 0 && gIdx > 0 ? 'border-t-2 border-amber-500/20' : ''}`}>
                  <td className="px-3 py-2 text-muted-foreground">{String(l.line_no ?? i + 1)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(l.account_code ?? '—')}</td>
                  <td className="px-3 py-2">{String(l.account_name ?? '—')}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${l.dr_cr === 'Dr' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                      {String(l.dr_cr ?? '—')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-500">
                    {l.dr_cr === 'Dr' ? fmt(l.amount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-rose-500">
                    {l.dr_cr === 'Cr' ? fmt(l.amount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{String(l.description ?? '—')}</td>
                </tr>
              ));
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}

function KPIRow({ items }: { items: { label: string; value: string; highlight?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
      {items.map((item, i) => (
        <div key={i} className={`rounded-lg border p-3 ${item.highlight ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-muted/30'}`}>
          <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
          <p className={`text-sm font-semibold font-mono ${item.highlight ? 'text-amber-400' : 'text-foreground'}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function SchedulePreview({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows?.length) return null;
  return (
    <div className="overflow-x-auto rounded border border-border mt-3 max-h-[500px] overflow-y-auto">
      <p className="text-xs text-muted-foreground px-3 pt-2 pb-1 sticky top-0 bg-card z-10">All {rows.length} periods of regenerated schedule</p>
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {['Period','Date','Opening Liability','Interest','Payment','Principal','Closing Liability','ROU NBV','Depreciation'].map(h => (
              <th key={h} className="px-2 py-1.5 text-right first:text-left text-muted-foreground font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border hover:bg-muted/20">
              <td className="px-2 py-1.5 text-left">{String(r.period_no ?? i + 1)}</td>
              <td className="px-2 py-1.5 text-right">{fmtDate(r.period_date)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(r.opening_liability)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(r.interest_expense)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(r.payment)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(r.principal)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(r.closing_liability)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(r.rou_nbv)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(r.depreciation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sub-Asset Status Colour ────────────────────────────────────────────────
const SA_STATUS_CLS: Record<string, string> = {
  Active:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Cancelled:  'bg-red-500/15 text-red-400 border-red-500/30',
  Returned:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  BackIn:     'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  Replaced:   'bg-purple-500/15 text-purple-400 border-purple-500/30',
  WriteOff:   'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  Condemned:  'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

// ── Lease Details Panel ─────────────────────────────────────────────────────
function LeaseDetailsPanel({ contractId }: { contractId: number }) {
  const utils = trpc.useUtils();
  const { data: lease, isLoading: leaseLoading } = trpc.lease.getLeaseById.useQuery({ contractId });
  const { data: lessee, isLoading: lesseeLoading } = trpc.lease.getLesseeDetails.useQuery({ contractId });
  const { data: subAssets = [], isLoading: subLoading } = trpc.lease.getSubAssetsByContractId.useQuery({ contractId });
  const [showAllGroups, setShowAllGroups] = React.useState(false);
  const [attachOpenForQuery, setAttachOpenForQuery] = React.useState(false);
  const lessorId = lease ? (lease as Record<string, any>).lessor_id as number | undefined : undefined;
  const { data: assetGroups = [], isLoading: groupsLoading } = trpc.asset.getSubAssetGroupsByLessor.useQuery(
    { lessorId: showAllGroups ? undefined : lessorId },
    { enabled: attachOpenForQuery }
  );
  // Expand row state (tags/serials detail)
  const [expandedRow, setExpandedRow] = React.useState<number | null>(null);
  // Transaction log modal state
  const [txnLogTarget, setTxnLogTarget] = React.useState<{ id: number; code: string } | null>(null);
  const { data: txnLog, isLoading: txnLogLoading } = trpc.asset.getSubAssetTxns.useQuery(
    { entityId: txnLogTarget?.id, entityType: 'LEASE_SUB_ASSET', pageSize: 50 },
    { enabled: !!txnLogTarget }
  );
  // Attach modal statee
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [groupSearch, setGroupSearch] = React.useState('');
  const [selectedGroup, setSelectedGroup] = React.useState<{ assetId: number; assetCode: string; setName: string } | null>(null);
  const [attachNotes, setAttachNotes] = React.useState('');

  // Status change modal state
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<{ id: number; code: string; current: string } | null>(null);
  const [newStatus, setNewStatus] = React.useState<'Active'|'Cancelled'|'Returned'|'BackIn'|'Replaced'|'WriteOff'|'Condemned'>('Active');
  const [statusReason, setStatusReason] = React.useState('');
  const [statusNotes, setStatusNotes] = React.useState('');

  const attachMut = trpc.asset.attachSubAssetToLease.useMutation({
    onSuccess: () => {
      toast.success('Sub-asset attached successfully');
      utils.lease.getSubAssetsByContractId.invalidate({ contractId });
      setAttachOpen(false);
      setSelectedGroup(null);
      setAttachNotes('');
    },
    onError: (e) => toast.error(e.message),
  });

  const statusMut = trpc.asset.updateSubAssetStatus.useMutation({
    onSuccess: () => {
      toast.success('Sub-asset status updated');
      utils.lease.getSubAssetsByContractId.invalidate({ contractId });
      setStatusOpen(false);
      setStatusTarget(null);
      setStatusReason('');
      setStatusNotes('');
    },
    onError: (e) => toast.error(e.message),
  });

   if (leaseLoading || lesseeLoading) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm animate-pulse">Loading lease details…</div>;
  }
  if (!lease) return <div className="text-muted-foreground text-sm p-6">No lease data found.</div>;
  const d = lease as Record<string, any>;
  const leaseRef = d.contract_ref as string | undefined;
  let contact = { name: '', email: '', phone: '' };
  try { const c = JSON.parse(d.contact_json || '{}'); contact = { name: c.name || '', email: c.email || '', phone: c.phone || '' }; } catch { /* ignore */ }
  let loc = { address: '', city: '', country: 'QA' };
  try { const l = JSON.parse(d.location_json || '{}'); loc = { address: l.address || '', city: l.city || '', country: l.country || 'QA' }; } catch { /* ignore */ }

  const field = (label: string, value: unknown, icon?: React.ReactNode) => (
    <div className="space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <p className="text-sm font-medium text-foreground">{value ? String(value) : '—'}</p>
      </div>
    </div>
  );

  const STATUS_COLORS: Record<string, string> = {
    Active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    Modified: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    Terminated: 'bg-red-500/15 text-red-400 border-red-500/30',
    Draft: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Renewed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };

  return (
    <div className="space-y-5">
      {/* ── LESSOR SECTION ── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold">Lessor Details</h3>
        </div>
        <div className="grid grid-cols-4 gap-5">
          {field('Lessor Name', d.lessor_name, <Building2 className="w-3 h-3" />)}
          {field('Lessor Country', d.lessor_country)}
          {field('Tax / Reg No', d.tax_no)}
          {field('Contact Person', contact.name, <User className="w-3 h-3" />)}
          {field('Email', contact.email, <Mail className="w-3 h-3" />)}
          {field('Phone', contact.phone, <Phone className="w-3 h-3" />)}
          {field('Address', loc.address || loc.city, <MapPin className="w-3 h-3" />)}
          {field('Country', loc.country)}
        </div>
      </div>

      {/* ── LESSEE SECTION ── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-blue-400" />
          <h3 className="text-base font-semibold">Lessee Details</h3>
          {!lessee && !lesseeLoading && <span className="text-xs text-muted-foreground ml-2">(No lessee record attached)</span>}
        </div>
        {lessee ? (
          <div className="grid grid-cols-4 gap-5">
            {field('Lessee Type', lessee.lesseeType)}
            {field('Lessee Name', lessee.lesseeName, <User className="w-3 h-3" />)}
            {field('Staff Number', lessee.staffNumber, <Hash className="w-3 h-3" />)}
            {field('Employee ID', lessee.employeeId)}
            {field('Grade', lessee.grade)}
            {field('Position', lessee.position)}
            {field('Department', lessee.department)}
            {field('Place of Work', lessee.placeOfWork, <MapPin className="w-3 h-3" />)}
            {field('Contact Email', lessee.contactEmail, <Mail className="w-3 h-3" />)}
            {field('Contact Phone', lessee.contactPhone, <Phone className="w-3 h-3" />)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No lessee details on record for this lease.</p>
        )}
      </div>

      {/* ── ASSET SECTION ── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Package className="w-4 h-4 text-amber-400" />
          <h3 className="text-base font-semibold">Asset Details</h3>
        </div>
        <div className="grid grid-cols-4 gap-5 mb-6">
          {field('Asset Type', d.asset_type)}
          {field('Asset Description', d.asset_description)}
          {field('Asset Tag / Code', d.asset_tag, <Hash className="w-3 h-3" />)}
          {field('Location / City', loc.city || loc.address, <MapPin className="w-3 h-3" />)}
          {field('Country', loc.country)}
          {field('Maintenance By', d.maintenance_responsibility)}
          {field('IFRS 16 Classification', d.ifrs16_classification)}
          {field('Status', d.lifecycle_status)}
        </div>

        {/* Sub-Assets Grid */}
        <Separator className="my-5" />
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-sm font-semibold">Sub-Assets</p>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{subAssets.length}</Badge>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { setAttachOpen(true); setAttachOpenForQuery(true); }}>
            <Layers className="w-3 h-3" /> Attach Sub-Asset
            </Button>
          </div>

          {subLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse">Loading sub-assets…</p>
          ) : subAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-lg border border-dashed border-border gap-3">
              <Layers className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No sub-assets attached to this lease yet.</p>
              <Button size="sm" onClick={() => { setAttachOpen(true); setAttachOpenForQuery(true); }} className="gap-1.5">
                <Hash className="w-3.5 h-3.5" /> Attach Sub-Asset
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="w-6 px-2 py-2.5" />
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Asset Code</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Set Name</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Tags / Serials</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status Date</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Owner</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Notes</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subAssets.map((sa) => {
                    const isExpanded = expandedRow === sa.leaseSubAssetId;
                    let parsedTags: Array<{ code?: string; name?: string; category?: string; quantity?: number; serial?: string }> = [];
                    try { parsedTags = JSON.parse(sa.tagsWithSerials || '[]'); } catch { parsedTags = []; }
                    const hasTags = parsedTags.length > 0;
                    return (
                      <Fragment key={sa.leaseSubAssetId}>
                        <tr className="border-t border-border hover:bg-muted/20 transition-colors">
                          <td className="px-2 py-2.5">
                            <button
                              className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                              onClick={() => setExpandedRow(isExpanded ? null : sa.leaseSubAssetId)}
                              title={hasTags ? (isExpanded ? 'Collapse' : 'Expand tags/serials') : 'No items'}
                              disabled={!hasTags}
                            >
                              {hasTags ? (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="text-[10px]">—</span>}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-primary font-medium">{sa.assetCode}</td>
                          <td className="px-3 py-2.5 font-medium">{sa.setName}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {hasTags ? (
                              <button className="underline underline-offset-2 text-primary/80 hover:text-primary" onClick={() => setExpandedRow(isExpanded ? null : sa.leaseSubAssetId)}>
                                {parsedTags.length} item{parsedTags.length !== 1 ? 's' : ''}
                              </button>
                            ) : <span className="text-muted-foreground/50">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${SA_STATUS_CLS[sa.status] ?? 'bg-muted text-muted-foreground'}`}>{sa.status}</Badge>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{sa.statusDate ? fmtDate(sa.statusDate) : '—'}</td>
                          <td className="px-3 py-2.5">{sa.owner || '—'}</td>
                          <td className="px-3 py-2.5 text-muted-foreground max-w-[140px] truncate" title={sa.notes || ''}>{sa.notes || '—'}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => {
                                setStatusTarget({ id: sa.leaseSubAssetId, code: sa.assetCode, current: sa.status });
                                setNewStatus(sa.status as typeof newStatus);
                                setStatusReason('');
                                setStatusNotes('');
                                setStatusOpen(true);
                              }}>Status</Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={() => setTxnLogTarget({ id: sa.leaseSubAssetId, code: sa.assetCode })}>
                                History
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && hasTags && (
                          <tr className="border-t border-border bg-muted/10">
                            <td colSpan={9} className="px-6 py-3">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Tags / Serials Detail — {sa.assetCode}</p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left pr-4 pb-1 font-semibold">Code</th>
                                    <th className="text-left pr-4 pb-1 font-semibold">Name</th>
                                    <th className="text-left pr-4 pb-1 font-semibold">Category</th>
                                    <th className="text-left pr-4 pb-1 font-semibold">Qty</th>
                                    <th className="text-left pb-1 font-semibold">Serial / Tag</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {parsedTags.map((item, idx) => (
                                    <tr key={idx} className="border-t border-border/40">
                                      <td className="pr-4 py-1 font-mono text-primary">{item.code || '—'}</td>
                                      <td className="pr-4 py-1">{item.name || '—'}</td>
                                      <td className="pr-4 py-1 text-muted-foreground">{item.category || '—'}</td>
                                      <td className="pr-4 py-1">{item.quantity ?? '—'}</td>
                                      <td className="py-1 font-mono text-xs text-amber-400">{item.serial || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── ATTACH SUB-ASSET INLINE PANEL ── */}
      {attachOpen && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" /> Attach Sub-Asset to Lease
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show:</span>
              <button className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${!showAllGroups ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30'}`} onClick={() => setShowAllGroups(false)}>Lessor Only</button>
              <button className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${showAllGroups ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted/30'}`} onClick={() => setShowAllGroups(true)}>All Assets</button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setAttachOpen(false); setSelectedGroup(null); setAttachNotes(''); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
          <Input placeholder="Search by code or name…" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} className="h-8 text-sm" />
          <div className="rounded-lg border border-border overflow-hidden max-h-56 overflow-y-auto">
            {groupsLoading ? (
              <p className="text-xs text-muted-foreground p-4 animate-pulse">Loading asset groups…</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Select</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Code</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Set Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {assetGroups
                    .filter(g => !groupSearch || g.assetCode.toLowerCase().includes(groupSearch.toLowerCase()) || g.setName.toLowerCase().includes(groupSearch.toLowerCase()))
                    .map(g => (
                      <tr key={g.assetId} className={`border-t border-border cursor-pointer transition-colors ${selectedGroup?.assetId === g.assetId ? 'bg-primary/10' : 'hover:bg-muted/20'}`}
                        onClick={() => setSelectedGroup({ assetId: g.assetId, assetCode: g.assetCode, setName: g.setName })}>
                        <td className="px-3 py-2">
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${selectedGroup?.assetId === g.assetId ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                            {selectedGroup?.assetId === g.assetId && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-primary">{g.assetCode}</td>
                        <td className="px-3 py-2 font-medium">{g.setName}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{g.description || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
          {selectedGroup && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2 text-xs">
              <span className="text-muted-foreground">Selected: </span>
              <span className="font-mono text-primary font-semibold">{selectedGroup.assetCode}</span>
              <span className="text-muted-foreground ml-2">{selectedGroup.setName}</span>
            </div>
          )}
          <Input placeholder="Notes (optional)…" value={attachNotes} onChange={e => setAttachNotes(e.target.value)} className="h-8 text-sm" />
          <div className="flex gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={() => { setAttachOpen(false); setSelectedGroup(null); setAttachNotes(''); }}>Cancel</Button>
            <Button size="sm" disabled={!selectedGroup || !leaseRef || attachMut.isPending}
              onClick={() => {
                if (!selectedGroup || !leaseRef) return;
                attachMut.mutate({ leaseId: leaseRef, leaseRef: leaseRef, assetId: selectedGroup.assetId, assetCode: selectedGroup.assetCode, setName: selectedGroup.setName });
              }}>
              {attachMut.isPending ? 'Attaching…' : 'Attach Sub-Asset'}
            </Button>
          </div>
        </div>
      )}

      {/* ── STATUS CHANGE INLINE PANEL ── */}
      {statusOpen && statusTarget && (
        <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              Change Status — <span className="font-mono text-primary">{statusTarget.code}</span>
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setStatusOpen(false); setStatusTarget(null); }}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">New Status *</Label>
              <Select value={newStatus} onValueChange={v => setNewStatus(v as typeof newStatus)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['Active','Cancelled','Returned','BackIn','Replaced','WriteOff','Condemned'] as const).map(s => (
                    <SelectItem key={s} value={s}>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mr-2 ${SA_STATUS_CLS[s] ?? ''}`}>{s}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Reason</Label>
              <Input placeholder="Reason for status change…" value={statusReason} onChange={e => setStatusReason(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Notes</Label>
              <Input placeholder="Additional notes…" value={statusNotes} onChange={e => setStatusNotes(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => { setStatusOpen(false); setStatusTarget(null); }}>Cancel</Button>
            <Button size="sm" disabled={!statusTarget || statusMut.isPending}
              onClick={() => {
                if (!statusTarget) return;
                statusMut.mutate({ leaseSubAssetId: statusTarget.id, newStatus, statusDate: new Date().toISOString().slice(0, 10), reason: statusReason || undefined, notes: statusNotes || undefined });
              }}>
              {statusMut.isPending ? 'Saving…' : 'Update Status'}
            </Button>
          </div>
        </div>
      )}

      {/* ── TRANSACTION LOG INLINE PANEL ── */}
      {txnLogTarget && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 transition-all duration-200 ease-in-out">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-400" />
              Sub-Asset History — <span className="font-mono text-primary">{txnLogTarget.code}</span>
            </h4>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setTxnLogTarget(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          {txnLogLoading ? (
            <p className="text-sm text-muted-foreground animate-pulse py-4 text-center">Loading history…</p>
          ) : !txnLog || txnLog.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No transaction history found for this sub-asset.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Action</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status / Change</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Entity</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">By</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Session Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {txnLog.rows.map((row, idx: number) => (
                    <tr key={idx} className="border-t border-border hover:bg-muted/10">
                      <td className="px-3 py-2.5 text-muted-foreground">{row.changedAt ? fmtDate(row.changedAt) : '—'}</td>
                      <td className="px-3 py-2.5"><Badge variant="outline" className="text-[10px] px-1.5 py-0">{row.action}</Badge></td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[200px] truncate" title={row.afterJson || ''}>
                        {row.afterJson ? <span className="font-mono text-[10px]">{row.afterJson.slice(0, 60)}{row.afterJson.length > 60 ? '…' : ''}</span> : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-primary text-[10px]">{row.entityCode || '—'}</span>
                        {row.entityName && <span className="text-muted-foreground ml-1">{row.entityName}</span>}
                      </td>
                      <td className="px-3 py-2.5">{row.changedBy || '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground font-mono text-[10px]">{row.sessionRef || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* ── FINANCIAL TERMS SECTION ── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <h3 className="text-base font-semibold">Financial Terms</h3>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ml-2 ${STATUS_COLORS[d.lifecycle_status] ?? ''}`}>{d.lifecycle_status}</Badge>
        </div>
        <div className="grid grid-cols-4 gap-5">
          {field('Commencement Date', fmtDate(d.commencement_date))}
          {field('Expiry Date', fmtDate(d.expiry_date))}
          {field('Term (Months)', d.term_months)}
          {field('Currency', d.currency)}
          {field('Monthly Payment', d.monthly_payment ? `${d.currency} ${fmt(d.monthly_payment)}` : '—')}
          {field('IBR / Discount Rate', d.ibr ? `${(Number(d.ibr) * 100).toFixed(4)}%` : '—')}
          {field('Escalation Rate', d.escalation_rate ? `${(Number(d.escalation_rate) * 100).toFixed(2)}%` : '—')}
          {field('Security Deposit', d.deposit_amount ? `${d.currency} ${fmt(d.deposit_amount)}` : '—', <CreditCard className="w-3 h-3" />)}
          {field('Current Lease Liability', d.current_liability !== undefined ? `${d.currency} ${fmt(d.current_liability)}` : '—')}
          {field('ROU Asset NBV', d.current_rou_nbv !== undefined ? `${d.currency} ${fmt(d.current_rou_nbv)}` : '—')}
          {field('IFRS 16 Classification', d.ifrs16_classification)}
          {field('Renewal Option', d.renewal_option ? 'Yes' : 'No')}
          {field('Purchase Option', d.purchase_option ? 'Yes' : 'No')}
          {field('Make-Good Obligation', d.make_good_obligation ? 'Yes' : 'No')}
          {field('Initial Direct Costs', d.initial_direct_costs ? `${d.currency} ${fmt(d.initial_direct_costs)}` : '—')}
          {field('Is LTO', d.is_lto ? 'Yes' : 'No')}
          {d.is_lto && field('LTO Purchase Price', d.lto_purchase_price ? `${d.currency} ${fmt(d.lto_purchase_price)}` : '—')}
        </div>
      </div>
    </div>
  );
}

function TransactionHistoryPanel({ contractId }: { contractId: number }) {
  const { data, isLoading } = trpc.lease.getLeaseTransactionHistory.useQuery({ contractId });
  if (isLoading) return <p className="text-sm text-muted-foreground animate-pulse">Loading history…</p>;
  const drafts   = data?.drafts   ?? [];
  const postings = data?.postings ?? [];
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History className="w-4 h-4 text-primary" />Transaction Log</h3>
        {drafts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-lg">
            <Info className="w-4 h-4" /> No transactions posted yet for this lease.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Type','Status','JE Ref','Posted By','Posted At','Notes'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{String(d.transaction_type ?? '—')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${d.status === 'Posted' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                        {String(d.status ?? '—')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{String(d.posted_je_ref ?? '—')}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{String(d.approved_by ?? d.submitted_by ?? '—')}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(d.approved_at ?? d.submitted_at)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{String(d.notes ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" />GL Postings</h3>
        {postings.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-lg">
            <Info className="w-4 h-4" /> No GL postings yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Date','JE Ref','Label','Ledger No.','Account','Dr/Cr','Amount','Posted By'].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-xs font-semibold text-muted-foreground ${h === 'Debit' || h === 'Credit' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {postings.map((p, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(p.posting_date)}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-xs text-primary">{String(p.je_ref ?? '—')}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate">{String(p.je_label ?? '—')}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{String(p.ledger_no ?? '—')}</td>
                    <td className="px-3 py-2.5">{String(p.ledger_name ?? '—')}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${p.dr_cr === 'Dr' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>
                        {String(p.dr_cr ?? '—')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(p.amount)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{String(p.posted_by ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lease Selector Dropdown (top-bar) ─────────────────────────────────────────
type LeaseRow = {
  contract_id: number; contract_ref: string; asset_description: string;
  asset_type: string; commencement_date: Date; expiry_date: Date;
  term_months: number; monthly_payment: number; currency: string;
  ibr: number; lifecycle_status: string; status: string;
  current_liability: number; current_rou_nbv: number;
  last_period_date: Date; remaining_months: number;
  lessor_name: string; pending_drafts: number;
};

function LeaseDropdown({
  leases,
  loading,
  search,
  setSearch,
  selectedId,
  onSelect,
}: {
  leases: LeaseRow[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  selectedId: number | null;
  onSelect: (l: LeaseRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => leases.find(l => l.contract_id === selectedId) ?? null, [leases, selectedId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 h-10 px-4 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors min-w-[380px] max-w-[520px]"
      >
        {selected ? (
          <>
            <span className="font-mono font-bold text-[#e60000] text-sm">{selected.contract_ref}</span>
            <span className="text-sm text-foreground truncate flex-1 text-left">{selected.asset_description}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${LIFECYCLE_COLORS[selected.lifecycle_status] ?? ''}`}>
              {selected.lifecycle_status}
            </Badge>
          </>
        ) : (
          <>
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground flex-1 text-left">Select a lease…</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-[560px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search by ref, description, lessor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
            )}
          </div>
          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {loading ? (
              <p className="text-xs text-muted-foreground p-4 animate-pulse">Loading leases…</p>
            ) : leases.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-4">No leases found.</p>
            ) : (
              leases.map(l => (
                <button
                  key={l.contract_id}
                  onClick={() => { onSelect(l); setOpen(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors ${selectedId === l.contract_id ? 'bg-[#e60000]/8' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={`text-sm font-mono font-bold ${selectedId === l.contract_id ? 'text-[#e60000]' : 'text-primary'}`}>{l.contract_ref}</span>
                    <div className="flex items-center gap-2">
                      {l.pending_drafts > 0 && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />{l.pending_drafts}</span>
                      )}
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${LIFECYCLE_COLORS[l.lifecycle_status] ?? ''}`}>{l.lifecycle_status}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-foreground truncate">{l.asset_description}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-[10px] text-muted-foreground">{l.lessor_name}</span>
                    <span className="text-[10px] text-muted-foreground">Exp {fmtDate(l.expiry_date)}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{l.currency} {fmt(l.monthly_payment)}/mo</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Options & Breaks Panel ───────────────────────────────────────────────────
const OPTION_TYPE_META: Record<string, { color: string; label: string; ifrs: string; action: string; targetTab: TxnType }> = {
  RENEWAL:     { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: 'Renewal',     ifrs: 'IFRS 16 §19 — extends lease term; increases liability & ROU if reasonably certain', action: 'Exercise → Renewal (JE-7)',     targetTab: 'Renewal' },
  PURCHASE:    { color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',         label: 'Purchase',    ifrs: 'IFRS 16 §26 — if reasonably certain, include purchase price in lease payments; likely finance lease', action: 'Exercise → Modification (JE-4)', targetTab: 'Modification' },
  TERMINATION: { color: 'text-red-400 bg-red-500/10 border-red-500/30',            label: 'Termination', ifrs: 'IFRS 16 §19 — shortens lease term; reduces liability & ROU if reasonably certain', action: 'Exercise → Termination (JE-5)', targetTab: 'Termination' },
  EXTENSION:   { color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',      label: 'Extension',   ifrs: 'IFRS 16 §45 — treated as lease modification; remeasure liability at new IBR',           action: 'Exercise → Modification (JE-4)', targetTab: 'Modification' },
};
const BREAK_STATUS_CLS: Record<string, string> = {
  ACTIVE:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  EXERCISED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  LAPSED:    'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  WAIVED:    'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

function OptionsBreaksPanel({
  contractId,
  onExerciseOption,
  onExerciseBreak,
}: {
  contractId: number;
  onExerciseOption: (tab: TxnType, prefill: Record<string, unknown>) => void;
  onExerciseBreak: (prefill: Record<string, unknown>) => void;
}) {
  const utils = trpc.useUtils();
  const [optOpen, setOptOpen] = React.useState(false);
  const [brkOpen, setBrkOpen] = React.useState(false);
  const [editOpt, setEditOpt] = React.useState<Record<string, unknown> | null>(null);
  const [editBrk, setEditBrk] = React.useState<Record<string, unknown> | null>(null);
  const INIT_OPT: { contract_id: number; option_type: 'RENEWAL' | 'PURCHASE' | 'TERMINATION' | 'EXTENSION'; exercise_deadline: string; notice_period_days: number; new_term_months: number; new_rent: number; purchase_price: number; reasonably_certain: boolean; notes: string } = { contract_id: contractId, option_type: 'RENEWAL', exercise_deadline: '', notice_period_days: 90, new_term_months: 0, new_rent: 0, purchase_price: 0, reasonably_certain: false, notes: '' };
  const INIT_BRK: { contract_id: number; break_date: string; notice_deadline: string; penalty_amount: number; conditions: string; status: 'ACTIVE' | 'EXERCISED' | 'LAPSED' | 'WAIVED' } = { contract_id: contractId, break_date: '', notice_deadline: '', penalty_amount: 0, conditions: '', status: 'ACTIVE' };
  const [optForm, setOptForm] = React.useState({ ...INIT_OPT });
  const [brkForm, setBrkForm] = React.useState({ ...INIT_BRK });

  const { data: options = [], refetch: refetchOpts } = trpc.leaseOptions.list.useQuery({ contractId });
  const { data: breaks = [], refetch: refetchBrks } = trpc.breakClause.list.useQuery();
  const contractBreaks = (breaks as Record<string, unknown>[]).filter((b) => (b as Record<string, unknown>).contract_id === contractId);

  const upsertOpt = trpc.leaseOptions.upsert.useMutation({
    onSuccess: () => { refetchOpts(); setOptOpen(false); toast.success('Option saved'); },
    onError: (e) => toast.error(e.message),
  });
  const exerciseOpt = trpc.leaseOptions.exercise.useMutation({
    onSuccess: () => { refetchOpts(); toast.success('Option marked as exercised'); },
    onError: (e) => toast.error(e.message),
  });
  const upsertBrk = trpc.breakClause.upsert.useMutation({
    onSuccess: () => { refetchBrks(); setBrkOpen(false); toast.success('Break clause saved'); },
    onError: (e) => toast.error(e.message),
  });
  const toggleRC = trpc.leaseOptions.upsert.useMutation({
    onSuccess: () => { refetchOpts(); toast.success('Reasonably certain updated'); },
    onError: (e) => toast.error(e.message),
  });

  function openEditOpt(o: Record<string, unknown>) {
    setEditOpt(o);
    setOptForm({
      contract_id: contractId,
      option_type: (o.option_type as 'RENEWAL' | 'PURCHASE' | 'TERMINATION' | 'EXTENSION') ?? 'RENEWAL',
      exercise_deadline: o.exercise_deadline ? String(o.exercise_deadline).slice(0, 10) : '',
      notice_period_days: Number(o.notice_period_days ?? 90),
      new_term_months: Number(o.new_term_months ?? 0),
      new_rent: Number(o.new_rent ?? 0),
      purchase_price: Number(o.purchase_price ?? 0),
      reasonably_certain: Boolean(o.reasonably_certain),
      notes: String(o.notes ?? ''),
    });
    setOptOpen(true);
  }
  function openEditBrk(b: Record<string, unknown>) {
    setEditBrk(b);
    setBrkForm({
      contract_id: contractId,
      break_date: b.break_date ? String(b.break_date).slice(0, 10) : '',
      notice_deadline: b.notice_deadline ? String(b.notice_deadline).slice(0, 10) : '',
      penalty_amount: Number(b.penalty_amount ?? 0),
      conditions: String(b.conditions ?? ''),
      status: (b.status as 'ACTIVE' | 'EXERCISED' | 'LAPSED' | 'WAIVED') ?? 'ACTIVE',
    });
    setBrkOpen(true);
  }

  const daysUntil = (d: string) => Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  const urgencyCls = (d: string) => { const days = daysUntil(d); return days < 0 ? 'text-red-500 font-bold' : days < 30 ? 'text-red-400 font-semibold' : days < 90 ? 'text-amber-400 font-semibold' : 'text-muted-foreground'; };

  return (
    <div className="space-y-6">
      {/* ── LEASE OPTIONS ── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-semibold">Lease Options</h3>
            <span className="text-xs text-muted-foreground ml-1">(IFRS 16 §19 — Reasonably Certain Assessment)</span>
          </div>
          <Button size="sm" onClick={() => { setEditOpt(null); setOptForm({ ...INIT_OPT }); setOptOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Option
          </Button>
        </div>

        {/* Accounting impact reference */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {Object.entries(OPTION_TYPE_META).map(([type, meta]) => (
            <div key={type} className={`rounded-lg border p-3 ${meta.color}`}>
              <p className="text-xs font-bold mb-1">{meta.label}</p>
              <p className="text-[10px] leading-relaxed opacity-80">{meta.ifrs}</p>
              <p className="text-[10px] mt-1.5 font-semibold opacity-90">{meta.action}</p>
            </div>
          ))}
        </div>

        {(options as Record<string, unknown>[]).length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-lg">
            <Info className="w-4 h-4" /> No lease options recorded for this lease.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Type','Exercise Deadline','Days Left','Notice (Days)','New Term (Mo)','New Rent','Purchase Price','Reasonably Certain','Status','Notes','Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(options as Record<string, unknown>[]).map((o, i) => {
                  const meta = OPTION_TYPE_META[String(o.option_type)] ?? OPTION_TYPE_META.RENEWAL;
                  const dl = o.exercise_deadline ? String(o.exercise_deadline) : '';
                  const days = dl ? daysUntil(dl) : null;
                  const isExercised = String(o.status) === 'EXERCISED';
                  return (
                    <tr key={i} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className={`px-3 py-2.5 font-mono text-xs ${dl ? urgencyCls(dl) : 'text-muted-foreground'}`}>
                        {dl ? new Date(dl).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-xs ${days !== null ? urgencyCls(dl) : 'text-muted-foreground'}`}>
                        {days !== null ? (days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{String(o.notice_period_days ?? '—')}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{o.new_term_months ? String(o.new_term_months) : '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{o.new_rent ? Number(o.new_rent).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{o.purchase_price ? Number(o.purchase_price).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => {
                            if (isExercised) return;
                            toggleRC.mutate({
                              option_id: Number(o.option_id),
                              contract_id: contractId,
                              option_type: o.option_type as 'RENEWAL' | 'PURCHASE' | 'TERMINATION' | 'EXTENSION',
                              exercise_deadline: dl,
                              notice_period_days: Number(o.notice_period_days ?? 90),
                              new_term_months: Number(o.new_term_months ?? 0),
                              new_rent: Number(o.new_rent ?? 0),
                              purchase_price: Number(o.purchase_price ?? 0),
                              reasonably_certain: !Boolean(o.reasonably_certain),
                              notes: String(o.notes ?? ''),
                            });
                          }}
                          disabled={isExercised}
                          className="flex items-center gap-1 disabled:opacity-40"
                          title={isExercised ? 'Already exercised' : 'Toggle reasonably certain'}
                        >
                          {Boolean(o.reasonably_certain)
                            ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                            : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                          <span className={`text-xs ${Boolean(o.reasonably_certain) ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>
                            {Boolean(o.reasonably_certain) ? 'Yes' : 'No'}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          isExercised ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        }`}>{String(o.status ?? 'ACTIVE')}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[140px] truncate" title={String(o.notes ?? '')}>{String(o.notes ?? '—')}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditOpt(o)} disabled={isExercised}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {!isExercised && (
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90"
                              onClick={() => {
                                exerciseOpt.mutate({ option_id: Number(o.option_id), exercise_date: today() });
                                onExerciseOption(meta.targetTab, {
                                  payment: o.new_rent ? String(o.new_rent) : '',
                                  newTermMonths: o.new_term_months ? String(o.new_term_months) : '',
                                  purchasePrice: o.purchase_price ? String(o.purchase_price) : '',
                                  notes: `Exercised ${meta.label} option (Option ID: ${o.option_id})`,
                                });
                              }}
                            >
                              <Zap className="w-3 h-3 mr-1" /> Exercise
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── BREAK CLAUSES ── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-red-400" />
            <h3 className="text-base font-semibold">Break Clauses</h3>
            <span className="text-xs text-muted-foreground ml-1">(IFRS 16 §19 — Termination option; shortens lease term)</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setEditBrk(null); setBrkForm({ ...INIT_BRK }); setBrkOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Break Clause
          </Button>
        </div>

        {contractBreaks.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-4 border border-dashed border-border rounded-lg">
            <Info className="w-4 h-4" /> No break clauses recorded for this lease.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Break Date','Notice Deadline','Days to Notice','Penalty Amount','Conditions','Status','Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contractBreaks.map((b, i) => {
                  const nd = b.notice_deadline ? String(b.notice_deadline) : '';
                  const days = nd ? daysUntil(nd) : null;
                  const isActive = String(b.status) === 'ACTIVE';
                  return (
                    <tr key={i} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2.5 font-mono text-xs">{b.break_date ? new Date(String(b.break_date)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                      <td className={`px-3 py-2.5 font-mono text-xs ${nd ? urgencyCls(nd) : 'text-muted-foreground'}`}>
                        {nd ? new Date(nd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-xs ${days !== null ? urgencyCls(nd) : 'text-muted-foreground'}`}>
                        {days !== null ? (days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`) : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{b.penalty_amount ? Number(b.penalty_amount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[180px] truncate" title={String(b.conditions ?? '')}>{String(b.conditions ?? '—')}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${BREAK_STATUS_CLS[String(b.status)] ?? ''}`}>{String(b.status ?? '—')}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditBrk(b)} disabled={!isActive}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {isActive && (
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => {
                                upsertBrk.mutate({ ...brkForm, break_id: Number(b.break_id), contract_id: contractId, break_date: String(b.break_date ?? '').slice(0, 10), notice_deadline: nd.slice(0, 10), penalty_amount: Number(b.penalty_amount ?? 0), conditions: String(b.conditions ?? ''), status: 'EXERCISED' });
                                onExerciseBreak({
                                  date: b.break_date ? String(b.break_date).slice(0, 10) : today(),
                                  notes: `Break clause exercised — penalty: ${b.penalty_amount ?? 0}. Conditions: ${b.conditions ?? ''}`,
                                });
                              }}
                            >
                              <Zap className="w-3 h-3 mr-1" /> Exercise Break
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── OPTION FORM DIALOG ── */}
      {optOpen && (
        <div className="rounded-xl border border-emerald-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              {editOpt ? 'Edit Lease Option' : 'New Lease Option'}
            </h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setOptOpen(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block">Option Type *</label>
                <Select value={optForm.option_type} onValueChange={v => setOptForm(f => ({ ...f, option_type: v as typeof f.option_type }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['RENEWAL','PURCHASE','TERMINATION','EXTENSION'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Exercise Deadline *</label>
                <Input type="date" value={optForm.exercise_deadline} onChange={e => setOptForm(f => ({ ...f, exercise_deadline: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Notice Period (Days)</label>
                <Input type="number" value={optForm.notice_period_days} onChange={e => setOptForm(f => ({ ...f, notice_period_days: Number(e.target.value) }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">New Term (Months)</label>
                <Input type="number" value={optForm.new_term_months} onChange={e => setOptForm(f => ({ ...f, new_term_months: Number(e.target.value) }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">New Rent</label>
                <Input type="number" value={optForm.new_rent} onChange={e => setOptForm(f => ({ ...f, new_rent: Number(e.target.value) }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Purchase Price</label>
                <Input type="number" value={optForm.purchase_price} onChange={e => setOptForm(f => ({ ...f, purchase_price: Number(e.target.value) }))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setOptForm(f => ({ ...f, reasonably_certain: !f.reasonably_certain }))} className="flex items-center gap-2">
                {optForm.reasonably_certain ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                <span className={`text-sm ${optForm.reasonably_certain ? 'text-emerald-400 font-semibold' : 'text-muted-foreground'}`}>Reasonably Certain</span>
              </button>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Notes</label>
              <Input value={optForm.notes} onChange={e => setOptForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes…" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setOptOpen(false)}>Cancel</Button>
            <Button
              disabled={!optForm.exercise_deadline || upsertOpt.isPending}
              onClick={() => upsertOpt.mutate({ ...optForm, option_id: editOpt ? Number(editOpt.option_id) : undefined })}
            >
              {upsertOpt.isPending ? 'Saving…' : 'Save Option'}
            </Button>
          </div>
        </div>
      )}

      {/* ── BREAK CLAUSE FORM DIALOG ── */}
      {brkOpen && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Scissors className="w-4 h-4 text-red-400" />
              {editBrk ? 'Edit Break Clause' : 'New Break Clause'}
            </h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setBrkOpen(false)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block">Break Date *</label>
                <Input type="date" value={brkForm.break_date} onChange={e => setBrkForm(f => ({ ...f, break_date: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Notice Deadline *</label>
                <Input type="date" value={brkForm.notice_deadline} onChange={e => setBrkForm(f => ({ ...f, notice_deadline: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Penalty Amount</label>
                <Input type="number" value={brkForm.penalty_amount} onChange={e => setBrkForm(f => ({ ...f, penalty_amount: Number(e.target.value) }))} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Status</label>
                <Select value={brkForm.status} onValueChange={v => setBrkForm(f => ({ ...f, status: v as typeof f.status }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['ACTIVE','EXERCISED','LAPSED','WAIVED'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Conditions</label>
              <Input value={brkForm.conditions} onChange={e => setBrkForm(f => ({ ...f, conditions: e.target.value }))} placeholder="Conditions for exercising break…" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setBrkOpen(false)}>Cancel</Button>
            <Button
              disabled={!brkForm.break_date || !brkForm.notice_deadline || upsertBrk.isPending}
              onClick={() => upsertBrk.mutate({ ...brkForm, break_id: editBrk ? Number(editBrk.break_id) : undefined })}
            >
              {upsertBrk.isPending ? 'Saving…' : 'Save Break Clause'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeaseTransactionCentre() {
  const [search, setSearch] = useState('');
  // Read contractId from URL query param (e.g. navigated from JV Register)
  const [location, setLocation] = useLocation();
  const urlContractId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('contractId');
    return v ? parseInt(v, 10) : null;
  }, [location]);
  const [selectedId, setSelectedId] = useState<number | null>(urlContractId);
  // Sync when URL param changes (e.g. navigated from another page)
  useEffect(() => {
    if (urlContractId !== null) setSelectedId(urlContractId);
  }, [urlContractId]);
  const [txnType, setTxnType] = useState<TxnType>('Details');
  const handleExerciseOption = (tab: TxnType, prefill: Record<string, unknown>) => {
    if (tab === 'Renewal') {
      if (prefill.payment) setRenPayment(String(prefill.payment));
      if (prefill.notes) setRenNotes(String(prefill.notes));
    } else if (tab === 'Modification') {
      if (prefill.payment) setModPayment(String(prefill.payment));
      if (prefill.notes) setModNotes(String(prefill.notes));
    }
    setTxnType(tab);
    toast.info(`Switched to ${tab} tab — fields pre-filled from option`);
  };
  const handleExerciseBreak = (prefill: Record<string, unknown>) => {
    if (prefill.date) setTrmDate(String(prefill.date));
    if (prefill.notes) setTrmNotes(String(prefill.notes));
    setTxnType('Termination');
    toast.info('Switched to Termination tab — fields pre-filled from break clause');
  };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posted, setPosted] = useState<{ je_ref: string; je_label: string } | null>(null);

  // Modification inputs
  const [modPayment, setModPayment] = useState('');
  const [modDate, setModDate]       = useState(today());
  const [modIBR, setModIBR]         = useState('');
  const [modNotes, setModNotes]     = useState('');

  // Termination inputs
  const [trmDate, setTrmDate]   = useState(today());
  const [trmNotes, setTrmNotes] = useState('');
  const [trmCalcOpen, setTrmCalcOpen] = useState(false);
  const [modCalcOpen, setModCalcOpen] = useState(false);

  // Renewal inputs
  const [renPayment, setRenPayment]         = useState('');
  const [renExpiry, setRenExpiry]           = useState('');
  const [renIBR, setRenIBR]                 = useState('');
  const [renNotes, setRenNotes]             = useState('');
  const [renCurrency, setRenCurrency]       = useState('QAR');
  const [renAssetType, setRenAssetType]     = useState('');
  const [renAssetDesc, setRenAssetDesc]     = useState('');
  const [renAssetTag, setRenAssetTag]       = useState('');
  const [renLocation, setRenLocation]       = useState('');
  const [renEscalation, setRenEscalation]   = useState('');
  const [renDeposit, setRenDeposit]         = useState('');
  const [renMaintenance, setRenMaintenance] = useState<'Lessor'|'Vodafone'|'Shared'>('Lessor');
  const [renIsLTO, setRenIsLTO]             = useState(false);
  const [renLTOPrice, setRenLTOPrice]       = useState('');
  const [renLTODeposit, setRenLTODeposit]   = useState('');
  const [renLTOInstalments, setRenLTOInstalments] = useState('');
  const [renLTORate, setRenLTORate]         = useState('');
  const [renLTOBalloon, setRenLTOBalloon]   = useState('');
  const [renCommDate, setRenCommDate]       = useState('');
  const [renClassification, setRenClassification] = useState<'Finance'|'Operating'|'ShortTerm'|'LowValue'>('Finance');
  const [renRenewalOption, setRenRenewalOption] = useState(false);
  const [renPurchaseOption, setRenPurchaseOption] = useState(false);

  // Purchase inputs
  const [purDate, setPurDate]     = useState(today());
  const [purPrice, setPurPrice]   = useState('');
  const [purNotes, setPurNotes]   = useState('');
  const [purCalcOpen, setPurCalcOpen] = useState(false);

  // Extension inputs (reuses Modification logic with IBR focus)
  const [extPayment, setExtPayment] = useState('');
  const [extDate, setExtDate]       = useState(today());
  const [extIBR, setExtIBR]         = useState('');
  const [extNotes, setExtNotes]     = useState('');
  const [extCalcOpen, setExtCalcOpen] = useState(false);
  const [renCalcOpen, setRenCalcOpen] = useState(false);
  const [renCalcRequested, setRenCalcRequested] = useState(false);

  const { data: leases = [], isLoading: leasesLoading, refetch: refetchLeases } =
    trpc.lease.getLeasesForTransaction.useQuery({ search: search || undefined });
  const selected = useMemo(() => leases.find(l => l.contract_id === selectedId) ?? null, [leases, selectedId]);
  const { data: selectedLeaseDetail } = trpc.lease.getLeaseById.useQuery(
    { contractId: selectedId! },
    { enabled: !!selectedId }
  );
  const currentLeaseTerms = useMemo(() => {
    if (!selected) return null;
    const detail = (selectedLeaseDetail ?? {}) as Record<string, any>;
    const source = { ...selected, ...detail } as Record<string, any>;
    return {
      commencementDate: toDateInput(source.commencement_date),
      expiryDate: toDateInput(source.expiry_date),
      currency: String(source.currency || 'QAR'),
      monthlyPayment: toInputNumber(source.monthly_payment),
      ibr: toRateInput(source.ibr),
      escalation: toInputNumber(source.escalation_rate ?? source.escalation_rate_pct),
      deposit: toInputNumber(source.deposit_amount ?? source.security_deposit),
      classification: toLeaseClass(source.ifrs16_classification),
      renewalOption: Boolean(source.renewal_option),
      purchaseOption: Boolean(source.purchase_option),
    };
  }, [selected, selectedLeaseDetail]);

  useEffect(() => {
    if (!selected) return;
    const detail = (selectedLeaseDetail ?? {}) as Record<string, any>;
    const source = { ...selected, ...detail } as Record<string, any>;

    setModPayment(toInputNumber(source.monthly_payment));
    setModIBR(toRateInput(source.ibr));
    setExtPayment(toInputNumber(source.monthly_payment));
    setExtIBR(toRateInput(source.ibr));

    setRenCurrency(String(source.currency || 'QAR'));
    setRenAssetType(String(source.asset_type || ''));
    setRenAssetDesc(String(source.asset_description || ''));
    setRenAssetTag(String(source.asset_tag || source.asset_code || ''));
    setRenCommDate('');
    setRenExpiry('');
    setRenPayment('');
    setRenIBR('');
    setRenEscalation('');
    setRenDeposit('');
    setRenMaintenance((source.maintenance_responsibility || 'Lessor') as 'Lessor'|'Vodafone'|'Shared');
    setRenClassification(toLeaseClass(source.ifrs16_classification));
    setRenRenewalOption(false);
    setRenPurchaseOption(false);
    setRenIsLTO(false);
    setRenLTOPrice('');
    setRenLTODeposit('');
    setRenLTOInstalments('');
    setRenLTORate('');
    setRenLTOBalloon('');

    try {
      const loc = JSON.parse(String(source.location_json || '{}'));
      setRenLocation(String(loc.city || loc.address || ''));
    } catch {
      setRenLocation('');
    }
  }, [selected, selectedLeaseDetail]);

  const handleSelectLease = (l: typeof leases[0]) => {
    setSelectedId(l.contract_id);
    setPosted(null);
  };

  const modPreviewEnabled = txnType === 'Modification' && !!selectedId && !!modPayment && !!modDate;
  const trmPreviewEnabled = txnType === 'Termination' && !!selectedId && !!trmDate;
  const renPreviewEnabled = txnType === 'Renewal' && !!selectedId && !!renPayment && !!renExpiry;
  const purPreviewEnabled = txnType === 'Purchase' && !!selectedId && !!purPrice && !!purDate;
  const extPreviewEnabled = txnType === 'Extension' && !!selectedId && !!extPayment && !!extDate;

  const { data: modPreview, isFetching: modFetching } = trpc.lease.previewModification.useQuery(
    { contractId: selectedId!, newMonthlyPayment: parseFloat(modPayment), effectiveDate: modDate, newIBR: modIBR ? parseFloat(modIBR) : undefined },
    { enabled: modPreviewEnabled }
  );
  const { data: trmPreview, isFetching: trmFetching } = trpc.lease.previewTermination.useQuery(
    { contractId: selectedId!, terminationDate: trmDate },
    { enabled: trmPreviewEnabled }
  );
  const { data: renPreview, isFetching: renFetching } = trpc.lease.previewRenewal.useQuery(
    { contractId: selectedId!, newExpiryDate: renExpiry, newMonthlyPayment: parseFloat(renPayment), newIBR: renIBR ? parseFloat(renIBR) : undefined },
    { enabled: renPreviewEnabled }
  );
  useEffect(() => {
    if (renCalcRequested && renPreview?.summary && !renFetching) {
      setRenCalcOpen(true);
      setRenCalcRequested(false);
    }
  }, [renCalcRequested, renPreview, renFetching]);
  const { data: purPreview, isFetching: purFetching } = trpc.lease.previewPurchase.useQuery(
    { contractId: selectedId!, purchaseDate: purDate, purchasePrice: parseFloat(purPrice || '0') },
    { enabled: purPreviewEnabled }
  );
  const { data: extPreview, isFetching: extFetching } = trpc.lease.previewModification.useQuery(
    { contractId: selectedId!, newMonthlyPayment: parseFloat(extPayment || '0'), effectiveDate: extDate, newIBR: extIBR ? parseFloat(extIBR) : undefined },
    { enabled: extPreviewEnabled }
  );

  const utils = trpc.useUtils();
  const postMut = trpc.lease.postLeaseTransaction.useMutation({
    onSuccess: (data) => {
      setPosted({ je_ref: data?.je_ref ?? '', je_label: data?.je_label ?? '' });
      toast.success(`Transaction posted — ${data?.je_ref}`);
      refetchLeases();
      utils.lease.getLeaseTransactionHistory.invalidate({ contractId: selectedId! });
    },
    onError: (e) => toast.error(`Post failed: ${e.message}`),
  });

  // Dedicated mutations for Renewal and Purchase (bypass sp_PostLeaseTransaction)
  const applyRenewalMut = trpc.lease.applyRenewal.useMutation({
    onSuccess: (data) => {
      setPosted({ je_ref: data?.je_ref ?? '', je_label: data?.je_label ?? '' });
      toast.success(`Renewal applied — ${data?.je_ref}`);
      refetchLeases();
      utils.lease.getLeaseTransactionHistory.invalidate({ contractId: selectedId! });
    },
    onError: (e) => toast.error(`Renewal failed: ${e.message}`),
  });
  const applyPurchaseMut = trpc.lease.applyPurchase.useMutation({
    onSuccess: (data) => {
      setPosted({ je_ref: data?.je_ref ?? '', je_label: data?.je_label ?? '' });
      toast.success(`Purchase applied — ${data?.je_ref}`);
      refetchLeases();
      utils.lease.getLeaseTransactionHistory.invalidate({ contractId: selectedId! });
    },
    onError: (e) => toast.error(`Purchase failed: ${e.message}`),
  });

  const handlePost = () => {
    if (!selectedId) return;
    if (txnType === 'Modification') {
      const base = { contractId: selectedId, transactionType: 'Modification' as const, effectiveDate: modDate, newMonthlyPayment: parseFloat(modPayment), newIBR: modIBR ? parseFloat(modIBR) : undefined, notes: modNotes };
      postMut.mutate(base);
    } else if (txnType === 'Termination') {
      postMut.mutate({ contractId: selectedId, transactionType: 'Termination' as const, effectiveDate: trmDate, notes: trmNotes });
    } else if (txnType === 'Renewal') {
      applyRenewalMut.mutate({ contractId: selectedId, newExpiryDate: renExpiry, newMonthlyPayment: parseFloat(renPayment), newIBR: renIBR ? parseFloat(renIBR) : undefined });
    } else if (txnType === 'Purchase') {
      applyPurchaseMut.mutate({ contractId: selectedId, purchaseDate: purDate, purchasePrice: parseFloat(purPrice) });
    } else if (txnType === 'Extension') {
      const base = { contractId: selectedId, transactionType: 'Modification' as const, effectiveDate: extDate, newMonthlyPayment: parseFloat(extPayment), newIBR: extIBR ? parseFloat(extIBR) : undefined, notes: extNotes };
      postMut.mutate(base);
    }
    setConfirmOpen(false);
  };

  const isPreviewReady = txnType === 'Modification' ? !!modPreview : txnType === 'Termination' ? !!trmPreview : txnType === 'Renewal' ? !!renPreview : txnType === 'Purchase' ? !!purPreview : txnType === 'Extension' ? !!extPreview : false;
  const isPosting = postMut.isPending || applyRenewalMut.isPending || applyPurchaseMut.isPending;
  const inputCls = "bg-background border-border text-foreground placeholder:text-muted-foreground";
  const labelCls = "text-xs font-medium text-foreground mb-1 block";
  const fillRenewalFromCurrent = () => {
    if (!currentLeaseTerms) return;
    setRenCommDate(currentLeaseTerms.commencementDate);
    setRenExpiry(currentLeaseTerms.expiryDate);
    setRenCurrency(currentLeaseTerms.currency);
    setRenPayment(currentLeaseTerms.monthlyPayment);
    setRenIBR(currentLeaseTerms.ibr);
    setRenEscalation(currentLeaseTerms.escalation);
    setRenDeposit(currentLeaseTerms.deposit);
    setRenClassification(currentLeaseTerms.classification);
    setRenRenewalOption(currentLeaseTerms.renewalOption);
    setRenPurchaseOption(currentLeaseTerms.purchaseOption);
  };
  const handleRenewalCalc = () => {
    if (!renExpiry || !renPayment || Number.isNaN(parseFloat(renPayment))) {
      toast.error('Enter New Expiry Date and New Monthly Payment before calculation.');
      return;
    }
    setRenCalcRequested(true);
    if (renPreview?.summary && !renFetching) {
      setRenCalcOpen(true);
      setRenCalcRequested(false);
    } else {
      toast.info('Calculating renewal remeasurement...');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ══ TOP BAR ══════════════════════════════════════════════════════════ */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-border bg-card flex items-center gap-4 flex-wrap">
          {/* Screen title */}
          <div className="flex items-center gap-3 mr-2">
            <ScreenHeader
              screenId="VFLTXNCTR0001P001" screenType="lease_transaction_centre"
              title="Lease Transaction Centre"
              subtitle="IFRS 16 — Modification (JE-4) · Renewal (JE-7) · Purchase (§26) · Extension (§45)"
            />
          </div>

          {/* Lease selector dropdown */}
          <LeaseDropdown
            leases={leases}
            loading={leasesLoading}
            search={search}
            setSearch={setSearch}
            selectedId={selectedId}
            onSelect={handleSelectLease}
          />

          {/* Selected lease KPI strip */}
          {selected && (
            <LeaseStatStrip className="ml-2">
              <LeaseStatDivider />
              <LeaseStatPill
                label="Payment"
                badge={selected.currency}
                value={fmt(selected.monthly_payment)}
              />
              <LeaseStatPill
                label="Expiry"
                value={fmtDate(selected.expiry_date)}
                mono={false}
              />
              <LeaseStatPill
                label="IBR"
                value={selected.ibr ? `${(Number(selected.ibr) * 100).toFixed(4)}%` : '—'}
                color="amber"
              />
              <LeaseStatDivider />
              <LeaseStatPill
                label="Liability"
                value={fmt(selected.current_liability)}
                color="blue"
              />
              <LeaseStatPill
                label="ROU NBV"
                value={fmt(selected.current_rou_nbv)}
                color="emerald"
              />
            </LeaseStatStrip>
          )}
        </div>

        {/* ══ CONTENT AREA ═════════════════════════════════════════════════════ */}
        {!selected ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center">
              <FileText className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">No lease selected</p>
              <p className="text-sm mt-1 max-w-sm">Use the lease dropdown above to select a lease and post a Modification, Termination, or Renewal transaction.</p>
            </div>
          </div>
        ) : (
          /* Full-width tabs */
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs
              value={txnType}
              onValueChange={v => { setTxnType(v as TxnType); setPosted(null); }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Tab bar */}
              <div className="flex-shrink-0 px-6 pt-4 border-b border-border">
                <TabsList className="grid grid-cols-7 w-full">
                  <TabsTrigger value="Details" className="flex items-center gap-2 text-sm py-2.5">
                    <FileText className="w-4 h-4" /> Details
                  </TabsTrigger>
                  <TabsTrigger value="Modification" className="flex items-center gap-2 text-sm py-2.5">
                    <RefreshCw className="w-4 h-4" /> Modification
                  </TabsTrigger>
                  <TabsTrigger value="Renewal" className="flex items-center gap-2 text-sm py-2.5">
                    <ChevronRight className="w-4 h-4" /> Renewal
                  </TabsTrigger>
                  <TabsTrigger value="Purchase" className="flex items-center gap-2 text-sm py-2.5">
                    <CreditCard className="w-4 h-4" /> Purchase
                  </TabsTrigger>
                  <TabsTrigger value="Extension" className="flex items-center gap-2 text-sm py-2.5">
                    <Plus className="w-4 h-4" /> Extension
                  </TabsTrigger>
                  <TabsTrigger value="OptionsBreaks" className="flex items-center gap-2 text-sm py-2.5">
                    <GitBranch className="w-4 h-4" /> Options
                  </TabsTrigger>
                  <TabsTrigger value="History" className="flex items-center gap-2 text-sm py-2.5">
                    <History className="w-4 h-4" /> History
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ── LEASE DETAILS TAB ── */}
              <TabsContent value="Details" className="flex-1 overflow-y-auto px-6 py-6">
                <LeaseDetailsPanel contractId={selected.contract_id} />
              </TabsContent>
              {/* ── MODIFICATION TAB ── */}
              <TabsContent value="Modification" className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <RefreshCw className="w-4 h-4 text-amber-400" />
                    <h3 className="text-base font-semibold">Modification Terms</h3>
                    <span className="text-xs text-muted-foreground ml-1">(IFRS 16 Para 45)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-5">
                    <div>
                      <label className={labelCls}>New Monthly Payment *</label>
                      <Input className={inputCls} placeholder="e.g. 12500.00" value={modPayment} onChange={e => setModPayment(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Effective Date *</label>
                      <Input type="date" className={inputCls} value={modDate} onChange={e => setModDate(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>New IBR (optional)</label>
                      <Input className={inputCls} placeholder="e.g. 0.0450" value={modIBR} onChange={e => setModIBR(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Notes</label>
                      <Input className={inputCls} placeholder="Reason for modification…" value={modNotes} onChange={e => setModNotes(e.target.value)} />
                    </div>
                  </div>
                </div>

                {modFetching && <p className="text-sm text-muted-foreground animate-pulse px-1">Calculating remeasurement…</p>}
                {modPreview?.summary && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-amber-400">
                        {modPreview.summary.is_decrease
                          ? 'Partial Termination Preview (IFRS 16 Para 46a) — Rent Decrease'
                          : 'Remeasurement Preview (IFRS 16 Para 45) — Rent Increase'}
                      </h4>
                      <button
                        onClick={() => setModCalcOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold hover:bg-yellow-500/30 transition-colors"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Calc
                      </button>
                    </div>
                    <KPIRow items={[
                      { label: 'Current Liability',   value: fmt(modPreview.summary.current_liability) },
                      { label: 'New PV',              value: fmt(modPreview.summary.new_pv), highlight: true },
                      { label: 'Liability Δ',         value: fmt(modPreview.summary.liability_delta), highlight: true },
                      { label: 'Current ROU NBV',     value: fmt(modPreview.summary.current_rou_nbv) },
                      { label: 'New ROU NBV',         value: fmt(modPreview.summary.new_rou_nbv), highlight: true },
                      { label: 'ROU Δ',               value: fmt(modPreview.summary.rou_delta) },
                      { label: 'Remeasurement G/L',   value: fmt(modPreview.summary.remeasurement_gain_loss) },
                      { label: 'Remaining Months',    value: String(modPreview.summary.remaining_months ?? '—') },
                    ]} />
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Journal Entry Preview (JE-4)</h4>
                      <JETable lines={modPreview.jeLines} />
                    </div>
                    {modPreview.schedule?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Regenerated Schedule Preview</h4>
                        <SchedulePreview rows={modPreview.schedule} />
                      </div>
                    )}
                  </div>
                )}

                {/* ── Modification Calc Explanation Modal (full-screen blackboard) ── */}
                {modCalcOpen && modPreview?.summary && (
                  <div className="fixed inset-0 z-[9999] bg-gray-950/98 flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
                      <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        Calculation Explanation — Lease Modification ({modPreview.summary.is_decrease ? 'IFRS 16 Para 46a — Partial Termination' : 'IFRS 16 Para 45 — Remeasurement'})
                      </h2>
                      <CalculationModalActions
                        title="Lease Modification Calculation"
                        contentId="lease-modification-calculation-content"
                        onClose={() => setModCalcOpen(false)}
                      />
                    </div>
                    <div id="lease-modification-calculation-content" className="flex-1 p-8 font-mono text-sm leading-relaxed text-green-300 max-w-4xl mx-auto w-full space-y-6">
                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 1: Identify Current Balances ═══</p>
                        <p>Effective Date: <span className="text-white">{modDate}</span></p>
                        <p>Current Lease Liability: <span className="text-cyan-300">{fmt(modPreview.summary.current_liability)} {modPreview.summary.currency as string}</span></p>
                        <p>Current ROU NBV: <span className="text-cyan-300">{fmt(modPreview.summary.current_rou_nbv)} {modPreview.summary.currency as string}</span></p>
                        <p>Remaining Months: <span className="text-white">{String(modPreview.summary.remaining_months)}</span></p>
                        <p>IBR Used: <span className="text-white">{String(modPreview.summary.ibr_used)}</span> (monthly: {(Number(modPreview.summary.ibr_used) / 12).toFixed(6)})</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 2: Calculate New Present Value ═══</p>
                        <p>New Monthly Payment: <span className="text-white">{fmt(modPreview.summary.new_monthly_payment)} {modPreview.summary.currency as string}</span></p>
                        <p>Formula: PV = PMT × [(1 − (1 + r)^−n) / r]</p>
                        <p className="ml-4">= {fmt(modPreview.summary.new_monthly_payment)} × [(1 − (1 + {(Number(modPreview.summary.ibr_used) / 12).toFixed(6)})^−{String(modPreview.summary.remaining_months)}) / {(Number(modPreview.summary.ibr_used) / 12).toFixed(6)}]</p>
                        <p className="ml-4 text-white font-bold">= {fmt(modPreview.summary.new_pv)} {modPreview.summary.currency as string}</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 3: Calculate Liability Delta ═══</p>
                        <p>Liability Δ = New PV − Current Liability</p>
                        <p className="ml-4">= {fmt(modPreview.summary.new_pv)} − {fmt(modPreview.summary.current_liability)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(modPreview.summary.liability_delta)} {modPreview.summary.currency as string}</p>
                        <p className="mt-2 text-gray-400 text-xs">{Number(modPreview.summary.liability_delta) >= 0 ? 'Positive → Rent Increase → No P&L impact' : 'Negative → Rent Decrease → Partial Termination with P&L impact'}</p>
                      </div>

                      {modPreview.summary.is_decrease ? (
                        <>
                          <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                            <p className="text-yellow-400 font-bold mb-3">═══ STEP 4: Proportional ROU Reduction (Partial Termination) ═══</p>
                            <p>Proportional Ratio = |Liability Δ| / Current Liability</p>
                            <p className="ml-4">= {fmt(Math.abs(Number(modPreview.summary.liability_delta)))} / {fmt(modPreview.summary.current_liability)}</p>
                            <p className="ml-4 text-white font-bold">= {(Number(modPreview.summary.proportional_ratio) * 100).toFixed(4)}%</p>
                            <p className="mt-3">ROU Reduction = Current ROU NBV × Proportional Ratio</p>
                            <p className="ml-4">= {fmt(modPreview.summary.current_rou_nbv)} × {(Number(modPreview.summary.proportional_ratio) * 100).toFixed(4)}%</p>
                            <p className="ml-4 text-white font-bold">= {fmt(Math.abs(Number(modPreview.summary.rou_delta)))} {modPreview.summary.currency as string}</p>
                          </div>

                          <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                            <p className="text-yellow-400 font-bold mb-3">═══ STEP 5: Calculate Gain/Loss ═══</p>
                            <p>Gain/Loss = |Liability Δ| − |ROU Δ|</p>
                            <p className="ml-4">= {fmt(Math.abs(Number(modPreview.summary.liability_delta)))} − {fmt(Math.abs(Number(modPreview.summary.rou_delta)))}</p>
                            <p className="ml-4 text-white font-bold">= {fmt(modPreview.summary.remeasurement_gain_loss)} {modPreview.summary.currency as string} ({Number(modPreview.summary.remeasurement_gain_loss) >= 0 ? 'Loss' : 'Gain'})</p>
                            <p className="mt-2 text-gray-400 text-xs">This amount is recognised in Profit & Loss (unlike rent increase which goes to asset)</p>
                          </div>
                        </>
                      ) : (
                        <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                          <p className="text-yellow-400 font-bold mb-3">═══ STEP 4: Adjust ROU Asset ═══</p>
                          <p>ROU Δ = Liability Δ (no P&L impact for increase)</p>
                          <p className="ml-4">= {fmt(modPreview.summary.liability_delta)} {modPreview.summary.currency as string}</p>
                          <p className="mt-2">New ROU NBV = Current ROU NBV + ROU Δ</p>
                          <p className="ml-4">= {fmt(modPreview.summary.current_rou_nbv)} + {fmt(modPreview.summary.liability_delta)}</p>
                          <p className="ml-4 text-white font-bold">= {fmt(modPreview.summary.new_rou_nbv)} {modPreview.summary.currency as string}</p>
                        </div>
                      )}

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ {modPreview.summary.is_decrease ? 'STEP 6' : 'STEP 5'}: Journal Entry (JE-4) ═══</p>
                        <table className="w-full text-xs border border-gray-700">
                          <thead><tr className="bg-gray-800"><th className="px-3 py-2 text-left">Dr/Cr</th><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Explanation</th></tr></thead>
                          <tbody>
                            {(modPreview.jeLines as any[]).map((line: any, i: number) => (
                              <tr key={i} className="border-t border-gray-700">
                                <td className={`px-3 py-2 font-bold ${line.dr_cr === 'Dr' ? 'text-emerald-400' : 'text-rose-400'}`}>{line.dr_cr as string}</td>
                                <td className="px-3 py-2">{line.account_code as string} — {line.account_name as string}</td>
                                <td className={`px-3 py-2 text-right ${line.dr_cr === 'Dr' ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(line.amount)}</td>
                                <td className="px-3 py-2 text-gray-400">{line.description as string}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ New Depreciation ═══</p>
                        <p>New Depreciation = New ROU NBV / Remaining Months</p>
                        <p className="ml-4">= {fmt(modPreview.summary.new_rou_nbv)} / {String(modPreview.summary.remaining_months)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(Number(modPreview.summary.new_rou_nbv) / Number(modPreview.summary.remaining_months))} per month</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ IFRS 16 Reference ═══</p>
                        {modPreview.summary.is_decrease ? (
                          <p className="text-gray-300">Para 46(a): "For a decrease in scope, the lessee shall decrease the carrying amount of the right-of-use asset to reflect the partial or full termination of the lease, and recognise in profit or loss any gain or loss relating to the partial or full termination."</p>
                        ) : (
                          <p className="text-gray-300">Para 45: "A lessee shall remeasure the lease liability by discounting the revised lease payments using a revised discount rate... The lessee shall recognise the amount of the remeasurement of the lease liability as an adjustment to the right-of-use asset."</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {posted && txnType === 'Modification' ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">Modification Posted Successfully</p>
                      <p className="text-xs text-muted-foreground mt-1">JE Reference: <span className="font-mono font-bold">{posted.je_ref}</span></p>
                      <p className="text-xs text-muted-foreground">{posted.je_label}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button onClick={() => setConfirmOpen(true)} disabled={!isPreviewReady || isPosting} className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-2.5 text-sm">
                      {isPosting ? 'Posting…' : 'Post Modification & Generate JE-4'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── TERMINATION TAB ── */}
              <TabsContent value="Termination" className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                <div className="rounded-xl border border-red-500/30 bg-card p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <h3 className="text-base font-semibold">Termination Terms</h3>
                    <span className="text-xs text-muted-foreground ml-1">(IFRS 16 Para 46)</span>
                  </div>
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 mb-5">
                    <p className="text-xs text-red-400 font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Irreversible Action</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Posting this transaction will derecognise the ROU asset and lease liability, remove all future projected schedule rows, and set the lease status to Closed. This cannot be undone.
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-5">
                    <div>
                      <label className={labelCls}>Termination Date *</label>
                      <Input type="date" className={inputCls} value={trmDate} onChange={e => setTrmDate(e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <label className={labelCls}>Notes / Reason</label>
                      <Input className={inputCls} placeholder="Reason for termination…" value={trmNotes} onChange={e => setTrmNotes(e.target.value)} />
                    </div>
                  </div>
                </div>

                {trmFetching && <p className="text-sm text-muted-foreground animate-pulse px-1">Calculating derecognition…</p>}
                {trmPreview?.summary && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-red-400">Derecognition Preview (IFRS 16 Para 46)</h4>
                      <button
                        onClick={() => setTrmCalcOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold hover:bg-yellow-500/30 transition-colors"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Calc
                      </button>
                    </div>
                    <KPIRow items={[
                      { label: 'Lease Liability Derecognised', value: fmt(trmPreview.summary.lease_liability_derecognised) },
                      { label: 'ROU Asset (Cost)',             value: fmt(trmPreview.summary.rou_asset_cost) },
                      { label: 'Accum. Depreciation',          value: fmt(trmPreview.summary.accumulated_depreciation) },
                      { label: 'ROU NBV',                      value: fmt(trmPreview.summary.rou_asset_nbv) },
                      { label: 'Gain / Loss',                  value: fmt(trmPreview.summary.gain_loss_on_termination), highlight: true },
                      { label: 'Type',                         value: String(trmPreview.summary.gain_loss_type ?? '—') },
                      { label: 'Months Early',                 value: String(trmPreview.summary.months_early ?? '—') },
                      { label: 'Original Expiry',              value: fmtDate(trmPreview.summary.original_expiry_date) },
                    ]} />
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Journal Entry Preview (JE-5)</h4>
                      <JETable lines={trmPreview.jeLines} />
                    </div>
                  </div>
                )}

                {/* ── Termination Calc Explanation Modal (full-screen blackboard) ── */}
                {trmCalcOpen && trmPreview?.summary && (
                  <div className="fixed inset-0 z-[9999] bg-gray-950/98 flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
                      <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        Calculation Explanation — Lease Termination (IFRS 16 Para 46)
                      </h2>
                      <CalculationModalActions
                        title="Lease Termination Calculation"
                        contentId="lease-termination-calculation-content"
                        onClose={() => setTrmCalcOpen(false)}
                      />
                    </div>
                    <div id="lease-termination-calculation-content" className="flex-1 p-8 font-mono text-sm leading-relaxed text-green-300 max-w-4xl mx-auto w-full space-y-6">
                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 1: Identify Balances at Termination Date ═══</p>
                        <p>Termination Date: <span className="text-white">{trmDate}</span></p>
                        <p>Remaining Lease Liability (closing balance): <span className="text-cyan-300">{fmt(trmPreview.summary.lease_liability_derecognised)} {trmPreview.summary.currency as string}</span></p>
                        <p>ROU Asset (original cost): <span className="text-cyan-300">{fmt(trmPreview.summary.rou_asset_cost)} {trmPreview.summary.currency as string}</span></p>
                        <p>Accumulated Depreciation (to date): <span className="text-cyan-300">{fmt(trmPreview.summary.accumulated_depreciation)} {trmPreview.summary.currency as string}</span></p>
                        <p>ROU Net Book Value = Cost − Accum. Depr</p>
                        <p className="ml-4">= {fmt(trmPreview.summary.rou_asset_cost)} − {fmt(trmPreview.summary.accumulated_depreciation)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(trmPreview.summary.rou_asset_nbv)} {trmPreview.summary.currency as string}</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 2: Calculate Gain/Loss on Derecognition ═══</p>
                        <p>Gain/Loss = Lease Liability − ROU NBV</p>
                        <p className="ml-4">= {fmt(trmPreview.summary.lease_liability_derecognised)} − {fmt(trmPreview.summary.rou_asset_nbv)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(trmPreview.summary.gain_loss_on_termination)} {trmPreview.summary.currency as string} ({trmPreview.summary.gain_loss_type as string})</p>
                        <p className="mt-2 text-gray-400 text-xs">If positive → Gain (Cr to P&L) | If negative → Loss (Dr to P&L)</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 3: Journal Entry (JE-5) — Derecognition ═══</p>
                        <p className="text-gray-400 mb-2">Debit entries remove liabilities and contra-assets from the balance sheet.</p>
                        <p className="text-gray-400 mb-3">Credit entries remove the asset at original cost and recognise the gain/loss.</p>
                        <table className="w-full text-xs border border-gray-700">
                          <thead><tr className="bg-gray-800"><th className="px-3 py-2 text-left">Dr/Cr</th><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Explanation</th></tr></thead>
                          <tbody>
                            <tr className="border-t border-gray-700"><td className="px-3 py-2 text-emerald-400 font-bold">Dr</td><td className="px-3 py-2">2101 — Lease Liability</td><td className="px-3 py-2 text-right text-emerald-300">{fmt(trmPreview.summary.lease_liability_derecognised)}</td><td className="px-3 py-2 text-gray-400">Remove remaining obligation to lessor</td></tr>
                            <tr className="border-t border-gray-700"><td className="px-3 py-2 text-emerald-400 font-bold">Dr</td><td className="px-3 py-2">10200 — Accum. Depreciation</td><td className="px-3 py-2 text-right text-emerald-300">{fmt(trmPreview.summary.accumulated_depreciation)}</td><td className="px-3 py-2 text-gray-400">Remove contra-asset (depreciation charged to date)</td></tr>
                            <tr className="border-t border-gray-700"><td className="px-3 py-2 text-rose-400 font-bold">Cr</td><td className="px-3 py-2">1601 — Right-of-Use Asset</td><td className="px-3 py-2 text-right text-rose-300">{fmt(trmPreview.summary.rou_asset_cost)}</td><td className="px-3 py-2 text-gray-400">Remove ROU asset at original cost</td></tr>
                            <tr className="border-t border-gray-700"><td className="px-3 py-2 font-bold" style={{color: (trmPreview.summary.gain_loss_type === 'Gain') ? '#f87171' : '#34d399'}}>{(trmPreview.summary.gain_loss_type === 'Gain') ? 'Cr' : 'Dr'}</td><td className="px-3 py-2">7201 — Gain/Loss on Termination</td><td className="px-3 py-2 text-right" style={{color: (trmPreview.summary.gain_loss_type === 'Gain') ? '#f87171' : '#34d399'}}>{fmt(trmPreview.summary.gain_loss_on_termination)}</td><td className="px-3 py-2 text-gray-400">Balancing figure to P&L</td></tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 4: Verification (Dr = Cr) ═══</p>
                        <p>Total Debits  = {fmt(trmPreview.summary.lease_liability_derecognised)} + {fmt(trmPreview.summary.accumulated_depreciation)}</p>
                        <p className="ml-4">= {fmt(Number(trmPreview.summary.lease_liability_derecognised) + Number(trmPreview.summary.accumulated_depreciation))}</p>
                        <p>Total Credits = {fmt(trmPreview.summary.rou_asset_cost)} + {fmt(trmPreview.summary.gain_loss_on_termination)}</p>
                        <p className="ml-4">= {fmt(Number(trmPreview.summary.rou_asset_cost) + Number(trmPreview.summary.gain_loss_on_termination))}</p>
                        <p className="mt-2 text-white font-bold">✓ Balanced</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ IFRS 16 Reference ═══</p>
                        <p className="text-gray-300">Para 46: "A lessee shall derecognise the right-of-use asset and the lease liability at the date of termination. The difference between the carrying amounts of the right-of-use asset and the lease liability shall be recognised in profit or loss."</p>
                        <p className="mt-2 text-gray-400">Months terminated early: <span className="text-white">{String(trmPreview.summary.months_early)}</span></p>
                        <p className="text-gray-400">Original expiry: <span className="text-white">{fmtDate(trmPreview.summary.original_expiry_date)}</span></p>
                      </div>
                    </div>
                  </div>
                )}

                {posted && txnType === 'Termination' ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">Termination Posted Successfully</p>
                      <p className="text-xs text-muted-foreground mt-1">JE Reference: <span className="font-mono font-bold">{posted.je_ref}</span></p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button onClick={() => setConfirmOpen(true)} disabled={!isPreviewReady || isPosting} className="bg-red-600 hover:bg-red-700 text-white px-8 py-2.5 text-sm">
                      {isPosting ? 'Posting…' : 'Post Termination & Generate JE-5'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── RENEWAL TAB ── */}
              <TabsContent value="Renewal" className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {/* Asset Details */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-base font-semibold">Asset Details</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-5">
                    <div>
                      <label className={labelCls}>Asset Type</label>
                      <Select value={renAssetType} onValueChange={setRenAssetType}>
                        <SelectTrigger className={inputCls}><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Asset Description *</label>
                      <Input className={inputCls} placeholder="e.g. Rooftop BTS Tower — Emaar Square Tower 1" value={renAssetDesc} onChange={e => setRenAssetDesc(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Asset Tag / Code</label>
                      <Input className={inputCls} placeholder="e.g. VF-BTS-0042" value={renAssetTag} onChange={e => setRenAssetTag(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Location / Site</label>
                      <Input className={inputCls} placeholder="City, Region" value={renLocation} onChange={e => setRenLocation(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Maintenance By</label>
                      <Select value={renMaintenance} onValueChange={v => setRenMaintenance(v as typeof renMaintenance)}>
                        <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Lessor">Lessor</SelectItem>
                          <SelectItem value="Vodafone">Vodafone</SelectItem>
                          <SelectItem value="Shared">Shared</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Financial Terms */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-base font-semibold">Financial Terms</h3>
                    <span className="text-xs text-muted-foreground ml-1">(IFRS 16 Para 46 — Renewal)</span>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.5fr] gap-6">
                    <div className="rounded-lg border border-border/70 bg-muted/10 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold">Current Lease Terms</h4>
                        <Badge variant="outline" className="text-[10px]">Extracted</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {[
                          ['Commencement', currentLeaseTerms?.commencementDate || '—'],
                          ['Expiry', currentLeaseTerms?.expiryDate || '—'],
                          ['Currency', currentLeaseTerms?.currency || '—'],
                          ['Monthly Payment', currentLeaseTerms?.monthlyPayment || '—'],
                          ['IBR', currentLeaseTerms?.ibr || '—'],
                          ['Escalation', currentLeaseTerms?.escalation || '—'],
                          ['Security Deposit', currentLeaseTerms?.deposit || '—'],
                          ['Classification', currentLeaseTerms?.classification || '—'],
                          ['Renewal Option', currentLeaseTerms?.renewalOption ? 'Yes' : 'No'],
                          ['Purchase Option', currentLeaseTerms?.purchaseOption ? 'Yes' : 'No'],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-md border border-border/50 bg-background/50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                            <p className="mt-1 font-mono text-foreground">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <h4 className="text-sm font-semibold">New Renewal Terms</h4>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={fillRenewalFromCurrent}>
                            Use Current Terms
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5 border-yellow-500/50 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20"
                            onClick={handleRenewalCalc}
                            disabled={renFetching}
                          >
                            <Calculator className="w-3.5 h-3.5" />
                            {renFetching ? 'Calculating...' : 'Calc'}
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-5">
                        <div>
                          <label className={labelCls}>New Commencement Date *</label>
                          <Input type="date" className={inputCls} value={renCommDate} onChange={e => setRenCommDate(e.target.value)} />
                        </div>
                        <div>
                          <label className={labelCls}>New Expiry Date *</label>
                          <Input type="date" className={inputCls} value={renExpiry} onChange={e => setRenExpiry(e.target.value)} />
                        </div>
                        <div>
                          <label className={labelCls}>Currency</label>
                          <Select value={renCurrency} onValueChange={setRenCurrency}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className={labelCls}>New Monthly Payment *</label>
                          <Input className={inputCls} placeholder="e.g. 15000.00" value={renPayment} onChange={e => setRenPayment(e.target.value)} />
                        </div>
                        <div>
                          <label className={labelCls}>New IBR (Discount Rate)</label>
                          <Input className={inputCls} placeholder="e.g. 0.0500" value={renIBR} onChange={e => setRenIBR(e.target.value)} />
                        </div>
                        <div>
                          <label className={labelCls}>Escalation Rate (%)</label>
                          <Input className={inputCls} placeholder="e.g. 3.00" value={renEscalation} onChange={e => setRenEscalation(e.target.value)} />
                        </div>
                        <div>
                          <label className={labelCls}>Security Deposit</label>
                          <Input className={inputCls} placeholder="e.g. 30000.00" value={renDeposit} onChange={e => setRenDeposit(e.target.value)} />
                        </div>
                        <div>
                          <label className={labelCls}>IFRS 16 Classification</label>
                          <Select value={renClassification} onValueChange={v => setRenClassification(v as typeof renClassification)}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Finance">Finance Lease</SelectItem>
                              <SelectItem value="Operating">Operating Lease</SelectItem>
                              <SelectItem value="ShortTerm">Short-Term (Para 5a)</SelectItem>
                              <SelectItem value="LowValue">Low-Value (Para 5b)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-6 pt-5">
                          <div className="flex items-center gap-2">
                            <Checkbox id="ren-renewal" checked={renRenewalOption} onCheckedChange={v => setRenRenewalOption(!!v)} />
                            <label htmlFor="ren-renewal" className="text-xs cursor-pointer">Renewal Option</label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox id="ren-purchase" checked={renPurchaseOption} onCheckedChange={v => setRenPurchaseOption(!!v)} />
                            <label htmlFor="ren-purchase" className="text-xs cursor-pointer">Purchase Option</label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LTO Terms */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Package className="w-4 h-4 text-blue-400" />
                    <h3 className="text-base font-semibold">Lease-to-Own (LTO) Terms</h3>
                    <div className="flex items-center gap-2 ml-auto">
                      <Checkbox id="ren-lto" checked={renIsLTO} onCheckedChange={v => setRenIsLTO(!!v)} />
                      <label htmlFor="ren-lto" className="text-xs cursor-pointer">Enable LTO for this renewal</label>
                    </div>
                  </div>
                  {renIsLTO ? (
                    <div className="grid grid-cols-4 gap-5">
                      <div><label className={labelCls}>Purchase Price</label><Input className={inputCls} placeholder="e.g. 500000.00" value={renLTOPrice} onChange={e => setRenLTOPrice(e.target.value)} /></div>
                      <div><label className={labelCls}>LTO Deposit</label><Input className={inputCls} placeholder="e.g. 50000.00" value={renLTODeposit} onChange={e => setRenLTODeposit(e.target.value)} /></div>
                      <div><label className={labelCls}>Total Instalments</label><Input className={inputCls} placeholder="e.g. 36" value={renLTOInstalments} onChange={e => setRenLTOInstalments(e.target.value)} /></div>
                      <div><label className={labelCls}>Finance Charge Rate</label><Input className={inputCls} placeholder="e.g. 0.0600" value={renLTORate} onChange={e => setRenLTORate(e.target.value)} /></div>
                      <div><label className={labelCls}>Balloon Amount</label><Input className={inputCls} placeholder="e.g. 10000.00" value={renLTOBalloon} onChange={e => setRenLTOBalloon(e.target.value)} /></div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">LTO not applicable for this renewal. Enable above to configure.</p>
                  )}
                </div>

                {/* Notes */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <label className={labelCls}>Renewal Notes / Justification</label>
                  <Input className={inputCls} placeholder="Reason for renewal, negotiation summary, approval reference…" value={renNotes} onChange={e => setRenNotes(e.target.value)} />
                </div>

                {renFetching && <p className="text-sm text-muted-foreground animate-pulse px-1">Calculating renewal remeasurement…</p>}
                {renPreview?.summary && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-emerald-400">Renewal Remeasurement Preview (JE-7)</h4>
                      <button
                        onClick={() => setRenCalcOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold hover:bg-yellow-500/30 transition-colors"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Calc
                      </button>
                    </div>
                    <KPIRow items={[
                      { label: 'Current Liability',   value: fmt(renPreview.summary.current_liability) },
                      { label: 'New PV',              value: fmt(renPreview.summary.new_pv), highlight: true },
                      { label: 'Liability Δ',         value: fmt(renPreview.summary.liability_delta), highlight: true },
                      { label: 'Current ROU NBV',     value: fmt(renPreview.summary.current_rou_nbv) },
                      { label: 'New ROU NBV',         value: fmt(renPreview.summary.new_rou_nbv), highlight: true },
                      { label: 'New Term (months)',   value: String(renPreview.summary.new_term_months ?? '—') },
                      { label: 'Old Expiry',          value: fmtDate(renPreview.summary.old_expiry_date) },
                      { label: 'New Expiry',          value: fmtDate(renPreview.summary.new_expiry_date) },
                    ]} />
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Journal Entry Preview (JE-7)</h4>
                      <JETable lines={renPreview.jeLines} />
                    </div>
                    {renPreview.schedule?.length > 0 && <SchedulePreview rows={renPreview.schedule} />}
                  </div>
                )}

                {/* ── Renewal Calc Explanation Modal (full-screen blackboard) ── */}
                {renCalcOpen && renPreview?.summary && (
                  <div className="fixed inset-0 z-[9999] bg-gray-950/98 flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
                      <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        Calculation Explanation — Lease Renewal (IFRS 16 Para 19 / §45)
                      </h2>
                      <CalculationModalActions
                        title="Lease Renewal Calculation"
                        contentId="lease-renewal-calculation-content"
                        onClose={() => setRenCalcOpen(false)}
                      />
                    </div>
                    <div id="lease-renewal-calculation-content" className="flex-1 p-8 font-mono text-sm leading-relaxed text-green-300 max-w-4xl mx-auto w-full space-y-6">
                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 1: Current Balances ═══</p>
                        <p>Current Lease Liability: <span className="text-cyan-300">{fmt(renPreview.summary.current_liability)} {renPreview.summary.currency as string}</span></p>
                        <p>Current ROU NBV: <span className="text-cyan-300">{fmt(renPreview.summary.current_rou_nbv)} {renPreview.summary.currency as string}</span></p>
                        <p>Old Expiry Date: <span className="text-white">{fmtDate(renPreview.summary.old_expiry_date)}</span></p>
                        <p>New Expiry Date: <span className="text-white">{fmtDate(renPreview.summary.new_expiry_date)}</span></p>
                        <p>New Term: <span className="text-white">{String(renPreview.summary.new_term_months)} months</span></p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 2: Remeasure Lease Liability ═══</p>
                        <p>New Monthly Payment: <span className="text-cyan-300">{fmt(renPreview.summary.new_monthly_payment ?? parseFloat(renPayment))} {renPreview.summary.currency as string}</span></p>
                        <p>IBR Used: <span className="text-cyan-300">{renPreview.summary.ibr_used ? `${(Number(renPreview.summary.ibr_used) * 100).toFixed(4)}%` : '—'}</span></p>
                        <p className="mt-2">New PV = PMT × [(1 − (1 + r)^(−n)) / r]</p>
                        <p className="ml-4">where PMT = {fmt(renPreview.summary.new_monthly_payment ?? parseFloat(renPayment))}, r = monthly rate, n = {String(renPreview.summary.new_term_months)} months</p>
                        <p className="ml-4 text-white font-bold">= {fmt(renPreview.summary.new_pv)} {renPreview.summary.currency as string}</p>
                        <p className="mt-2">Liability Delta = New PV − Current Liability</p>
                        <p className="ml-4">= {fmt(renPreview.summary.new_pv)} − {fmt(renPreview.summary.current_liability)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(renPreview.summary.liability_delta)} {renPreview.summary.currency as string}</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 3: Adjust ROU Asset ═══</p>
                        <p>Per IFRS 16 Para 45: Adjust ROU by the same amount as the liability remeasurement (no P&L impact)</p>
                        <p>New ROU NBV = Current ROU NBV + Liability Delta</p>
                        <p className="ml-4">= {fmt(renPreview.summary.current_rou_nbv)} + {fmt(renPreview.summary.liability_delta)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(renPreview.summary.new_rou_nbv)} {renPreview.summary.currency as string}</p>
                        <p className="mt-2">New Monthly Depreciation = New ROU NBV / New Term</p>
                        <p className="ml-4">= {fmt(renPreview.summary.new_rou_nbv)} / {String(renPreview.summary.new_term_months)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(renPreview.summary.new_monthly_depreciation ?? (Number(renPreview.summary.new_rou_nbv) / Number(renPreview.summary.new_term_months)))} per month</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 4: Journal Entry (JE-7) — Renewal ═══</p>
                        <table className="w-full text-xs mt-2">
                          <thead><tr className="text-gray-400"><th className="text-left py-1">Account</th><th className="text-right py-1">Debit</th><th className="text-right py-1">Credit</th></tr></thead>
                          <tbody className="text-green-300">
                            <tr><td className="py-1">Dr Right-of-Use Asset</td><td className="text-right">{fmt(renPreview.summary.liability_delta)}</td><td></td></tr>
                            <tr><td className="py-1">Cr Lease Liability</td><td></td><td className="text-right">{fmt(renPreview.summary.liability_delta)}</td></tr>
                          </tbody>
                        </table>
                        <p className="mt-3 text-gray-400 text-xs">Dr = Cr = Liability Delta (balance sheet only, no P&L impact)</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ IFRS 16 Reference ═══</p>
                        <p className="text-gray-300">Para 19: "A lessee shall determine the lease term as the non-cancellable period of a lease, together with periods covered by an option to extend the lease if the lessee is reasonably certain to exercise that option."</p>
                        <p className="text-gray-300 mt-2">Para 45: "A lessee shall remeasure the lease liability by discounting the revised lease payments using a revised discount rate... The lessee shall recognise the amount of the remeasurement of the lease liability as an adjustment to the right-of-use asset."</p>
                      </div>
                    </div>
                  </div>
                )}

                {posted && txnType === 'Renewal' ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">Renewal Posted Successfully</p>
                      <p className="text-xs text-muted-foreground mt-1">JE Reference: <span className="font-mono font-bold">{posted.je_ref}</span></p>
                      <p className="text-xs text-muted-foreground">{posted.je_label}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => {
                      setRenPayment(''); setRenExpiry(''); setRenIBR(''); setRenNotes('');
                      setRenCommDate(''); setRenEscalation(''); setRenDeposit('');
                    }}>
                      Reset Fields
                    </Button>
                    <Button onClick={() => setConfirmOpen(true)} disabled={!isPreviewReady || isPosting} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 text-sm">
                      {isPosting ? 'Posting…' : 'Post Renewal & Generate JE-7'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── PURCHASE TAB ── */}
              <TabsContent value="Purchase" className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                <div className="rounded-xl border border-blue-500/30 bg-card p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    <h3 className="text-base font-semibold">Purchase Option Exercise</h3>
                    <span className="text-xs text-muted-foreground ml-1">(IFRS 16 Para 26)</span>
                  </div>
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 mb-5">
                    <p className="text-xs text-blue-400 font-semibold flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Finance Lease Conversion</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Exercising the purchase option derecognises the lease liability and ROU asset, transfers the asset to Property, Plant & Equipment at its carrying amount, and records the purchase price payment. Any difference is recognised as gain/loss in P&L.
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-5">
                    <div>
                      <label className={labelCls}>Purchase Date *</label>
                      <Input type="date" className={inputCls} value={purDate} onChange={e => setPurDate(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Purchase Price *</label>
                      <Input className={inputCls} placeholder="e.g. 250000.00" value={purPrice} onChange={e => setPurPrice(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Notes / Reason</label>
                      <Input className={inputCls} placeholder="Purchase option exercise justification…" value={purNotes} onChange={e => setPurNotes(e.target.value)} />
                    </div>
                  </div>
                </div>

                {purFetching && <p className="text-sm text-muted-foreground animate-pulse px-1">Calculating purchase derecognition…</p>}
                {purPreview?.summary && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-blue-400">Purchase Derecognition Preview (IFRS 16 §26)</h4>
                      <button
                        onClick={() => setPurCalcOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold hover:bg-yellow-500/30 transition-colors"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Calc
                      </button>
                    </div>
                    <KPIRow items={[
                      { label: 'Lease Liability',       value: fmt(purPreview.summary.current_liability) },
                      { label: 'ROU Asset (Cost)',      value: fmt(purPreview.summary.rou_asset_cost) },
                      { label: 'Accum. Depreciation',   value: fmt(purPreview.summary.accumulated_depreciation) },
                      { label: 'ROU NBV',               value: fmt(purPreview.summary.current_rou_nbv) },
                      { label: 'Purchase Price',        value: fmt(purPreview.summary.purchase_price), highlight: true },
                      { label: 'Owned Asset Value',     value: fmt(purPreview.summary.owned_asset_value), highlight: true },
                      { label: 'Gain / Loss',           value: fmt(purPreview.summary.gain_loss), highlight: true },
                      { label: 'Type',                  value: String(purPreview.summary.gain_loss_type ?? '—') },
                    ]} />
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Journal Entry Preview — Purchase Option</h4>
                      <JETable lines={purPreview.jeLines} />
                    </div>
                  </div>
                )}

                {/* ── Purchase Calc Explanation Modal (full-screen blackboard) ── */}
                {purCalcOpen && purPreview?.summary && (
                  <div className="fixed inset-0 z-[9999] bg-gray-950/98 flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
                      <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        Calculation Explanation — Purchase Option (IFRS 16 Para 26)
                      </h2>
                      <CalculationModalActions
                        title="Purchase Option Calculation"
                        contentId="purchase-option-calculation-content"
                        onClose={() => setPurCalcOpen(false)}
                      />
                    </div>
                    <div id="purchase-option-calculation-content" className="flex-1 p-8 font-mono text-sm leading-relaxed text-green-300 max-w-4xl mx-auto w-full space-y-6">
                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 1: Identify Balances at Purchase Date ═══</p>
                        <p>Purchase Date: <span className="text-white">{purDate}</span></p>
                        <p>Remaining Lease Liability: <span className="text-cyan-300">{fmt(purPreview.summary.current_liability)} {purPreview.summary.currency as string}</span></p>
                        <p>ROU Asset (original cost): <span className="text-cyan-300">{fmt(purPreview.summary.rou_asset_cost)} {purPreview.summary.currency as string}</span></p>
                        <p>Accumulated Depreciation: <span className="text-cyan-300">{fmt(purPreview.summary.accumulated_depreciation)} {purPreview.summary.currency as string}</span></p>
                        <p>ROU Net Book Value = Cost − Accum. Depr</p>
                        <p className="ml-4">= {fmt(purPreview.summary.rou_asset_cost)} − {fmt(purPreview.summary.accumulated_depreciation)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(purPreview.summary.current_rou_nbv)} {purPreview.summary.currency as string}</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 2: Determine Owned Asset Value ═══</p>
                        <p>Per IFRS 16 Para 26: The owned asset is recognised at the ROU carrying amount (NBV)</p>
                        <p>Owned Asset Value = ROU NBV = <span className="text-white font-bold">{fmt(purPreview.summary.owned_asset_value)} {purPreview.summary.currency as string}</span></p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 3: Calculate Gain/Loss ═══</p>
                        <p>Gain/Loss = Lease Liability − Purchase Price</p>
                        <p className="ml-4">= {fmt(purPreview.summary.current_liability)} − {fmt(purPreview.summary.purchase_price)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(purPreview.summary.gain_loss)} ({purPreview.summary.gain_loss_type as string})</p>
                        <p className="mt-2 text-gray-400 text-xs">If Liability {'>'} Purchase Price → Gain (we owed more than we paid)</p>
                        <p className="text-gray-400 text-xs">If Liability {'<'} Purchase Price → Loss (we paid more than we owed)</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 4: Journal Entry — Purchase Option Exercise ═══</p>
                        <table className="w-full text-xs mt-2">
                          <thead><tr className="text-gray-400"><th className="text-left py-1">Account</th><th className="text-right py-1">Debit</th><th className="text-right py-1">Credit</th></tr></thead>
                          <tbody className="text-green-300">
                            <tr><td className="py-1">Dr Property, Plant & Equipment</td><td className="text-right">{fmt(purPreview.summary.owned_asset_value)}</td><td></td></tr>
                            <tr><td className="py-1">Dr Accum. Depreciation — ROU</td><td className="text-right">{fmt(purPreview.summary.accumulated_depreciation)}</td><td></td></tr>
                            <tr><td className="py-1">Dr Lease Liability</td><td className="text-right">{fmt(purPreview.summary.current_liability)}</td><td></td></tr>
                            <tr><td className="py-1">Cr Right-of-Use Asset</td><td></td><td className="text-right">{fmt(purPreview.summary.rou_asset_cost)}</td></tr>
                            <tr><td className="py-1">Cr Cash / Bank</td><td></td><td className="text-right">{fmt(purPreview.summary.purchase_price)}</td></tr>
                            {Number(purPreview.summary.gain_loss) !== 0 && (
                              <tr><td className="py-1">{Number(purPreview.summary.gain_loss) >= 0 ? 'Cr' : 'Dr'} Gain/Loss on Purchase</td>
                                {Number(purPreview.summary.gain_loss) < 0 ? <><td className="text-right">{fmt(Math.abs(Number(purPreview.summary.gain_loss)))}</td><td></td></> : <><td></td><td className="text-right">{fmt(purPreview.summary.gain_loss)}</td></>}
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ IFRS 16 Reference ═══</p>
                        <p className="text-gray-300">Para 26: "If the lease transfers ownership of the underlying asset to the lessee by the end of the lease term or if the cost of the right-of-use asset reflects that the lessee will exercise a purchase option, the lessee shall depreciate the right-of-use asset from the commencement date to the end of the useful life of the underlying asset."</p>
                      </div>
                    </div>
                  </div>
                )}

                {posted && txnType === 'Purchase' ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">Purchase Option Exercised Successfully</p>
                      <p className="text-xs text-muted-foreground mt-1">JE Reference: <span className="font-mono font-bold">{posted.je_ref}</span></p>
                      <p className="text-xs text-muted-foreground">{posted.je_label}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button onClick={() => setConfirmOpen(true)} disabled={!isPreviewReady || isPosting} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 text-sm">
                      {isPosting ? 'Posting…' : 'Exercise Purchase Option'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── EXTENSION TAB ── */}
              <TabsContent value="Extension" className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                <div className="rounded-xl border border-amber-500/30 bg-card p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Plus className="w-4 h-4 text-amber-400" />
                    <h3 className="text-base font-semibold">Lease Extension (IBR Remeasurement)</h3>
                    <span className="text-xs text-muted-foreground ml-1">(IFRS 16 Para 45 — same as Modification)</span>
                  </div>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mb-5">
                    <p className="text-xs text-amber-400 font-semibold flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Remeasurement at New IBR</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Extension is treated as a lease modification under IFRS 16 Para 45. The lease liability is remeasured by discounting revised lease payments using a revised discount rate. The ROU asset is adjusted by the same amount (no P&L impact for increases).
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-5">
                    <div>
                      <label className={labelCls}>Effective Date *</label>
                      <Input type="date" className={inputCls} value={extDate} onChange={e => setExtDate(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>New Monthly Payment *</label>
                      <Input className={inputCls} placeholder="e.g. 12000.00" value={extPayment} onChange={e => setExtPayment(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>New IBR (Discount Rate)</label>
                      <Input className={inputCls} placeholder="e.g. 0.0550" value={extIBR} onChange={e => setExtIBR(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Notes</label>
                      <Input className={inputCls} placeholder="Extension justification…" value={extNotes} onChange={e => setExtNotes(e.target.value)} />
                    </div>
                  </div>
                </div>

                {extFetching && <p className="text-sm text-muted-foreground animate-pulse px-1">Calculating extension remeasurement…</p>}
                {extPreview?.summary && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-amber-400">
                        {extPreview.summary.is_decrease ? 'Partial Termination Preview (IFRS 16 Para 46a) — Rent Decrease' : 'Extension Preview (IFRS 16 Para 45) — Remeasurement'}
                      </h4>
                      <button
                        onClick={() => setExtCalcOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold hover:bg-yellow-500/30 transition-colors"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Calc
                      </button>
                    </div>
                    <KPIRow items={[
                      { label: 'Current Liability',     value: fmt(extPreview.summary.current_liability) },
                      { label: 'New PV',                value: fmt(extPreview.summary.new_pv), highlight: true },
                      { label: 'Liability Δ',           value: fmt(extPreview.summary.liability_delta), highlight: true },
                      { label: 'Current ROU NBV',       value: fmt(extPreview.summary.current_rou_nbv) },
                      { label: 'New ROU NBV',           value: fmt(extPreview.summary.new_rou_nbv), highlight: true },
                      { label: 'Remeasurement G/L',     value: fmt(extPreview.summary.remeasurement_gain_loss) },
                      { label: 'IBR Used',              value: extPreview.summary.ibr_used ? `${(Number(extPreview.summary.ibr_used) * 100).toFixed(4)}%` : '—' },
                      { label: 'New Depr/Month',        value: fmt(extPreview.summary.new_monthly_depreciation) },
                    ]} />
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Journal Entry Preview (JE-4)</h4>
                      <JETable lines={extPreview.jeLines} />
                    </div>
                    {extPreview.schedule?.length > 0 && <SchedulePreview rows={extPreview.schedule} />}
                  </div>
                )}

                {/* ── Extension Calc Explanation Modal (full-screen blackboard) ── */}
                {extCalcOpen && extPreview?.summary && (
                  <div className="fixed inset-0 z-[9999] bg-gray-950/98 flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
                      <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        Calculation Explanation — Lease Extension ({extPreview.summary.is_decrease ? 'IFRS 16 Para 46a — Partial Termination' : 'IFRS 16 Para 45 — Remeasurement'})
                      </h2>
                      <CalculationModalActions
                        title="Lease Extension Calculation"
                        contentId="lease-extension-calculation-content"
                        onClose={() => setExtCalcOpen(false)}
                      />
                    </div>
                    <div id="lease-extension-calculation-content" className="flex-1 p-8 font-mono text-sm leading-relaxed text-green-300 max-w-4xl mx-auto w-full space-y-6">
                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 1: Current Balances ═══</p>
                        <p>Effective Date: <span className="text-white">{extDate}</span></p>
                        <p>Current Lease Liability: <span className="text-cyan-300">{fmt(extPreview.summary.current_liability)} {extPreview.summary.currency as string}</span></p>
                        <p>Current ROU NBV: <span className="text-cyan-300">{fmt(extPreview.summary.current_rou_nbv)} {extPreview.summary.currency as string}</span></p>
                        <p>New Monthly Payment: <span className="text-cyan-300">{fmt(extPreview.summary.new_monthly_payment)} {extPreview.summary.currency as string}</span></p>
                        <p>IBR Used: <span className="text-cyan-300">{extPreview.summary.ibr_used ? `${(Number(extPreview.summary.ibr_used) * 100).toFixed(4)}%` : '—'}</span></p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 2: Remeasure Lease Liability ═══</p>
                        <p>New PV = PMT × [(1 − (1 + r)^(−n)) / r]</p>
                        <p className="ml-4">= {fmt(extPreview.summary.new_monthly_payment)} × PV annuity factor</p>
                        <p className="ml-4 text-white font-bold">= {fmt(extPreview.summary.new_pv)} {extPreview.summary.currency as string}</p>
                        <p className="mt-2">Liability Delta = New PV − Current Liability</p>
                        <p className="ml-4">= {fmt(extPreview.summary.new_pv)} − {fmt(extPreview.summary.current_liability)}</p>
                        <p className="ml-4 text-white font-bold">= {fmt(extPreview.summary.liability_delta)} {extPreview.summary.currency as string}</p>
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ STEP 3: Adjust ROU Asset ═══</p>
                        {extPreview.summary.is_decrease ? (
                          <>
                            <p>Proportional Ratio = New PV / Current Liability = {fmt(extPreview.summary.new_pv)} / {fmt(extPreview.summary.current_liability)} = {extPreview.summary.proportional_ratio ? Number(extPreview.summary.proportional_ratio).toFixed(6) : '—'}</p>
                            <p>ROU Reduction = Current ROU NBV × (1 − Ratio)</p>
                            <p className="ml-4 text-white font-bold">New ROU NBV = {fmt(extPreview.summary.new_rou_nbv)}</p>
                            <p className="mt-2">Remeasurement G/L = Liability Reduction − ROU Reduction (recognised in P&L)</p>
                            <p className="ml-4 text-white font-bold">= {fmt(extPreview.summary.remeasurement_gain_loss)}</p>
                          </>
                        ) : (
                          <>
                            <p>ROU Adjustment = Liability Delta (no P&L impact for increases)</p>
                            <p>New ROU NBV = Current ROU NBV + Liability Delta</p>
                            <p className="ml-4">= {fmt(extPreview.summary.current_rou_nbv)} + {fmt(extPreview.summary.liability_delta)}</p>
                            <p className="ml-4 text-white font-bold">= {fmt(extPreview.summary.new_rou_nbv)} {extPreview.summary.currency as string}</p>
                          </>
                        )}
                      </div>

                      <div className="border border-gray-700 rounded-lg p-5 bg-gray-900/50">
                        <p className="text-yellow-400 font-bold mb-3">═══ IFRS 16 Reference ═══</p>
                        <p className="text-gray-300">Para 45: "A lessee shall remeasure the lease liability by discounting the revised lease payments using a revised discount rate... The lessee shall recognise the amount of the remeasurement of the lease liability as an adjustment to the right-of-use asset."</p>
                      </div>
                    </div>
                  </div>
                )}

                {posted && txnType === 'Extension' ? (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-400">Extension Posted Successfully</p>
                      <p className="text-xs text-muted-foreground mt-1">JE Reference: <span className="font-mono font-bold">{posted.je_ref}</span></p>
                      <p className="text-xs text-muted-foreground">{posted.je_label}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button onClick={() => setConfirmOpen(true)} disabled={!isPreviewReady || isPosting} className="bg-amber-600 hover:bg-amber-700 text-white px-8 py-2.5 text-sm">
                      {isPosting ? 'Posting…' : 'Post Extension & Generate JE-4'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── OPTIONS & BREAKS TAB ── */}
              <TabsContent value="OptionsBreaks" className="flex-1 overflow-y-auto px-6 py-6">
                <OptionsBreaksPanel
                  contractId={selected.contract_id}
                  onExerciseOption={handleExerciseOption}
                  onExerciseBreak={handleExerciseBreak}
                />
              </TabsContent>

              {/* ── TRANSACTION HISTORY & GL LEDGER TAB ── */}
              <TabsContent value="History" className="flex-1 overflow-y-auto px-6 py-6">
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-primary" />
                      <h3 className="text-base font-semibold">Transaction History & GL Ledger</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/accounting/journal-voucher?contract_id=${selected.contract_id}`)}
                        className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 gap-1.5"
                        title="View all Journal Vouchers for this lease in the JV Register"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View JVs for this Lease
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => utils.lease.getLeaseTransactionHistory.invalidate({ contractId: selectedId! })}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                      </Button>
                    </div>
                  </div>
                  <TransactionHistoryPanel contractId={selected.contract_id} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Inline Confirm Banner */}
      {confirmOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-500/40 bg-card px-6 py-4 flex items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">Confirm {txnType}</p>
              <p className="text-xs text-muted-foreground">
                {txnType === 'Termination'
                  ? 'This will permanently derecognise the ROU asset and lease liability and cannot be undone.'
                  : txnType === 'Purchase'
                  ? 'This will derecognise the lease liability and ROU asset, transfer to PP&E, and record the purchase payment.'
                  : `This will post the ${txnType.toLowerCase()} JE and regenerate the amortisation schedule.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handlePost}
              className={txnType === 'Termination' ? 'bg-red-600 hover:bg-red-700 text-white' : txnType === 'Renewal' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : txnType === 'Purchase' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}>
              Post Transaction
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
