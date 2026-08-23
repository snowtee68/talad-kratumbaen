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
  const raw=event.notification.data?.url||'./';
  const target=new URL(raw,self.registration.scope).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
    for(const c of list){if('focus' in c){if('navigate' in c)await c.navigate(target);await c.focus();return}}
    if(clients.openWindow)return clients.openWindow(target);
  }));
});
