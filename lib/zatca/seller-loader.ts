import type { SellerProfile } from './types.ts';
export type SellerRow = {
  id: string; is_active: boolean; legal_name: string | null; vat_number: string | null;
  registration_scheme: string | null; registration_number: string | null;
  street: string | null; building_number: string | null; district: string | null;
  city: string | null; postal_code: string | null; country_code: string | null;
  additional_number: string | null;
};
/** Narrow read-only port; callers authenticate administrators before supplying it. */
export interface SellerReadClient {
  from(table: 'business_tax_profiles'): {
    select(columns: string): { eq(column: 'is_active', value: true): PromiseLike<{data: SellerRow[] | null; error: unknown}> };
  };
}
export async function loadActiveSellerProfiles(client: SellerReadClient, projectRef: string): Promise<SellerProfile[]> {
  if (projectRef !== 'xpvwkelctzgidpycflzw' || typeof window !== 'undefined') throw new Error('Test server only');
  const result=await client.from('business_tax_profiles').select('id,is_active,legal_name,vat_number,registration_scheme,registration_number,street,building_number,district,city,postal_code,country_code,additional_number').eq('is_active',true);
  if (result.error || !result.data) throw new Error('Seller identity read failed');
  return result.data.map(p=>({id:p.id,active:p.is_active,legalName:p.legal_name??'',vatNumber:p.vat_number??'',registration:{scheme:p.registration_scheme??'',value:p.registration_number??''},address:{street:p.street??'',buildingNumber:p.building_number??'',district:p.district??'',city:p.city??'',postalCode:p.postal_code??'',countryCode:p.country_code??'',additionalNumber:p.additional_number}}));
}
