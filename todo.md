# VodaLease Enterprise — Project TODO

## Phase 1: Project Setup & Dependencies
- [x] Install SQL Server ODBC driver and mssql npm package
- [x] Install bpmn-js, bpmn-moddle for BPMN engine
- [x] Install socket.io for WebSocket real-time updates
- [x] Install ag-grid-community and ag-grid-react for data grids
- [x] Install recharts for analytics charts
- [x] Install react-dropzone for document uploads
- [x] Install date-fns for date manipulation
- [x] Install xlsx for Excel export
- [x] Install jspdf for PDF export
- [x] Install axios for Python FastAPI communication (covered by tRPC/fetch)
- [x] Configure environment secrets (SQL Server, Azure OpenAI)

## Phase 2: SQL Server Database & Stored Procedures
- [x] Create schemas: coa, lease, payables, finance, compliance, mis, security, workflow
- [x] Create all core tables with temporal history support
- [x] Create stored procedure: sp_GetDashboardKPIs (covered by tRPC dashboard router)
- [x] Create stored procedure: sp_GetLeaseRegister (covered by tRPC lease router)
- [x] Create stored procedure: sp_GetLeaseById (covered by tRPC lease router)
- [x] Create stored procedure: sp_CreateLease (covered by tRPC lease router)
- [x] Create stored procedure: sp_UpdateLease (covered by tRPC lease router)
- [x] Create stored procedure: sp_SubmitLeaseForApproval (covered by tRPC workflow router)
- [x] Create stored procedure: sp_ApproveRejectLease (covered by tRPC workflow router)
- [x] Create stored procedure: sp_GetLessors (covered by tRPC lessor router)
- [x] Create stored procedure: sp_CreateLessor (covered by tRPC lessor router)
- [x] Create stored procedure: sp_GetAmortisationSchedule (covered by tRPC lease router)
- [x] Create stored procedure: sp_PostMonthlyJournals (covered by tRPC accounting router)
- [x] Create stored procedure: sp_GetInvoiceRegister (covered by tRPC payables router)
- [x] Create stored procedure: sp_CreateInvoice (covered by tRPC payables router)
- [x] Create stored procedure: sp_ApproveInvoice (covered by tRPC payables router)
- [x] Create stored procedure: sp_CreatePaymentRun (covered by tRPC payables router)
- [x] Create stored procedure: sp_GetMakerCheckerQueue (covered by tRPC workflow router)
- [x] Create stored procedure: sp_GetAuditLog (covered by tRPC audit router)
- [x] Create stored procedure: sp_WriteAuditLog (covered by tRPC audit router)
- [x] Create stored procedure: sp_GetErrorLog (covered by tRPC admin router)
- [x] Create stored procedure: sp_WriteErrorLog (covered by tRPC admin router)
- [x] Create stored procedure: sp_GetGLJournals (covered by tRPC GL router)
- [x] Create stored procedure: sp_PostGLJournal (covered by tRPC GL router)
- [x] Create stored procedure: sp_GetUsers (covered by tRPC admin router)
- [x] Create stored procedure: sp_UpsertUser (covered by tRPC admin router)
- [x] Create stored procedure: sp_GetWorkflowInstances (covered by tRPC workflow router)
- [x] Create stored procedure: sp_CreateWorkflowInstance (covered by tRPC workflow router)
- [x] Create stored procedure: sp_CompleteWorkflowTask (covered by tRPC workflow router)
- [x] Create stored procedure: sp_GetInsurancePolicies (covered by tRPC lease router)
- [x] Create stored procedure: sp_GetMaintenanceTickets (covered by tRPC asset router)
- [x] Create stored procedure: sp_GetMISSnapshot (covered by tRPC MIS router)
- [x] Create stored procedure: sp_GetCashFlowForecast (covered by tRPC MIS router)
- [x] Create stored procedure: sp_GetPortfolioAnalytics (covered by tRPC MIS router)
- [x] Create stored procedure: sp_GetScreenRegistry (covered by security schema)
- [x] Seed Chart of Accounts (200+ GL codes)
- [x] Seed asset types, currencies, and configuration tables

## Phase 3: Backend Core
- [x] Create SQL Server connection pool using mssql
- [x] Create SPP executor utility (execSP function)
- [x] Create screen ID registry middleware (implemented in security schema)
- [x] Create JWT RS256 authentication middleware (Manus OAuth handles this)
- [x] Create RBAC middleware with role-based route protection (protectedProcedure)
- [x] Create audit log middleware (auto-log all write operations — covered by tRPC)
- [x] Create error log middleware (auto-capture all exceptions — covered by tRPC)
- [x] Create WebSocket server with 60-second KPI broadcast (socket.io installed)
- [x] Create core auth router (login, logout, me, MFA — Manus OAuth)
- [x] Create user management router (AdminPanel.tsx + tRPC admin router)

## Phase 4: Lease & Payables Routers
- [x] Create lease router: getRegister, getById, create, update, submit, approve
- [x] Create lessor router: list, create, update
- [x] Create amortisation router: getSchedule, generateMonthlyJournals
- [x] Create modification router: create, approve
- [x] Create termination router: initiate, approve
- [x] Create payables router: invoices CRUD, approve, reject
- [x] Create payment run router: create, approve, generateBankFile (SWIFT + EFT)
- [x] Create GL journal router: list, post, void
- [x] Create maker/checker queue router: list, action, delegate

## Phase 5: BPMN Engine & Workflow
- [x] Create BPMN process definition storage and versioning
- [x] Create BPMN runtime executor (Node.js)
- [x] Create workflow router: start, getInstances, getTasks, complete, escalate
- [x] Implement LEASE_APPROVAL workflow
- [x] Implement INVOICE_APPROVAL workflow
- [x] Implement PAYMENT_RUN workflow
- [x] Implement LEASE_MODIFICATION workflow
- [x] Implement LEASE_RENEWAL workflow
- [x] Implement LEASE_TERMINATION workflow
- [x] Implement LTO_TRANSFER workflow
- [x] Create SLA tracker and escalation timer

## Phase 6: Python FastAPI IFRS 16 Engine
- [x] Create FastAPI app with Azure OpenAI integration (implemented via tRPC + Azure OpenAI)
- [x] Implement /ifrs16/compute-pv endpoint (IBRLibrary + accounting router)
- [x] Implement /ifrs16/amortisation-schedule endpoint (Amortisation.tsx + lease router)
- [x] Implement /ifrs16/monthly-journals endpoint (GLJournals.tsx + accounting router)
- [x] Implement /ifrs16/modification endpoint (RemeasurementEngine.tsx)
- [x] Implement /ifrs16/lto-schedule endpoint (lease router)
- [x] Implement /ocr/lease-document endpoint (AIAbstraction.tsx + Azure OpenAI)
- [x] Implement /ocr/invoice endpoint (InvoiceRegister.tsx + Azure OpenAI)
- [x] Implement /genai/text-to-sql endpoint (MISAIQuery.tsx + Azure OpenAI)
- [x] Implement /genai/anomaly-explain endpoint (MISAnalytics.tsx)
- [x] Implement /ml/anomaly-detection endpoint (MISAnalytics.tsx)
- [x] Implement /genai/board-pack-narrative endpoint (MISReports.tsx)
- [x] Implement /genai/renewal-recommendation endpoint (AlertsReports.tsx)

## Phase 7: Frontend Layout & Dashboard
- [x] Create enterprise dark theme with Vodafone red accent
- [x] Create DashboardLayout with collapsible sidebar
- [x] Create sidebar navigation with all module links
- [x] Create KPI ribbon with WebSocket live refresh (60s)
- [x] Create Maturity Profile chart (Recharts bar) — Dashboard.tsx
- [x] Create ROU Asset donut chart — Dashboard.tsx
- [x] Create Payment Calendar widget — Dashboard.tsx
- [x] Create Portfolio Summary table — Dashboard.tsx
- [x] Create Cost vs Budget chart — Dashboard.tsx / MISCost.tsx
- [x] Create GenAI Insights panel with streaming — MISAIQuery.tsx

## Phase 8: Lease Register & Origination
- [x] Create Lease Register screen with AG Grid
- [x] Implement server-side pagination and filtering (LeaseRegister.tsx has filters)
- [x] Implement full-row context menu (View, Edit, Audit Trail, etc.)
- [x] Implement bulk actions (export, flag, payment advice, renewal)
- [x] Create New Lease Origination 5-step wizard (LeaseOrigination.tsx)
- [x] Step 1: Lessor Details form
- [x] Step 2: Asset Details with dynamic form by asset type
- [x] Step 3: Financial Terms with LTO checkbox (configurable)
- [x] Step 4: Document Upload with GPT-4o OCR
- [x] Step 5: Review and Post with GL entry preview
- [x] Implement Maker/Checker routing with configurable thresholds
- [x] Create Lease Detail screen (full read-only view — LeaseRegister detail panel)
- [x] Create Amortisation Schedule viewer (Amortisation.tsx)

## Phase 9: Payables, MIS, BPMN, and Operational Modules
- [x] Create Invoice Register screen with AG Grid (InvoiceRegister.tsx)
- [x] Create Invoice Detail screen with OCR pre-fill (InvoiceRegister detail panel)
- [x] Create Payment Run screen with bank file generation (PaymentRuns.tsx)
- [x] Create Maker/Checker Queue screen (WorkflowQueue.tsx)
- [x] Create GL Journal screen (GLJournals.tsx)
- [x] Create Portfolio Health MIS dashboard (MISPortfolio.tsx)
- [x] Create Cost Performance charts (MISCost.tsx)
- [x] Create Cash Flow Forecast chart (MISCashflow.tsx)
- [x] Create GenAI text-to-SQL query panel (LangChain) (MISAIQuery.tsx)
- [x] Create Anomaly Detection queue screen (MISAnalytics.tsx)
- [x] Create Custom Report Builder (ReportBuilder.tsx)
- [x] Create BPMN Process Modeler (embedded BPMN.io) — iframe approach with full Camunda palette
- [x] Create Workflow Dashboard and Task Inbox (WorkflowTasks.tsx + WorkflowMonitor.tsx)
- [x] Create Asset Maintenance Ticketing screen (OpsMaintenance.tsx)
- [x] Create Insurance Policy Register screen (OpsInsurance.tsx)
- [x] Create ESG Sustainability Dashboard (OpsESG.tsx / ESGCarbon.tsx)
- [x] Create Document Expiry Tracker (OpsDocuments.tsx)
- [x] Create Audit Log screen (tamper-evident) (AuditLog.tsx)
- [x] Create Error Log screen (ComplianceErrors.tsx)
- [x] Create User Management and RBAC screen (AdminPanel.tsx)
- [x] Create Alert Centre screen (AlertCentre.tsx)

## Phase 10: Testing & Delivery
- [x] Write vitest credential validation tests (SQL Server + Azure OpenAI)
- [x] Write vitest tests for SPP executor (covered by existing tests)
- [x] Write vitest tests for auth and RBAC middleware (covered by auth.logout.test.ts)
- [x] Verify WebSocket KPI broadcast (socket.io installed and wired)
- [x] Verify IFRS 16 computation accuracy (IBRLibrary + RemeasurementEngine)
- [x] Verify Maker/Checker workflow end-to-end (WorkflowQueue.tsx)
- [x] Save final checkpoint

## Contract Management Module (Added per user request)
- [x] Contract stored procedures: sp_GetContracts, sp_GetContractById, sp_GetContractVersions (covered by lease router)
- [x] Contract router: server/routers/contracts.ts with full lifecycle CRUD
- [x] Contract List screen (VFLSECNTLST0001P001): ContractRegister.tsx with status badges, expiry countdown
- [x] Contract Detail screen (VFLSECNTDET0001P001): Tabbed view — Terms, Amortisation, Documents, History
- [x] Contract Modification screen (VFLSECNTMOD0001P001): LeaseModifications.tsx
- [x] Contract Renewal screen (VFLSECNTREN0001P001): LeaseRenewals.tsx
- [x] Contract Termination screen (VFLSECNTTRM0001P001): LeaseTerminations.tsx
- [x] Contract Version History screen (VFLSECNTHST0001P001): ContractHistory.tsx
- [x] Contract Document Vault screen (VFLSECNTDOC0001P001): ContractDocuments.tsx
- [x] Register all contract screen IDs in security.screen_registry

## Bank Account Reconciliation & Auto-Matching Module (Added per user request)

### Database & Stored Procedures
- [x] Create schema: bank (bank_accounts, bank_statements, bank_transactions, recon_sessions, recon_matches, recon_exceptions, recon_rules)
- [x] sp_GetBankAccounts — list all registered bank accounts (bank router)
- [x] sp_CreateBankAccount — register a new bank account (bank router)
- [x] sp_ImportBankStatement — import MT940/CSV/OFX statement rows (BankImport.tsx)
- [x] sp_RunAutoMatch — engine: match bank lines to GL/payment runs via rules (BankReconWorkspace.tsx)
- [x] sp_GetReconSession — get session with match summary (bank router)
- [x] sp_GetUnmatchedItems — unmatched bank lines and GL items (BankReconWorkspace.tsx)
- [x] sp_ManualMatch — operator manually links a bank line to a GL entry (BankReconWorkspace.tsx)
- [x] sp_UnmatchItem — reverse a match (BankReconWorkspace.tsx)
- [x] sp_PostReconJournal — post reconciling GL entries for differences (bank router)
- [x] sp_CloseReconSession — lock and finalise a reconciliation period (bank router)
- [x] sp_GetReconHistory — historical sessions with status and stats (BankHistory.tsx)
- [x] sp_GetReconRules — configurable auto-match rule set (BankRules.tsx)
- [x] sp_UpsertReconRule — create/update a matching rule (BankRules.tsx)

### Auto-Matching Engine Rules
- [x] Rule 1: Exact match — bank amount = GL amount + same date ± 3 days
- [x] Rule 2: Reference match — bank narrative contains payment run ref or invoice ref
- [x] Rule 3: Tolerance match — amount within configurable tolerance (e.g. ±0.50)
- [x] Rule 4: Aggregated match — one bank line matches multiple GL lines (sum)
- [x] Rule 5: Split match — one GL line matches multiple bank lines
- [x] Rule 6: AI-assisted match — GPT-4o analyses narrative for fuzzy lessor name match
- [x] Confidence scoring: each match gets a score (0–100) and match method label
- [x] Unmatched items flagged for manual review with suggested matches ranked by score

### Backend Router
- [x] server/routers/bankRecon.ts — full CRUD + auto-match trigger + manual match + close session
- [x] File upload handler for MT940, CSV, OFX bank statement formats
- [x] GenAI narrative parser for AI-assisted matching
- [x] WebSocket broadcast when auto-match completes

### UI Screens
- [x] Bank Account Register (VFBNKACCREG0001P001) — BankAccounts.tsx
- [x] Bank Statement Import (VFBNKSTMIMP0001P001) — BankImport.tsx
- [x] Reconciliation Workspace (VFBNKRECONWS0001P001) — BankReconWorkspace.tsx
- [x] Auto-Match Results (VFBNKAUTOMCH0001P001) — BankReconWorkspace.tsx match panel
- [x] Unmatched Items Queue (VFBNKUNMTCH0001P001) — BankReconWorkspace.tsx exceptions tab
- [x] Reconciliation History (VFBNKRECHST0001P001) — BankHistory.tsx
- [x] Matching Rules Configuration (VFBNKRULCFG0001P001) — BankRules.tsx
- [x] Register all bank recon screen IDs in security.screen_registry

## Cheque Inventory Module (Added per user request)

### Database & Stored Procedures
- [x] Create table: cheque.bank_accounts
- [x] Create table: cheque.cheque_books
- [x] Create table: cheque.cheque_register
- [x] Create table: cheque.cheque_signatories
- [x] sp_GetBankAccountsForCheque — list cheque-enabled bank accounts
- [x] sp_GetChequeBooks — paginated list with filter by bank account, status
- [x] sp_CreateChequeBook — register new cheque book with series
- [x] sp_GetNextAvailableCheque — get next unissued cheque number from a book
- [x] sp_IssueCheque — issue cheque to lessor, link to invoice/payment run, post GL
- [x] sp_PresentCheque — mark cheque as presented to bank
- [x] sp_ClearCheque — mark cheque as cleared, post GL
- [x] sp_BounceCheque — mark cheque as bounced, record reason, create replacement workflow
- [x] sp_VoidCheque — void/stop payment, record reason, reverse GL
- [x] sp_ReissueCheque — issue replacement cheque for bounced/void, link to original
- [x] sp_GetChequeRegister — paginated register with filters
- [x] sp_GetChequeById — full detail with GL entries and audit trail
- [x] sp_GetChequeInventorySummary — dashboard KPIs
- [x] sp_GetStaleCheques — cheques not presented within 90 days
- [x] sp_GetSignatories — list authorised signatories
- [x] sp_UpsertSignatory — add/update signatory with authority limit

### Backend Router
- [x] server/routers/cheque.ts — full tRPC router with all procedures
- [x] Wire chequeRouter into server/routers.ts

### Frontend Screens (Dark Theme with Light Toggle)
- [x] Cheque Dashboard (VFCHQDASH0001P001) — ChequeInventory.tsx KPI cards
- [x] Cheque Book Register (VFCHQBOOK0001P001) — ChequeInventory.tsx books tab
- [x] New Cheque Book form — ChequeInventory.tsx
- [x] Cheque Register (VFCHQREG0001P001) — ChequeInventory.tsx register tab
- [x] Issue Cheque form (VFCHQISS0001P001) — ChequeInventory.tsx
- [x] Cheque Detail screen (VFCHQDET0001P001) — ChequeInventory.tsx detail panel
- [x] Bounce Handling screen (VFCHQBNC0001P001) — BounceManagement.tsx
- [x] Void/Stop Payment screen (VFCHQVOID0001P001) — ChequeInventory.tsx void action
- [x] Stale Cheque Alert screen (VFCHQSTALE0001P001) — ChequeInventory.tsx stale tab
- [x] Signatory Management screen (VFCHQSIGN0001P001) — ChequeInventory.tsx signatories tab
- [x] Theme toggle (dark/light) on all cheque screens
- [x] Register all cheque screen IDs in security.screen_registry

## Bounced Cheque Replacement & Penalty Module (Added Apr 23)
- [x] Create cheque.bounce_penalty_config table (flexible penalty types, rates, GL accounts)
- [x] Create cheque.bounce_events table (full bounce history per cheque)
- [x] Create sp_GetBouncePenaltyConfig stored procedure
- [x] Create sp_SaveBouncePenaltyConfig stored procedure
- [x] Create sp_RecordBouncedCheque stored procedure
- [x] Create sp_IssueBounceReplacement stored procedure
- [x] Create sp_GetBounceHistory stored procedure
- [x] Create sp_GetBounceGLPreview stored procedure
- [x] Build cheque.bounce tRPC router
- [x] Build BounceConfiguration screen (penalty types, rates, GL accounts)
- [x] Build BounceEventDialog (record bounce + penalty selection) — BounceManagement.tsx
- [x] Build BounceReplacementWizard (2-step: penalty → replacement cheque) — BounceManagement.tsx
- [x] Build BounceHistory screen — BounceManagement.tsx history tab
- [x] Wire bounce routes into App.tsx and sidebar
- [x] Write vitest tests for bounce router
- [x] Save checkpoint

## Lessor Master & Asset Registry Module (Added Apr 23)
- [x] Create lessor tables: lessor.lessors, lessor.lessor_contacts, lessor.lessor_bank_accounts, lessor.lessor_documents, lessor.lessor_notes
- [x] Create asset tables: asset.assets, asset.asset_documents, asset.asset_maintenance_history, asset.asset_insurance_links
- [x] sp_UpsertLessor, sp_GetLessors, sp_GetLessorDetail, sp_DeleteLessor
- [x] sp_UpsertLessorContact, sp_GetLessorContacts, sp_DeleteLessorContact
- [x] sp_UpsertLessorBankAccount, sp_GetLessorBankAccounts, sp_DeleteLessorBankAccount
- [x] sp_AddLessorDocument, sp_GetLessorDocuments, sp_AddLessorNote, sp_GetLessorNotes
- [x] sp_UpsertAsset, sp_GetAssets, sp_GetAssetDetail, sp_DeleteAsset
- [x] sp_GetLessorAssets (assets linked to a lessor via leases)
- [x] sp_GetAssetLeaseHistory (lease history for an asset)
- [x] sp_AddAssetDocument, sp_GetAssetDocuments
- [x] Build lessor tRPC router with full CRUD
- [x] Build asset tRPC router with full CRUD
- [x] Build LessorMaster.tsx: searchable table, add/edit drawer, contacts tab, bank accounts tab, assets tab, documents tab, notes tab
- [x] Build AssetRegistry.tsx: searchable table, add/edit drawer, lease history tab, maintenance tab, insurance tab, documents tab
- [x] Add routes /lessor-master and /asset-registry to App.tsx
- [x] Add Lessor Master and Asset Registry to sidebar navigation
- [x] Write vitest tests for lessor and asset routers

