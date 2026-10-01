import 'server-only';
import { createClient as createPrivilegedClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '../supabase/server';
import { RpcPreparationAdapter, RUNTIME_PROJECT_REF, PersistenceError, type RpcClient, type SessionClient } from './persistence.ts';

/** Intentionally unconnected to routes/actions. Default disabled until a new review gate. */
export async function createZatcaPersistenceAdapter(): Promise<RpcPreparationAdapter> {
  const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(process.env.ZATCA_RUNTIME_PERSISTENCE_ENABLED!=='true' || projectUrl!==`https://${RUNTIME_PROJECT_REF}.supabase.co`)throw new PersistenceError('FORBIDDEN');
  const session=await createSessionClient();
  return RpcPreparationAdapter.create(session as unknown as SessionClient,(): RpcClient=>{
    const key=process.env.ZATCA_RUNTIME_SUPABASE_SERVICE_ROLE_KEY;
    if(!key)throw new PersistenceError('PERSISTENCE_UNAVAILABLE');
    return createPrivilegedClient(projectUrl,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}) as unknown as RpcClient;
  },projectUrl);
}
