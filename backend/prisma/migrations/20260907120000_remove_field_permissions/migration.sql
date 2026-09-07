-- Remove field-level permission columns from roles and user_access_profiles
ALTER TABLE "roles" DROP COLUMN "fieldPermissions";

ALTER TABLE "user_access_profiles" DROP COLUMN "fieldPermissions";