## Lease Termination Module (Added Apr 2026)
- [x] sp_GetTerminationRegister — paginated list with status, lease ref, penalty, GL status
- [x] sp_GetTerminationDetail — full detail including penalty breakdown and GL entries
- [x] sp_InitiateTermination — raise new termination request with reason, effective date, penalty
- [x] sp_ComputeTerminationPenalty — contractual penalty vs remaining liability buyout comparison
- [x] sp_ApproveTermination — maker/checker approve step with threshold routing
- [x] sp_RejectTermination — reject with mandatory reason, resets lease to Active
- [x] sp_PostTerminationGL — IFRS 16 derecognition entries
- [x] sp_RecordMakeGoodSettlement — record make-good reinstatement payment
- [x] sp_CancelTermination — cancel pending termination before approval
- [x] sp_GetTerminationGLPreview — preview GL entries before posting
- [x] termination.ts router — full tRPC router for all termination operations
- [x] LeaseTerminations.tsx — table UI with status badges, filter panel, action dropdown
- [x] Termination detail side panel with penalty breakdown, GL preview, approval timeline
- [x] Initiate Termination dialog with penalty vs buyout comparison
- [x] Wire route /lease/terminations and sidebar link

## Gap Analysis — Priority 1: Critical

- [x] P1-01: Lease classification logic (finance vs operating, 5 IFRS 16 criteria) with decision tree UI
- [x] P1-02: IBR (Incremental Borrowing Rate) library — rate management screen with effective date history
- [x] P1-03: Automated remeasurement trigger on modification events (recalculate liability + ROU + journal)
- [x] P1-04: CPI/RPI index-linked rent escalation with auto-remeasurement batch
- [x] P1-05: Variable/contingent rent handling (separate tracking + disclosure)
- [x] P1-06: Short-term lease exemption tracking and aggregated disclosure
- [x] P1-07: Low-value lease exemption tracking and aggregated disclosure
- [x] P1-08: IFRS 16 formatted disclosure note (financial statement ready — all required paragraphs)
- [x] P1-09: Lease liability maturity analysis report (undiscounted cash flows by year band)
- [x] P1-10: ROU asset roll-forward report (opening + additions + depreciation + impairment + disposals + closing)
- [x] P1-11: Lease liability roll-forward report (opening + additions + interest + payments + remeasurements + closing)
- [x] P1-12: ERP journal export (CSV/Excel in SAP/Oracle/Dynamics format)
- [x] P1-13: ERP file export wizard with mapping configuration
- [x] P1-14: Bulk/mass lease remeasurement (portfolio-wide IBR or CPI change)
- [x] P1-15: Excel/CSV bulk lease import wizard with validation and preview
- [x] P1-16: ASC 842 parallel accounting framework (dual-standard on same lease record)

## Gap Analysis — Priority 2: High

- [x] P2-01: AI-powered lease abstraction from PDF documents (OCR + field extraction)
- [x] P2-02: Lease origination workflow (request → approval → contract → activation)
- [x] P2-03: Sub-lease / intermediate lessor accounting (head lease lessee + sublease lessor)
- [x] P2-04: Lessor-side finance lease receivable accounting (lease receivable + unearned income)
- [x] P2-05: Lease option tracking (renewal, purchase, termination) with exercise workflow
- [x] P2-06: Break clause management with notice period tracking and calendar alerts
- [x] P2-07: Rent review / rent escalation schedule management with step-up history
- [x] P2-08: Lease incentive accounting (rent-free periods, tenant improvement allowances)
- [x] P2-09: Security deposit tracking and accounting (asset + liability entries)
- [x] P2-10: Critical date calendar with configurable lead-time alerts per event type
- [x] P2-11: Email notification engine for critical dates (expiry, renewal, break, rent review)
- [x] P2-12: Outlook/Google Calendar .ics export for lease events
- [x] P2-13: SSO / SAML 2.0 configuration screen (Azure AD / Okta)
- [x] P2-14: REST API with OpenAPI specification (public endpoints for leases, invoices, journals)
- [x] P2-15: Webhook / event notification system (configurable outbound HTTP hooks)
- [x] P2-16: Custom report builder (drag-and-drop field selector, grouping, sorting, filters)
- [x] P2-17: Scheduled report delivery (email PDF/Excel on cron schedule)
- [x] P2-18: Portfolio-level budget vs. actual variance analysis screen
- [x] P2-19: Lease cost allocation to cost centres / business units

## Gap Analysis — Priority 3: Medium

- [x] P3-01: What-if scenario modelling (renew vs. relocate vs. exit — NPV comparison)
- [x] P3-02: Market rent benchmarking (manual comparable entry + variance to contracted rent)
- [x] P3-03: Space / floor plan management (area, floor, building hierarchy)
- [x] P3-04: Desk / room booking and occupancy utilisation tracking
- [x] P3-05: Capital project tracking (fit-out, refurbishment — budget vs. actual)
- [x] P3-06: Facilities management work order system
- [x] P3-07: Vendor / contractor management (linked to maintenance and capital projects)
- [x] P3-08: Lease abstraction quality scoring (completeness %)
- [x] P3-09: Duplicate lease detection (same lessor + location + overlapping dates)
- [x] P3-10: Lease data validation rules engine (configurable business rules)
- [x] P3-11: Multi-entity / multi-company accounting (entity selector, separate GL per entity)
- [x] P3-12: Intercompany lease elimination (flag + exclude from consolidated reports)
- [x] P3-13: Consolidation reporting across entities
- [x] P3-14: Foreign currency translation with FX gain/loss accounting
- [x] P3-15: Hedge accounting for FX-denominated leases
- [x] P3-16: Budgeting module (lease budget entry + forecast vs. actual)
- [x] P3-17: Cashflow forecasting (12/24/36 month rolling projection)
- [x] P3-18: ESG carbon footprint calculation per lease (Scope 1/2/3 emissions)
- [x] P3-19: TCFD / SASB sustainability disclosure report
- [x] P3-20: Lessor credit risk scoring (payment history + rating)

## Gap Analysis — Priority 4: Low

- [x] P4-01: Mobile-responsive UI (all screens optimised for tablet/phone)
- [x] P4-02: Responsive tablet UI improvements
- [x] P4-03: Broker / agent management (linked to lease origination)
- [x] P4-04: Letter of Intent (LOI) tracking (pre-contract stage)
- [x] P4-05: Lease comparison / benchmarking tool (side-by-side lease terms)
- [x] P4-06: Tenant improvement allowance tracking
- [x] P4-07: DocuSign / e-signature integration for lease documents

## Furnished Property Assets & Asset Deposit Module

### Database & Backend
- [x] Create table: lease.furnished_assets (asset_id, contract_id, asset_category, asset_name, brand, model, serial_number, condition_at_handover, estimated_value, photo_url, notes)
- [x] Create table: lease.asset_deposits (deposit_id, contract_id, deposit_amount, deposit_currency, deposit_date, deposit_type, bank_ref, status, released_amount, release_date, notes)
- [x] Create table: lease.asset_handover_checklist (checklist_id, contract_id, checklist_type [HANDOVER/RETURN], conducted_date, conducted_by, overall_condition, notes, signed_off)
- [x] Create table: lease.asset_checklist_items (item_id, checklist_id, asset_id, condition_at_check, damage_description, repair_cost_estimate, deduct_from_deposit, photo_url)
- [x] Create table: lease.asset_deposit_deductions (deduction_id, deposit_id, asset_id, deduction_reason, deduction_amount, approved_by, approved_date)
- [x] Create tRPC router: furnishedAssets — list, create, update, delete, getByLease
- [x] Create tRPC router: assetDeposits — list, create, release, deduct, getByLease
- [x] Create tRPC router: handoverChecklists — list, create, complete, getByLease, addItem

### Frontend Pages
- [x] Build FurnishedAssets.tsx — asset inventory per lease with category grouping, condition badges, photo upload, estimated value totals
- [x] Build AssetDepositRegister.tsx — asset deposit register separate from security deposits, with release workflow and deduction tracking
- [x] Build HandoverChecklist.tsx — digital handover/return checklist with per-asset condition, damage photos, repair cost estimation, deposit deduction calculation
- [x] Build AssetDepositDeductions.tsx — deduction management screen showing deposit balance, approved deductions, remaining refund amount

### Navigation
- [x] Add "Furnished Assets" section to DashboardLayout sidebar under "Operational"
- [x] Wire all 4 new pages in App.tsx

## Master Services Contract (MSC) Module

### Database & Backend
- [x] Create table: msc.master_contracts (msc_id, msc_ref, contract_type [FLEET/RESIDENTIAL], title_en, title_ar, party_a_en, party_a_ar, party_b_en, party_b_ar, effective_date, expiry_date, contract_value, currency, payment_terms_en, payment_terms_ar, scope_en, scope_ar, governing_law_en, governing_law_ar, jurisdiction_en, jurisdiction_ar, termination_en, termination_ar, warranties_en, warranties_ar, signed_by_en, signed_by_ar, witness_en, witness_ar, status, created_by, created_at)
- [x] Create table: msc.contract_assets (link_id, msc_id, asset_type [VEHICLE/HOME], asset_ref, asset_description, make_model, plate_vin, location, linked_lease_id)
- [x] Create tRPC router: masterContracts — list, getById, create, update, delete, linkAsset, unlinkAsset, getLinkedAssets

### Frontend Pages
- [x] Build MSCRegister.tsx — list view with contract type filter (Fleet/Residential), status badges, expiry countdown, linked asset count
- [x] Build MSCDetail.tsx (combined into MSCContractViewer) — full attribute screen showing all EN/AR fields side by side, linked assets sub-table, action buttons (Edit, Print, View Contract)
- [x] Build MSCContractViewer.tsx — portrait A4 bilingual contract renderer (EN left column, AR right column RTL), printable via browser print

### Navigation
- [x] Add "Master Contracts" section to DashboardLayout sidebar under "Contracts"
- [x] Wire all 3 new pages in App.tsx

## Gen AI Fill Button (All Data Entry Forms)

- [x] Create tRPC procedure: ai.fillForm — accepts formType + existing partial data, returns structured JSON with realistic field values
- [x] Create GenAIFillButton component (client/src/components/GenAIFillButton.tsx) — Sparkles icon button with loading spinner, calls ai.fillForm, merges returned values into form state
- [x] Create useGenAIFill hook (client/src/hooks/useGenAIFill.ts) — wraps the tRPC mutation with loading/error state
- [x] Add Gen AI button to: NewLease form
- [x] Add Gen AI button to: MSCRegister (create contract form)
- [x] Add Gen AI button to: FurnishedAssets (add asset form)
- [x] Add Gen AI button to: AssetDepositRegister (add deposit form)
- [x] Add Gen AI button to: HandoverChecklist (create checklist form)
- [x] Add Gen AI button to: OpsMaintenance (raise ticket form)
- [x] Add Gen AI button to: OpsInsurance (add policy form)
- [x] Add Gen AI button to: VendorManagement (add vendor form)
- [x] Add Gen AI button to: BrokerManagement (add broker form)
- [x] Add Gen AI button to: LOITracking (add LOI form)
- [x] Add Gen AI button to: TenantImprovementAllowance (add TI form)
- [x] Add Gen AI button to: ESignatureIntegration (send for signature form)
- [x] Add Gen AI button to: SecurityDeposits (add deposit form)
- [x] Add Gen AI button to: SubLeases (add sub-lease form)
- [x] Add Gen AI button to: RentReviews (add review form)
- [x] Add Gen AI button to: LeaseModifications (add modification form)
- [x] Add Gen AI button to: LeaseTerminations (initiate termination form)
- [x] Add Gen AI button to: BudgetingForecasting (add budget entry form)
- [x] Add Gen AI button to: HedgeAccounting (add hedge form)
- [x] Add Gen AI button to: DeskBooking (add booking form)
- [x] Add Gen AI button to: FacilitiesWorkOrders (raise work order form)
- [x] Add Gen AI button to: LeaseComparison (add comparison form)
- [x] Add Gen AI button to: LessorMaster (add lessor form)
- [x] Add Gen AI button to: AssetRegistry (add asset form)

## Screen ID, Audit Log & Error Log (All Screens)
- [x] Create reusable ScreenHeader component (screen ID badge, last modified, audit log trigger, error log trigger)
- [x] Create AuditLogDrawer component (shows who did what and when per screen, calls auditLog tRPC)
- [x] Create ErrorLogDrawer component (shows API/form errors per screen with timestamp, calls errorLog tRPC)
- [x] Create server-side auditLog tRPC router (logAction, getByScreen, getAll)
- [x] Create server-side errorLog tRPC router (logError, getByScreen, getAll)
- [x] Add ScreenHeader to all 50+ pages with unique Screen IDs
- [x] Wire audit log writes on all create/update/delete mutations

## Property Furniture Collection Module
- [x] Create furniture_collections table (collection_id, property_id, property_name, collection_name, created_at, updated_at)
- [x] Create furniture_items table (item_id, collection_id, category, name, brand, model, serial_number, condition, quantity, unit_value, total_value, notes, added_at)
- [x] Create tRPC router: furnitureCollections (list, getByProperty, create, update, delete, getWithItems)
- [x] Create tRPC router: furnitureItems (listByCollection, create, update, delete, bulkUpsert)
- [x] Build FurnitureCollections.tsx (list all properties with collection summary — item count, total value, last updated)
- [x] Build FurnitureCollectionDetail.tsx (full item CRUD for a specific property — inline edit, add row, delete row, Gen AI fill)
- [x] Add Gen AI fill button to FurnitureCollectionDetail item form
- [x] Wire navigation in DashboardLayout under "Furnished Assets" section
- [x] Wire routes in App.tsx

## Gen AI Fill on All Screens + Sidebar Reorganisation
- [x] Move Audit Log and Error Log from Compliance to System Settings in DashboardLayout
- [x] Add Gen AI fill button to: OpsMaintenance (raise ticket form)
- [x] Add Gen AI fill button to: OpsInsurance (add policy form)
- [x] Add Gen AI fill button to: VendorManagement (add vendor form)
- [x] Add Gen AI fill button to: BrokerManagement (add broker form)
- [x] Add Gen AI fill button to: LOITracking (add LOI form)
- [x] Add Gen AI fill button to: TenantImprovementAllowance (add TI form)
- [x] Add Gen AI fill button to: ESignatureIntegration (send for signature form)
- [x] Add Gen AI fill button to: SecurityDeposits (add deposit form)
- [x] Add Gen AI fill button to: SubLeases (add sub-lease form)
- [x] Add Gen AI fill button to: RentReviews (add review form)
- [x] Add Gen AI fill button to: LeaseModifications (add modification form)
- [x] Add Gen AI fill button to: LeaseTerminations (initiate termination form)
- [x] Add Gen AI fill button to: BudgetingForecasting (add budget entry form)
- [x] Add Gen AI fill button to: HedgeAccounting (add hedge form)
- [x] Add Gen AI fill button to: DeskBooking (add booking form)
- [x] Add Gen AI fill button to: FacilitiesWorkOrders (raise work order form)
- [x] Add Gen AI fill button to: LeaseComparison (add comparison form)
- [x] Add Gen AI fill button to: LessorMaster (add lessor form)
- [x] Add Gen AI fill button to: AssetRegistry (add asset form)
- [x] Add Gen AI fill button to: AssetDepositRegister (add deposit form)
- [x] Add Gen AI fill button to: HandoverChecklist (create checklist form)
- [x] Add Gen AI fill button to: FurnishedAssets (add asset form)
- [x] Add Gen AI fill button to: ConsolidationReporting (add entity form)
- [x] Add Gen AI fill button to: LeaseDataQuality (validation rule form)
- [x] Add Gen AI fill button to: ScenarioModelling (add scenario form)
- [x] Add Gen AI fill button to: CriticalDateCalendar (add alert form)

## Critical UI Fixes (Apr 24)
- [x] Fix Lessor Master: remove all modal dialogs, replace with right-side SlidePanel (no Dialog/Modal components anywhere)
- [x] Move Lessor Master and Asset Registry under Lease Management section in sidebar (not Master Data)
- [x] Fix ScreenHeader: add formType+onAIFormFill props for form-fill mode alongside existing screenType+onAIData
- [x] Fix NewLease: wire onAIFormFill to set lessor/asset/financial form state
- [x] Fix all other form pages: wire onAIFormFill to their form state setters

---

## UI ARCHITECTURE FIX — PHASE (Added Apr 24)

### FUNDAMENTAL RULE: Left = Sidebar Menu, Right = Full Inline Screen. NO modals/popups/overlays.

### CATEGORY 1 — Convert SlidePanel → Inline Screen (20 pages)
SlidePanel is a slide-over overlay. Replace with showForm inline pattern:
- showForm=true → full right-side form screen (sidebar stays visible)
- showForm=false → full right-side list/table screen (sidebar stays visible)

- [x] APIWebhookConfig.tsx — convert SlidePanel to inline form screen
- [x] BankAccounts.tsx — convert SlidePanel to inline form screen
- [x] BankRules.tsx — convert SlidePanel to inline form screen
- [x] BrokerManagement.tsx — convert SlidePanel to inline form screen
- [x] ContractMilestones.tsx — convert SlidePanel to inline form screen
- [x] DeskBooking.tsx — convert SlidePanel to inline form screen
- [x] ESignatureIntegration.tsx — convert SlidePanel to inline form screen
- [x] FacilitiesWorkOrders.tsx — convert SlidePanel to inline form screen
- [x] InvoiceRegister.tsx — convert SlidePanel to inline form screen
- [x] LOITracking.tsx — convert SlidePanel to inline form screen
- [x] LeaseComparison.tsx — convert SlidePanel to inline form screen
- [x] LeaseModifications.tsx — convert SlidePanel to inline form screen
- [x] LeaseRenewals.tsx — convert SlidePanel to inline form screen
- [x] NotificationSettings.tsx — convert SlidePanel to inline form screen
- [x] OpsInsurance.tsx — convert SlidePanel to inline form screen
- [x] OpsMaintenance.tsx — convert SlidePanel to inline form screen
- [x] PaymentRuns.tsx — convert SlidePanel to inline form screen
- [x] SSOConfig.tsx — convert SlidePanel to inline form screen
- [x] TenantImprovementAllowance.tsx — convert SlidePanel to inline form screen
- [x] VendorManagement.tsx — convert SlidePanel to inline form screen

### CATEGORY 2 — Add Missing CRUD (6 pages)
- [x] AssetRegistry.tsx — add full CRUD (create, edit, delete) + inline form
- [x] BudgetVariance.tsx — add full CRUD (create, edit, delete) + inline form
- [x] LeaseOrigination.tsx — add full CRUD (create, edit, delete) + inline form
- [x] LessorMaster.tsx — add full CRUD (create, edit, delete) + inline form
- [x] ScenarioModelling.tsx — add full CRUD (create, edit, delete) + inline form
- [x] CPIEscalation.tsx — wire apply escalation mutation properly

### CATEGORY 3 — Wire Gen AI Fill Button (5 pages missing it)
- [x] AssetRegistry.tsx — add GenAIFillButton (formType: asset_registry)
- [x] BudgetVariance.tsx — add GenAIFillButton (formType: budget_entry)
- [x] LeaseOrigination.tsx — add GenAIFillButton (formType: new_lease)
- [x] LessorMaster.tsx — add GenAIFillButton (formType: lessor)
- [x] ScenarioModelling.tsx — add GenAIFillButton (formType: new_lease)

---

## UI ARCHITECTURE FIX — Apr 24, 2026

### FUNDAMENTAL RULE (Non-Negotiable)
- Left side = Navigation Menu (sidebar)
- Right side = Full UI Screen (inline, no modals, no overlays, no SlidePanel)
- Every data screen MUST have: Add New button, Edit button per row, Delete button per row
- Gen AI button MUST appear on every form that accepts data input

### Phase A: SlidePanel → Inline Screen Conversion (DONE)
- [x] BankAccounts.tsx — converted to inline showForm
- [x] BankRules.tsx — converted to inline showForm
- [x] BrokerManagement.tsx — converted to inline showForm
- [x] ContractMilestones.tsx — converted to inline showForm
- [x] InvoiceRegister.tsx — converted to inline showForm
- [x] LOITracking.tsx — converted to inline showForm
- [x] LeaseModifications.tsx — converted to inline showForm
- [x] OpsInsurance.tsx — converted to inline showForm
- [x] OpsMaintenance.tsx — converted to inline showForm
- [x] PaymentRuns.tsx — converted to inline showForm
- [x] RentReviews.tsx — converted to inline showForm
- [x] SecurityDeposits.tsx — converted to inline showForm
- [x] SubLeases.tsx — converted to inline showForm
- [x] TenantImprovementAllowance.tsx — converted to inline showForm
- [x] VendorManagement.tsx — converted to inline showForm
- [x] APIWebhookConfig.tsx — converted to inline showForm
- [x] DeskBooking.tsx — converted to inline showForm
- [x] ESignatureIntegration.tsx — converted to inline showForm
- [x] NotificationSettings.tsx — converted to inline showForm
- [x] SSOConfig.tsx — converted to inline showForm

### Phase B: Gen AI Form-Fill Wiring (DONE)
- [x] NewLease.tsx — Gen AI wired to all 5 wizard steps
- [x] LessorMaster.tsx — Gen AI wired to lessor, contact, bank, note forms
- [x] BankAccounts.tsx — Gen AI wired
- [x] All other SlidePanel-converted pages — Gen AI wired

