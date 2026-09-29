-- Canonical schema baseline DRAFT — maintenance-website live structural snapshot.
-- Source: wtmzvznsmitqmjgqwtnu (catalog read only). Target: xpvwkelctzgidpycflzw.
-- Review before application. No production data, users, storage objects, buckets, or secrets.
-- This migration is intended ONLY for the isolated ZATCA test project after explicit review.
begin;
set local search_path = public, extensions, pg_temp;

-- 1. Required schemas
create schema if not exists private;

-- 2. Extensions
-- gen_random_uuid() is available on the managed PostgreSQL installation.
-- Supabase manages plpgsql, pgcrypto, uuid-ossp, pg_stat_statements, and supabase_vault
-- in their platform schemas; verify availability in Test, do not recreate platform extensions here.

-- 3. Enum
create type public.app_role as enum ('customer', 'technician', 'maintenance_manager', 'admin_manager', 'super_admin');

-- 4. Tables
create table public."business_finance_settings" (
  "id" boolean default true not null,
  "legal_name" text default 'مؤسسة أمان للمقاولات'::text not null,
  "address" text default ''::text not null,
  "contact_email" text default ''::text not null,
  "tax_number" text default ''::text not null,
  "vat_registered" boolean,
  "currency" text default 'SAR'::text not null,
  "tax_rate" numeric(5,2) default 0 not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."contact_messages" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "phone" text,
  "email" text,
  "subject" text,
  "message" text not null,
  "status" text default 'new'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);

create table public."dashboard_display_settings" (
  "id" boolean default true not null,
  "customer_cards" jsonb default '[{"id": "new_request", "visible": true}, {"id": "requests", "visible": true}]'::jsonb not null,
  "technician_cards" jsonb default '[{"id": "summary", "visible": true}, {"id": "assignments", "visible": true}]'::jsonb not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."drive_connection" (
  "id" boolean default true not null,
  "refresh_token_ciphertext" text not null,
  "folder_id" text not null,
  "connected_at" timestamp with time zone default now() not null
);

create table public."drive_syncs" (
  "id" uuid default gen_random_uuid() not null,
  "source_type" text not null,
  "source_id" uuid not null,
  "drive_file_id" text not null,
  "synced_at" timestamp with time zone default now() not null
);

create table public."finance_expenses" (
  "id" uuid default gen_random_uuid() not null,
  "category" text not null,
  "description" text not null,
  "amount" numeric(12,2) not null,
  "expense_date" date default CURRENT_DATE not null,
  "payment_method" text default 'bank_transfer'::text not null,
  "vendor_name" text default ''::text not null,
  "reference" text default ''::text not null,
  "notes" text default ''::text not null,
  "service_request_id" uuid,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "voided_at" timestamp with time zone,
  "voided_by" uuid
);

create table public."invoice_line_items" (
  "id" uuid default gen_random_uuid() not null,
  "invoice_id" uuid not null,
  "description" text not null,
  "quantity" numeric(10,2) default 1 not null,
  "unit_price" numeric(12,2) not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "warranty_days" integer default 0 not null,
  "warranty_terms" text default ''::text not null
);

create table public."invoice_payments" (
  "id" uuid default gen_random_uuid() not null,
  "invoice_id" uuid not null,
  "amount" numeric(12,2) not null,
  "method" text not null,
  "note" text default ''::text not null,
  "paid_at" timestamp with time zone default now() not null,
  "recorded_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "voided_at" timestamp with time zone,
  "voided_by" uuid
);

create table public."invoices" (
  "id" uuid default gen_random_uuid() not null,
  "invoice_number" bigint generated always as identity not null,
  "service_request_id" uuid not null,
  "customer_id" uuid,
  "customer_name" text not null,
  "customer_email" text not null,
  "business_name" text not null,
  "business_address" text not null,
  "business_email" text not null,
  "business_tax_number" text not null,
  "vat_registered" boolean not null,
  "description" text not null,
  "subtotal" numeric(12,2) not null,
  "tax_rate" numeric(5,2) not null,
  "tax_amount" numeric(12,2) not null,
  "total" numeric(12,2) not null,
  "currency" text default 'SAR'::text not null,
  "status" text default 'draft'::text not null,
  "issued_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "emailed_at" timestamp with time zone,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "customer_phone" text default ''::text not null,
  "service_type" text default ''::text not null,
  "work_summary" text default ''::text not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."notifications" (
  "id" uuid default gen_random_uuid() not null,
  "recipient_id" uuid not null,
  "service_request_id" uuid not null,
  "event_id" uuid not null,
  "title" text not null,
  "body" text,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table public."profiles" (
  "id" uuid not null,
  "full_name" text,
  "phone" text,
  "role" app_role default 'customer'::app_role not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "avatar_path" text
);

create table public."service_catalog_items" (
  "id" uuid default gen_random_uuid() not null,
  "service_key" text not null,
  "name" text not null,
  "description" text default ''::text not null,
  "price_from" numeric(12,2),
  "pricing_mode" text default 'inspection'::text not null,
  "is_visible" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "parent_id" uuid
);

create table public."service_catalog_parts" (
  "id" uuid default gen_random_uuid() not null,
  "service_catalog_item_id" uuid not null,
  "name" text not null,
  "default_price" numeric(12,2) default 0 not null,
  "is_active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "tax_rate" numeric(5,2) default 0 not null,
  "gross_price" numeric(12,2) generated always as (round((default_price + ((default_price * tax_rate) / (100)::numeric)), 2)) stored
);

create table public."service_catalog_services" (
  "id" uuid default gen_random_uuid() not null,
  "service_catalog_item_id" uuid not null,
  "name" text not null,
  "description" text default ''::text not null,
  "net_price" numeric(12,2) not null,
  "tax_rate" numeric(5,2) default 0 not null,
  "gross_price" numeric(12,2) generated always as (round((net_price + ((net_price * tax_rate) / (100)::numeric)), 2)) stored,
  "is_visit_service" boolean default false not null,
  "is_active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."service_request_assignments" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "technician_id" uuid not null,
  "assigned_by" uuid,
  "status" text default 'pending'::text not null,
  "assigned_at" timestamp with time zone default now() not null,
  "responded_at" timestamp with time zone,
  "notes" text
);

create table public."service_request_attachments" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "storage_path" text not null,
  "content_type" text not null,
  "created_at" timestamp with time zone default now() not null,
  "attachment_stage" text default 'customer'::text not null,
  "uploaded_by" uuid
);

create table public."service_request_change_items" (
  "id" uuid default gen_random_uuid() not null,
  "change_request_id" uuid not null,
  "item_type" text not null,
  "catalog_service_id" uuid,
  "catalog_part_id" uuid,
  "item_name" text not null,
  "quantity" numeric(10,2) default 1 not null,
  "net_unit_price" numeric(12,2) not null,
  "tax_rate" numeric(5,2) not null,
  "gross_unit_price" numeric(12,2) not null,
  "gross_total" numeric(12,2) generated always as (round((gross_unit_price * quantity), 2)) stored,
  "created_at" timestamp with time zone default now() not null
);

create table public."service_request_change_requests" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "technician_id" uuid not null,
  "status" text default 'submitted'::text not null,
  "notes" text,
  "reviewed_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "reviewed_at" timestamp with time zone
);

create table public."service_request_events" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "actor_id" uuid,
  "event_type" text not null,
  "from_stage" text,
  "to_stage" text,
  "details" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."service_request_items" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "catalog_service_id" uuid,
  "service_name" text not null,
  "quantity" numeric(10,2) default 1 not null,
  "net_unit_price" numeric(12,2) not null,
  "tax_rate" numeric(5,2) not null,
  "gross_unit_price" numeric(12,2) not null,
  "gross_total" numeric(12,2) generated always as (round((gross_unit_price * quantity), 2)) stored,
  "item_source" text default 'customer_request'::text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."service_request_payments" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "payment_type" text not null,
  "amount" numeric(12,2) not null,
  "method" text not null,
  "note" text default ''::text not null,
  "paid_at" timestamp with time zone default now() not null,
  "recorded_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "transferred_invoice_payment_id" uuid,
  "transferred_at" timestamp with time zone
);

create table public."service_request_quotes" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "description" text not null,
  "parts_description" text,
  "parts_cost" numeric(12,2) default 0 not null,
  "labor_cost" numeric(12,2) default 0 not null,
  "status" text default 'pending'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "decided_at" timestamp with time zone,
  "customer_notes" text,
  "line_items" jsonb default '[]'::jsonb not null
);

create table public."service_requests" (
  "id" uuid default gen_random_uuid() not null,
  "customer_name" text not null,
  "phone" text not null,
  "service_type" text not null,
  "problem_description" text not null,
  "city" text not null,
  "address" text not null,
  "photo_path" text,
  "status" text default 'new'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "customer_id" uuid,
  "workflow_stage" text default 'awaiting_assignment'::text not null,
  "visit_outcome" text,
  "visit_notes" text,
  "workflow_updated_at" timestamp with time zone default now() not null,
  "customer_email" text,
  "latitude" double precision,
  "longitude" double precision,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "upload_token" uuid default gen_random_uuid() not null,
  "issue_type" text,
  "preferred_date" date,
  "preferred_time_period" text,
  "landing_page" text,
  "referrer" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_content" text,
  "utm_term" text,
  "gclid" text,
  "wbraid" text,
  "gbraid" text,
  "first_touch_at" timestamp with time zone,
  "confirmed_date" date,
  "confirmed_time_period" text,
  "appointment_notes" text,
  "cancellation_reason" text,
  "cancellation_actor_id" uuid,
  "completion_reviewed_at" timestamp with time zone,
  "completion_reviewed_by" uuid,
  "requested_parts" jsonb default '[]'::jsonb not null
);

create table public."site_editor_versions" (
  "id" uuid default gen_random_uuid() not null,
  "status" text not null,
  "snapshot" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "created_by" uuid
);

create table public."site_footer_content" (
  "id" boolean default true not null,
  "company_name" text default 'خدمات الصيانة العامة'::text not null,
  "description" text default 'خدمات صيانة عامة موثوقة وسريعة.'::text not null,
  "phone" text,
  "email" text,
  "address" text,
  "copyright_text" text default '© 2026 جميع الحقوق محفوظة'::text not null,
  "updated_at" timestamp with time zone default now() not null,
  "business_center_label" text default 'مركز الأعمال'::text not null,
  "business_center_url" text default '/admin/login'::text not null,
  "business_center_logo_url" text default ''::text not null,
  "payment_methods" jsonb default '["mada", "visa", "mastercard", "apple_pay", "bank_transfer"]'::jsonb not null,
  "payment_logo_urls" jsonb default '{}'::jsonb not null,
  "social_links" jsonb default '[]'::jsonb not null
);

create table public."site_section_items" (
  "id" uuid default gen_random_uuid() not null,
  "section_id" uuid not null,
  "title" text not null,
  "description" text,
  "image_url" text,
  "sort_order" integer default 0 not null,
  "is_visible" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null,
  "title_en" text,
  "description_en" text
);

create table public."site_sections" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "eyebrow" text,
  "title" text not null,
  "description" text,
  "image_url" text,
  "sort_order" integer default 0 not null,
  "is_visible" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null,
  "eyebrow_en" text,
  "title_en" text,
  "description_en" text,
  "style_config" jsonb default '{}'::jsonb not null
);

