import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ─── Form type definitions ────────────────────────────────────────────────────
const FORM_PROMPTS: Record<string, { description: string; schema: Record<string, string> }> = {
  new_lease: {
    description: "A residential or commercial lease in Qatar (villa, apartment, office, or vehicle)",
    schema: {
      leaseRef: "Unique lease reference like LEASE-2024-001",
      leaseName: "Descriptive name e.g. 'West Bay Tower - Floor 12'",
      leaseType: "One of: OPERATING, FINANCE",
      assetClass: "One of: Villa, Apartment, Vehicle, Heavy Vehicle, Tower Site, Office, Retail Outlet, Warehouse, Data Centre, Other — default to Villa",
      lessorName: "Qatar-based property company name e.g. Barwa Real Estate, Ezdan Holding, United Development Company",
      lessorContact: "Contact person full name (Arabic or Western name)",
      lessorEmail: "Professional email address",
      lessorPhone: "+974 XXXX XXXX format",
      propertyAddress: "Full Qatar property address e.g. West Bay, Lusail City, The Pearl-Qatar, Al Sadd",
      city: "Doha",
      country: "QA",
      commencementDate: "ISO date YYYY-MM-DD, within last 2 years",
      expiryDate: "ISO date YYYY-MM-DD, 3-5 years from commencement",
      monthlyRent: "Realistic QAR monthly rent as number (e.g. 45000)",
      currency: "QAR",
      rentFrequency: "One of: MONTHLY, QUARTERLY, ANNUALLY",
      depositAmount: "Security deposit as number, typically 2-3 months rent",
      floorArea: "Floor area in sqm as number e.g. 450",
      floorAreaUnit: "SQM",
      assetCode: "Asset tag like QTEL-SITE-0142",
      gpsLat: "25.2854",
      gpsLng: "51.5310",
      taxId: "TRN-2024-00142",
      discountRate: "5.5",
      escalationRate: "3.0",
      noticePeriod: "90",
      renewalOption: "true",
      renewalTermMonths: "12",
      breakOption: "false",
      notes: "Realistic lease notes about the Qatar property",
      // Lessee Details (Step 2)
      lesseeType: "One of: Staff, Client, Other — default to Staff",
      lesseeName: "Full name of the staff member or client e.g. Mohammed Al-Thani, Sarah Johnson",
      staffNumber: "Employee staff number e.g. VQ-EMP-00142",
      employeeId: "Employee ID e.g. EMP-2024-00142",
      grade: "Employee grade e.g. Grade 7, Senior Manager, Band 4",
      lesseePosition: "Job title e.g. Network Engineer, Finance Manager, Sales Director",
      lesseeDepartment: "Department name e.g. Network Operations, Finance, Commercial",
      placeOfWork: "Office location e.g. Vodafone Qatar HQ, West Bay, Doha",
      lesseeContactEmail: "Staff email e.g. m.althani@vodafone.com.qa",
      lesseeContactPhone: "+974 XXXX XXXX format",
    },
  },
  msc_contract: {
    description: "A Master Services Contract governing a fleet of vehicles or residential homes in Qatar",
    schema: {
      mscRef: "Reference like MSC-2024-001",
      contractType: "One of: FLEET, RESIDENTIAL",
      titleEn: "Contract title in English",
      titleAr: "Contract title in Arabic",
      partyAEn: "First party Qatar company name in English (the lessee/client) e.g. Qatar Petroleum, Vodafone Qatar, Ooredoo",
      partyAAr: "First party company name in Arabic",
      partyBEn: "Second party Qatar company name in English (the lessor/provider) e.g. Barwa Real Estate, Ezdan Holding",
      partyBAr: "Second party company name in Arabic",
      effectiveDate: "ISO date YYYY-MM-DD",
      expiryDate: "ISO date YYYY-MM-DD, 2-3 years from effective",
      contractValue: "Total contract value in QAR as number e.g. 1200000",
      currency: "QAR",
      paymentTermsEn: "Payment terms in English e.g. Net 30 days from invoice date",
      paymentTermsAr: "Payment terms in Arabic",
      scopeEn: "Scope of services in English (2-3 sentences describing Qatar property services)",
      scopeAr: "Scope of services in Arabic (2-3 sentences)",
      governingLawEn: "Laws of the State of Qatar",
      governingLawAr: "قوانين دولة قطر",
      jurisdictionEn: "Courts of Qatar",
      jurisdictionAr: "محاكم قطر",
      terminationEn: "Either party may terminate with 30 days written notice",
      terminationAr: "يحق لأي طرف إنهاء العقد بإشعار كتابي مدته 30 يوماً",
      warrantiesEn: "All services shall be performed in accordance with Qatar standards",
      warrantiesAr: "تُنفَّذ جميع الخدمات وفقاً للمعايير القطرية",
      signedByEn: "CEO or Authorized Signatory name",
      signedByAr: "اسم المفوض بالتوقيع",
      witnessEn: "Witness full name",
      witnessAr: "اسم الشاهد",
    },
  },
  furnished_asset: {
    description: "A furnished asset (furniture or appliance) included with a leased property in Qatar",
    schema: {
      assetName: "Specific item name e.g. 'Executive Desk', 'LG Refrigerator', 'Herman Miller Chair'",
      assetCategory: "One of: Furniture, Appliance, Electronics, Fixture, Other",
      serialNumber: "Serial number like SN-2024-XXXXX",
      conditionAtHandover: "One of: Excellent, Good, Fair, Poor",
      notes: "Brief condition notes e.g. Minor scratches on surface, fully functional",
    },
  },
  asset_deposit: {
    description: "An asset deposit payment for furnished items in a leased property in Qatar",
    schema: {
      assetDescription: "Description of the asset e.g. 'Office Furniture Set - Floor 12, West Bay Tower'",
      depositAmount: "Deposit amount in QAR as number e.g. 15000",
      currency: "QAR",
      depositType: "One of: Cash, Cheque, Bank Guarantee, Letter of Credit",
    },
  },
  maintenance_ticket: {
    description: "A maintenance/repair ticket for a leased property in Qatar",
    schema: {
      title: "Short descriptive title e.g. 'AC Unit Failure - Floor 8'",
      description: "Detailed description of the maintenance issue in the Qatar property",
      priority: "One of: LOW, MEDIUM, HIGH, CRITICAL",
      category: "One of: PLUMBING, ELECTRICAL, HVAC, STRUCTURAL, CLEANING, SECURITY, OTHER",
      reportedBy: "Full name of person reporting",
      location: "Specific location e.g. Floor 8, West Bay Tower, Doha",
      estimatedCost: "Estimated repair cost in QAR as number e.g. 3500",
    },
  },
  insurance_policy: {
    description: "A property or fleet insurance policy in Qatar",
    schema: {
      policyNumber: "Policy number like POL-2024-XXXXX",
      insurer: "Qatar insurance company name e.g. Qatar Insurance Company, Al Khaleej Takaful, Doha Insurance",
      policyType: "One of: PROPERTY, LIABILITY, FLEET, CONTENTS, COMPREHENSIVE",
      coverageAmount: "Coverage amount in QAR as number e.g. 5000000",
      premium: "Annual premium in QAR as number e.g. 25000",
      startDate: "ISO date YYYY-MM-DD",
      endDate: "ISO date YYYY-MM-DD, 1 year from start",
      contactPerson: "Insurance agent full name",
      contactEmail: "Agent email address",
      contactPhone: "+974 XXXX XXXX format",
      notes: "Key policy notes or exclusions",
    },
  },
  vendor: {
    description: "A vendor or contractor providing services to leased properties in Qatar",
    schema: {
      vendorName: "Qatar company name e.g. Al Futtaim Engineering Qatar, Mannai Corporation, Gulf Catering",
      vendorCode: "Vendor code like VND-001",
      category: "One of: MAINTENANCE, CLEANING, SECURITY, LANDSCAPING, IT, CATERING, CONSTRUCTION, OTHER",
      contactPerson: "Primary contact full name",
      email: "Professional email",
      phone: "+974 XXXX XXXX format",
      address: "Qatar business address e.g. Industrial Area, Doha, Qatar",
      taxRegistration: "Qatar CR number like CR-XXXXXXXX",
      paymentTerms: "e.g. Net 30, Net 60",
      rating: "Number 1-5",
      notes: "Brief vendor notes",
    },
  },
  broker: {
    description: "A real estate broker or agent in Qatar",
    schema: {
      brokerName: "Full name",
      brokerCode: "Code like BRK-001",
      agency: "Qatar real estate agency name e.g. Cushman & Wakefield Qatar, CBRE Qatar, Asteco Qatar",
      licenseNumber: "Qatar real estate license number like QRE-XXXXX",
      email: "Professional email",
      phone: "+974 XXXX XXXX format",
      specialization: "One of: COMMERCIAL, RESIDENTIAL, INDUSTRIAL, MIXED",
      commissionRate: "Commission percentage as number (e.g. 2.5)",
      notes: "Brief broker notes",
    },
  },
  loi: {
    description: "A Letter of Intent for a commercial lease in Qatar",
    schema: {
      loiRef: "Reference like LOI-2024-001",
      propertyAddress: "Full Qatar property address e.g. West Bay, Lusail City, The Pearl-Qatar",
      proposedRent: "Proposed monthly rent in QAR as number e.g. 42000",
      proposedTerm: "Proposed lease term in months as number e.g. 36",
      proposedStartDate: "ISO date YYYY-MM-DD",
      depositOffered: "Deposit amount in QAR as number e.g. 84000",
      specialConditions: "Any special conditions e.g. Fit-out period of 2 months rent-free",
      validUntil: "ISO date YYYY-MM-DD, typically 30 days from today",
      notes: "Additional LOI notes",
    },
  },
  ti_allowance: {
    description: "A Tenant Improvement (TI) allowance for a leased commercial space in Qatar",
    schema: {
      projectName: "TI project name e.g. 'West Bay Office Fit-Out Phase 2'",
      approvedAmount: "Approved TI allowance in QAR as number e.g. 350000",
      spentToDate: "Amount spent to date in QAR as number e.g. 180000",
      contractor: "Qatar contractor company name e.g. Consolidated Contractors Company Qatar",
      startDate: "ISO date YYYY-MM-DD",
      completionDate: "ISO date YYYY-MM-DD, 3-6 months from start",
      scopeDescription: "Description of improvement works e.g. Office partitioning, flooring, lighting",
      notes: "Additional notes",
    },
  },
  security_deposit: {
    description: "A security deposit for a commercial lease in Qatar",
    schema: {
      depositAmount: "Deposit amount in QAR as number e.g. 90000",
      depositDate: "ISO date YYYY-MM-DD",
      depositType: "One of: CASH, BANK_GUARANTEE, CHEQUE",
      bankName: "Qatar bank name e.g. QNB, Commercial Bank of Qatar, Doha Bank, Masraf Al Rayan",
      bankRef: "Bank reference number",
      maturityDate: "ISO date YYYY-MM-DD for bank guarantee maturity",
      notes: "Brief deposit notes",
    },
  },
  sub_lease: {
    description: "A sub-lease arrangement for part of a leased property in Qatar",
    schema: {
      subTenantName: "Sub-tenant Qatar company or person name",
      subTenantContact: "Contact person name",
      subTenantEmail: "Email address",
      subTenantPhone: "+974 XXXX XXXX format",
      subleaseArea: "Sub-leased area in sqm as number e.g. 120",
      monthlyRent: "Monthly sub-lease rent in QAR as number e.g. 18000",
      startDate: "ISO date YYYY-MM-DD",
      endDate: "ISO date YYYY-MM-DD",
      notes: "Sub-lease terms and conditions",
    },
  },
  rent_review: {
    description: "A rent review for a commercial lease in Qatar",
    schema: {
      reviewDate: "ISO date YYYY-MM-DD",
      currentRent: "Current monthly rent in QAR as number e.g. 42000",
      proposedRent: "Proposed new monthly rent in QAR as number e.g. 45000",
      reviewBasis: "One of: CPI, FIXED_PERCENTAGE, MARKET_RATE, NEGOTIATED",
      increasePercentage: "Percentage increase as number e.g. 7.1",
      effectiveDate: "ISO date YYYY-MM-DD when new rent takes effect",
      notes: "Review notes and justification",
    },
  },
  lease_modification: {
    description: "A lease modification (remeasurement event) for an IFRS 16 lease in Qatar",
    schema: {
      modificationDate: "ISO date YYYY-MM-DD",
      modificationType: "One of: EXTENSION, REDUCTION, SCOPE_CHANGE, RENT_CHANGE",
      description: "Description of the modification e.g. Lease extended by 2 years at revised rent",
      newMonthlyRent: "New monthly rent in QAR as number e.g. 48000",
      newExpiryDate: "ISO date YYYY-MM-DD",
      newIBR: "New incremental borrowing rate as percentage e.g. 5.25",
      notes: "Modification notes",
    },
  },
  lease_termination: {
    description: "A lease termination event for a commercial lease in Qatar",
    schema: {
      terminationDate: "ISO date YYYY-MM-DD",
      terminationType: "One of: BREAK_OPTION, MUTUAL_AGREEMENT, EXPIRY, DEFAULT",
      penaltyAmount: "Termination penalty in QAR as number e.g. 90000",
      noticePeriodDays: "Notice period in days as number e.g. 90",
      reason: "Reason for termination e.g. Business relocation to Lusail City",
      notes: "Additional termination notes",
    },
  },
  budget_entry: {
    description: "A budget entry for lease-related costs in Qatar",
    schema: {
      budgetYear: "Budget year as number e.g. 2025",
      costCategory: "One of: RENT, MAINTENANCE, INSURANCE, UTILITIES, RATES, OTHER",
      budgetedAmount: "Budgeted amount in QAR as number e.g. 540000",
      actualAmount: "Actual amount spent in QAR as number e.g. 512000",
      variance: "Variance amount in QAR as number e.g. 28000",
      notes: "Budget notes e.g. Underspend due to delayed maintenance works",
    },
  },
  desk_booking: {
    description: "A desk or meeting room booking in a leased office space in Qatar",
    schema: {
      deskId: "Desk or room identifier like DESK-A12 or ROOM-B3",
      bookedBy: "Full name of person booking",
      bookingDate: "ISO date YYYY-MM-DD",
      startTime: "Start time in HH:MM format e.g. 09:00",
      endTime: "End time in HH:MM format e.g. 11:00",
      purpose: "Purpose of booking e.g. Team meeting, Client presentation",
      notes: "Additional booking notes",
    },
  },
  work_order: {
    description: "A facilities management work order for a leased property in Qatar",
    schema: {
      title: "Short work order title e.g. 'HVAC Filter Replacement - West Bay Tower'",
      description: "Detailed description of work required at the Qatar property",
      priority: "One of: LOW, MEDIUM, HIGH, URGENT",
      category: "One of: PLUMBING, ELECTRICAL, HVAC, PAINTING, CARPENTRY, CLEANING, LANDSCAPING, OTHER",
      assignedTo: "Qatar contractor or technician name",
      estimatedCost: "Estimated cost in QAR as number e.g. 4500",
      scheduledDate: "ISO date YYYY-MM-DD",
      completionDate: "ISO date YYYY-MM-DD",
      notes: "Work order notes",
    },
  },
  lessor: {
    description: "A property lessor (landlord) in Qatar",
    schema: {
      lessorName: "Qatar company or individual name e.g. Barwa Real Estate Company, Ezdan Holding Group, United Development Company",
      lessorType: "One of: Individual, Company, Government, REIT, Trust",
      registrationNo: "Qatar CR number like CR-12345678",
      taxId: "Qatar TIN number like TIN-XXXXXXXXXX",
      country: "2-letter ISO code: QA",
      city: "Doha",
      addressLine1: "Street address e.g. Office 501, Al Fardan Centre, West Bay",
      addressLine2: "District e.g. West Bay, Lusail, The Pearl-Qatar",
      postalCode: "Qatar postal code e.g. 23456",
      website: "Company website URL e.g. www.barwa.com.qa",
      creditRating: "One of: AAA, AA, A, BBB, BB, B, CCC",
      paymentTerms: "Payment terms in days as number e.g. 30",
      preferredCurrency: "QAR",
      status: "One of: Active, Inactive, Blacklisted",
    },
  },
  asset_registry: {
    description: "A physical asset in a leased property portfolio in Qatar",
    schema: {
      assetCode: "Asset code like ASSET-001",
      assetName: "Descriptive Qatar asset name e.g. West Bay Office Tower Floor 12",
      assetType: "One of: BUILDING, VEHICLE, EQUIPMENT, LAND, FIXTURE",
      description: "Detailed asset description",
      location: "Qatar location e.g. West Bay, Doha",
      purchaseDate: "ISO date YYYY-MM-DD",
      purchaseValue: "Purchase value in QAR as number e.g. 3500000",
      currentValue: "Current value in QAR as number e.g. 3200000",
      depreciationRate: "Annual depreciation rate as percentage e.g. 5",
      condition: "One of: EXCELLENT, GOOD, FAIR, POOR",
      notes: "Asset notes",
    },
  },
  lease_comparison: {
    description: "A lease comparison/benchmarking entry for commercial properties in Qatar",
    schema: {
      propertyName: "Qatar property name e.g. Tornado Tower, Al Fardan Centre, Lusail Plaza Tower",
      propertyAddress: "Full Qatar address e.g. West Bay, Doha, Qatar",
      assetClass: "One of: OFFICE, RETAIL, WAREHOUSE, RESIDENTIAL",
      floorArea: "Floor area in sqm as number e.g. 480",
      monthlyRent: "Monthly rent in QAR as number e.g. 48000",
      rentPerSqm: "Rent per sqm in QAR as number e.g. 100",
      leaseTermMonths: "Lease term in months as number e.g. 36",
      fitoutContribution: "Fit-out contribution in QAR as number e.g. 200000",
      parkingSpaces: "Number of parking spaces as number e.g. 4",
      notes: "Comparison notes",
    },
  },
  // alias — AssetRegistry page uses formType="asset"
  asset: {
    description: "A physical asset in a leased property portfolio in Qatar",
    schema: {
      assetName: "Descriptive Qatar asset name e.g. West Bay Tower Site 01, Lusail Office Block B",
      assetType: "One of: Office, Retail, Warehouse, Industrial, Residential",
      status: "One of: Available, Leased, Under Maintenance",
      country: "2-letter ISO country code: QA",
      city: "Doha",
      address: "Full Qatar street address e.g. Al Corniche Street, West Bay, Doha",
      floorArea: "Floor area in sqm as number e.g. 450",
      estimatedMarketValue: "Estimated market value in QAR as number e.g. 3200000",
      lastValuationDate: "ISO date YYYY-MM-DD e.g. 2024-06-30",
      makeGoodProvision: "Make good provision amount in QAR as number e.g. 65000",
      conditionRating: "One of: Excellent, Good, Fair, Poor",
      maintenanceResponsibility: "One of: Lessor, Lessee, Shared",
      notes: "Brief asset notes e.g. Prime West Bay location, recently refurbished",
    },
  },
  budget_variance: {
    description: "A budget vs actual variance entry for lease costs in Qatar",
    schema: {
      period: "Quarter/year like 2025-Q1",
      budgetAmount: "Budgeted amount in QAR as number e.g. 180000",
      actualAmount: "Actual amount in QAR as number e.g. 165000",
      varianceAmount: "Variance in QAR as number e.g. 15000",
      variancePct: "Variance percentage as number e.g. 8.3",
      category: "One of: Rent, Service Charge, Insurance, Maintenance, Other",
      notes: "Variance explanation e.g. Lower maintenance costs due to new service contract",
    },
  },
  cpi_escalation: {
    description: "A CPI escalation record for lease rent adjustments in Qatar",
    schema: {
      escalationDate: "ISO date YYYY-MM-DD",
      cpiIndex: "Qatar CPI index value as number e.g. 112.3",
      escalationRate: "Escalation rate as percentage e.g. 4.2",
      previousRent: "Previous monthly rent in QAR as number e.g. 42000",
      newRent: "New monthly rent in QAR as number e.g. 43764",
      notes: "Escalation notes e.g. Annual CPI adjustment per lease clause 8.2",
    },
  },
  lease_origination: {
    description: "A new lease origination request for commercial property in Qatar",
    schema: {
      propertyName: "Qatar property name e.g. Tornado Tower, Al Fardan Centre, Lusail Plaza",
      propertyAddress: "Full Qatar address e.g. West Bay, Doha, Qatar",
      assetType: "One of: Office, Retail, Warehouse, Industrial, Residential",
      floorArea: "Floor area in sqm as number e.g. 420",
      monthlyRent: "Monthly rent in QAR as number e.g. 45000",
      leaseTerm: "Lease term in months as number e.g. 36",
      commencementDate: "ISO date YYYY-MM-DD",
      lessorName: "Qatar lessor company name e.g. Barwa Real Estate, Ezdan Holding",
      notes: "Origination notes",
    },
  },
  lease_option: {
    description: "A lease renewal option or break clause for a commercial lease in Qatar",
    schema: {
      optionType: "One of: RENEWAL, PURCHASE, TERMINATION, EXPANSION",
      exerciseDeadline: "ISO date YYYY-MM-DD",
      noticePeriodDays: "Notice period in days as number e.g. 90",
      newTermMonths: "New term in months as number e.g. 24",
      newRent: "New monthly rent in QAR as number e.g. 47000",
      notes: "Option notes e.g. Renewal at prevailing market rate per RERA Qatar guidelines",
    },
  },
  lessor_bank: {
    description: "A lessor bank account record for payment processing in Qatar",
    schema: {
      bankName: "Qatar bank name e.g. QNB, Commercial Bank of Qatar, Doha Bank, Masraf Al Rayan, QIIB",
      accountNumber: "Qatar bank account number",
      iban: "Qatar IBAN like QA58QNBA000000000000693123456",
      swiftCode: "SWIFT/BIC code e.g. QNBAQAQA",
      currency: "QAR",
      accountType: "One of: Current, Savings",
    },
  },
  lessor_contact: {
    description: "A lessor contact person record in Qatar",
    schema: {
      contactName: "Full name (Arabic or Western)",
      role: "One of: Primary, Finance, Legal, Operations",
      email: "Professional email address",
      phone: "Qatar phone number +974 XXXX XXXX",
      department: "Department name e.g. Property Management, Finance",
    },
  },
  lessor_note: {
    description: "A note or memo regarding a Qatar property lessor",
    schema: {
      noteDate: "ISO date YYYY-MM-DD",
      noteType: "One of: General, Legal, Financial, Operational",
      subject: "Brief subject line e.g. 'Rent Escalation Discussion - Q2 2025'",
      content: "Detailed note content 2-3 sentences about the Qatar lessor interaction",
      author: "Author name",
    },
  },
  payment_runs: {
    description: "A payment run batch for lease invoices in Qatar",
    schema: {
      runDate: "ISO date YYYY-MM-DD",
      paymentMethod: "One of: Bank Transfer, Cheque, Direct Debit",
      totalAmount: "Total payment amount in QAR as number e.g. 135000",
      invoiceCount: "Number of invoices as number e.g. 8",
      bankAccount: "Qatar paying bank account name e.g. QNB Main Account",
      notes: "Payment run notes e.g. Monthly lease payments batch April 2025",
    },
  },
  space_management: {
    description: "A building or space management record for commercial property in Qatar",
    schema: {
      buildingName: "Qatar building name e.g. Tornado Tower, Al Fardan Centre, Lusail Plaza Tower",
      totalArea: "Total area in sqm as number e.g. 12000",
      occupiedArea: "Occupied area in sqm as number e.g. 9600",
      availableArea: "Available area in sqm as number e.g. 2400",
      occupancyRate: "Occupancy rate as percentage e.g. 80",
      location: "Qatar city and district e.g. West Bay, Doha",
      notes: "Space notes e.g. Grade A office tower, LEED certified",
    },
  },
  esg_carbon: {
    description: "An ESG carbon and energy reporting record for a leased property in Qatar",
    schema: {
      reportingPeriod: "Year-month like 2025-01",
      carbonKg: "Carbon emissions in kg CO2 as number e.g. 14200",
      energyKwh: "Energy consumption in kWh as number e.g. 52000",
      waterM3: "Water consumption in cubic meters as number e.g. 410",
      wasteKg: "Waste generated in kg as number e.g. 920",
      renewablePercent: "Percentage of renewable energy used e.g. 15",
    },
  },
  lessor_credit_score: {
    description: "A credit score assessment for a Qatar property lessor",
    schema: {
      score: "Credit score from 0 to 1000 as number e.g. 720",
      rating: "One of: AAA, AA, A, BBB, BB, B, CCC",
      assessmentDate: "ISO date YYYY-MM-DD",
      notes: "Brief assessment notes",
    },
  },
  lessor_finance_lease: {
    description: "A finance lease or credit facility record for a Qatar property lessor",
    schema: {
      financeType: "One of: Operating Lease, Finance Lease, Mortgage, Term Loan, Revolving Credit",
      facilityAmount: "Facility amount in QAR as number e.g. 6000000",
      currency: "QAR",
      interestRate: "Annual interest rate as percentage e.g. 5.25",
      maturityDate: "ISO date YYYY-MM-DD",
      lender: "Qatar bank name e.g. QNB, Commercial Bank of Qatar, Masraf Al Rayan",
    },
  },
  lease_data_quality: {
    description: "A data quality rule for lease data validation in Qatar",
    schema: {
      ruleName: "Short rule name e.g. 'Missing Commencement Date'",
      ruleType: "One of: Completeness, Accuracy, Consistency, Timeliness, Validity",
      severity: "One of: Critical, Warning, Info",
      description: "Detailed description of the data quality rule",
    },
  },
  tenant_request: {
    description: "A tenant service request or maintenance request for a leased property in Qatar",
    schema: {
      requestType: "One of: Maintenance, Complaint, Query, Document Request, Inspection",
      subject: "Short subject line e.g. 'AC Unit Not Working - Floor 5, West Bay Tower'",
      description: "Detailed description of the request at the Qatar property",
      priority: "One of: Low, Medium, High, Urgent",
    },
  },
  ibr_form: {
    description: "An incremental borrowing rate entry for IFRS 16 in Qatar",
    schema: {
      currency: "One of: QAR, USD, EUR, GBP, SAR",
      tenor: "Lease term in months as number e.g. 36",
      rate: "Annual IBR rate as percentage e.g. 5.75",
      effectiveDate: "ISO date YYYY-MM-DD",
      source: "Source e.g. Qatar Central Bank, QNB, Commercial Bank of Qatar",
    },
  },
  contract_milestone: {
    description: "A key contract milestone or deadline for a commercial lease in Qatar",
    schema: {
      milestoneType: "One of: Rent Review Date, Renewal Decision Deadline, Break Clause Date, Insurance Renewal, Maintenance Inspection, Regulatory Compliance, Payment Escalation, Make-Good Assessment",
      dueDate: "ISO date YYYY-MM-DD e.g. 2025-06-30",
      notes: "Brief description of the milestone action required e.g. Annual rent review per Qatar lease law",
    },
  },
  critical_date: {
    description: "A critical date event for a commercial lease contract in Qatar",
    schema: {
      eventType: "One of: Expiry, Renewal Option, Break Option, Rent Review, Inspection, Insurance Renewal, Regulatory Filing",
      eventDate: "ISO date YYYY-MM-DD e.g. 2025-09-30",
      notes: "Brief description of the action required on this date e.g. Submit renewal notice to lessor per Qatar tenancy law",
    },
  },
  variable_rent: {
    description: "A variable rent entry (turnover, percentage, or performance-based) for a commercial lease in Qatar",
    schema: {
      period: "Reporting period e.g. 2025-Q1 or 2025-01",
      variableType: "One of: Turnover, Percentage, Performance, Service Charge, Other",
      amount: "Variable rent amount in QAR as number e.g. 48000",
      currency: "QAR",
      notes: "Brief notes on the variable rent basis e.g. 8% of monthly turnover per lease clause 12.3",
    },
  },
};

