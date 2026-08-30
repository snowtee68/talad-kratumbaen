import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic=Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate=Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject=Deno.env.get("VAPID_SUBJECT")||"mailto:admin@localhost";
    if(!url||!service||!vapidPublic||!vapidPrivate)throw new Error("Missing Supabase/VAPID secrets");

    // Caller must be an authenticated marketplace user. The function itself decides recipients.
    const auth=req.headers.get("Authorization")||"";
    const caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await caller.auth.getUser();
    if(!user) return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});

    const body=await req.json().catch(()=>({}));
    if(body.event!=="rider_job_created"||!body.batch_id)throw new Error("Unsupported event");

    const admin=createClient(url,service);
    const {data:riders,error:rerr}=await admin.rpc("market_push_approved_rider_user_ids");
    if(rerr)throw rerr;
    const ids=(riders||[]).map((x:any)=>x.user_id).filter(Boolean);
    if(!ids.length)return Response.json({sent:0,reason:"no approved riders"},{headers:cors});

    const {data:subs,error:serr}=await admin.from("market_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth").in("user_id",ids);
    if(serr)throw serr;

    webpush.setVapidDetails(vapidSubject,vapidPublic,vapidPrivate);
    const payload=JSON.stringify({
      title:body.title||"🛵 มีงานวินใหม่",
      body:body.body||"มีงาน Delivery ใหม่รอรับ",
      tag:`rider-job-${body.batch_id}`,
      url:body.url||"./?rider_jobs=1"
    });

    let sent=0,failed=0;
    await Promise.all((subs||[]).map(async(s:any)=>{
      try{
        await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload,{TTL:300,urgency:"high"});
        sent++;
      }catch(e:any){
        failed++;
        if(e?.statusCode===404||e?.statusCode===410){
          await admin.from("market_push_subscriptions").delete().eq("endpoint",s.endpoint);
        }
        console.error("push failed",e?.statusCode,e?.body||e?.message);
      }
    }));
    return Response.json({sent,failed,riders:ids.length},{headers:cors});
  }catch(e:any){
    console.error(e);
    return new Response(JSON.stringify({error:e?.message||String(e)}),{status:400,headers:{...cors,"Content-Type":"application/json"}});
  }
});