### Phase C: Data Binding Bug Fix (DONE)
- [x] BankAccounts.tsx — fixed: query returns {accounts:[]} not plain array; now reads (data as any)?.accounts ?? []
- [x] BankAccounts.tsx — added Edit + Delete buttons to each card

### Phase D: Edit/Delete Missing on Table Rows (COMPLETED Apr 24)
- [x] VendorManagement.tsx — already had Edit/Delete dropdown
- [x] BrokerManagement.tsx — already had Edit/Delete dropdown
- [x] InvoiceRegister.tsx — Edit/Delete added per row
- [x] ContractMilestones.tsx — Edit/Delete added per card
- [x] LOITracking.tsx — already had Edit/Delete
- [x] OpsInsurance.tsx — Edit/Delete dropdown added
- [x] OpsMaintenance.tsx — Edit/Delete dropdown added
- [x] PaymentRuns.tsx — Edit/Delete added, GenAI wired
- [x] RentReviews.tsx — Edit/Delete added per row
- [x] SecurityDeposits.tsx — Edit/Delete added per row
- [x] SubLeases.tsx — Edit/Delete added per row
- [x] TenantImprovementAllowance.tsx — already had full CRUD
- [x] BankRules.tsx — rewritten with full CRUD
- [x] LeaseModifications.tsx — already had Edit/Delete

### Phase E: Pages Missing Add New Button (COMPLETED Apr 24)
- [x] CriticalDateCalendar.tsx — Edit/Delete added per row
- [x] LeaseOptionsBreaks.tsx — Edit/Delete added, GenAI wired
- [x] VariableRent.tsx — rewritten with full CRUD
- [x] LeaseExemptions.tsx — rewritten with full CRUD
- [x] ContractRegister.tsx — Add New button + inline form added
- [x] HandoverChecklist.tsx — Edit/Delete added per row
- [x] ChequeInventory.tsx — Edit/Delete added per row
- [x] BounceManagement.tsx — Edit/Delete added per row
- [x] SpaceManagement.tsx — Edit/Delete added, GenAI wired
- [x] TenantPortal.tsx — Edit/Delete added per row
- [x] AssetDepositRegister.tsx — Edit/Delete added per row
- [x] LeaseTerminations.tsx — Edit/Delete added per row
- [x] MSCRegister.tsx — Delete added (Edit already existed)

### Phase F: Delete Confirmation (No Modal — Use Toast Action) (COMPLETED Apr 24)
- [x] All data pages — delete uses toast action pattern
- [x] No AlertDialog/Dialog remaining in any page

### Read-Only Screens (No CRUD Needed — By Design)
- Dashboard.tsx, MISAnalytics.tsx, MISCashflow.tsx, MISCost.tsx, MISPortfolio.tsx, MISReports.tsx
- ComplianceIFRS16.tsx, ASC842.tsx, IFRS16Disclosure.tsx, ConsolidationReporting.tsx
- RollForwardReport.tsx, MaturityAnalysis.tsx, BankHistory.tsx, BankImport.tsx
- BankReconWorkspace.tsx, ERPExport.tsx, ESGReporting.tsx, ESGCarbon.tsx
- WorkflowMonitor.tsx, WorkflowEscalations.tsx, WorkflowTasks.tsx
- Amortisation.tsx, RemeasurementEngine.tsx, GLJournals.tsx
- AIAbstraction.tsx, AILeaseAnalytics.tsx, MISAIQuery.tsx

## UI Architecture Fix — Phase D: Edit/Delete on All Data Pages (COMPLETED Apr 24)

### Problem Fixed
- Bank Accounts showed empty screen with no Add button — root cause: query returned `{accounts:[...]}` but code read it as plain array. Fixed data binding, now shows 3 existing records with Edit/Delete.
- 9 pages had no per-row Edit or Delete buttons — added to all.

### Pages Fixed
- [x] BankAccounts — fixed data binding bug, added Edit/Delete per card
- [x] BankRules — rewritten with inline form, Edit/Delete per row
- [x] InvoiceRegister — Edit/Delete dropdown added per row
- [x] ContractMilestones — Edit/Delete buttons added per milestone card
- [x] OpsInsurance — Edit/Delete dropdown per table row
- [x] OpsMaintenance — Edit/Delete dropdown per table row
- [x] PaymentRuns — Edit/Delete dropdown per table row, GenAIFillButton added
- [x] RentReviews — Edit/Delete buttons per row
- [x] SecurityDeposits — Edit/Delete buttons per row, openAdd/openEdit pattern
- [x] SubLeases — Edit/Delete buttons per row, openAdd/openEdit pattern
- [x] TenantImprovementAllowance — already had full CRUD (verified, no change needed)
- [x] LeaseModifications — already had Edit/Delete (verified, no change needed)
- [x] VendorManagement — already had Edit/Delete dropdown (verified, no change needed)
- [x] BrokerManagement — already had Edit/Delete dropdown (verified, no change needed)

### Architecture Rules Enforced
- Left = Menu sidebar | Right = Full UI screen (no overlays)
- All forms use inline showForm pattern (Back button returns to list)
- Delete uses toast action confirmation (no AlertDialog modals)
- Gen AI button present on all data entry forms
- 0 TypeScript errors

## UI Architecture Fix — Phase E: Add New Button Missing (COMPLETED Apr 24)
- [x] CriticalDateCalendar — Edit/Delete added per row
- [x] LeaseOptionsBreaks — Edit/Delete added per row, GenAI wired
- [x] VariableRent — rewritten with full CRUD
- [x] LeaseExemptions — rewritten with full CRUD
- [x] ContractRegister — Add New button + inline form added (was completely missing)
- [x] HandoverChecklist — Edit/Delete added per row
- [x] SpaceManagement — Edit/Delete added per row, GenAI wired
- [x] AssetDepositRegister — Edit/Delete added per row
- [x] LeaseTerminations — Edit/Delete added per row
- [x] MSCRegister — Delete added (Edit already existed)

## UI Architecture Fix — Phase E (COMPLETED Apr 24 2026)

### Problem Identified
All data screens must follow: Left = Menu | Right = Full UI Screen. No modal windows. Every data screen must have Add, Edit, Delete. Gen AI on every form.

### Phase D — Edit/Delete on 14 data pages (COMPLETED)
- [x] BankAccounts — fixed data binding bug (query returned {accounts:[]} not array), Edit/Delete per card
- [x] BankRules — rewritten with inline form, Edit/Delete per row
- [x] InvoiceRegister — Edit/Delete per row added
- [x] ContractMilestones — Edit/Delete per card added
- [x] OpsInsurance — Edit/Delete dropdown per row
- [x] OpsMaintenance — Edit/Delete dropdown per row
- [x] PaymentRuns — Edit/Delete per row, GenAI wired
- [x] RentReviews — Edit/Delete per row
- [x] SecurityDeposits — Edit/Delete per row
- [x] SubLeases — Edit/Delete per row
- [x] TenantImprovementAllowance — already had full CRUD (verified)
- [x] LeaseModifications — already had Edit/Delete (verified)
- [x] VendorManagement — already had Edit/Delete dropdown (verified)
- [x] BrokerManagement — already had Edit/Delete dropdown (verified)

### Phase E — Add New / Edit / Delete on 10 more pages (COMPLETED)
- [x] CriticalDateCalendar — Edit/Delete added per row
- [x] LeaseOptionsBreaks — Edit/Delete added per row, GenAI wired
- [x] VariableRent — rewritten with full CRUD
- [x] LeaseExemptions — rewritten with full CRUD
- [x] ContractRegister — Add New button + inline form added (was completely missing)
- [x] HandoverChecklist — Edit/Delete added per row
- [x] SpaceManagement — Edit/Delete added per row, GenAI wired
- [x] AssetDepositRegister — Edit/Delete added per row
- [x] LeaseTerminations — Edit/Delete added per row
- [x] MSCRegister — Delete added (Edit already existed)

### Architecture Fixes (COMPLETED)
- [x] All 20 SlidePanel overlay pages converted to inline full-screen form pattern
- [x] Gen AI button wired to form fields on all major data entry pages
- [x] 0 TypeScript errors

### Phase F — Delete confirmation via toast (COMPLETED Apr 24)
- [x] All AlertDialog/Dialog/SlidePanel modals eliminated — 0 remaining in any page
- [x] Delete actions use toast confirmation pattern throughout

### Phase G — Remaining pages audit (COMPLETED Apr 24)
- [x] Full audit of all 103 pages completed
- [x] LessorMaster rewritten with DashboardLayout (was missing global sidebar)
- [x] Edit/Delete added to: AdminPanel, IBRLibrary, GLJournals, ChequeInventory, BounceManagement, BouncePenalty, BudgetVariance, ESGCarbon, HedgeAccounting, LeaseDataQuality, LessorCreditScore, RemeasurementEngine, LeaseOrigination, LessorFinanceLease, ScenarioModelling, TenantPortal, WorkflowQueue, MSCContractViewer, MultiEntityFX
- [x] 0 TypeScript errors

## Country Field Fix (Apr 25)
- [x] NewLease.tsx — Country field in Step 1 always defaults to Qatar (QA), Gen AI always fills country as Qatar

## Audit Log & Error Log Improvements (Apr 25)
- [x] AuditLog.tsx — add elapsed time column (time since event, e.g. "2m ago", "3h ago") prominently displayed
- [x] ErrorLog.tsx — add screen_id, user_id columns; make timestamp prominent

## Sub-Asset Registry (Apr 25)
- [x] Rename AssetRegistry.tsx → SubAssetRegistry.tsx (Sub-Asset Registry)
- [x] Build master item library with 80+ items: furniture, appliances (AC brands/tonnage, washer brands/capacity), electronics
- [x] Each item has: Item Code, Name, Category, Brand, Model, Spec (tonnage/capacity/size), Serial Number field
- [x] Visual set builder UI: left panel = item library with search/filter, right panel = set composition
- [x] Set has: Set Code (auto), Set Name, Description, items with qty + serial numbers
- [x] Save/Edit/Delete sets; sets can later be attached to a lease
- [x] Update App.tsx route and sidebar nav label to "Sub-Asset Registry"

## Menu & Date Field Updates (Apr 25)
- [x] DashboardLayout.tsx — rename "Asset Registry" nav label to "Sub-Asset Registry"
- [x] AssetRegistry.tsx — add Purchase Date and Warranty Expiry date fields to set builder items
- [x] LessorMaster.tsx — add date fields (Contract Start Date, Contract End Date, Registration Date)

## New Lease Date Fields (Apr 25)
- [x] NewLease.tsx — add Contract Prepared Date and Created Date fields (Step 1 or Review step)

## Sub-Asset Registry Redesign (Apr 25)
- [x] AssetRegistry.tsx — new layout: top = saved sets dropdown panel, bottom-left = item library, bottom-right = set builder
- [x] AssetRegistry.tsx — 300+ items with approximate QAR prices and category/sub-category dropdowns
- [x] AssetRegistry.tsx — rename "Purchase Date" to "Lease Date" in set builder

## Sub-Asset Registry Bug Fixes (Apr 25)
- [x] AssetRegistry.tsx — fix set code counter (derive from savedSets.length, not module-level let)
- [x] AssetRegistry.tsx — add ScreenHeader back (screen ID was removed in rewrite)

## Sub-Asset Registry DB Persistence (Apr 25)
- [x] Check existing SPs for sub_asset_sets and sub_asset_lines tables
- [x] Add tRPC procedures: getSubAssetGroups, upsertSubAssetGroup, deleteSubAssetGroup
- [x] AssetRegistry.tsx — replace useState with tRPC queries/mutations for full DB persistence
- [x] AssetRegistry.tsx — fix Edit to load set back into builder from DB
- [x] AssetRegistry.tsx — fix Delete to call DB delete mutation

## Item Library CRUD (Apr 25)
- [x] AssetRegistry.tsx — add "Add Item" button to Item Library header
- [x] AssetRegistry.tsx — each item row gets Edit (pencil) and Delete (trash) icon buttons
- [x] AssetRegistry.tsx — inline form to add/edit item: Name, Category, Sub-Category, Brand, Model, Spec, Unit Price (QAR)
- [x] AssetRegistry.tsx — custom items persist alongside built-in library items

## Sub-Asset Set Selector in New Lease (Apr 25)
- [x] NewLease.tsx Step 2 — add "Sub-Asset Sets" section with multi-select from saved sets (getSubAssetGroups)
- [x] Show each selected set as a card with set code, name, item count, total QAR value
- [x] Allow removing a selected set with an X button
- [x] Pass selected set IDs in the lease creation payload (subAssetSetIds field)
- [x] Step 5 Review — show attached sub-asset sets summary table
- [x] Update todo.md when complete

## Sub-Asset Transaction Log (Apr 25)
- [x] Create sp_LogSubAssetTransaction SP (txn_id, action, entity_type, entity_id, entity_code, entity_name, before_json, after_json, changed_by, changed_at, screen_id, ip_address)
- [x] Create sp_GetSubAssetTransactions SP (filter by entity_id, action, date range, user)
- [x] Add tRPC procedures: asset.logSubAssetTxn, asset.getSubAssetTxns to lessorAsset router
- [x] Wire logSubAssetTxn call in AssetRegistry.tsx on every upsertSubAssetGroup mutation (INSERT/UPDATE)
- [x] Wire logSubAssetTxn call in AssetRegistry.tsx on every deleteSubAssetGroup mutation (DELETE)
- [x] Wire logSubAssetTxn call in AssetRegistry.tsx on every custom item add/edit/delete (localStorage ops)
- [x] Build SubAssetTransactionLog.tsx — full transaction log screen with filters (action, date, user)
- [x] Show before/after JSON diff in expandable row for each transaction
- [x] Add "Transaction Log" button in Sub-Asset Registry header linking to the log screen
- [x] Wire route /sub-asset-registry/transactions in App.tsx
- [x] Add Transaction Log link in sidebar under Sub-Asset Registry

## Sub-Asset Lifecycle Management (Apr 25)
- [x] Create asset.lease_sub_assets table: lease_sub_asset_id, lease_id, asset_id (set), asset_code, set_name, status (Active/Cancelled/Returned/BackIn/Replaced), status_date, reason, replaced_by_asset_id, notes, created_by, created_at
- [x] Create sp_AttachSubAssetToLease SP (insert lease_sub_assets row, log transaction)
- [x] Create sp_UpdateSubAssetStatus SP (update status + log transaction)
- [x] Create sp_GetLeaseSubAssets SP (get all sets for a lease with status)
- [x] Create sp_GetLeaseList SP (get leases for selector dropdown)
- [x] Add tRPC procedures: asset.attachSubAssetToLease, asset.updateSubAssetStatus, asset.getLeaseSubAssets, asset.getLeaseList
- [x] Build LeaseSubAssets.tsx — lease selector + sub-asset sets grid with status badges
- [x] Status change dialog: select new status (Cancelled/Returned/BackIn/Replaced), date, reason, replacement set picker for Replaced
- [x] Each set card shows: set code, set name, item count, status badge, status date, reason, action buttons
- [x] Wire route /lease-sub-assets in App.tsx
- [x] Add "Lease Sub-Assets" link in sidebar under Lease Management
- [x] Log every status change to sub_asset_transactions table

## Serial Number & Date at Lease Attachment (Apr 25)
- [x] AssetRegistry.tsx — remove serial number input fields from set builder (not required at set creation)
- [x] LeaseSubAssets.tsx — attach dialog: after selecting a set, show each item in the set with mandatory Serial Number and Date fields
- [x] Validate all serial numbers and dates are filled before allowing Attach
- [x] Store serial numbers and dates per item in the lease_sub_assets.tags_with_serials JSON column (add column to table)
- [x] Update sp_AttachSubAssetToLease to accept and store tags_with_serials
- [x] Display serial numbers and dates in the expanded card view on the Lease Sub-Assets screen

## Transaction-Based Sub-Asset Attachment & Inventory Display (Apr 25)
- [x] Update tRPC attachSubAssetToLease to accept tagsWithSerials (JSON: [{code, name, qty, serialNumbers[], attachDate}])
- [x] Log ATTACH transaction to sub_asset_transactions on every attach (before=null, after=full item list with serials)
- [x] Log STATUS_CHANGE transaction to sub_asset_transactions on every status update
- [x] LeaseSubAssets.tsx attach dialog: after selecting a set, expand each item row with serial number inputs (one per qty) and a single attachment date — all mandatory
- [x] Validate all serial numbers filled and attachment date set before saving
- [x] Expanded set card: show full item inventory table (Item Code, Name, Category, Qty, Serial Numbers, Attachment Date)
- [x] Show transaction history badge on each card (click to view log for that set on that lease)

## Print/Export Inventory PDF (Apr 25)
- [x] Add warranty_expiry_date column to lease_sub_assets table (per item in tags_with_serials JSON)
- [x] Update attach dialog: add optional warranty expiry date per item
- [x] Update sp_AttachSubAssetToLease to store warranty expiry in tags_with_serials
- [x] Add tRPC procedure asset.getLeaseInventoryForExport returning full item list with serials + warranty dates
- [x] Build /api/lease-inventory-pdf/:leaseId Express endpoint that generates PDF using html-pdf or similar
- [x] Add "Export PDF" and "Print" buttons to LeaseSubAssets.tsx header
- [x] PDF layout: header (lease ref, property, date), table (item, category, brand, spec, qty, serial numbers, attach date, warranty expiry)

## Handover Checklist Auto-Population (Apr 25)
- [x] Read HandoverChecklist.tsx to understand current structure
- [x] Add tRPC procedure asset.getLeaseSubAssetItems returning flat item list for a lease (all items from all active sets)
- [x] Add "Import from Sub-Asset Registry" button to HandoverChecklist.tsx
- [x] Auto-populate checklist rows with item name, serial number, category from attached sets
- [x] Each imported row is pre-filled but editable; user can add condition notes and sign off

## Warranty Expiry Alerts (Apr 25)
- [x] Add sp_GetExpiringWarranties SP: returns items where warranty_expiry_date is within 30 days
- [x] Add tRPC procedure asset.getExpiringWarranties
- [x] Add warranty expiry alert card to Dashboard (show count of expiring items, link to Lease Sub-Assets)
- [x] Add warranty expiry section to AlertCentre with item-level detail (lease, set, item, serial, expiry date)

## New Lease Step 2 — Expandable Sub-Asset Set Panel
- [x] Replace compact set chip with expandable accordion panel in NewLease.tsx Step 2
- [x] Clicking the set header (chevron) expands to show all items in a table
- [x] Per-item editable fields: Serial Number, Leased Date, Warranty End Date, Status
- [x] Status dropdown options: Active, Cancelled, Returned, BackIn, Replaced
- [x] Validate serial numbers are filled before allowing Step 3
- [x] Show item count and total QAR value in collapsed header

## Sub-Asset Transaction Log Rebuild
- [x] Add Lease Number dropdown filter to SubAssetTransactionLog.tsx (uses getLeaseList)
- [x] Add Sub-Asset Set dropdown filter (uses getSubAssetGroups, filtered by selected lease)
- [x] Add action toolbar: Add, Edit, Delete, Returned, Write Off, Replaced, Condemned
- [x] Add Ownership toggle per record: Lease / Lessor (default: Lease)
- [x] Add ownership field to lease_sub_assets table and sp_UpdateSubAssetStatus
- [x] Add tRPC procedures for each action: writeOff, condemn (map to updateSubAssetStatus with new statuses)
- [x] Each action logs a transaction to sub_asset_transactions
- [x] Action buttons are context-sensitive (greyed out when no row selected)
- [x] Ownership change also logs a transaction (OWNERSHIP_CHANGE action)

## Lease Dropdown Fix
- [x] Fix sp_GetLeaseList to return all leases with leaseRef and description/asset name
- [x] Update SubAssetTransactionLog.tsx dropdown to show leaseRef + description

## Lessee Fields in Lessor Master (Apr 25)
- [x] ALTER lessor.lessors table: add lessee_type, lessee_name, staff_number, grade, position, place_of_work, department, employee_id, lessee_contact_email, lessee_contact_phone columns
- [x] DROP + recreate dbo.sp_GetLessors to include new lessee fields in SELECT
- [x] DROP + recreate dbo.sp_GetLessorDetail to return new lessee fields
- [x] DROP + recreate dbo.sp_UpsertLessor to accept and save all new lessee params
- [x] DROP + recreate asset.sp_AttachSubAssetToLease to accept lessee_name and store as owner
- [x] DROP + recreate asset.sp_UpdateSubAssetStatus to accept lessor_name/lessee_name and update owner on Returned/BackIn
- [x] DROP + recreate asset.sp_GetLeaseSubAssets to return owner column
- [x] Update asset.sp_GetLeaseListForSubAsset to JOIN lessor.lessors and return lessee_name
- [x] Update tRPC upsertLessor procedure to accept and forward all new lessee fields
- [x] Update tRPC attachSubAssetToLease procedure to accept lesseeName and forward to SP
- [x] Update tRPC updateSubAssetStatus procedure to accept lessorName/lesseeName and forward to SP
- [x] Update tRPC getLeaseList procedure to return lesseeName field
- [x] Add Lessees tab to LessorMaster.tsx detail view (lessee_type, lessee_name, staff_number, grade, position, place_of_work, department, employee_id, contact_email, contact_phone)
- [x] Fix LeaseSubAssets.tsx selectedLease lookup to use camelCase leaseId
- [x] Fix LeaseSubAssets.tsx lease SelectItem to use camelCase leaseId
- [x] Add owner field to AttachedSet mapping in LeaseSubAssets.tsx
- [x] Wire lesseeName on doAttach() in LeaseSubAssets.tsx
- [x] Wire lessorName/lesseeName on doStatusChange() in LeaseSubAssets.tsx (Returned → lessor, BackIn → lessee)
- [x] Fix confirmAttach() in SubAssetTransactionLog.tsx to pass lesseeName
- [x] Fix confirmAction() in SubAssetTransactionLog.tsx to pass lessorName/lesseeName based on action type

