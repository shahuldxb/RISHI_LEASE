import sql from 'mssql';

const cfg = {
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT || '1433'),
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(cfg);

  // 1. Fix sp_CreateLease to compute PV and ROU at creation time
  await pool.request().batch(`
    ALTER PROCEDURE dbo.sp_CreateLease
      @LessorId INT, @AssetType VARCHAR(50), @AssetDescription NVARCHAR(500),
      @AssetTag VARCHAR(100), @LocationJson NVARCHAR(MAX), @CommencementDate DATE,
      @ExpiryDate DATE, @TermMonths INT, @MonthlyPayment DECIMAL(18,2), @Currency CHAR(3),
      @EscalationRate DECIMAL(8,4), @EscalationDate DATE, @IBR DECIMAL(8,6),
      @DepositAmount DECIMAL(18,2), @IFRS16Classification VARCHAR(20),
      @RenewalOption BIT, @RenewalCertain BIT, @PurchaseOption BIT, @PurchaseCertain BIT,
      @MakeGoodObligation BIT, @MakeGoodEstimate DECIMAL(18,2), @InitialDirectCosts DECIMAL(18,2),
      @LeaseIncentives DECIMAL(18,2), @IsLTO BIT, @LTOPurchasePrice DECIMAL(18,2),
      @LTODeposit DECIMAL(18,2), @LTONetFinanced DECIMAL(18,2), @LTOTotalInstalments INT,
      @LTOInstalmentAmount DECIMAL(18,2), @LTOFrequency VARCHAR(20), @LTOFinanceChargeRate DECIMAL(8,6),
      @LTOBalloonAmount DECIMAL(18,2), @LTOTransferDate DATE, @MaintenanceResp VARCHAR(20),
      @MakerId INT, @ScreenId VARCHAR(20), @ProcessStartTime DATETIME2
    AS BEGIN
      SET NOCOUNT ON;
      
      -- Compute PV of lease payments using annuity formula
      DECLARE @MonthlyRate DECIMAL(18,10) = @IBR / 12.0;
      DECLARE @PV DECIMAL(18,2);
      IF @MonthlyRate > 0
        SET @PV = @MonthlyPayment * ((1.0 - POWER(1.0 + @MonthlyRate, -@TermMonths)) / @MonthlyRate);
      ELSE
        SET @PV = @MonthlyPayment * @TermMonths;
      
      -- ROU Asset = PV + IDC - Incentives + Make-Good
      DECLARE @ROU DECIMAL(18,2) = @PV + ISNULL(@InitialDirectCosts, 0) - ISNULL(@LeaseIncentives, 0) + ISNULL(@MakeGoodEstimate, 0);
      
      DECLARE @Seq INT; SELECT @Seq=ISNULL(MAX(contract_id),0)+1 FROM lease.contracts;
      DECLARE @ContractRef VARCHAR(30)='LSE-'+CAST(YEAR(GETUTCDATE()) AS VARCHAR)+'-'+RIGHT('000000'+CAST(@Seq AS VARCHAR),6);
      INSERT INTO lease.contracts (contract_ref,lessor_id,asset_type,asset_description,asset_tag,
        location_json,commencement_date,expiry_date,term_months,monthly_payment,currency,
        escalation_rate,escalation_date,ibr,deposit_amount,ifrs16_classification,
        renewal_option,renewal_certain,purchase_option,purchase_certain,
        make_good_obligation,make_good_estimate,initial_direct_costs,lease_incentives,
        is_lto,lto_purchase_price,lto_deposit,lto_net_financed,lto_total_instalments,
        lto_instalment_amount,lto_frequency,lto_finance_charge_rate,lto_balloon_amount,lto_transfer_date,
        maintenance_responsibility,status,lifecycle_status,
        rou_asset_value,lease_liability_commence,
        maker_id,screen_id,process_start_time,process_end_time,elapsed_ms)
      VALUES (@ContractRef,@LessorId,@AssetType,@AssetDescription,@AssetTag,
        @LocationJson,@CommencementDate,@ExpiryDate,@TermMonths,@MonthlyPayment,@Currency,
        @EscalationRate,@EscalationDate,@IBR,@DepositAmount,@IFRS16Classification,
        @RenewalOption,@RenewalCertain,@PurchaseOption,@PurchaseCertain,
        @MakeGoodObligation,@MakeGoodEstimate,@InitialDirectCosts,@LeaseIncentives,
        @IsLTO,@LTOPurchasePrice,@LTODeposit,@LTONetFinanced,@LTOTotalInstalments,
        @LTOInstalmentAmount,@LTOFrequency,@LTOFinanceChargeRate,@LTOBalloonAmount,@LTOTransferDate,
        @MaintenanceResp,'Draft',N'Active',
        @ROU, @PV,
        @MakerId,@ScreenId,@ProcessStartTime,GETUTCDATE(),
        DATEDIFF(MILLISECOND,@ProcessStartTime,GETUTCDATE()));
      SELECT SCOPE_IDENTITY() AS contract_id, @ContractRef AS contract_ref, @ROU AS rou_asset_value, @PV AS lease_liability_commence;
    END
  `);
  console.log('1. sp_CreateLease updated with PV/ROU computation');

  // 2. Fix existing contract_id=36 with correct PV/ROU
  const pv = 75000 * ((1 - Math.pow(1 + 0.005, -48)) / 0.005);
  const rou = pv + 10000; // IDC = 10000, incentives = 0
  console.log(`   PV: ${pv.toFixed(2)}, ROU: ${rou.toFixed(2)}`);

  await pool.request()
    .input('pv', sql.Decimal(18, 2), pv)
    .input('rou', sql.Decimal(18, 2), rou)
    .query('UPDATE lease.contracts SET rou_asset_value=@rou, lease_liability_commence=@pv WHERE contract_id=36');
  console.log('2. Contract 36 updated with correct PV/ROU');

  // 3. Delete old incorrect JV
  await pool.request().query('DELETE FROM accounting.jv_lines WHERE jv_id=32');
  await pool.request().query('DELETE FROM accounting.journal_vouchers WHERE jv_id=32');
  console.log('3. Old JV (jv_id=32) deleted');

  // 4. Re-post the JV with correct values
  const r = await pool.request()
    .input('contract_id', sql.Int, 36)
    .execute('accounting.sp_PostInitialRecognitionJV');
  console.log('4. JV re-posted:', JSON.stringify(r.recordset[0]));

  // 5. Verify the new JV lines
  const jvId = r.recordset[0].jv_id;
  const lines = await pool.request().query(`SELECT account_code, account_name, dr_cr, amount FROM accounting.jv_lines WHERE jv_id=${jvId} ORDER BY line_id`);
  console.log('\n=== Day-1 JV Lines ===');
  lines.recordset.forEach(row => {
    console.log(`  ${row.dr_cr} ${row.account_code} ${row.account_name}: QAR ${Number(row.amount).toLocaleString('en', {minimumFractionDigits:2})}`);
  });

  await pool.close();
}

run().catch(e => console.error('ERROR:', e.message));
