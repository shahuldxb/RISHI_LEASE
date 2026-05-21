/**
 * VodaLease Enterprise — Operations & Admin Router
 * Covers: Vendors, Brokers, LOI, TI Allowance, Desk Booking, Work Orders,
 *         Notifications, SSO Config, API Webhooks, E-Signature, Mobile Field App,
 *         Tenant Portal, Consolidation, Budgeting, Hedge Accounting, ESG Reporting,
 *         Lease Comparison, Data Quality, Lessor Finance Lease, MIS Reports
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db-sqlserver";

// ─── Vendor Management ────────────────────────────────────────────────────────
export const vendorRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("search", input.search ? `%${input.search}%` : null)
        .input("status", input.status ?? null)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name='ops') EXEC('CREATE SCHEMA ops');
          IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='vendors' AND schema_id=SCHEMA_ID('ops'))
            CREATE TABLE ops.vendors (
              vendor_id INT IDENTITY(1,1) PRIMARY KEY,
              vendor_code VARCHAR(20) NOT NULL,
              name NVARCHAR(200) NOT NULL,
              category NVARCHAR(100),
              contact_email NVARCHAR(200),
              contact_phone VARCHAR(30),
              trn VARCHAR(30),
              status VARCHAR(20) DEFAULT 'PENDING',
              rating DECIMAL(3,1) DEFAULT 0,
              notes NVARCHAR(MAX),
              created_at DATETIME2 DEFAULT GETUTCDATE(),
              updated_at DATETIME2 DEFAULT GETUTCDATE()
            );
          SELECT * FROM ops.vendors
          WHERE (@search IS NULL OR name LIKE @search OR vendor_code LIKE @search)
            AND (@status IS NULL OR status = @status)
          ORDER BY created_at DESC
        `);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      category: z.string().optional(),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
      trn: z.string().optional(),
      status: z.enum(["APPROVED","PENDING","BLACKLISTED","INACTIVE"]).default("PENDING"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(vendor_id),0)+1 AS n FROM ops.vendors`);
      const n = seq.recordset[0].n;
      const code = `VND-${String(n).padStart(4,"0")}`;
      await pool.request()
        .input("code", code).input("name", input.name).input("cat", input.category ?? null)
        .input("email", input.contact_email ?? null).input("phone", input.contact_phone ?? null)
        .input("trn", input.trn ?? null).input("status", input.status).input("notes", input.notes ?? null)
        .query(`INSERT INTO ops.vendors (vendor_code,name,category,contact_email,contact_phone,trn,status,notes) VALUES (@code,@name,@cat,@email,@phone,@trn,@status,@notes)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      vendor_id: z.number(),
      name: z.string().min(2),
      category: z.string().optional(),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
      trn: z.string().optional(),
      status: z.enum(["APPROVED","PENDING","BLACKLISTED","INACTIVE"]),
      rating: z.number().min(0).max(5).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.vendor_id).input("name", input.name).input("cat", input.category ?? null)
        .input("email", input.contact_email ?? null).input("phone", input.contact_phone ?? null)
        .input("trn", input.trn ?? null).input("status", input.status)
        .input("rating", input.rating ?? 0).input("notes", input.notes ?? null)
        .query(`UPDATE ops.vendors SET name=@name,category=@cat,contact_email=@email,contact_phone=@phone,trn=@trn,status=@status,rating=@rating,notes=@notes,updated_at=GETUTCDATE() WHERE vendor_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ vendor_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.vendor_id).query(`DELETE FROM ops.vendors WHERE vendor_id=@id`);
      return { success: true };
    }),
});

// ─── Broker Management ────────────────────────────────────────────────────────
export const brokerRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='brokers' AND schema_id=SCHEMA_ID('ops'))
          CREATE TABLE ops.brokers (
            broker_id INT IDENTITY(1,1) PRIMARY KEY,
            broker_code VARCHAR(20) NOT NULL,
            name NVARCHAR(200) NOT NULL,
            license_no VARCHAR(50),
            contact_email NVARCHAR(200),
            contact_phone VARCHAR(30),
            commission_pct DECIMAL(5,2) DEFAULT 0,
            status VARCHAR(20) DEFAULT 'ACTIVE',
            notes NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETUTCDATE()
          );
      `);
      const r = await pool.request()
        .input("search", input.search ? `%${input.search}%` : null)
        .query(`SELECT * FROM ops.brokers WHERE (@search IS NULL OR name LIKE @search) ORDER BY created_at DESC`);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      license_no: z.string().optional(),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
      commission_pct: z.number().min(0).max(100).default(0),
      status: z.enum(["ACTIVE","INACTIVE"]).default("ACTIVE"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(broker_id),0)+1 AS n FROM ops.brokers`);
      const code = `BRK-${String(seq.recordset[0].n).padStart(4,"0")}`;
      await pool.request()
        .input("code", code).input("name", input.name).input("lic", input.license_no ?? null)
        .input("email", input.contact_email ?? null).input("phone", input.contact_phone ?? null)
        .input("comm", input.commission_pct).input("status", input.status).input("notes", input.notes ?? null)
        .query(`INSERT INTO ops.brokers (broker_code,name,license_no,contact_email,contact_phone,commission_pct,status,notes) VALUES (@code,@name,@lic,@email,@phone,@comm,@status,@notes)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      broker_id: z.number(),
      name: z.string().min(2),
      license_no: z.string().optional(),
      contact_email: z.string().optional(),
      contact_phone: z.string().optional(),
      commission_pct: z.number().min(0).max(100),
      status: z.enum(["ACTIVE","INACTIVE"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.broker_id).input("name", input.name).input("lic", input.license_no ?? null)
        .input("email", input.contact_email ?? null).input("phone", input.contact_phone ?? null)
        .input("comm", input.commission_pct).input("status", input.status).input("notes", input.notes ?? null)
        .query(`UPDATE ops.brokers SET name=@name,license_no=@lic,contact_email=@email,contact_phone=@phone,commission_pct=@comm,status=@status,notes=@notes WHERE broker_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ broker_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.broker_id).query(`DELETE FROM ops.brokers WHERE broker_id=@id`);
      return { success: true };
    }),
});

// ─── LOI Tracking ─────────────────────────────────────────────────────────────
export const loiRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='loi_tracking' AND schema_id=SCHEMA_ID('lease'))
          CREATE TABLE lease.loi_tracking (
            loi_id INT IDENTITY(1,1) PRIMARY KEY,
            loi_ref VARCHAR(30) NOT NULL,
            property_name NVARCHAR(200) NOT NULL,
            lessor_name NVARCHAR(200),
            asset_type VARCHAR(50),
            location NVARCHAR(300),
            proposed_start DATE,
            proposed_end DATE,
            monthly_rent DECIMAL(18,2),
            currency CHAR(3) DEFAULT 'AED',
            status VARCHAR(30) DEFAULT 'DRAFT',
            submitted_date DATE,
            response_date DATE,
            notes NVARCHAR(MAX),
            created_by INT,
            created_at DATETIME2 DEFAULT GETUTCDATE()
          );
      `);
      const r = await pool.request()
        .input("search", input.search ? `%${input.search}%` : null)
        .input("status", input.status ?? null)
        .query(`SELECT * FROM lease.loi_tracking WHERE (@search IS NULL OR property_name LIKE @search OR loi_ref LIKE @search) AND (@status IS NULL OR status=@status) ORDER BY created_at DESC`);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      property_name: z.string().min(2),
      lessor_name: z.string().optional(),
      asset_type: z.string().optional(),
      location: z.string().optional(),
      proposed_start: z.string().optional(),
      proposed_end: z.string().optional(),
      monthly_rent: z.number().optional(),
      currency: z.string().default("AED"),
      status: z.enum(["DRAFT","SUBMITTED","ACCEPTED","REJECTED","EXPIRED"]).default("DRAFT"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(loi_id),0)+1 AS n FROM lease.loi_tracking`);
      const ref = `LOI-${new Date().getFullYear()}-${String(seq.recordset[0].n).padStart(4,"0")}`;
      await pool.request()
        .input("ref", ref).input("prop", input.property_name).input("lessor", input.lessor_name ?? null)
        .input("atype", input.asset_type ?? null).input("loc", input.location ?? null)
        .input("start", input.proposed_start ?? null).input("end", input.proposed_end ?? null)
        .input("rent", input.monthly_rent ?? null).input("ccy", input.currency).input("status", input.status)
        .input("notes", input.notes ?? null).input("user", ctx.user.id)
        .query(`INSERT INTO lease.loi_tracking (loi_ref,property_name,lessor_name,asset_type,location,proposed_start,proposed_end,monthly_rent,currency,status,notes,created_by) VALUES (@ref,@prop,@lessor,@atype,@loc,@start,@end,@rent,@ccy,@status,@notes,@user)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      loi_id: z.number(),
      property_name: z.string().min(2),
      lessor_name: z.string().optional(),
      asset_type: z.string().optional(),
      location: z.string().optional(),
      proposed_start: z.string().optional(),
      proposed_end: z.string().optional(),
      monthly_rent: z.number().optional(),
      currency: z.string(),
      status: z.enum(["DRAFT","SUBMITTED","ACCEPTED","REJECTED","EXPIRED"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.loi_id).input("prop", input.property_name).input("lessor", input.lessor_name ?? null)
        .input("atype", input.asset_type ?? null).input("loc", input.location ?? null)
        .input("start", input.proposed_start ?? null).input("end", input.proposed_end ?? null)
        .input("rent", input.monthly_rent ?? null).input("ccy", input.currency).input("status", input.status)
        .input("notes", input.notes ?? null)
        .query(`UPDATE lease.loi_tracking SET property_name=@prop,lessor_name=@lessor,asset_type=@atype,location=@loc,proposed_start=@start,proposed_end=@end,monthly_rent=@rent,currency=@ccy,status=@status,notes=@notes WHERE loi_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ loi_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.loi_id).query(`DELETE FROM lease.loi_tracking WHERE loi_id=@id`);
      return { success: true };
    }),
});

// ─── TI Allowance ─────────────────────────────────────────────────────────────
export const tiAllowanceRouter = router({
  list: protectedProcedure
    .input(z.object({ contract_id: z.number().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='ti_allowances' AND schema_id=SCHEMA_ID('lease'))
          CREATE TABLE lease.ti_allowances (
            ti_id INT IDENTITY(1,1) PRIMARY KEY,
            ti_ref VARCHAR(30) NOT NULL,
            contract_id INT,
            description NVARCHAR(300),
            total_amount DECIMAL(18,2) NOT NULL,
            currency CHAR(3) DEFAULT 'AED',
            received_date DATE,
            amortisation_start DATE,
            amortisation_end DATE,
            amortisation_method VARCHAR(30) DEFAULT 'STRAIGHT_LINE',
            gl_account VARCHAR(20),
            status VARCHAR(20) DEFAULT 'PENDING',
            notes NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETUTCDATE()
          );
      `);
      const r = await pool.request()
        .input("cid", input.contract_id ?? null)
        .query(`SELECT ti.*, c.contract_ref FROM lease.ti_allowances ti LEFT JOIN lease.contracts c ON c.contract_id=ti.contract_id WHERE (@cid IS NULL OR ti.contract_id=@cid) ORDER BY ti.created_at DESC`);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      contract_id: z.number().optional(),
      description: z.string().optional(),
      total_amount: z.number(),
      currency: z.string().default("AED"),
      received_date: z.string().optional(),
      amortisation_start: z.string().optional(),
      amortisation_end: z.string().optional(),
      amortisation_method: z.enum(["STRAIGHT_LINE","EFFECTIVE_INTEREST"]).default("STRAIGHT_LINE"),
      gl_account: z.string().optional(),
      status: z.enum(["PENDING","RECEIVED","AMORTISING","FULLY_AMORTISED"]).default("PENDING"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(ti_id),0)+1 AS n FROM lease.ti_allowances`);
      const ref = `TIA-${new Date().getFullYear()}-${String(seq.recordset[0].n).padStart(4,"0")}`;
      await pool.request()
        .input("ref", ref).input("cid", input.contract_id ?? null).input("desc", input.description ?? null)
        .input("amt", input.total_amount).input("ccy", input.currency)
        .input("recv", input.received_date ?? null).input("astart", input.amortisation_start ?? null)
        .input("aend", input.amortisation_end ?? null).input("method", input.amortisation_method)
        .input("gl", input.gl_account ?? null).input("status", input.status).input("notes", input.notes ?? null)
        .query(`INSERT INTO lease.ti_allowances (ti_ref,contract_id,description,total_amount,currency,received_date,amortisation_start,amortisation_end,amortisation_method,gl_account,status,notes) VALUES (@ref,@cid,@desc,@amt,@ccy,@recv,@astart,@aend,@method,@gl,@status,@notes)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      ti_id: z.number(),
      description: z.string().optional(),
      total_amount: z.number(),
      currency: z.string(),
      received_date: z.string().optional(),
      amortisation_start: z.string().optional(),
      amortisation_end: z.string().optional(),
      amortisation_method: z.enum(["STRAIGHT_LINE","EFFECTIVE_INTEREST"]),
      gl_account: z.string().optional(),
      status: z.enum(["PENDING","RECEIVED","AMORTISING","FULLY_AMORTISED"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.ti_id).input("desc", input.description ?? null)
        .input("amt", input.total_amount).input("ccy", input.currency)
        .input("recv", input.received_date ?? null).input("astart", input.amortisation_start ?? null)
        .input("aend", input.amortisation_end ?? null).input("method", input.amortisation_method)
        .input("gl", input.gl_account ?? null).input("status", input.status).input("notes", input.notes ?? null)
        .query(`UPDATE lease.ti_allowances SET description=@desc,total_amount=@amt,currency=@ccy,received_date=@recv,amortisation_start=@astart,amortisation_end=@aend,amortisation_method=@method,gl_account=@gl,status=@status,notes=@notes WHERE ti_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ ti_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.ti_id).query(`DELETE FROM lease.ti_allowances WHERE ti_id=@id`);
      return { success: true };
    }),
});

// ─── Desk Booking ─────────────────────────────────────────────────────────────
export const deskBookingRouter = router({
  list: protectedProcedure
    .input(z.object({ date: z.string().optional(), floor: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='desk_bookings' AND schema_id=SCHEMA_ID('ops'))
          CREATE TABLE ops.desk_bookings (
            booking_id INT IDENTITY(1,1) PRIMARY KEY,
            booking_ref VARCHAR(20) NOT NULL,
            desk_number VARCHAR(20) NOT NULL,
            floor_level VARCHAR(20),
            building NVARCHAR(100),
            booked_by_name NVARCHAR(100),
            booked_by_email NVARCHAR(200),
            booking_date DATE NOT NULL,
            start_time TIME,
            end_time TIME,
            status VARCHAR(20) DEFAULT 'CONFIRMED',
            notes NVARCHAR(500),
            created_at DATETIME2 DEFAULT GETUTCDATE()
          );
      `);
      const r = await pool.request()
        .input("date", input.date ?? null).input("floor", input.floor ?? null)
        .query(`SELECT * FROM ops.desk_bookings WHERE (@date IS NULL OR CAST(booking_date AS DATE)=@date) AND (@floor IS NULL OR floor_level=@floor) ORDER BY booking_date DESC, start_time`);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      desk_number: z.string(),
      floor_level: z.string().optional(),
      building: z.string().optional(),
      booked_by_name: z.string(),
      booked_by_email: z.string().optional(),
      booking_date: z.string(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(booking_id),0)+1 AS n FROM ops.desk_bookings`);
      const ref = `DSK-${String(seq.recordset[0].n).padStart(5,"0")}`;
      await pool.request()
        .input("ref", ref).input("desk", input.desk_number).input("floor", input.floor_level ?? null)
        .input("bldg", input.building ?? null).input("name", input.booked_by_name)
        .input("email", input.booked_by_email ?? null).input("date", input.booking_date)
        .input("start", input.start_time ?? null).input("end", input.end_time ?? null)
        .input("notes", input.notes ?? null)
        .query(`INSERT INTO ops.desk_bookings (booking_ref,desk_number,floor_level,building,booked_by_name,booked_by_email,booking_date,start_time,end_time,notes) VALUES (@ref,@desk,@floor,@bldg,@name,@email,@date,@start,@end,@notes)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      booking_id: z.number(),
      desk_number: z.string(),
      floor_level: z.string().optional(),
      building: z.string().optional(),
      booked_by_name: z.string(),
      booked_by_email: z.string().optional(),
      booking_date: z.string(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      status: z.enum(["CONFIRMED","CANCELLED","COMPLETED"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.booking_id).input("desk", input.desk_number).input("floor", input.floor_level ?? null)
        .input("bldg", input.building ?? null).input("name", input.booked_by_name)
        .input("email", input.booked_by_email ?? null).input("date", input.booking_date)
        .input("start", input.start_time ?? null).input("end", input.end_time ?? null)
        .input("status", input.status).input("notes", input.notes ?? null)
        .query(`UPDATE ops.desk_bookings SET desk_number=@desk,floor_level=@floor,building=@bldg,booked_by_name=@name,booked_by_email=@email,booking_date=@date,start_time=@start,end_time=@end,status=@status,notes=@notes WHERE booking_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ booking_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.booking_id).query(`DELETE FROM ops.desk_bookings WHERE booking_id=@id`);
      return { success: true };
    }),
});

// ─── Facilities Work Orders ────────────────────────────────────────────────────
export const workOrderRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), status: z.string().optional(), priority: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='work_orders' AND schema_id=SCHEMA_ID('ops'))
          CREATE TABLE ops.work_orders (
            wo_id INT IDENTITY(1,1) PRIMARY KEY,
            wo_ref VARCHAR(20) NOT NULL,
            title NVARCHAR(200) NOT NULL,
            description NVARCHAR(MAX),
            category VARCHAR(50),
            priority VARCHAR(20) DEFAULT 'MEDIUM',
            status VARCHAR(30) DEFAULT 'OPEN',
            location NVARCHAR(200),
            assigned_to NVARCHAR(100),
            vendor_id INT,
            estimated_cost DECIMAL(18,2),
            actual_cost DECIMAL(18,2),
            due_date DATE,
            completed_date DATE,
            created_at DATETIME2 DEFAULT GETUTCDATE(),
            updated_at DATETIME2 DEFAULT GETUTCDATE()
          );
      `);
      const r = await pool.request()
        .input("search", input.search ? `%${input.search}%` : null)
        .input("status", input.status ?? null).input("priority", input.priority ?? null)
        .query(`SELECT * FROM ops.work_orders WHERE (@search IS NULL OR title LIKE @search OR wo_ref LIKE @search) AND (@status IS NULL OR status=@status) AND (@priority IS NULL OR priority=@priority) ORDER BY created_at DESC`);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(2),
      description: z.string().optional(),
      category: z.string().optional(),
      priority: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).default("MEDIUM"),
      status: z.enum(["OPEN","IN_PROGRESS","ON_HOLD","COMPLETED","CANCELLED"]).default("OPEN"),
      location: z.string().optional(),
      assigned_to: z.string().optional(),
      vendor_id: z.number().optional(),
      estimated_cost: z.number().optional(),
      due_date: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(wo_id),0)+1 AS n FROM ops.work_orders`);
      const ref = `WO-${String(seq.recordset[0].n).padStart(5,"0")}`;
      await pool.request()
        .input("ref", ref).input("title", input.title).input("desc", input.description ?? null)
        .input("cat", input.category ?? null).input("priority", input.priority).input("status", input.status)
        .input("loc", input.location ?? null).input("assigned", input.assigned_to ?? null)
        .input("vid", input.vendor_id ?? null).input("est", input.estimated_cost ?? null)
        .input("due", input.due_date ?? null)
        .query(`INSERT INTO ops.work_orders (wo_ref,title,description,category,priority,status,location,assigned_to,vendor_id,estimated_cost,due_date) VALUES (@ref,@title,@desc,@cat,@priority,@status,@loc,@assigned,@vid,@est,@due)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      wo_id: z.number(),
      title: z.string().min(2),
      description: z.string().optional(),
      category: z.string().optional(),
      priority: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),
      status: z.enum(["OPEN","IN_PROGRESS","ON_HOLD","COMPLETED","CANCELLED"]),
      location: z.string().optional(),
      assigned_to: z.string().optional(),
      vendor_id: z.number().optional(),
      estimated_cost: z.number().optional(),
      actual_cost: z.number().optional(),
      due_date: z.string().optional(),
      completed_date: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.wo_id).input("title", input.title).input("desc", input.description ?? null)
        .input("cat", input.category ?? null).input("priority", input.priority).input("status", input.status)
        .input("loc", input.location ?? null).input("assigned", input.assigned_to ?? null)
        .input("vid", input.vendor_id ?? null).input("est", input.estimated_cost ?? null)
        .input("actual", input.actual_cost ?? null).input("due", input.due_date ?? null)
        .input("comp", input.completed_date ?? null)
        .query(`UPDATE ops.work_orders SET title=@title,description=@desc,category=@cat,priority=@priority,status=@status,location=@loc,assigned_to=@assigned,vendor_id=@vid,estimated_cost=@est,actual_cost=@actual,due_date=@due,completed_date=@comp,updated_at=GETUTCDATE() WHERE wo_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ wo_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.wo_id).query(`DELETE FROM ops.work_orders WHERE wo_id=@id`);
      return { success: true };
    }),
});

// ─── Notification Settings ─────────────────────────────────────────────────────
export const notificationSettingsRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='notification_settings' AND schema_id=SCHEMA_ID('ops'))
        CREATE TABLE ops.notification_settings (
          setting_id INT IDENTITY(1,1) PRIMARY KEY,
          event_type VARCHAR(50) NOT NULL,
          channel VARCHAR(20) DEFAULT 'EMAIL',
          recipients NVARCHAR(MAX),
          days_before INT DEFAULT 30,
          is_active BIT DEFAULT 1,
          template_subject NVARCHAR(200),
          template_body NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT GETUTCDATE()
        );
    `);
    const r = await pool.request().query(`SELECT * FROM ops.notification_settings ORDER BY event_type`);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      setting_id: z.number().optional(),
      event_type: z.string(),
      channel: z.enum(["EMAIL","SMS","PUSH","WEBHOOK"]).default("EMAIL"),
      recipients: z.string().optional(),
      days_before: z.number().default(30),
      is_active: z.boolean().default(true),
      template_subject: z.string().optional(),
      template_body: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      if (input.setting_id) {
        await pool.request()
          .input("id", input.setting_id).input("event", input.event_type).input("channel", input.channel)
          .input("recip", input.recipients ?? null).input("days", input.days_before)
          .input("active", input.is_active ? 1 : 0).input("subj", input.template_subject ?? null)
          .input("body", input.template_body ?? null)
          .query(`UPDATE ops.notification_settings SET event_type=@event,channel=@channel,recipients=@recip,days_before=@days,is_active=@active,template_subject=@subj,template_body=@body WHERE setting_id=@id`);
      } else {
        await pool.request()
          .input("event", input.event_type).input("channel", input.channel)
          .input("recip", input.recipients ?? null).input("days", input.days_before)
          .input("active", input.is_active ? 1 : 0).input("subj", input.template_subject ?? null)
          .input("body", input.template_body ?? null)
          .query(`INSERT INTO ops.notification_settings (event_type,channel,recipients,days_before,is_active,template_subject,template_body) VALUES (@event,@channel,@recip,@days,@active,@subj,@body)`);
      }
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ setting_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.setting_id).query(`DELETE FROM ops.notification_settings WHERE setting_id=@id`);
      return { success: true };
    }),
});

// ─── SSO Configuration ─────────────────────────────────────────────────────────
export const ssoConfigRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='sso_configs' AND schema_id=SCHEMA_ID('security'))
        CREATE TABLE security.sso_configs (
          config_id INT IDENTITY(1,1) PRIMARY KEY,
          provider_name NVARCHAR(100) NOT NULL,
          provider_type VARCHAR(30) DEFAULT 'SAML',
          entity_id NVARCHAR(300),
          sso_url NVARCHAR(500),
          logout_url NVARCHAR(500),
          certificate NVARCHAR(MAX),
          attribute_mapping NVARCHAR(MAX),
          is_active BIT DEFAULT 0,
          created_at DATETIME2 DEFAULT GETUTCDATE()
        );
    `);
    const r = await pool.request().query(`SELECT config_id,provider_name,provider_type,entity_id,sso_url,logout_url,is_active,created_at FROM security.sso_configs ORDER BY created_at DESC`);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      config_id: z.number().optional(),
      provider_name: z.string().min(2),
      provider_type: z.enum(["SAML","OIDC","OAUTH2"]).default("SAML"),
      entity_id: z.string().optional(),
      sso_url: z.string().optional(),
      logout_url: z.string().optional(),
      certificate: z.string().optional(),
      attribute_mapping: z.string().optional(),
      is_active: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      if (input.config_id) {
        await pool.request()
          .input("id", input.config_id).input("name", input.provider_name).input("type", input.provider_type)
          .input("entity", input.entity_id ?? null).input("sso", input.sso_url ?? null)
          .input("logout", input.logout_url ?? null).input("cert", input.certificate ?? null)
          .input("map", input.attribute_mapping ?? null).input("active", input.is_active ? 1 : 0)
          .query(`UPDATE security.sso_configs SET provider_name=@name,provider_type=@type,entity_id=@entity,sso_url=@sso,logout_url=@logout,certificate=@cert,attribute_mapping=@map,is_active=@active WHERE config_id=@id`);
      } else {
        await pool.request()
          .input("name", input.provider_name).input("type", input.provider_type)
          .input("entity", input.entity_id ?? null).input("sso", input.sso_url ?? null)
          .input("logout", input.logout_url ?? null).input("cert", input.certificate ?? null)
          .input("map", input.attribute_mapping ?? null).input("active", input.is_active ? 1 : 0)
          .query(`INSERT INTO security.sso_configs (provider_name,provider_type,entity_id,sso_url,logout_url,certificate,attribute_mapping,is_active) VALUES (@name,@type,@entity,@sso,@logout,@cert,@map,@active)`);
      }
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ config_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.config_id).query(`DELETE FROM security.sso_configs WHERE config_id=@id`);
      return { success: true };
    }),
});

// ─── API Webhook Configuration ─────────────────────────────────────────────────
export const apiWebhookRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='api_webhooks' AND schema_id=SCHEMA_ID('security'))
        CREATE TABLE security.api_webhooks (
          webhook_id INT IDENTITY(1,1) PRIMARY KEY,
          webhook_name NVARCHAR(100) NOT NULL,
          endpoint_url NVARCHAR(500) NOT NULL,
          event_types NVARCHAR(500),
          secret_key VARCHAR(100),
          is_active BIT DEFAULT 1,
          last_triggered DATETIME2,
          failure_count INT DEFAULT 0,
          created_at DATETIME2 DEFAULT GETUTCDATE()
        );
    `);
    const r = await pool.request().query(`SELECT webhook_id,webhook_name,endpoint_url,event_types,is_active,last_triggered,failure_count,created_at FROM security.api_webhooks ORDER BY created_at DESC`);
    return r.recordset;
  }),
  upsert: protectedProcedure
    .input(z.object({
      webhook_id: z.number().optional(),
      webhook_name: z.string().min(2),
      endpoint_url: z.string().url(),
      event_types: z.string().optional(),
      secret_key: z.string().optional(),
      is_active: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      if (input.webhook_id) {
        await pool.request()
          .input("id", input.webhook_id).input("name", input.webhook_name).input("url", input.endpoint_url)
          .input("events", input.event_types ?? null).input("secret", input.secret_key ?? null)
          .input("active", input.is_active ? 1 : 0)
          .query(`UPDATE security.api_webhooks SET webhook_name=@name,endpoint_url=@url,event_types=@events,secret_key=@secret,is_active=@active WHERE webhook_id=@id`);
      } else {
        await pool.request()
          .input("name", input.webhook_name).input("url", input.endpoint_url)
          .input("events", input.event_types ?? null).input("secret", input.secret_key ?? null)
          .input("active", input.is_active ? 1 : 0)
          .query(`INSERT INTO security.api_webhooks (webhook_name,endpoint_url,event_types,secret_key,is_active) VALUES (@name,@url,@events,@secret,@active)`);
      }
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ webhook_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.webhook_id).query(`DELETE FROM security.api_webhooks WHERE webhook_id=@id`);
      return { success: true };
    }),
});

// ─── Lease Modifications (CRUD) ────────────────────────────────────────────────
export const leaseModificationRouter = router({
  list: protectedProcedure
    .input(z.object({ contract_id: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("cid", input.contract_id ?? null).input("status", input.status ?? null)
        .query(`
          SELECT m.*, c.contract_ref, l.lessor_name
          FROM lease.modifications m
          JOIN lease.contracts c ON c.contract_id=m.contract_id
          LEFT JOIN lessor.lessors l ON l.lessor_id=c.lessor_id
          WHERE (@cid IS NULL OR m.contract_id=@cid)
            AND (@status IS NULL OR m.status=@status)
          ORDER BY m.created_at DESC
        `);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      modification_date: z.string(),
      modification_type: z.enum(["EXTENSION","REDUCTION","SCOPE_CHANGE","RENT_CHANGE"]),
      old_terms_json: z.string().optional(),
      new_terms_json: z.string().optional(),
      liability_adjustment: z.number().optional(),
      rou_adjustment: z.number().optional(),
      status: z.enum(["Draft","Submitted","Approved","Rejected"]).default("Draft"),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(modification_id),0)+1 AS n FROM lease.modifications`);
      const ref = `MOD-${new Date().getFullYear()}-${String(seq.recordset[0].n).padStart(4,"0")}`;
      await pool.request()
        .input("ref", ref).input("cid", input.contract_id).input("date", input.modification_date)
        .input("type", input.modification_type).input("old", input.old_terms_json ?? null)
        .input("new", input.new_terms_json ?? null).input("liab", input.liability_adjustment ?? null)
        .input("rou", input.rou_adjustment ?? null).input("status", input.status).input("maker", ctx.user.id)
        .query(`INSERT INTO lease.modifications (mod_ref,contract_id,modification_date,modification_type,old_terms_json,new_terms_json,liability_adjustment,rou_adjustment,status,maker_id) VALUES (@ref,@cid,@date,@type,@old,@new,@liab,@rou,@status,@maker)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      modification_id: z.number(),
      modification_date: z.string(),
      modification_type: z.enum(["EXTENSION","REDUCTION","SCOPE_CHANGE","RENT_CHANGE"]),
      liability_adjustment: z.number().optional(),
      rou_adjustment: z.number().optional(),
      status: z.enum(["Draft","Submitted","Approved","Rejected"]),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.modification_id).input("date", input.modification_date)
        .input("type", input.modification_type).input("liab", input.liability_adjustment ?? null)
        .input("rou", input.rou_adjustment ?? null).input("status", input.status)
        .query(`UPDATE lease.modifications SET modification_date=@date,modification_type=@type,liability_adjustment=@liab,rou_adjustment=@rou,status=@status WHERE modification_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ modification_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.modification_id).query(`DELETE FROM lease.modifications WHERE modification_id=@id`);
      return { success: true };
    }),
});

// ─── Lease Renewals (CRUD) ─────────────────────────────────────────────────────
export const leaseRenewalRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lease_renewals' AND schema_id=SCHEMA_ID('lease'))
          CREATE TABLE lease.lease_renewals (
            renewal_id INT IDENTITY(1,1) PRIMARY KEY,
            renewal_ref VARCHAR(30) NOT NULL,
            contract_id INT NOT NULL,
            renewal_type VARCHAR(30) DEFAULT 'EXTENSION',
            new_expiry_date DATE,
            new_monthly_payment DECIMAL(18,2),
            new_ibr DECIMAL(8,6),
            status VARCHAR(30) DEFAULT 'DRAFT',
            notes NVARCHAR(MAX),
            created_by INT,
            created_at DATETIME2 DEFAULT GETUTCDATE()
          );
      `);
      const r = await pool.request()
        .input("status", input.status ?? null)
        .query(`
          SELECT r.*, c.contract_ref, c.expiry_date AS current_expiry, l.lessor_name
          FROM lease.lease_renewals r
          JOIN lease.contracts c ON c.contract_id=r.contract_id
          LEFT JOIN lessor.lessors l ON l.lessor_id=c.lessor_id
          WHERE (@status IS NULL OR r.status=@status)
          ORDER BY r.created_at DESC
        `);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      contract_id: z.number(),
      renewal_type: z.enum(["EXTENSION","RENEGOTIATION","HOLDOVER"]).default("EXTENSION"),
      new_expiry_date: z.string().optional(),
      new_monthly_payment: z.number().optional(),
      new_ibr: z.number().optional(),
      status: z.enum(["DRAFT","SUBMITTED","APPROVED","REJECTED"]).default("DRAFT"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(renewal_id),0)+1 AS n FROM lease.lease_renewals`);
      const ref = `RNW-${new Date().getFullYear()}-${String(seq.recordset[0].n).padStart(4,"0")}`;
      await pool.request()
        .input("ref", ref).input("cid", input.contract_id).input("type", input.renewal_type)
        .input("expiry", input.new_expiry_date ?? null).input("payment", input.new_monthly_payment ?? null)
        .input("ibr", input.new_ibr ?? null).input("status", input.status)
        .input("notes", input.notes ?? null).input("user", ctx.user.id)
        .query(`INSERT INTO lease.lease_renewals (renewal_ref,contract_id,renewal_type,new_expiry_date,new_monthly_payment,new_ibr,status,notes,created_by) VALUES (@ref,@cid,@type,@expiry,@payment,@ibr,@status,@notes,@user)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      renewal_id: z.number(),
      renewal_type: z.enum(["EXTENSION","RENEGOTIATION","HOLDOVER"]),
      new_expiry_date: z.string().optional(),
      new_monthly_payment: z.number().optional(),
      new_ibr: z.number().optional(),
      status: z.enum(["DRAFT","SUBMITTED","APPROVED","REJECTED"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.renewal_id).input("type", input.renewal_type)
        .input("expiry", input.new_expiry_date ?? null).input("payment", input.new_monthly_payment ?? null)
        .input("ibr", input.new_ibr ?? null).input("status", input.status).input("notes", input.notes ?? null)
        .query(`UPDATE lease.lease_renewals SET renewal_type=@type,new_expiry_date=@expiry,new_monthly_payment=@payment,new_ibr=@ibr,status=@status,notes=@notes WHERE renewal_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ renewal_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.renewal_id).query(`DELETE FROM lease.lease_renewals WHERE renewal_id=@id`);
      return { success: true };
    }),
});

// ─── GL Journals (CRUD) ────────────────────────────────────────────────────────
export const glJournalRouter = router({
  list: protectedProcedure
    .input(z.object({ period: z.string().optional(), status: z.string().optional(), search: z.string().optional() }))
    .query(async ({ input }) => {
      const pool = await getPool();
      const r = await pool.request()
        .input("period", input.period ?? null).input("status", input.status ?? null)
        .input("search", input.search ? `%${input.search}%` : null)
        .query(`
          SELECT j.*, COUNT(l.line_id) AS line_count, SUM(l.debit_amount) AS total_debit
          FROM finance.gl_journals j
          LEFT JOIN finance.gl_lines l ON l.journal_id=j.journal_id
          WHERE (@period IS NULL OR j.period=@period)
            AND (@status IS NULL OR j.status=@status)
            AND (@search IS NULL OR j.journal_ref LIKE @search OR j.description LIKE @search)
          GROUP BY j.journal_id,j.journal_ref,j.reference,j.transaction_date,j.period,j.source,j.description,j.currency,j.status,j.maker_id,j.checker_id,j.posted_at,j.screen_id,j.process_start_time,j.process_end_time,j.elapsed_ms,j.created_at
          ORDER BY j.created_at DESC
        `);
      return r.recordset;
    }),
  create: protectedProcedure
    .input(z.object({
      reference: z.string().optional(),
      transaction_date: z.string(),
      period: z.string().optional(),
      source: z.enum(["IFRS16","Manual","Payables","Modification"]).default("Manual"),
      description: z.string(),
      currency: z.string().default("AED"),
      status: z.enum(["Draft","Posted","Reversed"]).default("Draft"),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(journal_id),0)+1 AS n FROM finance.gl_journals`);
      const ref = `JNL-${new Date().getFullYear()}-${String(seq.recordset[0].n).padStart(6,"0")}`;
      const period = input.period ?? input.transaction_date.substring(0,7);
      await pool.request()
        .input("ref", ref).input("reference", input.reference ?? null).input("date", input.transaction_date)
        .input("period", period).input("source", input.source).input("desc", input.description)
        .input("ccy", input.currency).input("status", input.status).input("maker", ctx.user.id)
        .query(`INSERT INTO finance.gl_journals (journal_ref,reference,transaction_date,period,source,description,currency,status,maker_id) VALUES (@ref,@reference,@date,@period,@source,@desc,@ccy,@status,@maker)`);
      return { success: true };
    }),
  update: protectedProcedure
    .input(z.object({
      journal_id: z.number(),
      reference: z.string().optional(),
      transaction_date: z.string(),
      period: z.string().optional(),
      source: z.enum(["IFRS16","Manual","Payables","Modification"]),
      description: z.string(),
      currency: z.string(),
      status: z.enum(["Draft","Posted","Reversed"]),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.journal_id).input("reference", input.reference ?? null)
        .input("date", input.transaction_date).input("period", input.period ?? null)
        .input("source", input.source).input("desc", input.description)
        .input("ccy", input.currency).input("status", input.status)
        .query(`UPDATE finance.gl_journals SET reference=@reference,transaction_date=@date,period=@period,source=@source,description=@desc,currency=@ccy,status=@status WHERE journal_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ journal_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.journal_id).query(`DELETE FROM finance.gl_journals WHERE journal_id=@id`);
      return { success: true };
    }),
});

// ─── Lease Comparison ─────────────────────────────────────────────────────────
export const leaseComparisonRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lease_comparisons' AND schema_id=SCHEMA_ID('lease'))
        CREATE TABLE lease.lease_comparisons (
          comparison_id INT IDENTITY(1,1) PRIMARY KEY,
          comparison_name NVARCHAR(200) NOT NULL,
          description NVARCHAR(MAX),
          contract_ids NVARCHAR(500),
          comparison_date DATE DEFAULT GETDATE(),
          created_by INT,
          created_at DATETIME2 DEFAULT GETUTCDATE()
        );
    `);
    const r = await pool.request().query(`SELECT * FROM lease.lease_comparisons ORDER BY created_at DESC`);
    return r.recordset;
  }),
  create: protectedProcedure
    .input(z.object({
      comparison_name: z.string().min(2),
      description: z.string().optional(),
      contract_ids: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pool = await getPool();
      await pool.request()
        .input("name", input.comparison_name).input("desc", input.description ?? null)
        .input("cids", input.contract_ids ?? null).input("user", ctx.user.id)
        .query(`INSERT INTO lease.lease_comparisons (comparison_name,description,contract_ids,created_by) VALUES (@name,@desc,@cids,@user)`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ comparison_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.comparison_id).query(`DELETE FROM lease.lease_comparisons WHERE comparison_id=@id`);
      return { success: true };
    }),
});

// ─── E-Signature Integration ───────────────────────────────────────────────────
export const eSignatureRouter = router({
  list: protectedProcedure.query(async () => {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='esignature_requests' AND schema_id=SCHEMA_ID('ops'))
        CREATE TABLE ops.esignature_requests (
          esign_id INT IDENTITY(1,1) PRIMARY KEY,
          esign_ref VARCHAR(30) NOT NULL,
          document_name NVARCHAR(200) NOT NULL,
          document_type VARCHAR(50),
          contract_id INT,
          signatories NVARCHAR(MAX),
          provider VARCHAR(50) DEFAULT 'DOCUSIGN',
          status VARCHAR(30) DEFAULT 'PENDING',
          sent_date DATETIME2,
          completed_date DATETIME2,
          envelope_id VARCHAR(100),
          notes NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT GETUTCDATE()
        );
    `);
    const r = await pool.request().query(`SELECT * FROM ops.esignature_requests ORDER BY created_at DESC`);
    return r.recordset;
  }),
  create: protectedProcedure
    .input(z.object({
      document_name: z.string().min(2),
      document_type: z.string().optional(),
      contract_id: z.number().optional(),
      signatories: z.string().optional(),
      provider: z.enum(["DOCUSIGN","ADOBE_SIGN","HELLOSIGN","MANUAL"]).default("DOCUSIGN"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      const seq = await pool.request().query(`SELECT ISNULL(MAX(esign_id),0)+1 AS n FROM ops.esignature_requests`);
      const ref = `ESG-${String(seq.recordset[0].n).padStart(5,"0")}`;
      await pool.request()
        .input("ref", ref).input("name", input.document_name).input("type", input.document_type ?? null)
        .input("cid", input.contract_id ?? null).input("sigs", input.signatories ?? null)
        .input("provider", input.provider).input("notes", input.notes ?? null)
        .query(`INSERT INTO ops.esignature_requests (esign_ref,document_name,document_type,contract_id,signatories,provider,notes) VALUES (@ref,@name,@type,@cid,@sigs,@provider,@notes)`);
      return { success: true };
    }),
  updateStatus: protectedProcedure
    .input(z.object({
      esign_id: z.number(),
      status: z.enum(["PENDING","SENT","COMPLETED","DECLINED","EXPIRED"]),
      envelope_id: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request()
        .input("id", input.esign_id).input("status", input.status).input("env", input.envelope_id ?? null)
        .query(`UPDATE ops.esignature_requests SET status=@status,envelope_id=@env,${input.status==="SENT"?"sent_date=GETUTCDATE(),":""}${input.status==="COMPLETED"?"completed_date=GETUTCDATE(),":""}updated_at=GETUTCDATE() WHERE esign_id=@id`);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ esign_id: z.number() }))
    .mutation(async ({ input }) => {
      const pool = await getPool();
      await pool.request().input("id", input.esign_id).query(`DELETE FROM ops.esignature_requests WHERE esign_id=@id`);
      return { success: true };
    }),
});
