# WEBSITE CONTEXT

## Project
Maintenance Website

## Goal
موقع تشغيلي بسيط وسريع لخدمات الصيانة العامة، يهدف إلى عرض الخدمات والأعمال المنفذة واستقبال طلبات الخدمة ووسائل التواصل.

## Repository
`rqmsa/maintenance-website`

## Separation Rule
هذا المستودع مستقل عن `maintenance-platform`. لا تتم إضافة جداول أو migrations أو كود خاص بالمنصة إلى هذا المستودع، ولا يتم تعديل مشروع Supabase الخاص بالمنصة أثناء تطوير الموقع.

## Supabase
- Project: `maintenance-website`
- Project ID: `wtmzvznsmitqmjgqwtnu`
- Region: `ap-southeast-1`
- URL: `https://wtmzvznsmitqmjgqwtnu.supabase.co`

## Initial Pages
- Home
- Services
- Works
- Request Service
- Contact

## Initial Service Categories
- Electricity
- Air Conditioning
- Plumbing
- Carpentry
- Other

## Initial Request Data
- customer name
- phone
- service type
- problem description
- city/address
- optional photo

## Architecture
Next.js + React + Tailwind CSS + Supabase + Vercel.

## Database Rule
Database changes must be represented as Supabase migration files under `supabase/migrations/`. Avoid ad-hoc production schema changes from the Dashboard.

## Security Rule
Only the Supabase Project URL and publishable key may be exposed to the browser. Secret/service-role credentials must never be committed to GitHub. Row Level Security must be enabled on application tables before production use.

## Current Status
- GitHub repository created.
- GitHub write access verified.
- Supabase project created and verified healthy.
- Application scaffold: pending.
- First database migration: pending.
- Vercel deployment: pending.
