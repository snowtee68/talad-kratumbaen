import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async(req)=>{
  try{
    const secret=Deno.env.get('RIDER_PROOF_CLEANUP_SECRET')||'';
    if(!secret || req.headers.get('x-rider-proof-cleanup-secret')!==secret)
      return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:{'content-type':'application/json'}});
    const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:rows,error}=await admin.rpc('market_delivery_proofs_due_for_cleanup',{p_limit:100});
    if(error)throw error;
    let deleted=0;const failed:any[]=[];
    for(const row of rows||[]){
      try{
        const {error:de}=await admin.storage.from('rider-delivery-proof').remove([row.proof_path]);
        if(de)throw de;
        await admin.rpc('market_mark_delivery_proof_deleted',{p_batch_id:row.batch_id});deleted++;
      }catch(e:any){failed.push({batch_id:row.batch_id,error:e?.message||String(e)})}
    }
    return new Response(JSON.stringify({ok:failed.length===0,found:(rows||[]).length,deleted,failed}),{headers:{'content-type':'application/json'}});
  }catch(e:any){return new Response(JSON.stringify({error:e?.message||String(e)}),{status:500,headers:{'content-type':'application/json'}})}
});