create table public."site_settings" (
  "key" text not null,
  "value" text not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."technicians" (
  "id" uuid default gen_random_uuid() not null,
  "profile_id" uuid not null,
  "service_types" text[] default '{}'::text[] not null,
  "is_active" boolean default true not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."warranty_claims" (
  "id" uuid default gen_random_uuid() not null,
  "service_request_id" uuid not null,
  "customer_id" uuid not null,
  "description" text not null,
  "status" text default 'new'::text not null,
  "admin_notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "invoice_id" uuid,
  "invoice_line_item_id" uuid
);

-- 5. Identity / defaults / generated columns
-- Defined inline above to retain source column order. Identity backing sequence:
-- public.invoices_invoice_number_seq, START 1 INCREMENT 1 MINVALUE 1 CACHE 1 NO CYCLE.
-- Generated stored columns: service_catalog_parts.gross_price,
-- service_catalog_services.gross_price, service_request_change_items.gross_total,
-- service_request_items.gross_total. Verify sequence ownership after application.

-- 6. Primary keys
alter table business_finance_settings add constraint "business_finance_settings_pkey" PRIMARY KEY (id);
alter table contact_messages add constraint "contact_messages_pkey" PRIMARY KEY (id);
alter table dashboard_display_settings add constraint "dashboard_display_settings_pkey" PRIMARY KEY (id);
alter table drive_connection add constraint "drive_connection_pkey" PRIMARY KEY (id);
alter table drive_syncs add constraint "drive_syncs_pkey" PRIMARY KEY (id);
alter table finance_expenses add constraint "finance_expenses_pkey" PRIMARY KEY (id);
alter table invoice_line_items add constraint "invoice_line_items_pkey" PRIMARY KEY (id);
alter table invoice_payments add constraint "invoice_payments_pkey" PRIMARY KEY (id);
alter table invoices add constraint "invoices_pkey" PRIMARY KEY (id);
alter table notifications add constraint "notifications_pkey" PRIMARY KEY (id);
alter table profiles add constraint "profiles_pkey" PRIMARY KEY (id);
alter table service_catalog_items add constraint "service_catalog_items_pkey" PRIMARY KEY (id);
alter table service_catalog_parts add constraint "service_catalog_parts_pkey" PRIMARY KEY (id);
alter table service_catalog_services add constraint "service_catalog_services_pkey" PRIMARY KEY (id);
alter table service_request_assignments add constraint "service_request_assignments_pkey" PRIMARY KEY (id);
alter table service_request_attachments add constraint "service_request_attachments_pkey" PRIMARY KEY (id);
alter table service_request_change_items add constraint "service_request_change_items_pkey" PRIMARY KEY (id);
alter table service_request_change_requests add constraint "service_request_change_requests_pkey" PRIMARY KEY (id);
alter table service_request_events add constraint "service_request_events_pkey" PRIMARY KEY (id);
alter table service_request_items add constraint "service_request_items_pkey" PRIMARY KEY (id);
alter table service_request_payments add constraint "service_request_payments_pkey" PRIMARY KEY (id);
alter table service_request_quotes add constraint "service_request_quotes_pkey" PRIMARY KEY (id);
alter table service_requests add constraint "service_requests_pkey" PRIMARY KEY (id);
alter table site_editor_versions add constraint "site_editor_versions_pkey" PRIMARY KEY (id);
alter table site_footer_content add constraint "site_footer_content_pkey" PRIMARY KEY (id);
alter table site_section_items add constraint "site_section_items_pkey" PRIMARY KEY (id);
alter table site_sections add constraint "site_sections_pkey" PRIMARY KEY (id);
alter table site_settings add constraint "site_settings_pkey" PRIMARY KEY (key);
alter table technicians add constraint "technicians_pkey" PRIMARY KEY (id);
alter table warranty_claims add constraint "warranty_claims_pkey" PRIMARY KEY (id);

-- 7. Unique and check constraints
alter table drive_syncs add constraint "drive_syncs_source_type_source_id_key" UNIQUE (source_type, source_id);
alter table invoices add constraint "invoices_invoice_number_key" UNIQUE (invoice_number);
alter table notifications add constraint "notifications_event_id_recipient_id_key" UNIQUE (event_id, recipient_id);
alter table service_catalog_items add constraint "service_catalog_items_service_key_key" UNIQUE (service_key);
alter table service_request_attachments add constraint "service_request_attachments_storage_path_key" UNIQUE (storage_path);
alter table site_sections add constraint "site_sections_slug_key" UNIQUE (slug);
alter table technicians add constraint "technicians_profile_id_key" UNIQUE (profile_id);

alter table business_finance_settings add constraint "business_finance_settings_currency_check" CHECK (currency = 'SAR'::text);
alter table business_finance_settings add constraint "business_finance_settings_id_check" CHECK (id);
alter table business_finance_settings add constraint "business_finance_settings_tax_rate_check" CHECK (tax_rate >= 0::numeric AND tax_rate <= 100::numeric);
alter table contact_messages add constraint "contact_messages_status_check" CHECK (status = ANY (ARRAY['new'::text, 'read'::text, 'resolved'::text]));
alter table dashboard_display_settings add constraint "dashboard_display_customer_cards_array" CHECK (jsonb_typeof(customer_cards) = 'array'::text);
alter table dashboard_display_settings add constraint "dashboard_display_settings_id_check" CHECK (id);
alter table dashboard_display_settings add constraint "dashboard_display_technician_cards_array" CHECK (jsonb_typeof(technician_cards) = 'array'::text);
alter table drive_connection add constraint "drive_connection_id_check" CHECK (id);
alter table drive_syncs add constraint "drive_syncs_source_type_check" CHECK (source_type = ANY (ARRAY['invoice'::text, 'request_image'::text]));
alter table finance_expenses add constraint "finance_expenses_amount_check" CHECK (amount > 0::numeric);
alter table finance_expenses add constraint "finance_expenses_category_check" CHECK (category = ANY (ARRAY['parts'::text, 'technician'::text, 'transport'::text, 'operations'::text, 'tools'::text, 'marketing'::text, 'other'::text]));
alter table finance_expenses add constraint "finance_expenses_description_check" CHECK (char_length(TRIM(BOTH FROM description)) >= 1 AND char_length(TRIM(BOTH FROM description)) <= 500);
alter table finance_expenses add constraint "finance_expenses_payment_method_check" CHECK (payment_method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'card'::text, 'other'::text]));
alter table invoice_line_items add constraint "invoice_line_items_description_check" CHECK (char_length(TRIM(BOTH FROM description)) >= 1 AND char_length(TRIM(BOTH FROM description)) <= 300);
alter table invoice_line_items add constraint "invoice_line_items_quantity_check" CHECK (quantity > 0::numeric AND quantity <= 100000::numeric);
alter table invoice_line_items add constraint "invoice_line_items_sort_order_check" CHECK (sort_order >= 0);
alter table invoice_line_items add constraint "invoice_line_items_unit_price_check" CHECK (unit_price >= 0::numeric);
alter table invoice_line_items add constraint "invoice_line_items_warranty_days_check" CHECK (warranty_days >= 0 AND warranty_days <= 3650);
alter table invoice_payments add constraint "invoice_payments_amount_check" CHECK (amount > 0::numeric);
alter table invoice_payments add constraint "invoice_payments_method_check" CHECK (method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'card'::text, 'other'::text]));
alter table invoices add constraint "invoices_check" CHECK (status = 'draft'::text AND issued_at IS NULL OR status <> 'draft'::text AND issued_at IS NOT NULL);
alter table invoices add constraint "invoices_currency_check" CHECK (currency = 'SAR'::text);
alter table invoices add constraint "invoices_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'void'::text]));
alter table invoices add constraint "invoices_subtotal_check" CHECK (subtotal >= 0::numeric);
alter table invoices add constraint "invoices_tax_amount_check" CHECK (tax_amount >= 0::numeric);
alter table invoices add constraint "invoices_tax_rate_check" CHECK (tax_rate >= 0::numeric AND tax_rate <= 100::numeric);
alter table invoices add constraint "invoices_total_check" CHECK (total >= 0::numeric);
alter table service_catalog_items add constraint "service_catalog_items_pricing_mode_check" CHECK (pricing_mode = ANY (ARRAY['fixed'::text, 'from'::text, 'inspection'::text]));
alter table service_catalog_parts add constraint "service_catalog_parts_default_price_check" CHECK (default_price >= 0::numeric);
alter table service_catalog_parts add constraint "service_catalog_parts_name_check" CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 120);
alter table service_catalog_parts add constraint "service_catalog_parts_tax_rate_check" CHECK (tax_rate >= 0::numeric AND tax_rate <= 100::numeric);
alter table service_catalog_services add constraint "service_catalog_services_name_check" CHECK (char_length(TRIM(BOTH FROM name)) >= 1 AND char_length(TRIM(BOTH FROM name)) <= 120);
alter table service_catalog_services add constraint "service_catalog_services_net_price_check" CHECK (net_price >= 0::numeric);
alter table service_catalog_services add constraint "service_catalog_services_tax_rate_check" CHECK (tax_rate >= 0::numeric AND tax_rate <= 100::numeric);
alter table service_request_assignments add constraint "assignment_response_consistency_chk" CHECK (status = 'pending'::text AND responded_at IS NULL OR status <> 'pending'::text AND responded_at IS NOT NULL);
alter table service_request_assignments add constraint "assignment_status_chk" CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text, 'completed'::text]));
alter table service_request_attachments add constraint "service_request_attachments_attachment_stage_check" CHECK (attachment_stage = ANY (ARRAY['customer'::text, 'technician_arrival'::text, 'technician_completion'::text]));
alter table service_request_attachments add constraint "service_request_attachments_content_type_check" CHECK (content_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]));
alter table service_request_change_items add constraint "service_request_change_items_check" CHECK (item_type = 'service'::text AND catalog_service_id IS NOT NULL AND catalog_part_id IS NULL OR item_type = 'part'::text AND catalog_part_id IS NOT NULL AND catalog_service_id IS NULL OR item_type = 'other'::text AND catalog_service_id IS NULL AND catalog_part_id IS NULL);
alter table service_request_change_items add constraint "service_request_change_items_gross_unit_price_check" CHECK (gross_unit_price >= 0::numeric);
alter table service_request_change_items add constraint "service_request_change_items_item_name_check" CHECK (char_length(TRIM(BOTH FROM item_name)) >= 1 AND char_length(TRIM(BOTH FROM item_name)) <= 160);
alter table service_request_change_items add constraint "service_request_change_items_item_type_check" CHECK (item_type = ANY (ARRAY['service'::text, 'part'::text, 'other'::text]));
alter table service_request_change_items add constraint "service_request_change_items_net_unit_price_check" CHECK (net_unit_price >= 0::numeric);
alter table service_request_change_items add constraint "service_request_change_items_quantity_check" CHECK (quantity > 0::numeric AND quantity <= 100::numeric);
alter table service_request_change_items add constraint "service_request_change_items_tax_rate_check" CHECK (tax_rate >= 0::numeric AND tax_rate <= 100::numeric);
alter table service_request_change_requests add constraint "service_request_change_requests_status_check" CHECK (status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'superseded'::text]));
alter table service_request_items add constraint "service_request_items_gross_unit_price_check" CHECK (gross_unit_price >= 0::numeric);
alter table service_request_items add constraint "service_request_items_item_source_check" CHECK (item_source = ANY (ARRAY['customer_request'::text, 'technician_change'::text, 'admin_change'::text]));
alter table service_request_items add constraint "service_request_items_net_unit_price_check" CHECK (net_unit_price >= 0::numeric);
alter table service_request_items add constraint "service_request_items_quantity_check" CHECK (quantity > 0::numeric);
alter table service_request_items add constraint "service_request_items_service_name_check" CHECK (char_length(TRIM(BOTH FROM service_name)) >= 1 AND char_length(TRIM(BOTH FROM service_name)) <= 120);
alter table service_request_items add constraint "service_request_items_tax_rate_check" CHECK (tax_rate >= 0::numeric AND tax_rate <= 100::numeric);
alter table service_request_payments add constraint "service_request_payments_amount_check" CHECK (amount > 0::numeric);
alter table service_request_payments add constraint "service_request_payments_check" CHECK (transferred_invoice_payment_id IS NULL AND transferred_at IS NULL OR transferred_invoice_payment_id IS NOT NULL AND transferred_at IS NOT NULL);
alter table service_request_payments add constraint "service_request_payments_method_check" CHECK (method = ANY (ARRAY['cash'::text, 'bank_transfer'::text, 'card'::text, 'other'::text]));
alter table service_request_payments add constraint "service_request_payments_payment_type_check" CHECK (payment_type = ANY (ARRAY['visit_fee'::text, 'deposit'::text, 'advance'::text, 'other'::text]));
alter table service_request_quotes add constraint "service_request_quotes_labor_cost_check" CHECK (labor_cost >= 0::numeric);
alter table service_request_quotes add constraint "service_request_quotes_line_items_array" CHECK (jsonb_typeof(line_items) = 'array'::text);
alter table service_request_quotes add constraint "service_request_quotes_parts_cost_check" CHECK (parts_cost >= 0::numeric);
alter table service_request_quotes add constraint "service_request_quotes_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'superseded'::text]));
alter table service_requests add constraint "service_requests_preferred_time_period_check" CHECK (preferred_time_period IS NULL OR (preferred_time_period = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text])));
alter table service_requests add constraint "service_requests_status_check" CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]));
alter table service_requests add constraint "service_requests_visit_outcome_check" CHECK (visit_outcome IS NULL OR (visit_outcome = ANY (ARRAY['completed'::text, 'needs_followup'::text, 'reschedule_requested'::text, 'unable_to_complete'::text, 'customer_rejected'::text])));
alter table service_requests add constraint "service_requests_workflow_stage_check" CHECK (workflow_stage = ANY (ARRAY['awaiting_assignment'::text, 'assigned'::text, 'technician_accepted'::text, 'in_progress'::text, 'awaiting_completion_review'::text, 'needs_followup'::text, 'reschedule_requested'::text, 'unable_to_complete'::text, 'awaiting_admin_quote'::text, 'awaiting_customer_approval'::text, 'quote_approved'::text, 'completed'::text, 'customer_rejected'::text, 'customer_cancelled'::text, 'cancelled'::text]));
alter table site_editor_versions add constraint "site_editor_versions_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]));
alter table site_footer_content add constraint "site_footer_content_id_check" CHECK (id = true);
alter table site_footer_content add constraint "site_footer_content_payment_logo_urls_object" CHECK (jsonb_typeof(payment_logo_urls) = 'object'::text);
alter table site_footer_content add constraint "site_footer_content_payment_methods_array" CHECK (jsonb_typeof(payment_methods) = 'array'::text);
alter table site_sections add constraint "site_sections_slug_check" CHECK (slug = ANY (ARRAY['hero'::text, 'services'::text, 'why-us'::text, 'works'::text, 'contact'::text]));
alter table site_sections add constraint "site_sections_style_config_object" CHECK (jsonb_typeof(style_config) = 'object'::text);
alter table site_settings add constraint "site_settings_color_check" CHECK ((key <> ALL (ARRAY['primary_color'::text, 'accent_color'::text, 'background_color'::text])) OR value ~ '^#[0-9A-Fa-f]{6}$'::text);
alter table site_settings add constraint "site_settings_key_check" CHECK (key = ANY (ARRAY['logo_text'::text, 'logo_text_en'::text, 'logo_image_url'::text, 'primary_color'::text, 'accent_color'::text, 'background_color'::text, 'header_cta_text'::text, 'header_cta_text_en'::text, 'request_cta_text'::text, 'request_cta_text_en'::text, 'header_request_cta_visible'::text, 'footer_request_cta_visible'::text, 'mobile_request_cta_visible'::text]));
alter table warranty_claims add constraint "warranty_claims_status_check" CHECK (status = ANY (ARRAY['new'::text, 'under_review'::text, 'approved'::text, 'rejected'::text, 'resolved'::text]));

-- 8. Foreign keys
alter table finance_expenses add constraint "finance_expenses_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table finance_expenses add constraint "finance_expenses_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id);
alter table finance_expenses add constraint "finance_expenses_voided_by_fkey" FOREIGN KEY (voided_by) REFERENCES profiles(id);
alter table invoice_line_items add constraint "invoice_line_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
alter table invoice_payments add constraint "invoice_payments_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id);
alter table invoice_payments add constraint "invoice_payments_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES profiles(id);
alter table invoice_payments add constraint "invoice_payments_voided_by_fkey" FOREIGN KEY (voided_by) REFERENCES profiles(id);
alter table invoices add constraint "invoices_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table invoices add constraint "invoices_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES profiles(id);
alter table invoices add constraint "invoices_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id);
alter table notifications add constraint "notifications_event_id_fkey" FOREIGN KEY (event_id) REFERENCES service_request_events(id) ON DELETE CASCADE;
alter table notifications add constraint "notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table notifications add constraint "notifications_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table profiles add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table service_catalog_items add constraint "service_catalog_items_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES service_catalog_items(id) ON DELETE RESTRICT;
alter table service_catalog_parts add constraint "service_catalog_parts_service_catalog_item_id_fkey" FOREIGN KEY (service_catalog_item_id) REFERENCES service_catalog_items(id) ON DELETE RESTRICT;
alter table service_catalog_services add constraint "service_catalog_services_service_catalog_item_id_fkey" FOREIGN KEY (service_catalog_item_id) REFERENCES service_catalog_items(id) ON DELETE RESTRICT;
alter table service_request_assignments add constraint "service_request_assignments_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table service_request_assignments add constraint "service_request_assignments_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table service_request_assignments add constraint "service_request_assignments_technician_id_fkey" FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE RESTRICT;
alter table service_request_attachments add constraint "service_request_attachments_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table service_request_attachments add constraint "service_request_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table service_request_change_items add constraint "service_request_change_items_catalog_part_id_fkey" FOREIGN KEY (catalog_part_id) REFERENCES service_catalog_parts(id) ON DELETE RESTRICT;
alter table service_request_change_items add constraint "service_request_change_items_catalog_service_id_fkey" FOREIGN KEY (catalog_service_id) REFERENCES service_catalog_services(id) ON DELETE RESTRICT;
alter table service_request_change_items add constraint "service_request_change_items_change_request_id_fkey" FOREIGN KEY (change_request_id) REFERENCES service_request_change_requests(id) ON DELETE CASCADE;
alter table service_request_change_requests add constraint "service_request_change_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table service_request_change_requests add constraint "service_request_change_requests_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table service_request_change_requests add constraint "service_request_change_requests_technician_id_fkey" FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE RESTRICT;
alter table service_request_events add constraint "service_request_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table service_request_events add constraint "service_request_events_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table service_request_items add constraint "service_request_items_catalog_service_id_fkey" FOREIGN KEY (catalog_service_id) REFERENCES service_catalog_services(id) ON DELETE RESTRICT;
alter table service_request_items add constraint "service_request_items_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table service_request_payments add constraint "service_request_payments_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES profiles(id);
alter table service_request_payments add constraint "service_request_payments_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE RESTRICT;
alter table service_request_payments add constraint "service_request_payments_transferred_invoice_payment_id_fkey" FOREIGN KEY (transferred_invoice_payment_id) REFERENCES invoice_payments(id) ON DELETE RESTRICT;
alter table service_request_payments add constraint "service_request_payments_voided_by_fkey" FOREIGN KEY (voided_by) REFERENCES profiles(id);
alter table service_request_quotes add constraint "service_request_quotes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table service_request_quotes add constraint "service_request_quotes_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;
alter table service_requests add constraint "service_requests_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table service_requests add constraint "service_requests_cancellation_actor_id_fkey" FOREIGN KEY (cancellation_actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table service_requests add constraint "service_requests_completion_reviewed_by_fkey" FOREIGN KEY (completion_reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table service_requests add constraint "service_requests_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table site_editor_versions add constraint "site_editor_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table site_section_items add constraint "site_section_items_section_id_fkey" FOREIGN KEY (section_id) REFERENCES site_sections(id) ON DELETE CASCADE;
alter table technicians add constraint "technicians_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table warranty_claims add constraint "warranty_claims_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES profiles(id) ON DELETE RESTRICT;
alter table warranty_claims add constraint "warranty_claims_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;
alter table warranty_claims add constraint "warranty_claims_invoice_line_item_id_fkey" FOREIGN KEY (invoice_line_item_id) REFERENCES invoice_line_items(id) ON DELETE RESTRICT;
alter table warranty_claims add constraint "warranty_claims_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE CASCADE;

