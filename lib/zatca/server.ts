/** Internal server entry point. No route/action/UI invokes this module yet. */
import { build, fingerprint, validateFrozenSnapshot } from './preparation.ts';
import type { Document, PreparationInput, Result, Sources } from './types.ts';
/** Storage must reload all sources and CAS document.version in ONE transaction.
 * Historical validation commits use sources=null and compare the frozen document only.
 * This port is retained for local core tests; the RPC adapter is in persistence.ts.
 */
export interface PreparationStore {
  load(invoiceId: string): Promise<Sources>;
  readDocument(documentId: string): Promise<Document>;
  commit(expected: Document, sources: Sources | null, next: Document): Promise<boolean>;
}
export class PreparationService {
  constructor(private readonly store: PreparationStore, private readonly clock: () => string,
    private readonly access: { projectRef: string; role: 'admin_manager' | 'super_admin' }) {
    if (typeof window !== 'undefined') throw new Error('Server only');
    if (access.projectRef !== 'xpvwkelctzgidpycflzw' || !['admin_manager','super_admin'].includes(access.role)) throw new Error('Preparation access denied');
  }
  async run(id: string, input: PreparationInput, operation: 'prepare' | 'freeze' | 'validate'): Promise<Result<Document>> {
    const document=await this.store.readDocument(id);
    if (operation==='validate') {
      if(document.status!=='frozen') return {ok:false,blockers:[{code:'PREPARATION_STATE_INVALID',severity:'ERROR'}]};
      const validated=validateFrozenSnapshot(document);
      if(!validated.ok) return validated;
      const next: Document={...document,status:'canonical_validated',validatedAt:this.clock(),version:document.version+1};
      if(!await this.store.commit(document,null,next)) return {ok:false,blockers:[{code:'DOCUMENT_VERSION_CONFLICT',severity:'ERROR'}]};
      return {ok:true,value:next};
    }
    const sources=await this.store.load(document.invoiceId);
    if (operation==='prepare' && (document.frozenAt || !['draft','prepared'].includes(document.status))) return {ok:false,blockers:[{code:'REVISION_REQUIRED',severity:'ERROR'}]};
    if ((operation==='freeze' && document.status!=='prepared')) return {ok:false,blockers:[{code:'PREPARATION_STATE_INVALID',severity:'ERROR'}]};
    const at=this.clock();
    const rebuilt=build(sources,input,document,document.snapshot?.metadata.preparedAt??at);
    if(!rebuilt.ok) return rebuilt;
    const sourceFingerprint=fingerprint(rebuilt.value);
    if(operation!=='prepare' && (sourceFingerprint!==document.fingerprint || !document.snapshot || fingerprint(document.snapshot)!==document.fingerprint)) return {ok:false,blockers:document.frozenAt ? [{code:'SOURCE_CHANGED',severity:'ERROR'},{code:'REVISION_REQUIRED',severity:'ERROR'}] : [{code:'SOURCE_CHANGED',severity:'ERROR'}]};
    let next: Document;
    if(operation==='prepare') next={...document,status:'prepared',snapshot:rebuilt.value,fingerprint:sourceFingerprint,version:document.version+1};
    else if(operation==='freeze') {
      const time=new Date(at);
      if(!Number.isFinite(time.getTime())) return {ok:false,blockers:[{code:'CANONICAL_INVALID',severity:'ERROR'}]};
      const issueAt=time.toISOString();
      const snapshot=structuredClone(document.snapshot!);
      snapshot.invoice.issueAt=issueAt;
      snapshot.invoice.issueDate=issueAt.slice(0,10);
      snapshot.invoice.issueTime=issueAt.slice(11,19)+'Z';
      next={...document,status:'frozen',snapshot,issueAt,frozenAt:issueAt,version:document.version+1};
    } else throw new Error('Unsupported operation');
    if(!await this.store.commit(document,sources,next)) return {ok:false,blockers:[{code:'SOURCE_CHANGED',severity:'ERROR'}]};
    return {ok:true,value:next};
  }
}
/** Read-only source port: adapters must return exact decimal text, not JS numbers. */
export interface SourceReader {
  invoice(id: string): Promise<Sources['invoice']>;
  lines(id: string): Promise<Sources['lines']>;
  activeSellerProfiles(): Promise<Sources['sellers']>;
  payments(id: string): Promise<Sources['payments']>;
}
export async function loadSources(reader: SourceReader, invoiceId: string): Promise<Sources> {
  const [invoice,lines,sellers,payments]=await Promise.all([reader.invoice(invoiceId),reader.lines(invoiceId),reader.activeSellerProfiles(),reader.payments(invoiceId)]);
  return {invoice,lines,sellers,payments};
}
