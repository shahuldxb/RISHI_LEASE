-- ─── Staff Master: Upsert & Delete Stored Procedures ─────────────────────────

-- sp_UpsertStaff
IF OBJECT_ID('hr.sp_UpsertStaff', 'P') IS NOT NULL DROP PROCEDURE hr.sp_UpsertStaff;
GO
CREATE PROCEDURE hr.sp_UpsertStaff
  @StaffId      INT            = NULL,
  @StaffNumber  VARCHAR(50),
  @FullName     NVARCHAR(200),
  @Designation  NVARCHAR(200)  = NULL,
  @Department   NVARCHAR(200)  = NULL,
  @Grade        VARCHAR(20)    = NULL,
  @Position     NVARCHAR(200)  = NULL,
  @PlaceOfWork  NVARCHAR(300)  = NULL,
  @Email        VARCHAR(200)   = NULL,
  @Phone        VARCHAR(50)    = NULL,
  @Entity       NVARCHAR(200)  = NULL,
  @Status       VARCHAR(20)    = 'Active'
AS
BEGIN
  SET NOCOUNT ON;
  IF @StaffId IS NULL OR @StaffId = 0
  BEGIN
    INSERT INTO hr.staff (staff_number, full_name, designation, department, grade, position, place_of_work, email, phone, entity, status, created_at)
    VALUES (@StaffNumber, @FullName, @Designation, @Department, @Grade, @Position, @PlaceOfWork, @Email, @Phone, @Entity, @Status, GETUTCDATE());
    SELECT SCOPE_IDENTITY() AS staff_id;
  END
  ELSE
  BEGIN
    UPDATE hr.staff SET
      staff_number  = @StaffNumber,
      full_name     = @FullName,
      designation   = @Designation,
      department    = @Department,
      grade         = @Grade,
      position      = @Position,
      place_of_work = @PlaceOfWork,
      email         = @Email,
      phone         = @Phone,
      entity        = @Entity,
      status        = @Status
    WHERE staff_id = @StaffId;
    SELECT @StaffId AS staff_id;
  END
END
GO

-- sp_DeleteStaff
IF OBJECT_ID('hr.sp_DeleteStaff', 'P') IS NOT NULL DROP PROCEDURE hr.sp_DeleteStaff;
GO
CREATE PROCEDURE hr.sp_DeleteStaff
  @StaffId INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM hr.staff WHERE staff_id = @StaffId;
  SELECT @@ROWCOUNT AS rows_affected;
END
GO