-- Index expression dependency: define the immutable phone normalizer before indexes.
CREATE OR REPLACE FUNCTION public.normalized_sa_mobile(raw_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
 select case
  when regexp_replace(coalesce(raw_phone,''),'[^0-9]','','g') ~ '^05[0-9]{8}$'
   then '966' || substr(regexp_replace(raw_phone,'[^0-9]','','g'),2)
  when regexp_replace(coalesce(raw_phone,''),'[^0-9]','','g') ~ '^9665[0-9]{8}$'
   then regexp_replace(raw_phone,'[^0-9]','','g')
  when regexp_replace(coalesce(raw_phone,''),'[^0-9]','','g') ~ '^5[0-9]{8}$'
   then '966' || regexp_replace(raw_phone,'[^0-9]','','g')
  else null end
$function$;

-- 9. Non-constraint indexes
CREATE INDEX finance_expenses_category_idx ON public.finance_expenses USING btree (category, expense_date DESC);
CREATE INDEX finance_expenses_date_idx ON public.finance_expenses USING btree (expense_date DESC);
CREATE INDEX finance_expenses_request_idx ON public.finance_expenses USING btree (service_request_id) WHERE (service_request_id IS NOT NULL);
CREATE INDEX invoice_line_items_invoice_idx ON public.invoice_line_items USING btree (invoice_id, sort_order);
CREATE INDEX invoice_payments_invoice_idx ON public.invoice_payments USING btree (invoice_id, paid_at DESC);
CREATE UNIQUE INDEX invoices_one_active_per_request ON public.invoices USING btree (service_request_id) WHERE (status = ANY (ARRAY['draft'::text, 'issued'::text]));
CREATE INDEX invoices_request_idx ON public.invoices USING btree (service_request_id, created_at DESC);
CREATE INDEX invoices_status_idx ON public.invoices USING btree (status, issued_at DESC);
CREATE INDEX notifications_recipient_idx ON public.notifications USING btree (recipient_id, read_at, created_at DESC);
CREATE UNIQUE INDEX notifications_unique_request_stage_idx ON public.notifications USING btree (recipient_id, service_request_id, body) WHERE (body IS NOT NULL);
CREATE UNIQUE INDEX profiles_unique_normalized_mobile_idx ON public.profiles USING btree (normalized_sa_mobile(phone)) WHERE (normalized_sa_mobile(phone) IS NOT NULL);
CREATE INDEX service_catalog_items_parent_idx ON public.service_catalog_items USING btree (parent_id, sort_order);
CREATE INDEX service_catalog_items_visible_order_idx ON public.service_catalog_items USING btree (is_visible, sort_order);
CREATE UNIQUE INDEX service_catalog_parts_name_per_service_idx ON public.service_catalog_parts USING btree (service_catalog_item_id, lower(name));
CREATE INDEX service_catalog_parts_service_active_idx ON public.service_catalog_parts USING btree (service_catalog_item_id, is_active, sort_order);
CREATE INDEX service_catalog_services_active_idx ON public.service_catalog_services USING btree (service_catalog_item_id, is_active, sort_order);
CREATE UNIQUE INDEX service_catalog_services_name_per_category_idx ON public.service_catalog_services USING btree (service_catalog_item_id, lower(name));
CREATE INDEX assignments_request_idx ON public.service_request_assignments USING btree (service_request_id, assigned_at DESC);
CREATE INDEX assignments_technician_idx ON public.service_request_assignments USING btree (technician_id, status, assigned_at DESC);
CREATE UNIQUE INDEX service_request_one_active_assignment_idx ON public.service_request_assignments USING btree (service_request_id) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text]));
CREATE INDEX service_request_attachments_request_idx ON public.service_request_attachments USING btree (service_request_id);
CREATE INDEX service_request_attachments_stage_idx ON public.service_request_attachments USING btree (service_request_id, attachment_stage, created_at);
CREATE INDEX service_request_change_items_change_idx ON public.service_request_change_items USING btree (change_request_id);
CREATE INDEX service_request_change_items_part_idx ON public.service_request_change_items USING btree (catalog_part_id);
CREATE INDEX service_request_change_items_service_idx ON public.service_request_change_items USING btree (catalog_service_id);
CREATE INDEX service_request_change_requests_request_idx ON public.service_request_change_requests USING btree (service_request_id);
CREATE INDEX service_request_change_requests_status_idx ON public.service_request_change_requests USING btree (status);
CREATE INDEX service_request_change_requests_technician_idx ON public.service_request_change_requests USING btree (technician_id);
CREATE INDEX service_request_events_request_idx ON public.service_request_events USING btree (service_request_id, created_at DESC);
CREATE INDEX service_request_items_catalog_service_idx ON public.service_request_items USING btree (catalog_service_id);
CREATE INDEX service_request_items_request_idx ON public.service_request_items USING btree (service_request_id);
CREATE INDEX service_request_payments_active_idx ON public.service_request_payments USING btree (service_request_id, payment_type, paid_at DESC) WHERE (voided_at IS NULL);
CREATE UNIQUE INDEX service_request_payments_invoice_payment_uidx ON public.service_request_payments USING btree (transferred_invoice_payment_id) WHERE (transferred_invoice_payment_id IS NOT NULL);
CREATE INDEX service_request_payments_request_idx ON public.service_request_payments USING btree (service_request_id, paid_at DESC);
CREATE UNIQUE INDEX service_request_one_pending_quote_idx ON public.service_request_quotes USING btree (service_request_id) WHERE (status = 'pending'::text);
CREATE INDEX service_request_quotes_request_idx ON public.service_request_quotes USING btree (service_request_id, created_at DESC);
CREATE INDEX service_requests_created_at_idx ON public.service_requests USING btree (created_at DESC);
CREATE INDEX service_requests_customer_id_idx ON public.service_requests USING btree (customer_id);
CREATE INDEX service_requests_status_created_at_idx ON public.service_requests USING btree (status, created_at DESC);
CREATE INDEX service_requests_status_idx ON public.service_requests USING btree (status);
CREATE INDEX site_section_items_order_idx ON public.site_section_items USING btree (section_id, sort_order);
CREATE INDEX site_sections_order_idx ON public.site_sections USING btree (sort_order);
CREATE INDEX technicians_active_idx ON public.technicians USING btree (is_active);
CREATE INDEX technicians_service_types_gin_idx ON public.technicians USING gin (service_types);
CREATE INDEX warranty_claims_invoice_line_idx ON public.warranty_claims USING btree (invoice_line_item_id, created_at DESC);
CREATE UNIQUE INDEX warranty_claims_one_open_per_line_idx ON public.warranty_claims USING btree (customer_id, invoice_line_item_id) WHERE ((invoice_line_item_id IS NOT NULL) AND (status = ANY (ARRAY['new'::text, 'under_review'::text, 'approved'::text])));
CREATE INDEX warranty_claims_request_idx ON public.warranty_claims USING btree (service_request_id, created_at DESC);