// ─── Screen data generation prompts ─────────────────────────────────────────
const SCREEN_PROMPTS: Record<string, { description: string; count: number; rowSchema: Record<string, string> }> = {
  lease_register: {
    description: "Active IFRS 16 leases in a UAE enterprise portfolio",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      lease_ref: "Like LEASE-2024-001",
      lease_name: "Descriptive name e.g. 'Dubai Marina Office'",
      lessor_name: "UAE property company",
      asset_class: "One of: OFFICE, RETAIL, WAREHOUSE, RESIDENTIAL, VEHICLE",
      commencement_date: "ISO date YYYY-MM-DD",
      expiry_date: "ISO date YYYY-MM-DD 2-5 years later",
      monthly_rent: "Number 20000-500000",
      currency: "AED",
      status: "One of: ACTIVE, PENDING_APPROVAL, EXPIRED, TERMINATED",
      rou_asset: "Number close to monthly_rent * lease months",
      lease_liability: "Number slightly less than rou_asset",
    },
  },
  payables: {
    description: "Lease payment invoices and payables in a UAE enterprise",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      invoice_ref: "Like INV-2024-001",
      lease_ref: "Like LEASE-2024-001",
      lessor_name: "UAE property company",
      invoice_date: "ISO date YYYY-MM-DD recent",
      due_date: "ISO date YYYY-MM-DD 30 days after invoice",
      amount: "Number 20000-500000",
      currency: "AED",
      status: "One of: PENDING, APPROVED, PAID, OVERDUE",
      description: "Invoice description",
    },
  },
  bank_reconciliation: {
    description: "Bank statement transactions for lease payment reconciliation",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      transaction_date: "ISO date YYYY-MM-DD recent",
      description: "Bank transaction description",
      debit: "Number or empty string",
      credit: "Number or empty string",
      balance: "Running balance number",
      reference: "Bank reference number",
      status: "One of: MATCHED, UNMATCHED, PARTIAL",
      matched_invoice: "Invoice ref or empty string",
    },
  },
  cheque_inventory: {
    description: "Cheque book inventory for lease payments in UAE",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      cheque_number: "6-digit number",
      bank_name: "UAE bank name",
      account_number: "UAE bank account number",
      payee: "Payee name",
      amount: "Number 20000-500000",
      issue_date: "ISO date YYYY-MM-DD",
      due_date: "ISO date YYYY-MM-DD",
      status: "One of: BLANK, ISSUED, PRESENTED, CLEARED, BOUNCED, CANCELLED",
      lease_ref: "Like LEASE-2024-001",
    },
  },
  maintenance: {
    description: "Asset maintenance tickets for leased properties in UAE",
    count: 7,
    rowSchema: {
      id: "Sequential number",
      ticket_ref: "Like TKT-2024-001",
      lease_ref: "Like LEASE-2024-001",
      property: "Property name",
      issue_type: "One of: HVAC, PLUMBING, ELECTRICAL, STRUCTURAL, CLEANING, SECURITY",
      description: "Issue description",
      priority: "One of: LOW, MEDIUM, HIGH, CRITICAL",
      status: "One of: OPEN, IN_PROGRESS, RESOLVED, CLOSED",
      reported_date: "ISO date YYYY-MM-DD",
      assigned_to: "Technician name",
      estimated_cost: "Number 500-50000",
    },
  },
  insurance: {
    description: "Insurance policies for leased properties in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      policy_ref: "Like POL-2024-001",
      lease_ref: "Like LEASE-2024-001",
      property: "Property name",
      insurer: "UAE insurance company",
      policy_type: "One of: PROPERTY, LIABILITY, CONTENTS, COMPREHENSIVE",
      coverage_amount: "Number 500000-10000000",
      premium_annual: "Number 5000-100000",
      start_date: "ISO date YYYY-MM-DD",
      expiry_date: "ISO date YYYY-MM-DD 1 year later",
      status: "One of: ACTIVE, EXPIRING_SOON, EXPIRED",
    },
  },
  security_deposits: {
    description: "Security deposits held for leased properties in UAE",
    count: 7,
    rowSchema: {
      id: "Sequential number",
      deposit_ref: "Like DEP-2024-001",
      lease_ref: "Like LEASE-2024-001",
      lessor_name: "UAE property company",
      deposit_amount: "Number 50000-500000",
      currency: "AED",
      deposit_date: "ISO date YYYY-MM-DD",
      expected_release: "ISO date YYYY-MM-DD at lease end",
      bank_name: "UAE bank",
      bank_ref: "Bank reference",
      status: "One of: HELD, PARTIALLY_RELEASED, RELEASED, FORFEITED",
    },
  },
  sub_leases: {
    description: "Sub-lease agreements where the company is sub-lessor in UAE",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      sublease_ref: "Like SL-2024-001",
      parent_lease_ref: "Like LEASE-2024-001",
      sub_lessee: "Company name",
      property: "Property name",
      area_sqm: "Number 100-2000",
      monthly_income: "Number 10000-200000",
      start_date: "ISO date YYYY-MM-DD",
      end_date: "ISO date YYYY-MM-DD",
      status: "One of: ACTIVE, EXPIRED, PENDING",
    },
  },
  rent_reviews: {
    description: "Scheduled rent reviews for leased properties in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      lease_ref: "Like LEASE-2024-001",
      property: "Property name",
      lessor: "UAE property company",
      review_date: "ISO date YYYY-MM-DD upcoming",
      current_rent: "Number 20000-500000",
      proposed_rent: "Number slightly higher than current",
      review_type: "One of: CPI, Fixed, Market, Negotiated",
      status: "One of: Pending, Agreed, Upcoming, Disputed",
      basis: "Review basis e.g. CPI + 3%",
    },
  },
  lease_modifications: {
    description: "IFRS 16 lease modifications and remeasurements in UAE",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      modification_ref: "Like MOD-2024-001",
      lease_ref: "Like LEASE-2024-001",
      modification_type: "One of: EXTENSION, REDUCTION, SCOPE_CHANGE, RENT_CHANGE",
      effective_date: "ISO date YYYY-MM-DD",
      old_liability: "Number",
      new_liability: "Number",
      gain_loss: "Number positive or negative",
      status: "One of: PENDING, APPROVED, POSTED",
      notes: "Modification notes",
    },
  },
  lease_terminations: {
    description: "Lease terminations and early exits in UAE portfolio",
    count: 4,
    rowSchema: {
      id: "Sequential number",
      termination_ref: "Like TERM-2024-001",
      lease_ref: "Like LEASE-2024-001",
      property: "Property name",
      termination_date: "ISO date YYYY-MM-DD",
      reason: "One of: BUSINESS_CLOSURE, RELOCATION, COST_REDUCTION, MUTUAL_AGREEMENT",
      penalty_amount: "Number 0-500000",
      rou_derecognition: "Number",
      liability_derecognition: "Number",
      status: "One of: PENDING, APPROVED, COMPLETED",
    },
  },
  lease_renewals: {
    description: "Lease renewal negotiations in UAE portfolio",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      renewal_ref: "Like REN-2024-001",
      lease_ref: "Like LEASE-2024-001",
      property: "Property name",
      current_expiry: "ISO date YYYY-MM-DD upcoming",
      proposed_new_expiry: "ISO date YYYY-MM-DD 2-3 years later",
      current_rent: "Number",
      proposed_rent: "Number slightly higher",
      status: "One of: UNDER_NEGOTIATION, AGREED, DECLINED, PENDING_APPROVAL",
      notes: "Renewal notes",
    },
  },
  msc_register: {
    description: "Master Services Contracts governing vehicle fleets and residential homes in UAE",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      msc_ref: "Like MSC-2024-001",
      title_en: "Contract title in English",
      contract_type: "One of: FLEET, RESIDENTIAL",
      party_a_en: "Client company name",
      party_b_en: "Service provider company name",
      effective_date: "ISO date YYYY-MM-DD",
      expiry_date: "ISO date YYYY-MM-DD 2-3 years later",
      contract_value: "Number 500000-10000000",
      linked_assets: "Number 5-50",
      status: "One of: ACTIVE, EXPIRED, DRAFT, UNDER_REVIEW",
    },
  },
  furnished_assets: {
    description: "Furniture and appliance inventory for furnished residential leases in UAE",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      asset_code: "Like FA-001",
      name: "Item name e.g. 'Leather Sofa 3-Seater'",
      category: "One of: FURNITURE, APPLIANCE, ELECTRONICS, FIXTURE, KITCHEN",
      room: "One of: Living Room, Bedroom, Kitchen, Bathroom, Office",
      brand: "Brand name",
      model: "Model number or name",
      condition: "One of: EXCELLENT, GOOD, FAIR, POOR",
      purchase_value: "Number 500-50000",
      current_value: "Number less than purchase",
      quantity: "Number 1-4",
    },
  },
  asset_deposits: {
    description: "Asset/furniture deposits for furnished properties in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      deposit_ref: "Like AD-2024-001",
      property: "Property name",
      tenant: "Tenant company or person name",
      deposit_amount: "Number 10000-100000",
      currency: "AED",
      deposit_date: "ISO date YYYY-MM-DD",
      assets_covered: "Number 5-20",
      status: "One of: HELD, PARTIALLY_RELEASED, RELEASED",
      bank_ref: "Bank reference",
    },
  },
  vendors: {
    description: "Vendor and contractor records for property maintenance in UAE",
    count: 7,
    rowSchema: {
      id: "Sequential number",
      vendor_code: "Like VND-001",
      company_name: "UAE company name",
      category: "One of: HVAC, PLUMBING, ELECTRICAL, CLEANING, SECURITY, IT, GENERAL",
      contact_person: "Contact name",
      phone: "+971 XX XXX XXXX",
      email: "Professional email",
      trade_license: "UAE trade license number",
      rating: "Number 1-5",
      status: "One of: APPROVED, PENDING, BLACKLISTED",
      last_engagement: "ISO date YYYY-MM-DD",
    },
  },
  brokers: {
    description: "Real estate brokers and agents for lease origination in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      broker_code: "Like BRK-001",
      name: "Full name",
      agency: "Real estate agency name",
      rera_number: "RERA registration number",
      phone: "+971 XX XXX XXXX",
      email: "Professional email",
      specialization: "One of: COMMERCIAL, RESIDENTIAL, INDUSTRIAL, MIXED",
      deals_ytd: "Number 1-20",
      commission_ytd: "Number 50000-500000",
      status: "One of: ACTIVE, INACTIVE",
    },
  },
  loi_tracking: {
    description: "Letters of Intent for pre-contract lease negotiations in UAE",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      loi_ref: "Like LOI-2024-001",
      property: "Property name",
      lessor: "Lessor company",
      proposed_area: "Number sqm",
      proposed_rent: "Number monthly AED",
      loi_date: "ISO date YYYY-MM-DD",
      expiry_date: "ISO date YYYY-MM-DD 30 days later",
      status: "One of: DRAFT, SUBMITTED, ACCEPTED, REJECTED, CONVERTED",
      notes: "LOI notes",
    },
  },
  gl_journals: {
    description: "General ledger journal entries for IFRS 16 lease accounting",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      journal_ref: "Like JNL-2024-001",
      posting_date: "ISO date YYYY-MM-DD",
      description: "Journal description",
      debit_account: "GL account code like 1200",
      credit_account: "GL account code like 2100",
      amount: "Number 10000-500000",
      currency: "AED",
      lease_ref: "Like LEASE-2024-001",
      status: "One of: DRAFT, POSTED, REVERSED",
    },
  },
  amortisation: {
    description: "IFRS 16 amortisation schedule entries for a lease",
    count: 12,
    rowSchema: {
      period: "Month number 1-12",
      payment_date: "ISO date YYYY-MM-DD monthly",
      opening_liability: "Number decreasing each period",
      interest_charge: "Number (opening * IBR/12)",
      principal_payment: "Number (payment - interest)",
      lease_payment: "Number (consistent monthly payment)",
      closing_liability: "Number (opening - principal)",
      rou_depreciation: "Number (ROU / lease months)",
      rou_closing: "Number decreasing each period",
    },
  },
  ibr_library: {
    description: "Incremental borrowing rates by currency and term for IFRS 16 in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      currency: "One of: AED, USD, EUR, GBP, SAR",
      lease_term_min: "Number months",
      lease_term_max: "Number months",
      rate_pct: "Number 4.5-8.5",
      effective_from: "ISO date YYYY-MM-DD",
      source: "Central bank or financial source",
      is_active: "true",
    },
  },
  workflow_tasks: {
    description: "Pending workflow approval tasks in a lease management system",
    count: 7,
    rowSchema: {
      id: "Sequential number",
      task_ref: "Like TASK-2024-001",
      workflow_type: "One of: LEASE_APPROVAL, INVOICE_APPROVAL, PAYMENT_RUN, MODIFICATION",
      subject: "Task subject description",
      requested_by: "Requester name",
      assigned_to: "Approver name",
      created_date: "ISO date YYYY-MM-DD",
      due_date: "ISO date YYYY-MM-DD",
      priority: "One of: LOW, MEDIUM, HIGH, URGENT",
      status: "One of: PENDING, IN_REVIEW, ESCALATED",
    },
  },
  audit_log: {
    description: "System audit log entries for a lease management platform",
    count: 10,
    rowSchema: {
      id: "Sequential number",
      timestamp: "ISO datetime recent",
      user: "Username",
      action: "One of: CREATE, UPDATE, DELETE, APPROVE, REJECT, LOGIN, EXPORT",
      module: "One of: Lease, Payables, Workflow, Security, Reports",
      record_ref: "Reference like LEASE-2024-001",
      description: "Action description",
      ip_address: "IP address like 192.168.1.x",
      result: "One of: SUCCESS, FAILED",
    },
  },
  error_log: {
    description: "System error log entries for a lease management platform",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      timestamp: "ISO datetime recent",
      severity: "One of: INFO, WARNING, ERROR, CRITICAL",
      module: "Module name",
      error_code: "Error code like ERR-001",
      message: "Error message description",
      user: "Username or SYSTEM",
      resolved: "true or false",
    },
  },
  work_orders: {
    description: "Facilities work orders for leased properties in UAE",
    count: 7,
    rowSchema: {
      id: "Sequential number",
      wo_ref: "Like WO-2024-001",
      property: "Property name",
      category: "One of: HVAC, PLUMBING, ELECTRICAL, CLEANING, STRUCTURAL",
      description: "Work description",
      vendor: "Vendor company name",
      raised_date: "ISO date YYYY-MM-DD",
      scheduled_date: "ISO date YYYY-MM-DD",
      cost_estimate: "Number 1000-100000",
      status: "One of: OPEN, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED",
    },
  },
  desk_booking: {
    description: "Desk and meeting room bookings in leased office spaces in UAE",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      booking_ref: "Like BKG-001",
      space_name: "Desk or room name",
      space_type: "One of: HOT_DESK, MEETING_ROOM, PRIVATE_OFFICE, PHONE_BOOTH",
      booked_by: "Employee name",
      booking_date: "ISO date YYYY-MM-DD",
      start_time: "Time like 09:00",
      end_time: "Time like 17:00",
      floor: "Floor number or name",
      status: "One of: CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED",
    },
  },
  esg_reporting: {
    description: "ESG and carbon footprint data for leased properties in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      property: "Property name",
      period: "Quarter like Q1 2024",
      electricity_kwh: "Number 10000-500000",
      water_m3: "Number 100-5000",
      carbon_tonnes: "Number 5-500",
      waste_tonnes: "Number 1-50",
      green_rating: "One of: LEED Gold, LEED Silver, BREEAM, None",
      renewable_pct: "Number 0-100",
      notes: "ESG notes",
    },
  },
  consolidation: {
    description: "Multi-entity lease consolidation data for a UAE group",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      entity: "Subsidiary company name",
      country: "UAE or GCC country",
      lease_count: "Number 5-50",
      total_rou: "Number millions",
      total_liability: "Number millions",
      intercompany_elimination: "Number",
      currency: "AED",
      period: "Like Q1 2024",
      status: "One of: DRAFT, REVIEWED, APPROVED",
    },
  },
  budgeting: {
    description: "Lease cost budget vs actual for a UAE enterprise",
    count: 8,
    rowSchema: {
      id: "Sequential number",
      cost_center: "Department or cost center",
      lease_ref: "Like LEASE-2024-001",
      property: "Property name",
      budget_annual: "Number",
      actual_ytd: "Number less than budget",
      forecast_annual: "Number close to budget",
      variance: "Number positive or negative",
      variance_pct: "Number percentage",
      period: "Like FY2024",
    },
  },
  furniture_collections: {
    description: "Furniture collection packs assigned to residential properties in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      collection_name: "Like 'Villa A-101 Furniture Pack'",
      property_id: "Like PROP-001",
      property_name: "Villa or flat name",
      item_count: "Number 10-40",
      total_value: "Number 50000-500000",
      condition: "One of: EXCELLENT, GOOD, FAIR",
      last_inspection: "ISO date YYYY-MM-DD",
      status: "One of: ACTIVE, NEEDS_REVIEW, ARCHIVED",
    },
  },
  lessor_master: {
    description: "Lessor/landlord master records for UAE lease portfolio",
    count: 7,
    rowSchema: {
      id: "Sequential number",
      lessor_code: "Like LSR-001",
      company_name: "UAE property company",
      contact_person: "Contact name",
      phone: "+971 XX XXX XXXX",
      email: "Professional email",
      city: "UAE city",
      active_leases: "Number 1-20",
      total_portfolio_value: "Number millions AED",
      payment_terms: "Like Net 30",
      status: "One of: ACTIVE, INACTIVE",
    },
  },
  asset_registry: {
    description: "Physical asset registry for leased properties in UAE",
    count: 7,
    rowSchema: {
      id: "Sequential number",
      asset_code: "Like ASSET-001",
      asset_name: "Asset name",
      asset_type: "One of: BUILDING, VEHICLE, EQUIPMENT, LAND, FIXTURE",
      location: "UAE location",
      purchase_value: "Number",
      current_value: "Number less than purchase",
      depreciation_rate: "Number 5-25",
      condition: "One of: EXCELLENT, GOOD, FAIR, POOR",
      lease_ref: "Like LEASE-2024-001",
      status: "One of: ACTIVE, DISPOSED, UNDER_MAINTENANCE",
    },
  },
  ti_allowance: {
    description: "Tenant improvement allowance records for commercial leases in UAE",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      ti_ref: "Like TI-2024-001",
      lease_ref: "Like LEASE-2024-001",
      property: "Property name",
      lessor: "Lessor name",
      allowance_agreed: "Number 100000-2000000",
      claimed_to_date: "Number less than agreed",
      remaining: "Number",
      claim_deadline: "ISO date YYYY-MM-DD",
      status: "One of: ACTIVE, FULLY_CLAIMED, EXPIRED",
    },
  },
  esignature: {
    description: "E-signature requests for lease documents in UAE",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      request_ref: "Like ESIG-2024-001",
      document_name: "Document name",
      lease_ref: "Like LEASE-2024-001",
      sent_to: "Signatory name",
      sent_date: "ISO date YYYY-MM-DD",
      signed_date: "ISO date YYYY-MM-DD or empty",
      provider: "One of: DocuSign, Adobe Sign, HelloSign",
      status: "One of: SENT, VIEWED, SIGNED, DECLINED, EXPIRED",
    },
  },
  lease_comparison: {
    description: "Market lease comparison and benchmarking data for UAE properties",
    count: 6,
    rowSchema: {
      id: "Sequential number",
      property_name: "Property name",
      location: "UAE location",
      asset_class: "One of: OFFICE, RETAIL, WAREHOUSE, RESIDENTIAL",
      floor_area: "Number sqm",
      monthly_rent: "Number AED",
      rent_per_sqm: "Number AED/sqm",
      lease_term_months: "Number",
      fit_out_contribution: "Number AED",
      vs_portfolio_avg: "Percentage like +12% or -5%",
    },
  },
  sso_config: {
    description: "SSO/SAML identity provider configurations for enterprise login",
    count: 3,
    rowSchema: {
      id: "Sequential number",
      provider_name: "Like Microsoft Azure AD",
      entity_id: "SAML entity ID URL",
      sso_url: "SSO login URL",
      certificate_expiry: "ISO date YYYY-MM-DD",
      user_count: "Number 50-500",
      last_login: "ISO datetime",
      status: "One of: ACTIVE, INACTIVE, TESTING",
    },
  },
  api_webhooks: {
    description: "API webhook configurations for lease system integrations",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      webhook_name: "Webhook name",
      endpoint_url: "HTTPS URL",
      event_type: "One of: lease.created, payment.due, approval.required, document.signed",
      last_triggered: "ISO datetime",
      success_rate: "Number 90-100",
      status: "One of: ACTIVE, PAUSED, ERROR",
    },
  },
  lessee_master: {
    description: "Lessee master records for Vodafone Qatar group entities — the companies that take leases",
    count: 5,
    rowSchema: {
      id: "Sequential number",
      lessee_code: "Like VF-QA-001, VF-QA-002, VF-INT-001, VF-QA-003, VF-QA-004",
      lessee_name: "Vodafone Qatar subsidiary or group entity legal name e.g. Vodafone Qatar P.Q.S.C., Vodafone Qatar Business Solutions W.L.L., Vodafone Qatar Retail LLC, Vodafone International Holdings B.V., Vodafone Qatar Infrastructure Services W.L.L.",
      trade_name: "Short brand name e.g. VF Qatar, VF Business, VF Retail, VF International, VF Infrastructure",
      entity_type: "One of: Company, Subsidiary, Branch, JV, Individual",
      parent_company: "e.g. Vodafone Group Plc or Vodafone Qatar P.Q.S.C.",
      registration_no: "Qatar CR number like CR-00034567",
      tax_vat_no: "Qatar VAT number like VAT-10023456789",
      industry_sector: "One of: Telecommunications, Digital Services, Retail, Infrastructure, Finance",
      credit_rating: "One of: AAA, AA+, AA, A+, A, BBB+, BBB",
      country: "Qatar",
      city: "Doha",
      address: "Qatar business address e.g. West Bay, Al Sadd, Lusail, Education City, The Pearl",
      contact_person: "Arabic or Western full name",
      contact_email: "Professional email at vodafone.qa domain",
      contact_phone: "+974 XXXX XXXX format",
      status: "One of: Active, Inactive, Suspended — mostly Active",
      username: "The name of the user who created this record (for audit trail)",
      user_role: "Role of the user who created this record e.g. admin, user",
    },
  },
};