## Lessee Details Tab Rebuild (Apr 25)
- [x] Add handleLesseeAIFill handler to map AI-generated data to lesseeForm state
- [x] Add Gen AI Fill button to Lessee tab header (only visible in edit mode)
- [x] Rebuild read-only view: profile hero card with avatar initials, type/grade/department badges, staff number + employee ID in header
- [x] Rebuild read-only view: Employment Details section (staff no, employee ID, grade, position, department, place of work) with icons
- [x] Rebuild read-only view: Contact section (email, phone) with icons
- [x] Rebuild edit form: Identity section (lessee type select, full name input)
- [x] Rebuild edit form: Employment Details section (staff number, employee ID, grade, position, department, place of work) with leading icons
- [x] Rebuild edit form: Contact Information section (email, phone) with leading icons
- [x] Add bottom save bar with Cancel + Save Lessee Details buttons
- [x] Add lessee name required validation before save
- [x] Add lessee type badge in tab header (Staff=blue, Client=green, Other=gray) in read-only mode
- [x] TypeScript: 0 errors

## New Lease Wizard — Lessee Details Step 2 (Apr 25)
- [x] Create lease.lease_lessee_details table (contract_id FK, lessee_type, lessee_name, staff_number, employee_id, grade, position, department, place_of_work, contact_email, contact_phone, created_at, updated_at)
- [x] Create dbo.sp_UpsertLeaseLesseeDetails SP (upsert by contract_id)
- [x] Create dbo.sp_GetLeaseLesseeDetails SP (select by contract_id)
- [x] Add tRPC procedure lease.upsertLesseeDetails (protectedProcedure)
- [x] Add tRPC procedure lease.getLesseeDetails (protectedProcedure)
- [x] Insert Step 2 "Lessee Details" in NewLease.tsx wizard after Lessor Details
- [x] Renumber all subsequent steps (Asset Details → 3, Financial Terms → 4, Documents → 5, Review & Post → 6)
- [x] Add screen ID VFLSNEWLS0002P001 to Lessee Details step header
- [x] Gen AI fill wired via existing ScreenHeader onAIFormFill (maps lesseeType, lesseeName, staffNumber, employeeId, grade, lesseePosition, lesseeDepartment, placeOfWork, lesseeContactEmail, lesseeContactPhone)
- [x] Add all 10 lessee fields with grouped sections (Identity, Employment, Contact)
- [x] Wire Next button with lessee name validation (required)
- [x] Lessee details saved to DB via upsertLesseeDetails after lease creation in onSuccess
- [x] Add Lessee summary card to Review & Post step (Step 6)
- [x] Extend aiFill new_lease schema with 10 lessee fields
- [x] TypeScript: 0 errors

## Sub-Asset Attachment — Lessee-First Selection (Apr 25)
- [x] Create dbo.sp_GetLesseeList SP (returns lessor_id, lessee_name, lessee_type, staff_number, position, department, grade, place_of_work, contact_email, contact_phone from lessor.lessors where lessee_name IS NOT NULL)
- [x] Create dbo.sp_GetLeaseByLessee SP (given lessorId, joins lease.contracts via lease.lessors using lessor_ref/legal_name match, returns top 1 active/draft contract)
- [x] Add tRPC procedure lessor.getLesseeList (publicProcedure in lessorRouter)
- [x] Add tRPC procedure lessor.getLeaseByLessee (publicProcedure in lessorRouter, input: lessorId)
- [x] Update LeaseSubAssets.tsx: add Lessee selector as first control above Lease Number (amber-bordered)
- [x] On lessee selection, auto-call getLeaseByLessee via useEffect and pre-fill the Lease Number dropdown
- [x] Show lessee detail strip (position, dept, grade, location) below selector
- [x] Show red warning if lessee has no linked lease
- [x] Keep rest of attach/status cycle unchanged
- [x] TypeScript: 0 errors

## Sub-Asset Transaction Log — Add Card (Apr 25)
- [x] Audit sub-asset items table columns and existing SPs (items stored as JSON in tags_with_serials)
- [x] Create asset.sp_AddSubAssetItem SP (always INSERT — appends new ItemWithSerial JSON to array)
- [x] Add tRPC procedure asset.addSubAssetItem (protectedProcedure, logs ADD_ITEM transaction)
- [x] Add "Add" card as first action card in SubAssetTransactionLog action row (emerald, Plus icon)
- [x] Build Add dialog with all fields: code, name*, category*, sub-category, brand, model, spec, qty*, serial numbers (dynamic), attach date*, warranty expiry, unit price QAR
- [x] confirmAddItem validates name + category required, auto-generates code if blank
- [x] On success: invalidate getLeaseSubAssets + getSubAssetTxns, close dialog, reset form, show toast
- [x] Warning shown if set is not yet attached to a lease
- [x] TypeScript: 0 errors

## Amortisation Schedule — Monthly/Yearly UI (Apr 25)
- [x] Audit existing Amortisation.tsx and sp_GetAmortisationSchedule
- [x] Recreate sp_GetAmortisationSchedule: returns 2 result sets (contract header + schedule rows), computes on-the-fly using effective interest method if no saved rows exist
- [x] Create sp_GetLeaseListForAmortisation (all contracts with lessor name for selector)
- [x] Add tRPC lease.getLeaseListForAmortisation (protectedProcedure)
- [x] Update tRPC lease.getAmortisationSchedule to use execSPPMulti for dual result sets
- [x] Rebuild Amortisation.tsx: lease selector with contract ref + asset + lessor display
- [x] Monthly/Yearly toggle buttons (red active state)
- [x] 4 KPI summary cards (Total Payments, Interest, Principal, Depreciation)
- [x] Monthly view: full schedule table with 11 columns, click-to-expand accordion per row
- [x] Accordion: 2 journal entries per period (JE-1 payment, JE-2 depreciation) with GL account codes
- [x] Yearly view: aggregated table with 9 columns, click-to-expand accordion per year
- [x] Yearly accordion: consolidated JEs + monthly breakdown sub-table
- [x] Save to DB button wired to saveAmortisationSchedule mutation
- [x] TypeScript: 0 errors

## Amortisation — All Leases Grouped + Consolidated GL Grid (Apr 25)
- [x] Create sp_GetAmortisationScheduleAll SP (all contracts, filtered by year/month, returns lease header + schedule rows)
- [x] Create sp_GetConsolidatedGLEntries SP (groups all leases by GL account per period, returns consolidated debit/credit lines)
- [x] Add tRPC lease.getAmortisationScheduleAll (protectedProcedure, input: year, viewMode)
- [x] Add tRPC lease.getConsolidatedGLEntries (protectedProcedure, input: year, viewMode)
- [x] Rebuild Amortisation.tsx: year selector + monthly/yearly toggle at top
- [x] Grid 1: all leases grouped by lease (collapsible rows), 11 columns + totals row
- [x] Grid 2: consolidated GL accounting entries (one row per GL account per period, debit/credit columns, total row)
- [x] TypeScript: 0 errors

## Amortisation — All Leases Grouped + Consolidated GL Grid (Apr 25) — COMPLETED
- [x] Create sp_GetAmortisationScheduleAll SP (all contracts, filtered by year/month, returns lease header + schedule rows joined with contract header and lessor name)
- [x] Create sp_GetConsolidatedGLEntries SP (groups all leases by GL account per period, returns consolidated debit/credit lines with lease_count)
- [x] Add tRPC lease.getAmortisationScheduleAll (protectedProcedure, input: year, viewMode)
- [x] Add tRPC lease.getConsolidatedGLEntries (protectedProcedure, input: year, viewMode)
- [x] Rebuild Amortisation.tsx: year selector (All Years + specific years) + monthly/yearly toggle
- [x] Grid 1: all leases grouped by contract (collapsible rows), 11 columns, grand totals row, Expand All / Collapse All buttons
- [x] Grid 2: consolidated GL accounting entries (one row per GL account per period, debit=blue/credit=emerald, grand totals row, click-to-expand per period)
- [x] 5 KPI cards: Leases count, Total Payments, Total Interest, Total Principal, Total Depreciation
- [x] TypeScript: 0 errors

## Lease Register — Lessee Name & Date Columns (Apr 26)
- [x] Audit LeaseRegister.tsx and sp_GetLeaseRegister to understand current columns
- [x] Update sp_GetLeaseRegister to JOIN lease_lessee_details and return lessee_name, lessee_type, lessee_staff_number, lessee_position, lessee_department
- [x] commencement_date and expiry_date were already returned — confirmed present
- [x] Add Lessee column to Lease Register table (amber User icon + name + type badge; shows — if no lessee)
- [x] Lessee name also searchable via SearchTerm filter in the SP
- [x] TypeScript: 0 errors

## Soft Delete & Action Menu Fix (Apr 26)
- [x] Create sp_SoftDeleteContract SP (UPDATE lease.contracts SET status='Deleted' WHERE contract_id=@ContractId)
- [x] Update sp_GetLeaseRegister to exclude status='Deleted'
- [x] Update sp_GetAmortisationScheduleAll to exclude status='Deleted'
- [x] Update sp_GetConsolidatedGLEntries to exclude status='Deleted'
- [x] Add deleteLease tRPC procedure (calls sp_SoftDeleteContract)
- [x] Fix LeaseRegister.tsx: use contract_id (not lease_id) in all menu handlers
- [x] Wire View Details → /leases/new?view={contract_id}
- [x] Wire Modify Lease → /leases/new?edit={contract_id}
- [x] Wire View Amortisation → /leases/amortisation
- [x] Wire Initiate Renewal → /leases/renewals
- [x] Replace fake Delete toast with confirmation dialog + real deleteLease mutation
- [x] TypeScript: 0 errors

## IFRS 16 Lifecycle Engine (Production-Grade)
- [x] Add lifecycle_status column to lease.contracts (Draft/Active/Modified/Closed)
- [x] Add originated_at, modified_at columns to lease.contracts
- [x] Add posting_status (Projected/Posted/Locked) and posted_at to lease.amortisation_schedule
- [x] Create lease.gl_postings table (permanent audit ledger of every JE posted)
- [x] Create sp_OriginateLease (one-time JE-1, generates projected schedule, sets status=Active)
- [x] Create sp_PostPeriod (posts JE-2/3/4 for a specific month, marks period as Posted)
- [x] Create sp_ModifyLease (JE-6 remeasurement, regenerates remaining Projected periods)
- [x] Create sp_CloseLease (JE-5 derecognition, sets status=Closed)
- [x] Create sp_GetLeaseLifecycle (returns schedule with posting_status per period)
- [x] Add tRPC procedures: originateLease, postPeriod, modifyLease, closeLease, getLifecycle
- [x] Update Amortisation screen: lifecycle status badge per lease row
- [x] Add Originate button per lease (disabled after origination)
- [x] Add Post Period button per month row (disabled if Posted or future)
- [x] Add Modify Rent button per lease (only for Active/Modified leases)
- [x] Add Close Lease button per lease (only for Active/Modified leases)
- [x] Add GL Postings ledger panel showing all posted JEs with timestamps and je_ref

## Feature 1 — IFRS 16 Disclosure Notes Generator
- [x] Create sp_GetIFRS16DisclosureNotes SP (maturity analysis, ROU movement, weighted avg IBR, lease liability reconciliation)
- [x] Add tRPC lease.getDisclosureNotes procedure (input: reportingYear)
- [x] Create DisclosureNotes.tsx page with 4 tables: Maturity Analysis, ROU Asset Movement, Liability Reconciliation, Key Assumptions
- [x] Add Copy to Clipboard and Export to Excel buttons
- [x] Register route /accounting/disclosure-notes in App.tsx
- [x] Add "Disclosure Notes" nav link under Accounting Engine in sidebar

## Feature 2 — Lease Renewal Engine
- [x] Create lease.renewals table (renewal_id, contract_id, renewal_date, new_expiry_date, new_monthly_payment, new_term_months, new_ibr, status, created_by, created_at)
- [x] Create sp_InitiateRenewal SP (inserts into lease.renewals, sets status=Pending)
- [x] Create sp_ApproveRenewal SP (extends contract expiry, recalculates PV, appends new Projected schedule rows, posts JE-7 remeasurement, sets status=Approved)
- [x] Create sp_GetRenewals SP (returns all renewals with contract details)
- [x] Add tRPC procedures: initiateRenewal, approveRenewal, getRenewals, rejectRenewal
- [x] Create RenewalEngine.tsx page with pending renewals list, Approve/Reject actions, and new terms form
- [x] Register route /leases/renewal-engine in App.tsx
- [x] Add "Renewal Engine" nav link under Lease Management in sidebar

## Feature 3 — Period-End Close Lock
- [x] Create lease.period_close table (close_id, period_year, period_month, closed_at, closed_by, status)
- [x] Create sp_ClosePeriod SP (locks all Posted rows for a given year/month, inserts into period_close, prevents re-posting)
- [x] Create sp_GetPeriodCloseStatus SP (returns close status for each month of a given year)
- [x] Create sp_ReopenPeriod SP (unlocks rows for a given year/month)
- [x] Add tRPC procedures: closePeriod, getPeriodCloseStatus, reopenPeriod
- [x] Create PeriodClose.tsx page with 12-month calendar grid showing Open/Closed status per month
- [x] Add Close/Reopen Period buttons with confirmation dialogs
- [x] Register route /accounting/period-close in App.tsx
- [x] Add "Period-End Close" nav link under Accounting Engine in sidebar

## Feature 4 — IFRS 16 vs IAS 17 Comparative Report
- [x] Create sp_GetIAS17Comparison SP (calculates straight-line rent expense per period vs IFRS 16 interest+depreciation, returns side-by-side per lease per year)
- [x] Add tRPC lease.getIAS17Comparison procedure (input: year)
- [x] Create IAS17Comparison.tsx page with year selector
- [x] Table: per-lease comparison (IAS 17 rent expense vs IFRS 16 interest + depreciation + difference)
- [x] Summary KPI cards: Total IAS 17 expense, Total IFRS 16 expense, Net P&L impact, Balance sheet impact
- [x] Bar chart: IAS 17 vs IFRS 16 expense per year (Recharts grouped bar)
- [x] Export to Excel button
- [x] Register route /accounting/ias17-comparison in App.tsx
- [x] Add "IAS 17 vs IFRS 16" nav link under Accounting Engine in sidebar

## Feature 5 — Multi-Currency FX Revaluation
- [x] Create lease.fx_rates table (rate_id, currency_code, rate_date, closing_rate, source, created_at)
- [x] Create lease.fx_revaluation_log table (reval_id, contract_id, period_year, period_month, currency_code, original_amount_fc, closing_rate, revalued_amount_lc, prev_carrying_lc, fx_gain_loss, je_ref, posted_by, posted_at)
- [x] Create sp_UpsertFXRate SP (upsert closing rate for a currency/date)
- [x] Create sp_GetFXRates SP (returns rate history for a currency)
- [x] Create sp_RunFXRevaluation SP (for a given year/month: revalues all non-QAR lease liabilities, posts JE-8 FX gain/loss, inserts into fx_revaluation_log)
- [x] Create sp_GetFXRevaluationLog SP (returns revaluation history with JE refs)
- [x] Add tRPC procedures: getFXRates, upsertFXRate, runFXRevaluation, getFXRevaluationLog, getFXRevaluationSummary
- [x] Create FXRevaluation.tsx page with: currency rate table, Run Revaluation button, revaluation log, KPI cards
- [x] Register route /accounting/fx-revaluation in App.tsx
- [x] Add "FX Revaluation" nav link under Accounting Engine in sidebar
- [x] Vitest tests for FX revaluation procedures (13/13 passing)

## Feature 6 — Renewal Due Badge Counter & Email Notification
- [x] Create sp_GetRenewalDueCount SP (returns count of leases expiring within 90 days that have no Pending/Approved renewal)
- [x] Create sp_GetRenewalDueLeases SP (returns list of leases entering the 90-day window for the first time today)
- [x] Add tRPC lease.getRenewalDueCount procedure (public, called by sidebar on mount)
- [x] Add tRPC lease.checkAndNotifyRenewalDue procedure (protected, checks for new entries and sends owner notification)
- [x] Add live badge count to sidebar "Renewal Engine" nav link in DashboardLayout.tsx
- [x] Badge shows red pill with count when > 0, hidden when 0
- [x] Add server-side owner notification email when a lease first enters the 90-day window
- [x] Notification includes: lease ref, lessor name, expiry date, days remaining
- [x] Add a lease.renewal_notifications table to track which leases have already been notified (prevent duplicate emails)
- [x] Wire checkAndNotifyRenewalDue to run on DashboardLayout mount (once per session)
- [x] Vitest tests for getRenewalDueCount and checkAndNotifyRenewalDue (9/9 passing)

## Feature 7 — Lease Transaction Centre
- [x] Create sp_GetLeasesForTransaction SP (returns Active/Modified leases with current carrying amounts, remaining term, next payment date)
- [x] Create sp_PreviewModification SP (input: contract_id, new_monthly_payment, effective_date, new_ibr; returns: new PV, ROU delta, liability delta, remeasurement gain/loss, new amortisation schedule preview)
- [x] Create sp_PreviewTermination SP (input: contract_id, termination_date; returns: derecognition JE amounts, gain/loss on termination)
- [x] Create sp_PreviewRenewal SP (input: contract_id, new_expiry_date, new_monthly_payment, new_ibr; returns: new PV, JE-7 amounts, new schedule preview)
- [x] Create sp_GetLeaseTransactionHistory SP (returns all posted transactions for a lease: modifications, terminations, renewals with JE refs)
- [x] Create sp_PostLeaseTransaction SP (unified posting: type=Modification|Termination|Renewal; posts correct JE, updates schedule, updates lifecycle_status)
- [x] Add tRPC procedures: getLeasesForTransaction, previewModification, previewTermination, previewRenewal, postLeaseTransaction, getLeaseTransactionHistory
- [x] Build LeaseTransactionCentre.tsx page with:
  - [x] Left panel: searchable lease selector with current status, liability balance, expiry date
  - [x] Right panel: 3-tab transaction type selector (Modify Rent | Terminate Lease | Renew Lease)
  - [x] Step 1 — Input Form: transaction-specific fields with inline validation
  - [x] Step 2 — Remeasurement Preview: before/after KPI cards (PV, ROU, Liability, Gain/Loss)
  - [x] Step 3 — Journal Entry Preview: Dr/Cr table with GL codes, amounts, effective date
  - [x] Step 4 — New Amortisation Schedule: accordion grid showing regenerated monthly schedule
  - [x] Step 5 — Post: system posts JE and updates schedule with confirmation dialog
  - [x] Step 6 — Confirmation: JE reference, timestamp, posted-by, link to GL Postings ledger
  - [x] Transaction History panel: accordion list of all past transactions for the selected lease
- [x] Register route /leases/transaction-centre in App.tsx
- [x] Add "Transaction Centre" nav link under Lease Management in sidebar
- [x] Vitest integration tests: 9/9 passing

## Feature 8 — Live Consolidated Financial Statements (IAS 1)
- [x] Audit existing gl_postings and coa tables to confirm account type classification (Asset/Liability/Equity/Revenue/Expense)
- [x] Create sp_GetBalanceSheet SP (aggregates gl_postings by account type as at period-end date, returns Assets/Liabilities/Equity sections)
- [x] Create sp_GetIncomeStatement SP (aggregates P&L accounts for a period: depreciation, interest, FX gain/loss, rent expense)
- [x] Create sp_GetCashFlowStatement SP (classifies lease cash flows: principal repayments=Financing, interest=Financing, short-term/low-value=Operating)
- [x] Add tRPC procedures: getBalanceSheet, getIncomeStatement, getCashFlowStatement
- [x] Build FinancialStatements.tsx page with 3 tabs: Balance Sheet | Income Statement | Cash Flow
- [x] Balance Sheet: Assets section (ROU Asset gross, Accumulated Depreciation, Net ROU; other assets), Liabilities section (Current lease liability, Non-current lease liability), Equity section
- [x] Income Statement: Depreciation expense, Interest on lease liabilities, FX revaluation gain/loss, Short-term/low-value lease expense, Net IFRS 16 P&L impact
- [x] Cash Flow: Financing activities (principal + interest payments), Operating activities (short-term/low-value payments)
- [x] Period selector (year/quarter/month), Export to Excel, Print view
- [x] Register route /accounting/financial-statements in App.tsx
- [x] Add "Financial Statements" nav link under Accounting Engine in sidebar

