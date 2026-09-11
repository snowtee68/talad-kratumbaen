self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(_){data={title:'อัปเดตออเดอร์',body:event.data?.text()||''}}
  const title=data.title||'ตลาดกระทุ่มแบน';
  const options={
    body:data.body||'มีอัปเดตคำสั่งซื้อ',
    tag:data.tag||'market-order',
    renotify:true,
    data:{url:data.url||'./',event:data.event||null,order_id:data.order_id||null,shop_id:data.shop_id||null,group_id:data.group_id||null,title,body:data.body||'มีอัปเดตคำสั่งซื้อ'},
    vibrate:[250,120,250,120,450]
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    let raw=event.notification.data?.url||'./';
    try{
      const d=event.notification.data||{};
      const u=new URL(raw,self.registration.scope);
      const eventName=String(d.event||'').toLowerCase();
      const text=`${d.title||event.notification.title||''} ${d.body||event.notification.body||''}`;
      const rider=u.searchParams.get('rider_jobs')==='1'||eventName.includes('rider')||/rider|ไรเดอร์|งานใหม่เข้ามา|งาน delivery|มีงานใหม่/i.test(text);
      const customer=eventName.includes('customer')||['shop_accepted','revision_requested','payment_confirmed','order_ready','refund_submitted'].includes(eventName)||/สินค้าพร้อม|พร้อมรับสินค้า|ร้านรับออเดอร์|พร้อมมารับ|ready for pickup/i.test(text);
      const sellerEvents=['new_order','order_created','payment_submitted','payment_reminder','revision_confirmed','order_cancelled','refund_destination']; const customerEvents=['shop_accepted','revision_requested','payment_confirmed','order_ready','refund_submitted']; const sellerExact=sellerEvents.includes(eventName)||eventName.includes('seller'); const customerExact=customerEvents.includes(eventName)||eventName.includes('customer'); const sellerText=/ออเดอร์ใหม่|สลิปรอตรวจ|รอตรวจเงิน|ลูกค้า.*ส่งสลิป|ส่งสลิป|หลักฐานชำระ|payment submitted|new order|seller/i.test(text); const seller=sellerExact||(!customerExact&&sellerText);
      if(rider){
        const q=new URLSearchParams({rider_jobs:'1',notification_click:'1'}); raw=`./?${q}`;
      }else if(customer){
        const q=new URLSearchParams({order_tab:'customer',notification_click:'1'});
        const orderId=d.order_id||u.searchParams.get('order_id'),groupId=d.group_id||u.searchParams.get('group_id');
        if(orderId)q.set('order_id',orderId); if(groupId)q.set('group_id',groupId); raw=`./?${q}`;
      }else if(seller||!u.searchParams.toString()){
        const q=new URLSearchParams({order_tab:'seller',notification_click:'1',seller_action:'1'});
        const orderId=d.order_id||u.searchParams.get('order_id'),shopId=d.shop_id||u.searchParams.get('shop_id'),groupId=d.group_id||u.searchParams.get('group_id');
        if(orderId)q.set('order_id',orderId); if(shopId)q.set('shop_id',shopId); if(groupId)q.set('group_id',groupId); raw=`./?${q}`;
      }
    }catch(_e){raw='./?order_tab=auto&notification_click=1';}
    let target;
    try{ target=new URL(raw,self.registration.scope).href; }
    catch(_e){ target=self.registration.scope; }

    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    // Prefer an existing window from this PWA scope, but always navigate it to the target.
    for(const client of windows){
      try{
        if('navigate' in client) await client.navigate(target);
        if('focus' in client) await client.focus();
        return;
      }catch(_e){}
    }
    if(clients.openWindow) await clients.openWindow(target);
  })());
});
