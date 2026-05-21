import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 30000,
};

const procs = [
  // SP: Next JV Number
  { name: 'sp_NextJVNumber', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_NextJVNumber
  @period_key VARCHAR(10), @jv_number VARCHAR(30) OUTPUT
AS BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM accounting.jv_sequence WHERE period_key=@period_key)
    INSERT INTO accounting.jv_sequence (period_key,last_seq) VALUES (@period_key,0);
  UPDATE accounting.jv_sequence SET last_seq=last_seq+1 WHERE period_key=@period_key;
  SELECT @jv_number='JV-'+@period_key+'-'+RIGHT('00000'+CAST(last_seq AS VARCHAR),5)
  FROM accounting.jv_sequence WHERE period_key=@period_key;
END` },

  // SP: List Journal Vouchers
  { name: 'sp_ListJournalVouchers', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_ListJournalVouchers
  @status VARCHAR(20)=NULL, @jv_type VARCHAR(50)=NULL,
  @period_year INT=NULL, @period_month INT=NULL,
  @contract_id INT=NULL, @search VARCHAR(200)=NULL,
  @page INT=1, @page_size INT=50
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @offset INT=(@page-1)*@page_size;
  SELECT jv.jv_id,jv.jv_number,jv.jv_type,jv.period_year,jv.period_month,
    jv.posting_date,jv.description,jv.contract_id,
    c.contract_ref,c.asset_description,
    jv.source_ref,jv.source_type,jv.currency,
    jv.total_debit,jv.total_credit,jv.status,
    jv.rejection_reason,jv.created_by,jv.created_at,
    jv.posted_at,jv.posted_by,jv.notes,
    COUNT(*) OVER() AS total_count
  FROM accounting.journal_vouchers jv
  LEFT JOIN lease.contracts c ON c.contract_id=jv.contract_id
  WHERE (@status IS NULL OR jv.status=@status)
    AND (@jv_type IS NULL OR jv.jv_type=@jv_type)
    AND (@period_year IS NULL OR jv.period_year=@period_year)
    AND (@period_month IS NULL OR jv.period_month=@period_month)
    AND (@contract_id IS NULL OR jv.contract_id=@contract_id)
    AND (@search IS NULL OR jv.jv_number LIKE '%'+@search+'%'
         OR jv.description LIKE '%'+@search+'%'
         OR c.contract_ref LIKE '%'+@search+'%')
  ORDER BY jv.created_at DESC
  OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
END` },

  // SP: Get JV by ID
  { name: 'sp_GetJournalVoucher', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_GetJournalVoucher
  @jv_id INT
AS BEGIN
  SET NOCOUNT ON;
  SELECT jv.*,c.contract_ref,c.asset_description,c.currency AS contract_currency
  FROM accounting.journal_vouchers jv
  LEFT JOIN lease.contracts c ON c.contract_id=jv.contract_id
  WHERE jv.jv_id=@jv_id;
  SELECT l.*,a.account_type,a.account_subtype,a.ifrs16_category
  FROM accounting.jv_lines l
  LEFT JOIN accounting.gl_chart_of_accounts a ON a.account_code=l.account_code
  WHERE l.jv_id=@jv_id ORDER BY l.line_seq;
END` },

  // SP: Post JV
  { name: 'sp_PostJournalVoucher', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_PostJournalVoucher
  @jv_id INT, @posted_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE jv_id=@jv_id AND status IN ('Draft','Submitted'))
  BEGIN RAISERROR('JV not found or already posted/rejected',16,1); RETURN; END
  DECLARE @debit DECIMAL(18,4),@credit DECIMAL(18,4);
  SELECT @debit=SUM(CASE WHEN dr_cr='Dr' THEN amount ELSE 0 END),
         @credit=SUM(CASE WHEN dr_cr='Cr' THEN amount ELSE 0 END)
  FROM accounting.jv_lines WHERE jv_id=@jv_id;
  IF ABS(ISNULL(@debit,0)-ISNULL(@credit,0))>0.01
  BEGIN RAISERROR('JV is not balanced. Debit and credit totals must match.',16,1); RETURN; END
  UPDATE accounting.journal_vouchers
  SET status='Posted',posted_at=GETUTCDATE(),posted_by=@posted_by,
      total_debit=ISNULL(@debit,0),total_credit=ISNULL(@credit,0)
  WHERE jv_id=@jv_id;
  SELECT jv_id,jv_number,status FROM accounting.journal_vouchers WHERE jv_id=@jv_id;
END` },

  // SP: Reject JV
  { name: 'sp_RejectJournalVoucher', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_RejectJournalVoucher
  @jv_id INT, @rejected_by VARCHAR(200), @rejection_reason VARCHAR(500)
AS BEGIN
  SET NOCOUNT ON;
  UPDATE accounting.journal_vouchers
  SET status='Rejected',rejected_at=GETUTCDATE(),
      rejected_by=@rejected_by,rejection_reason=@rejection_reason
  WHERE jv_id=@jv_id AND status IN ('Draft','Submitted');
  SELECT jv_id,jv_number,status FROM accounting.journal_vouchers WHERE jv_id=@jv_id;
END` },

  // SP: Get System Settings
  { name: 'sp_GetSystemSettings', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_GetSystemSettings
AS BEGIN
  SET NOCOUNT ON;
  SELECT setting_key,setting_value,description,updated_by,updated_at
  FROM accounting.system_settings;
END` },

  // SP: Update System Setting
  { name: 'sp_UpdateSystemSetting', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_UpdateSystemSetting
  @setting_key VARCHAR(100), @setting_value VARCHAR(500), @updated_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM accounting.system_settings WHERE setting_key=@setting_key)
    UPDATE accounting.system_settings
    SET setting_value=@setting_value,updated_by=@updated_by,updated_at=GETUTCDATE()
    WHERE setting_key=@setting_key;
  ELSE
    INSERT INTO accounting.system_settings (setting_key,setting_value,updated_by)
    VALUES (@setting_key,@setting_value,@updated_by);
  SELECT setting_key,setting_value FROM accounting.system_settings WHERE setting_key=@setting_key;