-- 10. Functions
-- Historical overloads retained pending verified call/dependency review.
-- All SECURITY DEFINER definitions and function-level SET search_path are sourced from live catalog.
CREATE OR REPLACE FUNCTION private.can_upload_request_image(object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select exists(
  select 1 from public.service_requests r
  where r.id::text = split_part(object_name,'/',1)
   and r.upload_token::text = split_part(object_name,'/',2)
   and r.created_at > now() - interval '1 hour'
   and ((r.customer_id is null and auth.uid() is null) or r.customer_id = auth.uid())
 )
$function$;

CREATE OR REPLACE FUNCTION private.can_upload_technician_request_image(object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select exists(
   select 1
   from public.service_requests r
   join public.service_request_assignments a on a.service_request_id = r.id and a.status = 'accepted'
   join public.technicians t on t.id = a.technician_id and t.profile_id = auth.uid() and t.is_active
   where r.id::text = split_part(object_name,'/',1)
     and t.id::text = split_part(object_name,'/',2)
     and split_part(object_name,'/',3) in ('technician_arrival','technician_completion')
     and r.workflow_stage = 'in_progress'
 );
$function$;

CREATE OR REPLACE FUNCTION private.finance_seed_invoice_from_approved_quote(p_invoice_id uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  quote_record public.service_request_quotes%rowtype;
  invoice_record public.invoices%rowtype;
  gross_total numeric(12,2);
  net_total numeric(12,2);
  vat_amount numeric(12,2);
  effective_tax_rate numeric(5,2);
begin
  select *
  into invoice_record
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  -- Seed lines only when the draft has no lines yet.
  if not exists (
    select 1
    from public.invoice_line_items
    where invoice_id = p_invoice_id
  ) then

    select *
    into quote_record
    from public.service_request_quotes
    where service_request_id = p_request_id
      and status = 'approved'
    order by decided_at desc nulls last, created_at desc
    limit 1;

    ----------------------------------------------------------------
    -- Path A: approved quote exists.
    ----------------------------------------------------------------
    if quote_record.id is not null then

      if jsonb_array_length(
        coalesce(quote_record.line_items, '[]'::jsonb)
      ) > 0 then

        insert into public.invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        select
          p_invoice_id,
          trim(value->>'description'),
          (value->>'quantity')::numeric,
          (value->>'unit_price')::numeric,
          ordinality - 1
        from jsonb_array_elements(quote_record.line_items)
        with ordinality
        where not exists (
          select 1
          from public.service_catalog_services catalog_service
          where catalog_service.id::text = value->>'catalog_service_id'
            and catalog_service.is_visit_service = true
        );

      else

        insert into public.invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        select
          p_invoice_id,
          description,
          1,
          amount,
          sort_order
        from (
          values
            (
              coalesce(
                nullif(quote_record.parts_description, ''),
                'قطع وتعديلات'
              ),
              quote_record.parts_cost,
              0
            ),
            (
              'أجرة العمل',
              quote_record.labor_cost,
              1
            )
        ) as legacy_lines(
          description,
          amount,
          sort_order
        )
        where amount > 0;

      end if;

      -- Preserve old quote behavior if the approved quote has
      -- no priced lines.
      if not exists (
        select 1
        from public.invoice_line_items
        where invoice_id = p_invoice_id
      ) then
        insert into public.invoice_line_items (
          invoice_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        values (
          p_invoice_id,
          quote_record.description,
          1,
          0,
          0
        );
      end if;

      update public.invoices
      set
        work_summary = quote_record.description,
        description = quote_record.description
      where id = p_invoice_id
        and status = 'draft';

    ----------------------------------------------------------------
    -- Path B: no approved quote.
    -- Invoice from the customer's original selected services.
    ----------------------------------------------------------------
    else

      insert into public.invoice_line_items (
        invoice_id,
        description,
        quantity,
        unit_price,
        sort_order
      )
      select
        p_invoice_id,
        sri.service_name,
        sri.quantity,
        sri.gross_unit_price,
        row_number() over (
          order by sri.created_at, sri.id
        ) - 1
      from public.service_request_items sri
      where sri.service_request_id = p_request_id
        and sri.item_source = 'customer_request'
      order by sri.created_at, sri.id;

      if not exists (
        select 1
        from public.invoice_line_items
        where invoice_id = p_invoice_id
      ) then
        raise exception 'invoice_source_items_required';
      end if;

    end if;
  end if;

  ----------------------------------------------------------------
  -- Calculate invoice totals from VAT-inclusive line prices.
  ----------------------------------------------------------------
  select round(
    coalesce(sum(quantity * unit_price), 0),
    2
  )
  into gross_total
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  effective_tax_rate := invoice_record.tax_rate;

  -- Legacy drafts may have tax_rate = 0.
  if invoice_record.vat_registered
     and coalesce(effective_tax_rate, 0) <= 0 then

    select tax_rate
    into effective_tax_rate
    from public.business_finance_settings
    where id = true;

  end if;

  effective_tax_rate :=
    coalesce(effective_tax_rate, 0);

  if invoice_record.vat_registered
     and effective_tax_rate > 0 then

    net_total := round(
      gross_total / (1 + effective_tax_rate / 100),
      2
    );

    vat_amount := round(
      gross_total - net_total,
      2
    );

  else

    effective_tax_rate := 0;
    net_total := gross_total;
    vat_amount := 0;

  end if;

  update public.invoices
  set
    subtotal = net_total,
    tax_rate = effective_tax_rate,
    tax_amount = vat_amount,
    total = gross_total,
    updated_at = now()
  where id = p_invoice_id
    and status = 'draft';

end;
$function$;

CREATE OR REPLACE FUNCTION private.finance_transfer_request_payments_to_invoice(p_invoice_id uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  request_payment public.service_request_payments%rowtype;
  new_invoice_payment_id uuid;
  current_received numeric(12,2);
  invoice_total numeric(12,2);
begin
  select total
  into invoice_total
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  select coalesce(sum(amount), 0)
  into current_received
  from public.invoice_payments
  where invoice_id = p_invoice_id
    and voided_at is null;

  for request_payment in
    select *
    from public.service_request_payments
    where service_request_id = p_request_id
      and voided_at is null
      and transferred_invoice_payment_id is null
    order by paid_at, created_at, id
    for update
  loop
    if current_received + request_payment.amount > invoice_total then
      raise exception 'preinvoice_payments_exceed_invoice_total';
    end if;

    insert into public.invoice_payments (
      invoice_id,
      amount,
      method,
      note,
      paid_at,
      recorded_by
    )
    values (
      p_invoice_id,
      request_payment.amount,
      request_payment.method,
      left(
        trim(
          concat(
            case request_payment.payment_type
              when 'visit_fee' then 'رسوم زيارة'
              when 'deposit' then 'عربون'
              when 'advance' then 'دفعة مقدمة'
              else 'دفعة قبل الفاتورة'
            end,
            case
              when nullif(trim(request_payment.note), '') is not null
                then ' - ' || trim(request_payment.note)
              else ''
            end
          )
        ),
        500
      ),
      request_payment.paid_at,
      request_payment.recorded_by
    )
    returning id into new_invoice_payment_id;

    update public.service_request_payments
    set
      transferred_invoice_payment_id = new_invoice_payment_id,
      transferred_at = now()
    where id = request_payment.id;

    current_received :=
      current_received + request_payment.amount;
  end loop;

  if current_received = invoice_total then
    update public.invoices
    set
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
    where id = p_invoice_id;
  else
    update public.invoices
    set
      paid_at = null,
      updated_at = now()
    where id = p_invoice_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_technician(target_profile_id uuid, target_service_types text[], target_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
  target_role public.app_role;
BEGIN
  SELECT role
    INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role IS NULL OR actor_role NOT IN (
    'maintenance_manager'::public.app_role,
    'admin_manager'::public.app_role,
    'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF target_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_add_self_as_technician';
  END IF;

  IF coalesce(array_length(target_service_types, 1), 0) = 0 THEN
    RAISE EXCEPTION 'service_types_required';
  END IF;

  SELECT role
    INTO target_role
  FROM public.profiles
  WHERE id = target_profile_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF target_role IN (
    'maintenance_manager'::public.app_role,
    'admin_manager'::public.app_role,
    'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'privileged_user_cannot_be_technician';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.technicians
    WHERE profile_id = target_profile_id
  ) THEN
    RAISE EXCEPTION 'technician_already_exists';
  END IF;

  UPDATE public.profiles
  SET role = 'technician'::public.app_role,
      updated_at = now()
  WHERE id = target_profile_id;

  INSERT INTO public.technicians (profile_id, service_types, is_active, notes)
  VALUES (target_profile_id, target_service_types, true, nullif(trim(target_notes), ''));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_advance_service_request(target_service_request_id uuid, new_stage text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare current_stage text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if not ((current_stage = 'technician_accepted' and new_stage = 'in_progress') or
    (current_stage = 'needs_followup' and new_stage = 'awaiting_admin_quote') or
    (current_stage = 'quote_approved' and new_stage = 'in_progress') or
    (current_stage = 'awaiting_completion_review' and new_stage = 'completed') or
    (current_stage in ('reschedule_requested','unable_to_complete') and new_stage = 'in_progress')) then raise exception 'invalid_workflow_transition'; end if;
  update public.service_requests set workflow_stage = new_stage, workflow_updated_at = now(),
    completion_reviewed_at = case when new_stage = 'completed' then now() else completion_reviewed_at end,
    completion_reviewed_by = case when new_stage = 'completed' then auth.uid() else completion_reviewed_by end
  where id = target_service_request_id;
  if new_stage = 'completed' then
    perform public.finance_ensure_invoice_draft(target_service_request_id);
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_assign_service_request(target_service_request_id uuid, target_technician_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stage text;
  last_status text;
  last_technician_id uuid;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_service_request_id::text, 0));
  select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if stage <> 'awaiting_assignment' then raise exception 'invalid_workflow_transition'; end if;
  if not exists (select 1 from public.technicians where id = target_technician_id and is_active) then
    raise exception 'technician_not_found';
  end if;
  if exists (select 1 from public.service_request_assignments
    where service_request_id = target_service_request_id and status in ('pending','accepted')) then
    raise exception 'assignment_already_active';
  end if;
  select status, technician_id into last_status, last_technician_id
  from public.service_request_assignments
  where service_request_id = target_service_request_id
  order by assigned_at desc, id desc limit 1;
  if last_status is not null and last_status <> 'rejected' then
    raise exception 'reassignment_requires_rejection';
  end if;
  if last_status = 'rejected' and last_technician_id = target_technician_id then
    raise exception 'choose_different_technician';
  end if;
  insert into public.service_request_assignments(service_request_id, technician_id, assigned_by)
  values(target_service_request_id, target_technician_id, auth.uid());
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_service_request(target_service_request_id uuid, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare current_stage text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  if nullif(trim(reason),'') is null then raise exception 'cancellation_reason_required'; end if;
  select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if current_stage in ('completed','customer_rejected','customer_cancelled','cancelled') then raise exception 'request_already_closed'; end if;
  update public.service_requests set workflow_stage = 'cancelled', status = 'cancelled', cancellation_reason = trim(reason),
    cancellation_actor_id = auth.uid(), workflow_updated_at = now() where id = target_service_request_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_confirm_service_request_appointment(target_service_request_id uuid, appointment_date date, appointment_time_period text, notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare current_stage text;
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
  if appointment_date is null or appointment_date < current_date or nullif(trim(appointment_time_period),'') is null then raise exception 'invalid_appointment'; end if;
  select workflow_stage into current_stage from public.service_requests where id = target_service_request_id for update;
  if current_stage not in ('technician_accepted','reschedule_requested') then raise exception 'invalid_workflow_transition'; end if;
  update public.service_requests set confirmed_date = appointment_date, confirmed_time_period = trim(appointment_time_period),
    appointment_notes = nullif(trim(notes),''), workflow_stage = 'technician_accepted', workflow_updated_at = now()
  where id = target_service_request_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_get_user_details(target_user_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, phone text, email text, role app_role, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;

  return query
  select p.id, p.full_name, p.phone, u.email::text, p.role, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = target_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reassign_service_request(target_service_request_id uuid, target_technician_id uuid, reassignment_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare previous_assignment public.service_request_assignments%rowtype; new_assignment_id uuid;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if nullif(trim(coalesce(reassignment_reason,'')),'') is null then raise exception 'reassignment_reason_required'; end if;
 select * into previous_assignment from public.service_request_assignments where service_request_id=target_service_request_id order by assigned_at desc,id desc limit 1;
 if not found or previous_assignment.status <> 'rejected' then raise exception 'reassignment_requires_rejection'; end if;
 perform public.admin_assign_service_request(target_service_request_id,target_technician_id);
 select id into new_assignment_id from public.service_request_assignments where service_request_id=target_service_request_id and technician_id=target_technician_id order by assigned_at desc,id desc limit 1;
 update public.service_request_assignments set notes=left('سبب إعادة الإسناد: ' || trim(reassignment_reason),500) where id=new_assignment_id;
 insert into public.service_request_events(service_request_id,actor_id,event_type,details)
 values(target_service_request_id,auth.uid(),'assignment_reassigned',jsonb_build_object('from_technician_id',previous_assignment.technician_id,'to_technician_id',target_technician_id,'reason',left(trim(reassignment_reason),500)));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_service_request_archive(target_service_request_id uuid, should_archive boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare stage text;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if not found then raise exception 'request_not_found'; end if;
 if should_archive and stage not in ('completed','customer_rejected','customer_cancelled','cancelled') then raise exception 'request_not_closed'; end if;
 update public.service_requests set archived_at = case when should_archive then now() else null end,
 archived_by = case when should_archive then auth.uid() else null end where id = target_service_request_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_submit_service_request_quote(target_service_request_id uuid, quote_description text, quote_line_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  stage text;
  quote_id uuid;
  item jsonb;

  non_labor_total numeric(12,2) := 0;
  labor_total numeric(12,2) := 0;
  non_labor_summary text;
begin
  if not public.current_user_has_role(
    array[
      'maintenance_manager',
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if nullif(trim(quote_description), '') is null
    or quote_line_items is null
    or jsonb_typeof(quote_line_items) <> 'array'
    or jsonb_array_length(quote_line_items) = 0
    or jsonb_array_length(quote_line_items) > 100
  then
    raise exception 'invalid_quote';
  end if;

  for item in
    select value
    from jsonb_array_elements(quote_line_items)
  loop
    if coalesce(item->>'item_type', '') not in (
      'service',
      'part',
      'labor',
      'other'
    )
      or char_length(
        trim(
          coalesce(
            item->>'description',
            ''
          )
        )
      ) not between 1 and 300
      or coalesce(
        (item->>'quantity')::numeric,
        0
      ) <= 0
      or coalesce(
        (item->>'quantity')::numeric,
        0
      ) > 100000
      or coalesce(
        (item->>'unit_price')::numeric,
        -1
      ) < 0
    then
      raise exception 'invalid_quote_line';
    end if;
  end loop;

  select workflow_stage
  into stage
  from public.service_requests
  where id = target_service_request_id
  for update;

  if not found then
    raise exception 'service_request_not_found';
  end if;

  if stage <> 'awaiting_admin_quote' then
    raise exception 'invalid_workflow_transition';
  end if;

  select
    coalesce(
      sum(
        ((value->>'quantity')::numeric) *
        ((value->>'unit_price')::numeric)
      ) filter (
        where value->>'item_type' in (
          'service',
          'part',
          'other'
        )
      ),
      0
    ),

    coalesce(
      sum(
        ((value->>'quantity')::numeric) *
        ((value->>'unit_price')::numeric)
      ) filter (
        where value->>'item_type' = 'labor'
      ),
      0
    ),

    string_agg(
      case
        when value->>'item_type' in (
          'service',
          'part',
          'other'
        )
        then
          trim(value->>'description')
          || ' × '
          || (value->>'quantity')
      end,
      '، '
    ) filter (
      where value->>'item_type' in (
        'service',
        'part',
        'other'
      )
    )

  into
    non_labor_total,
    labor_total,
    non_labor_summary

  from jsonb_array_elements(
    quote_line_items
  );

  insert into public.service_request_quotes (
    service_request_id,
    description,
    parts_description,
    parts_cost,
    labor_cost,
    line_items,
    created_by
  )
  values (
    target_service_request_id,
    trim(quote_description),
    non_labor_summary,
    round(non_labor_total, 2),
    round(labor_total, 2),
    quote_line_items,
    auth.uid()
  )
  returning id
  into quote_id;

  -- Mark the technician's submitted change request as reviewed.
  -- Legacy requests without a change request are unaffected.
  update public.service_request_change_requests
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where service_request_id =
      target_service_request_id
    and status = 'submitted';

  update public.service_requests
  set
    workflow_stage =
      'awaiting_customer_approval',
    workflow_updated_at = now()
  where id =
    target_service_request_id;

  return quote_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_submit_service_request_quote(target_service_request_id uuid, quote_description text, quote_parts_description text, quote_parts_cost numeric, quote_labor_cost numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare stage text; quote_id uuid;
begin
 if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if stage <> 'awaiting_admin_quote' then raise exception 'invalid_workflow_transition'; end if;
 if nullif(trim(quote_description),'') is null or quote_parts_cost < 0 or quote_labor_cost < 0 then raise exception 'invalid_quote'; end if;
 insert into public.service_request_quotes(service_request_id,description,parts_description,parts_cost,labor_cost,created_by)
 values(target_service_request_id,trim(quote_description),nullif(trim(quote_parts_description),''),quote_parts_cost,quote_labor_cost,auth.uid()) returning id into quote_id;
 update public.service_requests set workflow_stage = 'awaiting_customer_approval',workflow_updated_at = now() where id = target_service_request_id;
 return quote_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_update_contact_message_status(target_message_id uuid, new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  if new_status not in ('new','read','resolved') then raise exception 'invalid_contact_status'; end if;
  update public.contact_messages
  set status = new_status,
      resolved_at = case when new_status = 'resolved' then coalesce(resolved_at,now()) else null end
  where id = target_message_id;
  if not found then raise exception 'contact_message_not_found'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_technician(target_technician_id uuid, target_service_types text[], target_is_active boolean, target_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
  target_profile_id uuid;
  current_target_role public.app_role;
  active_assignment_exists boolean;
BEGIN
  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role IS NULL OR actor_role NOT IN (
    'maintenance_manager'::public.app_role,
    'admin_manager'::public.app_role,
    'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF coalesce(array_length(target_service_types, 1), 0) = 0 THEN
    RAISE EXCEPTION 'service_types_required';
  END IF;

  SELECT t.profile_id, p.role
    INTO target_profile_id, current_target_role
  FROM public.technicians t
  JOIN public.profiles p ON p.id = t.profile_id
  WHERE t.id = target_technician_id;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'technician_not_found';
  END IF;

  IF target_is_active = false THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.service_request_assignments
      WHERE technician_id = target_technician_id
        AND status IN ('pending', 'accepted')
    ) INTO active_assignment_exists;

    IF active_assignment_exists THEN
      RAISE EXCEPTION 'technician_has_active_assignments';
    END IF;
  END IF;

  IF target_is_active = true AND current_target_role <> 'technician'::public.app_role THEN
    RAISE EXCEPTION 'technician_role_required';
  END IF;

  UPDATE public.technicians
  SET service_types = target_service_types,
      is_active = target_is_active,
      notes = nullif(trim(target_notes), ''),
      updated_at = now()
  WHERE id = target_technician_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user_role(target_user_id uuid, new_role app_role, new_service_types text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor_role public.app_role;
  target_role public.app_role;
  target_technician_id uuid;
  actor_rank integer;
  target_rank integer;
  new_rank integer;
  active_assignment_exists boolean;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;

  IF actor_role IS NULL OR target_role IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;

  actor_rank := CASE actor_role
    WHEN 'customer'::public.app_role THEN 10
    WHEN 'technician'::public.app_role THEN 20
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
  END;

  target_rank := CASE target_role
    WHEN 'customer'::public.app_role THEN 10
    WHEN 'technician'::public.app_role THEN 20
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
  END;

  new_rank := CASE new_role
    WHEN 'customer'::public.app_role THEN 10
    WHEN 'technician'::public.app_role THEN 20
    WHEN 'maintenance_manager'::public.app_role THEN 30
    WHEN 'admin_manager'::public.app_role THEN 40
    WHEN 'super_admin'::public.app_role THEN 50
  END;

  IF actor_rank IS NULL OR target_rank IS NULL OR new_rank IS NULL THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  IF actor_role <> 'super_admin'::public.app_role
     AND (target_rank >= actor_rank OR new_rank >= actor_rank) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF new_role = 'technician'::public.app_role THEN
    IF coalesce(array_length(new_service_types, 1), 0) = 0 THEN
      RAISE EXCEPTION 'service_types_required';
    END IF;

    IF target_role IN (
      'maintenance_manager'::public.app_role,
      'admin_manager'::public.app_role,
      'super_admin'::public.app_role
    ) THEN
      RAISE EXCEPTION 'privileged_user_cannot_be_technician';
    END IF;

    SELECT id INTO target_technician_id
    FROM public.technicians
    WHERE profile_id = target_user_id;

    IF target_technician_id IS NULL THEN
      INSERT INTO public.technicians (profile_id, service_types, is_active, notes)
      VALUES (target_user_id, new_service_types, true, NULL);
    ELSE
      UPDATE public.technicians
      SET service_types = new_service_types,
          is_active = true,
          updated_at = now()
      WHERE id = target_technician_id;
    END IF;
  ELSIF target_role = 'technician'::public.app_role AND new_role <> 'technician'::public.app_role THEN
    SELECT id INTO target_technician_id
    FROM public.technicians
    WHERE profile_id = target_user_id;

    SELECT EXISTS (
      SELECT 1
      FROM public.service_request_assignments
      WHERE technician_id = target_technician_id
        AND status IN ('pending', 'accepted')
    ) INTO active_assignment_exists;

    IF active_assignment_exists THEN
      RAISE EXCEPTION 'technician_has_active_assignments';
    END IF;

    UPDATE public.technicians
    SET is_active = false,
        updated_at = now()
    WHERE profile_id = target_user_id;
  END IF;

  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE id = target_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_warranty_claim(target_claim_id uuid, new_status text, new_admin_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.current_user_has_role(array['maintenance_manager','admin_manager','super_admin']::public.app_role[]) then
    raise exception 'insufficient_privilege';
  end if;
  if new_status not in ('new','under_review','approved','rejected','resolved') then
    raise exception 'invalid_warranty_status';
  end if;
  update public.warranty_claims
  set status = new_status,
      admin_notes = nullif(trim(coalesce(new_admin_notes,'')),''),
      updated_at = now()
  where id = target_claim_id;
  if not found then raise exception 'warranty_claim_not_found'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.attach_service_request_image(target_request_id uuid, target_upload_token uuid, target_storage_path text, target_content_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare request_owner uuid;
begin
 select customer_id into request_owner from public.service_requests where id = target_request_id and upload_token = target_upload_token for update;
 if not found or not (request_owner is null and auth.uid() is null or request_owner = auth.uid()) then raise exception 'request_not_found'; end if;
 if target_content_type not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_image_type'; end if;
 if split_part(target_storage_path,'/',1) <> target_request_id::text or split_part(target_storage_path,'/',2) <> target_upload_token::text then raise exception 'invalid_image_path'; end if;
 if (select count(*) from public.service_request_attachments where service_request_id = target_request_id and attachment_stage = 'customer') >= 5 then raise exception 'attachment_limit_reached'; end if;
 if not exists(select 1 from storage.objects where bucket_id = 'request-images' and name = target_storage_path) then raise exception 'image_not_uploaded'; end if;
 insert into public.service_request_attachments(service_request_id,storage_path,content_type,attachment_stage,uploaded_by)
 values(target_request_id,target_storage_path,target_content_type,'customer',auth.uid());
end; $function$;

CREATE OR REPLACE FUNCTION public.check_profile_mobile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if new.phone is not null and public.normalized_sa_mobile(new.phone) is null then raise exception 'invalid_mobile'; end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.claim_verified_guest_service_requests()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare verified_email text; claimed integer;
begin
 select lower(trim(email)) into verified_email from auth.users
 where id = auth.uid() and email_confirmed_at is not null and email is not null;
 if verified_email is null then raise exception 'verified_email_required'; end if;
 update public.service_requests set customer_id = auth.uid()
 where customer_id is null and customer_email is not null and lower(trim(customer_email)) = verified_email;
 get diagnostics claimed = row_count;
 return claimed;
end; $function$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(required_roles app_role[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = any(required_roles)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_cancel_service_request(target_service_request_id uuid, cancellation_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_variable
declare stage text;
begin
  select workflow_stage into stage from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid() for update;
  if not found then raise exception 'request_not_found'; end if;
  if stage not in ('awaiting_assignment','assigned') then raise exception 'request_cannot_be_cancelled'; end if;
  update public.service_requests set workflow_stage = 'customer_cancelled', status = 'cancelled',
    visit_notes = case when nullif(trim(cancellation_reason),'') is null then visit_notes
      else concat_ws(E'\n',visit_notes,'Cancellation: ' || trim(cancellation_reason)) end,
    workflow_updated_at = now() where id = target_service_request_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.customer_decide_service_request_quote(target_quote_id uuid, approve boolean, decision_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; stage text;
begin
 select q.service_request_id,r.workflow_stage into rid,stage from public.service_request_quotes q
 join public.service_requests r on r.id = q.service_request_id
 where q.id = target_quote_id and q.status = 'pending' and r.customer_id = auth.uid() for update of q,r;
 if not found then raise exception 'quote_not_found'; end if;
 if stage <> 'awaiting_customer_approval' then raise exception 'invalid_workflow_transition'; end if;
 update public.service_request_quotes set status = case when approve then 'approved' else 'rejected' end,
 decided_at = now(),customer_notes = nullif(trim(decision_notes),'') where id = target_quote_id;
 update public.service_requests set workflow_stage = case when approve then 'quote_approved' else 'customer_rejected' end,
 workflow_updated_at = now() where id = rid;
end; $function$;

CREATE OR REPLACE FUNCTION public.customer_get_active_warranty_items()
 RETURNS TABLE(service_request_id uuid, line_id uuid, description text, expires_at timestamp with time zone, terms text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select invoice.service_request_id, line.id, line.description,
    invoice.issued_at + make_interval(days => line.warranty_days), line.warranty_terms
  from public.invoice_line_items line
  join public.invoices invoice on invoice.id = line.invoice_id
  where invoice.customer_id = auth.uid()
    and invoice.status = 'issued'
    and invoice.issued_at is not null
    and line.warranty_days > 0
    and now() <= invoice.issued_at + make_interval(days => line.warranty_days)
  order by invoice.issued_at desc, line.sort_order;
$function$;

CREATE OR REPLACE FUNCTION public.customer_reject_repair(target_service_request_id uuid, rejection_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare current_stage text; pending_quote_id uuid;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid()
  for update;

  if not found then raise exception 'request_not_found'; end if;

  if current_stage = 'needs_followup' then
    update public.service_requests
    set workflow_stage = 'customer_rejected',
        status = 'cancelled',
        visit_outcome = 'customer_rejected',
        visit_notes = case
          when nullif(trim(rejection_notes), '') is null then visit_notes
          when visit_notes is null then 'رفض العميل: ' || trim(rejection_notes)
          else visit_notes || E'\nرفض العميل: ' || trim(rejection_notes)
        end,
        workflow_updated_at = now()
    where id = target_service_request_id;
    return;
  end if;

  if current_stage <> 'awaiting_customer_approval' then
    raise exception 'repair_rejection_not_available';
  end if;

  select id into pending_quote_id
  from public.service_request_quotes
  where service_request_id = target_service_request_id and status = 'pending'
  for update;
  if pending_quote_id is null then raise exception 'quote_not_found'; end if;

  perform public.customer_decide_service_request_quote(pending_quote_id, false, rejection_notes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_reject_service_request(target_service_request_id uuid, rejection_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare current_stage text;
begin
  select workflow_stage into current_stage
  from public.service_requests
  where id = target_service_request_id and customer_id = auth.uid()
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if current_stage <> 'technician_accepted' then
    raise exception 'request_not_ready_for_rejection';
  end if;

  update public.service_requests
  set visit_outcome = 'customer_rejected',
      visit_notes = nullif(trim(rejection_reason), ''),
      workflow_updated_at = now()
  where id = target_service_request_id;

  perform public.sync_service_request_workflow(target_service_request_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_closed_service_request_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.sync_service_request_workflow(new.id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_create_invoice(p_request_id uuid, p_description text, p_subtotal numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.service_requests%rowtype; s public.business_finance_settings%rowtype; new_id uuid; tax numeric(12,2);
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if nullif(trim(p_description),'') is null or p_subtotal is null or p_subtotal < 0 then raise exception 'invalid_invoice'; end if;
 select * into r from public.service_requests where id=p_request_id;
 if not found or r.workflow_stage <> 'completed' then raise exception 'request_not_completed'; end if;
 if nullif(trim(r.customer_email),'') is null then raise exception 'customer_email_required'; end if;
 select * into s from public.business_finance_settings where id=true;
 if s.vat_registered is null then raise exception 'vat_registration_status_required'; end if;
 if s.vat_registered and nullif(s.tax_number,'') is null then raise exception 'tax_number_required'; end if;
 tax := round(p_subtotal * s.tax_rate / 100,2);
 insert into public.invoices(service_request_id,customer_id,customer_name,customer_email,business_name,business_address,business_email,business_tax_number,vat_registered,description,subtotal,tax_rate,tax_amount,total,created_by)
 values(r.id,r.customer_id,r.customer_name,r.customer_email,s.legal_name,s.address,s.contact_email,s.tax_number,s.vat_registered,trim(p_description),p_subtotal,s.tax_rate,tax,p_subtotal+tax,auth.uid()) returning id into new_id;
 return new_id;
end $function$;

CREATE OR REPLACE FUNCTION public.finance_ensure_invoice_draft(p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  request_record public.service_requests%rowtype;
  settings_record public.business_finance_settings%rowtype;
  result_id uuid;
  result_status text;
  initial_tax_rate numeric(5,2);
begin
  if not public.current_user_has_role(
    array[
      'maintenance_manager',
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select *
  into request_record
  from public.service_requests
  where id = p_request_id
  for update;

  if not found
     or request_record.workflow_stage <> 'completed' then
    raise exception 'request_not_completed';
  end if;

  select id, status
  into result_id, result_status
  from public.invoices
  where service_request_id = p_request_id
    and status in ('draft', 'issued')
  order by created_at desc
  limit 1;

  if result_id is not null then
    if result_status = 'draft' then
      perform private.finance_seed_invoice_from_approved_quote(
        result_id,
        p_request_id
      );
    end if;

    return result_id;
  end if;

  select *
  into settings_record
  from public.business_finance_settings
  where id = true;

  initial_tax_rate :=
    case
      when coalesce(settings_record.vat_registered, false)
        then coalesce(settings_record.tax_rate, 0)
      else 0
    end;

  insert into public.invoices (
    service_request_id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    service_type,
    work_summary,
    business_name,
    business_address,
    business_email,
    business_tax_number,
    vat_registered,
    description,
    subtotal,
    tax_rate,
    tax_amount,
    total,
    created_by
  )
  values (
    request_record.id,
    request_record.customer_id,
    request_record.customer_name,
    coalesce(request_record.customer_email, ''),
    coalesce(request_record.phone, ''),
    coalesce(request_record.service_type, ''),
    coalesce(
      request_record.visit_notes,
      request_record.problem_description,
      ''
    ),
    settings_record.legal_name,
    settings_record.address,
    settings_record.contact_email,
    settings_record.tax_number,
    coalesce(settings_record.vat_registered, false),
    coalesce(
      nullif(trim(request_record.visit_notes), ''),
      nullif(trim(request_record.problem_description), ''),
      'خدمة صيانة'
    ),
    0,
    initial_tax_rate,
    0,
    0,
    auth.uid()
  )
  returning id into result_id;

  perform private.finance_seed_invoice_from_approved_quote(
    result_id,
    p_request_id
  );

  return result_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_invoice_list_summary()
 RETURNS TABLE(total_invoice_count bigint, issued_invoice_count bigint, issued_total numeric, issued_collected_total numeric, issued_outstanding_total numeric, fully_paid_draft_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_issued_total numeric := 0;
  v_issued_collected numeric := 0;
begin
  if not public.current_user_has_role(
    array['admin_manager','super_admin']::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select
    count(*),
    count(*) filter (where i.status = 'issued'),
    coalesce(sum(i.total) filter (where i.status = 'issued'), 0)
  into
    total_invoice_count,
    issued_invoice_count,
    v_issued_total
  from public.invoices i;

  select coalesce(sum(p.amount), 0)
  into v_issued_collected
  from public.invoice_payments p
  join public.invoices i on i.id = p.invoice_id
  where i.status = 'issued'
    and p.voided_at is null;

  select count(*)
  into fully_paid_draft_count
  from public.invoices i
  where i.status = 'draft'
    and i.total > 0
    and coalesce(
      (
        select sum(p.amount)
        from public.invoice_payments p
        where p.invoice_id = i.id
          and p.voided_at is null
      ),
      0
    ) >= i.total;

  issued_total := v_issued_total;
  issued_collected_total := v_issued_collected;
  issued_outstanding_total := greatest(0, v_issued_total - v_issued_collected);

  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_summary()
 RETURNS TABLE(issued_total numeric, collected_total numeric, outstanding_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 return query select coalesce((select sum(i.total) from public.invoices i where i.status='issued'),0),
  coalesce((select sum(p.amount) from public.invoice_payments p join public.invoices i on i.id=p.invoice_id where i.status='issued' and p.voided_at is null),0),
  coalesce((select sum(i.total) from public.invoices i where i.status='issued'),0) -
  coalesce((select sum(p.amount) from public.invoice_payments p join public.invoices i on i.id=p.invoice_id where i.status='issued' and p.voided_at is null),0);
end $function$;

CREATE OR REPLACE FUNCTION public.finance_mark_invoice_emailed(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 update public.invoices set emailed_at=now() where id=p_invoice_id and status='issued';
 if not found then raise exception 'invoice_not_issued'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.finance_record_expense(p_category text, p_description text, p_amount numeric, p_expense_date date, p_payment_method text, p_vendor_name text DEFAULT ''::text, p_reference text DEFAULT ''::text, p_notes text DEFAULT ''::text, p_service_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  expense_id uuid;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if p_category not in (
    'parts',
    'technician',
    'transport',
    'operations',
    'tools',
    'marketing',
    'other'
  ) then
    raise exception 'invalid_expense_category';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'expense_description_required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_expense_amount';
  end if;

  if p_payment_method not in (
    'cash',
    'bank_transfer',
    'card',
    'other'
  ) then
    raise exception 'invalid_payment_method';
  end if;

  insert into public.finance_expenses (
    category,
    description,
    amount,
    expense_date,
    payment_method,
    vendor_name,
    reference,
    notes,
    service_request_id,
    created_by
  )
  values (
    p_category,
    left(trim(p_description), 500),
    p_amount,
    coalesce(p_expense_date, current_date),
    p_payment_method,
    left(trim(coalesce(p_vendor_name, '')), 200),
    left(trim(coalesce(p_reference, '')), 200),
    left(trim(coalesce(p_notes, '')), 1000),
    p_service_request_id,
    auth.uid()
  )
  returning id into expense_id;

  return expense_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare bill public.invoices%rowtype; received numeric(12,2); payment_id uuid;
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if p_amount is null or p_amount <= 0 or p_method not in ('cash','bank_transfer','card','other') then raise exception 'invalid_payment'; end if;
 select * into bill from public.invoices where id=p_invoice_id for update;
 if not found or bill.status <> 'issued' then raise exception 'invoice_not_issued'; end if;
 select coalesce(sum(amount),0) into received from public.invoice_payments where invoice_id=p_invoice_id and voided_at is null;
 if received+p_amount > bill.total then raise exception 'payment_exceeds_balance'; end if;
 insert into public.invoice_payments(invoice_id,amount,method,note,recorded_by) values(p_invoice_id,p_amount,p_method,left(trim(coalesce(p_note,'')),500),auth.uid()) returning id into payment_id;
 if received+p_amount = bill.total then update public.invoices set paid_at=now() where id=p_invoice_id; end if;
 return payment_id;
end $function$;

CREATE OR REPLACE FUNCTION public.finance_record_service_request_payment(p_request_id uuid, p_amount numeric, p_payment_type text, p_method text, p_note text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  request_stage text;
  payment_id uuid;

  draft_invoice_id uuid;
  draft_invoice_total numeric(12,2);

  invoice_paid_total numeric(12,2);
  untransferred_request_total numeric(12,2);
  projected_total numeric(12,2);
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if p_amount is null
     or p_amount <= 0 then
    raise exception 'invalid_payment_amount';
  end if;

  if p_payment_type not in (
    'visit_fee',
    'deposit',
    'advance',
    'other'
  ) then
    raise exception 'invalid_payment_type';
  end if;

  if p_method not in (
    'cash',
    'bank_transfer',
    'card',
    'other'
  ) then
    raise exception 'invalid_payment_method';
  end if;

  select workflow_stage
  into request_stage
  from public.service_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'service_request_not_found';
  end if;

  if request_stage in (
    'cancelled',
    'customer_cancelled'
  ) then
    raise exception 'request_not_open_for_preinvoice_payment';
  end if;

  --------------------------------------------------------------
  -- Once an invoice is issued, later collections belong
  -- directly to invoice_payments.
  --------------------------------------------------------------
  if exists (
    select 1
    from public.invoices
    where service_request_id = p_request_id
      and status = 'issued'
  ) then
    raise exception 'request_invoice_already_issued';
  end if;

  --------------------------------------------------------------
  -- For completed requests, there must be a final draft invoice.
  -- Also prevent collections from exceeding its total.
  --------------------------------------------------------------
  if request_stage = 'completed' then

    select
      id,
      total
    into
      draft_invoice_id,
      draft_invoice_total
    from public.invoices
    where service_request_id = p_request_id
      and status = 'draft'
    order by created_at desc
    limit 1
    for update;

    if draft_invoice_id is null then
      raise exception 'completed_request_invoice_draft_required';
    end if;

    select coalesce(sum(amount), 0)
    into invoice_paid_total
    from public.invoice_payments
    where invoice_id = draft_invoice_id
      and voided_at is null;

    select coalesce(sum(amount), 0)
    into untransferred_request_total
    from public.service_request_payments
    where service_request_id = p_request_id
      and voided_at is null
      and transferred_invoice_payment_id is null;

    projected_total :=
      round(
        invoice_paid_total
        + untransferred_request_total
        + p_amount,
        2
      );

    if projected_total > draft_invoice_total then
      raise exception 'payment_exceeds_invoice_remaining';
    end if;

  end if;

  --------------------------------------------------------------
  -- Record the request-level payment.
  --------------------------------------------------------------
  insert into public.service_request_payments (
    service_request_id,
    payment_type,
    amount,
    method,
    note,
    recorded_by
  )
  values (
    p_request_id,
    p_payment_type,
    round(p_amount, 2),
    p_method,
    left(trim(coalesce(p_note, '')), 500),
    auth.uid()
  )
  returning id into payment_id;

  --------------------------------------------------------------
  -- If the service is already completed and a final draft invoice
  -- exists, immediately transfer all active untransferred payments
  -- to that invoice in the same transaction.
  --------------------------------------------------------------
  if request_stage = 'completed'
     and draft_invoice_id is not null then

    perform private.finance_transfer_request_payments_to_invoice(
      draft_invoice_id,
      p_request_id
    );

  end if;

  return payment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_save_settings(p_name text, p_address text, p_email text, p_tax_number text, p_tax_rate numeric, p_vat_registered boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if not public.current_user_has_role(array['admin_manager','super_admin']::public.app_role[]) then raise exception 'insufficient_privilege'; end if;
 if nullif(trim(p_name),'') is null or p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 or p_vat_registered is null then raise exception 'invalid_finance_settings'; end if;
 if not p_vat_registered and p_tax_rate <> 0 then raise exception 'non_vat_tax_rate_must_be_zero'; end if;
 update public.business_finance_settings set legal_name=trim(p_name),address=trim(p_address),contact_email=trim(p_email),tax_number=trim(p_tax_number),tax_rate=p_tax_rate,vat_registered=p_vat_registered,updated_at=now() where id=true;
end $function$;

CREATE OR REPLACE FUNCTION public.finance_set_invoice_status(p_invoice_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  bill public.invoices%rowtype;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if p_status not in ('issued', 'void') then
    raise exception 'invalid_status';
  end if;

  select *
  into bill
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if p_status = 'issued' then
    if bill.vat_registered then
      raise exception 'tax_invoicing_integration_required';
    end if;

    if bill.status <> 'draft' then
      raise exception 'invoice_not_draft';
    end if;

    if not exists (
      select 1
      from public.invoice_line_items
      where invoice_id = p_invoice_id
    ) then
      raise exception 'invoice_lines_required';
    end if;

    update public.invoices
    set
      status = 'issued',
      issued_at = now(),
      updated_at = now()
    where id = p_invoice_id;

    perform private.finance_transfer_request_payments_to_invoice(
      p_invoice_id,
      bill.service_request_id
    );

  else
    if bill.status not in ('draft', 'issued') then
      raise exception 'invoice_not_active';
    end if;

    if exists (
      select 1
      from public.invoice_payments
      where invoice_id = p_invoice_id
        and voided_at is null
    ) then
      raise exception 'invoice_has_payments';
    end if;

    update public.invoices
    set
      status = 'void',
      issued_at = coalesce(issued_at, now()),
      paid_at = null,
      updated_at = now()
    where id = p_invoice_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_update_invoice_draft(p_invoice_id uuid, p_work_summary text, p_lines jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  bill public.invoices%rowtype;
  item jsonb;
  gross_total numeric(12,2);
  net_total numeric(12,2);
  vat_amount numeric(12,2);
  effective_tax_rate numeric(5,2);
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 100 then
    raise exception 'invoice_lines_required';
  end if;

  select *
  into bill
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if bill.status <> 'draft' then
    raise exception 'invoice_not_draft';
  end if;

  if char_length(trim(coalesce(p_work_summary, ''))) < 3
     or char_length(trim(p_work_summary)) > 4000 then
    raise exception 'invalid_work_summary';
  end if;

  for item in
    select value
    from jsonb_array_elements(p_lines)
  loop
    if char_length(
         trim(coalesce(item->>'description', ''))
       ) < 1
       or char_length(
         trim(item->>'description')
       ) > 300
       or coalesce(
         (item->>'quantity')::numeric,
         0
       ) <= 0
       or coalesce(
         (item->>'quantity')::numeric,
         0
       ) > 100000
       or coalesce(
         (item->>'unit_price')::numeric,
         -1
       ) < 0
       or coalesce(
         (item->>'warranty_days')::integer,
         0
       ) < 0
       or coalesce(
         (item->>'warranty_days')::integer,
         0
       ) > 3650
       or char_length(
         coalesce(item->>'warranty_terms', '')
       ) > 1000 then
      raise exception 'invalid_invoice_line';
    end if;
  end loop;

  delete from public.invoice_line_items
  where invoice_id = p_invoice_id;

  insert into public.invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_price,
    warranty_days,
    warranty_terms,
    sort_order
  )
  select
    p_invoice_id,
    trim(value->>'description'),
    (value->>'quantity')::numeric,
    (value->>'unit_price')::numeric,
    coalesce(
      (value->>'warranty_days')::integer,
      0
    ),
    case
      when coalesce(
        (value->>'warranty_days')::integer,
        0
      ) > 0
      then nullif(
        trim(coalesce(value->>'warranty_terms', '')),
        ''
      )
      else null
    end,
    ordinality - 1
  from jsonb_array_elements(p_lines)
  with ordinality;

  select round(
    coalesce(sum(quantity * unit_price), 0),
    2
  )
  into gross_total
  from public.invoice_line_items
  where invoice_id = p_invoice_id;

  effective_tax_rate := bill.tax_rate;

  if bill.vat_registered
     and coalesce(effective_tax_rate, 0) <= 0 then
    select tax_rate
    into effective_tax_rate
    from public.business_finance_settings
    where id = true;
  end if;

  effective_tax_rate :=
    coalesce(effective_tax_rate, 0);

  if bill.vat_registered
     and effective_tax_rate > 0 then

    net_total := round(
      gross_total / (1 + effective_tax_rate / 100),
      2
    );

    vat_amount := round(
      gross_total - net_total,
      2
    );

  else

    effective_tax_rate := 0;
    net_total := gross_total;
    vat_amount := 0;

  end if;

  update public.invoices
  set
    work_summary = trim(p_work_summary),
    description = trim(p_work_summary),
    subtotal = net_total,
    tax_rate = effective_tax_rate,
    tax_amount = vat_amount,
    total = gross_total,
    updated_at = now()
  where id = p_invoice_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_void_expense(p_expense_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  update public.finance_expenses
  set
    voided_at = now(),
    voided_by = auth.uid()
  where id = p_expense_id
    and voided_at is null;

  if not found then
    raise exception 'expense_not_found_or_voided';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_void_payment(p_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  bill_id uuid;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select invoice_id
  into bill_id
  from public.invoice_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  perform 1
  from public.invoices
  where id = bill_id
  for update;

  update public.invoice_payments
  set
    voided_at = now(),
    voided_by = auth.uid()
  where id = p_payment_id
    and voided_at is null;

  if not found then
    raise exception 'payment_already_void';
  end if;

  ----------------------------------------------------------------
  -- If this invoice payment originated from a pre-invoice
  -- service request payment, void the source record as well.
  --
  -- Keep transferred_invoice_payment_id and transferred_at intact
  -- for audit history.
  ----------------------------------------------------------------
  update public.service_request_payments
  set
    voided_at = now(),
    voided_by = auth.uid()
  where transferred_invoice_payment_id = p_payment_id
    and voided_at is null;

  ----------------------------------------------------------------
  -- Voiding any active payment means the invoice is no longer
  -- considered fully paid.
  ----------------------------------------------------------------
  update public.invoices
  set
    paid_at = null,
    updated_at = now()
  where id = bill_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_void_service_request_payment(p_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  payment_record public.service_request_payments%rowtype;
begin
  if not public.current_user_has_role(
    array[
      'admin_manager',
      'super_admin'
    ]::public.app_role[]
  ) then
    raise exception 'insufficient_privilege';
  end if;

  select *
  into payment_record
  from public.service_request_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  if payment_record.voided_at is not null then
    raise exception 'payment_already_void';
  end if;

  -- After transfer, cancellation must be coordinated with
  -- the corresponding invoice payment instead.
  if payment_record.transferred_invoice_payment_id is not null then
    raise exception 'payment_already_transferred';
  end if;

  update public.service_request_payments
  set
    voided_at = now(),
    voided_by = auth.uid()
  where id = p_payment_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'phone', ''),
      nullif(new.phone, '')
    ),
    'customer'::public.app_role
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_assignment_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if tg_op='INSERT' then
  insert into public.service_request_events(service_request_id,actor_id,event_type,details)
  values(new.service_request_id,auth.uid(),'assignment_created',jsonb_build_object('technician_id',new.technician_id));
 elsif old.status is distinct from new.status then
  insert into public.service_request_events(service_request_id,actor_id,event_type,details)
  values(new.service_request_id,auth.uid(),'assignment_status_changed',jsonb_build_object('technician_id',new.technician_id,'from_status',old.status,'to_status',new.status,'notes',new.notes));
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.log_new_service_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 insert into public.service_request_events(service_request_id,actor_id,event_type,to_stage)
 values(new.id,auth.uid(),'request_created',new.workflow_stage);
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.log_service_request_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if old.workflow_stage is distinct from new.workflow_stage then insert into public.service_request_events(service_request_id,actor_id,event_type,from_stage,to_stage) values(new.id,auth.uid(),'stage_changed',old.workflow_stage,new.workflow_stage); end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare updated_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  update public.notifications
     set read_at = coalesce(read_at, now())
   where recipient_id = auth.uid()
     and read_at is null;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(target_notification_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 update public.notifications set read_at = coalesce(read_at,now())
 where id = target_notification_id and recipient_id = auth.uid();
 if not found then raise exception 'notification_not_found'; end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.notify_service_request_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications(
    recipient_id,
    service_request_id,
    event_id,
    title,
    body
  )
  select distinct
    recipient_id,
    new.service_request_id,
    new.id,
    case
      when new.to_stage = 'awaiting_customer_approval' then 'عرض إصلاح جديد'
      when new.to_stage = 'completed' then 'اكتمل طلب الصيانة'
      when new.to_stage = 'assigned' then 'تم إسناد الطلب'
      else 'تحديث طلب الصيانة'
    end,
    new.to_stage
  from (
    select r.customer_id as recipient_id
    from public.service_requests r
    where r.id = new.service_request_id

    union

    select p.id
    from public.profiles p
    where p.role in ('maintenance_manager','admin_manager','super_admin')

    union

    select t.profile_id
    from public.service_request_assignments a
    join public.technicians t
      on t.id = a.technician_id
    where a.service_request_id = new.service_request_id
      and a.status in ('pending','accepted')
  ) recipients
  where recipient_id is not null
    and recipient_id is distinct from new.actor_id

  on conflict do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_assignment_on_closed_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare stage text;
begin
 if new.status in ('pending','accepted') then
  select workflow_stage into stage from public.service_requests where id = new.service_request_id;
  if stage in ('completed','customer_rejected','customer_cancelled','cancelled') then raise exception 'request_already_closed'; end if;
 end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_catalog_part_tax_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  finance_settings public.business_finance_settings%rowtype;
begin
  select *
  into finance_settings
  from public.business_finance_settings
  where id = true;

  new.tax_rate :=
    case
      when coalesce(finance_settings.vat_registered, false)
        then finance_settings.tax_rate
      else 0
    end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_catalog_service_tax_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  finance_settings public.business_finance_settings%rowtype;
begin
  select *
  into finance_settings
  from public.business_finance_settings
  where id = true;

  new.tax_rate :=
    case
      when coalesce(finance_settings.vat_registered, false)
        then finance_settings.tax_rate
      else 0
    end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_site_footer_content_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_technicians_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_contact_message(sender_name text, sender_phone text DEFAULT NULL::text, sender_email text DEFAULT NULL::text, message_subject text DEFAULT NULL::text, message_body text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  message_id uuid;
begin
  if nullif(trim(sender_name), '') is null or nullif(trim(message_body), '') is null then
    raise exception 'contact_message_required';
  end if;

  if char_length(sender_name) > 120
    or char_length(coalesce(sender_phone, '')) > 40
    or char_length(coalesce(sender_email, '')) > 254
    or char_length(coalesce(message_subject, '')) > 180
    or char_length(message_body) > 4000 then
    raise exception 'contact_message_too_long';
  end if;

  insert into public.contact_messages(name, phone, email, subject, message)
  values (
    trim(sender_name),
    nullif(trim(sender_phone), ''),
    nullif(trim(sender_email), ''),
    nullif(trim(message_subject), ''),
    trim(message_body)
  )
  returning id into message_id;

  return message_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_service_request_v2(input_name text, input_phone text, input_email text, input_service text, input_issue_type text, input_problem text, input_city text, input_address text, input_latitude double precision, input_longitude double precision, input_preferred_date date, input_preferred_time_period text)
 RETURNS TABLE(request_id uuid, request_upload_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if nullif(trim(input_name), '') is null
    or public.normalized_sa_mobile(input_phone) is null
    or nullif(trim(input_service), '') is null
    or nullif(trim(input_issue_type), '') is null
    or nullif(trim(input_problem), '') is null
    or trim(input_city) <> 'مكة المكرمة'
    or nullif(trim(input_address), '') is null
    or input_latitude not between -90 and 90
    or input_longitude not between -180 and 180
    or input_preferred_date is null
    or input_preferred_date < current_date
    or input_preferred_time_period not in ('morning', 'afternoon', 'evening') then
    raise exception 'invalid_request';
  end if;

  return query
  insert into public.service_requests(
    customer_name,
    phone,
    customer_email,
    service_type,
    issue_type,
    problem_description,
    city,
    address,
    latitude,
    longitude,
    preferred_date,
    preferred_time_period,
    customer_id
  )
  values(
    trim(input_name),
    trim(input_phone),
    nullif(lower(trim(input_email)), ''),
    trim(input_service),
    trim(input_issue_type),
    trim(input_problem),
    trim(input_city),
    trim(input_address),
    input_latitude,
    input_longitude,
    input_preferred_date,
    input_preferred_time_period,
    auth.uid()
  )
  returning id, upload_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_service_request_v3(input_name text, input_phone text, input_email text, input_service text, input_issue_type text, input_problem text, input_city text, input_address text, input_latitude double precision, input_longitude double precision, input_preferred_date date, input_preferred_time_period text, input_landing_page text DEFAULT NULL::text, input_referrer text DEFAULT NULL::text, input_utm_source text DEFAULT NULL::text, input_utm_medium text DEFAULT NULL::text, input_utm_campaign text DEFAULT NULL::text, input_utm_content text DEFAULT NULL::text, input_utm_term text DEFAULT NULL::text, input_gclid text DEFAULT NULL::text, input_wbraid text DEFAULT NULL::text, input_gbraid text DEFAULT NULL::text, input_first_touch_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(request_id uuid, request_upload_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if nullif(trim(input_name), '') is null
    or public.normalized_sa_mobile(input_phone) is null
    or nullif(trim(input_service), '') is null
    or nullif(trim(input_issue_type), '') is null
    or nullif(trim(input_problem), '') is null
    or trim(input_city) <> 'مكة المكرمة'
    or nullif(trim(input_address), '') is null
    or input_latitude not between -90 and 90
    or input_longitude not between -180 and 180
    or input_preferred_date is null
    or input_preferred_date < current_date
    or input_preferred_time_period not in ('morning', 'afternoon', 'evening') then
    raise exception 'invalid_request';
  end if;

  return query
  insert into public.service_requests(
    customer_name, phone, customer_email, service_type, issue_type,
    problem_description, city, address, latitude, longitude,
    preferred_date, preferred_time_period, customer_id,
    landing_page, referrer, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, gclid, wbraid, gbraid, first_touch_at
  )
  values(
    trim(input_name), trim(input_phone), nullif(lower(trim(input_email)), ''),
    trim(input_service), trim(input_issue_type), trim(input_problem),
    trim(input_city), trim(input_address), input_latitude, input_longitude,
    input_preferred_date, input_preferred_time_period, auth.uid(),
    nullif(left(trim(coalesce(input_landing_page, '')), 2048), ''),
    nullif(left(trim(coalesce(input_referrer, '')), 2048), ''),
    nullif(left(trim(coalesce(input_utm_source, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_medium, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_campaign, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_content, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_term, '')), 255), ''),
    nullif(left(trim(coalesce(input_gclid, '')), 512), ''),
    nullif(left(trim(coalesce(input_wbraid, '')), 512), ''),
    nullif(left(trim(coalesce(input_gbraid, '')), 512), ''),
    input_first_touch_at
  )
  returning id, upload_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_service_request_v4(input_name text, input_phone text, input_email text, input_catalog_item_id uuid, input_catalog_services jsonb, input_issue_type text, input_problem text, input_city text, input_address text, input_latitude double precision, input_longitude double precision, input_preferred_date date, input_preferred_time_period text, input_landing_page text DEFAULT NULL::text, input_referrer text DEFAULT NULL::text, input_utm_source text DEFAULT NULL::text, input_utm_medium text DEFAULT NULL::text, input_utm_campaign text DEFAULT NULL::text, input_utm_content text DEFAULT NULL::text, input_utm_term text DEFAULT NULL::text, input_gclid text DEFAULT NULL::text, input_wbraid text DEFAULT NULL::text, input_gbraid text DEFAULT NULL::text, input_first_touch_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(request_id uuid, request_upload_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  selected_category public.service_catalog_items%rowtype;
  selected_service public.service_catalog_services%rowtype;

  request_record public.service_requests%rowtype;

  service_entry jsonb;
  service_id uuid;
  service_quantity numeric(10,2);

  requested_count integer;
  distinct_count integer;
begin
  -- Validate ordinary request fields.
  if nullif(trim(input_name), '') is null
    or public.normalized_sa_mobile(input_phone) is null
    or nullif(trim(input_issue_type), '') is null
    or nullif(trim(input_problem), '') is null
    or trim(input_city) <> 'مكة المكرمة'
    or nullif(trim(input_address), '') is null
    or input_latitude not between -90 and 90
    or input_longitude not between -180 and 180
    or input_preferred_date is null
    or input_preferred_date < current_date
    or input_preferred_time_period not in (
      'morning',
      'afternoon',
      'evening'
    )
  then
    raise exception 'invalid_request';
  end if;

  -- Customer must select at least one priced catalog service.
  if input_catalog_services is null
    or jsonb_typeof(input_catalog_services) <> 'array'
    or jsonb_array_length(input_catalog_services) = 0
    or jsonb_array_length(input_catalog_services) > 20
  then
    raise exception 'invalid_catalog_services';
  end if;

  -- Main category must exist and be visible.
  select *
  into selected_category
  from public.service_catalog_items
  where id = input_catalog_item_id
    and parent_id is null
    and is_visible = true;

  if not found then
    raise exception 'invalid_catalog_category';
  end if;

  -- Reject duplicate service IDs.
  select
    count(*),
    count(distinct value->>'id')
  into
    requested_count,
    distinct_count
  from jsonb_array_elements(input_catalog_services);

  if requested_count <> distinct_count then
    raise exception 'duplicate_catalog_service';
  end if;

  -- Validate every selected catalog service before creating the request.
  for service_entry in
    select value
    from jsonb_array_elements(input_catalog_services)
  loop
    begin
      service_id := (service_entry->>'id')::uuid;
      service_quantity :=
        coalesce((service_entry->>'quantity')::numeric, 1);
    exception
      when others then
        raise exception 'invalid_catalog_service';
    end;

    if service_quantity <= 0
      or service_quantity > 100
    then
      raise exception 'invalid_catalog_quantity';
    end if;

    select *
    into selected_service
    from public.service_catalog_services
    where id = service_id
      and service_catalog_item_id = input_catalog_item_id
      and is_active = true;

    if not found then
      raise exception 'invalid_catalog_service';
    end if;
  end loop;

  -- Create the service request.
  insert into public.service_requests(
    customer_name,
    phone,
    customer_email,
    service_type,
    issue_type,
    problem_description,
    city,
    address,
    latitude,
    longitude,
    preferred_date,
    preferred_time_period,
    customer_id,
    landing_page,
    referrer,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    gclid,
    wbraid,
    gbraid,
    first_touch_at
  )
  values(
    trim(input_name),
    trim(input_phone),
    nullif(lower(trim(input_email)), ''),

    -- Preserve the existing text field for compatibility.
    selected_category.name,

    trim(input_issue_type),
    trim(input_problem),
    trim(input_city),
    trim(input_address),
    input_latitude,
    input_longitude,
    input_preferred_date,
    input_preferred_time_period,
    auth.uid(),

    nullif(left(trim(coalesce(input_landing_page, '')), 2048), ''),
    nullif(left(trim(coalesce(input_referrer, '')), 2048), ''),
    nullif(left(trim(coalesce(input_utm_source, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_medium, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_campaign, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_content, '')), 255), ''),
    nullif(left(trim(coalesce(input_utm_term, '')), 255), ''),
    nullif(left(trim(coalesce(input_gclid, '')), 512), ''),
    nullif(left(trim(coalesce(input_wbraid, '')), 512), ''),
    nullif(left(trim(coalesce(input_gbraid, '')), 512), ''),
    input_first_touch_at
  )
  returning *
  into request_record;

  -- Snapshot every selected service and its current VAT-inclusive pricing.
  for service_entry in
    select value
    from jsonb_array_elements(input_catalog_services)
  loop
    service_id := (service_entry->>'id')::uuid;
    service_quantity :=
      coalesce((service_entry->>'quantity')::numeric, 1);

    select *
    into strict selected_service
    from public.service_catalog_services
    where id = service_id
      and service_catalog_item_id = input_catalog_item_id
      and is_active = true;

    insert into public.service_request_items(
      service_request_id,
      catalog_service_id,
      service_name,
      quantity,
      net_unit_price,
      tax_rate,
      gross_unit_price,
      item_source
    )
    values(
      request_record.id,
      selected_service.id,
      selected_service.name,
      service_quantity,
      selected_service.net_price,
      selected_service.tax_rate,
      selected_service.gross_price,
      'customer_request'
    );
  end loop;

  return query
  select
    request_record.id,
    request_record.upload_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_service_request_with_images(input_name text, input_phone text, input_email text, input_service text, input_problem text, input_city text, input_address text, input_latitude double precision, input_longitude double precision)
 RETURNS TABLE(request_id uuid, request_upload_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if nullif(trim(input_name),'') is null or public.normalized_sa_mobile(input_phone) is null
 or nullif(trim(input_email),'') is null or nullif(trim(input_service),'') is null
 or nullif(trim(input_problem),'') is null or nullif(trim(input_city),'') is null or nullif(trim(input_address),'') is null
 or input_latitude not between -90 and 90 or input_longitude not between -180 and 180 then raise exception 'invalid_request'; end if;
 return query
 insert into public.service_requests(customer_name,phone,customer_email,service_type,problem_description,city,address,latitude,longitude,customer_id)
 values(trim(input_name),trim(input_phone),lower(trim(input_email)),trim(input_service),trim(input_problem),trim(input_city),trim(input_address),input_latitude,input_longitude,auth.uid())
 returning id,upload_token;
end; $function$;

CREATE OR REPLACE FUNCTION public.submit_warranty_claim(target_service_request_id uuid, claim_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare claim_id uuid;
begin
  if nullif(trim(claim_description),'') is null then raise exception 'warranty_description_required'; end if;
  if not exists(select 1 from public.service_requests where id=target_service_request_id and customer_id=auth.uid() and workflow_stage='completed') then raise exception 'warranty_request_not_eligible'; end if;
  insert into public.warranty_claims(service_request_id,customer_id,description) values(target_service_request_id,auth.uid(),trim(claim_description)) returning id into claim_id;
  return claim_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.submit_warranty_claim(target_service_request_id uuid, target_invoice_line_item_id uuid, claim_description text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  claim_id uuid;
  eligible_invoice_id uuid;
begin
  if nullif(trim(claim_description),'') is null or char_length(trim(claim_description)) > 4000 then
    raise exception 'warranty_description_required';
  end if;

  select invoice.id into eligible_invoice_id
  from public.invoice_line_items line
  join public.invoices invoice on invoice.id = line.invoice_id
  where line.id = target_invoice_line_item_id
    and invoice.service_request_id = target_service_request_id
    and invoice.customer_id = auth.uid()
    and invoice.status = 'issued'
    and invoice.issued_at is not null
    and line.warranty_days > 0
    and now() <= invoice.issued_at + make_interval(days => line.warranty_days);
  if eligible_invoice_id is null then raise exception 'warranty_request_not_eligible'; end if;

  insert into public.warranty_claims(
    service_request_id,customer_id,invoice_id,invoice_line_item_id,description
  ) values (
    target_service_request_id,auth.uid(),eligible_invoice_id,target_invoice_line_item_id,trim(claim_description)
  ) returning id into claim_id;
  return claim_id;
exception when unique_violation then
  raise exception 'warranty_claim_already_open';
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_service_request_workflow(target_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare stage text; next_stage text; legacy text;
begin
 select workflow_stage into stage from public.service_requests where id = target_request_id for update;
 if not found then return; end if;
 next_stage := stage;
 if stage in ('awaiting_assignment','assigned','technician_accepted') then
  if exists (select 1 from public.service_request_assignments where service_request_id = target_request_id and status = 'accepted') then next_stage := 'technician_accepted';
  elsif exists (select 1 from public.service_request_assignments where service_request_id = target_request_id and status = 'pending') then next_stage := 'assigned';
  else next_stage := 'awaiting_assignment'; end if;
 end if;
 legacy := case when next_stage = 'completed' then 'completed' when next_stage in ('customer_rejected','customer_cancelled','cancelled') then 'cancelled' when next_stage = 'awaiting_assignment' then 'new' else 'scheduled' end;
 update public.service_requests set workflow_stage = next_stage,status = legacy,workflow_updated_at = now() where id = target_request_id and (workflow_stage is distinct from next_stage or status is distinct from legacy);
 if next_stage = 'completed' then update public.service_request_assignments set status = 'completed',responded_at = coalesce(responded_at,now()) where service_request_id = target_request_id and status = 'accepted';
 elsif next_stage in ('customer_rejected','customer_cancelled','cancelled') then update public.service_request_assignments set status = 'cancelled',responded_at = coalesce(responded_at,now()) where service_request_id = target_request_id and status in ('pending','accepted'); end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.technician_attach_service_request_image(target_request_id uuid, target_stage text, target_storage_path text, target_content_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_technician_id uuid;
begin
  if target_stage not in ('technician_arrival','technician_completion') then raise exception 'invalid_attachment_stage'; end if;
  if target_content_type not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_image_type'; end if;

  select t.id into v_technician_id
    from public.technicians t
   where t.profile_id = auth.uid() and t.is_active;
  if v_technician_id is null then raise exception 'technician_not_found'; end if;

  if not exists(
    select 1
      from public.service_requests r
      join public.service_request_assignments a on a.service_request_id = r.id
     where r.id = target_request_id
       and r.workflow_stage = 'in_progress'
       and a.technician_id = v_technician_id
       and a.status = 'accepted'
  ) then raise exception 'accepted_assignment_not_found'; end if;

  if split_part(target_storage_path,'/',1) <> target_request_id::text
     or split_part(target_storage_path,'/',2) <> v_technician_id::text
     or split_part(target_storage_path,'/',3) <> target_stage then
    raise exception 'invalid_image_path';
  end if;

  if (select count(*) from public.service_request_attachments
       where service_request_id = target_request_id and attachment_stage = target_stage) >= 3 then
    raise exception 'attachment_limit_reached';
  end if;
  if not exists(select 1 from storage.objects where bucket_id = 'request-images' and name = target_storage_path) then
    raise exception 'image_not_uploaded';
  end if;

  insert into public.service_request_attachments(service_request_id, storage_path, content_type, attachment_stage, uploaded_by)
  values(target_request_id, target_storage_path, target_content_type, target_stage, auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION public.technician_complete_service_request(target_service_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_technician_id uuid;
  assignment_found boolean;
  request_status text;
BEGIN
  SELECT id
    INTO current_technician_id
  FROM public.technicians
  WHERE profile_id = auth.uid()
    AND is_active = true;

  IF current_technician_id IS NULL THEN
    RAISE EXCEPTION 'technician_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.service_request_assignments a
    WHERE a.service_request_id = target_service_request_id
      AND a.technician_id = current_technician_id
      AND a.status = 'accepted'
  ),
  r.status
  INTO assignment_found, request_status
  FROM public.service_requests r
  WHERE r.id = target_service_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_request_not_found';
  END IF;

  IF NOT assignment_found THEN
    RAISE EXCEPTION 'accepted_assignment_not_found';
  END IF;

  IF request_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'request_already_closed';
  END IF;

  UPDATE public.service_requests
  SET status = 'completed'
  WHERE id = target_service_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.technician_record_visit_outcome(target_service_request_id uuid, new_outcome text, outcome_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare tech_id uuid; stage text; target_stage text;
begin
 if new_outcome not in ('completed','needs_followup','reschedule_requested','unable_to_complete') then raise exception 'invalid_visit_outcome'; end if;
 select id into tech_id from public.technicians where profile_id = auth.uid() and is_active;
 if tech_id is null then raise exception 'technician_not_found'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if stage <> 'in_progress' then raise exception 'invalid_workflow_transition'; end if;
 if not exists (select 1 from public.service_request_assignments where service_request_id = target_service_request_id and technician_id = tech_id and status = 'accepted') then raise exception 'accepted_assignment_not_found'; end if;
 target_stage := case when new_outcome = 'completed' then 'awaiting_completion_review' else new_outcome end;
 update public.service_requests set workflow_stage = target_stage, visit_outcome = new_outcome,
   visit_notes = nullif(trim(outcome_notes),''), workflow_updated_at = now()
 where id = target_service_request_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.technician_record_visit_outcome(target_service_request_id uuid, new_outcome text, outcome_notes text DEFAULT NULL::text, selected_parts jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare tech_id uuid; stage text; target_stage text;
begin
 if new_outcome not in ('completed','needs_followup','reschedule_requested','unable_to_complete') then raise exception 'invalid_visit_outcome'; end if;
 if jsonb_typeof(coalesce(selected_parts,'[]'::jsonb)) <> 'array' then raise exception 'invalid_requested_parts'; end if;
 if new_outcome = 'needs_followup' and jsonb_array_length(coalesce(selected_parts,'[]'::jsonb)) = 0 then raise exception 'requested_parts_required'; end if;
 select id into tech_id from public.technicians where profile_id = auth.uid() and is_active;
 if tech_id is null then raise exception 'technician_not_found'; end if;
 select workflow_stage into stage from public.service_requests where id = target_service_request_id for update;
 if stage <> 'in_progress' then raise exception 'invalid_workflow_transition'; end if;
 if not exists (select 1 from public.service_request_assignments where service_request_id = target_service_request_id and technician_id = tech_id and status = 'accepted') then raise exception 'accepted_assignment_not_found'; end if;
 target_stage := case when new_outcome = 'completed' then 'awaiting_completion_review' else new_outcome end;
 update public.service_requests set workflow_stage = target_stage, visit_outcome = new_outcome, visit_notes = nullif(trim(outcome_notes),''), requested_parts = case when new_outcome='needs_followup' then coalesce(selected_parts,'[]'::jsonb) else '[]'::jsonb end, workflow_updated_at = now() where id = target_service_request_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.technician_respond_to_assignment(target_assignment_id uuid, new_status text, response_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare technician_user_id uuid; current_status text;
begin
 if new_status not in ('accepted','rejected') then raise exception 'invalid_assignment_response'; end if;
 if new_status = 'rejected' and nullif(trim(coalesce(response_notes,'')),'') is null then raise exception 'rejection_reason_required'; end if;
 select t.profile_id,a.status into technician_user_id,current_status
 from public.service_request_assignments a join public.technicians t on t.id=a.technician_id where a.id=target_assignment_id for update;
 if technician_user_id is null then raise exception 'assignment_not_found'; end if;
 if technician_user_id <> auth.uid() then raise exception 'insufficient_privilege'; end if;
 if current_status <> 'pending' then raise exception 'assignment_not_pending'; end if;
 update public.service_request_assignments set status=new_status,responded_at=now(),notes=nullif(left(trim(coalesce(response_notes,'')),500),'') where id=target_assignment_id;
end $function$;

CREATE OR REPLACE FUNCTION public.technician_submit_change_request(target_service_request_id uuid, change_notes text DEFAULT NULL::text, selected_items jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  tech_id uuid;
  current_stage text;
  new_change_request_id uuid;

  item jsonb;
  item_type_value text;
  catalog_id uuid;
  item_quantity numeric(10,2);
  other_name text;

  catalog_service public.service_catalog_services%rowtype;
  catalog_part public.service_catalog_parts%rowtype;
begin
  -- Selected items must be a non-empty JSON array.
  if selected_items is null
    or jsonb_typeof(selected_items) <> 'array'
    or jsonb_array_length(selected_items) = 0
    or jsonb_array_length(selected_items) > 30
  then
    raise exception 'invalid_change_items';
  end if;

if exists (
  select 1
  from (
    select
      value->>'item_type' as item_type,
      value->>'catalog_id' as catalog_id,
      count(*) as item_count
    from jsonb_array_elements(selected_items)
    where value->>'item_type' in ('service', 'part')
    group by
      value->>'item_type',
      value->>'catalog_id'
    having count(*) > 1
  ) duplicates
) then
  raise exception 'duplicate_change_item';
end if;

  -- Resolve the authenticated active technician.
  select id
  into tech_id
  from public.technicians
  where profile_id = auth.uid()
    and is_active = true
  limit 1;

  if tech_id is null then
    raise exception 'technician_not_found';
  end if;

  -- Lock the service request while validating the workflow.
  select workflow_stage
  into current_stage
  from public.service_requests
  where id = target_service_request_id
  for update;

  if not found then
    raise exception 'service_request_not_found';
  end if;

  if current_stage <> 'in_progress' then
    raise exception 'invalid_workflow_transition';
  end if;

  -- Technician must currently own an accepted assignment.
  if not exists (
    select 1
    from public.service_request_assignments
    where service_request_id = target_service_request_id
      and technician_id = tech_id
      and status = 'accepted'
  ) then
    raise exception 'accepted_assignment_not_found';
  end if;

  -- Prevent multiple simultaneously submitted change requests.
  if exists (
    select 1
    from public.service_request_change_requests
    where service_request_id = target_service_request_id
      and status = 'submitted'
  ) then
    raise exception 'change_request_already_submitted';
  end if;

  -- Validate every item before creating the change request.
  for item in
    select value
    from jsonb_array_elements(selected_items)
  loop
    item_type_value := item->>'item_type';

    begin
      item_quantity :=
        coalesce((item->>'quantity')::numeric, 1);
    exception
      when others then
        raise exception 'invalid_change_item_quantity';
    end;

    if item_quantity <= 0
      or item_quantity > 100
    then
      raise exception 'invalid_change_item_quantity';
    end if;

    if item_type_value = 'service' then
      begin
        catalog_id := (item->>'catalog_id')::uuid;
      exception
        when others then
          raise exception 'invalid_catalog_service';
      end;

      perform 1
      from public.service_catalog_services
      where id = catalog_id
        and is_active = true;

      if not found then
        raise exception 'invalid_catalog_service';
      end if;

    elsif item_type_value = 'part' then
      begin
        catalog_id := (item->>'catalog_id')::uuid;
      exception
        when others then
          raise exception 'invalid_catalog_part';
      end;

      perform 1
      from public.service_catalog_parts
      where id = catalog_id
        and is_active = true;

      if not found then
        raise exception 'invalid_catalog_part';
      end if;

    elsif item_type_value = 'other' then
      other_name :=
        nullif(trim(coalesce(item->>'name', '')), '');

      if other_name is null
        or char_length(other_name) > 160
      then
        raise exception 'invalid_other_item';
      end if;

    else
      raise exception 'invalid_change_item_type';
    end if;
  end loop;

  -- Create the parent change request.
  insert into public.service_request_change_requests (
    service_request_id,
    technician_id,
    status,
    notes
  )
  values (
    target_service_request_id,
    tech_id,
    'submitted',
    nullif(trim(coalesce(change_notes, '')), '')
  )
  returning id
  into new_change_request_id;

  -- Create immutable server-side price snapshots.
  for item in
    select value
    from jsonb_array_elements(selected_items)
  loop
    item_type_value := item->>'item_type';
    item_quantity :=
      coalesce((item->>'quantity')::numeric, 1);

    if item_type_value = 'service' then
      catalog_id := (item->>'catalog_id')::uuid;

      select *
      into strict catalog_service
      from public.service_catalog_services
      where id = catalog_id
        and is_active = true;

      insert into public.service_request_change_items (
        change_request_id,
        item_type,
        catalog_service_id,
        catalog_part_id,
        item_name,
        quantity,
        net_unit_price,
        tax_rate,
        gross_unit_price
      )
      values (
        new_change_request_id,
        'service',
        catalog_service.id,
        null,
        catalog_service.name,
        item_quantity,
        catalog_service.net_price,
        catalog_service.tax_rate,
        catalog_service.gross_price
      );

    elsif item_type_value = 'part' then
      catalog_id := (item->>'catalog_id')::uuid;

      select *
      into strict catalog_part
      from public.service_catalog_parts
      where id = catalog_id
        and is_active = true;

      insert into public.service_request_change_items (
        change_request_id,
        item_type,
        catalog_service_id,
        catalog_part_id,
        item_name,
        quantity,
        net_unit_price,
        tax_rate,
        gross_unit_price
      )
      values (
        new_change_request_id,
        'part',
        null,
        catalog_part.id,
        catalog_part.name,
        item_quantity,
        catalog_part.default_price,
        catalog_part.tax_rate,
        catalog_part.gross_price
      );

    else
      other_name :=
        trim(item->>'name');

      -- Unknown/custom items are intentionally unpriced.
      -- Administration will price them during quote review.
      insert into public.service_request_change_items (
        change_request_id,
        item_type,
        catalog_service_id,
        catalog_part_id,
        item_name,
        quantity,
        net_unit_price,
        tax_rate,
        gross_unit_price
      )
      values (
        new_change_request_id,
        'other',
        null,
        null,
        other_name,
        item_quantity,
        0,
        0,
        0
      );
    end if;
  end loop;

  -- Send the request to administration for quote review.
  update public.service_requests
  set
    workflow_stage = 'awaiting_admin_quote',
    visit_outcome = 'needs_followup',
    visit_notes = nullif(trim(coalesce(change_notes, '')), ''),
    workflow_updated_at = now()
  where id = target_service_request_id;

  return new_change_request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_new_service_request_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.sync_service_request_workflow(new.id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_sync_service_request_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'DELETE' then
    perform public.sync_service_request_workflow(old.service_request_id);
    return old;
  end if;

  perform public.sync_service_request_workflow(new.service_request_id);
  return new;
end;
$function$;

-- 11. Triggers
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER profiles_check_mobile BEFORE INSERT OR UPDATE OF phone ON profiles FOR EACH ROW EXECUTE FUNCTION check_profile_mobile();
CREATE TRIGGER service_catalog_parts_tax_rate_trigger BEFORE INSERT OR UPDATE OF default_price ON service_catalog_parts FOR EACH ROW EXECUTE FUNCTION set_catalog_part_tax_rate();
CREATE TRIGGER service_catalog_services_tax_rate_trigger BEFORE INSERT OR UPDATE OF net_price ON service_catalog_services FOR EACH ROW EXECUTE FUNCTION set_catalog_service_tax_rate();
CREATE TRIGGER prevent_assignment_on_closed_request BEFORE INSERT OR UPDATE OF status ON service_request_assignments FOR EACH ROW EXECUTE FUNCTION prevent_assignment_on_closed_request();
CREATE TRIGGER service_request_assignment_audit_trigger AFTER INSERT OR UPDATE OF status ON service_request_assignments FOR EACH ROW EXECUTE FUNCTION log_assignment_audit_event();
CREATE TRIGGER service_request_assignment_workflow_trigger AFTER INSERT OR DELETE OR UPDATE OF status ON service_request_assignments FOR EACH ROW EXECUTE FUNCTION trg_sync_service_request_workflow();
CREATE TRIGGER service_request_event_notification_trigger AFTER INSERT ON service_request_events FOR EACH ROW EXECUTE FUNCTION notify_service_request_event();
CREATE TRIGGER finalize_closed_service_request_assignments_trigger AFTER UPDATE OF workflow_stage ON service_requests FOR EACH ROW WHEN (old.workflow_stage IS DISTINCT FROM new.workflow_stage AND (new.workflow_stage = ANY (ARRAY['completed'::text, 'customer_rejected'::text, 'customer_cancelled'::text, 'cancelled'::text]))) EXECUTE FUNCTION finalize_closed_service_request_assignments();
CREATE TRIGGER service_request_created_event_trigger AFTER INSERT ON service_requests FOR EACH ROW EXECUTE FUNCTION log_new_service_request();
CREATE TRIGGER service_request_initial_workflow_trigger AFTER INSERT ON service_requests FOR EACH ROW EXECUTE FUNCTION trg_sync_new_service_request_workflow();
CREATE TRIGGER service_request_stage_event_trigger AFTER UPDATE OF workflow_stage ON service_requests FOR EACH ROW EXECUTE FUNCTION log_service_request_stage_change();
CREATE TRIGGER service_request_status_workflow_trigger AFTER UPDATE OF status, workflow_stage, visit_outcome ON service_requests FOR EACH ROW EXECUTE FUNCTION trg_sync_new_service_request_workflow();
CREATE TRIGGER site_footer_content_updated_at BEFORE UPDATE ON site_footer_content FOR EACH ROW EXECUTE FUNCTION set_site_footer_content_updated_at();
CREATE TRIGGER technicians_set_updated_at BEFORE UPDATE ON technicians FOR EACH ROW EXECUTE FUNCTION set_technicians_updated_at();

-- 12. RLS enablement
alter table public."business_finance_settings" enable row level security;
alter table public."contact_messages" enable row level security;
alter table public."dashboard_display_settings" enable row level security;
alter table public."drive_connection" enable row level security;
alter table public."drive_syncs" enable row level security;
alter table public."finance_expenses" enable row level security;
alter table public."invoice_line_items" enable row level security;
alter table public."invoice_payments" enable row level security;
alter table public."invoices" enable row level security;
alter table public."notifications" enable row level security;
alter table public."profiles" enable row level security;
alter table public."service_catalog_items" enable row level security;
alter table public."service_catalog_parts" enable row level security;
alter table public."service_catalog_services" enable row level security;
alter table public."service_request_assignments" enable row level security;
alter table public."service_request_attachments" enable row level security;
alter table public."service_request_change_items" enable row level security;
alter table public."service_request_change_requests" enable row level security;
alter table public."service_request_events" enable row level security;
alter table public."service_request_items" enable row level security;
alter table public."service_request_payments" enable row level security;
alter table public."service_request_quotes" enable row level security;
alter table public."service_requests" enable row level security;
alter table public."site_editor_versions" enable row level security;
alter table public."site_footer_content" enable row level security;
alter table public."site_section_items" enable row level security;
alter table public."site_sections" enable row level security;
alter table public."site_settings" enable row level security;
alter table public."technicians" enable row level security;
alter table public."warranty_claims" enable row level security;

-- 13. RLS policies
create policy "finance_settings_managers" on public."business_finance_settings" as permissive for all to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "admins manage contact messages" on public."contact_messages" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "authenticated users read dashboard display settings" on public."dashboard_display_settings" as permissive for select to authenticated using (true);
create policy "site administrators edit dashboard display settings" on public."dashboard_display_settings" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "drive_connection_managers" on public."drive_connection" as permissive for all to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "drive_syncs_managers" on public."drive_syncs" as permissive for all to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "finance_expenses_managers" on public."finance_expenses" as permissive for select to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "customers read issued invoice lines" on public."invoice_line_items" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM invoices invoice
  WHERE ((invoice.id = invoice_line_items.invoice_id) AND (invoice.status = 'issued'::text) AND (invoice.customer_id = ( SELECT auth.uid() AS uid))))));
create policy "finance managers read invoice lines" on public."invoice_line_items" as permissive for select to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "invoice_payments_managers" on public."invoice_payments" as permissive for select to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "invoices_customer_read" on public."invoices" as permissive for select to authenticated using (((status = 'issued'::text) AND (customer_id = ( SELECT auth.uid() AS uid))));
create policy "invoices_manager_read" on public."invoices" as permissive for select to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "read own notifications" on public."notifications" as permissive for select to authenticated using ((recipient_id = ( SELECT auth.uid() AS uid)));
create policy "customers read own profile" on public."profiles" as permissive for select to authenticated using ((id = auth.uid()));
create policy "customers update own profile" on public."profiles" as permissive for update to authenticated using ((id = auth.uid())) with check (((id = auth.uid()) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = auth.uid())))));
create policy "staff read all profiles" on public."profiles" as permissive for select to authenticated using ((current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]) OR (id = auth.uid())));
create policy "admins manage catalog items" on public."service_catalog_items" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "public reads visible catalog items" on public."service_catalog_items" as permissive for select to anon, authenticated using ((is_visible OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])));
create policy "admins manage catalog parts" on public."service_catalog_parts" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "staff read catalog parts" on public."service_catalog_parts" as permissive for select to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "technicians read active catalog parts" on public."service_catalog_parts" as permissive for select to authenticated using ((is_active AND current_user_has_role(ARRAY['technician'::app_role])));
create policy "admins manage catalog services" on public."service_catalog_services" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "public reads active catalog services" on public."service_catalog_services" as permissive for select to anon, authenticated using ((is_active OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])));
create policy "assigned technician can respond to assignment" on public."service_request_assignments" as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM technicians t
  WHERE ((t.id = service_request_assignments.technician_id) AND (t.profile_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM technicians t
  WHERE ((t.id = service_request_assignments.technician_id) AND (t.profile_id = ( SELECT auth.uid() AS uid))))));
create policy "assigned technician can view own assignments" on public."service_request_assignments" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM technicians t
  WHERE ((t.id = service_request_assignments.technician_id) AND (t.profile_id = ( SELECT auth.uid() AS uid))))));
create policy "management can create assignments" on public."service_request_assignments" as permissive for insert to authenticated with check ((current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]) AND ((assigned_by IS NULL) OR (assigned_by = ( SELECT auth.uid() AS uid)))));
create policy "management can update assignments" on public."service_request_assignments" as permissive for update to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "management can view assignments" on public."service_request_assignments" as permissive for select to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "participants read attachments" on public."service_request_attachments" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM service_requests r
  WHERE ((r.id = service_request_attachments.service_request_id) AND ((r.customer_id = ( SELECT auth.uid() AS uid)) OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]) OR (EXISTS ( SELECT 1
           FROM (service_request_assignments a
             JOIN technicians t ON ((t.id = a.technician_id)))
          WHERE ((a.service_request_id = r.id) AND (t.profile_id = ( SELECT auth.uid() AS uid))))))))));
create policy "admins read change request items" on public."service_request_change_items" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM service_request_change_requests change_request
  WHERE ((change_request.id = service_request_change_items.change_request_id) AND current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])))));
create policy "technicians read own change request items" on public."service_request_change_items" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (service_request_change_requests change_request
     JOIN technicians technician ON ((technician.id = change_request.technician_id)))
  WHERE ((change_request.id = service_request_change_items.change_request_id) AND (technician.profile_id = auth.uid())))));
create policy "admins read change requests" on public."service_request_change_requests" as permissive for select to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "assigned technicians read own change requests" on public."service_request_change_requests" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM technicians technician
  WHERE ((technician.id = service_request_change_requests.technician_id) AND (technician.profile_id = auth.uid())))));
create policy "participants read events" on public."service_request_events" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM service_requests r
  WHERE ((r.id = service_request_events.service_request_id) AND ((r.customer_id = ( SELECT auth.uid() AS uid)) OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]) OR (EXISTS ( SELECT 1
           FROM (service_request_assignments a
             JOIN technicians t ON ((t.id = a.technician_id)))
          WHERE ((a.service_request_id = r.id) AND (t.profile_id = ( SELECT auth.uid() AS uid))))))))));
create policy "admins read service request items" on public."service_request_items" as permissive for select to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "assigned technicians read service request items" on public."service_request_items" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (service_request_assignments assignment
     JOIN technicians technician ON ((technician.id = assignment.technician_id)))
  WHERE ((assignment.service_request_id = service_request_items.service_request_id) AND (technician.profile_id = auth.uid()) AND (assignment.status = ANY (ARRAY['pending'::text, 'accepted'::text, 'completed'::text]))))));
create policy "service_request_payments_managers_read" on public."service_request_payments" as permissive for select to authenticated using (current_user_has_role(ARRAY['admin_manager'::app_role, 'super_admin'::app_role]));
create policy "participants read quotes" on public."service_request_quotes" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM service_requests r
  WHERE ((r.id = service_request_quotes.service_request_id) AND ((r.customer_id = ( SELECT auth.uid() AS uid)) OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]) OR (EXISTS ( SELECT 1
           FROM (service_request_assignments a
             JOIN technicians t ON ((t.id = a.technician_id)))
          WHERE ((a.service_request_id = r.id) AND (t.profile_id = ( SELECT auth.uid() AS uid))))))))));
create policy "assigned technicians can read their service requests" on public."service_requests" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (service_request_assignments a
     JOIN technicians t ON ((t.id = a.technician_id)))
  WHERE ((a.service_request_id = service_requests.id) AND (t.profile_id = auth.uid())))));
create policy "customers read own requests and staff read requests" on public."service_requests" as permissive for select to authenticated using (((customer_id = auth.uid()) OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])));
create policy "maintenance staff update service requests" on public."service_requests" as permissive for update to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "public can submit service requests" on public."service_requests" as permissive for insert to anon, authenticated with check ((((auth.uid() IS NULL) AND (customer_id IS NULL)) OR (customer_id = auth.uid())));
create policy "site admins manage editor versions" on public."site_editor_versions" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "Admins can insert footer content" on public."site_footer_content" as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]))))));
create policy "Admins can update footer content" on public."site_footer_content" as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])))))) with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]))))));
create policy "Public can read footer content" on public."site_footer_content" as permissive for select to anon, authenticated using (true);
create policy "admins edit items" on public."site_section_items" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "public reads visible items" on public."site_section_items" as permissive for select to anon, authenticated using (((is_visible AND (EXISTS ( SELECT 1
   FROM site_sections s
  WHERE ((s.id = site_section_items.section_id) AND s.is_visible)))) OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])));
