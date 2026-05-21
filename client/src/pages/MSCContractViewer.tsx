import { useLocation } from "wouter";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, ArrowLeft, Car, Home, Link2, PlusCircle , Pencil, Trash2} from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";

const MOCK_CONTRACT = {
  msc_id: 1,
  msc_ref: "MSC-2024-001",
  contract_type: "FLEET",
  title_en: "Master Fleet Lease Agreement",
  title_ar: "اتفاقية الإيجار الرئيسية للأسطول",
  party_a_en: "Vodafone Qatar LLC",
  party_a_ar: "شركة فودافون الإمارات ذ.م.م",
  party_b_en: "Emirates Fleet Solutions LLC",
  party_b_ar: "شركة حلول الأسطول الإماراتية ذ.م.م",
  effective_date: "01 January 2024",
  effective_date_ar: "١ يناير ٢٠٢٤",
  expiry_date: "31 December 2026",
  expiry_date_ar: "٣١ ديسمبر ٢٠٢٦",
  contract_value: 2400000,
  currency: "QAR",
  status: "ACTIVE",
  scope_en: "This Agreement governs the lease of the entire vehicle fleet as detailed in Schedule A, including all sedans, SUVs, vans, and light commercial vehicles assigned to Vodafone Qatar LLC employees and operations. The Lessor shall maintain all vehicles in roadworthy condition and provide replacement vehicles within 24 hours of any breakdown.",
  scope_ar: "تحكم هذه الاتفاقية تأجير أسطول المركبات بالكامل كما هو مفصل في الجدول (أ)، بما في ذلك جميع السيارات السيدان وسيارات الدفع الرباعي والشاحنات الصغيرة والمركبات التجارية الخفيفة المخصصة لموظفي وعمليات شركة فودافون الإمارات. يلتزم المؤجر بالحفاظ على جميع المركبات في حالة صالحة للسير على الطريق وتوفير مركبات بديلة خلال 24 ساعة من أي عطل.",
  payment_terms_en: "Monthly lease payments are due on the 1st of each calendar month, payable in advance. Late payments shall attract a penalty of 2% per month on the outstanding amount. All payments shall be made by bank transfer to the account designated by the Lessor.",
  payment_terms_ar: "تستحق مدفوعات الإيجار الشهرية في اليوم الأول من كل شهر ميلادي، وتُدفع مقدماً. تستحق المدفوعات المتأخرة غرامة بنسبة 2٪ شهرياً على المبلغ المستحق. تُسدَّد جميع المدفوعات عن طريق التحويل المصرفي إلى الحساب الذي يحدده المؤجر.",
  governing_law_en: "This Agreement shall be governed by and construed in accordance with the laws of the United Arab Emirates.",
  governing_law_ar: "تخضع هذه الاتفاقية وتُفسَّر وفقاً لقوانين دولة الإمارات العربية المتحدة.",
  jurisdiction_en: "Any dispute arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the Doha Courts.",
  jurisdiction_ar: "يخضع أي نزاع ينشأ عن هذه الاتفاقية أو يتعلق بها للاختصاص القضائي الحصري لمحاكم دبي.",
  termination_en: "Either party may terminate this Agreement by providing thirty (30) days written notice to the other party. Termination for cause may be effected immediately upon written notice if the other party materially breaches this Agreement and fails to remedy such breach within fifteen (15) days of receiving notice thereof.",
  termination_ar: "يجوز لأي من الطرفين إنهاء هذه الاتفاقية بتقديم إشعار كتابي مدته ثلاثون (30) يوماً للطرف الآخر. يجوز الإنهاء لسبب مشروع فوراً عند تسلم إشعار كتابي إذا أخل الطرف الآخر إخلالاً جوهرياً بهذه الاتفاقية وأخفق في معالجة هذا الإخلال خلال خمسة عشر (15) يوماً من تسلم الإشعار.",
  warranties_en: "The Lessor warrants that all vehicles are in good working order, properly registered, and fully insured at the commencement of the lease term. The Lessor shall maintain comprehensive insurance coverage throughout the term of this Agreement.",
  warranties_ar: "يضمن المؤجر أن جميع المركبات في حالة عمل جيدة ومسجلة بشكل صحيح ومؤمنة بالكامل عند بدء مدة الإيجار. يحتفظ المؤجر بتغطية تأمينية شاملة طوال مدة هذه الاتفاقية.",
  signed_by_en: "Ahmed Al Rashidi — Chief Financial Officer",
  signed_by_ar: "أحمد الراشدي — المدير المالي",
  witness_en: "Sara Mohammed — Legal Counsel",
  witness_ar: "سارة محمد — المستشار القانوني",
};