END` },

  // SP: Get Chart of Accounts
  { name: 'sp_GetChartOfAccounts', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_GetChartOfAccounts
  @ifrs16_only BIT=0
AS BEGIN
  SET NOCOUNT ON;
  SELECT account_id,account_code,account_name,account_type,account_subtype,
         ifrs16_category,normal_balance,currency,is_active,description
  FROM accounting.gl_chart_of_accounts
  WHERE is_active=1 AND (@ifrs16_only=0 OR ifrs16_category IS NOT NULL)
  ORDER BY account_code;
END` },

  // SP: Generate Inception JV
  { name: 'sp_GenerateInceptionJV', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_GenerateInceptionJV
  @contract_id INT, @created_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE contract_id=@contract_id AND jv_type='INCEPTION' AND status!='Rejected')
  BEGIN RAISERROR('Inception JV already exists for this contract',16,1); RETURN; END

  DECLARE @pv_amount DECIMAL(18,4),@contract_ref VARCHAR(50),@asset_desc VARCHAR(200),
          @currency VARCHAR(10),@start_date DATE,@asset_type VARCHAR(100);
  SELECT @pv_amount=ISNULL(present_value,ISNULL(total_lease_value,0)),
    @contract_ref=contract_ref,@asset_desc=asset_description,
    @currency=ISNULL(currency,'QAR'),@start_date=lease_start_date,
    @asset_type=ISNULL(asset_type,'Property')
  FROM lease.contracts WHERE contract_id=@contract_id;

  IF ISNULL(@pv_amount,0)=0
  BEGIN RAISERROR('Contract has no present value',16,1); RETURN; END

  DECLARE @rou_acc VARCHAR(20)='10100',@rou_n VARCHAR(200)='Right-of-Use Asset — Property';
  DECLARE @liab_acc VARCHAR(20)='21020',@liab_n VARCHAR(200)='Lease Liability — Property';
  IF @asset_type LIKE '%Vehicle%' OR @asset_type LIKE '%Car%'
  BEGIN SET @rou_acc='10110';SET @rou_n='Right-of-Use Asset — Vehicles';SET @liab_acc='21030';SET @liab_n='Lease Liability — Vehicles'; END
  ELSE IF @asset_type LIKE '%Equipment%'
  BEGIN SET @rou_acc='10120';SET @rou_n='Right-of-Use Asset — Equipment';SET @liab_acc='21040';SET @liab_n='Lease Liability — Equipment'; END
  ELSE IF @asset_type LIKE '%IT%' OR @asset_type LIKE '%Telecom%' OR @asset_type LIKE '%Network%'
  BEGIN SET @rou_acc='10130';SET @rou_n='Right-of-Use Asset — IT Infrastructure';SET @liab_acc='21050';SET @liab_n='Lease Liability — IT Infrastructure'; END
  ELSE IF @asset_type LIKE '%Tower%' OR @asset_type LIKE '%Site%'
  BEGIN SET @rou_acc='10140';SET @rou_n='Right-of-Use Asset — Tower Sites';SET @liab_acc='21060';SET @liab_n='Lease Liability — Tower Sites'; END

  DECLARE @period_key VARCHAR(10)=FORMAT(ISNULL(@start_date,GETUTCDATE()),'yyyyMM');
  DECLARE @jv_number VARCHAR(30);
  EXEC accounting.sp_NextJVNumber @period_key,@jv_number OUTPUT;

  DECLARE @jv_id INT;
  INSERT INTO accounting.journal_vouchers
    (jv_number,jv_type,period_year,period_month,posting_date,description,
     contract_id,source_ref,source_type,currency,total_debit,total_credit,status,created_by)
  VALUES (@jv_number,'INCEPTION',
    YEAR(ISNULL(@start_date,GETUTCDATE())),MONTH(ISNULL(@start_date,GETUTCDATE())),
    ISNULL(@start_date,GETUTCDATE()),
    'IFRS 16 Day-1 Inception Entry — '+@contract_ref+' | '+@asset_desc,
    @contract_id,CAST(@contract_id AS VARCHAR),'CONTRACT',
    @currency,@pv_amount,@pv_amount,'Draft',@created_by);
  SET @jv_id=SCOPE_IDENTITY();

  INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
  VALUES (@jv_id,1,@rou_acc,@rou_n,'Dr',@pv_amount,
    'Recognition of Right-of-Use Asset at PV of lease payments',@contract_ref,@currency,
    'ROU Asset = PV of future lease payments = '+CAST(@pv_amount AS VARCHAR)+' '+@currency+'. Contract: '+@contract_ref);

  INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
  VALUES (@jv_id,2,@liab_acc,@liab_n,'Cr',@pv_amount,
    'Recognition of Lease Liability at PV of lease payments',@contract_ref,@currency,
    'Lease Liability = PV of future lease payments = '+CAST(@pv_amount AS VARCHAR)+' '+@currency+'. Contract: '+@contract_ref);

  SELECT @jv_id AS jv_id,@jv_number AS jv_number;