export const aiFillRouter = router({
  generateScreenData: protectedProcedure
    .input(
      z.object({
        screenType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const screenConfig = SCREEN_PROMPTS[input.screenType];
      if (!screenConfig) {
        // Return generic data for unknown screen types
        return { rows: [], screenType: input.screenType, generated: true };
      }

      const schemaDescription = Object.entries(screenConfig.rowSchema)
        .map(([key, desc]) => `  "${key}": ${desc}`)
        .join(",\n");

      const systemPrompt = `You are a data generation assistant for VodaLease Enterprise, an IFRS 16 lease management platform used by Vodafone Qatar. Generate realistic, professional, and internally consistent sample data. All monetary values in QAR unless specified. Dates should be realistic. Names should be realistic Qatar/GCC names or international companies operating in Qatar. Country is always Qatar (QA). City is always Doha unless otherwise specified. Return ONLY valid JSON, no markdown, no explanation.`;

      const userPrompt = `Generate ${screenConfig.count} realistic sample records for: ${screenConfig.description}.

Return ONLY a valid JSON object with a "rows" array containing exactly ${screenConfig.count} objects, each with these fields:
{
  "rows": [
    {
${schemaDescription}
    }
  ]
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],

      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("No response from AI");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      try {
        const parsed = JSON.parse(content);
        return { rows: parsed.rows || [], screenType: input.screenType, generated: true };
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { rows: parsed.rows || [], screenType: input.screenType, generated: true };
        }
        throw new Error("Failed to parse AI response as JSON");
      }
    }),

  fillForm: protectedProcedure
    .input(
      z.object({
        formType: z.string(),
        existingData: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const formConfig = FORM_PROMPTS[input.formType];
      if (!formConfig) {
        throw new Error(`Unknown form type: ${input.formType}`);
      }

      const schemaDescription = Object.entries(formConfig.schema)
        .map(([key, desc]) => `  "${key}": ${desc}`)
        .join(",\n");

      const existingContext = input.existingData && Object.keys(input.existingData).length > 0
        ? `\n\nExisting partial data to build upon:\n${JSON.stringify(input.existingData, null, 2)}`
        : "";

      const systemPrompt = `You are a data generation assistant for VodaLease Enterprise, an IFRS 16 lease management platform used by Vodafone Qatar. Generate realistic, professional, and internally consistent sample data for lease management forms. All monetary values should be in QAR unless specified. Dates should be realistic and internally consistent. Names should be realistic Qatar/GCC names or international company names operating in Qatar. Country is always Qatar (QA). City is always Doha unless otherwise specified.`;

      const userPrompt = `Generate realistic sample data for: ${formConfig.description}.${existingContext}

Return ONLY a valid JSON object with exactly these fields (no extra fields, no markdown, no explanation):
{
${schemaDescription}
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const rawContent = response.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error("No response from AI");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      try {
        return JSON.parse(content) as Record<string, string>;
      } catch {
        // Try to extract JSON from the response if it contains extra text
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]) as Record<string, string>;
        }
        throw new Error("Failed to parse AI response as JSON");
      }
    }),
});
