self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(_){data={title:'อัปเดตออเดอร์',body:event.data?.text()||''}}
  const title=data.title||'ตลาดกระทุ่มแบน';
  const options={
    body:data.body||'มีอัปเดตคำสั่งซื้อ',
    tag:data.tag||'market-order',
    renotify:true,
    data:{url:data.url||'./'},
    vibrate:[250,120,250,120,450]
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const raw=event.notification.data?.url||'./';
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
