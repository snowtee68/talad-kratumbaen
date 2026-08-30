import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"
};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic=Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate=Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject=Deno.env.get("VAPID_SUBJECT")||"mailto:admin@localhost";
    if(!url||!anon||!service||!vapidPublic||!vapidPrivate)throw new Error("Missing Supabase/VAPID secrets");

    const auth=req.headers.get("Authorization")||"";
    const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user}}=await caller.auth.getUser();
    if(!user)return new Response(JSON.stringify({error:"Unauthorized"}),{
      status:401,headers:{...cors,"Content-Type":"application/json"}
    });

    const body=await req.json().catch(()=>({}));
    if(!body.batch_id)throw new Error("batch_id required");
    if(!["rider_job_created","rider_shop_ready"].includes(body.event))throw new Error("Unsupported event");

    const admin=createClient(url,service);
    let ids:string[]=[];

    if(body.event==="rider_job_created"){
      // New open job -> notify all approved riders.
      const {data:riders,error}=await admin.rpc("market_push_approved_rider_user_ids");
      if(error)throw error;
      ids=(riders||[]).map((x:any)=>x.user_id).filter(Boolean);
    }else{
      // Shop ready -> ONLY the rider who already accepted this batch.
      const {data:riders,error}=await admin.rpc("market_push_batch_rider_user_ids",{p_batch_id:body.batch_id});
      if(error)throw error;
      ids=(riders||[]).map((x:any)=>x.user_id).filter(Boolean);
      if(!ids.length)return Response.json({
        sent:0,failed:0,event:body.event,reason:"no assigned rider"
      },{headers:cors});
    }

    if(!ids.length)return Response.json({
      sent:0,failed:0,event:body.event,reason:"no recipients"
    },{headers:cors});

    const {data:subs,error:subErr}=await admin.from("market_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth").in("user_id",ids);
    if(subErr)throw subErr;
    if(!(subs||[]).length)return Response.json({
      sent:0,failed:0,event:body.event,recipients:ids.length,reason:"recipients have no push subscription"
    },{headers:cors});

    webpush.setVapidDetails(vapidSubject,vapidPublic,vapidPrivate);

    const isReady=body.event==="rider_shop_ready";
    const payload=JSON.stringify({
      event:body.event,
      batch_id:body.batch_id,
      order_id:body.order_id||null,
      title:body.title||(isReady?"📦 สินค้าพร้อมให้เข้ารับแล้ว":"🛵 มีงานวินใหม่"),
      body:body.body||(isReady
        ?`${body.shop_name||"ร้านค้า"} เตรียมสินค้าเสร็จแล้ว เข้ารับได้เลย`
        :"มีงาน Delivery ใหม่รอรับ"),
      tag:isReady?`rider-ready-${body.batch_id}-${body.order_id||"shop"}`:`rider-job-${body.batch_id}`,
      url:body.url||"./?rider_jobs=1"
    });

    let sent=0,failed=0;
    const failures:any[]=[];
    await Promise.all((subs||[]).map(async(s:any)=>{
      try{
        await webpush.sendNotification(
          {endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},
          payload,
          {TTL:isReady?600:300,urgency:"high"}
        );
        sent++;
      }catch(e:any){
        failed++;
        failures.push({status:e?.statusCode||0,message:e?.body||e?.message||String(e)});
        if(e?.statusCode===404||e?.statusCode===410){
          await admin.from("market_push_subscriptions").delete().eq("endpoint",s.endpoint);
        }
        console.error("push failed",e?.statusCode,e?.body||e?.message);
      }
    }));

    return Response.json({
      ok:true,event:body.event,sent,failed,recipients:ids.length,subscriptions:(subs||[]).length,
      failures:failures.slice(0,3)
    },{headers:cors});
  }catch(e:any){
    console.error(e);
    return new Response(JSON.stringify({error:e?.message||String(e)}),{
      status:400,headers:{...cors,"Content-Type":"application/json"}
    });
  }
});