END` },

  // SP: Generate Monthly JVs (simplified without cursor for speed)
  { name: 'sp_GenerateMonthlyJVs', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_GenerateMonthlyJVs
  @period_year INT, @period_month INT, @created_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @period_date DATE=DATEFROMPARTS(@period_year,@period_month,1);
  DECLARE @period_key VARCHAR(10)=FORMAT(@period_date,'yyyyMM');
  DECLARE @generated INT=0;

  DECLARE @t TABLE (schedule_id INT,contract_id INT,interest DECIMAL(18,4),
    principal DECIMAL(18,4),depreciation DECIMAL(18,4),payment DECIMAL(18,4),
    contract_ref VARCHAR(50),asset_desc VARCHAR(200),currency VARCHAR(10),asset_type VARCHAR(100));

  INSERT INTO @t
  SELECT a.schedule_id,a.contract_id,a.interest_expense,a.principal,
    a.depreciation,a.payment,c.contract_ref,c.asset_description,
    ISNULL(c.currency,'QAR'),ISNULL(c.asset_type,'Property')
  FROM lease.amortisation_schedule a
  JOIN lease.contracts c ON c.contract_id=a.contract_id
  WHERE YEAR(a.period_date)=@period_year AND MONTH(a.period_date)=@period_month
    AND (a.posting_status IS NULL OR a.posting_status!='Posted')
    AND NOT EXISTS (
      SELECT 1 FROM accounting.journal_vouchers jv
      WHERE jv.contract_id=a.contract_id AND jv.jv_type='MONTHLY_AMORT'
        AND jv.period_year=@period_year AND jv.period_month=@period_month
        AND jv.status!='Rejected');

  DECLARE @sid INT,@cid INT,@int DECIMAL(18,4),@prin DECIMAL(18,4),
          @depr DECIMAL(18,4),@pay DECIMAL(18,4),@cref VARCHAR(50),
          @adesc VARCHAR(200),@cur VARCHAR(10),@atype VARCHAR(100);

  DECLARE c1 CURSOR LOCAL FAST_FORWARD FOR SELECT * FROM @t;
  OPEN c1;
  FETCH NEXT FROM c1 INTO @sid,@cid,@int,@prin,@depr,@pay,@cref,@adesc,@cur,@atype;
  WHILE @@FETCH_STATUS=0
  BEGIN
    DECLARE @jvn VARCHAR(30);
    EXEC accounting.sp_NextJVNumber @period_key,@jvn OUTPUT;
    DECLARE @tot DECIMAL(18,4)=ISNULL(@int,0)+ISNULL(@depr,0);

    DECLARE @rou_a VARCHAR(20)='10100',@acc_a VARCHAR(20)='10200',
            @liab_a VARCHAR(20)='21020',@int_a VARCHAR(20)='51010',@depr_a VARCHAR(20)='52010';
    DECLARE @rou_n2 VARCHAR(200)='Right-of-Use Asset — Property',
            @acc_n VARCHAR(200)='Accum. Depreciation — ROU Property',
            @liab_n2 VARCHAR(200)='Lease Liability — Property',
            @int_n2 VARCHAR(200)='Finance Cost — Lease Interest (Property)',
            @depr_n2 VARCHAR(200)='Depreciation — ROU Property';
    IF @atype LIKE '%Vehicle%'
    BEGIN SET @rou_a='10110';SET @acc_a='10210';SET @liab_a='21030';SET @int_a='51020';SET @depr_a='52020';
      SET @rou_n2='Right-of-Use Asset — Vehicles';SET @acc_n='Accum. Depreciation — ROU Vehicles';
      SET @liab_n2='Lease Liability — Vehicles';SET @int_n2='Finance Cost — Lease Interest (Vehicles)';SET @depr_n2='Depreciation — ROU Vehicles'; END

    DECLARE @jid2 INT;
    INSERT INTO accounting.journal_vouchers
      (jv_number,jv_type,period_year,period_month,posting_date,description,
       contract_id,source_ref,source_type,currency,total_debit,total_credit,status,created_by)
    VALUES (@jvn,'MONTHLY_AMORT',@period_year,@period_month,EOMONTH(@period_date),
      'Monthly IFRS 16 Amortisation — '+@cref+' | '+FORMAT(@period_date,'MMM yyyy'),
      @cid,CAST(@sid AS VARCHAR),'AMORTISATION',@cur,@tot,@tot,'Draft',@created_by);
    SET @jid2=SCOPE_IDENTITY();

    DECLARE @seq INT=1;
    IF ISNULL(@int,0)>0
    BEGIN
      INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
      VALUES (@jid2,@seq,@int_a,@int_n2,'Dr',@int,'Interest expense — unwinding of discount',@cref,@cur,
        'Interest = Opening Liability x IBR/12 = '+CAST(@int AS VARCHAR)+' '+@cur+'. Period: '+FORMAT(@period_date,'MMM yyyy'));
      SET @seq=@seq+1;
      INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
      VALUES (@jid2,@seq,@liab_a,@liab_n2,'Cr',@int,'Lease liability interest accrual',@cref,@cur,
        'Lease liability increases by interest accrued = '+CAST(@int AS VARCHAR)+' '+@cur);
      SET @seq=@seq+1;
    END
    IF ISNULL(@depr,0)>0
    BEGIN
      INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
      VALUES (@jid2,@seq,@depr_a,@depr_n2,'Dr',@depr,'ROU asset depreciation — straight-line',@cref,@cur,
        'Depreciation = ROU Asset Cost / Lease Term (months) = '+CAST(@depr AS VARCHAR)+' '+@cur+'. Period: '+FORMAT(@period_date,'MMM yyyy'));
      SET @seq=@seq+1;
      INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
      VALUES (@jid2,@seq,@acc_a,@acc_n,'Cr',@depr,'Accumulated depreciation on ROU asset',@cref,@cur,
        'Accumulated depreciation increases by '+CAST(@depr AS VARCHAR)+' '+@cur);
    END

    SET @generated=@generated+1;
    FETCH NEXT FROM c1 INTO @sid,@cid,@int,@prin,@depr,@pay,@cref,@adesc,@cur,@atype;
  END
  CLOSE c1; DEALLOCATE c1;
  SELECT @generated AS generated_count;
END` },

  // SP: Generate Remeasurement JV
  { name: 'sp_GenerateRemeasurementJV', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_GenerateRemeasurementJV
  @remeasurement_id INT, @created_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE source_ref=CAST(@remeasurement_id AS VARCHAR) AND source_type='REMEASUREMENT' AND status!='Rejected')
  BEGIN RAISERROR('JV already exists for this remeasurement event',16,1); RETURN; END

  DECLARE @cid INT,@etype VARCHAR(100),@edate DATE,@ladj DECIMAL(18,4),@radj DECIMAL(18,4),
          @cref VARCHAR(50),@cur VARCHAR(10),@tdesc VARCHAR(500);
  SELECT @cid=r.contract_id,@etype=r.event_type,@edate=r.event_date,
    @ladj=r.liability_adjustment,@radj=r.rou_adjustment,@tdesc=r.trigger_description,
    @cref=c.contract_ref,@cur=ISNULL(c.currency,'QAR')
  FROM lease.remeasurement_events r
  JOIN lease.contracts c ON c.contract_id=r.contract_id
  WHERE r.remeasurement_id=@remeasurement_id;

  DECLARE @pk VARCHAR(10)=FORMAT(ISNULL(@edate,GETUTCDATE()),'yyyyMM');
  DECLARE @jvn VARCHAR(30);
  EXEC accounting.sp_NextJVNumber @pk,@jvn OUTPUT;

  DECLARE @aladj DECIMAL(18,4)=ABS(ISNULL(@ladj,0));
  DECLARE @aradj DECIMAL(18,4)=ABS(ISNULL(@radj,0));
  DECLARE @tot DECIMAL(18,4)=@aladj+@aradj;

  DECLARE @jid INT;
  INSERT INTO accounting.journal_vouchers
    (jv_number,jv_type,period_year,period_month,posting_date,description,
     contract_id,source_ref,source_type,currency,total_debit,total_credit,status,created_by)
  VALUES (@jvn,'REMEASUREMENT',
    YEAR(ISNULL(@edate,GETUTCDATE())),MONTH(ISNULL(@edate,GETUTCDATE())),
    ISNULL(@edate,GETUTCDATE()),
    'IFRS 16 Remeasurement — '+@etype+' | '+@cref+' | '+ISNULL(@tdesc,''),
    @cid,CAST(@remeasurement_id AS VARCHAR),'REMEASUREMENT',
    @cur,@tot,@tot,'Draft',@created_by);
  SET @jid=SCOPE_IDENTITY();

  IF @ladj>0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
    VALUES (@jid,1,'10100','Right-of-Use Asset — Property','Dr',@aladj,'ROU Asset remeasurement — liability increase',@cref,@cur,
      'Remeasurement: Liability increased by '+CAST(@aladj AS VARCHAR)+'. ROU Asset adjusted upward per IFRS 16.45.');
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
    VALUES (@jid,2,'21020','Lease Liability — Property','Cr',@aladj,'Lease Liability remeasurement — increase',@cref,@cur,
      'Lease Liability increased by '+CAST(@aladj AS VARCHAR)+' due to: '+ISNULL(@tdesc,'remeasurement event'));
  END
  ELSE IF @ladj<0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
    VALUES (@jid,1,'21020','Lease Liability — Property','Dr',@aladj,'Lease Liability remeasurement — decrease',@cref,@cur,
      'Lease Liability decreased by '+CAST(@aladj AS VARCHAR)+' due to: '+ISNULL(@tdesc,'remeasurement event'));
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,contract_ref,currency,calc_explanation)
    VALUES (@jid,2,'10100','Right-of-Use Asset — Property','Cr',@aladj,'ROU Asset remeasurement — liability decrease',@cref,@cur,
      'ROU Asset adjusted downward by '+CAST(@aladj AS VARCHAR)+' per IFRS 16.45.');
  END

  SELECT @jid AS jv_id,@jvn AS jv_number;
