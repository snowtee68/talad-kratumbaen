import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-rider-webhook-secret"
};

const json=(data:any,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...cors,"Content-Type":"application/json"}
});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});

  let claimKey:string|null=null;
  let admin:any=null;

  try{
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublic=Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivate=Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject=Deno.env.get("VAPID_SUBJECT")||"mailto:admin@localhost";
    const webhookSecret=Deno.env.get("RIDER_PUSH_WEBHOOK_SECRET")||"";

    if(!url||!anon||!service||!vapidPublic||!vapidPrivate){
      throw new Error("Missing Supabase/VAPID secrets");
    }

    const body=await req.json().catch(()=>({}));
    const isDbWebhook=
      (body?.schema==="public" &&
       body?.table==="market_delivery_batches" &&
       body?.record?.id) ||
      (body?.source==="pg_net_trigger" &&
       body?.event==="rider_job_created" &&
       body?.batch_id);

    // Normalize the compact payload sent by our pg_net trigger into the same
    // record shape used by a Supabase Database Webhook.
    if(body?.source==="pg_net_trigger" && body?.batch_id){
      body.schema="public";
      body.table="market_delivery_batches";
      body.type="UPDATE";
      body.record={
        id:body.batch_id,
        group_id:body.group_id,
        rider_job_id:body.rider_job_id,
        status:body.status,
        accepted_at:body.accepted_at||null
      };
    }

    // Database Webhook has no end-user JWT. It is authenticated with a dedicated
    // secret header configured in Supabase Database Webhooks.
    if(isDbWebhook){
      const supplied=req.headers.get("x-rider-webhook-secret")||"";
      if(!webhookSecret||supplied!==webhookSecret){
        return json({error:"Invalid rider webhook secret"},401);
      }
    }else{
      // Browser/manual invocation path remains authenticated as before.
      const auth=req.headers.get("Authorization")||"";
      const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}});
      const {data:{user}}=await caller.auth.getUser();
      if(!user)return json({error:"Unauthorized"},401);
    }

    admin=createClient(url,service);

    let event:string;
    let batchId:string;
    let orderId:string|null=null;
    let title:string|undefined;
    let message:string|undefined;
    let targetUrl:string|undefined;

    if(isDbWebhook){
      const record=body.record||{};
      batchId=String(record.id);
      event="rider_job_created";

      // Webhook can be configured for INSERT + UPDATE. Ignore rows that are not
      // an open rider job. This makes the hook safe against later batch updates.
      const openStatuses=["creating","waiting_rider","created","open"];
      if(!openStatuses.includes(String(record.status||""))){
        return json({ok:true,event,skipped:true,reason:"batch_not_open",batch_id:batchId});
      }
      if(record.accepted_at){
        return json({ok:true,event,skipped:true,reason:"batch_already_accepted",batch_id:batchId});
      }
      // V0.5.22.87:
      // A real waiting rider job is represented by an open delivery batch itself.
      // rider_job_id can legitimately still be NULL while status='creating',
      // so do NOT wait for rider_job_id before notifying approved riders.

      // Confirm this is still a delivery group, not pickup.
      const {data:group,error:groupErr}=await admin
        .from("market_delivery_groups")
        .select("fulfillment_method")
        .eq("id",record.group_id)
        .maybeSingle();
      if(groupErr)throw groupErr;
      if(group?.fulfillment_method==="pickup"){
        return json({ok:true,event,skipped:true,reason:"pickup_group",batch_id:batchId});
      }

      title="🛵 มีงานวินใหม่";
      message="มีงาน Delivery ใหม่รอรับ";
      targetUrl=`./?rider_jobs=1&rider_batch=${encodeURIComponent(batchId)}`;

      console.info("rider database webhook",{
        type:body.type,
        batch_id:batchId,
        rider_job_id:record.rider_job_id,
        status:record.status
      });
    }else{
      if(!body.batch_id)throw new Error("batch_id required");
      if(!["rider_job_created","rider_shop_ready"].includes(body.event)){
        throw new Error("Unsupported event");
      }
      event=body.event;
      batchId=String(body.batch_id);
      orderId=body.order_id?String(body.order_id):null;
      title=body.title;
      message=body.body;
      targetUrl=body.url;
    }

    // One successful Push per logical event. This prevents duplicates if the
    // browser fallback and Database Webhook arrive together, or a batch is updated again.
    claimKey=event==="rider_shop_ready"
      ?`rider_shop_ready:${batchId}:${orderId||"shop"}`
      :`rider_job_created:${batchId}`;

    const {error:claimErr}=await admin.from("market_rider_push_events").insert({
      event_key:claimKey,
      event_type:event,
      batch_id:batchId,
      order_id:orderId,
      meta:{source:isDbWebhook?"database_webhook":"browser"}
    });

    if(claimErr){
      if(claimErr.code==="23505"){
        console.info("rider push already sent",{event,batch_id:batchId,event_key:claimKey});
        return json({ok:true,event,sent:0,already_sent:true,batch_id:batchId});
      }
      throw claimErr;
    }

    let ids:string[]=[];

    if(event==="rider_job_created"){
      const {data:riders,error}=await admin.rpc("market_push_approved_rider_user_ids");
      if(error)throw error;
      ids=(riders||[]).map((x:any)=>x.user_id).filter(Boolean);
    }else{
      const {data:riders,error}=await admin.rpc("market_push_batch_rider_user_ids",{p_batch_id:batchId});
      if(error)throw error;
      ids=(riders||[]).map((x:any)=>x.user_id).filter(Boolean);
      if(!ids.length){
        await admin.from("market_rider_push_events").delete().eq("event_key",claimKey);
        claimKey=null;
        return json({sent:0,failed:0,event,reason:"no assigned rider"});
      }
    }

    if(!ids.length){
      await admin.from("market_rider_push_events").delete().eq("event_key",claimKey);
      claimKey=null;
      return json({sent:0,failed:0,event,reason:"no recipients"});
    }

    const {data:subs,error:subErr}=await admin.from("market_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth").in("user_id",ids);
    if(subErr)throw subErr;

    if(!(subs||[]).length){
      await admin.from("market_rider_push_events").delete().eq("event_key",claimKey);
      claimKey=null;
      return json({
        sent:0,failed:0,event,recipients:ids.length,
        reason:"recipients have no push subscription"
      });
    }

    webpush.setVapidDetails(vapidSubject,vapidPublic,vapidPrivate);

    const isReady=event==="rider_shop_ready";
    const payload=JSON.stringify({
      event,
      batch_id:batchId,
      order_id:orderId,
      title:title||(isReady?"📦 สินค้าพร้อมให้เข้ารับแล้ว":"🛵 มีงานวินใหม่"),
      body:message||(isReady
        ?`${body.shop_name||"ร้านค้า"} เตรียมสินค้าเสร็จแล้ว เข้ารับได้เลย`
        :"มีงาน Delivery ใหม่รอรับ"),
      tag:isReady?`rider-ready-${batchId}-${orderId||"shop"}`:`rider-job-${batchId}`,
      url:targetUrl||`./?rider_jobs=1&rider_batch=${encodeURIComponent(batchId)}`
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
        failures.push({
          status:e?.statusCode||0,
          message:e?.body||e?.message||String(e)
        });
        if(e?.statusCode===404||e?.statusCode===410){
          await admin.from("market_push_subscriptions").delete().eq("endpoint",s.endpoint);
        }
        console.error("push failed",e?.statusCode,e?.body||e?.message);
      }
    }));

    // If nothing reached any device, allow a later webhook/update/manual retry.
    if(sent===0 && claimKey){
      await admin.from("market_rider_push_events").delete().eq("event_key",claimKey);
      claimKey=null;
    }

    const result={
      ok:true,
      source:isDbWebhook?"database_webhook":"browser",
      event,
      sent,
      failed,
      recipients:ids.length,
      subscriptions:(subs||[]).length,
      batch_id:batchId,
      failures:failures.slice(0,3)
    };
    console.info("rider push result",result);
    return json(result);

  }catch(e:any){
    console.error("send-rider-push error",e);

    // A failed invocation must be retryable.
    if(admin&&claimKey){
      try{await admin.from("market_rider_push_events").delete().eq("event_key",claimKey)}catch(_e){}
    }

    return json({error:e?.message||String(e)},400);
  }
});