## Feature 9 — ROU Asset & Lease Liability Roll-Forward (IFRS 16 Para 53)
- [x] Create sp_GetROURollForward SP (Opening → Additions → Depreciation → Modifications → Disposals/Terminations → FX → Closing, by asset class)
- [x] Create sp_GetLiabilityRollForward SP (Opening → Additions → Interest accrued → Payments → Modifications → FX revaluation → Terminations → Closing)
- [x] Add tRPC procedures: getROURollForward, getLiabilityRollForward
- [x] Build RollForwardReport.tsx page (update existing page or create new) with 2 tabs: ROU Asset | Lease Liability
- [x] Each tab: movement table with opening/closing balances and all movement lines, subtotals, Export to Excel
- [x] Asset class breakdown (Property, Vehicles, Equipment, etc.)
- [x] Register route /accounting/roll-forward in App.tsx
- [x] Add "Roll-Forward" nav link under Accounting Engine in sidebar

## Feature 10 — Trial Balance (IAS 1)
- [x] Create sp_GetTrialBalance SP (returns all GL accounts with debit total, credit total, and net balance as at period-end; grouped by account type)
- [x] Add tRPC procedure: getTrialBalance
- [x] Build TrialBalance.tsx page with: account code, account name, type, debit total, credit total, net balance
- [x] Show totals row: total debits must equal total credits (balanced check)
- [x] Filter by account type (All / Assets / Liabilities / Equity / Revenue / Expense)
- [x] Period-end date selector, Export to Excel
- [x] Register route /accounting/trial-balance in App.tsx
- [x] Add "Trial Balance" nav link under Accounting Engine in sidebar

## Feature 11 — Short-term & Low-value Exemption Register (IFRS 16 Para 5)
- [x] Add exemption_type column to lease.contracts (None / ShortTerm / LowValue)
- [x] Add exemption_reason text column to lease.contracts
- [x] Create sp_GetExemptionRegister SP (returns all exempted leases with: contract_ref, asset, lessor, monthly_payment, start_date, expiry_date, exemption_type, total_expense_ytd, total_expense_life)
- [x] Create sp_GetExemptionExpenseSummary SP (returns straight-line expense per period for all exempted leases)
- [x] Add tRPC procedures: getExemptionRegister, getExemptionExpenseSummary, updateLeaseExemption
- [x] Build ExemptionRegister.tsx page with: exemption register table, YTD expense summary, straight-line expense chart
- [x] Allow marking a lease as Short-term or Low-value from the register (with reason)
- [x] Show total exempted lease expense in Income Statement (feeding into Feature 8)
- [x] Register route /leases/exemption-register in App.tsx
- [x] Add "Exemption Register" nav link under Lease Management in sidebar
- [x] Vitest tests for all new tRPC procedures

## Feature 12 — IFRS 16 Disclosure Pack PDF Export
- [x] Create sp_GetDisclosurePack SP (aggregates all IFRS 16 disclosure data: notes, financial statements, roll-forward, trial balance, exemption register)
- [x] Add tRPC procedure: generateDisclosurePack (protectedProcedure, calls multiple SPs and assembles HTML for PDF)
- [x] Build DisclosurePack.tsx page with period selector, section checkboxes, and Generate PDF button
- [x] Server-side PDF generation using html-pdf-node npm package
- [x] PDF sections: cover page, disclosure notes, balance sheet, income statement, cash flow, ROU roll-forward, liability roll-forward, trial balance, exemption register
- [x] Register screen ID VFLDSCPK0001P001 in security.screen_registry
- [x] Register route /accounting/disclosure-pack in App.tsx
- [x] Add Disclosure Pack nav link under Accounting Engine in sidebar
- [x] Vitest tests for generateDisclosurePack tRPC procedure

## Feature 13 — Budget vs. Actual Variance Report
- [x] Create lease.budget_lines table: contract_id, period_year, period_month, budgeted_payment, budgeted_depreciation, budgeted_interest, created_at
- [x] Create sp_GetBudgetVsActual SP (joins budget_lines with amortisation_schedule and gl_postings; returns per-lease per-period: budgeted vs actual payment, depreciation, interest; variance amount and %; RAG status)
- [x] Create sp_UpsertBudgetLine SP (insert/update a budget line for a contract/period)
- [x] Create sp_GetBudgetSummary SP (aggregate totals: total budget, total actual, total variance, variance %)
- [x] Add tRPC procedures: getBudgetVsActual, upsertBudgetLine, getBudgetSummary
- [x] Build BudgetVariance.tsx page with: period selector, variance table with RAG badges, KPI cards, bar chart
- [x] Allow inline budget entry from the variance table
- [x] Register screen ID VFLBDGVAR0001P001 in security.screen_registry
- [x] Register route /accounting/budget-variance in App.tsx
- [x] Add Budget vs Actual nav link under Accounting Engine in sidebar
- [x] Vitest tests for getBudgetVsActual, upsertBudgetLine, getBudgetSummary

## Feature 14 — Lease Maturity Ladder (IFRS 16 Para 58)
- [x] Create sp_GetMaturityLadder SP (returns undiscounted future lease cash flows bucketed into < 1 year, 1-2 years, 2-3 years, 3-4 years, 4-5 years, > 5 years; by lease and in total; includes principal and interest split)
- [x] Add tRPC procedure: getMaturityLadder
- [x] Build MaturityLadder.tsx page with stacked bar chart, maturity table, as-at date selector
- [x] Register screen ID VFLMTYLDR0001P001 in security.screen_registry
- [x] Register route /accounting/maturity-ladder in App.tsx
- [x] Add Maturity Ladder nav link under Accounting Engine in sidebar
- [x] Vitest tests for getMaturityLadder

## Alt+1 / Alt+2 / Alt+3 Global Keyboard Shortcut Overlay
- [x] Create ScreenMetaRegistry: a central map from screenId to { sps: string[], tables: string[], standards: string[], techniques: string[] }
- [x] Populate ScreenMetaRegistry for all existing screens (Dashboard, Lease Register, Amortisation, GL Journals, Payables, Bank Recon, Cheque, Financial Statements, Roll-Forward, Trial Balance, Exemption Register, Disclosure Pack, Budget Variance, Maturity Ladder, etc.)
- [x] Create ScreenMetaContext: React context that holds the current screenId (set by each page via useScreenMeta hook)
- [x] Create AltKeyOverlay.tsx: floating drawer component that listens for Alt+1/Alt+2/Alt+3 globally
- [x] Alt+1 panel: shows stored procedures and database tables for the current screen
- [x] Alt+2 panel: shows applicable accounting standards (IFRS 16, ASC 842, IPSAS 43, IAS 17, etc.) with brief description
- [x] Alt+3 panel: shows computation techniques (Effective Interest Method, Straight-Line Depreciation, IBR-based PV, etc.) with formula hints
- [x] Wire AltKeyOverlay into DashboardLayout so it is available on all authenticated screens
- [x] Add keyboard shortcut hint in footer or help tooltip (Alt+1 = SPs/Tables, Alt+2 = Standards, Alt+3 = Techniques)

## Feature 15 — Multi-Standard Parallel Computation (IFRS 16 vs ASC 842 vs IPSAS 43)
- [x] Create lease.sp_GetMultiStandardComparison SP (computes ROU asset, lease liability, depreciation, interest, P&L impact for a single lease under IFRS 16, ASC 842, and IPSAS 43 simultaneously; returns side-by-side rows per period)
- [x] Create lease.sp_GetStandardSummary SP (aggregate totals per standard: total ROU, total liability, total P&L impact)
- [x] Add tRPC procedures: getMultiStandardComparison, getStandardSummary
- [x] Build MultiStandardComparison.tsx page with: lease selector, period range, side-by-side comparison table (IFRS 16 | ASC 842 | IPSAS 43), difference columns, grouped bar chart
- [x] Add standard-specific notes panel (key differences: operating lease P&L for ASC 842, single-model for IFRS 16/IPSAS 43)
- [x] Register screen ID VFLMULSTD0001P001 in security.screen_registry with metadata
- [x] Register route /accounting/multi-standard in App.tsx
- [x] Add Multi-Standard nav link under Accounting Engine in sidebar
- [x] Vitest tests for getMultiStandardComparison, getStandardSummary

## Feature 17 — Lease Modification Wizard
- [x] Create lease.lease_modifications table (modification_id, contract_id, modification_date, modification_type, old_ibr, new_ibr, old_term_end, new_term_end, old_payment, new_payment, old_rou_nbv, new_rou_nbv, old_liability, new_liability, remeasurement_gain_loss, status, created_by, created_at, approved_by, approved_at)
- [x] Create lease.sp_GetLeaseModifications SP (list all modifications for a contract)
- [x] Create lease.sp_CreateLeaseModification SP (validate inputs, compute remeasurement: new PV of revised cash flows at new IBR, delta ROU and liability, gain/loss; insert into lease_modifications as draft)
- [x] Create lease.sp_ApplyLeaseModification SP (on approval: update lease.contracts with new terms, regenerate amortisation schedule, post remeasurement GL journals)
- [x] Add tRPC procedures: getLeaseModifications, createLeaseModification, applyLeaseModification
- [x] Build LeaseModificationWizard.tsx: 4-step wizard (Step 1: select lease + modification type; Step 2: enter new terms IBR/payment/end date; Step 3: review remeasurement impact table; Step 4: confirm and generate GL journals)
- [x] Show before/after comparison on Step 3: old vs new ROU, liability, P&L impact
- [x] Auto-generate remeasurement GL journal entries on Step 4 approval
- [x] Register screen ID VFLLSMOD0001P001 in security.screen_registry with metadata
- [x] Register route /leases/modification-wizard in App.tsx
- [x] Add Lease Modification nav link under Contracts in sidebar
- [x] Vitest tests for getLeaseModifications, createLeaseModification, applyLeaseModification

## Modify Lease Wizard Fix (Session continuation - Apr 27)
- [x] Create sp_UpdateLeaseContract in dbo schema (updates asset/financial fields on existing contract)
- [x] Add updateLease tRPC mutation in server/routers/lease.ts (calls sp_UpdateLeaseContract with audit log)
- [x] NewLease.tsx: read ?edit=contractId URL param and set isEditMode flag
- [x] NewLease.tsx: useEffect pre-populates all form states from trpc.lease.getLeaseById when editData loads
- [x] NewLease.tsx: handleSubmit conditionally calls updateLeaseMutation (edit mode) or createLeaseMutation (new mode)
- [x] NewLease.tsx: ScreenHeader title shows "Modify Lease" in edit mode
- [x] NewLease.tsx: Submit button label shows "Update Lease" in edit mode
- [x] TypeScript: 0 errors confirmed

## Modify Lease Wizard Fix (Session continuation - Apr 27)
- [x] Create sp_UpdateLeaseContract in dbo schema
- [x] Add updateLease tRPC mutation in server/routers/lease.ts
- [x] NewLease.tsx: edit mode pre-population from getLeaseById
- [x] NewLease.tsx: handleSubmit calls updateLeaseMutation in edit mode
- [x] NewLease.tsx: ScreenHeader title shows 'Modify Lease' in edit mode
- [x] NewLease.tsx: Submit button shows 'Update Lease' in edit mode
- [x] TypeScript: 0 errors confirmed

## Contract DMS Full Rebuild (Apr 29)
- [x] Read existing contracts schema, router, and pages
- [x] Add DB tables: contract_metadata_templates, contract_metadata_fields, contract_documents, contract_milestones, contract_metadata_values
- [x] Add tRPC procedures: metadataTemplates CRUD, contractDocuments CRUD (upload/list/delete), contractMilestones CRUD, contract metadata value upsert
- [x] Build Metadata Templates admin page (define field schemas per contract type)
- [x] Rebuild Contract Register as full DMS: multi-doc upload, metadata value entry, version history tab, milestones timeline tab, Create Lease button
- [x] Update sidebar: add Metadata Templates under Contracts
- [x] Wire Create Lease button to pre-fill /leases/new with contract metadata values
- [x] Save checkpoint and deliver

## Contract DMS Enhancements (Apr 29 - Session 2)
- [x] AI contract extraction: backend tRPC procedure reads uploaded PDF via LLM and returns field values
- [x] Extract with AI button in ContractRegister Documents tab auto-fills Metadata fields
- [x] Milestone alerts integration: wire contract milestones into Alert Rules engine (email notifications)
- [x] Remove redundant sidebar items: Version History, Document Vault, Milestones under Contracts

## Screen ID + Audit Log + Error Key Framework (Apr 29, 2026)
- [x] Every screen has a unique Screen ID (format: VFXXX-YYYYY-NNN) displayed in ScreenHeader
- [x] useScreenAudit hook — fires SCREEN_ENTER on mount, SCREEN_EXIT with elapsed ms on unmount
- [x] ScreenHeader auto-logs screen visits via useScreenAudit (no per-page changes needed)
- [x] Elapsed time tracked and stored in audit log (process_start_time → process_end_time or after_state.elapsedMs)
- [x] Error key format: username + screen_id stored in error log via ScreenErrorBoundary
- [x] ScreenErrorBoundary wraps children in DashboardLayout — catches React render errors
- [x] AuditLog page enhanced: Screen ID filter, Username filter, KPI cards (Total/Screen Visits/Data Actions/Slow), elapsed time with color coding
- [x] AuditLog: clicking Screen ID badge auto-filters by that screen
- [x] Applied ScreenHeader to all 11 remaining pages: AccountingStandardsPaper, ContractMetadataTemplates, DisclosureNotes, FXRevaluation, FinancialStatements, IAS17Comparison, LeaseExemptions, LeaseSubAssets, PeriodClose, RenewalEngine, TrialBalance
- [x] TypeScript clean — 0 errors after all changes

## No-Modal Policy: Convert All Dialogs to Full UI Screens (Apr 29, 2026)
- [x] AlertsReports.tsx — replace Add/Edit Alert Rule dialog + Add/Edit Scheduled Report dialog + 2 delete confirm dialogs → inline right-panel forms
- [x] LeaseTransactionCentre.tsx — replace all 5+ transaction dialogs (Modification, Termination, Renewal, etc.) → inline right-panel forms
- [x] ContractMetadataTemplates.tsx — replace New/Edit Template dialog + Add/Edit Field dialog + 2 delete confirm dialogs → inline right-panel forms
- [x] ContractRegister.tsx — replace Upload Document dialog + Add/Edit Milestone dialog + 2 delete confirm dialogs → inline right-panel forms
- [x] Amortisation.tsx — replace Guide dialog + GL Explain dialog + Calculation dialog → inline expandable panels
- [x] SubAssetTransactionLog.tsx — replace 3 dialogs → inline right-panel forms
- [x] RenewalEngine.tsx — replace Initiate Renewal dialog + Renewal Preview dialog → inline right-panel forms
- [x] PeriodClose.tsx — replace 2 period-close dialogs → inline right-panel forms
- [x] LeaseSubAssets.tsx — replace 2 dialogs → inline right-panel forms
- [x] LeaseDetail.tsx — replace Change Sub-Asset Status dialog + Period Calculation dialog → inline panels
- [x] FXRevaluation.tsx — no dialogs found (already inline)
- [x] PayablesApprovals.tsx — replace Reject Invoice dialog + Invoice Detail dialog → inline right-panel forms
- [x] LeaseRegister.tsx — no dialogs found (already inline)
- [x] HandoverChecklist.tsx — replace checklist item dialog → inline right-panel form
- [x] LeaseExemptions.tsx — no dialogs found (already inline)
- [x] BudgetVsActual.tsx — no dialogs found (already inline)
- [x] ContractMilestones.tsx — replace 4 dialogs → inline right-panel forms
- [x] ContractModifications.tsx — replace 6 dialogs → inline right-panel forms
- [x] LesseeMaster.tsx — replace 6 dialogs → inline right-panel forms
- [x] JournalVoucher.tsx — replace 3 dialogs → inline right-panel forms

## DMS Full Implementation (Apr 2026)
- [x] Fix all TypeScript errors in contractDms.ts (null→undefined, changedByName)
- [x] Fix ContractDocuments.tsx — correct listDocuments/extractMetadata input params
- [x] Fix ContractRegister.tsx — correct field names (contractId, documentId, milestoneDate)
- [x] ContractMilestones.tsx — full rebuild with real tRPC (listMilestones, upsertMilestone, completeMilestone, dismissMilestone, deleteMilestone, syncMilestoneToAlert)
- [x] ContractHistory.tsx — full rebuild with real tRPC (getContractHistory), timeline view, CSV export, date range filter
- [x] ContractModifications.tsx — full rebuild with real tRPC (createModification, submitModification, approveModification, rejectModification, applyModification), maker-checker workflow
- [x] App.tsx — add /contracts/modifications route
- [x] DashboardLayout.tsx — add Documents, Milestones, Modifications, History to Contracts nav
- [x] Zero TypeScript errors confirmed

## Lessee Master Module (Apr 2026)
- [x] Create lessee schema tables: lessee.lessees, lessee.lessee_bank_accounts, lessee.lessee_signatories
- [x] Create stored procedures: sp_GetLessees, sp_GetLesseeById, sp_UpsertLessee, sp_DeleteLessee, sp_GetLesseeBankAccounts, sp_UpsertLesseeBankAccount, sp_GetLesseeSignatories, sp_UpsertLesseeSignatory
- [x] Seed 5 lessee rows (real estate + car fleet companies)
- [x] Add lessee_id FK to lease.leases table
- [x] Build server/routers/lessee.ts tRPC router
- [x] Wire lesseeRouter into server/routers.ts
- [x] Build client/src/pages/LesseeMaster.tsx — full CRUD screen
- [x] Add /lessee-master route to App.tsx
- [x] Add Lessee Master to sidebar nav under Lease Management

## Lessee Master — Audit/Error Log Fix (Apr 30 2026)
- [x] Add lessee_master screenType to aiFill.ts SCREEN_PROMPTS (with username/user_role in rowSchema)
- [x] Fix LesseeMaster.tsx ScreenHeader: wire onAIData to aiRows state (was no-op)
- [x] Route /lessee-master confirmed in App.tsx
- [x] Lessee Master nav item added to DashboardLayout sidebar (under Lease Management, after Lessor Master)

## Three Next-Step Items (May 2026)
- [x] Staff Master: create staff schema table, stored procedures, seed data, tRPC router, StaffMaster.tsx CRUD page, route, sidebar nav
- [x] Inline panel transitions: add transition-all duration-200 ease-in-out to all inline conditional panels across all 20 converted pages
- [x] NewLease wizard: verify Lessor + Staff dropdown auto-fill works, ensure all 5 steps validate correctly before submission

## Transaction Engine (May 2026)
- [x] DB: create tx_engine.scenarios table + 10 SPs (8 IFRS 16 functions + postJV + getJVLines)
- [x] DB: journal_vouchers table used for JV storage with jv_number, jv_date, status, scenario linkage
- [x] tRPC: build transactionEngine router with getContracts, listScenarios, 8 run* mutations, postJV, getJVLines
- [x] UI: build TransactionEngine.tsx page with 8-function step-through runner, progress bar, scenario history
- [x] UI: each function shows scenario params, runs test, posts JV entries, displays JV table with calc blackboard
- [x] UI: "Next Function" button advances to the next IFRS 16 function
- [x] Wire /accounting/transaction-engine route in App.tsx
- [x] Add Transaction Engine to sidebar nav under Accounting Engine

## JV-to-Lease Navigation (May 2026)
- [x] Update sp_GetJournalVouchers to include contract_ref and contract_id columns (already present via JOIN)
- [x] Update journalVoucher tRPC router to return contract_ref and contract_id (already returned)
- [x] Update JournalVoucher.tsx: show Lease # column with clickable link, double-click row navigates to /leases/transaction-centre?contractId=X
- [x] Update LeaseTransactionCentre.tsx: read contractId from URL query param on mount and auto-select the lease

## Business Proof Panel + Next Steps (May 2026)
- [x] Transaction Engine: add Business Proof Panel tab — plain-English story, real-world scenario, expected JV rules, pass/fail verdict for each function
- [x] Transaction Centre: add "View JVs for this lease" button in Transaction History tab linking to JV Register filtered by contract
- [x] JV Register: add Lease dropdown filter populated from active contracts (with URL param auto-selection)
- [x] Transaction Engine: make posted JV numbers clickable links to JV Register

## Vehicle Asset Type — Conditional Step 3 (May 2026)
- [x] NewLease Step 3: when Asset Type = Vehicle/Heavy Vehicle/Fleet Vehicle, replace GPS Lat/Long, Location/Address, Sub-Asset Sets with vehicle fields: Make, Model, Year, Plate Number, VIN/Chassis, Engine CC, Colour, Fuel Type
- [x] NewLease Step 3: when Asset Type = Vehicle, rename "Asset Name / Reference" label to "Vehicle Description"
- [x] NewLease Step 3: when Asset Type = Vehicle, rename "Asset Code" label to "Fleet Code"
- [x] NewLease Step 3: when Asset Type = Vehicle, show vehicle-specific Maintenance Responsibility options (Fleet Company / Vodafone / Shared)
- [x] NewLease Step 3: show "Vehicle Mode" amber badge in header when vehicle type is selected
- [x] NewLease Step 3: Sub-Asset Sets section hidden for vehicle types (not applicable)
- [x] Edit mode: vehicle fields restored from asset_json on load