create policy "admins edit sections" on public."site_sections" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "public reads visible sections" on public."site_sections" as permissive for select to anon, authenticated using ((is_visible OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])));
create policy "admins edit settings" on public."site_settings" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "public reads settings" on public."site_settings" as permissive for select to anon, authenticated using (true);
create policy "management can manage technicians" on public."technicians" as permissive for all to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "staff read technicians" on public."technicians" as permissive for select to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "technicians can view their own technician record" on public."technicians" as permissive for select to authenticated using ((profile_id = ( SELECT auth.uid() AS uid)));
create policy "admins update warranty claims" on public."warranty_claims" as permissive for update to authenticated using (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])) with check (current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role]));
create policy "customers read own warranty claims" on public."warranty_claims" as permissive for select to authenticated using (((customer_id = ( SELECT auth.uid() AS uid)) OR current_user_has_role(ARRAY['maintenance_manager'::app_role, 'admin_manager'::app_role, 'super_admin'::app_role])));

-- 14. Least-privilege grants (intentional difference from live broad ACLs)
-- Explicitly remove platform/default PUBLIC EXECUTE and table grants before selective grants.
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
-- Auth trigger and SQL helper functions execute under the required owner context.
-- service_role retains DML for server-side integrations; no TRUNCATE/TRIGGER grants.
grant SELECT on public."service_catalog_items" to anon;
grant SELECT on public."service_catalog_services" to anon;
grant SELECT on public."site_footer_content" to anon;
grant SELECT on public."site_section_items" to anon;
grant SELECT on public."site_sections" to anon;
grant SELECT on public."site_settings" to anon;
grant SELECT, INSERT, UPDATE, DELETE on public."business_finance_settings" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."contact_messages" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."dashboard_display_settings" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."drive_connection" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."drive_syncs" to authenticated;
grant SELECT on public."finance_expenses" to authenticated;
grant SELECT on public."invoice_line_items" to authenticated;
grant SELECT on public."invoice_payments" to authenticated;
grant SELECT on public."invoices" to authenticated;
grant SELECT on public."notifications" to authenticated;
grant SELECT on public."profiles" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."service_catalog_items" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."service_catalog_parts" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."service_catalog_services" to authenticated;
grant UPDATE, SELECT, INSERT on public."service_request_assignments" to authenticated;
grant SELECT on public."service_request_attachments" to authenticated;
grant SELECT on public."service_request_change_items" to authenticated;
grant SELECT on public."service_request_change_requests" to authenticated;
grant SELECT on public."service_request_events" to authenticated;
grant SELECT on public."service_request_items" to authenticated;
grant SELECT on public."service_request_payments" to authenticated;
grant SELECT on public."service_request_quotes" to authenticated;
grant SELECT, UPDATE on public."service_requests" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."site_editor_versions" to authenticated;
grant INSERT, UPDATE, SELECT on public."site_footer_content" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."site_section_items" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."site_sections" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."site_settings" to authenticated;
grant SELECT, INSERT, UPDATE, DELETE on public."technicians" to authenticated;
grant UPDATE, SELECT on public."warranty_claims" to authenticated;
grant update (avatar_path, full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public."business_finance_settings", public."contact_messages", public."dashboard_display_settings", public."drive_connection", public."drive_syncs", public."finance_expenses", public."invoice_line_items", public."invoice_payments", public."invoices", public."notifications", public."profiles", public."service_catalog_items", public."service_catalog_parts", public."service_catalog_services", public."service_request_assignments", public."service_request_attachments", public."service_request_change_items", public."service_request_change_requests", public."service_request_events", public."service_request_items", public."service_request_payments", public."service_request_quotes", public."service_requests", public."site_editor_versions", public."site_footer_content", public."site_section_items", public."site_sections", public."site_settings", public."technicians", public."warranty_claims" to service_role;
grant execute on all functions in schema public to service_role;
-- Identity sequence permissions for roles that may insert invoice rows directly.
grant usage, select on sequence public.invoices_invoice_number_seq to service_role;
grant execute on function private."can_upload_request_image"(object_name text),
  public."attach_service_request_image"(target_request_id uuid, target_upload_token uuid, target_storage_path text, target_content_type text),
  public."normalized_sa_mobile"(raw_phone text),
  public."submit_contact_message"(sender_name text, sender_phone text, sender_email text, message_subject text, message_body text),
  public."submit_service_request_v4"(input_name text, input_phone text, input_email text, input_catalog_item_id uuid, input_catalog_services jsonb, input_issue_type text, input_problem text, input_city text, input_address text, input_latitude double precision, input_longitude double precision, input_preferred_date date, input_preferred_time_period text, input_landing_page text, input_referrer text, input_utm_source text, input_utm_medium text, input_utm_campaign text, input_utm_content text, input_utm_term text, input_gclid text, input_wbraid text, input_gbraid text, input_first_touch_at timestamp with time zone) to anon;
grant execute on function private."can_upload_request_image"(object_name text),
  private."can_upload_technician_request_image"(object_name text),
  public."admin_add_technician"(target_profile_id uuid, target_service_types text[], target_notes text),
  public."admin_advance_service_request"(target_service_request_id uuid, new_stage text),
  public."admin_assign_service_request"(target_service_request_id uuid, target_technician_id uuid),
  public."admin_cancel_service_request"(target_service_request_id uuid, reason text),
  public."admin_confirm_service_request_appointment"(target_service_request_id uuid, appointment_date date, appointment_time_period text, notes text),
  public."admin_get_user_details"(target_user_id uuid),
  public."admin_reassign_service_request"(target_service_request_id uuid, target_technician_id uuid, reassignment_reason text),
  public."admin_set_service_request_archive"(target_service_request_id uuid, should_archive boolean),
  public."admin_submit_service_request_quote"(target_service_request_id uuid, quote_description text, quote_line_items jsonb),
  public."admin_update_contact_message_status"(target_message_id uuid, new_status text),
  public."admin_update_technician"(target_technician_id uuid, target_service_types text[], target_is_active boolean, target_notes text),
  public."admin_update_user_role"(target_user_id uuid, new_role app_role, new_service_types text[]),
  public."admin_update_warranty_claim"(target_claim_id uuid, new_status text, new_admin_notes text),
  public."attach_service_request_image"(target_request_id uuid, target_upload_token uuid, target_storage_path text, target_content_type text),
  public."claim_verified_guest_service_requests"(),
  public."current_user_has_role"(required_roles app_role[]),
  public."customer_cancel_service_request"(target_service_request_id uuid, cancellation_reason text),
  public."customer_decide_service_request_quote"(target_quote_id uuid, approve boolean, decision_notes text),
  public."customer_get_active_warranty_items"(),
  public."customer_reject_repair"(target_service_request_id uuid, rejection_notes text),
  public."finance_get_invoice_list_summary"(),
  public."finance_get_summary"(),
  public."finance_mark_invoice_emailed"(p_invoice_id uuid),
  public."finance_record_expense"(p_category text, p_description text, p_amount numeric, p_expense_date date, p_payment_method text, p_vendor_name text, p_reference text, p_notes text, p_service_request_id uuid),
  public."finance_record_payment"(p_invoice_id uuid, p_amount numeric, p_method text, p_note text),
  public."finance_record_service_request_payment"(p_request_id uuid, p_amount numeric, p_payment_type text, p_method text, p_note text),
  public."finance_save_settings"(p_name text, p_address text, p_email text, p_tax_number text, p_tax_rate numeric, p_vat_registered boolean),
  public."finance_set_invoice_status"(p_invoice_id uuid, p_status text),
  public."finance_update_invoice_draft"(p_invoice_id uuid, p_work_summary text, p_lines jsonb),
  public."finance_void_expense"(p_expense_id uuid),
  public."finance_void_payment"(p_payment_id uuid),
  public."finance_void_service_request_payment"(p_payment_id uuid),
  public."mark_all_notifications_read"(),
  public."mark_notification_read"(target_notification_id uuid),
  public."normalized_sa_mobile"(raw_phone text),
  public."submit_contact_message"(sender_name text, sender_phone text, sender_email text, message_subject text, message_body text),
  public."submit_service_request_v4"(input_name text, input_phone text, input_email text, input_catalog_item_id uuid, input_catalog_services jsonb, input_issue_type text, input_problem text, input_city text, input_address text, input_latitude double precision, input_longitude double precision, input_preferred_date date, input_preferred_time_period text, input_landing_page text, input_referrer text, input_utm_source text, input_utm_medium text, input_utm_campaign text, input_utm_content text, input_utm_term text, input_gclid text, input_wbraid text, input_gbraid text, input_first_touch_at timestamp with time zone),
  public."submit_warranty_claim"(target_service_request_id uuid, target_invoice_line_item_id uuid, claim_description text),
  public."technician_attach_service_request_image"(target_request_id uuid, target_stage text, target_storage_path text, target_content_type text),
  public."technician_record_visit_outcome"(target_service_request_id uuid, new_outcome text, outcome_notes text, selected_parts jsonb),
  public."technician_respond_to_assignment"(target_assignment_id uuid, new_status text, response_notes text),
  public."technician_submit_change_request"(target_service_request_id uuid, change_notes text, selected_items jsonb) to authenticated;
-- Private finance helpers remain internal. Storage policies/buckets require separate approval.

-- 15. Review notes
-- No test fixture or ZATCA additions belong in this pre-ZATCA baseline.
-- Compare grants, policy behavior and auth/storage dependencies against the approved scope.
commit;
