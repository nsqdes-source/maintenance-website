# Batch 5 security start

The first Batch 5 slice makes the current role model explicit without changing historical user roles.

- `customer`: own requests, quote decisions, issued invoices, and eligible warranty claims.
- `technician`: own assignments, visit outcome, parts request, and optional visit media.
- `maintenance_manager`: operational requests, technicians, catalogue, contact, warranty, and dashboard display.
- `admin_manager`: maintenance permissions plus finance and lower-rank user administration.
- `super_admin`: all management features plus the site editor and privileged role administration.

Existing database RLS and protected RPC functions remain authoritative. The new `/admin/roles` page is intentionally read-only and available only to `super_admin`. A later Batch 5 slice should consolidate repeated role checks, audit every RLS policy against this matrix, and implement secure guest tracking by one-time verification rather than a reusable public request number.