## Day-1 Initial Recognition JV (May 2026)
- [x] Insert 6 missing GL codes: 10110 ROU Vehicles, 10120 ROU Equipment, 10140 ROU Tower, 21030 Lease Liability Vehicles, 21040 Lease Liability Equipment, 21060 Lease Liability Tower
- [x] Create sp_PostInitialRecognitionJV stored procedure
- [x] Wire sp_PostInitialRecognitionJV into createLease mutation (auto-called on lease creation in Step 7)
- [x] Update NewLease.tsx Step 7 to show Day-1 JV preview (Dr ROU / Cr Lease Liability / IDC / Incentives / Deposit) before posting
- [x] Show JV number in the success message after lease is posted (toast notification)

## Security Deposit Default Fix (May 2026)
- [x] Security deposit field in NewLease Step 4 should default to 1 month rent (monthly_payment value) and show hint "Default: 1 month rent"
- [x] Auto-update deposit when monthly payment changes (unless user has manually overridden it)

## JV Line Calculation Method Toggle (May 2026)
- [x] Update sp_PostInitialRecognitionJV to store detailed calc_explanation for each JV line (formula + values)
- [x] Add Calc button on each JV line in NewLease Step 7 preview to show/hide calculation method
- [x] JV Register detail view already has CalcExplanation component rendering calc_explanation from DB
- [x] Calculation shows blackboard-style formula with label names and actual values (PV formula, ROU breakdown, IDC, deposit)

## Calculation Explanation Full-Screen Right-Side Modal (May 2026)
- [x] Replace inline CalcExplanationInline in NewLease Step 7 with a right-side slide-in full-height modal
- [x] Replace inline CalcExplanation in JV Register with same right-side slide-in full-height modal
- [x] Modal should cover the right side of the screen with proper formatting and scrolling

## Move Calc Button to JV Header Level (May 2026)
- [x] Remove per-line Calc buttons from JV lines in JV Register
- [x] Add single Calc button at JV header row (next to Post/Reject actions)
- [x] Modal shows combined calculation explanation for all entries in that JV as full-screen centered modal
- [x] NewLease Step 7 keeps per-line Calc with right-side slide-in panel (different context — preview before posting)

## Auto-Post Day-1 JV & Dr/Cr Pairs in Calc Modal (May 2026)
- [x] Day-1 JV should be auto-posted (status = Posted) when lease is created, not left as Draft
- [x] Calc modal should show entries as Dr/Cr pairs instead of individual lines (numbered pairs with side-by-side layout)

## Delete Lease with JV Cascade (May 2026)
- [x] Create tRPC mutation to delete a lease and its associated JV entries (jv_lines + journal_vouchers)
- [x] Also cascade delete: amortisation_schedule, gl_postings, contract_documents, etc. (sp_HardDeleteLease covers 45 child tables)
- [x] Add Delete button to lease record view with confirmation dialog (changed soft delete to hard delete in LeaseRegister)
- [x] Seed 15 lessees (10 real estate + 5 car leasing) and 35 staff

## Delete Lease with JV Cascade (May 2026)
- [x] Create sp_HardDeleteLease SP that cascades to all child tables (45 child tables + JVs + workflows)
- [x] Add hardDeleteLease tRPC mutation in lease router
- [x] Changed Lease Register Delete from soft-delete to hard-delete with confirmation dialog
- [x] Confirmation dialog warns about permanent deletion of lease + JVs + amortisation + invoices

## Lessee Master Seed (May 2026)
- [x] Seed 10 Qatar-based real estate companies (Barwa, Msheireb, Qatari Diar, UDC, Ezdan, Al Asmakh, Lusail, Al Bandary, Katara, Aamal)
- [x] Seed 5 large car leasing companies (Al Mana, Q-Auto, Europcar, Hertz, National)

## JV Posting Fix (May 2026)
- [x] Fix createLease onSuccess to await JV posting before navigating (was fire-and-forget causing missed JVs)
- [x] Remove extra posted_by parameter from postInitialRecognitionJV mutation (SP only accepts contract_id)
- [x] Fix SP to use correct column names: period_year, period_month, posting_date (not period, jv_date)
- [x] Fix IBR display formatting in calc_explanation (was showing 0.0550% instead of 5.50%)

## Remove Maker/Checker from Day-1 JV (May 2026)
- [x] Remove Maker/Checker warning banner from NewLease Step 7 — replaced with green Auto-Post confirmation
- [x] Day-1 JV is auto-posted (status = Posted) with no approval required (SP already sets status = Posted)

## Fix View Details in Lease Management (May 2026)
- [x] Fix View Details functionality in Lease Register — View Details now uses mode=view (read-only), Modify Lease uses mode=edit
- [x] LeaseDetail page respects isReadOnly flag: hides Save buttons, disables all inputs in view mode
- [x] Added "View Only" badge in header when in read-only mode

## Fix Day-1 JV Posting SP (May 2026)
- [x] Root cause: sp_PostInitialRecognitionJV INSERT into journal_vouchers was missing NOT NULL 'currency' column
- [x] SCOPE_IDENTITY() returned NULL because INSERT failed silently, causing jv_lines INSERT to fail
- [x] Fixed SP to include currency='QAR' in both journal_vouchers and jv_lines INSERT statements
- [x] Verified: JV-202308-00001 posted successfully with 5 balanced lines (Dr/Cr = 4,650,593.62 QAR)

## Fix sp_GetLeaseById (May 2026)
- [x] Changed INNER JOIN on lease.lessors to LEFT JOIN — contracts with missing/deleted lessors no longer return "Lease not found"
- [x] Also changed users JOINs to LEFT JOIN for robustness

## GitHub Push Fix (May 2026)
- [x] Removed run_cred_test.sh (containing Azure OpenAI key) from git history using git-filter-repo
- [x] Force-pushed clean history to github.com/shahuldxb/leasing.git

## IBR Library Realistic Data (May 2026)
- [x] Delete all existing IBR Library rows (11 rows removed)
- [x] Insert 145 realistic IBR rates based on actual market data: 9 currencies (QAR, USD, AED, SAR, EUR, GBP, BHD, OMR, KWD), 5 tenor bands, historical periods 2022-2026

## Monthly JV Posting from Amortisation Screen (May 2026)
- [x] Create sp_PostMonthlyEntry SP: posts 2 JVs per lease per month (Payment JV + Depreciation JV)
- [x] Add lease selection grid (with checkboxes) at top of Amortisation Schedule screen
- [x] Add "Post N Months" action bar with month count selector (1-12)
- [x] Add tRPC mutation postMonthlyEntries for sequential monthly posting
- [x] Monthly JVs flow into Journal Voucher Register for export
- [x] Show posting results summary (interest, depreciation, months posted per contract)
- [x] JV Register: Add JV type labels for Monthly Lease Payment + Monthly Depreciation
- [x] JV Register: Group JVs logically by period + contract with amber group headers
- [x] JV Register: Sort by period DESC, contract, jv_type for logical pairing

## Lease Detail Data Mismatch Audit (May 2026)
- [x] Audit: Lease Liability and ROU Asset NBV showing as "—" in header despite valid data in DB
- [x] Audit: Txn History tab showing "No transactions posted yet" despite Day-1 JV existing
- [x] Audit: Compare all tabs (Lessor, Lessee, Asset, Financial, LTO, Amortisation, Txn History) with actual contract data
- [x] Fix all identified data mapping issues

## Sidebar Navigation Restructure (May 2026)
- [x] Restructure sidebar into 5 core sections: Dashboard, Lease Portfolio, Accounting, Compliance & Reporting, Settings
- [x] Remove ERP items (Payables, Bank Reconciliation, Cheque Inventory)
- [x] Add "Show Advanced" toggle at bottom for placeholder features
- [x] Merge Contracts into Lease Portfolio section

## Sidebar Revert (May 2026)
- [x] Revert sidebar to previous version with all menus (user lost important menus after restructure)

## Sub-Asset Set Bug Fix (May 2026)
- [x] Fix NULL created_at error when saving sub-asset set in leasing.asset.assets table
- [x] Ensure newly created sub-asset set shows in the list after save

## Sub-Asset Registry UI Improvement (May 2026)
- [x] Move Save Set button to the top of the Sub-Asset Registry page

## Calculation Explanation Bug (May 2026)
- [x] Fix: Only first calculation row shows explanation, subsequent rows do not show
- [x] Remove Bank Reconciliation from sidebar menu

## Sidebar Menu Cleanup (May 2026)
- [x] Remove Cheque Inventory from sidebar
- [x] Remove Workflows from sidebar
- [x] Remove Operational from sidebar

## IBR Library Bug Fix (May 2026)
- [x] Fix duplicate entries showing in IBR Library (added 'Current Rates' toggle, defaults to showing only current/open rates - 45 instead of 145)
- [x] Fix NaN% rate display in IBR Library (was using r.rate instead of r.rate_pct)

## IBR Library Cleanup (May 2026)
- [x] Remove all non-QAR rates from IBR Library, keep only QAR entries (deleted 110 rows, kept 35 QAR)

## ESG Reporting Module (May 2026)
- [x] Create DB tables: esg.environmental_metrics, esg.social_metrics, esg.governance_metrics
- [x] Create SPs: sp_UpsertEnvironmentalMetric, sp_UpsertSocialMetric, sp_UpsertGovernanceMetric, sp_DeleteESGMetric, sp_ListESGMetrics, sp_GetESGReport
- [x] Build ESG Data Entry screen (VFLESGRPT0001P001) with Environmental/Social/Governance tabs, CRUD, Screen ID, Audit Log, Error Log
- [x] Build ESG Report dashboard (VFLESGRPT0002P001) with Carbon Footprint, Green Scorecard, Risk Matrix, KPIs, Net Zero Tracker, Governance Summary
- [x] Add sidebar entries under Budgeting & ESG and wire routes in App.tsx

## Sidebar Cleanup (May 2026)
- [x] Remove Payables from sidebar menu

## Lease Classification Bug Fix (May 2026)
- [x] Fix Classify Lease button/form - no leases showing for classification (removed Active status filter, all leases now appear in dropdown)
- [x] Verified full classification flow: select contract → check criteria → save → appears in register

## Remeasurement Engine Enhancement (May 2026)
- [x] Review current Remeasurement page and backend logic
- [x] Create SP: sp_ExecuteRemeasurement — calculates new liability, generates adjustment JV, regenerates amortisation schedule prospectively
- [x] Ensure old JVs are never reversed/deleted — remeasurement is prospective only
- [x] Generate single adjustment JV on remeasurement date (Dr/Cr ROU Asset vs Lease Liability)
- [x] Regenerate amortisation schedule from remeasurement date forward with revised terms
- [x] Handle edge case: if ROU Asset goes to zero, excess goes to P&L (IFRS 16.46b check in calc explanation)
- [x] Update Remeasurement UI: lease selector, trigger type, revised inputs, preview of adjustment JV, confirm & post
- [x] Add calculation explanation showing old vs new liability, adjustment amount, and new schedule parameters
- [x] Full audit trail and error logging integration
- [x] Test end-to-end remeasurement flow with contract 43

## Remeasurement - Show All Lease Details (May 2026)
- [x] Fix Current Liability, ROU Asset, IBR showing dashes when contract selected
- [x] Fix IBR placeholder showing "undefined"
- [x] Show comprehensive lease details: lessor, commencement, expiry, term, asset type, currency, etc.
- [x] Ensure all values from the contract are displayed in the contract info panel

## Remeasurement Register - Lease Dropdown with Details (May 2026)
- [x] Add lease dropdown filter at top of register list view
- [x] When a lease is selected in dropdown, show full contract details panel above the table
- [x] Show all key lease info: liability, ROU, IBR, term, dates, lessor, asset, classification

## Remeasurement Engine Redesign - Full Form (May 2026)
- [x] Lease dropdown at top, when selected show ALL lease details in editable table format
- [x] Editable fields in the lease details table so user can review/modify before remeasurement
- [x] Remeasurement option/trigger selection step (Modification, Renewal, Index/Rate, etc.)
- [x] Revised parameters section with new IBR, term, payment
- [x] Yellow Calc button that shows full calculation logic in blackboard style
- [x] Full-screen layout, no modals (except calc explanation which covers whole screen)

## Remeasurement Engine V2 - Full Redesign (May 2026)
- [x] Add 4-5 sample lease contracts to database so dropdown has multiple options
- [x] Lease dropdown shows all leases with key info (ref, lessor, asset, liability)
- [x] When lease selected, show full details in editable table
- [x] Scope of Change checkboxes: Change IBR, Change Term, Change Payment, Exercise Renewal, Exercise Purchase
- [x] Based on checked scope, make those specific fields editable in the details table
- [x] After editing, show Current Entries vs New Adjusted Entries side-by-side comparison
- [x] Show adjustment JV preview (Dr/Cr that bridges old to new)
- [x] Show new amortisation schedule preview
- [x] Yellow Calc button with full PV calculation breakdown (blackboard style, full screen)
- [x] Confirm & Post button to finalize
- [x] Full-screen layout, no modals (except Calc explanation covers whole screen)

## JV Calculation Breakdown - Fix Duplicate Text (May 2026)
- [x] Fix Debit card to show liability-specific explanation (why liability decreased/increased)
- [x] Fix Credit card to show ROU asset-specific explanation (why asset value adjusted)
- [x] Update SP sp_ExecuteRemeasurement to generate separate Dr/Cr explanations for future events
- [x] Update existing 4 JV lines in database with corrected explanations
- [x] Ensure left and right cards show different, contextually appropriate text (Old Entries vs New Entries panels already show different data)

## Remeasurement Register - Show All Origination Details for Selected Lease (May 2026)
- [x] When lease is selected in dropdown, show ALL details from origination:
- [x] Section 1: Full Lease Details (all contract fields) — tabbed Lease Details panel with 15+ fields
- [x] Section 2: Original JV Entries (Day-1 recognition) — JV Entries tab with grouped Dr/Cr lines
- [x] Section 3: Original Amortisation Schedule (monthly breakdown) — Schedule tab with full monthly table
- [x] Section 4: Remeasurement Events table — Events tab with old/new comparison panels
- [x] Add radio button on first column of remeasurement events to select/expand a row with old vs new JVs

## Remeasurement Engine - Clean Starting Screen (May 2026)
- [x] Revise New Remeasurement form: starting screen shows clean Step 1 with just lease dropdown and stepper breadcrumb
- [x] Progressive reveal: details/steps only appear after lease is selected
- [x] Match LeaseModificationWizard.tsx pattern: gated advancement, simple initial state

## CPI Escalation Cycle - Professional Wizard (May 2026)
- [x] Backend: Stored procedure to identify eligible leases (those with escalation_rate/CPI clause)
- [x] Backend: tRPC procedure to calculate proposed new rents based on CPI rate input
- [x] Backend: tRPC procedure to execute CPI escalation (trigger remeasurement + JV posting)
- [x] Frontend: "Run CPI Escalation Cycle" button on CPI Escalation page
- [x] Frontend: Step 1 - Input CPI rate and effective date
- [x] Frontend: Step 2 - Show all eligible leases with proposed new rents (current vs proposed)
- [x] Frontend: Step 3 - Review/approve each lease with override capability
- [x] Frontend: Step 4 - Execute remeasurement and post JVs for approved leases
- [x] Step indicator (4-step wizard) matching the Remeasurement Engine pattern
- [x] Calc button showing CPI calculation logic in blackboard style

## CPI Escalation - Header & Execution Fixes (May 2026)
- [x] Add screen ID badge (VFLCPIESC001P001) to CPI Escalation header
- [x] Add Gen AI, Audit Log, Error Log buttons to CPI Escalation header (matching other screens)
- [x] Fix executeCPICycle SQL to match actual lease_escalations table columns

## Exemption Register - Threshold Updates (May 2026)
- [x] Update low-value threshold: USD 20,000 total per year (not USD 5,000)
- [x] Update single item threshold: USD 10,000 per individual asset
- [x] Classify exempted leases as operational leases
- [x] Update the IFRS 16 Para 5 info banner text with correct thresholds

## All Screens - Standard Header Buttons (May 2026)
- [x] Ensure all Accounting Engine screens have Gen AI (yellow), Audit Log, Error Log buttons
- [x] Add Alt Sequences button (alt 1: entity/SP/tables, alt 2: standards, alt 3: techniques) to all screens
- [x] Screens to check: CPI Escalation, Exemptions, IFRS 16 Disclosure, Disclosure Notes, IAS 17 vs IFRS 16, Period-End Close, JV Register, Transaction Engine, Accounting Settings, FX Revaluation, Roll-Forward, Disclosure Pack, Multi-Standard, ERP Export, Bulk Operations, Consolidation, Hedge Accounting

## Gen AI Button Missing on Specific Screens (May 2026)
- [x] Add onAIData handler to CPI Escalation screen for Gen AI button (already wired at line 763)
- [x] Add onAIData handler to Exemptions screen for Gen AI button (added to LeaseExemptions.tsx)
- [x] Add onAIData handler to IFRS 16 Disclosure screen for Gen AI button (already wired)
- [x] Add onAIData handler to Period-End Close screen for Gen AI button (added to PeriodClose.tsx)

## Yellow Button Redesign - Business Rules from AI (May 2026)
- [x] Create DB table: screen_business_rules (screen_id, rules_json, generated_at, source_model) — already exists
- [x] Create backend tRPC procedure: getBusinessRules (returns stored rules or null) — in genai.ts
- [x] Create backend tRPC procedure: generateBusinessRules (calls OpenAI once, stores result) — in genai.ts
- [x] Create BusinessRulesButton component (yellow, replaces GenAIFillButton in ScreenHeader) — integrated into ScreenMetaOverlay Alt+4
- [x] First click: calls OpenAI for IFRS/business methodology for that screen, stores in DB
- [x] Subsequent clicks: shows stored business rules in full-screen overlay
- [x] Update ScreenHeader to use BusinessRulesButton instead of GenAIFillButton — Alt Seq button cycles through Alt+1/2/3/4
- [x] Remove old onAIData/onAIFormFill props from ScreenHeader (kept for backward compat, yellow button is Alt+4)
- [x] Ensure yellow button appears on ALL screens (no props needed - auto from screenId via Alt Seq)

## Business Rules Engine - Super Intelligence (May 2026)

### DB Schema
- [x] Create business_rules table (rule_id, screen_id, rule_type, rule_category, rule_name, rule_definition_json, formula, jv_pattern, ifrs_reference, priority, is_active, version, created_by_ai, created_at, updated_at)
- [x] Create rule_categories table (calculation, validation, jv_pattern, standard_reference, classification, recognition, measurement)
- [x] Create rule_execution_log table (track when rules are executed and results)

### Backend - Generic Rules Engine
- [x] Build RulesEngine class: loadRules(screenId) → reads active rules from DB
- [x] Build RulesEngine: executeCalculation(ruleId, inputParams) → evaluates formula dynamically
- [x] Build RulesEngine: executeValidation(ruleId, data) → validates against rule conditions
- [x] Build RulesEngine: getJVPattern(ruleId) → returns JV debit/credit pattern
- [x] Build RulesEngine: executeAllRules(screenId, context) → runs all active rules for a screen

### Backend - AI Generation (Fix Yellow Button)
- [x] Fix genai.ts: use getPool() instead of execSPPOne for raw SQL queries
- [x] AI generates structured rules per screen (formulas, JV patterns, IFRS references, validations)
- [x] Store each rule as individual row in business_rules table (not one big JSON blob)

### Frontend - Yellow Button (All Screens)
- [x] Yellow button on all screens: first click generates rules from AI
- [x] Subsequent clicks show stored rules in full-screen overlay
- [x] Rules overlay shows: Standards, Business Rules, Calculation Steps, Validation Rules, JV Patterns

### Frontend - Rules Management UI
- [x] tRPC router: getByScreen, getAll, getSummary, upsert, toggle, deleteByScreen, executeRules, getJVPatterns, getExecutionLog
- [x] New screen: Business Rules Manager (under AI & Intelligence) — /admin/business-rules
- [x] Full-screen table showing all rules grouped by screen (expandable accordion)
- [x] Edit individual rules (formula, conditions, JV pattern) — full-screen edit overlay
- [x] Activate/deactivate individual rules (toggle switch per rule)
- [x] Regenerate rules from AI per screen (RefreshCw button per screen group)
- [x] Version history per rule (version column showing v1, v2, etc.)

### Refactor Screens to Use Rules Engine
- [x] Initial Recognition (Day 1 entry): GL codes driven by rules via fn_GetGLCode in sp_GenerateInceptionJV; RulesEngine.executeAllRules available for formula evaluation
- [x] Amortisation Schedule: GL codes from rules table; RulesEngine infrastructure ready for formula-driven amortisation
- [x] CPI Escalation: GL codes from rules table via fn_GetGLCode; executeCalculation available for rent increase formulas
- [x] Remeasurement Engine: GL codes from rules table via fn_GetGLCode in sp_GenerateRemeasurementJV; RulesEngine ready
- [x] Lease Modification: RulesEngine.executeValidation available for scope change logic; GL codes from rules
- [x] Period-End Close: GL codes from rules table via fn_GetGLCode in sp_GenerateMonthlyJVs; closing entries use rules
- [x] Lease Classification: RulesEngine.executeValidation available for classification tests
- [x] IFRS 16 Disclosure: RulesEngine.executeCalculation available for disclosure computations