const MOCK_ASSETS = [
  { link_id: 1, asset_type: "VEHICLE", asset_ref: "VEH-001", asset_description: "Toyota Camry 2024", make_model: "Toyota Camry", plate_vin: "Doha A 12345", location: "Doha HQ" },
  { link_id: 2, asset_type: "VEHICLE", asset_ref: "VEH-002", asset_description: "Nissan Patrol 2024", make_model: "Nissan Patrol", plate_vin: "Doha B 67890", location: "Doha Office" },
  { link_id: 3, asset_type: "VEHICLE", asset_ref: "VEH-003", asset_description: "Ford Transit Van 2023", make_model: "Ford Transit", plate_vin: "Sharjah C 11223", location: "Sharjah Warehouse" },
  { link_id: 4, asset_type: "VEHICLE", asset_ref: "VEH-004", asset_description: "Toyota Land Cruiser 2024", make_model: "Toyota Land Cruiser", plate_vin: "Doha D 44556", location: "Doha HQ" },
];

export default function MSCContractViewer() {
  const utils = trpc.useUtils();
  const activateMut = trpc.masterContracts.activate.useMutation({
    onSuccess: () => { utils.masterContracts.list.invalidate(); toast.success("Contract activated"); },
    onError: (e: any) => toast.error(e.message),
  });
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [, navigate] = useLocation();
  const c = MOCK_CONTRACT;

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      {/* Screen controls — hidden on print */}
      <div className="p-6 space-y-4 print:hidden">
        <ScreenHeader
          screenId="VFLMSCVWR0001P001"
          title="Contract Viewer"
          subtitle="Bilingual EN/AR contract document viewer and print"
        
          screenType="msc_contract_viewer"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/contracts/msc")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Register
            </Button>
            <div>
              <h1 className="text-xl font-bold">{c.msc_ref}</h1>
              <p className="text-sm text-muted-foreground">{c.title_en}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toast.info("Feature coming soon")}>
              <PlusCircle className="w-4 h-4 mr-2" /> Link Asset
            </Button>
            <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" /> Print Contract
            </Button>
          </div>
        </div>

        {/* Attribute summary table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <h2 className="text-sm font-semibold">Contract Attributes</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-border text-sm">
            {[
              { label: "Contract Ref", value: c.msc_ref },
              { label: "Type", value: c.contract_type },
              { label: "Status", value: <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{c.status}</Badge> },
              { label: "Currency", value: c.currency },
              { label: "Effective Date", value: c.effective_date },
              { label: "Expiry Date", value: c.expiry_date },
              { label: "Contract Value", value: `QAR ${c.contract_value.toLocaleString()}` },
              { label: "Linked Assets", value: MOCK_ASSETS.length },
              { label: "Party A (EN)", value: c.party_a_en },
              { label: "Party A (AR)", value: <span dir="rtl">{c.party_a_ar}</span> },
              { label: "Party B (EN)", value: c.party_b_en },
              { label: "Party B (AR)", value: <span dir="rtl">{c.party_b_ar}</span> },
              { label: "Governing Law (EN)", value: c.governing_law_en },
              { label: "Governing Law (AR)", value: <span dir="rtl">{c.governing_law_ar}</span> },
              { label: "Signed By (EN)", value: c.signed_by_en },
              { label: "Signed By (AR)", value: <span dir="rtl">{c.signed_by_ar}</span> },
            ].map((row, i) => (
              <div key={i} className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">{row.label}</p>
                <p className="font-medium">{row.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Linked Assets */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/50 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold">Linked Assets / Fleet ({MOCK_ASSETS.length})</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs">Asset Ref</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs">Make / Model</TableHead>
                <TableHead className="text-xs">Plate / VIN</TableHead>
                <TableHead className="text-xs">Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_ASSETS.map(a => (
                <TableRow key={a.link_id} className="text-sm hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{a.asset_ref}</TableCell>
                  <TableCell>
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                      {a.asset_type === "VEHICLE" ? <><Car className="w-3 h-3 mr-1 inline" />Vehicle</> : <><Home className="w-3 h-3 mr-1 inline" />Home</>}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.asset_description}</TableCell>
                  <TableCell className="text-xs">{a.make_model}</TableCell>
                  <TableCell className="font-mono text-xs">{a.plate_vin}</TableCell>
                  <TableCell className="text-xs">{a.location}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-400" onClick={() => toast("Remove this asset?", { action: { label: "Remove", onClick: () => toast.success("Asset removed") } })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PRINTABLE A4 PORTRAIT BILINGUAL CONTRACT
          This section is ONLY visible when printing (print:block, screen:hidden)
          Left column: English (LTR) | Right column: Arabic (RTL)
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden print:block">
        <style>{`
          @page { size: A4 portrait; margin: 20mm 15mm; }
          @media print {
            body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; background: #fff; }
            .contract-page { width: 100%; }
            .col-en { width: 48%; float: left; text-align: left; direction: ltr; }
            .col-ar { width: 48%; float: right; text-align: right; direction: rtl; font-family: 'Arial', sans-serif; }
            .col-divider { width: 4%; float: left; border-left: 1px solid #ccc; height: 100%; }
            .section { margin-bottom: 16pt; page-break-inside: avoid; }
            .section-title { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5pt; border-bottom: 1pt solid #000; padding-bottom: 3pt; margin-bottom: 6pt; }
            .clearfix::after { content: ""; display: table; clear: both; }
            h1.contract-title { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 4pt; }
            .contract-ref { font-size: 10pt; text-align: center; color: #555; margin-bottom: 16pt; }
            .sig-block { margin-top: 8pt; }
            .sig-line { border-top: 1pt solid #000; margin-top: 32pt; padding-top: 4pt; font-size: 9pt; }
            .header-logo { text-align: center; margin-bottom: 12pt; }
            .header-logo span { font-size: 18pt; font-weight: bold; color: #e60000; }
          }
        `}</style>

        <div className="contract-page">
          {/* Logo & Title */}
          <div className="header-logo">
            <span>Vodafone</span>
          </div>
          <h1 className="contract-title">{c.title_en} / {c.title_ar}</h1>
          <div className="contract-ref">{c.msc_ref} &nbsp;|&nbsp; {c.effective_date} – {c.expiry_date}</div>

          {/* ── Section 1: Parties ── */}
          <div className="section clearfix">
            <div className="col-en">
              <div className="section-title">1. Parties</div>
              <p><strong>Party A (Lessee):</strong> {c.party_a_en}</p>
              <p><strong>Party B (Lessor):</strong> {c.party_b_en}</p>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">١. الأطراف</div>
              <p><strong>الطرف الأول (المستأجر):</strong> {c.party_a_ar}</p>
              <p><strong>الطرف الثاني (المؤجر):</strong> {c.party_b_ar}</p>
            </div>
          </div>

          {/* ── Section 2: Term & Value ── */}
          <div className="section clearfix">
            <div className="col-en">
              <div className="section-title">2. Term &amp; Contract Value</div>
              <p><strong>Effective Date:</strong> {c.effective_date}</p>
              <p><strong>Expiry Date:</strong> {c.expiry_date}</p>
              <p><strong>Total Contract Value:</strong> {c.currency} {c.contract_value.toLocaleString()}</p>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">٢. المدة وقيمة العقد</div>
              <p><strong>تاريخ السريان:</strong> {c.effective_date_ar}</p>
              <p><strong>تاريخ الانتهاء:</strong> {c.expiry_date_ar}</p>
              <p><strong>إجمالي قيمة العقد:</strong> {c.currency} {c.contract_value.toLocaleString()}</p>
            </div>
          </div>

          {/* ── Section 3: Scope ── */}
          <div className="section clearfix">
            <div className="col-en">
              <div className="section-title">3. Scope of Services</div>
              <p>{c.scope_en}</p>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">٣. نطاق الخدمات</div>
              <p>{c.scope_ar}</p>
            </div>
          </div>

          {/* ── Section 4: Payment Terms ── */}
          <div className="section clearfix">
            <div className="col-en">
              <div className="section-title">4. Payment Terms</div>
              <p>{c.payment_terms_en}</p>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">٤. شروط الدفع</div>
              <p>{c.payment_terms_ar}</p>
            </div>
          </div>

          {/* ── Section 5: Warranties ── */}
          <div className="section clearfix">
            <div className="col-en">
              <div className="section-title">5. Warranties</div>
              <p>{c.warranties_en}</p>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">٥. الضمانات</div>
              <p>{c.warranties_ar}</p>
            </div>
          </div>

          {/* ── Section 6: Termination ── */}
          <div className="section clearfix">
            <div className="col-en">
              <div className="section-title">6. Termination</div>
              <p>{c.termination_en}</p>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">٦. الإنهاء</div>
              <p>{c.termination_ar}</p>
            </div>
          </div>

          {/* ── Section 7: Governing Law & Jurisdiction ── */}
          <div className="section clearfix">
            <div className="col-en">
              <div className="section-title">7. Governing Law &amp; Jurisdiction</div>
              <p>{c.governing_law_en}</p>
              <p>{c.jurisdiction_en}</p>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">٧. القانون الحاكم والاختصاص القضائي</div>
              <p>{c.governing_law_ar}</p>
              <p>{c.jurisdiction_ar}</p>
            </div>
          </div>

          {/* ── Schedule A: Linked Assets ── */}
          <div className="section">
            <div className="section-title">Schedule A / الجدول أ — Linked Assets / الأصول المرتبطة</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
              <thead>
                <tr style={{ borderBottom: "1pt solid #000", backgroundColor: "#f5f5f5" }}>
                  <th style={{ padding: "4pt", textAlign: "left" }}>Ref</th>
                  <th style={{ padding: "4pt", textAlign: "left" }}>Description</th>
                  <th style={{ padding: "4pt", textAlign: "left" }}>Make / Model</th>
                  <th style={{ padding: "4pt", textAlign: "left" }}>Plate / VIN</th>
                  <th style={{ padding: "4pt", textAlign: "left" }}>Location</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_ASSETS.map((a, i) => (
                  <tr key={a.link_id} style={{ borderBottom: "0.5pt solid #ddd", backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "3pt 4pt" }}>{a.asset_ref}</td>
                    <td style={{ padding: "3pt 4pt" }}>{a.asset_description}</td>
                    <td style={{ padding: "3pt 4pt" }}>{a.make_model}</td>
                    <td style={{ padding: "3pt 4pt" }}>{a.plate_vin}</td>
                    <td style={{ padding: "3pt 4pt" }}>{a.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Signature Block ── */}
          <div className="section clearfix" style={{ marginTop: "24pt" }}>
            <div className="col-en">
              <div className="section-title">Signatures / التوقيعات</div>
              <div className="sig-block">
                <p><strong>For and on behalf of Party A:</strong></p>
                <div className="sig-line">{c.signed_by_en}</div>
              </div>
              <div className="sig-block" style={{ marginTop: "16pt" }}>
                <p><strong>Witness:</strong></p>
                <div className="sig-line">{c.witness_en}</div>
              </div>
            </div>
            <div className="col-divider" />
            <div className="col-ar">
              <div className="section-title">التوقيعات</div>
              <div className="sig-block">
                <p><strong>نيابةً عن الطرف الأول:</strong></p>
                <div className="sig-line">{c.signed_by_ar}</div>
              </div>
              <div className="sig-block" style={{ marginTop: "16pt" }}>
                <p><strong>الشاهد:</strong></p>
                <div className="sig-line">{c.witness_ar}</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: "24pt", borderTop: "1pt solid #ccc", paddingTop: "6pt", fontSize: "8pt", color: "#666", textAlign: "center" }}>
            {c.msc_ref} · Generated by VodaLease Enterprise · Confidential
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