END` },

  // SP: Generate Period Close JV
  { name: 'sp_GeneratePeriodCloseJV', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_GeneratePeriodCloseJV
  @close_id INT, @created_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM accounting.journal_vouchers WHERE source_ref=CAST(@close_id AS VARCHAR) AND source_type='PERIOD_CLOSE' AND status!='Rejected')
  BEGIN RAISERROR('JV already exists for this period close',16,1); RETURN; END

  DECLARE @py INT,@pm INT,@notes VARCHAR(500);
  SELECT @py=period_year,@pm=period_month,@notes=notes FROM lease.period_close WHERE close_id=@close_id;

  DECLARE @pd DATE=DATEFROMPARTS(@py,@pm,1);
  DECLARE @pk VARCHAR(10)=FORMAT(@pd,'yyyyMM');
  DECLARE @jvn VARCHAR(30);
  EXEC accounting.sp_NextJVNumber @pk,@jvn OUTPUT;

  DECLARE @tint DECIMAL(18,4),@tdepr DECIMAL(18,4);
  SELECT @tint=SUM(interest_expense),@tdepr=SUM(depreciation)
  FROM lease.amortisation_schedule
  WHERE YEAR(period_date)=@py AND MONTH(period_date)=@pm;

  DECLARE @tot DECIMAL(18,4)=ISNULL(@tint,0)+ISNULL(@tdepr,0);

  DECLARE @jid INT;
  INSERT INTO accounting.journal_vouchers
    (jv_number,jv_type,period_year,period_month,posting_date,description,
     contract_id,source_ref,source_type,currency,total_debit,total_credit,status,created_by,notes)
  VALUES (@jvn,'PERIOD_CLOSE',@py,@pm,EOMONTH(@pd),
    'Period-End Close — Consolidated IFRS 16 | '+FORMAT(@pd,'MMM yyyy'),
    NULL,CAST(@close_id AS VARCHAR),'PERIOD_CLOSE','QAR',@tot,@tot,'Draft',@created_by,ISNULL(@notes,''));
  SET @jid=SCOPE_IDENTITY();

  IF ISNULL(@tint,0)>0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,currency,calc_explanation)
    VALUES (@jid,1,'51000','Finance Cost — Lease Interest','Dr',@tint,'Consolidated interest expense for '+FORMAT(@pd,'MMM yyyy'),'QAR',
      'Sum of interest_expense across all active leases for '+FORMAT(@pd,'MMM yyyy')+' = '+CAST(@tint AS VARCHAR)+' QAR');
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,currency,calc_explanation)
    VALUES (@jid,2,'21000','Lease Liability — Current (< 1 Year)','Cr',@tint,'Consolidated lease liability interest accrual','QAR',
      'Lease liability increases by total interest accrued = '+CAST(@tint AS VARCHAR)+' QAR');
  END
  IF ISNULL(@tdepr,0)>0
  BEGIN
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,currency,calc_explanation)
    VALUES (@jid,3,'52000','Depreciation — ROU Asset','Dr',@tdepr,'Consolidated ROU depreciation for '+FORMAT(@pd,'MMM yyyy'),'QAR',
      'Sum of depreciation across all active leases for '+FORMAT(@pd,'MMM yyyy')+' = '+CAST(@tdepr AS VARCHAR)+' QAR');
    INSERT INTO accounting.jv_lines (jv_id,line_seq,account_code,account_name,dr_cr,amount,description,currency,calc_explanation)
    VALUES (@jid,4,'10200','Accum. Depreciation — ROU Property','Cr',@tdepr,'Consolidated accumulated depreciation increase','QAR',
      'Accumulated depreciation increases by '+CAST(@tdepr AS VARCHAR)+' QAR');
  END

  SELECT @jid AS jv_id,@jvn AS jv_number;
END` },

  // SP: Batch Post JVs
  { name: 'sp_BatchPostJVs', sql: `
CREATE OR ALTER PROCEDURE accounting.sp_BatchPostJVs
  @jv_ids_csv VARCHAR(MAX), @posted_by VARCHAR(200)
AS BEGIN
  SET NOCOUNT ON;
  DECLARE @posted_count INT=0,@failed_count INT=0;
  DECLARE @xml XML=CAST('<i>'+REPLACE(@jv_ids_csv,',','</i><i>')+'</i>' AS XML);
  DECLARE @jv_id INT;
  DECLARE id_cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT CAST(T.c.value('.','VARCHAR(20)') AS INT) FROM @xml.nodes('//i') T(c);
  OPEN id_cur;
  FETCH NEXT FROM id_cur INTO @jv_id;
  WHILE @@FETCH_STATUS=0
  BEGIN
    BEGIN TRY
      EXEC accounting.sp_PostJournalVoucher @jv_id,@posted_by;
      SET @posted_count=@posted_count+1;
    END TRY
    BEGIN CATCH SET @failed_count=@failed_count+1; END CATCH
    FETCH NEXT FROM id_cur INTO @jv_id;
  END
  CLOSE id_cur; DEALLOCATE id_cur;
  SELECT @posted_count AS posted_count,@failed_count AS failed_count;
END` },
];

async function run() {
  const pool = await sql.connect(cfg);
  console.log('Connected — creating stored procedures');

  for (let i = 0; i < procs.length; i++) {
    const p = procs[i];
    try {
      await pool.request().query(p.sql);
      console.log(`[${i+1}/${procs.length}] OK — ${p.name}`);
    } catch(e) {
      console.error(`[${i+1}/${procs.length}] FAIL — ${p.name}: ${e.message.substring(0,120)}`);
    }
  }

  // Verify
  const r = await pool.request().query(`
    SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES
    WHERE ROUTINE_SCHEMA='accounting' ORDER BY ROUTINE_NAME`);
  console.log('\nProcedures:', r.recordset.map(x=>x.ROUTINE_NAME));

  await pool.close();
  console.log('Done');
}

run().catch(e => { console.error(e.message); process.exit(1); });