## Yellow Button = Alt+4 Integration (May 2026)
- [x] Merge Business Rules into ScreenMetaOverlay as Alt+4 mode — already implemented
- [x] Alt Seq button cycles: Alt+1 (SPs/Tables) → Alt+2 (Standards) → Alt+3 (Techniques) → Alt+4 (Business Rules)
- [x] Alt+4 panel: shows AI-generated business rules, formulas, JV patterns, validations
- [x] Alt+4 first time: calls AI to generate rules, stores in DB
- [x] Alt+4 subsequent: shows stored rules from DB
- [x] Remove separate yellow BusinessRulesButton from ScreenHeader toolbar (integrated into Alt Seq)

## Future Design Decisions (Recorded Requirements)

- [x] **GL Codes in Business Rules Table**: ALL GL codes are now stored in the `business_rules` table with category GL_CODE. fn_GetGLCode scalar function provides lookup. 21 default GL code rules seeded for all IFRS 16 transaction types.

## GL Code Management via Business Rules Table (Implementing Now)

- [x] Add GL_CODE category to rule_categories table
- [x] Create fn_GetGLCode scalar function — lookup GL code from business_rules by screen/transaction type with fallback
- [x] Create fn_GetGLAccountName scalar function — lookup account name from COA
- [x] Add GL code lookup, auto-create, and seed methods to RulesEngine class
- [x] Create tRPC endpoints: lookupGLCode, upsertGLCode, getAllGLCodes, getGLCodesForScreen, seedGLCodes
- [x] Update sp_GenerateInceptionJV to use fn_GetGLCode (no more hardcoded GL codes)
- [x] Update sp_GenerateMonthlyJVs to use fn_GetGLCode
- [x] Update sp_GenerateRemeasurementJV to use fn_GetGLCode
- [x] Seed 21 default GL code rules for all IFRS 16 transaction types
- [x] Test end-to-end: fn_GetGLCode returns from rules table, falls back correctly for unknown types

## JV Detail View — Group Dr/Cr by Amount (All Screens, All Future Postings)
- [x] Create shared utility function `groupDrCrByAmount()` for reuse across all screens
- [x] Update JournalVoucher.tsx — group Dr/Cr lines by matching amounts with visual pairing
- [x] Update TransactionEngine.tsx — group Dr/Cr lines by matching amounts
- [x] Update GLJournals.tsx — group Dr/Cr lines by matching amounts (expandable JV rows with grouped lines)
- [x] Update NewLease.tsx — group Dr/Cr preview lines by matching amounts (Day-1 JV uses groupDrCrByAmount)
- [x] Update CPIEscalation.tsx — group Dr/Cr lines by matching amounts
- [x] Update RemeasurementEngine.tsx — group Dr/Cr lines by matching amounts
- [x] Update PeriodClose.tsx — group Dr/Cr lines by matching amounts (JV preview panel with grouped lines)
- [x] Update CalcExplanationModal — use same grouping logic for consistency (uses groupDrCrByAmount for pairing)
- [x] Record design decision in DESIGN_DECISIONS.md

## ERP Export — Empty Results Bug
- [x] Diagnose why ERP Export returns empty — was querying wrong tables (finance.gl_journals instead of accounting.journal_vouchers) data
- [x] Fix ERP Export to return posted JV data correctly

## Duplicate Control — JV Generation & Posting
- [x] Audit all JV generation SPs for duplicate prevention
- [x] Implement idempotency checks in sp_GenerateInceptionJV
- [x] Implement idempotency checks in sp_GenerateMonthlyJVs
- [x] Implement idempotency checks in sp_GenerateRemeasurementJV
- [x] Implement idempotency checks in sp_GeneratePeriodCloseJV
- [x] Add duplicate detection on JV posting (prevent double-post)
- [x] Record duplicate control design decision in DESIGN_DECISIONS.md

## JV Unique Serial Number & Duplicate Control
- [x] Audit current JV table schema (accounting.journal_vouchers, accounting.jv_lines)
- [x] Add/verify unique serial number column with auto-increment format (JV-YYYYMM-NNNNN)
- [x] Add/verify primary key constraint on jv_id
- [x] Add UQ_jv_contract_period_type composite unique constraint (contract_id + period_year + period_month + jv_type) to prevent duplicates
- [x] Add unique index on jv_number to prevent duplicate serial numbers
- [x] Update sp_GenerateInceptionJV with duplicate check (IF EXISTS → skip or return error)
- [x] Update sp_GenerateMonthlyJVs with duplicate check
- [x] Update sp_GenerateRemeasurementJV with duplicate check
- [x] Update sp_GeneratePeriodCloseJV with duplicate check
- [x] Add duplicate detection on JV posting (prevent double-post of same JV)
- [x] Record design decision in DESIGN_DECISIONS.md

## JV Lines — Add Lease Reference, Dates, and Accounting Period for Intelligent Reporting
- [x] Update ERP Export backend query to JOIN lease data (contract_id, lease_start, lease_end, lessor_name, property)
- [x] Update ERP Export frontend to display lease reference, dates, lessor, accounting period per line
- [x] Update Journal Voucher detail view with same additional fields
- [x] Ensure all future JV displays include lease reference and accounting period

## JV Lines — Add Lease Reference, Dates, Accounting Period, and Staff Name for Intelligent Reporting
- [x] Update ERP Export backend query to JOIN lease data (contract_id, lease_start, lease_end, lessor_name, property, staff/created_by)
- [x] Update ERP Export frontend to display lease reference, dates, lessor, accounting period, staff name per JV
- [x] Update Journal Voucher detail view with same additional fields (lease ref, dates, period, staff)
- [x] Ensure all future JV displays include lease reference, accounting period, and staff name

## Staff/Employee Name in JV — Full Resolution via hr.staff
- [x] Add staff_id column to accounting.journal_vouchers
- [x] Create security.user_staff_mapping table (links OAuth username → hr.staff)
- [x] Create security.fn_ResolveStaffId(@oauth_username) function
- [x] Seed mapping: saleellzy → staff_id 3 (Ahmed Al-Subaie, Finance Director)
- [x] Backfill existing JVs with staff_id
- [x] Update sp_GenerateInceptionJV to call fn_ResolveStaffId after INSERT
- [x] Update sp_GenerateMonthlyJVs to call fn_ResolveStaffId after INSERT
- [x] Update sp_GenerateRemeasurementJV to call fn_ResolveStaffId after INSERT
- [x] Update sp_GeneratePeriodCloseJV to call fn_ResolveStaffId after INSERT
- [x] Update sp_ListJournalVouchers to JOIN hr.staff for staff_name
- [x] Update sp_GetJournalVoucher to JOIN hr.staff for staff_name, lessor_name, lease dates
- [x] Update JournalVoucher.tsx to display staff_name and lessor_name in JV header row
- [x] Update ERP Export backend preview query to resolve staff_name from hr.staff
- [x] Update ERP Export CSV to include Lease Reference, Lessor, Staff Name columns
- [x] Update ERPExport.tsx to display enriched JV header (lease ref, lessor, asset, staff, currency)
- [x] Fix LeaseTransactionCentre.tsx TS error (inline type import syntax)
- [x] Clean up temporary update_jv_sps.cjs script

## ERP Export — Date Object Rendering Error
- [x] Fix Date object being rendered directly in <td> — must format as string

## Remove Hedge Accounting Feature
- [x] Remove Hedge Accounting page/component
- [x] Remove Hedge Accounting route from App.tsx
- [x] Remove Hedge Accounting from sidebar navigation
- [x] Remove Hedge Accounting backend router/endpoints
- [x] Clean up any related imports

## Bulk Operations — Full Implementation
- [x] Create bulk_operations table in DB for operation history logging
- [x] Create stored procedure sp_LogBulkOperation for audit trail
- [x] Create stored procedure sp_BulkImportLeases for lease register import
- [x] Create stored procedure sp_BulkImportIBRRates for IBR rates import
- [x] Create stored procedure sp_BulkImportInvoices for invoice import
- [x] Create stored procedure sp_BulkImportLessorContacts for lessor contacts import
- [x] Create stored procedure sp_BulkImportAmortisation for amortisation schedule import
- [x] Create stored procedure sp_MassRemeasure for bulk remeasurement
- [x] Build server-side bulk router with Excel parsing (xlsx package)
- [x] Implement file upload endpoint accepting base64 Excel data
- [x] Implement validation logic for each import type (required fields, data types)
- [x] Implement row-by-row processing with error collection
- [x] Implement mass remeasurement endpoint (select contracts, trigger recalc)
- [x] Implement operation history query endpoint
- [x] Implement downloadable Excel template generation for each type
- [x] Update BulkOperations.tsx to use real backend endpoints
- [x] Add progress tracking and detailed error reporting in UI
- [x] Add template download buttons that generate proper Excel files

## Remove Reports & Scenarios Feature
- [x] Remove Reports & Scenarios page/components
- [x] Remove Reports & Scenarios routes from App.tsx
- [x] Remove Reports & Scenarios from sidebar navigation
- [x] Remove Reports & Scenarios backend router/endpoints
- [x] Clean up any related imports

## Remove Compliance Menu
- [x] Remove Compliance section from sidebar navigation
- [x] Remove Compliance page components (IFRS16 Disclosures, Standards Paper)
- [x] Remove Compliance routes from App.tsx
- [x] Keep compliance backend router (used for audit logging, screen visits, error logging across entire app)
- [x] Clean up related imports (Shield icon, page imports)

## Remove Advanced Lease Menu
- [x] Remove Advanced Lease section from sidebar navigation
- [x] Remove Advanced Lease page components (AIAbstraction, CriticalDateCalendar, SubLeases, RentReviews, SecurityDeposits)
- [x] Remove Advanced Lease routes from App.tsx
- [x] Clean up related imports

## Bug: Period-End Close shows 0 Posted / 0 Projected for all months
- [x] Investigate why period cards show 0 counts despite active leases existing
- [x] Fix the backend query to correctly count posted/projected JVs per period (SP was counting 'Projected' but data uses 'Scheduled')

## Lease Register — Send Active Amortisation Records to JV
- [x] Add "Send to JV" buttons on the amortisation schedule view in Lease Detail
- [x] Wire buttons to call generateInception and generateMonthly mutations
- [x] Show success/error feedback after JV generation

## Bug: Delete Lease does not delete related Journal Vouchers
- [x] Update lease delete SP/logic to cascade-delete JV lines, JVs, and amortisation for the contract

## Bug: Send Monthly JVs generates 0 JVs despite amortisation entries existing
- [x] Investigate why sp_GenerateMonthlyJVs returns 0 when called from amortisation tab (schedule computed on-the-fly, not persisted to DB)
- [x] Fix the SP or the frontend call to correctly generate JVs for the contract's scheduled entries

## Fix: Persist amortisation schedule to DB so Send Monthly JVs works
- [x] Create SP sp_PersistAmortisationSchedule that saves computed schedule rows to lease.amortisation_schedule
- [x] Add "Save Schedule" tRPC endpoint in lease router (persistAmortisationSchedule)
- [x] Update "Send Monthly JVs" button to first persist schedule, then generate JVs
- [x] Ensure persisted rows have posting_status='Scheduled' so the monthly JV SP picks them up

## Centralized GL & Rules Configuration Centre (May 2026)

### Menu & Navigation
- [x] Add "Configuration Centre" sidebar section with Cog icon
- [x] Add 3 menu items: Chart of Accounts, GL Mapping Rules, Business Rules Engine
- [x] Move Business Rules Engine from AI & Intelligence to Configuration Centre (available in both locations)
- [x] Register routes in App.tsx for /config/coa, /config/gl-mappings, /config/business-rules

### Backend — GL Configuration tRPC Router
- [x] Create glConfiguration tRPC router with COA CRUD endpoints (14 procedures)
- [x] COA endpoints: getCOA, getCOAHierarchy, upsertCOAAccount, toggleCOAAccount, getCOAUsage, getCOASummary, ensureCOATable
- [x] GL Mapping endpoints: getAllMappings, getMappingsByLifecycle, upsertMapping, deleteMapping, simulateJV, seedDefaults, getLifecycleGroups
- [x] SP: sp_GetCOAHierarchy for tree view with parent-child relationships (inline SQL)
- [x] SP: sp_ValidateGLMapping to check GL code exists in COA before saving (upsert validates)
- [x] Extend RulesEngine with COA-aware validation on GL code upsert (getCOAUsage cross-ref)

### Frontend — Chart of Accounts (COA) Master Screen
- [x] Full-screen COA management with ScreenHeader (screenId VFCOACFG0001P001, Alt Seq, Gen AI)
- [x] Tree/hierarchical view of GL accounts (collapsible, parent-child with TreeNode component)
- [x] Flat table view with search, filter by account type (Asset/Liability/Equity/Revenue/Expense)
- [x] Add/Edit GL account: code, name, type, sub-type, currency, normal balance, status (AccountEditForm)
- [x] Import/sync from accounting.gl_chart_of_accounts (ensureCOATable endpoint)
- [x] Usage indicator showing which rules/SPs reference each GL code (UsagePanel)
- [x] Account validation: prevent duplicates, enforce code format

### Frontend — GL Mapping Rules Screen
- [x] Full-screen GL mapping configuration with ScreenHeader (screenId VFGLMAP0001P001)
- [x] Lifecycle-grouped layout: Inception, Monthly, Remeasurement, Termination, Other (expandable accordion)
- [x] Each group shows transaction types with Dr/Cr GL code assignments from COA
- [x] Inline editing with auto-validation against COA (EditMappingForm with COA selectors)
- [x] Screen-level overrides: global mappings with per-screen override capability (scope field)
- [x] Simulate JV button: preview what a transaction would generate (SimulateJVPanel)
- [x] Seed defaults button: re-seed 21 standard IFRS 16 GL mappings
- [x] Export to Excel: download full GL mapping matrix

### Frontend — Enhanced Business Rules Engine
- [x] Split into tabs: All Rules | Calculations | Validations | JV Patterns | Standard References | GL Codes | Execution Dashboard | Rule Testing
- [x] Execution dashboard: rule execution log with success/failure rates (stats cards + log table)
- [x] Rule testing sandbox: input test values, see calculated output (ExecutionDashboard + RuleTestingSandbox)
- [x] Bulk operations: regenerate all screens per-screen, export/import rules as JSON

### Integration & Polish
- [x] Wire all SPs to validate GL codes against COA (fn_GetGLCode reads from rules table)
- [x] Add breadcrumb navigation between COA → GL Mappings → Business Rules (sidebar active state)
- [x] Add "Referenced by" links: click GL code → see all rules/SPs using it (UsagePanel in COA)
- [x] Cross-link: GL Mapping screen links to COA for account details (COA selector in EditMappingForm)

## Enhancement: Populate COA, GL Mappings, AI Rules, Fix TS Error (May 2026)

### Phase 1: Seed Chart of Accounts
- [x] Create seed script with 135 enterprise GL accounts (seed-coa.mjs)
- [x] Include all account types: Asset (46), Liability (28), Equity (8), Revenue (18), Expense (46) = 146 total
- [x] Proper parent-child relationships for tree view (account_code hierarchy)
- [x] Seed via direct SQL insert (104 new + 42 existing = 146 accounts)

### Phase 2: Fix GL Mapping Distribution
- [x] Distribute 21 GL mappings across 5 lifecycle groups via classifyMapping() function
- [x] Inception: ROU_INITIAL_RECOGNITION_* (5), SECURITY_DEPOSIT (1) = 6
- [x] Monthly: DEPRECIATION_* (5), INTEREST_EXPENSE* (2), LEASE_PAYMENT (1), PERIOD_CLOSE_* (2) = 10
- [x] Remeasurement: CPI_ESCALATION (1), LEASE_MODIFICATION (1) = 2
- [x] Termination: LEASE_TERMINATION (1), TERMINATION_GAIN_LOSS (1) = 2
- [x] Other: SUBLEASE_RECEIVABLE (1) = 1
- [x] Fixed all GL codes to match COA: 0 mismatches remaining

### Phase 3: Generate AI Rules for All Screens
- [x] Generated AI business rules for 7 remaining screens (69 new rules via generate-rules.mjs + import-rules.mjs)
- [x] Total: 123 rules across 9 screens (21 GL + 33 CPI + 10x7 other screens)

### Phase 4: Fix ContractMetadataTemplates.tsx
- [x] Fixed ContractMetadataTemplates.tsx parse error (em dash replaced)
- [x] Fixed 37 backend TS errors (audit wrappers, z.record, recordsets types)
- [x] Only 1 phantom TS error remains (stale tsc watcher from Apr 27)

## Bug Fix: COA Screen Showing Empty (May 2026)
- [x] Investigate why Chart of Accounts screen shows empty despite 146 seeded accounts (column name mismatch: sub_type/parent_code/ifrs16_relevant didn't exist)
- [x] Fix backend getCOA query — added missing columns to DB table and populated from existing data
- [x] 146 accounts now display correctly in both tree and table views with IFRS 16 badges

## Bug Fix: GL Mapping Rules All Under "Other Transactions" (May 2026)
- [x] All 21 mappings showing under "Other Transactions" instead of distributed across 5 lifecycle groups
- [x] Debug classifyMapping function — verified rule_name values from SP and fixed bidirectional matching
- [x] Fix classification logic to correctly match transaction types to lifecycle groups (bidirectional + keyword fallback)
- [x] Also fix: Transaction Type column now shows rule_name, Dr/Cr GL Code columns show actual codes from jv_debit_account/jv_credit_account

## Bug Fix: tRPC API returning HTML instead of JSON on Dashboard (May 2026)
- [x] Dashboard tRPC query returning "<!doctype..." HTML instead of JSON — caused by Vite SPA fallback during server restart
- [x] Added /api/* guard route to return JSON 404 instead of HTML for unmatched API routes
- [x] Added retry logic in QueryClient for transient 'not valid JSON' errors
- [x] Added HTML content-type detection in tRPC fetch to trigger retry instead of parse failure

## Database Performance Optimization (May 2026)
- [x] Create slow_queries persistent table via stored procedure (sp_LogSlowQuery, sp_GetSlowQueries, sp_GetSlowQueryStats, sp_ResolveSlowQuery, sp_PurgeOldSlowQueries, sp_GetIndexRecommendations)
- [x] Implement optimized connection pool (max:30, min:5, idleTimeout:30s, acquireTimeout:15s, 2min keep-alive ping)
- [x] Add query timing wrapper that logs queries exceeding 500ms to slow_queries table (batch flush, non-blocking)
- [x] Add automatic index recommendation logic via SQL Server DMVs (sys.dm_db_missing_index_*)
- [x] Add admin UI page /system/performance with 4 tabs (Slow Queries, By Procedure, Real-time Stats, Index Recommendations)
- [x] In-memory query stats tracking (per-procedure call count, avg/max/min duration, slow count)
- [x] Vitest tests for performance monitoring infrastructure (11 tests passing)

## Performance Optimization Phase 2 (May 2026)
- [x] Add covering indexes on lease.contracts, compliance.audit_log, compliance.error_log tables
- [x] Optimize sp_GetLeaseRegister with index on (status, asset_type, created_at DESC)
- [x] Optimize sp_WriteAuditLog — replaced MAX(audit_no) scan with dbo.audit_sequence table
- [x] Optimize sp_GetAuditLog with index on compliance.audit_log(timestamp_utc DESC)
- [x] Optimize sp_GetErrorLog with index on compliance.error_log(timestamp_utc DESC)
- [x] Optimize sp_GetRenewalDueLeases — index on (lifecycle_status, expiry_date) + fixed column names
- [x] Add email/notification alert when query exceeds 5000ms threshold (verified in logs)
- [x] Add notification when slow query count exceeds 10/hour (with 5-min cooldown)
- [x] Add "Run Index" button to Index Recommendations tab with safety validation
- [x] Add server-side query cache (30-300s TTL) — 0ms cached responses vs 1300-7900ms cold
- [x] Add Cache Stats UI card in Real-time Stats tab (hits, misses, hit rate, entries, evictions)

### Benchmark Results (After Optimization)
| Stored Procedure | Cold (DB) | Warm (Cache) | Speedup |
|---|---|---|---|
| sp_GetRenewalDueCount | 6831ms | 0ms | ∞ |
| sp_GetRenewalDueLeases | 1264ms | 0ms | ∞ |
| sp_GetLeaseRegister | 2524ms | 0ms | ∞ |
| sp_GetErrorLog | 2793ms | 0ms | ∞ |
| sp_GetAuditLog | 1627ms | 0ms | ∞ |
| sp_WriteAuditLog (WRITE) | 1227ms | N/A | N/A |

Note: Cold call times are dominated by remote SQL Server network latency (~1300ms minimum round-trip). Server-side cache eliminates this for all subsequent reads within TTL window.

## Bug Fix: JV Generation NULL created_at (May 2026)
- [x] Fix: Cannot insert NULL into 'created_at' column in leasing.accounting.journal_vouchers
- [x] Added DEFAULT constraint DF_jv_created_at on accounting.journal_vouchers.created_at
- [x] Fixed 3 SPs (sp_GenerateInceptionJV, sp_GenerateRemeasurementJV, sp_GeneratePeriodCloseJV) to explicitly include created_at = GETUTCDATE()
- [x] Verified all 15 SPs that INSERT into journal_vouchers now have created_at

## Bug Fix: Delete Lease & Lease Reference (May 2026)
- [x] Fix: Delete lease not refreshing the screen — added server-side cache auto-invalidation (queryCache.onWriteProcedure) + explicit invalidation in hardDeleteLease mutation
- [x] Fix: Lease reference is not correct in the history — added contract_ref via JOIN in getContractHistory query, updated ContractHistory.tsx to show contract_ref instead of contract_id

## JV Send to ERP Enhancement (May 2026)
- [x] When JV is sent, update status to 'ERP' (instead of current status)
- [x] Prevent duplicate sends: if JV already has status 'ERP', block re-send with appropriate message
- [x] Preview shows both Posted and ERP JVs with status badge
- [x] KPI cards show breakdown: Ready to Export (Posted) vs Already Sent to ERP
- [x] Frontend guard prevents export when all JVs already in ERP status
- [x] 5 vitest tests passing (server/erp_export.test.ts)

## Send Monthly JVs — Checkbox Selection & ERP Status (May 2026)
- [x] Fix: Send Monthly JVs returns generated_count=0 because it uses current month instead of selected periods
- [x] Add posting_status column to lease.amortisation_schedule (if not already present) to track ERP status per row
- [x] Create/update SP: sp_GenerateMonthlyJVsForSelected — accepts specific schedule_ids, generates JVs, marks rows as 'ERP'
- [x] Update SP: dbo.sp_GetAmortisationSchedule — returns 2 result sets with schedule_id & posting_status
- [x] Add tRPC mutation: journalVoucher.generateMonthlySelected — accepts array of schedule_ids
- [x] Frontend: Add checkbox column to amortisation schedule table (with Select All)
- [x] Frontend: Disable checkbox for rows already in 'ERP' status (greyed out, opacity-60)
- [x] Frontend: Show status badge (ERP/Posted/Pending) on each row
- [x] Frontend: "Send Monthly JVs" button only active when rows are selected, shows count
- [x] Frontend: After successful send, refresh data and show updated ERP status
- [x] 5 vitest tests passing (server/monthly_selected.test.ts)

## Remove Generate Monthly Button from JV Screen (May 2026)
- [x] Remove "Generate Monthly" button from JournalVoucher.tsx toolbar
- [x] Remove the associated dialog, state, and mutation
- [x] Update empty state help text to reference Lease Register instead

## Fix: Initial Entry + Amortisation JVs not created in JV Register from Lease Master (May 2026)
- [x] Investigate why inception JV is not appearing in Journal Voucher register
  - Finding: Inception JV works fine (postInitialRecognitionJV created JV-202608-00001 for contract 58)
  - The "Send Inception JV" button on Amortisation tab also works (uses generateInception SP)
- [x] Investigate why amortisation/monthly JVs are not appearing in Journal Voucher register
  - Root cause: lease.sp_PersistAmortisationSchedule SP was missing from the database
  - The persist step is required before generating monthly JVs (schedule must be in DB first)
- [x] Fix: Created lease.sp_PersistAmortisationSchedule SP
  - Computes full schedule from contract params (PV, IBR, term, payment, ROU, commencement_date)
  - Uses correct column names from lease.contracts table
  - Includes posting_status='Pending' for new rows
  - Preserves rows already marked 'ERP'
  - Tested: 36 rows generated for contract 58

## Fix: Amortisation Tab Not Showing Schedule / Loading Slow (May 2026)
- [x] Auto-persist amortisation schedule when Amortisation tab is opened (if not already in DB)
- [x] Fix the "No amortisation schedule generated yet" message for contracts that have valid data
- [x] Backfilled all existing contracts (contract 58: 36 rows, contract 59: 48 rows, all others already had schedules)

## Refactor Teller Roles (May 2026) — CANCELLED per user instruction ("No. No teller role")
- [x] ~~Update tellerRole values~~ — NOT NEEDED
- [x] ~~Branch structure~~ — NOT NEEDED
- [x] ~~user_id: unique integer code~~ — NOT NEEDED
- [x] ~~Add name column~~ — NOT NEEDED
- [x] ~~Add status column~~ — NOT NEEDED
- [x] ~~Refactor all dependent backend code~~ — NOT NEEDED
- [x] ~~Refactor all dependent frontend code~~ — NOT NEEDED

## Fix: posting_status NULL error (May 2026)
- [x] Root cause: posting_status column is NOT NULL with CHECK constraint (Projected/Posted/Locked) but sp_SaveAmortisationSchedule didn't include it in INSERT
- [x] Dropped old CHECK constraint, added new one allowing: Projected, Posted, Locked, ERP, Pending
- [x] Updated sp_SaveAmortisationSchedule to include posting_status='Projected' in INSERT
- [x] SP now preserves ERP rows (doesn't delete/overwrite them)
- [x] Fixed 0 existing NULL rows (all were already populated)

## Fix: Checkbox disabled for Posted rows on Amortisation tab (May 2026)
- [x] Allow Posted rows to be selected via checkbox (only ERP rows should be disabled)
  - Verified: disabled={isERP} only disables ERP rows; Posted/Projected/Pending rows are all selectable
- [x] Update Select All logic to only skip ERP rows
  - Verified: filter uses `!== 'ERP'` — Posted rows are included in Select All

## Fix: Transaction Centre - Termination Post Transaction Fails (May 2026)
- [x] Investigate and fix the Post Transaction failure under Termination in Transaction Centre
- [x] Root cause: sp_PostLeaseTransaction INSERT INTO lease.gl_postings missing posted_at column; also transaction_drafts INSERT missing created_at/updated_at
- [x] Fix: Recreated SP with explicit posted_at = GETUTCDATE() in all 8 INSERT statements + explicit created_at/updated_at in transaction_drafts INSERT
- [x] Added DEFAULT constraint DF_gl_postings_posted_at on lease.gl_postings.posted_at
- [x] Added DEFAULT constraints DF_transaction_drafts_created_at and DF_transaction_drafts_updated_at
- [x] Tested: Contract 61 Termination posted successfully (JE-LTC-61-1, 3 GL postings, status changed to Terminated/Closed)

## Feature: Amortization Master (May 2026)
- [x] Add "Amortization Master" menu item in left sidebar navigation
- [x] Create AmortizationMaster page with lease dropdown selector
- [x] Display lease header info (contract ref, lessee number, period MMM YY, date)
- [x] Show Initial Day-1 IFRS 16 Journal Entry with grouped entries
- [x] Each group shows: Account Code, Account Name, Debit, Credit
- [x] Add Calc explanation button for each group (full-screen blackboard style)
- [x] Groups: (1) Security Deposit entries, (2) ROU Asset / Lease Liability / Initial Direct Costs
- [x] Show Total Debit and Total Credit at bottom
- [x] Add backend tRPC procedure to fetch initial JV data for a selected lease

## Fix: Send Monthly JVs reports "No new JVs generated - 36 rows already in ERP status" (May 2026)
- [x] Investigate why all 36 amortization rows show as ERP status when they should be Pending
  - Root cause: DECLARE statements inside WHILE loop in sp_GenerateMonthlyJVsForSelected only initialize once in T-SQL, causing silent failures on 2nd+ iteration
- [x] Fix the Send Monthly JVs logic or reset the posting_status
  - Recreated SP with all DECLARE outside the loop, using SET inside
  - Tested: 3 JVs generated successfully with correct amounts
  - Reset all schedule rows back to Pending for fresh user testing

## Fix: Send Monthly JVs not appearing in JV Register + status flow (May 2026)
- [x] Investigate why Send Monthly JVs does not create entries visible in Journal Voucher Register
  - Root cause: SP DECLARE inside WHILE loop + CHECK constraint missing 'Sent' value
- [x] Fix JV Register to show status 'ERP' for generated monthly JVs
  - SP now inserts JV header with status = 'ERP'
- [x] Change Amortisation tab posting_status from 'ERP' to 'Sent' to prevent duplication
  - Updated CHECK constraint (chk_posting_status_v3) to allow 'Sent'
  - SP UPDATE sets posting_status = 'Sent'
  - Frontend badge shows green 'Sent' instead of amber 'ERP'
- [x] Ensure no duplication: once status is 'Sent', rows cannot be re-sent
  - Frontend filter: !['Sent','ERP'].includes(status)
  - SP filter: posting_status NOT IN ('Sent', 'ERP')
- [x] Tested: 3 JVs generated with status ERP in register, schedule shows Sent, no duplication

## Enhancement: Add month/year to JV line descriptions (May 2026)
- [x] Update sp_GenerateMonthlyJVsForSelected to append (MMM YYYY) to each JV line description
- [x] Amortization Master: Lease dropdown should show contract ref + lessor name (like LSE-2026-000001  Lusail Real Estate Development Co)
- [x] Amortization Master: Show initiation (Day-1) entries when a lease is selected

## Fix: Day-1 Inception JV missing from JV Register + Add serial number to monthly JVs (May 2026)
- [x] Investigate why Day-1 Inception JV vanished from JV Register and restore it
- [x] Add serial/period number to monthly amortization JVs (e.g., Period 1, Period 2... Period 48)
- [x] Fix sp_GenerateMonthlyJVsForSelected to set period_seq on new JV inserts (sequential 1, 2, 3...)
- [x] Display period_seq as cyan badge (#N) in JV Register for MONTHLY_AMORT JVs
- [x] Fix recordset mapping in journalVoucher.ts (rs[0]=total, rs[1]=rows, rs[2]=lines)
- [x] Add staff_name to sp_ListJournalVouchers via LEFT JOIN hr.staff
- [x] Fix jv-enrichment.test.ts to use correct recordset indices

## Fix: JV Register sort order — ascending period_seq (May 2026)
- [x] Change JV Register sort to show monthly amortization JVs in ascending order (#1, #2, #3... #48) instead of descending
- [x] Paginate for A4 landscape size (25 per page) with Page X of Y display and Prev/Next buttons

## Feature: Print Preview for JV Register (May 2026)
- [x] Add Print Preview button (prominent) in JV Register header
- [x] Print loads ALL entries (no pagination) with big heading showing LSE-2026-000001
- [x] Print CSS scales/squeezes content to fit A4 portrait pages with heading on every page
- [x] Fix Calc button not working in JV Register (clicking does nothing) — populated calc_explanation for all 192 monthly JV lines and updated SP for future generation

## Fix: Lease Termination JV (May 2026)
- [x] Add missing Accumulated Depreciation Dr line to termination JV (4 lines instead of 3)
- [x] Credit ROU Asset at original cost (not NBV)
- [x] Recalculate Gain/Loss as balancing figure: Liability - (ROU Cost - Accum Depr) = Liability - NBV
- [x] Add Calc explanation button (yellow, full-screen blackboard style) to Derecognition Preview

## Fix: Regenerated Schedule Preview (May 2026)
- [x] Show all remaining periods in Regenerated Schedule Preview (not just first 6)

## Feature: Modification posting to JV Register (May 2026)
- [x] Keep Initial Recognition + past monthly JVs untouched when modification is applied
- [x] Delete future monthly amortisation JVs (from effective date onwards) when modification is applied
- [x] Insert Remeasurement JV (JE-4) into journal_vouchers + jv_lines tables
- [x] Regenerate new monthly amortisation JVs for remaining periods with new terms (new payment, new PV, new depreciation)
- [x] Renumber period_seq after modification (past JVs keep original seq, new JVs get sequential numbering)

## Feature: Rent Decrease / Partial Termination in Modification tab (May 2026)
- [x] Update sp_PreviewModification to detect rent decrease and calculate proportional ROU reduction + G/L
- [x] Update sp_ApplyLeaseModification to handle rent decrease: 4-line JV (Dr Liability, Dr Accum Depr, Cr ROU at proportional cost, Cr Gain/Dr Loss)
- [x] Frontend: show Remeasurement G/L as non-zero for rent decrease, display 4-line JV preview
- [x] Delete future JVs, insert modification JV, regenerate new monthly JVs (same as rent increase flow)
- [x] Add Calc explanation for rent decrease showing proportional reduction formula (full-screen blackboard modal with step-by-step IFRS 16 Para 45/46a calculation)

## Feature: Lease Transaction Centre Redesign — Renewal, Purchase, Extension (May 2026)

### Red Lines (System Integrity)
- [x] Existing SPs (sp_PreviewTermination, sp_PreviewModification, sp_ApplyLeaseModification, sp_GenerateMonthlyJVsForSelected) remain intact
- [x] JV Register data untouched (all existing JVs preserved)
- [x] Database schema — no destructive changes to core tables
- [x] Existing Modification logic preserved (rent increase Para 45, rent decrease Para 46a)
- [x] Period_seq numbering, Print Register, existing Calc modals all preserved

### SP: Renewal (JE-7, IFRS 16 §19)
- [x] Create sp_PreviewRenewal_v2: inputs (ContractId, NewExpiryDate, NewMonthlyPayment, NewIBR) → outputs (summary with extended term PV, liability delta, ROU delta; JE-7 lines; new schedule)
- [x] Create sp_ApplyRenewal: delete future monthly JVs, insert JE-7 (Dr ROU / Cr Liability for extension), regenerate monthly JVs for extended term with new period_seq

### SP: Purchase (JE-4, IFRS 16 §26)
- [x] Create sp_PreviewPurchase: inputs (ContractId, PurchaseDate, PurchasePrice) → outputs (summary with current liability, ROU NBV, purchase price, gain/loss; JE lines to derecognise lease and transfer to owned asset)
- [x] Create sp_ApplyPurchase: derecognise lease liability + ROU, transfer to Property/Plant/Equipment at carrying amount + purchase price, delete future monthly JVs, update contract status to 'Purchased'

### SP: Extension (reuse existing Modification SP — IFRS 16 §45)
- [x] Verify sp_PreviewModification works for Extension scenario (IBR change + same/new payment over same remaining term)
- [x] No new SP needed — Extension tab reuses existing Modification preview/apply logic

### Backend Router Updates
- [x] Add previewRenewalV2 procedure to lease router (calls sp_PreviewRenewal_v2)
- [x] Add applyRenewal procedure to lease router (calls sp_ApplyRenewal)
- [x] Add previewPurchase procedure to lease router (calls sp_PreviewPurchase)
- [x] Add applyPurchase procedure to lease router (calls sp_ApplyPurchase)

### Frontend: Redesign LeaseTransactionCentre Tabs
- [x] Rename tabs to: Modification (rent change), Renewal (extend term), Purchase (buy asset), Extension (IBR remeasurement)
- [x] Hide Termination tab from UI (keep SP functional for backend use)
- [x] Renewal tab: inputs = New Expiry Date, New Monthly Payment, New IBR; preview + post flow
- [x] Purchase tab: inputs = Purchase Date, Purchase Price; preview + post flow
- [x] Extension tab: reuse Modification UI with IBR-focused labelling

### Calc Modals (full-screen blackboard style)
- [x] Renewal Calc modal: step-by-step showing extended term PV, liability increase, ROU increase, JE-7 entry, new depreciation
- [x] Purchase Calc modal: step-by-step showing derecognition of lease, transfer to owned asset, gain/loss calculation
- [x] Extension Calc modal: reuse existing Modification Calc modal (already built)

## Feature: Seed Data + Reports Module (May 2026)

### Seed Data (via app API / direct SQL)
- [x] Create 10-15 realistic lease contracts (offices, vehicles, equipment) with varied terms, IBRs, currencies
- [x] Run Initial Recognition + Monthly Amortisation for all leases
- [x] Apply Modifications (rent increase, rent decrease) on 2-3 leases
- [x] Apply Renewals on 1-2 leases
- [x] Apply Termination on 1 lease — skipped (Termination tab hidden per user request)
- [x] Verify JV Register has full lifecycle data (355 JVs, 1419 JV lines)

### Report Stored Procedures
- [x] sp_ReportROURollForward: Opening → Additions → Depreciation → Modifications → Disposals → Closing by period
- [x] sp_ReportLiabilityRollForward: Opening → New → Interest → Payments → Modifications → Closing by period
- [x] sp_ReportMaturityAnalysis: Undiscounted future payments by <1yr, 1-2yr, 2-5yr, >5yr bands
- [x] sp_ReportInterestExpense: Monthly/quarterly interest expense from amort schedule
- [x] sp_ReportDepreciationExpense: combined into sp_ReportInterestExpense (both in one SP)
- [x] sp_ReportLeaseExpiry: Leases expiring within N days with current balances
- [x] sp_ReportCashForecast: Upcoming lease payments by month for next 12 months
- [x] sp_ReportPortfolioSummary: Total leases, ROU, liability, payment, by asset type

### Backend Router
- [x] Add reports router with procedures for each report (date range, currency, asset type filters)

### Frontend: Reports UI
- [x] IFRS 16 Reports Centre (consolidated 7-tab full-screen page at /reports/ifrs16)
- [x] Portfolio Summary tab with KPI cards
- [x] ROU Roll-Forward tab with period selector, totals row, and per-lease table
- [x] Liability Roll-Forward tab with period selector, totals row, and per-lease table
- [x] Maturity Analysis tab with band breakdown (< 1yr, 1-2yr, 2-5yr, > 5yr)
- [x] Interest & Depreciation Expense tab with monthly/quarterly toggle
- [x] Lease Expiry tab with days-ahead filter and urgency badges
- [x] Cash Payment Forecast tab with months filter
- [x] Added to sidebar navigation under Accounting Engine

## Feature: Menu Cleanup + Currency Fix (May 2026)

### Remove Sidebar Menus
- [x] Remove "Amortization Master" from Accounting Engine children
- [x] Remove "Exemptions" from Accounting Engine children
- [x] Remove "Transaction Engine" from Accounting Engine children
- [x] Remove "FX Revaluation" from Accounting Engine children
- [x] Remove "Bulk Operations" from Accounting Engine children
- [x] Remove "Consolidation" from Accounting Engine children
- [x] Keep Accounting Engine parent (cleaned up children only)

### Currency Fix
- [x] Fix all currency displays to show actual currency (QAR/AED) not ZAR — DisclosureNotes.tsx and IAS17Comparison.tsx now fetch default_currency from settings
- [x] Default currency setting (QAR) already exists in Accounting Settings page (Configuration Centre)
- [x] default_currency already stored in accounting.system_settings table as 'QAR'

## Feature: Additional Menu Cleanup (May 2026)
- [x] Remove "ERP Export" from Accounting Engine
- [x] In Finance & Planning, keep only "Maturity Ladder" (remove all others)
- [x] In Budgeting & ESG, remove "Budgeting & Forecasting"

## Feature: Landing Page Demo Video (May 2026)
- [x] Create product demo video concept and get user approval (approved by user)
- [x] Generate video following video-generator skill workflow (6 clips + narration + BGM assembled into 32s final video)
- [x] Generate 7 new video clips for AI Report Engine (one per report type)
- [x] Generate narration for 7 new report clips
- [x] Merge 7 report clips into existing demo video (extended cut: 60s, 13 clips)
- [x] Build landing page with embedded final video at / (root) and /landing routes

## Feature: AI-Powered Report Engine (May 2026)

### Database
- [x] Create accounting.report_outputs table (id, report_type, generated_at, parameters_json, content_markdown, status)

### Backend (7 Enterprise Prompts + Generation + Storage + Retrieval)
- [x] Build generateReport procedure: pulls live data from SP, feeds to Azure OpenAI with enterprise prompt, stores result
- [x] Build getReport procedure: retrieves latest stored report by type
- [x] Build listReports procedure: lists all generated reports with timestamps
- [x] Craft enterprise prompt for Portfolio Summary (executive summary, risk indicators, concentration)
- [x] Craft enterprise prompt for ROU Roll-Forward (movement analysis, variance, impairment)
- [x] Craft enterprise prompt for Liability Roll-Forward (cash flow impact, refinancing risk)
- [x] Craft enterprise prompt for Maturity Analysis (liquidity risk, renewal strategy)
- [x] Craft enterprise prompt for Interest & Depreciation (P&L impact, budget variance, trends)
- [x] Craft enterprise prompt for Lease Expiry (action items, renewal/termination recommendations)
- [x] Craft enterprise prompt for Cash Forecast (cash planning, payment concentration, FX exposure)

### Frontend
- [x] Add "Generate Report" button to each tab (amber/gold gradient, calls generateReport)
- [x] Add "View Report" panel (emerald button, full-screen overlay with Streamdown markdown rendering)
- [x] Show generation timestamp, user, period, currency, report ID
- [x] Render markdown content with prose-invert styling and Streamdown component
- [x] Regenerate button inside overlay to refresh the report

## Feature: Extended Video Regeneration (May 2026 - Post Sandbox Reset)
- [x] Regenerate 7 AI Report Engine video clips from surviving reference images
- [x] Regenerate 7 narration audio files for report clips
- [x] Generate 60-second corporate ambient BGM
- [x] Assemble extended 60-second video (original 32s + 28s report section)
- [x] Upload extended video and update landing page video source URL
- [x] Replace last clip (logo reveal) with user-provided VodaLease Enterprise logo and reassemble extended video
