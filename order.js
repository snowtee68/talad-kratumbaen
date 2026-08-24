(() => {
  'use strict';
  const cfg=window.APP_CONFIG||{};
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY||!window.supabase){console.warn('Order module: Supabase not configured');return;}
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const CART_KEY='talad_multishop_cart_v1';
  // TEST MODE: keep ordering hidden from the public until the flow is fully tested.
  // Change ORDER_PUBLIC_ENABLED to true when ready to launch publicly.
  const ORDER_PUBLIC_ENABLED=true;
  const ORDER_TEST_EMAILS=['snowtee68@gmail.com'];
  const MAX_PICKUPS=5, EXTRA_PICKUP_FEE=10;
  let session=null, productShopIds=new Set(), productOptionDraft=[];
  const ORDER_NOTIFY_KEY='talad_order_notify_v042';
  let orderNotifyTimer=null,orderNotifyRealtime=null,orderNotifyRealtimeDebounce=null,orderNotifyBusy=false,orderNotifyBaseline=false,orderNotifyAudioArmed=false;
  let customerOrderTab='waiting',sellerOrderTab='action',customerOrderPage=1,sellerOrderPage=1,orderSearchTerm='',orderDateFilter='today',customerFocusGroupId=null,customerFocusOrderId=null;
  const ORDER_UI_VERSION='0.5.20.33';
  let orderNotifyState={statuses:{},viewed:{},reminded:{},unread:0};
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2});
  const uuid=()=>crypto.randomUUID?.()||('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)}));
  const getCart=()=>{try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]')}catch(_){return[]}};
  const saveCart=c=>{localStorage.setItem(CART_KEY,JSON.stringify(c));updateCartBadge();};
  function groupedCart(){
    const groups=new Map();
    for(const item of getCart()){
      const shopId=String(item.shop_id||'');
      if(!shopId)continue;
      if(!groups.has(shopId))groups.set(shopId,{shop_id:item.shop_id,shop_name:item.shop_name||'ร้านค้า',items:[]});
      groups.get(shopId).items.push(item);
    }
    return [...groups.values()];
  }
  const statusText=s=>({pending_shop:'รอร้านรับออเดอร์',awaiting_customer_confirmation:'รอลูกค้ายืนยันรายการใหม่',awaiting_payment:'รอชำระเงิน',payment_review:'ร้านกำลังตรวจสอบเงิน',preparing:'กำลังเตรียมสินค้า',ready:'พร้อมรับสินค้า',cancelled:'ยกเลิกแล้ว'})[s]||s;
  const productStatusText=s=>({available:'เปิดขาย',sold_out:'หมดชั่วคราว',discontinued:'เลิกขาย'})[s]||s;
  const hhmm=v=>String(v||'').slice(0,5);
  function shopAvailability(setting){
    if(!setting?.enabled)return{ok:false,msg:'ร้านยังไม่ได้เปิดรับออเดอร์ผ่านตลาด'};
    if(!setting?.payment_qr_url)return{ok:false,msg:'ร้านยังไม่ได้ตั้ง QR รับชำระเงิน'};
    if((setting.accepting_status||'open')!=='open')return{ok:false,msg:setting.pause_reason?`ร้านพักรับออเดอร์ชั่วคราว: ${setting.pause_reason}`:'ร้านพักรับออเดอร์ชั่วคราว'};
    const a=hhmm(setting.order_start_time),b=hhmm(setting.order_end_time);
    if(a&&b&&a!==b){const now=new Date(),th=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Bangkok'})),cur=th.getHours()*60+th.getMinutes(),[ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number),st=ah*60+am,en=bh*60+bm,inside=st<en?(cur>=st&&cur<en):(cur>=st||cur<en);if(!inside)return{ok:false,msg:`ร้านรับออเดอร์เวลา ${a}–${b} น.`};}
    return{ok:true,msg:a&&b?`รับออเดอร์ ${a}–${b} น.`:'เปิดรับออเดอร์'};
  }

  const canUseOrders=()=>ORDER_PUBLIC_ENABLED;

  async function init(){
    const {data}=await db.auth.getSession();session=data.session;
    injectUI();wire();renderNavState();updateCartBadge();applyOrderAccess();
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('message',async ev=>{
        if(ev.data?.type!=='MARKET_NOTIFICATION_DEEPLINK')return;
        try{
          const target=ev.data?.url||location.href;
          const u=new URL(target,location.href);
          history.replaceState(null,'',u.pathname+u.search+u.hash);
          await openOrderDeepLink(target);
        }catch(err){console.warn('Notification deep link:',err?.message||err)}
      });
    }
    db.auth.onAuthStateChange(async(_e,s)=>{session=s;renderNavState();applyOrderAccess();stopOrderNotifications();if(canUseOrders()){await refreshProductShops();decorateShopCards();startOrderNotifications();await openOrderDeepLink();}});
    if(canUseOrders()){await refreshProductShops();decorateShopCards();startOrderNotifications();await openOrderDeepLink();}
    new MutationObserver(()=>{if(canUseOrders())decorateShopCards();attachCartToBottomNav();}).observe(document.body,{childList:true,subtree:true});
  }

  function injectUI(){
    if(!document.querySelector('link[href*="order.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='order.css?v=0.4.2';document.head.appendChild(css);}
    const nav=document.querySelector('.nav-actions');
    if(nav&&!document.getElementById('marketOrdersBtn')){
      const b=document.createElement('button');b.id='marketOrdersBtn';b.className='ghost market-order-nav';b.textContent='📦 ออเดอร์';nav.insertBefore(b,document.getElementById('accountBtn')||null);
    }
    const f=document.createElement('button');f.type='button';f.id='marketCartBtn';f.className='order-floating-cart';f.innerHTML='<span class="cart-icon">🛒</span><span class="cart-label">ตะกร้า</span><span class="count">0</span>';document.body.appendChild(f);
    injectBottomNavStyles();attachCartToBottomNav();injectOrderNotificationUI();
    const modal=document.createElement('div');modal.id='marketOrderModal';modal.className='market-order-modal hidden';modal.innerHTML='<div class="mo-backdrop" data-mo-close></div><div class="market-order-panel"><button class="mo-close" data-mo-close>×</button><div id="marketOrderBody"></div></div>';document.body.appendChild(modal);
  }

  function injectBottomNavStyles(){
    if(document.getElementById('orderBottomNavStyle'))return;
    const st=document.createElement('style');st.id='orderBottomNavStyle';st.textContent=`
      #marketCartBtn.order-bottom-cart{
        position:relative !important;pointer-events:auto !important;touch-action:manipulation !important;inset:auto !important;right:auto !important;bottom:auto !important;
        width:auto !important;min-width:0 !important;height:auto !important;margin:0 !important;
        display:flex !important;align-items:center;justify-content:center;gap:6px;
        padding:12px 10px !important;border:1px solid rgba(120,70,55,.16) !important;
        border-radius:22px !important;background:#fff !important;color:#2b2020 !important;
        box-shadow:none !important;font:inherit;font-weight:800;white-space:nowrap;z-index:auto !important;
      }
      #marketCartBtn.order-bottom-cart .cart-icon{font-size:20px;line-height:1}
      #marketCartBtn.order-bottom-cart .cart-label{font-size:15px;line-height:1}
      #marketCartBtn.order-bottom-cart .count{
        position:absolute;top:-7px;right:8px;min-width:22px;height:22px;padding:0 5px;
        display:grid;place-items:center;border-radius:999px;background:#c70f17;color:#fff;
        border:2px solid #fff;font-size:12px;font-weight:900;line-height:1;
      }
      .market-four-bottom-nav{display:grid !important;grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:8px !important;align-items:stretch !important}
      .market-four-bottom-nav > *{min-width:0 !important}
      @media(max-width:520px){
        .market-four-bottom-nav{gap:6px !important}
        #marketCartBtn.order-bottom-cart{padding:11px 6px !important;border-radius:20px !important}
        #marketCartBtn.order-bottom-cart .cart-label{font-size:14px}
      }
      body.order-has-bottom-cart{padding-bottom:max(96px,calc(82px + env(safe-area-inset-bottom))) !important}
      #orderNotifyBanner{position:fixed;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:100000;width:min(92vw,560px);background:#fff;border:1px solid rgba(120,70,55,.22);box-shadow:0 12px 34px rgba(38,24,20,.2);border-radius:18px;padding:13px 16px;display:none;cursor:pointer}
      #orderNotifyBanner.show{display:flex;gap:11px;align-items:center}
      #orderNotifyBanner .bell{font-size:24px}.order-notify-title{font-weight:900}.order-notify-detail{font-size:13px;opacity:.72;margin-top:2px}
      #marketOrdersBtn{position:relative}.order-notify-badge{display:none;position:absolute;right:-8px;top:-9px;min-width:21px;height:21px;padding:0 5px;border-radius:999px;background:#c70f17;color:#fff;border:2px solid #fff;font-size:11px;font-weight:900;align-items:center;justify-content:center}
      #marketOrdersBtn.has-order-notify .order-notify-badge{display:flex}
      .order-group-section{margin:14px 0 20px;padding:12px;border:1px solid rgba(120,70,55,.13);border-radius:18px;background:rgba(255,255,255,.62)}
      .order-group-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.order-group-head h3{margin:0 0 3px;font-size:18px}
      .order-group-count{display:inline-grid;place-items:center;min-width:25px;height:25px;padding:0 7px;border-radius:999px;background:#efe5df;color:#5a3328;font-size:13px}
      .order-group-empty{padding:16px;text-align:center;border:1px dashed rgba(120,70,55,.22);border-radius:14px;color:#8a7168;background:#fff}
      .order-tab-strip{display:flex;gap:7px;overflow-x:auto;padding:2px 1px 8px;scrollbar-width:none}.order-tab-strip::-webkit-scrollbar{display:none}
      .order-tab-strip button{flex:0 0 auto;border:1px solid rgba(120,70,55,.17);background:#fff;border-radius:999px;padding:9px 12px;font-weight:800;white-space:nowrap}
      .order-tab-strip button.active{background:#5c3028;color:#fff}.order-tab-strip button span{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:rgba(120,70,55,.12);font-size:11px}.order-tab-strip button.active span{background:rgba(255,255,255,.2)}
      .order-filter-row{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}.order-filter-row input,.order-filter-row select{width:100%;border:1px solid rgba(120,70,55,.18);border-radius:12px;padding:10px 11px;background:#fff}
      .order-load-more{text-align:center;padding:14px 0}.order-tab-content>.order-card{margin-bottom:12px}
      .order-tabs-sticky{position:sticky;top:-1px;z-index:30;background:#fff;padding:8px 0 9px;border-bottom:1px solid rgba(120,70,55,.10);margin-bottom:10px}
      .order-tabs-sticky .order-tab-strip{display:flex;gap:7px;overflow-x:auto;padding:2px 1px 8px;scrollbar-width:none}
      .order-tabs-sticky .order-tab-strip::-webkit-scrollbar{display:none}
      .order-tabs-sticky .order-tab-strip button{display:flex;align-items:center;gap:6px;flex:0 0 auto;border:1px solid rgba(120,70,55,.17);background:#fff;border-radius:999px;padding:9px 11px;font-weight:800;white-space:nowrap}
      .order-tabs-sticky .order-tab-strip button.active{background:#5c3028;color:#fff}
      .order-tab-count{display:inline-grid;place-items:center;min-width:21px;height:21px;padding:0 5px;border-radius:999px;background:rgba(120,70,55,.12);font-size:11px}
      .order-tabs-sticky .order-tab-strip button.active .order-tab-count{background:rgba(255,255,255,.22)}
      .order-active-pane{min-height:160px}.order-active-head{display:flex;justify-content:space-between;align-items:center;margin:8px 2px 12px;font-size:16px}.order-active-head span{font-size:13px;color:#8a7168}
      .order-ui-version{text-align:right;font-size:10px;margin-top:4px;opacity:.45}
      .seller-order-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.order-age{font-size:11px;font-weight:800;padding:3px 7px;border-radius:999px;background:#f3eee9;color:#6f554c}.order-age.urgent{background:#ffe5e5;color:#a51d1d}.order-work-hint{font-size:11px;color:#8a7168;margin-top:2px}.order-count-alert{font-weight:900;background:#ffe8e8;color:#a51d1d;border-radius:999px;padding:4px 9px}.order-unseen{box-shadow:inset 4px 0 0 #d92d20}.order-new-badge{font-size:10px;font-weight:900;padding:3px 7px;border-radius:999px;background:#d92d20;color:#fff}.order-next-action{display:inline-block;margin-top:5px;padding:4px 8px;border-radius:8px;background:#fff4d8;color:#6f4c00;font-size:12px}.order-queue-summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;margin:2px 0 10px;border-radius:12px;background:#fff4f2;border:1px solid #ffd3cf}.order-queue-summary small{color:#a51d1d;font-weight:800}.queue-priority{font-size:11px;color:#755f57;white-space:nowrap}.delivery-track{margin:12px 0 8px;padding:12px;border-radius:12px;background:#f7fbff;border:1px solid #d7e9f8}.delivery-track>b{display:block;margin-bottom:9px}.delivery-track small{display:block;margin-top:8px;color:#667}.rider-contact{margin:6px 0 9px;padding:8px 10px;border-radius:10px;background:#fff}.rider-contact a{font-weight:900;text-decoration:none}.shop-insight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:12px}.shop-insight-card{border:1px solid #e7e7e7;border-radius:14px;padding:12px;background:#fff}.shop-insight-card small,.shop-insight-card span{display:block;color:#667}.shop-insight-card strong{display:block;font-size:1.15rem;margin:5px 0}.delivery-fare-preview{display:flex;align-items:center;gap:12px;margin:12px 0;padding:14px;border:1px solid #b8d9c2;border-radius:14px;background:#f3fbf5}.fare-preview-icon{font-size:30px}.delivery-fare-preview small,.delivery-fare-preview span{display:block;color:#5d6c62}.delivery-fare-preview strong{display:block;font-size:22px;margin:2px 0}.post-checkout-banner{display:flex;flex-direction:column;gap:4px;margin:0 0 12px;padding:12px 14px;border:1px solid #bde5c9;border-radius:14px;background:#effbf2}.post-checkout-banner b{font-size:16px}.post-checkout-banner span{font-size:12px;color:#506459}.focused-checkout-order{outline:2px solid #80c99a;outline-offset:2px;box-shadow:0 6px 20px rgba(60,120,80,.12)}.delivery-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.delivery-steps span{font-size:10px;text-align:center;padding:6px 3px;border-radius:8px;background:#eee;color:#777}.delivery-steps span.done{background:#e6f6ea;color:#176b35;font-weight:800}.delivery-steps span.active{background:#fff0cf;color:#795600;font-weight:900}@media(max-width:480px){.delivery-steps span{font-size:9px;padding:6px 2px}}
      .delivery-address-box{margin-top:4px;padding:12px;border:1px solid rgba(120,70,55,.15);border-radius:14px;background:#fff}.delivery-address-title{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.delivery-location-status{margin-top:10px;padding:9px 10px;border-radius:10px;background:#f7f5f2;font-size:12px}.delivery-location-status small{color:#777}.save-address-check{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px}.save-address-check input{width:18px;height:18px}.delivery-fare-note{font-size:12px;color:#75665f}.delivery-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.delivery-steps span{font-size:10px;text-align:center;padding:6px 3px;border-radius:8px;background:#eee;color:#777}.delivery-steps span.done{background:#e6f6ea;color:#176b35;font-weight:800}.delivery-steps span.active{background:#fff0cf;color:#795600;font-weight:900}@media(max-width:480px){.delivery-steps span{font-size:9px;padding:6px 2px}#marketOrderModal .market-order-panel.wide{max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
      @media(max-width:520px){
        .order-filter-row{grid-template-columns:1fr 92px;gap:6px}
        .order-tabs-sticky{top:-1px;padding-top:4px}
        .order-tabs-sticky .order-tab-strip button{padding:9px 10px;font-size:13px}
        #marketOrderModal .market-order-panel.wide{height:90dvh;max-height:90dvh;padding-bottom:90px}
      }
    `;document.head.appendChild(st);
  }
  function buttonByThaiLabel(label){
    return [...document.querySelectorAll('button,a,[role="button"]')].find(el=>{
      if(el.id==='marketCartBtn'||el.closest('#marketOrderModal'))return false;
      const t=String(el.textContent||'').replace(/\s+/g,' ').trim();
      return t===label||t.endsWith(' '+label)||t.includes(label);
    })||null;
  }
  function commonAncestor(elements){
    if(!elements.length)return null;
    let n=elements[0];
    while(n&&n!==document.body){if(elements.every(x=>n.contains(x)))return n;n=n.parentElement;}
    return null;
  }
  function directChildUnder(parent,node){let n=node;while(n&&n.parentElement!==parent)n=n.parentElement;return n;}
  function attachCartToBottomNav(){
    const cart=document.getElementById('marketCartBtn');if(!cart)return;
    const back=buttonByThaiLabel('กลับ'),home=buttonByThaiLabel('หน้าหลัก'),help=buttonByThaiLabel('ช่วยเหลือ');
    if(!back||!home||!help)return;
    let bar=commonAncestor([back,home,help]);if(!bar)return;
    // Keep the detected container reasonably local to the three bottom-nav controls.
    if(bar===document.body||bar.children.length>12)return;
    const helpItem=directChildUnder(bar,help),homeItem=directChildUnder(bar,home);
    if(!helpItem||!homeItem)return;
    if(cart.parentElement!==bar){bar.insertBefore(cart,helpItem);}
    else if(cart.nextElementSibling!==helpItem){bar.insertBefore(cart,helpItem);}
    bar.classList.add('market-four-bottom-nav');cart.classList.add('order-bottom-cart');
    document.body.classList.add('order-has-bottom-cart');
  }


  function injectOrderNotificationUI(){
    if(!document.getElementById('orderNotifyBanner')){
      const b=document.createElement('div');b.id='orderNotifyBanner';b.setAttribute('role','status');b.setAttribute('aria-live','polite');
      b.innerHTML='<div class="bell">🔔</div><div><div class="order-notify-title">มีอัปเดตออเดอร์</div><div class="order-notify-detail">แตะเพื่อดู</div></div>';
      document.body.appendChild(b);
    }
    const nav=document.getElementById('marketOrdersBtn');
    if(nav&&!nav.querySelector('.order-notify-badge')){const x=document.createElement('span');x.className='order-notify-badge';x.textContent='0';nav.appendChild(x);}
    loadOrderNotifyState();renderOrderNotifyBadge();
  }
  function loadOrderNotifyState(){
    try{const x=JSON.parse(localStorage.getItem(ORDER_NOTIFY_KEY)||'{}');orderNotifyState={statuses:x.statuses||{},viewed:x.viewed||{},reminded:x.reminded||{},unread:Number(x.unread||0)}}catch(_){orderNotifyState={statuses:{},viewed:{},reminded:{},unread:0}}
  }
  function saveOrderNotifyState(){
    const trimObj=o=>Object.fromEntries(Object.entries(o||{}).slice(-300));
    orderNotifyState.statuses=trimObj(orderNotifyState.statuses);orderNotifyState.viewed=trimObj(orderNotifyState.viewed);orderNotifyState.reminded=trimObj(orderNotifyState.reminded);
    localStorage.setItem(ORDER_NOTIFY_KEY,JSON.stringify(orderNotifyState));
  }
  function armOrderNotificationAudio(){
    if(orderNotifyAudioArmed)return;orderNotifyAudioArmed=true;
    try{const C=window.AudioContext||window.webkitAudioContext;if(C){const c=new C();const o=c.createOscillator(),g=c.createGain();g.gain.value=0.0001;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.01);c.resume?.();window.__marketOrderAudioContext=c;}}catch(_){}
  }
  function playOrderNotificationSound(){
    if(!orderNotifyAudioArmed)return;
    try{
      const C=window.AudioContext||window.webkitAudioContext,c=window.__marketOrderAudioContext||new C();window.__marketOrderAudioContext=c;c.resume?.();
      const now=c.currentTime;
      // Noticeable ~4 second order chime. Queue events still trigger only once per batch.
      const notes=[660,880,660,880,740,990,740,990];
      notes.forEach((freq,i)=>{
        const d=i*.46,o=c.createOscillator(),g=c.createGain();
        o.type='sine';o.frequency.value=freq;
        g.gain.setValueAtTime(.0001,now+d);
        g.gain.exponentialRampToValueAtTime(.28,now+d+.025);
        g.gain.setValueAtTime(.22,now+d+.24);
        g.gain.exponentialRampToValueAtTime(.0001,now+d+.40);
        o.connect(g);g.connect(c.destination);o.start(now+d);o.stop(now+d+.42);
      });
    }catch(_){}
  }
  function renderOrderNotifyBadge(){
    const nav=document.getElementById('marketOrdersBtn'),b=nav?.querySelector('.order-notify-badge'),n=Math.max(0,Number(orderNotifyState.unread||0));
    if(b)b.textContent=n>99?'99+':String(n);nav?.classList.toggle('has-order-notify',n>0);
  }
  function showOrderNotifyBanner(title,detail,count=1){
    const b=document.getElementById('orderNotifyBanner');if(!b)return;
    b.querySelector('.order-notify-title').textContent=title;b.querySelector('.order-notify-detail').textContent=detail||'แตะเพื่อดูออเดอร์';
    b.classList.add('show');clearTimeout(b._hideTimer);b._hideTimer=setTimeout(()=>b.classList.remove('show'),6500);
    orderNotifyState.unread=Math.min(999,Number(orderNotifyState.unread||0)+Math.max(1,count));saveOrderNotifyState();renderOrderNotifyBadge();playOrderNotificationSound();
  }
  function markNotificationAreaViewed(){
    orderNotifyState.unread=0;saveOrderNotifyState();renderOrderNotifyBadge();document.getElementById('orderNotifyBanner')?.classList.remove('show');
  }
  function stopOrderNotifications(){
    if(orderNotifyTimer){clearInterval(orderNotifyTimer);orderNotifyTimer=null}
    if(orderNotifyRealtimeDebounce){clearTimeout(orderNotifyRealtimeDebounce);orderNotifyRealtimeDebounce=null}
    if(orderNotifyRealtime){try{db.removeChannel(orderNotifyRealtime)}catch(_e){}orderNotifyRealtime=null}
    orderNotifyBusy=false;orderNotifyBaseline=false;
  }
  async function getMySellerShopIds(){
    if(!session?.user?.id)return[];
    const {data}=await db.from('market_shops').select('id').eq('owner_id',session.user.id);return(data||[]).map(x=>x.id);
  }
  async function pollOrderNotifications(){
    if(orderNotifyBusy||!session||!canUseOrders())return;orderNotifyBusy=true;
    try{
      const sellerIds=await getMySellerShopIds(),events=[],now=Date.now();
      let sellerOrders=[],customerOrders=[];
      if(sellerIds.length){
        const {data}=await db.from('market_orders').select('id,shop_id,status,created_at,updated_at,shop_response_due_at,payment_submitted_at').in('shop_id',sellerIds).order('created_at',{ascending:false}).limit(100);
        sellerOrders=data||[];
      }
      {
        const {data}=await db.from('market_orders').select('id,status,created_at,updated_at,shop_id').eq('customer_id',session.user.id).order('created_at',{ascending:false}).limit(100);
        customerOrders=data||[];
      }
      const all=[...sellerOrders.map(o=>({role:'seller',...o})),...customerOrders.map(o=>({role:'customer',...o}))];
      for(const o of all){
        const key=o.role+':'+o.id,prev=orderNotifyState.statuses[key],cur=o.status;
        if(orderNotifyBaseline&&prev!==undefined&&prev!==cur){
          if(o.role==='seller'&&cur==='payment_review')events.push({type:'seller_payment',id:o.id});
          if(o.role==='customer'&&cur==='awaiting_payment')events.push({type:'customer_pay',id:o.id});
          if(o.role==='customer'&&cur==='awaiting_customer_confirmation')events.push({type:'customer_revision',id:o.id});
          if(o.role==='customer'&&cur==='ready')events.push({type:'customer_ready',id:o.id});
          if(o.role==='customer'&&cur==='cancelled')events.push({type:'customer_cancelled',id:o.id});
        }
        if(orderNotifyBaseline&&prev===undefined){
          if(o.role==='seller'&&['pending_shop','awaiting_payment'].includes(cur))events.push({type:'seller_new',id:o.id});
        }
        orderNotifyState.statuses[key]=cur;
      }
      // Reminder: pending manual-accept orders that have not been opened for 3 minutes.
      for(const o of sellerOrders.filter(x=>x.status==='pending_shop')){
        const key='seller:'+o.id,age=now-new Date(o.created_at).getTime(),last=Number(orderNotifyState.reminded[key]||0);
        if(age>=3*60*1000&&!orderNotifyState.viewed[key]&&now-last>=3*60*1000){events.push({type:'seller_reminder',id:o.id});orderNotifyState.reminded[key]=now;}
      }
      if(!orderNotifyBaseline){orderNotifyBaseline=true;saveOrderNotifyState();return;}
      if(events.length){
        const counts=events.reduce((a,e)=>(a[e.type]=(a[e.type]||0)+1,a),{});
        let title='มีอัปเดตออเดอร์ '+events.length+' รายการ',parts=[];
        if(counts.seller_new)parts.push('ออเดอร์ใหม่ '+counts.seller_new);
        if(counts.seller_payment)parts.push('รอตรวจเงิน '+counts.seller_payment);
        if(counts.seller_reminder)parts.push('ยังไม่ได้เปิดดู '+counts.seller_reminder);
        if(counts.customer_pay)parts.push('ร้านรับแล้ว รอชำระ '+counts.customer_pay);
        if(counts.customer_revision)parts.push('ร้านขอแก้รายการ '+counts.customer_revision);
        if(counts.customer_ready)parts.push('สินค้าพร้อม '+counts.customer_ready);
        if(counts.customer_cancelled)parts.push('ออเดอร์ยกเลิก '+counts.customer_cancelled);
        showOrderNotifyBanner(title,parts.join(' · '),events.length);
      }
      saveOrderNotifyState();
    }catch(err){console.warn('Order notification poll:',err?.message||err)}
    finally{orderNotifyBusy=false}
  }
  function scheduleRealtimeOrderRefresh(payload){
    // Capture the exact order that changed. This is essential for multi-shop groups:
    // the customer UI should follow the changed order, not whichever tab was open before.
    const changedOrderId=payload?.new?.id||payload?.old?.id||null;
    const changedStatus=payload?.new?.status||null;
    const changedCustomerId=payload?.new?.customer_id||payload?.old?.customer_id||null;
    if(changedOrderId && changedCustomerId===session?.user?.id){
      customerFocusOrderId=String(changedOrderId);
      if(changedStatus)customerOrderTab=customerOrderStatusBucket(changedStatus);
    }
    if(orderNotifyRealtimeDebounce)clearTimeout(orderNotifyRealtimeDebounce);
    orderNotifyRealtimeDebounce=setTimeout(async()=>{
      orderNotifyRealtimeDebounce=null;
      await pollOrderNotifications();
      // Re-render the screen that is currently open so status changes are visible
      // without requiring a manual refresh.
      try{
        const panel=document.querySelector('#marketOrderModal .market-order-panel');
        const oldScroll=panel?.scrollTop||0;
        const sid=document.getElementById('sellerShopId')?.value;
        if(sid){
          await openSellerShop(sid);
          const np=document.querySelector('#marketOrderModal .market-order-panel');
          if(np)np.scrollTop=oldScroll;
          return;
        }
        const hub=document.getElementById('hubContent');
        if(hub){
          const active=document.querySelector('[data-hub-tab].active')?.dataset?.hubTab||'customer';
          // Customer screen should follow the status of the order/group being viewed
          // instead of remaining on the old tab after a realtime transition.
          if(active==='customer'&&customerFocusOrderId){
            try{
              const {data:o}=await db.from('market_orders').select('status').eq('id',customerFocusOrderId).maybeSingle();
              if(o?.status)customerOrderTab=customerOrderStatusBucket(o.status);
            }catch(_e){}
          }
          await renderHubTab(active);
          // For a customer status transition, move the changed order into view.
          if(active==='customer'&&customerFocusOrderId){
            setTimeout(()=>{
              const card=document.querySelector(`[data-order-card-id="${CSS.escape(customerFocusOrderId)}"]`);
              const ship=document.querySelector('[data-create-delivery]');
              const target=card||ship||document.querySelector('.order-active-pane');
              if(target)target.scrollIntoView({behavior:'smooth',block:'center'});
            },80);
          }else{
            const np=document.querySelector('#marketOrderModal .market-order-panel');
            if(np)np.scrollTop=oldScroll;
          }
        }
      }catch(err){console.warn('Realtime UI refresh:',err?.message||err)}
    },700);
  }
  async function startOrderNotifications(){
    if(!session||!canUseOrders())return;
    stopOrderNotifications();loadOrderNotifyState();
    // One initial sync, then Realtime is the primary update path.
    await pollOrderNotifications();
    try{
      orderNotifyRealtime=db.channel(`market-orders-${session.user.id}-${Date.now()}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'market_orders'},scheduleRealtimeOrderRefresh)
        .subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('Order Realtime:',status)});
    }catch(err){console.warn('Order Realtime setup:',err?.message||err)}
    // Low-frequency safety net only: 5 minutes instead of every 15 seconds.
    orderNotifyTimer=setInterval(()=>{if(document.visibilityState==='visible')pollOrderNotifications()},300000);
  }
  function markSellerOrdersViewed(shopId){
    if(!shopId)return;
    db.from('market_orders').select('id').eq('shop_id',shopId).in('status',['pending_shop','awaiting_payment','payment_review']).limit(100).then(({data})=>{
      for(const o of data||[])orderNotifyState.viewed['seller:'+o.id]=Date.now();saveOrderNotifyState();
    });
    markNotificationAreaViewed();
  }

  function wire(){
    document.addEventListener('pointerdown',armOrderNotificationAudio,{once:true,capture:true});
    document.addEventListener('keydown',armOrderNotificationAudio,{once:true,capture:true});
    document.addEventListener('click',e=>{if(e.target.closest('#showDeliveryFareInfoBtn'))return showDeliveryFareInfo(false);if(e.target.closest('#closeDeliveryFareInfoBtn'))return closeModal();
      if(e.target?.closest?.('#orderNotifyBanner')){
        e.preventDefault();markNotificationAreaViewed();openAccountHub('customer');
      }
    });
    // Bottom navigation in the base app may have its own click handlers.
    // Capture the cart tap first so parent navigation cannot swallow it.
    document.addEventListener('click',e=>{
      const cart=e.target?.closest?.('#marketCartBtn');
      if(!cart)return;
      e.preventDefault();
      e.stopPropagation();
      if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
      renderCart();
    },true);
    document.getElementById('marketOrdersBtn')?.addEventListener('click',()=>openAccountHub('customer'));
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-mo-close]'))return closeModal();
      const orderBtn=e.target.closest('[data-market-order-shop]');if(orderBtn){e.preventDefault();return openShopMenu(orderBtn.dataset.marketOrderShop);}
      const add=e.target.closest('[data-add-product]');if(add)return addProduct(add.dataset.addProduct);
      if(e.target.closest('#confirmAddConfiguredProduct'))return confirmAddConfiguredProduct();
      if(e.target.closest('#customQtyMinus'))return changeCustomQty(-1);
      if(e.target.closest('#customQtyPlus'))return changeCustomQty(1);
      const qty=e.target.closest('[data-cart-qty]');if(qty)return changeQty(qty.dataset.cartQty,Number(qty.dataset.delta));
      const rm=e.target.closest('[data-cart-remove]');if(rm)return removeLine(rm.dataset.cartRemove);
      if(e.target.closest('#goCheckoutBtn'))return openCheckout();
      if(e.target.closest('#useDeliveryLocationBtn'))return captureDeliveryLocation();
      if(e.target.closest('#submitCheckoutBtn'))return submitCheckout();
      const accept=e.target.closest('[data-accept-order]');if(accept)return sellerAcceptOrder(accept.dataset.acceptOrder);
      const revise=e.target.closest('[data-revise-order]');if(revise)return sellerProposeRevision(revise.dataset.reviseOrder);
      const confirmRevision=e.target.closest('[data-confirm-revision]');if(confirmRevision)return customerConfirmRevision(confirmRevision.dataset.confirmRevision);
      const cancelOrder=e.target.closest('[data-cancel-shop-order]');if(cancelOrder)return customerCancelShopOrder(cancelOrder.dataset.cancelShopOrder);
      const pay=e.target.closest('[data-pay-order]');if(pay)return openPayment(pay.dataset.payOrder);
      if(e.target.closest('#submitPaymentBtn'))return submitPayment();
      const seller=e.target.closest('[data-seller-shop]');if(seller)return openSellerShop(seller.dataset.sellerShop);
      if(e.target.closest('#saveOrderSettingsBtn'))return saveOrderSettings();
      if(e.target.closest('#addProductCategoryBtn'))return addProductCategory();
      const editCat=e.target.closest('[data-edit-product-category]');if(editCat)return editProductCategory(editCat.dataset.editProductCategory);
      const deleteCat=e.target.closest('[data-delete-product-category]');if(deleteCat)return deleteProductCategory(deleteCat.dataset.deleteProductCategory);
      const catUp=e.target.closest('[data-category-up]');if(catUp)return moveProductCategory(catUp.dataset.categoryUp,-1);
      const catDown=e.target.closest('[data-category-down]');if(catDown)return moveProductCategory(catDown.dataset.categoryDown,1);
      const catFilter=e.target.closest('[data-product-category-filter]');if(catFilter)return applyProductCategoryFilter(catFilter.dataset.productCategoryFilter);
      if(e.target.closest('#addProductBtn'))return openProductEditor();
      const toggleProduct=e.target.closest('[data-toggle-product-status]');if(toggleProduct)return quickToggleProductStatus(toggleProduct.dataset.toggleProductStatus,toggleProduct.dataset.currentStatus);
      const editp=e.target.closest('[data-edit-product]');if(editp)return openProductEditor(editp.dataset.editProduct);
      const delp=e.target.closest('[data-delete-product]');if(delp)return deleteProduct(delp.dataset.deleteProduct);
      const optp=e.target.closest('[data-product-options]');if(optp)return openProductOptions(optp.dataset.productOptions);
      if(e.target.closest('#addOptionGroupBtn'))return addOptionGroup();
      const addov=e.target.closest('[data-add-option-value]');if(addov)return addOptionValue(addov.dataset.addOptionValue);
      const editog=e.target.closest('[data-edit-option-group]');if(editog)return editOptionGroup(editog.dataset.editOptionGroup);
      const delog=e.target.closest('[data-delete-option-group]');if(delog)return deleteOptionGroup(delog.dataset.deleteOptionGroup);
      const editov=e.target.closest('[data-edit-option-value]');if(editov)return editOptionValue(editov.dataset.editOptionValue);
      const delov=e.target.closest('[data-delete-option-value]');if(delov)return deleteOptionValue(delov.dataset.deleteOptionValue);
      if(e.target.closest('#draftAddOptionGroup'))return draftAddOptionGroup();
      const drg=e.target.closest('[data-draft-remove-group]');if(drg)return draftRemoveOptionGroup(Number(drg.dataset.draftRemoveGroup));
      const drv=e.target.closest('[data-draft-add-value]');if(drv)return draftAddOptionValue(Number(drv.dataset.draftAddValue));
      const drvv=e.target.closest('[data-draft-remove-value]');if(drvv)return draftRemoveOptionValue(Number(drvv.dataset.draftRemoveValue.split(':')[0]),Number(drvv.dataset.draftRemoveValue.split(':')[1]));
      if(e.target.closest('#saveProductBtn'))return saveProduct();
      const pickupDone=e.target.closest('[data-pickup-complete]');if(pickupDone)return sellerCompletePickup(pickupDone.dataset.pickupComplete);const setst=e.target.closest('[data-order-status]');if(setst)return sellerSetStatus(setst.dataset.orderId,setst.dataset.orderStatus);
      const reject=e.target.closest('[data-reject-order]');if(reject)return sellerRejectOrder(reject.dataset.rejectOrder);
      const refund=e.target.closest('[data-refund-order]');if(refund)return openRefundModal(refund.dataset.refundOrder);
      if(e.target.closest('#submitRefundBtn'))return submitRefund();
      if(e.target.closest('#enableOrderPushBtn'))return enableOrderPush();
      if(e.target.closest('#disableOrderPushBtn'))return disableOrderPush();
      if(e.target.closest('#testOrderPushBtn'))return testOrderPush();
      const rd=e.target.closest('[data-refund-destination]');if(rd)return openRefundDestination(rd.dataset.refundDestination);
      if(e.target.closest('#saveRefundDestinationBtn'))return saveRefundDestination();
      const rtype=e.target.closest('#refundDestinationType');if(rtype)return renderRefundDestinationFields();
      const confirmRefund=e.target.closest('[data-confirm-refund]');if(confirmRefund)return customerConfirmRefund(confirmRefund.dataset.confirmRefund);
      const cancelCustomer=e.target.closest('[data-customer-cancel-order]');if(cancelCustomer)return customerCancelOrder(cancelCustomer.dataset.customerCancelOrder);
      const cancelProblem=e.target.closest('[data-cancel-problem-shop]');if(cancelProblem)return customerCancelProblemShop(cancelProblem.dataset.cancelProblemShop);const proof=e.target.closest('[data-view-delivery-proof]');if(proof)return viewDeliveryProof(proof.dataset.viewDeliveryProof);const confirmDelivery=e.target.closest('[data-confirm-delivery]');if(confirmDelivery)return customerConfirmDelivery(confirmDelivery.dataset.confirmDelivery);const reportDelivery=e.target.closest('[data-report-delivery-issue]');if(reportDelivery)return customerReportDeliveryIssue(reportDelivery.dataset.reportDeliveryIssue);const ship=e.target.closest('[data-create-delivery]');if(ship)return createDelivery(ship.dataset.createDelivery);
      const hubtab=e.target.closest('[data-hub-tab]');if(hubtab)return document.getElementById('hubContent')?renderHubTab(hubtab.dataset.hubTab):openAccountHub(hubtab.dataset.hubTab);
      const cot=e.target.closest('[data-customer-order-tab]');if(cot){customerOrderTab=cot.dataset.customerOrderTab;customerOrderPage=1;return renderHubTab('customer');}
      const sot=e.target.closest('[data-seller-order-tab]');if(sot){sellerOrderTab=sot.dataset.sellerOrderTab;sellerOrderPage=1;const sid=document.getElementById('sellerShopId')?.value;return sid?openSellerShop(sid):null;}
      if(e.target.closest('#customerLoadMoreOrders')){customerOrderPage++;return renderHubTab('customer');}
      if(e.target.closest('#sellerLoadMoreOrders')){sellerOrderPage++;const sid=document.getElementById('sellerShopId')?.value;return sid?openSellerShop(sid):null;}
    });
    document.addEventListener('input',e=>{const el=e.target.closest('[data-draft-field]');if(el)draftFieldChanged(el);const q=e.target.closest('#orderSearchInput');if(q){orderSearchTerm=q.value||'';customerOrderPage=1;sellerOrderPage=1;clearTimeout(window.__orderSearchTimer);window.__orderSearchTimer=setTimeout(()=>{const sid=document.getElementById('sellerShopId')?.value;if(sid)openSellerShop(sid);else renderHubTab('customer');},250);}});
    document.addEventListener('change',e=>{if(e.target.id==='coProvince')return provinceChanged();if(e.target.id==='coDistrict')return districtChanged();if(e.target.id==='coSubdistrict')return subdistrictChanged();const el=e.target.closest('[data-draft-field]');if(el)draftFieldChanged(el);if(e.target.closest('[data-option-value]'))updateCustomProductTotal();const df=e.target.closest('#orderDateFilter');if(df){orderDateFilter=df.value;customerOrderPage=1;sellerOrderPage=1;const sid=document.getElementById('sellerShopId')?.value;if(sid)openSellerShop(sid);else renderHubTab('customer');}});
  }
  function openModal(html,wide=false){const m=document.getElementById('marketOrderModal');m.querySelector('.market-order-panel').classList.toggle('wide',wide);document.getElementById('marketOrderBody').innerHTML=html;m.classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeModal(){document.getElementById('marketOrderModal')?.classList.add('hidden');document.body.style.overflow='';}
  function requireLogin(){alert('กรุณาเข้าสู่ระบบก่อนทำรายการ');document.getElementById('accountBtn')?.click();}
  async function ensureCheckoutSession(){
    if(session?.user)return session;
    const {data,error}=await db.auth.signInAnonymously();
    if(error)throw new Error('ยังไม่สามารถสั่งซื้อแบบไม่สมัครสมาชิกได้: '+error.message);
    session=data?.session||null;
    renderNavState();applyOrderAccess();
    return session;
  }
  function isGuestSession(){return !!session?.user?.is_anonymous;}
  function applyOrderAccess(){
    const allowed=canUseOrders();
    const nav=document.getElementById('marketOrdersBtn'),cart=document.getElementById('marketCartBtn');
    if(nav)nav.style.display=allowed?'':'none';
    if(cart)cart.style.display=allowed?'':'none';
    if(!allowed){document.querySelectorAll('[data-market-order-shop]').forEach(el=>el.remove());closeModal();}
  }
  function renderNavState(){const b=document.getElementById('marketOrdersBtn');if(b)b.title=session&&!isGuestSession()?'ดูออเดอร์และจัดการร้าน':'ดูออเดอร์ของฉัน · ไม่ต้องสมัครสมาชิก';}
  function updateCartBadge(){const c=getCart(),n=c.reduce((s,x)=>s+Number(x.qty||0),0);const x=document.querySelector('#marketCartBtn .count');if(x)x.textContent=n;}

  async function imageToBitmap(file){
    if(window.createImageBitmap){try{return await createImageBitmap(file)}catch(_){}}
    return await new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('อ่านไฟล์รูปไม่สำเร็จ กรุณาใช้ JPG, PNG หรือ WebP'))};
      img.src=url;
    });
  }
  function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('บีบอัดรูปไม่สำเร็จ')),type,quality));}
  async function compressImage(file,{maxSide=1200,targetBytes=300*1024,quality=.82,minQuality=.58}={}){
    if(!file||!String(file.type||'').startsWith('image/'))throw new Error('กรุณาเลือกไฟล์รูปภาพ');
    if(file.size>15*1024*1024)throw new Error('ไฟล์ต้นฉบับต้องไม่เกิน 15 MB');
    const img=await imageToBitmap(file),sw=img.width||img.naturalWidth,sh=img.height||img.naturalHeight;
    if(!sw||!sh)throw new Error('อ่านขนาดรูปไม่สำเร็จ');
    let scale=Math.min(1,maxSide/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
    let q=quality,blob;
    for(let pass=0;pass<7;pass++){
      const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
      blob=await canvasBlob(c,'image/webp',q);
      if(blob.size<=targetBytes)break;
      if(q>minQuality+.04) q=Math.max(minQuality,q-.10);
      else {w=Math.max(320,Math.round(w*.85));h=Math.max(1,Math.round(h*.85));q=quality-.08;}
    }
    if(img.close)try{img.close()}catch(_){}
    return new File([blob],(file.name.replace(/\.[^.]+$/,'')||'image')+'.webp',{type:'image/webp',lastModified:Date.now()});
  }
  async function safeRemove(bucket,path){if(!path)return true;const {error}=await db.storage.from(bucket).remove([path]);if(error){console.warn('ลบไฟล์เก่าไม่สำเร็จ',path,error.message);return false}return true;}

  async function refreshProductShops(){
    const [{data:access,error:aErr},{data:settings,error:sErr},{data:products,error:pErr}]=await Promise.all([
      db.from('market_order_shop_access').select('shop_id').eq('enabled',true).limit(5000),
      db.from('market_shop_order_settings').select('shop_id,enabled').eq('enabled',true).limit(5000),
      db.from('market_products').select('shop_id').eq('sale_status','available').limit(5000)
    ]);
    const error=aErr||sErr||pErr;
    if(error){console.debug('Order access not ready:',error.message);productShopIds=new Set();return;}
    const allowed=new Set((access||[]).map(x=>String(x.shop_id)));
    const opened=new Set((settings||[]).map(x=>String(x.shop_id)));
    productShopIds=new Set((products||[]).map(x=>String(x.shop_id)).filter(id=>allowed.has(id)&&opened.has(id)));
  }
  function decorateShopCards(){
    if(!canUseOrders())return;
    document.querySelectorAll('.card[data-id]').forEach(card=>{
      const id=String(card.dataset.id||''); if(!productShopIds.has(id)||card.querySelector('[data-market-order-shop]'))return;
      const actions=card.querySelector('.community-actions')||card.querySelector('.card-body');if(!actions)return;
      const b=document.createElement('button');b.className='market-order-btn';b.dataset.marketOrderShop=id;b.textContent='🛒 สั่งซื้อผ่านตลาด';b.style.cssText='display:block;width:100%;max-width:none;margin:12px auto 4px;border:0;border-radius:12px;background:#8f0d12;color:#fff;padding:14px 12px;min-height:52px;text-align:center;white-space:nowrap;font:800 clamp(14px,3.8vw,17px) Prompt,sans-serif;box-shadow:0 5px 14px rgba(143,13,18,.28);cursor:pointer';const row=document.createElement('div');row.className='market-order-cta-row';row.appendChild(b);
      const delivery=card.querySelector('.delivery-links');
      const contact=card.querySelector('.links');
      if(delivery)delivery.insertAdjacentElement('afterend',row);
      else if(contact)contact.insertAdjacentElement('afterend',row);
      else actions.insertAdjacentElement('beforebegin',row);
    });
    const detail=document.getElementById('detailSummary');
    if(detail&&!detail.querySelector('[data-market-order-shop]')){
      const id=document.getElementById('reviewShopId')?.value;if(id&&productShopIds.has(String(id))){const b=document.createElement('button');b.className='market-order-btn';b.dataset.marketOrderShop=id;b.textContent='🛒 ดูสินค้าและสั่งซื้อ';b.style.cssText='display:block;width:100%;max-width:none;margin:10px auto 14px;border:0;border-radius:12px;background:#8f0d12;color:#fff;padding:14px 12px;min-height:52px;text-align:center;white-space:nowrap;font:800 clamp(14px,3.8vw,17px) Prompt,sans-serif;box-shadow:0 5px 14px rgba(143,13,18,.28);cursor:pointer';const row=document.createElement('div');row.className='market-order-cta-row detail-order-cta-row';row.appendChild(b);const delivery=detail.querySelector('.delivery-links');const links=detail.querySelector('.links');if(delivery)delivery.insertAdjacentElement('afterend',row);else if(links)links.insertAdjacentElement('afterend',row);else detail.prepend(row);}
    }
  }

  function applyProductCategoryFilter(categoryId){
    document.querySelectorAll('[data-product-category-filter]').forEach(b=>b.classList.toggle('active',String(b.dataset.productCategoryFilter)===String(categoryId)));
    document.querySelectorAll('[data-product-card-category]').forEach(card=>{
      card.style.display=categoryId==='all'||String(card.dataset.productCardCategory||'uncategorized')===String(categoryId)?'':'none';
    });
  }
  async function addProductCategory(){
    const shopId=document.getElementById('sellerShopId')?.value;if(!shopId)return;
    const name=prompt('ชื่อหมวดหมู่สินค้า\nเช่น ไอศกรีม / เครื่องดื่ม / เบเกอรี่');if(name===null)return;
    const clean=name.trim();if(!clean)return alert('กรุณาระบุชื่อหมวดหมู่');
    const {count}=await db.from('market_product_categories').select('id',{count:'exact',head:true}).eq('shop_id',shopId);
    if(Number(count||0)>=30)return alert('ร้านหนึ่งสร้างหมวดหมู่ได้สูงสุด 30 หมวด');
    const {data:last}=await db.from('market_product_categories').select('sort_order').eq('shop_id',shopId).order('sort_order',{ascending:false}).limit(1);
    const sort=(last?.[0]?.sort_order||0)+10;
    const {error}=await db.from('market_product_categories').insert({shop_id:shopId,name:clean.slice(0,80),sort_order:sort});
    if(error)return alert(error.message);
    openSellerShop(shopId);
  }
  async function editProductCategory(categoryId){
    const {data:c,error}=await db.from('market_product_categories').select('id,shop_id,name').eq('id',categoryId).maybeSingle();
    if(error||!c)return alert(error?.message||'ไม่พบหมวดหมู่');
    const name=prompt('แก้ไขชื่อหมวดหมู่',c.name||'');if(name===null)return;
    const clean=name.trim();if(!clean)return alert('ชื่อหมวดหมู่ห้ามว่าง');
    const {error:e}=await db.from('market_product_categories').update({name:clean.slice(0,80),updated_at:new Date().toISOString()}).eq('id',categoryId);
    if(e)return alert(e.message);openSellerShop(c.shop_id);
  }
  async function deleteProductCategory(categoryId){
    const {data:c,error}=await db.from('market_product_categories').select('id,shop_id,name').eq('id',categoryId).maybeSingle();
    if(error||!c)return alert(error?.message||'ไม่พบหมวดหมู่');
    if(!confirm(`ลบหมวด “${c.name}” หรือไม่?\n\nสินค้าจะไม่ถูกลบ แต่จะย้ายไป “อื่น ๆ”`))return;
    const {error:e}=await db.from('market_product_categories').delete().eq('id',categoryId);
    if(e)return alert(e.message);openSellerShop(c.shop_id);
  }
  async function moveProductCategory(categoryId,dir){
    const {data:c,error}=await db.from('market_product_categories').select('id,shop_id,sort_order').eq('id',categoryId).maybeSingle();
    if(error||!c)return;
    const {data:list}=await db.from('market_product_categories').select('id,sort_order').eq('shop_id',c.shop_id).order('sort_order').order('created_at');
    const i=(list||[]).findIndex(x=>String(x.id)===String(categoryId)),j=i+Number(dir);
    if(i<0||j<0||j>=list.length)return;
    const a=list[i],b=list[j],sa=Number(a.sort_order||0),sb=Number(b.sort_order||0);
    await Promise.all([
      db.from('market_product_categories').update({sort_order:sb,updated_at:new Date().toISOString()}).eq('id',a.id),
      db.from('market_product_categories').update({sort_order:sa,updated_at:new Date().toISOString()}).eq('id',b.id)
    ]);
    openSellerShop(c.shop_id);
  }
  async function openShopMenu(shopId){
    if(!canUseOrders())return;
    const [{data:shop},{data:setting},{data:access},{data:categories},{data:products,error}]=await Promise.all([
      db.from('market_shops').select('id,name,cover_url').eq('id',shopId).maybeSingle(),
      db.from('market_shop_order_settings').select('*').eq('shop_id',shopId).maybeSingle(),
      db.from('market_order_shop_access').select('enabled').eq('shop_id',shopId).maybeSingle(),
      db.from('market_product_categories').select('*').eq('shop_id',shopId).eq('active',true).order('sort_order').order('created_at'),
      db.from('market_products').select('*').eq('shop_id',shopId).neq('sale_status','discontinued').order('sort_order').order('created_at')
    ]);
    if(error)return alert('โหลดสินค้าไม่สำเร็จ: '+error.message);
    const av=access?.enabled?shopAvailability(setting):{ok:false,msg:'ร้านนี้ยังไม่ได้เปิดสิทธิ์สั่งซื้อผ่านระบบจริง'};
    const notice=av.ok?`<div class="mo-muted">${esc(av.msg)} · เลือกสินค้าใส่ตะกร้าได้ และสั่งจากหลายร้านพร้อมกัน</div>`:`<div class="warning-banner">⏸️ ${esc(av.msg)}</div>`;
    const used=new Set((products||[]).map(p=>p.category_id).filter(Boolean).map(String));
    const visibleCats=(categories||[]).filter(c=>used.has(String(c.id)));
    const hasUncategorized=(products||[]).some(p=>!p.category_id);
    const catBar=(visibleCats.length||hasUncategorized)?`<div class="product-category-tabs"><button class="active" data-product-category-filter="all">ทั้งหมด</button>${visibleCats.map(c=>`<button data-product-category-filter="${esc(c.id)}">${esc(c.name)}</button>`).join('')}${hasUncategorized?'<button data-product-category-filter="uncategorized">อื่น ๆ</button>':''}</div>`:'';
    openModal(`<h2 class="mo-title">${esc(shop?.name||'ร้านค้า')}</h2>${notice}${catBar}<div class="product-grid">${(products||[]).map(p=>{const sold=p.sale_status==='sold_out',can=av.ok&&p.sale_status==='available';return `<article class="product-card" data-product-card-category="${esc(p.category_id||'uncategorized')}">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:'<div style="aspect-ratio:4/3;background:#f3f3f3;display:grid;place-items:center;font-size:42px">🛍️</div>'}<div class="body"><h4>${esc(p.name)}</h4><p>${esc(p.description||'')}</p><div class="price">${money(p.price)} บาท</div>${sold?'<div class="status-pill">หมดชั่วคราว</div>':''}<button ${can?`data-add-product="${esc(p.id)}"`:'disabled'}>${sold?'สินค้าหมด':av.ok?'+ ใส่ตะกร้า':'ยังไม่เปิดรับออเดอร์'}</button></div></article>`}).join('')||'<p>ร้านนี้ยังไม่มีสินค้าที่เปิดขาย</p>'}</div>`,true);
  }
  async function addProduct(productId){
    const {data:p,error}=await db.from('market_products').select('id,shop_id,name,price,image_url,sale_status,shop:market_shops(name)').eq('id',productId).eq('sale_status','available').maybeSingle();
    if(error||!p)return alert(error?.message||'สินค้านี้ไม่พร้อมขาย');
    const {data:access}=await db.from('market_order_shop_access').select('enabled').eq('shop_id',p.shop_id).maybeSingle();
    if(!access?.enabled)return alert('ร้านนี้ยังไม่ได้เปิดสิทธิ์รับออเดอร์ผ่านระบบจริง');
    const [{data:groups,error:gErr},{data:values,error:vErr}]=await Promise.all([
      db.from('market_product_option_groups').select('*').eq('product_id',productId).eq('active',true).order('sort_order').order('created_at'),
      db.from('market_product_option_values').select('*,group:market_product_option_groups!inner(product_id)').eq('active',true).eq('group.product_id',productId).order('sort_order').order('created_at')
    ]);
    if(gErr||vErr)return alert((gErr||vErr).message);
    const gs=(groups||[]).map(g=>({...g,values:(values||[]).filter(v=>String(v.group_id)===String(g.id))}));
    const optionsHtml=gs.map(g=>{const min=Math.max(Number(g.min_select||0),g.required?1:0),max=g.selection_type==='single'?1:Math.max(1,Number(g.max_select||1)),type=g.selection_type==='single'?'radio':'checkbox',name=`og_${g.id}`,helper=g.selection_type==='single'?(min>0?'ต้องเลือก 1 อย่าง':'เลือกได้ 1 อย่าง'):(min>0?`เลือก ${min}–${max} รายการ`:`เลือกได้สูงสุด ${max} รายการ`);return `<fieldset class="payment-card option-group" data-option-group="${g.id}" data-min="${min}" data-max="${max}" style="padding:0;overflow:hidden;border-radius:18px"><legend style="padding:0 14px"><b>${esc(g.name)}</b> <span class="status-pill">${helper}</span></legend><div class="mo-muted" style="padding:0 16px 10px">${helper}</div><div style="border-top:1px solid #eee">${g.values.map(v=>{const d=Number(v.price_delta||0);return `<label style="display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:58px;padding:10px 16px;border-bottom:1px solid #eee;cursor:pointer"><input data-option-value type="${type}" name="${name}" value="${v.id}" data-group-id="${g.id}" data-group-name="${esc(g.name)}" data-value-name="${esc(v.name)}" data-price-delta="${d}" style="width:22px;height:22px;margin:0"><span style="font-weight:700;line-height:1.25">${esc(v.name)}</span><span style="font-weight:800;white-space:nowrap;${d?'color:#b51217':'color:#999'}">${d?`+${money(d)} บาท`:''}</span></label>`}).join('')||'<div class="warning-banner" style="margin:12px">กลุ่มนี้ยังไม่มีตัวเลือก กรุณาแจ้งร้าน</div>'}</div></fieldset>`}).join('');
    openModal(`<input id="customProductId" type="hidden" value="${p.id}"><input id="customShopId" type="hidden" value="${p.shop_id}"><input id="customProductName" type="hidden" value="${esc(p.name)}"><input id="customShopName" type="hidden" value="${esc(p.shop?.name||'ร้านค้า')}"><input id="customBasePrice" type="hidden" value="${Number(p.price)}"><input id="customImageUrl" type="hidden" value="${esc(p.image_url||'')}"><input id="customProductQty" type="hidden" value="1"><h2 class="mo-title">${esc(p.name)}</h2><div class="price" style="font-size:22px;font-weight:800;margin-bottom:14px">เริ่มต้น ${money(p.price)} บาท</div>${optionsHtml}<label style="display:block;margin-top:14px"><b>หมายเหตุถึงร้าน</b> <span class="mo-muted">(ไม่บังคับ สูงสุด 200 ตัวอักษร)</span><textarea id="productLineNote" maxlength="200" rows="3" placeholder="เช่น ไม่ใส่ผัก / แยกน้ำ / หวานน้อยเป็นพิเศษ" style="margin-top:8px"></textarea></label><div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end;margin-top:16px;padding-top:14px;border-top:1px solid #eee"><div><b>จำนวน</b><div style="display:flex;align-items:center;gap:8px;margin-top:8px"><button type="button" id="customQtyMinus" class="mo-secondary" style="min-width:44px">−</button><b id="customQtyLabel" style="min-width:28px;text-align:center">1</b><button type="button" id="customQtyPlus" class="mo-secondary" style="min-width:44px">+</button></div></div><div style="text-align:right"><div class="mo-muted">รวม</div><div id="customProductTotal" style="font-size:22px;font-weight:900;color:#b51217">${money(p.price)} บาท</div></div></div><div class="mo-actions" style="margin-top:14px"><button id="confirmAddConfiguredProduct" class="mo-primary" style="width:100%;font-size:18px">🛒 + ใส่ตะกร้า</button></div>`,true);updateCustomProductTotal();
  }
  function selectedCustomOptionTotal(){return [...document.querySelectorAll('[data-option-value]:checked')].reduce((s,el)=>s+Number(el.dataset.priceDelta||0),0);}
  function updateCustomProductTotal(){const base=Number(document.getElementById('customBasePrice')?.value||0),qty=Math.max(1,Number(document.getElementById('customProductQty')?.value||1)),total=(base+selectedCustomOptionTotal())*qty;const x=document.getElementById('customProductTotal');if(x)x.textContent=`${money(total)} บาท`;const q=document.getElementById('customQtyLabel');if(q)q.textContent=String(qty);}
  function changeCustomQty(delta){const el=document.getElementById('customProductQty');if(!el)return;el.value=String(Math.max(1,Math.min(99,Number(el.value||1)+Number(delta||0))));updateCustomProductTotal();}
  function confirmAddConfiguredProduct(){
    const sections=[...document.querySelectorAll('[data-option-group]')];
    for(const sec of sections){const n=sec.querySelectorAll('[data-option-value]:checked').length,min=Number(sec.dataset.min||0),max=Number(sec.dataset.max||1),title=sec.querySelector('legend b')?.textContent||'ตัวเลือก';if(n<min)return alert(`กรุณาเลือก ${title}`);if(n>max)return alert(`${title} เลือกได้สูงสุด ${max} รายการ`);}
    const selected=[...document.querySelectorAll('[data-option-value]:checked')].map(el=>({group_id:el.dataset.groupId,group_name:el.dataset.groupName,value_id:el.value,value_name:el.dataset.valueName,price_delta:Number(el.dataset.priceDelta||0)}));
    const product_id=document.getElementById('customProductId').value,shop_id=document.getElementById('customShopId').value,name=document.getElementById('customProductName').value,shop_name=document.getElementById('customShopName').value,base_price=Number(document.getElementById('customBasePrice').value),image_url=document.getElementById('customImageUrl').value,note=String(document.getElementById('productLineNote')?.value||'').trim().slice(0,200),option_total=selected.reduce((s,x)=>s+x.price_delta,0),price=base_price+option_total,qty=Math.max(1,Math.min(99,Number(document.getElementById('customProductQty')?.value||1)));
    const signature=JSON.stringify([product_id,selected.map(x=>x.value_id).sort(),note]);let c=getCart(),found=c.find(x=>x.signature===signature);
    if(found)found.qty+=qty;else c.push({line_id:uuid(),signature,product_id,shop_id,shop_name,name,base_price,option_total,price,image_url,selected_options:selected,note,qty});saveCart(c);closeModal();alert('เพิ่มลงตะกร้าแล้ว');
  }
  function cartLineExtra(x){const opts=(x.selected_options||[]).map(o=>`${esc(o.group_name)}: ${esc(o.value_name)}${Number(o.price_delta||0)?` (+${money(o.price_delta)}฿)`:''}`).join(' · '),note=x.note?`<div class="mo-muted">📝 ${esc(x.note)}</div>`:'';return `${opts?`<div class="mo-muted">${opts}</div>`:''}${note}`;}
  function renderCart(){const groups=groupedCart(),total=getCart().reduce((s,x)=>s+Number(x.price||0)*x.qty,0);openModal(`<h2 class="mo-title">🛒 ตะกร้าของฉัน</h2><div class="mo-muted">ตะกร้าเดียว สั่งได้หลายร้าน ระบบจะแยกยอดเงินให้แต่ละร้านอัตโนมัติ</div>${groups.map(g=>`<section class="cart-shop"><div class="cart-shop-head">🏪 ${esc(g.shop_name)}</div>${g.items.map(x=>`<div class="cart-line"><div><b>${esc(x.name)}</b>${cartLineExtra(x)}<small>${money(x.price)} บาท × ${x.qty} = ${money(x.price*x.qty)} บาท</small></div><div class="qty-control"><button data-cart-qty="${x.line_id}" data-delta="-1">−</button><b>${x.qty}</b><button data-cart-qty="${x.line_id}" data-delta="1">+</button><button data-cart-remove="${x.line_id}" title="ลบ">🗑️</button></div></div>`).join('')}</section>`).join('')||'<p>ยังไม่มีสินค้าในตะกร้า</p>'}<div class="cart-total"><span>รวมค่าสินค้า</span><span>${money(total)} บาท</span></div>${groups.length?`<button id="goCheckoutBtn" class="mo-primary" style="width:100%">ดำเนินการสั่งซื้อ</button>`:''}`);}
  function changeQty(lineId,d){let c=getCart();const x=c.find(i=>i.line_id===lineId);if(!x)return;x.qty=Math.max(1,x.qty+d);saveCart(c);renderCart();}
  function removeLine(lineId){saveCart(getCart().filter(x=>x.line_id!==lineId));renderCart();}


  const THAI_DELIVERY_ADDRESS={"สมุทรสาคร":{"กระทุ่มแบน":{"74110":["ตลาดกระทุ่มแบน","คลองมะเดื่อ","ดอนไก่ดี","ท่าไม้","ท่าเสา","บางยาง","สวนหลวง","แคราย","อ้อมน้อย","หนองนกไข่"]},"เมืองสมุทรสาคร":{"74000":["มหาชัย","ท่าฉลอม","โกรกกราก","บ้านบ่อ","บางโทรัด","กาหลง","นาโคก","ท่าจีน","นาดี","ท่าทราย","คอกกระบือ","บางน้ำจืด","พันท้ายนรสิงห์","โคกขาม","บ้านเกาะ","บางกระเจ้า","ชัยมงคล"],"74100":["บางหญ้าแพรก"]},"บ้านแพ้ว":{"74120":["บ้านแพ้ว","หลักสาม","ยกกระบัตร","โรงเข้","หนองสองห้อง","หนองบัว","หลักสอง","เจ็ดริ้ว","คลองตัน","อำแพง","สวนส้ม","เกษตรพัฒนา"]}},"นครปฐม":{"สามพราน":{"73110":["ท่าข้าม","ทรงคนอง","หอมเกร็ด","บางกระทึก","บางเตย","สามพราน","บางช้าง","ไร่ขิง","กระทุ่มล้ม","คลองใหม่","ตลาดจินดา","คลองจินดา","ยายชา","บ้านใหม่","อ้อมใหญ่","ท่าตลาด"]},"พุทธมณฑล":{"73170":["ศาลายา","คลองโยง","มหาสวัสดิ์"]}},"กรุงเทพมหานคร":{"หนองแขม":{"10160":["หนองแขม","หนองค้างพลู"]},"บางบอน":{"10150":["บางบอนเหนือ","บางบอนใต้","คลองบางพราน","คลองบางบอน"]},"บางแค":{"10160":["บางแค","บางแคเหนือ","บางไผ่","หลักสอง"]}}};
  function fillAddressSelect(select,items,selected,placeholder){
    if(!select)return;
    select.innerHTML=`<option value="">${placeholder}</option>`+(items||[]).map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
  }
  function provinceChanged(selectedDistrict='',selectedSubdistrict='',selectedPostal=''){
    const prov=document.getElementById('coProvince')?.value||'';
    const districts=Object.keys(THAI_DELIVERY_ADDRESS[prov]||{});
    fillAddressSelect(document.getElementById('coDistrict'),districts,selectedDistrict,'เลือกอำเภอ / เขต');
    districtChanged(selectedSubdistrict,selectedPostal);
  }
  function districtChanged(selectedSubdistrict='',selectedPostal=''){
    const prov=document.getElementById('coProvince')?.value||'',dist=document.getElementById('coDistrict')?.value||'';
    const zips=THAI_DELIVERY_ADDRESS[prov]?.[dist]||{},subs=[];
    Object.entries(zips).forEach(([zip,names])=>(names||[]).forEach(name=>subs.push({name,zip})));
    const sel=document.getElementById('coSubdistrict');
    if(sel)sel.innerHTML='<option value="">เลือกตำบล / แขวง</option>'+subs.map(x=>`<option value="${esc(x.name)}" data-postal="${esc(x.zip)}" ${x.name===selectedSubdistrict?'selected':''}>${esc(x.name)}</option>`).join('');
    const chosen=subs.find(x=>x.name===selectedSubdistrict);
    const postal=document.getElementById('coPostal');if(postal)postal.value=chosen?.zip||selectedPostal||'';
  }
  function subdistrictChanged(){
    const sel=document.getElementById('coSubdistrict'),postal=document.getElementById('coPostal');
    if(postal)postal.value=sel?.selectedOptions?.[0]?.dataset?.postal||'';
  }
  function initThaiAddressSelectors(saved={}){
    const provinces=Object.keys(THAI_DELIVERY_ADDRESS);
    fillAddressSelect(document.getElementById('coProvince'),provinces,saved.province||'สมุทรสาคร','เลือกจังหวัด');
    provinceChanged(saved.district||'กระทุ่มแบน',saved.subdistrict||'',saved.postal||'');
  }

  function savedDeliveryAddressKey(){return `market_delivery_address_${session?.user?.id||'guest'}`}
  function loadSavedDeliveryAddress(){try{return JSON.parse(localStorage.getItem(savedDeliveryAddressKey())||'null')||{}}catch(_e){return {}}}
  function buildDeliveryAddress(){
    const val=id=>document.getElementById(id)?.value.trim()||'';
    const parts=[];
    const house=val('coHouse'),moo=val('coMoo'),soi=val('coSoi'),road=val('coRoad');
    const sub=val('coSubdistrict'),dist=val('coDistrict'),prov=val('coProvince'),zip=val('coPostal'),landmark=val('coLandmark');
    if(house)parts.push(house);
    if(moo)parts.push(`หมู่ ${moo}`);
    if(soi)parts.push(`ซอย ${soi}`);
    if(road)parts.push(`ถนน ${road}`);
    const isBkk=prov==='กรุงเทพมหานคร';
    if(sub)parts.push(`${isBkk?'แขวง':'ต.'}${sub}`);
    if(dist)parts.push(`${isBkk?'เขต':'อ.'}${dist}`);
    if(prov)parts.push(isBkk?prov:`จ.${prov}`);
    if(zip)parts.push(zip);
    if(landmark)parts.push(`จุดสังเกต: ${landmark}`);
    return parts.join(' ');
  }
  function fillSavedDeliveryAddress(){
    const a=loadSavedDeliveryAddress(),set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null)el.value=v};
    set('coName',a.name);set('coPhone',a.phone);set('coHouse',a.house);set('coMoo',a.moo);set('coSoi',a.soi);set('coRoad',a.road);
    initThaiAddressSelectors(a);
    set('coLandmark',a.landmark);set('coLat',a.lat);set('coLng',a.lng);
    updateDeliveryLocationStatus();
  }
  function saveDeliveryAddressDraft(){
    if(!document.getElementById('saveDeliveryAddress')?.checked)return;
    const val=id=>document.getElementById(id)?.value.trim()||'';
    const a={name:val('coName'),phone:val('coPhone'),house:val('coHouse'),moo:val('coMoo'),soi:val('coSoi'),road:val('coRoad'),
      subdistrict:val('coSubdistrict'),district:val('coDistrict'),province:val('coProvince'),postal:val('coPostal'),landmark:val('coLandmark'),
      lat:val('coLat'),lng:val('coLng')};
    localStorage.setItem(savedDeliveryAddressKey(),JSON.stringify(a));
  }
  function updateDeliveryLocationStatus(){
    const lat=Number(document.getElementById('coLat')?.value),lng=Number(document.getElementById('coLng')?.value),box=document.getElementById('deliveryLocationStatus');
    if(!box)return;
    if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat&&lng)box.innerHTML=`✅ ปักหมุดแล้ว <small>${lat.toFixed(5)}, ${lng.toFixed(5)}</small>`;
    else box.textContent='⚠️ ยังไม่ได้ปักหมุดตำแหน่งสำหรับวิน';
  }

  function deliveryFareInfoSeenKey(){return `market_delivery_fare_info_seen_${session?.user?.id||'guest'}`}
  function deliveryFareInfoHtml(){
    return `<h2 class="mo-title">🛵 วิธีคิดค่าจัดส่ง</h2>
      <div class="payment-card">
        <div style="font-size:15px;line-height:1.65">
          <b>ค่าจัดส่งเริ่มต้น 25 บาท</b> สำหรับระยะทางรวม 0–2 กม.<br>
          เกิน 2 กม. <b>เพิ่ม 10 บาท ทุก ๆ 2 กม.</b><br>
          จุดรับร้านแรก <b>รวมในราคาแล้ว</b><br>
          จุดรับร้านที่ 2 เป็นต้นไป <b>เพิ่มจุดละ 10 บาท</b><br>
          รองรับสูงสุด <b>5 จุดรับ</b> และระยะทางรวมต้องไม่เกิน <b>10 กม.</b>
        </div>
      </div>
      <div class="ready-banner">ก่อนเรียกวิน ระบบจะแสดงราคาประมาณการจริงให้ยืนยันทุกครั้ง</div>
      <div class="mo-muted">ตัวอย่าง: 3 ร้าน ระยะทางรวม 4 กม. → ค่าระยะทาง 35 บาท + จุดรับเพิ่ม 2 จุด = 20 บาท รวมประมาณ 55 บาท</div>
      <div class="mo-actions"><button id="closeDeliveryFareInfoBtn" class="mo-primary">เข้าใจแล้ว</button></div>`;
  }
  function showDeliveryFareInfo(markSeen=true){
    if(markSeen)try{localStorage.setItem(deliveryFareInfoSeenKey(),'1')}catch(_e){}
    openModal(deliveryFareInfoHtml());
  }
  function maybeShowDeliveryFareInfo(){
    let seen=false;try{seen=localStorage.getItem(deliveryFareInfoSeenKey())==='1'}catch(_e){}
    if(!seen)setTimeout(()=>showDeliveryFareInfo(true),180);
  }


  async function openCheckout(){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}
    const groups=groupedCart();if(!groups.length)return renderCart();if(groups.length>MAX_PICKUPS)return alert(`ระบบวินรองรับสูงสุด ${MAX_PICKUPS} ร้านต่อหนึ่งเที่ยว กรุณาแบ่งสั่งเป็น 2 รอบ`);
    const ids=groups.map(g=>g.shop_id);const {data:settings,error}=await db.from('market_shop_order_settings').select('*').in('shop_id',ids);
    if(error)return alert('ยังไม่ได้ติดตั้งระบบสั่งซื้อใน Supabase หรือโหลดข้อมูลการชำระเงินไม่สำเร็จ');
    const by=Object.fromEntries((settings||[]).map(s=>[s.shop_id,s]));const unavailable=groups.map(g=>({g,av:shopAvailability(by[g.shop_id])})).filter(x=>!x.av.ok);
    if(unavailable.length)return alert('ยังสั่งซื้อไม่ได้:\n'+unavailable.map(x=>`• ${x.g.shop_name}: ${x.av.msg}`).join('\n'));
    const total=getCart().reduce((s,x)=>s+x.price*x.qty,0);
    openModal(`<h2 class="mo-title">ยืนยันคำสั่งซื้อ</h2><div class="checkout-summary">${groups.map(g=>`<div style="display:flex;justify-content:space-between;gap:10px;margin:5px 0"><span>${esc(g.shop_name)}</span><b>${money(g.items.reduce((s,x)=>s+x.price*x.qty,0))} บาท</b></div>`).join('')}<hr><div style="display:flex;justify-content:space-between"><b>รวมค่าสินค้า</b><b>${money(total)} บาท</b></div></div><fieldset class="payment-card" style="margin-top:14px"><legend><b>วิธีรับสินค้า</b></legend><label style="display:flex;gap:10px;align-items:flex-start;padding:10px 0"><input type="radio" name="fulfillmentMethod" value="delivery" checked style="width:22px;height:22px"><span><b>🛵 จัดส่งถึงบ้าน</b><br><span class="mo-muted">รอทุกร้านพร้อม แล้วเรียกวินรับรวมเที่ยวเดียว</span></span></label><label style="display:flex;gap:10px;align-items:flex-start;padding:10px 0"><input type="radio" name="fulfillmentMethod" value="pickup" style="width:22px;height:22px"><span><b>🏪 รับเองที่ร้าน</b><br><span class="mo-muted">ไม่มีค่าส่ง ไปรับสินค้าตามร้านในชุดคำสั่งซื้อ</span></span></label></fieldset><div id="deliveryCheckoutFields"><div id="deliveryFarePreview" class="delivery-fare-preview"><div class="fare-preview-icon">🛵</div><div><small>ค่าจัดส่งโดยประมาณ</small><strong id="deliveryFarePreviewAmount">ปักหมุดเพื่อคำนวณ</strong><span id="deliveryFarePreviewDetail">รองรับเส้นทางรวมไม่เกิน 10 กม.</span></div></div><div class="warning-banner">หลังสร้างออเดอร์ ระบบจะแสดง QR ของแต่ละร้านให้ชำระแยกกัน ส่วนค่าจัดส่งชำระให้วินเมื่อได้รับสินค้า</div><div class="mo-actions"><button type="button" id="showDeliveryFareInfoBtn" class="mo-secondary">ⓘ ดูวิธีคิดค่าจัดส่ง</button></div></div><div id="pickupCheckoutFields" class="hidden"><div class="ready-banner">🏪 เลือกรับเองที่ร้าน — ไม่มีค่าจัดส่ง</div><label style="display:block;margin:10px 0"><b>เวลาที่ต้องการรับ</b><select id="pickupTimeChoice" style="margin-top:6px"><option value="asap">รับเร็วที่สุดเมื่อร้านทำเสร็จ</option><option value="30">ประมาณ 30 นาทีจากนี้</option><option value="60">ประมาณ 1 ชั่วโมงจากนี้</option><option value="custom">เลือกเวลาเอง</option></select></label><label id="pickupCustomWrap" class="hidden"><b>วันและเวลาที่ต้องการรับ</b><input id="pickupCustomTime" type="datetime-local"></label><div class="mo-muted">หากสั่งหลายร้าน ลูกค้าต้องไปรับสินค้าที่แต่ละร้านด้วยตนเอง</div></div><div class="mo-form two"><label>ชื่อผู้รับ *<input id="coName" autocomplete="name" required></label><label>เบอร์โทร *<input id="coPhone" inputmode="tel" autocomplete="tel" required></label><div id="deliveryAddressFields" class="full delivery-address-box"><div class="delivery-address-title"><b>📍 ที่อยู่จัดส่ง</b><span class="mo-muted">กรอกเฉพาะช่องที่เกี่ยวข้อง</span></div><div class="mo-form two"><label class="full">บ้านเลขที่ / อาคาร / หมู่บ้าน *<input id="coHouse" autocomplete="street-address" placeholder="เช่น 123/45 หมู่บ้าน..."></label><label>หมู่<input id="coMoo" inputmode="numeric" placeholder="เช่น 5"></label><label>ซอย<input id="coSoi" placeholder="เช่น สุคนธวิท 12"></label><label>ถนน<input id="coRoad" placeholder="ชื่อถนน"></label><label>จังหวัด *<select id="coProvince"><option value="">เลือกจังหวัด</option></select></label><label>อำเภอ / เขต *<select id="coDistrict"><option value="">เลือกอำเภอ / เขต</option></select></label><label>ตำบล / แขวง *<select id="coSubdistrict"><option value="">เลือกตำบล / แขวง</option></select></label><label>รหัสไปรษณีย์<input id="coPostal" inputmode="numeric" maxlength="5" placeholder="ระบบเติมให้อัตโนมัติ" readonly></label><label class="full">จุดสังเกต / รายละเอียดเพิ่มเติม<input id="coLandmark" placeholder="เช่น บ้านประตูสีฟ้า ตรงข้ามร้าน..."></label></div><input id="coLat" type="hidden"><input id="coLng" type="hidden"><div id="deliveryLocationStatus" class="delivery-location-status">⚠️ ยังไม่ได้ปักหมุดตำแหน่งสำหรับวิน</div><div id="checkoutRouteStatus" class="delivery-location-status">ℹ️ ระบบจะตรวจสอบระยะทางรวมก่อนสร้างออเดอร์ · สูงสุด 10 กม.</div><label class="save-address-check"><input id="saveDeliveryAddress" type="checkbox" checked> บันทึกที่อยู่นี้ไว้ใช้ครั้งต่อไป</label></div></div><div class="mo-actions"><button id="useDeliveryLocationBtn" class="mo-secondary">📍 ปักหมุดจากตำแหน่งปัจจุบัน</button><div class="guest-checkout-note">✓ ไม่ต้องสมัครสมาชิก · ระบบจะจำออเดอร์ไว้ในเครื่องนี้<br><small>สมัครสมาชิกภายหลังได้เพื่อใช้งานสะดวกขึ้น</small></div><button id="submitCheckoutBtn" class="mo-primary">สร้างออเดอร์</button></div>`);updateFulfillmentUI();fillSavedDeliveryAddress();refreshCheckoutFarePreview();maybeShowDeliveryFareInfo();
  }
  function updateFulfillmentUI(){const method=document.querySelector('input[name="fulfillmentMethod"]:checked')?.value||'delivery',pickup=method==='pickup';document.getElementById('pickupCheckoutFields')?.classList.toggle('hidden',!pickup);document.getElementById('deliveryCheckoutFields')?.classList.toggle('hidden',pickup);const addr=document.getElementById('deliveryAddressFields');if(addr)addr.style.display=pickup?'none':'block';const loc=document.getElementById('useDeliveryLocationBtn');if(loc)loc.style.display=pickup?'none':'';updatePickupCustomUI();if(!pickup)refreshCheckoutFarePreview();}
  function updatePickupCustomUI(){const choice=document.getElementById('pickupTimeChoice')?.value;document.getElementById('pickupCustomWrap')?.classList.toggle('hidden',choice!=='custom');}
  function pickupRequestedAt(){const choice=document.getElementById('pickupTimeChoice')?.value||'asap';if(choice==='asap')return null;if(choice==='custom'){const v=document.getElementById('pickupCustomTime')?.value;if(!v)return 'INVALID';const d=new Date(v);return Number.isNaN(d.getTime())?'INVALID':d.toISOString();}const d=new Date(Date.now()+Number(choice)*60000);return d.toISOString();}
  function captureDeliveryLocation(){if(!navigator.geolocation)return alert('อุปกรณ์นี้ไม่รองรับตำแหน่ง');const box=document.getElementById('deliveryLocationStatus');if(box)box.textContent='⏳ กำลังระบุตำแหน่ง...';navigator.geolocation.getCurrentPosition(p=>{document.getElementById('coLat').value=p.coords.latitude.toFixed(7);document.getElementById('coLng').value=p.coords.longitude.toFixed(7);updateDeliveryLocationStatus();refreshCheckoutFarePreview();},e=>{updateDeliveryLocationStatus();alert('ระบุตำแหน่งไม่สำเร็จ: '+e.message)}, {enableHighAccuracy:true,timeout:12000,maximumAge:15000});}
  function bestPickupRoute(pickups,drop){
    const items=[...(pickups||[])];
    if(items.length<=1)return items;
    let best=null,bestKm=Infinity;
    function walk(prefix,rest){
      if(!rest.length){
        const km=routeKm([...prefix,drop]);
        if(km<bestKm){bestKm=km;best=[...prefix];}
        return;
      }
      for(let i=0;i<rest.length;i++)walk([...prefix,rest[i]],[...rest.slice(0,i),...rest.slice(i+1)]);
    }
    walk([],items);
    return best||items;
  }
  async function precheckDeliveryRoute(groups,lat,lng){
    const ids=[...new Set((groups||[]).map(g=>g.shop_id).filter(Boolean))];
    if(!ids.length)throw new Error('ไม่พบร้านค้าในตะกร้า');
    const {data:shops,error}=await db.from('market_shops').select('id,name,latitude,longitude').in('id',ids);
    if(error)throw error;
    const by=new Map((shops||[]).map(x=>[String(x.id),x]));
    const pickups=[];
    for(const id of ids){
      const sh=by.get(String(id)),slat=Number(sh?.latitude),slng=Number(sh?.longitude);
      if(!sh||!Number.isFinite(slat)||!Number.isFinite(slng)||!slat||!slng)throw new Error(`ร้าน ${sh?.name||''} ยังไม่มีพิกัด จึงยังสั่งแบบ Delivery ไม่ได้`);
      pickups.push({type:'pickup',label:sh.name,lat:slat,lng:slng,shop_id:sh.id});
    }
    const drop={type:'dropoff',label:'จุดส่งลูกค้า',lat:Number(lat),lng:Number(lng)};
    const ordered=bestPickupRoute(pickups,drop);
    const km=routeKm([...ordered,drop]);
    const fare=fareFor(km,ordered.length);
    return {km,fare,pickups:ordered};
  }
  let checkoutFarePreviewSeq=0;
  async function refreshCheckoutFarePreview(){
    const method=document.querySelector('input[name="fulfillmentMethod"]:checked')?.value||'delivery';
    const amount=document.getElementById('deliveryFarePreviewAmount'),detail=document.getElementById('deliveryFarePreviewDetail'),routeBox=document.getElementById('checkoutRouteStatus');
    if(!amount||!detail||method!=='delivery')return;
    const lat=Number(document.getElementById('coLat')?.value),lng=Number(document.getElementById('coLng')?.value);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||!lat||!lng){
      amount.textContent='ปักหมุดเพื่อคำนวณ';detail.textContent='รองรับเส้นทางรวมไม่เกิน 10 กม.';
      if(routeBox)routeBox.textContent='ℹ️ ปักหมุดตำแหน่งเพื่อดูค่าจัดส่งก่อนยืนยันสั่งซื้อ';
      return;
    }
    const seq=++checkoutFarePreviewSeq;
    amount.textContent='กำลังคำนวณ...';detail.textContent='กำลังตรวจสอบเส้นทางจากร้านถึงคุณ';
    try{
      const chk=await precheckDeliveryRoute(groupedCart(),lat,lng);
      if(seq!==checkoutFarePreviewSeq)return;
      if(chk.km>10||!chk.fare){
        amount.textContent='อยู่นอกพื้นที่จัดส่ง';
        detail.textContent=`เส้นทางประมาณ ${chk.km.toFixed(1)} กม. · รองรับไม่เกิน 10 กม.`;
        if(routeBox)routeBox.innerHTML=`❌ เส้นทางรวมประมาณ <b>${chk.km.toFixed(1)} กม.</b> เกินพื้นที่จัดส่ง 10 กม.`;
        return;
      }
      amount.textContent=`${money(chk.fare.total)} บาท`;
      detail.textContent=`เส้นทางประมาณ ${chk.km.toFixed(1)} กม. · รับสินค้า ${chk.pickups.length} ร้าน`;
      if(routeBox)routeBox.innerHTML=`✅ อยู่ในพื้นที่จัดส่ง · เส้นทางประมาณ <b>${chk.km.toFixed(1)} กม.</b> · ค่าส่งเบื้องต้นประมาณ <b>${money(chk.fare.total)} บาท</b>`;
    }catch(err){
      if(seq!==checkoutFarePreviewSeq)return;
      amount.textContent='ยังคำนวณไม่ได้';detail.textContent=err?.message||'กรุณาตรวจสอบพิกัดร้านและตำแหน่งจัดส่ง';
      if(routeBox)routeBox.textContent='⚠️ '+(err?.message||'คำนวณค่าจัดส่งไม่สำเร็จ');
    }
  }

  async function submitCheckout(){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}const method=document.querySelector('input[name="fulfillmentMethod"]:checked')?.value||'delivery',name=document.getElementById('coName')?.value.trim(),phone=document.getElementById('coPhone')?.value.trim(),address=buildDeliveryAddress(),house=document.getElementById('coHouse')?.value.trim(),subdistrict=document.getElementById('coSubdistrict')?.value.trim(),district=document.getElementById('coDistrict')?.value.trim(),province=document.getElementById('coProvince')?.value.trim(),lat=Number(document.getElementById('coLat')?.value),lng=Number(document.getElementById('coLng')?.value),pickupAt=method==='pickup'?pickupRequestedAt():null;if(!name||!phone)return alert('กรอกชื่อและเบอร์โทรให้ครบ');if(method==='delivery'&&(!house||!subdistrict||!district||!province))return alert('กรอกบ้านเลขที่/อาคาร ตำบล อำเภอ และจังหวัดให้ครบ');if(method==='delivery'&&(!Number.isFinite(lat)||!Number.isFinite(lng)||!lat||!lng))return alert('กรุณากด “ปักหมุดจากตำแหน่งปัจจุบัน” เพื่อให้วินนำทางได้ถูกต้อง');if(pickupAt==='INVALID')return alert('กรุณาเลือกวันและเวลาที่ต้องการรับสินค้า');if(method==='delivery')saveDeliveryAddressDraft();
    const groups=groupedCart();const payload=groups.map(g=>({shop_id:g.shop_id,items:g.items.map(x=>({product_id:x.product_id,qty:x.qty,option_value_ids:(x.selected_options||[]).map(o=>o.value_id),note:x.note||null}))}));
    if(method==='delivery'){
      const routeBox=document.getElementById('checkoutRouteStatus');if(routeBox)routeBox.textContent='⏳ กำลังตรวจสอบพื้นที่จัดส่ง...';
      try{
        const chk=await precheckDeliveryRoute(groups,lat,lng);
        if(chk.km>10||!chk.fare){
          if(routeBox)routeBox.innerHTML=`❌ เส้นทางรวมประมาณ <b>${chk.km.toFixed(1)} กม.</b> เกินพื้นที่จัดส่ง 10 กม.`;
          return alert(`⚠️ อยู่นอกพื้นที่จัดส่ง\n\nเส้นทางรับสินค้าจากร้านและส่งถึงคุณประมาณ ${chk.km.toFixed(1)} กม.\nขณะนี้รองรับไม่เกิน 10 กม.\n\nกรุณาเลือก “รับเองที่ร้าน” แทน`);
        }
        if(routeBox)routeBox.innerHTML=`✅ อยู่ในพื้นที่จัดส่ง · เส้นทางประมาณ <b>${chk.km.toFixed(1)} กม.</b> · ค่าส่งเบื้องต้นประมาณ <b>${chk.fare.total} บาท</b>`;
      }catch(err){
        if(routeBox)routeBox.textContent='❌ ตรวจสอบพื้นที่จัดส่งไม่สำเร็จ';
        return alert('ตรวจสอบพื้นที่จัดส่งไม่สำเร็จ: '+(err?.message||err));
      }
    }
    const btn=document.getElementById('submitCheckoutBtn');if(btn){btn.disabled=true;btn.textContent='กำลังสร้างออเดอร์...'}
    const {data,error}=await db.rpc('market_create_checkout_v041',{p_customer_name:name,p_customer_phone:phone,p_fulfillment_method:method,p_delivery_address:method==='delivery'?address:null,p_delivery_lat:method==='delivery'?lat:null,p_delivery_lng:method==='delivery'?lng:null,p_pickup_requested_at:pickupAt,p_orders:payload});
    if(error){if(btn){btn.disabled=false;btn.textContent='สร้างออเดอร์'}return alert('สร้างออเดอร์ไม่สำเร็จ: '+error.message)}
    const createdGroupId=(data&&typeof data==='object')?(data.group_id||data.id||null):data;
    if(!createdGroupId){
      if(btn){btn.disabled=false;btn.textContent='สร้างออเดอร์'}
      return alert('สร้างออเดอร์สำเร็จแต่ระบบไม่พบรหัสชุดคำสั่งซื้อ กรุณาเปิดออเดอร์ของฉันเพื่อตรวจสอบ');
    }
    sendOrderPush('new_order',{group_id:createdGroupId});
    saveCart([]);await showCheckoutResult(createdGroupId);
  }
  async function showCheckoutResult(groupId){
    customerFocusGroupId=String(groupId||'');
    customerOrderPage=1;
    orderDateFilter='all';
    // Give auto-accept RPC/trigger a brief moment to settle, then go directly
    // to the newly created order status screen.
    await new Promise(r=>setTimeout(r,250));
    await openAccountHub('customer');
  }
  async function openPayment(orderId){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}const {data:o,error}=await db.from('market_orders').select('id,subtotal,status,payment_qr_url,payment_name,payment_note,shop:market_shops(name)').eq('id',orderId).maybeSingle();if(error||!o)return alert('ไม่พบออเดอร์');if(o.status!=='awaiting_payment')return alert('ยังชำระไม่ได้ กรุณารอร้านรับออเดอร์หรือยืนยันรายการที่แก้ไขก่อน');
    openModal(`<h2 class="mo-title">แจ้งชำระเงิน</h2><div class="payment-card"><b>${esc(o.shop?.name||'ร้านค้า')}</b><div class="payment-amount">${money(o.subtotal)} บาท</div>${o.payment_qr_url?`<img src="${esc(o.payment_qr_url)}">`:''}<div>${esc(o.payment_name||'')}</div></div><input id="paymentOrderId" type="hidden" value="${esc(orderId)}"><div class="mo-form"><label>เลขอ้างอิง/4–6 หลักท้าย (ถ้ามี)<input id="paymentRef" placeholder="เช่น 483921"></label><label>แนบสลิป<input id="paymentSlip" type="file" accept="image/*"></label></div><div class="mo-actions"><button id="submitPaymentBtn" class="mo-primary">ส่งหลักฐานให้ร้านตรวจสอบ</button></div>`);
  }
  async function submitPayment(){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}const orderId=document.getElementById('paymentOrderId').value,ref=document.getElementById('paymentRef').value.trim(),file=document.getElementById('paymentSlip').files?.[0];let path=null;
    const btn=document.getElementById('submitPaymentBtn');btn.disabled=true;btn.textContent='กำลังส่ง...';
    let oldSlipPath=null;
    if(file){
      try{
        const {data:oldOrder}=await db.from('market_orders').select('payment_slip_path').eq('id',orderId).maybeSingle();oldSlipPath=oldOrder?.payment_slip_path||null;
        const packed=await compressImage(file,{maxSide:1800,targetBytes:600*1024,quality:.86,minQuality:.68});
        path=`${orderId}/${session.user.id}/${Date.now()}.webp`;
        const {error:upErr}=await db.storage.from('order-slips').upload(path,packed,{contentType:'image/webp',upsert:false});
        if(upErr)throw upErr;
      }catch(err){btn.disabled=false;btn.textContent='ส่งหลักฐานให้ร้านตรวจสอบ';return alert('อัปโหลดสลิปไม่สำเร็จ: '+err.message)}
    }
    const {error}=await db.rpc('market_submit_payment',{p_order_id:orderId,p_payment_ref:ref||null,p_slip_path:path});btn.disabled=false;btn.textContent='ส่งหลักฐานให้ร้านตรวจสอบ';if(error){if(path)await safeRemove('order-slips',path);return alert(error.message)}if(path&&oldSlipPath&&oldSlipPath!==path)await safeRemove('order-slips',oldSlipPath);sendOrderPush('payment_submitted',{order_id:orderId});alert('แจ้งชำระเงินแล้ว ร้านค้าจะตรวจสอบยอด');guideCustomerFromOrder(orderId,'แจ้งชำระเงินแล้ว · ตอนนี้อยู่ขั้นรอร้านตรวจสอบยอด / จัดเตรียมสินค้า');
  }


  function vapidKeyToBytes(base64String){
    const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
  async function getOrderPushRegistration(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window))throw new Error('อุปกรณ์/เบราว์เซอร์นี้ยังไม่รองรับ Push Notification');
    return navigator.serviceWorker.register('./sw.js?v=5.7.9.46',{scope:'./',updateViaCache:'none'});
  }
  async function getOrderPushSubscription(){
    if(!('serviceWorker' in navigator))return null;
    const reg=await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.getRegistration();
    if(reg){try{await reg.update()}catch(_e){}}
    return reg?await reg.pushManager.getSubscription():null;
  }
  async function refreshOrderPushUI(){
    const st=document.getElementById('orderPushStatus'),on=document.getElementById('enableOrderPushBtn'),off=document.getElementById('disableOrderPushBtn'),test=document.getElementById('testOrderPushBtn');
    if(!st)return;
    if(!('serviceWorker' in navigator)||!('PushManager' in window)){st.textContent='อุปกรณ์/เบราว์เซอร์นี้ยังไม่รองรับ Web Push';if(on)on.style.display='none';if(test)test.style.display='none';return;}
    try{
      const perm=Notification.permission,sub=perm==='granted'?await getOrderPushSubscription():null;
      if(sub){
        st.innerHTML='✅ <b>อุปกรณ์นี้พร้อมรับ Push Notification</b><br><small>สามารถปิดเว็บหรือพักหน้าจอได้ ระบบจะใช้การแจ้งเตือนของอุปกรณ์</small>';
        if(on)on.style.display='none';if(off)off.style.display='';if(test)test.style.display='';
      }else{
        st.textContent=perm==='denied'?'❌ Browser ปิดสิทธิ์แจ้งเตือน กรุณาเปิดจากการตั้งค่าของเว็บไซต์':'ยังไม่ได้เปิด Push Notification บนอุปกรณ์นี้';
        if(on)on.style.display='';if(off)off.style.display='none';if(test)test.style.display='none';
      }
    }catch(err){st.textContent='ตรวจสถานะแจ้งเตือนไม่สำเร็จ: '+(err?.message||err);}
  }
  async function enableOrderPush(){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}
    const btn=document.getElementById('enableOrderPushBtn'),st=document.getElementById('orderPushStatus'),old=btn?.textContent||'เปิดการแจ้งเตือนบนมือถือ';
    if(btn){btn.disabled=true;btn.textContent='⏳ กำลังเปิดการแจ้งเตือน...';}
    if(st)st.textContent='กำลังติดต่อระบบแจ้งเตือนของอุปกรณ์ กรุณารอสักครู่...';
    let timeout;
    try{
      const job=(async()=>{
        const permission=await Notification.requestPermission();
        if(permission!=='granted')throw new Error('ยังไม่ได้อนุญาตการแจ้งเตือน');
        const {data:cfg,error:cfgErr}=await db.from('market_push_config').select('vapid_public_key').eq('id',1).maybeSingle();
        if(cfgErr||!cfg?.vapid_public_key)throw new Error('ยังไม่ได้ตั้งค่า Push Public Key');
        const reg=await getOrderPushRegistration();
        let sub=await reg.pushManager.getSubscription();
        if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidKeyToBytes(cfg.vapid_public_key)});
        const j=sub.toJSON(),payload={user_id:session.user.id,endpoint:j.endpoint,p256dh:j.keys?.p256dh,auth:j.keys?.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()};
        const {error}=await db.from('market_push_subscriptions').upsert(payload,{onConflict:'user_id,endpoint'});if(error)throw error;
      })();
      const timer=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('การเปิดแจ้งเตือนใช้เวลานานเกินไป กรุณาลองอีกครั้ง')),20000)});
      await Promise.race([job,timer]);clearTimeout(timeout);
      await refreshOrderPushUI();
    }catch(err){
      clearTimeout(timeout);if(st)st.textContent='❌ เปิดการแจ้งเตือนไม่สำเร็จ';
      alert('เปิด Push Notification ไม่สำเร็จ: '+(err?.message||err));
    }finally{if(btn){btn.disabled=false;btn.textContent=old;}}
  }
  async function disableOrderPush(){
    const btn=document.getElementById('disableOrderPushBtn'),old=btn?.textContent||'ปิดการแจ้งเตือนเครื่องนี้';
    if(btn){btn.disabled=true;btn.textContent='⏳ กำลังปิด...';}
    try{
      const sub=await getOrderPushSubscription();if(sub){await db.from('market_push_subscriptions').delete().eq('user_id',session.user.id).eq('endpoint',sub.endpoint);await sub.unsubscribe();}
      await refreshOrderPushUI();
    }catch(err){alert('ปิด Push Notification ไม่สำเร็จ: '+(err?.message||err))}
    finally{if(btn){btn.disabled=false;btn.textContent=old;}}
  }
  async function testOrderPush(){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}
    const btn=document.getElementById('testOrderPushBtn'),old=btn?.textContent||'🔔 ส่งแจ้งเตือนทดสอบ';
    if(btn){btn.disabled=true;btn.textContent='⏳ กำลังส่งทดสอบ...';}
    try{
      const {data,error}=await db.functions.invoke('send-order-push',{body:{event:'test_push'}});
      if(error)throw error;
      if(!data?.sent)throw new Error('ยังไม่พบอุปกรณ์ที่รับ Push ได้');
      alert(`ส่ง Push ทดสอบแล้ว ${data.sent} อุปกรณ์`);
    }catch(err){alert('ส่ง Push ทดสอบไม่สำเร็จ: '+(err?.message||err))}
    finally{if(btn){btn.disabled=false;btn.textContent=old;}}
  }
  async function sendOrderPush(eventName,{order_id=null,group_id=null,shop_id=null}={}){
    // Business notifications are sent by Database Trigger -> order-push-webhook.
    // Keep this function as a compatibility no-op to avoid duplicate notifications.
    return;
  }

  function orderDeepLink(sourceUrl=location.href){
    try{
      const u=new URL(sourceUrl,location.href),h=new URLSearchParams(String(u.hash||'').replace(/^#/,''));
      const get=k=>u.searchParams.get(k)||h.get(k);
      const tab=get('order_tab'),groupId=get('group_id'),orderId=get('order_id'),shopId=get('shop_id');
      if(!tab&&!groupId&&!orderId&&!shopId)return null;
      return {tab:tab==='seller'?'seller':'customer',groupId,orderId,shopId};
    }catch(_e){return null}
  }
  function clearOrderDeepLink(){
    try{
      const u=new URL(location.href);
      ['order_tab','group_id','order_id','shop_id'].forEach(k=>u.searchParams.delete(k));
      history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);
    }catch(_e){}
  }
  async function resolveSellerShopFromDeepLink(d){
    if(d.shopId)return d.shopId;
    try{
      if(d.orderId){
        const {data:o}=await db.from('market_orders').select('shop_id').eq('id',d.orderId).maybeSingle();
        if(o?.shop_id)return o.shop_id;
      }
      if(d.groupId){
        const {data:orders}=await db.from('market_orders').select('shop_id').eq('group_id',d.groupId).limit(20);
        const ids=[...new Set((orders||[]).map(x=>x.shop_id).filter(Boolean))];
        if(ids.length){
          const {data:mine}=await db.from('market_shops').select('id').eq('owner_id',session.user.id).in('id',ids).limit(1);
          if(mine?.[0]?.id)return mine[0].id;
        }
      }
    }catch(_e){}
    return null;
  }
  async function openOrderDeepLink(sourceUrl=null){
    const d=orderDeepLink(sourceUrl||location.href);
    if(!d||!session)return false;
    orderDateFilter='all';
    if(d.tab==='seller'){
      await openAccountHub('seller');
      const sid=await resolveSellerShopFromDeepLink(d);
      if(sid)await openSellerShop(sid);
    }else{
      if(d.orderId)customerFocusOrderId=String(d.orderId);
      if(d.groupId)customerFocusGroupId=String(d.groupId);
      if(d.orderId){
        try{
          const {data:o}=await db.from('market_orders').select('group_id,status').eq('id',d.orderId).maybeSingle();
          if(o?.group_id)customerFocusGroupId=String(o.group_id);
          if(o?.status)customerOrderTab=customerOrderStatusBucket(o.status);
        }catch(_e){}
      }
      await openAccountHub('customer');
    }
    clearOrderDeepLink();
    return true;
  }
  async function openAccountHub(tab='customer'){
    if(!canUseOrders())return;
    if(tab==='seller'&&!session)return requireLogin();
    if(!session){try{await ensureCheckoutSession()}catch(err){return alert(err.message)}}
    if(isGuestSession())tab='customer';
    openModal(`<h2 class="mo-title">🛍️ ออเดอร์และร้านของฉัน</h2>${isGuestSession()?'<div class="guest-order-banner">สั่งซื้อแบบไม่สมัครสมาชิก · ออเดอร์นี้ผูกกับเบราว์เซอร์/เครื่องที่ใช้อยู่ กรุณาอย่าล้างข้อมูลเว็บไซต์จนกว่าออเดอร์จะเสร็จ</div>':''}<div id="orderPushSettings" class="payment-card"><b>🔔 การแจ้งเตือนบนมือถือ</b><div class="mo-muted" id="orderPushStatus">กำลังตรวจสอบ...</div><div class="mo-actions"><button id="enableOrderPushBtn" class="mo-primary">เปิดการแจ้งเตือนบนมือถือ</button><button id="disableOrderPushBtn" class="mo-secondary" style="display:none">ปิดการแจ้งเตือนเครื่องนี้</button><button id="testOrderPushBtn" class="mo-secondary" style="display:none">🔔 ส่งแจ้งเตือนทดสอบ</button></div></div><div class="seller-tabs"><button data-hub-tab="customer" class="${tab==='customer'?'active':''}">ออเดอร์ที่ฉันสั่ง</button>${isGuestSession()?'':`<button data-hub-tab="seller" class="${tab==='seller'?'active':''}">ร้าน / ออเดอร์ที่ได้รับ</button>`}</div><div id="hubContent">กำลังโหลด...</div>`,true);await refreshOrderPushUI();await renderHubTab(tab);
  }
  async function renderHubTab(tab){document.querySelectorAll('[data-hub-tab]').forEach(b=>b.classList.toggle('active',b.dataset.hubTab===tab));const box=document.getElementById('hubContent');if(!box)return;if(tab==='seller')return renderSellerHub(box);return renderCustomerHub(box);}
  async function guideCustomerToGroup(groupId,message=''){
    customerFocusGroupId=String(groupId||'');customerOrderPage=1;orderDateFilter='all';
    await openAccountHub('customer');
    if(message)setTimeout(()=>{const pane=document.querySelector('.order-active-pane');if(pane){const n=document.createElement('div');n.className='post-checkout-banner';n.innerHTML=`<b>➡️ ขั้นตอนถัดไป</b><span>${esc(message)}</span>`;pane.prepend(n);n.scrollIntoView({behavior:'smooth',block:'start'})}},120);
  }
  async function guideCustomerFromOrder(orderId,message=''){
    customerFocusOrderId=String(orderId||'');
    try{
      const {data:o}=await db.from('market_orders').select('group_id,status').eq('id',orderId).maybeSingle();
      if(o?.status)customerOrderTab=customerOrderStatusBucket(o.status);
      if(o?.group_id)return guideCustomerToGroup(o.group_id,message);
    }catch(_e){}
    return openAccountHub('customer');
  }
  function customerOrderStatusBucket(status){
    if(['cancelled','completed'].includes(status))return 'done';
    if(status==='ready')return 'shipping';
    if(['payment_review','preparing'].includes(status))return 'processing';
    if(['pending_shop','awaiting_customer_confirmation','awaiting_payment'].includes(status))return 'waiting';
    return 'processing';
  }
  function customerGroupBucket(g){
    const os=g.orders||[],active=os.filter(o=>o.status!=='cancelled');
    const statuses=new Set(os.map(o=>o.status));
    if(!os.length||os.every(o=>o.status==='cancelled')||['cancelled','completed'].includes(g.status))return 'done';
    if(g.rider_job_id||['delivery_requested','delivering'].includes(g.status))return 'shipping';
    if(active.some(o=>o.status==='ready'))return 'shipping';
    // Once the customer has submitted payment, move the order forward visually.
    // payment_review means "paid / waiting for shop verification", so it belongs
    // in the preparation flow rather than the old waiting/payment lane.
    if(active.some(o=>['payment_review','preparing'].includes(o.status)))return 'processing';
    if(active.some(o=>['pending_shop','awaiting_customer_confirmation','awaiting_payment'].includes(o.status)))return 'waiting';
    return 'processing';
  }
  function deliveryBatchStatusText(s){return({creating:'กำลังสร้างงานวิน',waiting_rider:'รอวินรับงาน',accepted:'วินรับงานแล้ว',pickup_started:'วินกำลังไปรับสินค้า',picked_up:'รับสินค้าครบแล้ว',delivering:'กำลังไปส่งลูกค้า',completed:'ส่งสำเร็จ',cancelled:'ยกเลิก'}[s]||s||'รออัปเดต')}
  function deliveryBatchCard(b){
    const phone=b.rider_phone||'',done=b.status==='completed',arrived=!!b.delivery_arrived_at,issue=b.delivery_issue_status==='open';
    const effective=done?'ส่งสำเร็จ':arrived?'รอลูกค้ายืนยันรับสินค้า':deliveryBatchStatusText(b.status);
    const proof=arrived?(b.proof_deleted_at?`<div class="mo-muted">📷 หลักฐานการส่งมอบถูกลบตามนโยบายแล้ว</div>`:b.proof_path?`<button class="mo-secondary" data-view-delivery-proof="${b.id}">📷 ดูหลักฐานการส่งมอบ</button>`:''):'';
    const customerActions=arrived&&!done&&!issue?`<div class="mo-actions"><button class="mo-primary" data-confirm-delivery="${b.id}">✅ ได้รับสินค้าแล้ว</button><button class="mo-danger" data-report-delivery-issue="${b.id}">⚠️ ยังไม่ได้รับ / มีปัญหา</button></div>`:'';
    const issueBox=issue?`<div class="warning-banner"><b>⚠️ แจ้งปัญหาการส่งมอบแล้ว</b><br>${esc(b.delivery_issue_note||'')}<br><small>รูปหลักฐานจะถูกเก็บไว้จนกว่าปัญหาจะถูกแก้ไข</small></div>`:'';
    const times=`<div class="mo-muted" style="margin-top:6px">${b.accepted_at?`รับงาน ${new Date(b.accepted_at).toLocaleString('th-TH')} · `:''}${b.picked_up_at?`รับสินค้าครบ ${new Date(b.picked_up_at).toLocaleString('th-TH')} · `:''}${b.delivery_arrived_at?`ถึงปลายทาง ${new Date(b.delivery_arrived_at).toLocaleString('th-TH')} · `:''}${b.customer_confirmed_at?`ลูกค้ายืนยัน ${new Date(b.customer_confirmed_at).toLocaleString('th-TH')}`:''}</div>`;
    return `<div class="delivery-track"><div class="order-card-head"><b>${done?'✅':'🛵'} ${esc(effective)}</b><span class="status-pill">${esc(String(b.id).slice(0,8).toUpperCase())}</span></div>${b.rider_name||phone?`<div class="rider-contact"><b>วิน: ${esc(b.rider_name||'ไม่ระบุชื่อ')}</b>${phone?` · ${esc(phone)} <a href="tel:${esc(phone)}">📞 โทรหาวิน</a>`:''}</div>`:`<div class="mo-muted">รอวินรับงานและส่งข้อมูลติดต่อ</div>`}<div class="delivery-steps"><span class="${['accepted','pickup_started','picked_up','delivering','completed'].includes(b.status)?'done':''}">วินรับงาน</span><span class="${['picked_up','delivering','completed'].includes(b.status)?'done':b.status==='pickup_started'?'active':''}">รับสินค้า</span><span class="${arrived||done?'done':b.status==='delivering'?'active':''}">ถึงปลายทาง</span><span class="${done?'done':arrived?'active':''}">ลูกค้ายืนยัน</span></div>${b.delivery_fee?`<small>ค่าส่งประมาณ ${money(b.delivery_fee)} บาท${b.distance_km?` · ${Number(b.distance_km).toFixed(1)} กม.`:''}</small>`:''}${times}${issueBox}<div class="mo-actions">${proof}</div>${customerActions}</div>`;
  }
  function deliveryProgress(g,activeOrders){
    if(g.fulfillment_method==='pickup')return '';
    const batches=(g.batches||[]).filter(b=>b.status!=='cancelled').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const batchedIds=new Set(batches.flatMap(b=>(b.batch_orders||[]).map(x=>String(x.order_id))));
    const pendingOrders=(activeOrders||[]).filter(o=>!batchedIds.has(String(o.id)));
    const ready=pendingOrders.filter(o=>o.status==='ready'),notReady=pendingOrders.filter(o=>o.status!=='ready');
    const cards=batches.map(deliveryBatchCard).join('');
    const readiness=pendingOrders.length?`<div class="delivery-track"><b>${ready.length?`📦 พร้อมส่ง ${ready.length} ร้าน`:'⏳ ยังไม่มีร้านพร้อมส่ง'}${notReady.length?` · รออีก ${notReady.length} ร้าน`:''}</b>${ready.length&&notReady.length?`<div class="warning-banner" style="margin-top:8px">สามารถส่งเฉพาะ ${ready.length} ร้านที่พร้อมก่อนได้ ร้านที่เหลือค่อยเรียกวินรอบถัดไป (อาจมีค่าส่งเพิ่ม)</div>`:''}</div>`:'';
    return cards+readiness;
  }
  function customerGroupCard(g){
    const os=g.orders||[],activeOrders=os.filter(o=>o.status!=='cancelled'),pickupDoneCount=activeOrders.filter(o=>o.pickup_completed_at).length,readyCount=activeOrders.filter(o=>o.status==='ready'&&!o.pickup_completed_at).length,waitingCount=Math.max(0,activeOrders.length-readyCount-pickupDoneCount),allReady=activeOrders.length>0&&waitingCount===0,groupOpen=!['cancelled','completed'].includes(g.status),canDelivery=allReady&&groupOpen&&!g.rider_job_id;
    const pickup=g.fulfillment_method==='pickup';
    const batches=(g.batches||[]).filter(b=>b.status!=='cancelled'),batchedIds=new Set(batches.flatMap(b=>(b.batch_orders||[]).map(x=>String(x.order_id)))),unbatched=activeOrders.filter(o=>!batchedIds.has(String(o.id))),readyUnbatched=unbatched.filter(o=>o.status==='ready'),notReadyUnbatched=unbatched.filter(o=>o.status!=='ready');
    const pickupComplete=pickup&&activeOrders.length>0&&pickupDoneCount===activeOrders.length;
    const deliveryState=pickup?(pickupComplete?`<div class="ready-banner">✅ รับสินค้าครบทุกร้านแล้ว · รายการเสร็จสมบูรณ์</div>`:allReady?`<div class="ready-banner">🏪 พร้อมรับ/รับแล้ว ${readyCount+pickupDoneCount}/${activeOrders.length} ร้าน${pickupDoneCount?`<br><small>รับสินค้าแล้ว ${pickupDoneCount} ร้าน · ยังรอรับ ${readyCount} ร้าน</small>`:''}${g.pickup_requested_at?`<br><small>เวลาที่ขอรับ: ${new Date(g.pickup_requested_at).toLocaleString('th-TH')}</small>`:''}</div>`:`<div class="warning-banner">🏪 รับเองที่ร้าน · พร้อม/รับแล้ว ${readyCount+pickupDoneCount}/${activeOrders.length} ร้าน${g.pickup_requested_at?`<br><small>เวลาที่ขอรับ: ${new Date(g.pickup_requested_at).toLocaleString('th-TH')}</small>`:''}</div>`):readyUnbatched.length?`<div class="mo-actions"><button class="mo-primary" data-create-delivery="${g.id}">🛵 ${notReadyUnbatched.length?`ส่งเฉพาะ ${readyUnbatched.length} ร้านที่พร้อม`:`เรียกวินรับสินค้า ${readyUnbatched.length} ร้าน`}</button></div>`:unbatched.length?`<button class="mo-primary" disabled style="opacity:.5">🛵 รอร้านพร้อมก่อนเรียกวิน</button>`:'';
    return `<article class="order-card ${customerFocusGroupId&&String(g.id)===String(customerFocusGroupId)?'focused-checkout-order':''}"><div class="order-card-head"><div><b>ชุดคำสั่งซื้อ #${esc(String(g.id).slice(0,8).toUpperCase())}</b><div class="mo-muted">${new Date(g.created_at).toLocaleString('th-TH')}</div></div><span class="status-pill">${esc(g.status||'กำลังดำเนินการ')}</span></div>${os.map(o=>{
      let refund='';
      if(o.refund_required){if((o.refund_status||'pending')==='pending')refund=o.refund_destination_submitted_at?`<div class="warning-banner">🔄 รอร้านคืนเงิน ${money(o.refund_amount||o.subtotal)} บาท<br><small>ช่องทางรับเงินคืน: ${esc(refundDestinationLabel(o,true))}</small></div><div class="mo-actions"><button class="mo-secondary" data-refund-destination="${o.id}">แก้ไขช่องทางรับเงินคืน</button></div>`:`<div class="warning-banner">💸 ต้องคืนเงิน ${money(o.refund_amount||o.subtotal)} บาท กรุณาระบุช่องทางรับเงินคืนก่อน</div><div class="mo-actions"><button class="mo-primary" data-refund-destination="${o.id}">ระบุช่องทางรับเงินคืน</button></div>`;else if(o.refund_status==='seller_submitted')refund=`<div class="ready-banner">💸 ร้านแจ้งคืนเงิน ${money(o.refund_amount||o.subtotal)} บาทแล้ว</div><div class="mo-actions">${o.refund_slip_path?`<button class="mo-secondary" onclick="window.marketOrderOpenRefundSlip('${o.id}','${esc(o.refund_slip_path)}')">ดูหลักฐานคืนเงิน</button>`:''}<button class="mo-primary" data-confirm-refund="${o.id}">✅ ได้รับเงินคืนแล้ว</button></div>`;else if(o.refund_status==='completed')refund=`<div class="ready-banner">✅ ยืนยันได้รับเงินคืน ${money(o.refund_amount||o.subtotal)} บาทแล้ว</div>`;}
      const overdue=o.status==='pending_shop'&&o.shop_response_due_at&&new Date(o.shop_response_due_at)<new Date();
      const seenState=!o.shop_viewed_at&&!['cancelled','completed'].includes(o.status)?`<div class="warning-banner">👀 ร้านยังไม่เปิดดูออเดอร์นี้</div>`:`<div class="mo-muted">👀 ร้านเปิดดูออเดอร์แล้ว</div>`;const pending=o.status==='pending_shop'?`<div class="warning-banner">${overdue?'⚠️ ร้านยังไม่ตอบรับเกิน 15 นาที':'⏳ รอร้านตรวจและรับออเดอร์'}${o.shop?.phone?`<br><a href="tel:${esc(o.shop.phone)}">📞 โทรหาร้าน</a>`:''}</div><div class="mo-actions"><button class="mo-danger" data-cancel-shop-order="${o.id}">ยกเลิกร้านนี้</button></div>`:'';
      const revision=o.status==='awaiting_customer_confirmation'?`<div class="warning-banner"><b>ร้านขอแก้ไขรายการ</b><br>${esc(o.revision_note||'')}<br>ยอดใหม่ <b>${money(o.revision_subtotal||o.subtotal)} บาท</b></div><div class="mo-actions"><button class="mo-primary" data-confirm-revision="${o.id}">✅ ยืนยันรายการและยอดใหม่</button><button class="mo-danger" data-cancel-shop-order="${o.id}">ยกเลิกร้านนี้</button></div>`:'';
      const pay=o.status==='awaiting_payment'?`<div class="ready-banner">✅ ร้านรับออเดอร์แล้ว กรุณาตรวจยอดก่อนชำระ</div><div class="mo-actions"><button class="mo-primary" data-pay-order="${o.id}">ชำระ/แจ้งชำระเงิน</button><button class="mo-danger" data-cancel-shop-order="${o.id}">ยกเลิกร้านนี้</button></div>`:'';
      return `<div class="payment-card"><div class="order-card-head"><b>🏪 ${esc(o.shop?.name||'ร้าน')}</b><span class="status-pill status-${esc(o.status)}">${esc(statusText(o.status))}</span></div><div class="order-items">${(o.items||[]).map(i=>renderOrderItem(i,true)).join('')}</div><b>${money(o.subtotal)} บาท</b>${o.pickup_completed_at?`<div class="ready-banner">✅ รับสินค้าจากร้านนี้แล้ว<br><small>${new Date(o.pickup_completed_at).toLocaleString('th-TH')}</small></div>`:''}${o.revision_confirmed_at&&o.revision_note?`<div class="mo-muted">รายการที่ตกลงแก้ไข: ${esc(o.revision_note)}</div>`:''}${o.rejection_reason?`<div class="warning-banner">ยกเลิก: ${esc(o.rejection_reason)}</div>`:''}${seenState}${pending}${revision}${refund}${pay}${g.fulfillment_method==='delivery'&&!['cancelled','completed'].includes(o.status)&&!batchedIds.has(String(o.id))?`<div class="mo-actions"><button class="mo-secondary" data-cancel-problem-shop="${o.id}">⚠️ ร้านนี้ทำไม่ได้ / ตัดออก</button></div>`:''}</div>`;
    }).join('')}${deliveryProgress(g,activeOrders)}${deliveryState}</article>`;
  }
  function orderDateMatches(dateValue){
    if(orderDateFilter==='all')return true;
    const d=new Date(dateValue),now=new Date(),startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if(orderDateFilter==='today')return d>=startToday;
    if(orderDateFilter==='yesterday'){const y=new Date(startToday);y.setDate(y.getDate()-1);return d>=y&&d<startToday;}
    if(orderDateFilter==='7d'){const x=new Date(startToday);x.setDate(x.getDate()-6);return d>=x;}
    return true;
  }
  function orderSearchMatchesGroup(g){
    const q=String(orderSearchTerm||'').trim().toLowerCase();if(!q)return true;
    const text=[g.id,...(g.orders||[]).flatMap(o=>[o.id,o.shop?.name,o.shop?.phone,o.rejection_reason])].filter(Boolean).join(' ').toLowerCase();
    return text.includes(q);
  }
  function orderTabsToolbar(type,buckets){
    const isSeller=type==='seller',tabs=isSeller?[
      ['action','🔴 ต้องทำตอนนี้'],['preparing','🟠 กำลังเตรียม'],['ready','🟢 พร้อมรับ'],['done','⚪ จบแล้ว']
    ]:[
      ['waiting','⏳ รอดำเนินการ'],['processing','🍳 รอเตรียมสินค้า'],['shipping','🛵 พร้อมรับ/จัดส่ง'],['done','✅ ประวัติ']
    ];
    const active=isSeller?sellerOrderTab:customerOrderTab,attr=isSeller?'data-seller-order-tab':'data-customer-order-tab';
    return `<div class="order-tabs-sticky" data-order-ui-version="${ORDER_UI_VERSION}">
      <div class="order-tab-strip">${tabs.map(([k,l])=>`<button type="button" ${attr}="${k}" class="${active===k?'active':''}"><span class="order-tab-label">${l}</span><span class="order-tab-count">${buckets[k]?.length||0}</span></button>`).join('')}</div>
      <div class="order-filter-row"><input id="orderSearchInput" value="${esc(orderSearchTerm)}" placeholder="ค้นหา Order / ชื่อ / เบอร์"><select id="orderDateFilter"><option value="today" ${orderDateFilter==='today'?'selected':''}>วันนี้</option><option value="yesterday" ${orderDateFilter==='yesterday'?'selected':''}>เมื่อวาน</option><option value="7d" ${orderDateFilter==='7d'?'selected':''}>7 วัน</option><option value="all" ${orderDateFilter==='all'?'selected':''}>ทั้งหมด</option></select></div>
      <div class="mo-muted order-ui-version">UI v${ORDER_UI_VERSION}</div>
    </div>`;
  }
  async function renderCustomerHub(box){
    box.innerHTML='กำลังโหลด...';
    const {data:groups,error}=await db.from('market_delivery_groups').select('*,orders:market_orders(id,shop_id,subtotal,status,payment_ref,payment_submitted_at,rejection_reason,shop_response_due_at,shop_accepted_at,shop_viewed_at,pickup_completed_at,revision_note,revision_subtotal,revision_requested_at,revision_confirmed_at,refund_required,refund_status,refund_amount,refund_ref,refund_slip_path,refund_submitted_at,refund_confirmed_at,refund_destination_type,refund_destination_promptpay_type,refund_destination_value,refund_destination_bank,refund_destination_name,refund_destination_submitted_at,created_at,shop:market_shops(name,latitude,longitude,phone,landmark,address),items:market_order_items(product_name,unit_price,qty,options_json,note)),batches:market_delivery_batches(id,status,rider_job_id,rider_name,rider_phone,delivery_fee,distance_km,created_at,accepted_at,pickup_started_at,picked_up_at,delivering_at,delivery_arrived_at,proof_path,proof_uploaded_at,customer_confirmed_at,delivery_issue_status,delivery_issue_note,delivery_issue_at,proof_deleted_at,completed_at,batch_orders:market_delivery_batch_orders(order_id))').eq('customer_id',session.user.id).order('created_at',{ascending:false}).limit(100);
    if(error){box.innerHTML=`<div class="warning-banner">${esc(error.message)}</div>`;return}
    const filtered=(groups||[]).filter(g=>orderDateMatches(g.created_at)&&orderSearchMatchesGroup(g));
    const buckets={waiting:[],processing:[],shipping:[],done:[]};
    for(const g of filtered)buckets[customerGroupBucket(g)].push(g);

    const focused=customerFocusGroupId?(groups||[]).find(g=>String(g.id)===String(customerFocusGroupId)):null;
    const focusedOrder=customerFocusOrderId?(groups||[]).flatMap(g=>(g.orders||[]).map(o=>({g,o}))).find(x=>String(x.o.id)===String(customerFocusOrderId)):null;
    if(customerFocusOrderId&&focusedOrder){
      customerFocusGroupId=String(focusedOrder.g.id);
      customerOrderTab=customerOrderStatusBucket(focusedOrder.o.status);
    }else if(customerFocusGroupId){
      if(focused)customerOrderTab=customerGroupBucket(focused);
      else customerOrderTab='waiting';
    }
    if(!buckets[customerOrderTab])customerOrderTab='waiting';
    const active=buckets[customerOrderTab];
    if(customerFocusGroupId)active.sort((a,b)=>String(a.id)===String(customerFocusGroupId)?-1:String(b.id)===String(customerFocusGroupId)?1:0);
    const limit=10*customerOrderPage,shown=active.slice(0,limit);
    const title={waiting:'⏳ รอดำเนินการ',processing:'🍳 รอ / กำลังเตรียมสินค้า',shipping:'🛵 พร้อมรับ / จัดส่ง',done:'✅ ประวัติ'}[customerOrderTab];

    box.innerHTML=orderTabsToolbar('customer',buckets)+
      `${focused?`<div class="post-checkout-banner"><b>✅ สั่งซื้อสำเร็จ</b><span>ติดตามแต่ละร้านได้จากหน้านี้ ร้านที่รับอัตโนมัติสามารถชำระเงินได้ทันที ส่วนร้านที่รับเองจะขึ้นรอร้านยืนยัน</span></div>`:''}`+
      `<section class="order-active-pane"><div class="order-active-head"><div><b>${title}</b>${sellerOrderTab==='action'&&active.length?'<div class="order-work-hint">เรียงงานเร่งด่วนและออเดอร์เก่าก่อน</div>':''}</div><span class="${sellerOrderTab==='action'&&active.length?'order-count-alert':''}">${active.length} รายการ</span></div>
      ${shown.length?shown.map(customerGroupCard).join(''):'<div class="order-group-empty">ไม่มีรายการในหมวดนี้</div>'}
      ${active.length>shown.length?`<div class="order-load-more"><div class="mo-muted">แสดง ${shown.length} จาก ${active.length} รายการ</div><button id="customerLoadMoreOrders" class="mo-secondary">โหลดเพิ่ม</button></div>`:''}
      </section>`;
    if(focused||focusedOrder)setTimeout(()=>{customerFocusGroupId=null;customerFocusOrderId=null},2500);
  }
  async function renderSellerHub(box){
    box.innerHTML='กำลังโหลด...';const {data:shops,error}=await db.from('market_shops').select('id,name,status').eq('owner_id',session.user.id).order('created_at',{ascending:false});if(error){box.innerHTML=esc(error.message);return}box.innerHTML=`<div class="mo-muted">เลือกแท็บร้านเพื่อจัดสินค้า QR รับเงิน และดูออเดอร์ที่ลูกค้าสั่งเข้ามา</div>${(shops||[]).map(s=>`<button class="seller-shop-card" style="display:block;width:100%;text-align:left;background:#fff;cursor:pointer" data-seller-shop="${s.id}"><b>🏪 ${esc(s.name)}</b><div class="mo-muted">สถานะร้าน: ${esc(s.status)}</div></button>`).join('')||'<p>บัญชีนี้ยังไม่มีร้าน</p>'}`;
  }

  async function loadShopInsights(shopId){
    const days=30;
    try{
      const [{data:insight,error:e1},{data:reviews,error:e2}]=await Promise.all([
        db.rpc('market_shop_owner_insights',{p_shop_id:shopId,p_days:days}),
        db.from('market_reviews').select('rating,created_at').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(500)
      ]);
      if(e1)throw e1;if(e2)console.debug('reviews insight',e2.message);
      const x=Array.isArray(insight)?insight[0]:insight||{},rv=reviews||[],avg=rv.length?rv.reduce((a,r)=>a+Number(r.rating||0),0)/rv.length:0;
      return {...x,review_count:rv.length,review_average:avg};
    }catch(err){console.warn('Shop insight:',err?.message||err);return null}
  }
  function shopInsightHtml(x){
    if(!x)return `<section class="seller-section"><h3>📊 รายงานร้านค้า</h3><div class="mo-muted">กำลังเก็บข้อมูลสำหรับรายงานร้านของคุณ</div></section>`;
    const low=Number(x.shop_views||0)<5;
    const trend=Number(x.sales_prev||0)>0?((Number(x.sales_total||0)-Number(x.sales_prev))/Number(x.sales_prev))*100:null;
    return `<section class="seller-section"><div class="order-card-head"><div><h3 style="margin:0">📊 รายงานร้านค้า</h3><div class="mo-muted">ข้อมูล 30 วันล่าสุด · เห็นเฉพาะร้านของคุณ</div></div></div>
      <div class="shop-insight-grid">
        <div class="shop-insight-card"><small>ยอดขายจริง</small><strong>${money(x.sales_total||0)} บาท</strong><span>${Number(x.completed_orders||0)} ออเดอร์สำเร็จ</span></div>
        <div class="shop-insight-card"><small>ยอดเฉลี่ยต่อบิล</small><strong>${money(x.avg_order||0)} บาท</strong><span>${trend===null?'กำลังเก็บแนวโน้ม':`${trend>=0?'↑':'↓'} ${Math.abs(trend).toFixed(0)}% จากช่วงก่อน`}</span></div>
        <div class="shop-insight-card"><small>Delivery</small><strong>${money(x.delivery_sales||0)} บาท</strong><span>รับที่ร้าน ${money(x.pickup_sales||0)} บาท</span></div>
        <div class="shop-insight-card"><small>ความสนใจร้าน</small><strong>${low?'กำลังเก็บข้อมูล':Number(x.shop_views||0).toLocaleString('th-TH')+' ครั้ง'}</strong><span>${low?'ข้อมูลยังไม่พอสำหรับสรุปแนวโน้ม':`กดพิกัด ${Number(x.navigate_clicks||0).toLocaleString('th-TH')} · โทร ${Number(x.phone_clicks||0).toLocaleString('th-TH')}`}</span></div>
        <div class="shop-insight-card"><small>รีวิว</small><strong>${Number(x.review_count||0)?Number(x.review_average||0).toFixed(1)+' ⭐':'ยังไม่มีรีวิว'}</strong><span>${Number(x.review_count||0)} รีวิว</span></div>
        <div class="shop-insight-card"><small>ยกเลิก / คืนเงิน</small><strong>${Number(x.cancelled_orders||0)} ออเดอร์</strong><span>คืนเงิน ${money(x.refund_total||0)} บาท</span></div>
      </div>
      <div class="mo-muted" style="margin-top:10px">💡 ${Number(x.shop_views||0)>=10&&Number(x.completed_orders||0)===0?'มีคนสนใจร้านแล้ว ลองเพิ่มรูปสินค้า เมนู หรือโปรโมชั่นเพื่อช่วยเปลี่ยนเป็นออเดอร์':Number(x.navigate_clicks||0)>0?'มีลูกค้ากดดูพิกัดร้านของคุณ แสดงว่ามีความสนใจเดินทางมาที่ร้าน':'ระบบจะสรุปคำแนะนำเมื่อมีข้อมูลเพียงพอ'}</div>
    </section>`;
  }
  async function loadSellerOrdersDetailed(shopId){
    const orderFields='id,subtotal,status,payment_ref,payment_slip_path,payment_submitted_at,response_due_at,paid_at,customer_cancel_reason,customer_cancelled_at,rejection_reason,shop_response_due_at,shop_accepted_at,shop_viewed_at,pickup_completed_at,revision_note,revision_subtotal,revision_requested_at,revision_confirmed_at,refund_required,refund_status,refund_amount,refund_ref,refund_slip_path,refund_submitted_at,refund_confirmed_at,refund_destination_type,refund_destination_promptpay_type,refund_destination_value,refund_destination_bank,refund_destination_name,refund_destination_submitted_at,created_at,customer_id,group_id';
    const {data:orders,error}=await db.from('market_orders').select(orderFields).eq('shop_id',shopId).order('created_at',{ascending:false}).limit(50);
    if(error)throw error;
    const list=orders||[];
    if(!list.length)return list;

    const orderIds=list.map(o=>o.id);
    const groupIds=[...new Set(list.map(o=>o.group_id).filter(Boolean))];

    const [itemsRes,groupsRes,batchesRes]=await Promise.all([
      db.from('market_order_items').select('order_id,product_name,unit_price,qty,options_json,note').in('order_id',orderIds),
      groupIds.length
        ? db.from('market_delivery_groups').select('id,customer_name,customer_phone,delivery_address,fulfillment_method,pickup_requested_at,status').in('id',groupIds)
        : Promise.resolve({data:[],error:null}),
      groupIds.length
        ? db.from('market_delivery_batches').select('id,group_id,status,rider_job_id,rider_name,rider_phone,delivery_fee,distance_km,accepted_at,pickup_started_at,picked_up_at,delivering_at,delivery_arrived_at,proof_path,proof_uploaded_at,customer_confirmed_at,delivery_issue_status,delivery_issue_note,delivery_issue_at,proof_deleted_at,completed_at').in('group_id',groupIds)
        : Promise.resolve({data:[],error:null})
    ]);
    if(itemsRes.error)throw itemsRes.error;
    if(groupsRes.error)throw groupsRes.error;
    if(batchesRes.error)throw batchesRes.error;

    const batchIds=(batchesRes.data||[]).map(b=>b.id);
    let batchOrders=[];
    if(batchIds.length){
      const {data,error:boErr}=await db.from('market_delivery_batch_orders').select('batch_id,order_id').in('batch_id',batchIds);
      if(boErr)throw boErr;
      batchOrders=data||[];
    }

    const itemsByOrder=new Map();
    for(const i of (itemsRes.data||[])){
      if(!itemsByOrder.has(i.order_id))itemsByOrder.set(i.order_id,[]);
      itemsByOrder.get(i.order_id).push(i);
    }
    const groupById=new Map((groupsRes.data||[]).map(g=>[g.id,{...g,batches:[]}]));
    const boByBatch=new Map();
    for(const bo of batchOrders){
      if(!boByBatch.has(bo.batch_id))boByBatch.set(bo.batch_id,[]);
      boByBatch.get(bo.batch_id).push({order_id:bo.order_id});
    }
    for(const b of (batchesRes.data||[])){
      const g=groupById.get(b.group_id);
      if(g)g.batches.push({...b,batch_orders:boByBatch.get(b.id)||[]});
    }

    return list.map(o=>({
      ...o,
      group:o.group_id?(groupById.get(o.group_id)||null):null,
      items:itemsByOrder.get(o.id)||[]
    }));
  }

  async function openSellerShop(shopId){
    markSellerOrdersViewed(shopId);
    let shop,setting,categories,products,orders,insights;
    try{
      const results=await Promise.all([
        db.from('market_shops').select('id,name,owner_id').eq('id',shopId).maybeSingle(),
        db.from('market_shop_order_settings').select('*').eq('shop_id',shopId).maybeSingle(),
        db.from('market_product_categories').select('*').eq('shop_id',shopId).order('sort_order').order('created_at'),
        db.from('market_products').select('*').eq('shop_id',shopId).order('sort_order').order('created_at'),
        loadSellerOrdersDetailed(shopId),
        loadShopInsights(shopId)
      ]);
      shop=results[0].data;setting=results[1].data;categories=results[2].data||[];products=results[3].data||[];orders=results[4]||[];insights=results[5];
      const firstErr=results.slice(0,4).map(x=>x?.error).find(Boolean);
      if(firstErr)throw firstErr;
    }catch(err){
      console.error('Seller data load failed',err);
      return alert('โหลดออเดอร์ร้านไม่สำเร็จ: '+(err?.message||err));
    }
    try{const unseenIds=(orders||[]).filter(o=>!o.shop_viewed_at&&!['cancelled','completed'].includes(o.status)).map(o=>o.id);if(unseenIds.length)await db.rpc('market_shop_mark_orders_viewed',{p_order_ids:unseenIds});}catch(_e){}
    const {data:shopAccess}=await db.from('market_order_shop_access').select('enabled').eq('shop_id',shopId).maybeSingle();
    const accepting=setting?.accepting_status||'open';
    openModal(`<input id="sellerShopId" type="hidden" value="${esc(shopId)}"><h2 class="mo-title">🏪 ${esc(shop?.name||'ร้าน')}</h2>${shopInsightHtml(insights)}<section class="seller-section"><h3>รับออเดอร์และการชำระเงิน</h3>${shopAccess?.enabled?'<div class="ready-banner">✅ ร้านนี้ได้รับสิทธิ์ใช้งานระบบสั่งซื้อจริงแล้ว</div>':'<div class="warning-banner">🔒 ร้านนี้ยังไม่ได้รับสิทธิ์เปิดขายผ่านระบบจริง กรุณาติดต่อผู้ดูแลระบบ</div>'}<div class="mo-form two"><label class="full"><input id="orderEnabled" type="checkbox" ${setting?.enabled?'checked':''}> เปิดระบบรับออเดอร์ผ่านตลาด</label><label>สถานะรับออเดอร์ตอนนี้<select id="acceptingStatus"><option value="open" ${accepting==='open'?'selected':''}>🟢 เปิดรับออเดอร์</option><option value="paused" ${accepting==='paused'?'selected':''}>⏸️ พักรับออเดอร์ชั่วคราว</option></select></label><label>เหตุผลที่พักรับ<input id="pauseReason" value="${esc(setting?.pause_reason||'')}" placeholder="เช่น ของหมด / คนไม่พอ"></label><label>เริ่มรับออเดอร์<input id="orderStartTime" type="time" value="${esc(hhmm(setting?.order_start_time))}"></label><label>หยุดรับออเดอร์<input id="orderEndTime" type="time" value="${esc(hhmm(setting?.order_end_time))}"></label><label>โหมดรับออเดอร์<select id="autoAcceptMode"><option value="manual" ${(setting?.auto_accept_mode||'manual')==='manual'?'selected':''}>✋ ร้านกดรับเอง</option><option value="always" ${setting?.auto_accept_mode==='always'?'selected':''}>⚡ รับอัตโนมัติตลอด</option><option value="schedule" ${setting?.auto_accept_mode==='schedule'?'selected':''}>🕐 รับอัตโนมัติตามเวลา</option></select></label><label>Auto เริ่ม<input id="autoAcceptStartTime" type="time" value="${esc(hhmm(setting?.auto_accept_start_time))}"></label><label>Auto หยุด<input id="autoAcceptEndTime" type="time" value="${esc(hhmm(setting?.auto_accept_end_time))}"></label><label class="full"><small>โหมดตามเวลา: นอกช่วงเวลาที่กำหนด ออเดอร์จะกลับไปรอร้านกดรับเอง ร้านเปลี่ยนโหมดนี้ได้ทุกเมื่อ</small></label><label>ชื่อบัญชี/ชื่อรับเงิน<input id="paymentName" value="${esc(setting?.payment_name||'')}"></label><label>หมายเหตุการชำระเงิน<input id="paymentNote" value="${esc(setting?.payment_note||'')}"></label><label class="full">อัปโหลดรูป QR PromptPay<input id="paymentQrFile" type="file" accept="image/*"></label>${setting?.payment_qr_url?`<div class="full"><img src="${esc(setting.payment_qr_url)}" style="max-width:180px;border:1px solid #ddd;border-radius:12px"></div>`:''}</div><div class="warning-banner">ถ้าไม่กำหนดเวลาเริ่ม/หยุด ระบบจะรับออเดอร์ตลอดวันที่ร้านเปิดระบบไว้</div><div class="mo-actions"><button id="saveOrderSettingsBtn" class="mo-primary">บันทึกการตั้งค่า</button></div></section><section class="seller-section"><div class="order-card-head"><div><h3 style="margin:0">หมวดหมู่สินค้า</h3><div class="mo-muted">ร้านตั้งชื่อและเรียงลำดับหมวดเองได้</div></div><button id="addProductCategoryBtn" class="mo-secondary">+ เพิ่มหมวดหมู่</button></div>${(categories||[]).length?`<div class="category-admin-list">${categories.map((c,i)=>`<div class="seller-product-row"><div><b>${esc(c.name)}</b> <span class="mo-muted">${(products||[]).filter(p=>String(p.category_id||'')===String(c.id)).length} สินค้า</span></div><div><button class="mo-secondary" data-category-up="${c.id}" ${i===0?'disabled':''}>↑</button> <button class="mo-secondary" data-category-down="${c.id}" ${i===categories.length-1?'disabled':''}>↓</button> <button class="mo-secondary" data-edit-product-category="${c.id}">แก้ชื่อ</button> <button class="mo-danger" data-delete-product-category="${c.id}">ลบ</button></div></div>`).join('')}</div>`:'<div class="mo-muted">ยังไม่มีหมวดหมู่ สามารถเพิ่มได้ เช่น เครื่องดื่ม / เบเกอรี่ / เมนูแนะนำ</div>'}</section><section class="seller-section"><div class="order-card-head"><div><h3 style="margin:0">สินค้า</h3><div class="mo-muted">${(products||[]).length}/100 รายการต่อร้าน</div></div><button id="addProductBtn" class="mo-primary" ${(products||[]).length>=100?'disabled style="opacity:.5" title="ครบ 100 รายการแล้ว"':''}>+ เพิ่มสินค้า</button></div>${(products||[]).length?`${[...(categories||[]),{id:null,name:'อื่น ๆ'}].map(c=>{const rows=(products||[]).filter(p=>c.id?String(p.category_id||'')===String(c.id):!p.category_id);if(!rows.length)return'';return `<div class="seller-category-group"><h4>${esc(c.name)}</h4>${rows.map(p=>`<div class="seller-product-row"><div><b>${esc(p.name)}</b> · ${money(p.price)} บาท <span class="status-pill">${esc(productStatusText(p.sale_status|| (p.active?'available':'sold_out')))}</span></div><div>${p.sale_status==='discontinued'?'<span class="mo-muted">เลิกขาย</span>':`<button class="${p.sale_status==='available'?'mo-warning':'mo-success'}" data-toggle-product-status="${p.id}" data-current-status="${esc(p.sale_status||'sold_out')}">${p.sale_status==='available'?'⏸️ หมดชั่วคราว':'▶️ เปิดขาย'}</button>`} <button class="mo-secondary" data-product-options="${p.id}">⚙️ ตัวเลือก</button> <button class="mo-secondary" data-edit-product="${p.id}">แก้ไข</button> <button class="mo-danger" data-delete-product="${p.id}">ลบถาวร</button></div></div>`).join('')}</div>`}).join('')}`:'<p>ยังไม่มีสินค้า</p>'}</section><section class="seller-section"><h3>ออเดอร์ที่ได้รับ</h3>${renderSellerOrderSections(orders||[])}</section>`,true);
  }
  document.addEventListener('click',e=>{const oc=e.target.closest?.('.order-card[data-order-card-id]');if(oc)markOrderSeen(oc.dataset.orderCardId)},true);
  function sellerOrderBucket(o){
    if(o.pickup_completed_at||o.status==='cancelled'||o.group?.status==='completed'||o.refund_status==='completed')return 'done';
    if(o.status==='ready')return 'ready';
    if(o.status==='preparing')return 'preparing';
    if(['pending_shop','awaiting_customer_confirmation','awaiting_payment','payment_review'].includes(o.status)||o.refund_required&&o.refund_status!=='completed')return 'action';
    return 'done';
  }
  function sellerOrderSearchMatches(o){
    const q=String(orderSearchTerm||'').trim().toLowerCase();if(!q)return true;
    const text=[o.id,o.group?.customer_name,o.group?.customer_phone,o.rejection_reason].filter(Boolean).join(' ').toLowerCase();
    return text.includes(q);
  }
  function seenOrderKey(){return `market_seen_orders_${session?.user?.id||'guest'}`}
  function getSeenOrders(){try{return new Set(JSON.parse(localStorage.getItem(seenOrderKey())||'[]'))}catch(_e){return new Set()}}
  function isOrderSeen(id){return getSeenOrders().has(String(id))}
  function markOrderSeen(id){const x=getSeenOrders();x.add(String(id));localStorage.setItem(seenOrderKey(),JSON.stringify([...x].slice(-500)))}
  function orderActionLabel(o){if(o.refund_required&&o.refund_status!=='completed')return 'คืนเงินลูกค้า';if(o.status==='payment_review')return 'ตรวจสอบเงิน';if(o.status==='pending_shop')return 'รับออเดอร์';if(o.status==='awaiting_customer_confirmation')return 'รอลูกค้ายืนยัน';if(o.status==='awaiting_payment')return 'รอลูกค้าชำระ';if(o.status==='preparing')return 'เตรียมสินค้า';if(o.status==='ready')return 'รอรับ/จัดส่ง';return ''}
  function sellerOrderPriority(o){
    if(o.refund_required&&o.refund_status!=='completed')return 0;
    if(o.status==='payment_review')return 1;
    if(o.status==='pending_shop')return 2;
    if(o.status==='awaiting_customer_confirmation')return 3;
    if(o.status==='awaiting_payment')return 4;
    if(o.status==='preparing')return 5;
    if(o.status==='ready')return 6;
    return 9;
  }
  function sellerOrderAge(o){
    const t=new Date(o.created_at).getTime();if(!Number.isFinite(t))return '';
    const min=Math.max(0,Math.floor((Date.now()-t)/60000));
    if(min<1)return 'เมื่อสักครู่';
    if(min<60)return `${min} นาที`;
    const h=Math.floor(min/60);if(h<24)return `${h} ชม. ${min%60} นาที`;
    return new Date(o.created_at).toLocaleString('th-TH');
  }
  function renderSellerOrderSections(orders){
    const b={action:[],preparing:[],ready:[],done:[]};
    for(const o of (orders||[]).filter(x=>orderDateMatches(x.created_at)&&sellerOrderSearchMatches(x)))b[sellerOrderBucket(o)].push(o);
    for(const key of Object.keys(b))b[key].sort((a,c)=>sellerOrderPriority(a)-sellerOrderPriority(c)||new Date(a.created_at)-new Date(c.created_at));

    if(!b[sellerOrderTab])sellerOrderTab='action';
    const active=b[sellerOrderTab],limit=10*sellerOrderPage,shown=active.slice(0,limit);
    const title={action:'🔴 ต้องทำตอนนี้',preparing:'🟠 กำลังเตรียม',ready:'🟢 พร้อมส่ง / พร้อมรับ',done:'⚪ จบแล้ว'}[sellerOrderTab];
    const unseenCount=active.filter(o=>!isOrderSeen(o.id)).length;

    return orderTabsToolbar('seller',b)+
      `<section class="order-active-pane">${sellerOrderTab==='action'&&active.length?`<div class="order-queue-summary"><div><b>งานที่ต้องจัดการ ${active.length}</b><small>${unseenCount?` · ใหม่ ${unseenCount}`:''}</small></div><div class="queue-priority">ทำรายการบนสุดก่อน</div></div>`:''}<div class="order-active-head"><b>${title}</b><span>${active.length} รายการ</span></div>
      ${shown.length?shown.map(sellerOrderCard).join(''):'<div class="order-group-empty">ไม่มีรายการในหมวดนี้</div>'}
      ${active.length>shown.length?`<div class="order-load-more"><div class="mo-muted">แสดง ${shown.length} จาก ${active.length} รายการ</div><button id="sellerLoadMoreOrders" class="mo-secondary">โหลดเพิ่ม</button></div>`:''}
      </section>`;
  }
  function renderOrderItem(i,withTotal=false){const opts=Array.isArray(i.options_json)?i.options_json:[],opt=opts.length?`<div class="mo-muted">${opts.map(o=>`${esc(o.group_name)}: ${esc(o.value_name)}${Number(o.price_delta||0)?` (+${money(o.price_delta)}฿)`:''}`).join(' · ')}</div>`:'',note=i.note?`<div class="mo-muted">📝 ${esc(i.note)}</div>`:'',total=withTotal?` = ${money(Number(i.unit_price)*i.qty)} บาท`:'';return `<div style="margin-bottom:7px"><b>${esc(i.product_name)} × ${i.qty}${total}</b>${opt}${note}</div>`;}
  function sellerOrderDeliveryInfo(o){
    if(o.group?.fulfillment_method==='pickup')return '';
    const batch=(o.group?.batches||[]).filter(b=>b.status!=='cancelled').find(b=>(b.batch_orders||[]).some(x=>String(x.order_id)===String(o.id)));
    if(!batch)return o.status==='ready'?`<div class="ready-banner">🛵 พร้อมให้ลูกค้าเรียกวิน</div>`:'';
    const phone=batch.rider_phone||'',arrived=!!batch.delivery_arrived_at,done=batch.status==='completed',issue=batch.delivery_issue_status==='open';
    const label=done?'ส่งสำเร็จ':arrived?'วินส่งมอบแล้ว · รอลูกค้ายืนยัน':deliveryBatchStatusText(batch.status);
    return `<div class="delivery-track"><b>🛵 ${esc(label)}</b>${batch.rider_name||phone?`<div class="rider-contact"><b>วิน: ${esc(batch.rider_name||'ไม่ระบุชื่อ')}</b>${phone?` · ${esc(phone)} <a href="tel:${esc(phone)}">📞 โทรหาวิน</a>`:''}</div>`:`<div class="mo-muted">รอวินรับงาน</div>`}${batch.delivery_fee?`<div class="mo-muted">ค่าส่งประมาณ ${money(batch.delivery_fee)} บาท${batch.distance_km?` · ${Number(batch.distance_km).toFixed(1)} กม.`:''}</div>`:''}${batch.accepted_at?`<div class="mo-muted">รับงาน ${new Date(batch.accepted_at).toLocaleString('th-TH')}</div>`:''}${batch.delivery_arrived_at?`<div class="mo-muted">ถึงปลายทาง ${new Date(batch.delivery_arrived_at).toLocaleString('th-TH')}</div>`:''}${batch.customer_confirmed_at?`<div class="mo-muted">ลูกค้ายืนยันรับ ${new Date(batch.customer_confirmed_at).toLocaleString('th-TH')}</div>`:''}${issue?`<div class="warning-banner">⚠️ ลูกค้าแจ้งปัญหา: ${esc(batch.delivery_issue_note||'')}</div>`:''}${batch.proof_path&&!batch.proof_deleted_at?`<div class="mo-actions"><button class="mo-secondary" data-view-delivery-proof="${batch.id}">📷 ดูหลักฐานส่งมอบ</button></div>`:batch.proof_deleted_at?`<div class="mo-muted">📷 หลักฐานถูกลบตามนโยบายแล้ว</div>`:''}</div>`;
  }
  function sellerOrderCard(o){
    const rejectable=['pending_shop','awaiting_customer_confirmation','awaiting_payment','payment_review','preparing'].includes(o.status);let refund='';
    if(o.refund_required){const rs=o.refund_status||'pending';if(rs==='pending')refund=o.refund_destination_submitted_at?`<div class="warning-banner">⚠️ ต้องคืนเงินลูกค้า ${money(o.refund_amount||o.subtotal)} บาท<br><b>${esc(refundDestinationLabel(o,false))}</b></div><div class="mo-actions"><button class="mo-primary" data-refund-order="${o.id}">💸 แจ้งคืนเงินแล้ว</button></div>`:`<div class="warning-banner">⏳ ต้องคืนเงิน ${money(o.refund_amount||o.subtotal)} บาท แต่ลูกค้ายังไม่ได้ระบุช่องทางรับเงินคืน</div>`;else if(rs==='seller_submitted')refund=`<div class="ready-banner">💸 ร้านแจ้งคืนเงิน ${money(o.refund_amount||o.subtotal)} บาทแล้ว กำลังรอลูกค้ายืนยัน</div><div class="mo-actions">${o.refund_slip_path?`<button class="mo-secondary" onclick="window.marketOrderOpenRefundSlip('${o.id}','${esc(o.refund_slip_path)}')">ดูหลักฐานคืนเงิน</button>`:''}</div>`;else if(rs==='completed')refund=`<div class="ready-banner">✅ ลูกค้ายืนยันได้รับเงินคืน ${money(o.refund_amount||o.subtotal)} บาทแล้ว</div>`;}
    const closed=!!o.pickup_completed_at||o.status==='cancelled'||o.group?.status==='completed';const phone=closed?maskPhone(o.group?.customer_phone):o.group?.customer_phone||'';const overdue=o.status==='pending_shop'&&o.shop_response_due_at&&new Date(o.shop_response_due_at)<new Date();
    const pendingActions=o.status==='pending_shop'?`<div class="warning-banner">${overdue?'⚠️ รอรับออเดอร์เกิน 15 นาทีแล้ว':'ลูกค้ายังไม่ได้ชำระเงิน ร้านสามารถโทรคุยและตรวจรายการก่อนรับได้'}</div><div class="mo-actions"><button class="mo-primary" data-accept-order="${o.id}">✅ รับออเดอร์</button><button class="mo-secondary" data-revise-order="${o.id}">✏️ เสนอเปลี่ยนรายการ/ยอด</button></div>`:'';
    const revisionWait=o.status==='awaiting_customer_confirmation'?`<div class="warning-banner">⏳ รอลูกค้ายืนยันรายการใหม่<br>${esc(o.revision_note||'')}<br>ยอดที่เสนอ <b>${money(o.revision_subtotal||o.subtotal)} บาท</b></div>`:'';
    const unseen=!isOrderSeen(o.id),nextAction=orderActionLabel(o);
    return `<article class="order-card ${unseen?'order-unseen':''}" data-order-card-id="${esc(o.id)}"><div class="order-card-head"><div><div class="seller-order-title"><b>Order #${esc(String(o.id).slice(0,8).toUpperCase())}</b>${unseen?'<span class="order-new-badge">ใหม่</span>':''}<span class="order-age ${overdue?'urgent':''}">⏱ ${esc(sellerOrderAge(o))}</span></div>${nextAction?`<div class="order-next-action">ตอนนี้: <b>${esc(nextAction)}</b></div>`:''}<div class="mo-muted">${esc(o.group?.customer_name||'ลูกค้า')} · ${esc(phone)} ${!closed&&phone?`<a href="tel:${esc(phone)}">📞 โทร</a>`:''}<br>${o.group?.fulfillment_method==='pickup'?`🏪 รับเองที่ร้าน${o.group?.pickup_requested_at?` · ขอรับ ${new Date(o.group.pickup_requested_at).toLocaleString('th-TH')}`:' · รับเร็วที่สุด'}`:`🛵 จัดส่ง · ${esc(o.group?.delivery_address||'')}`}</div></div><span class="status-pill status-${esc(o.status)}">${esc(statusText(o.status))}</span></div><div class="order-items">${(o.items||[]).map(i=>renderOrderItem(i,false)).join('')}</div><b>ยอด ${money(o.subtotal)} บาท</b>${o.pickup_completed_at?`<div class="ready-banner">✅ ลูกค้ารับสินค้าแล้ว<br><small>${new Date(o.pickup_completed_at).toLocaleString('th-TH')}</small></div>`:''}${o.revision_confirmed_at&&o.revision_note?`<div class="ready-banner">✅ ลูกค้ายืนยันรายการแก้ไขแล้ว: ${esc(o.revision_note)}</div>`:''}${pendingActions}${revisionWait}${o.payment_ref?`<div>อ้างอิง: ${esc(o.payment_ref)}</div>`:''}${o.rejection_reason?`<div class="mo-muted">เหตุผลยกเลิก: ${esc(o.rejection_reason)}</div>`:''}${sellerOrderDeliveryInfo(o)}${refund}<div class="mo-actions">${o.payment_slip_path?`<button class="mo-secondary" onclick="window.marketOrderOpenSlip('${esc(o.payment_slip_path)}')">ดูสลิปชำระ</button>`:''}${o.status==='payment_review'?`<button class="mo-primary" data-order-id="${o.id}" data-order-status="preparing">✅ เงินเข้าแล้ว / เริ่มเตรียม</button><button class="mo-danger" data-order-id="${o.id}" data-order-status="awaiting_payment">ยังไม่พบยอด</button>`:''}${o.status==='preparing'?`<button class="mo-primary" data-order-id="${o.id}" data-order-status="ready">📦 สินค้าพร้อมรับ</button>`:''}${o.status==='ready'&&o.group?.fulfillment_method==='pickup'&&!o.pickup_completed_at?`<button class="mo-primary" data-pickup-complete="${o.id}">✅ ลูกค้ารับสินค้าแล้ว</button>`:''}${rejectable?`<button class="mo-danger" data-reject-order="${o.id}">ปฏิเสธออเดอร์</button>`:''}</div></article>`;
  }
  function maskPhone(v){const x=String(v||'');if(x.length<7)return x?x.slice(0,2)+'X-XXX-'+x.slice(-3):'';return x.slice(0,2)+'X-XXX-'+x.slice(-3);}

  window.marketOrderOpenSlip=async path=>{
    const clean=normalizeSlipPath(path);
    const {data,error}=await db.storage.from('order-slips').createSignedUrl(clean,120);
    if(error)return alert(error.message);
    window.open(data.signedUrl,'_blank');
  };
  function normalizeSlipPath(path){
    let p=String(path||'').trim();
    try{p=decodeURIComponent(p)}catch(_e){}
    p=p.split('?')[0].split('#')[0].replace(/^\/+/, '');
    const marker='order-slips/';
    const i=p.indexOf(marker);
    if(i>=0)p=p.slice(i+marker.length);
    return p.replace(/^\/+/, '');
  }
  window.marketOrderOpenRefundSlip=async(orderId,storedPath)=>{
    const direct=normalizeSlipPath(storedPath);
    let signed=await db.storage.from('order-slips').createSignedUrl(direct,120);
    if(!signed.error&&signed.data?.signedUrl){window.open(signed.data.signedUrl,'_blank');return}
    // Fallback: reconstruct the actual upload path from order_id + shop owner_id + filename.
    const {data:o,error:qErr}=await db.from('market_orders').select('id,shop:market_shops(owner_id)').eq('id',orderId).maybeSingle();
    if(qErr)return alert(qErr.message);
    const ownerId=o?.shop?.owner_id;
    const fileName=direct.split('/').filter(Boolean).pop();
    if(!ownerId||!fileName)return alert(signed.error?.message||'ไม่พบหลักฐานคืนเงิน');
    const expected=`${orderId}/${ownerId}/${fileName}`;
    signed=await db.storage.from('order-slips').createSignedUrl(expected,120);
    if(signed.error)return alert(signed.error.message);
    window.open(signed.data.signedUrl,'_blank');
  };
  async function saveOrderSettings(){
    const shopId=document.getElementById('sellerShopId').value,enabled=document.getElementById('orderEnabled').checked,accepting_status=document.getElementById('acceptingStatus').value,pause_reason=document.getElementById('pauseReason').value.trim(),order_start_time=document.getElementById('orderStartTime').value||null,order_end_time=document.getElementById('orderEndTime').value||null,auto_accept_mode=document.getElementById('autoAcceptMode').value,auto_accept_start_time=document.getElementById('autoAcceptStartTime').value||null,auto_accept_end_time=document.getElementById('autoAcceptEndTime').value||null,name=document.getElementById('paymentName').value.trim(),note=document.getElementById('paymentNote').value.trim(),file=document.getElementById('paymentQrFile').files?.[0];let qr=null;
    const {data:old}=await db.from('market_shop_order_settings').select('payment_qr_url,payment_qr_path').eq('shop_id',shopId).maybeSingle();qr=old?.payment_qr_url||null;let qrPath=old?.payment_qr_path||null,newQrPath=null;
    if(file){try{const packed=await compressImage(file,{maxSide:1400,targetBytes:450*1024,quality:.95,minQuality:.82});newQrPath=`${session.user.id}/${shopId}/payment-qr-${Date.now()}.webp`;const {error:up}=await db.storage.from('shop-images').upload(newQrPath,packed,{contentType:'image/webp'});if(up)throw up;qr=db.storage.from('shop-images').getPublicUrl(newQrPath).data.publicUrl;qrPath=newQrPath;}catch(err){return alert('อัปโหลด QR ไม่สำเร็จ: '+err.message)}}
    if(enabled&&!qr)return alert('เปิดรับออเดอร์ได้เมื่ออัปโหลด QR รับเงินแล้ว');if((order_start_time&&!order_end_time)||(!order_start_time&&order_end_time))return alert('ถ้ากำหนดเวลารับออเดอร์ กรุณาใส่ทั้งเวลาเริ่มและเวลาหยุด');if(auto_accept_mode==='schedule'&&(!auto_accept_start_time||!auto_accept_end_time))return alert('โหมด Auto ตามเวลา กรุณากำหนดทั้งเวลาเริ่มและเวลาหยุด');
    const {error}=await db.from('market_shop_order_settings').upsert({shop_id:shopId,enabled,accepting_status,pause_reason:accepting_status==='paused'?(pause_reason||null):null,order_start_time,order_end_time,auto_accept_mode,auto_accept_start_time:auto_accept_mode==='schedule'?auto_accept_start_time:null,auto_accept_end_time:auto_accept_mode==='schedule'?auto_accept_end_time:null,payment_qr_url:qr,payment_qr_path:qrPath,payment_name:name||null,payment_note:note||null,updated_at:new Date().toISOString()});if(error){if(newQrPath)await safeRemove('shop-images',newQrPath);return alert(error.message)}if(newQrPath&&old?.payment_qr_path&&old.payment_qr_path!==newQrPath)await safeRemove('shop-images',old.payment_qr_path);alert('บันทึกแล้ว');await refreshProductShops();openSellerShop(shopId);
  }
  async function openProductOptions(productId){
    const [{data:p,error:pErr},{data:groups,error:gErr},{data:values,error:vErr}]=await Promise.all([
      db.from('market_products').select('id,shop_id,name').eq('id',productId).maybeSingle(),
      db.from('market_product_option_groups').select('*').eq('product_id',productId).order('sort_order').order('created_at'),
      db.from('market_product_option_values').select('*,group:market_product_option_groups!inner(product_id)').eq('group.product_id',productId).order('sort_order').order('created_at')
    ]);if(pErr||gErr||vErr||!p)return alert((pErr||gErr||vErr)?.message||'ไม่พบสินค้า');
    const html=(groups||[]).map(g=>{const vs=(values||[]).filter(v=>String(v.group_id)===String(g.id));return `<section class="payment-card"><div class="order-card-head"><div><b>${esc(g.name)}</b><div class="mo-muted">${g.selection_type==='single'?'เลือกได้ 1':'เลือกหลายรายการ สูงสุด '+g.max_select} · ${g.required?'บังคับเลือก':'ไม่บังคับ'}</div></div><div><button class="mo-secondary" data-edit-option-group="${g.id}">แก้กลุ่ม</button> <button class="mo-danger" data-delete-option-group="${g.id}">ลบกลุ่ม</button></div></div>${vs.map(v=>`<div class="seller-product-row"><div>${esc(v.name)} ${Number(v.price_delta||0)?`<b>+${money(v.price_delta)} บาท</b>`:'<span class="mo-muted">+0 บาท</span>'}</div><div><button class="mo-secondary" data-edit-option-value="${v.id}">แก้</button> <button class="mo-danger" data-delete-option-value="${v.id}">ลบ</button></div></div>`).join('')||'<div class="mo-muted">ยังไม่มีตัวเลือกในกลุ่มนี้</div>'}<div class="mo-actions"><button class="mo-secondary" data-add-option-value="${g.id}">+ เพิ่มตัวเลือก</button></div></section>`}).join('');
    openModal(`<input id="optionProductId" type="hidden" value="${p.id}"><input id="optionProductShopId" type="hidden" value="${p.shop_id}"><h2 class="mo-title">⚙️ ตัวเลือก: ${esc(p.name)}</h2><div class="mo-muted">เช่น ระดับความหวาน / ความเผ็ด / เพิ่มไข่ / Topping ระบบจะบันทึกตัวเลือกลงออเดอร์เป็น Snapshot</div><div class="mo-actions"><button id="addOptionGroupBtn" class="mo-primary">+ เพิ่มกลุ่มตัวเลือก</button></div>${html||'<p>ยังไม่มีกลุ่มตัวเลือก</p>'}`,true);
  }
  async function addOptionGroup(){const productId=document.getElementById('optionProductId')?.value;if(!productId)return;const name=prompt('ชื่อกลุ่มตัวเลือก\nเช่น ระดับความหวาน / เพิ่ม Topping');if(name===null||!name.trim())return;const multi=confirm('กลุ่มนี้ให้เลือกได้หลายรายการหรือไม่?\nOK = เลือกหลายรายการ\nCancel = เลือกได้ 1 รายการ');const required=confirm('บังคับให้ลูกค้าต้องเลือกหรือไม่?');let max=1;if(multi){const x=prompt('เลือกได้สูงสุดกี่รายการ?','3');if(x===null)return;max=Math.max(1,Math.min(20,Number(x)||1));}const payload={product_id:productId,name:name.trim().slice(0,100),selection_type:multi?'multiple':'single',required,min_select:required?1:0,max_select:max,active:true};const {error}=await db.from('market_product_option_groups').insert(payload);if(error)return alert(error.message);openProductOptions(productId);}
  async function addOptionValue(groupId){const name=prompt('ชื่อตัวเลือก\nเช่น 25% / ไข่ดาว / Oreo');if(name===null||!name.trim())return;const px=prompt('ราคาเพิ่ม (บาท)\nใส่ 0 ถ้าไม่เพิ่มราคา','0');if(px===null)return;const price=Number(px);if(!Number.isFinite(price)||price<0)return alert('ราคาเพิ่มต้องเป็น 0 หรือมากกว่า');const {data:g}=await db.from('market_product_option_groups').select('product_id').eq('id',groupId).maybeSingle();const {error}=await db.from('market_product_option_values').insert({group_id:groupId,name:name.trim().slice(0,100),price_delta:price,active:true});if(error)return alert(error.message);openProductOptions(g?.product_id||document.getElementById('optionProductId')?.value);}
  async function editOptionGroup(id){const {data:g,error}=await db.from('market_product_option_groups').select('*').eq('id',id).maybeSingle();if(error||!g)return alert(error?.message||'ไม่พบกลุ่ม');const name=prompt('ชื่อกลุ่ม',g.name);if(name===null||!name.trim())return;const max=g.selection_type==='single'?1:Math.max(1,Math.min(20,Number(prompt('เลือกได้สูงสุดกี่รายการ?',String(g.max_select||1))||g.max_select||1)));const {error:up}=await db.from('market_product_option_groups').update({name:name.trim().slice(0,100),max_select:max,updated_at:new Date().toISOString()}).eq('id',id);if(up)return alert(up.message);openProductOptions(g.product_id);}
  async function deleteOptionGroup(id){if(!confirm('ลบกลุ่มตัวเลือกนี้และตัวเลือกทั้งหมดในกลุ่ม?\nออเดอร์เก่าจะยังเก็บ Snapshot เดิมไว้'))return;const {data:g}=await db.from('market_product_option_groups').select('product_id').eq('id',id).maybeSingle();const {error}=await db.from('market_product_option_groups').delete().eq('id',id);if(error)return alert(error.message);openProductOptions(g?.product_id||document.getElementById('optionProductId')?.value);}
  async function editOptionValue(id){const {data:v,error}=await db.from('market_product_option_values').select('*,group:market_product_option_groups(product_id)').eq('id',id).maybeSingle();if(error||!v)return alert(error?.message||'ไม่พบตัวเลือก');const name=prompt('ชื่อตัวเลือก',v.name);if(name===null||!name.trim())return;const px=prompt('ราคาเพิ่ม (บาท)',String(v.price_delta||0));if(px===null)return;const price=Number(px);if(!Number.isFinite(price)||price<0)return alert('ราคาเพิ่มต้องเป็น 0 หรือมากกว่า');const {error:up}=await db.from('market_product_option_values').update({name:name.trim().slice(0,100),price_delta:price,updated_at:new Date().toISOString()}).eq('id',id);if(up)return alert(up.message);openProductOptions(v.group?.product_id||document.getElementById('optionProductId')?.value);}
  async function deleteOptionValue(id){if(!confirm('ลบตัวเลือกนี้?\nออเดอร์เก่าจะยังเก็บข้อมูลเดิมไว้'))return;const {data:v}=await db.from('market_product_option_values').select('group:market_product_option_groups(product_id)').eq('id',id).maybeSingle();const {error}=await db.from('market_product_option_values').delete().eq('id',id);if(error)return alert(error.message);openProductOptions(v?.group?.product_id||document.getElementById('optionProductId')?.value);}

  function renderProductOptionDraft(){
    const box=document.getElementById('productOptionsDraft');if(!box)return;
    box.innerHTML=productOptionDraft.length?productOptionDraft.map((g,gi)=>`<section class="payment-card" style="margin-top:10px"><div class="order-card-head"><div><b>กลุ่มตัวเลือก ${gi+1}</b></div><button type="button" class="mo-danger" data-draft-remove-group="${gi}">ลบกลุ่ม</button></div><div class="mo-form two"><label>ชื่อกลุ่ม *<input data-draft-field="group-name" data-gi="${gi}" value="${esc(g.name||'')}" placeholder="เช่น ระดับความหวาน"></label><label>รูปแบบ<select data-draft-field="group-type" data-gi="${gi}"><option value="single" ${g.selection_type==='single'?'selected':''}>เลือกได้ 1 รายการ</option><option value="multiple" ${g.selection_type==='multiple'?'selected':''}>เลือกได้หลายรายการ</option></select></label><label><input type="checkbox" data-draft-field="group-required" data-gi="${gi}" ${g.required?'checked':''}> บังคับให้ลูกค้าเลือก</label>${g.selection_type==='multiple'?`<label>เลือกได้สูงสุด<input type="number" min="1" max="20" data-draft-field="group-max" data-gi="${gi}" value="${Number(g.max_select||1)}"></label>`:''}</div><div style="margin-top:8px"><b>รายการตัวเลือก</b>${(g.values||[]).map((v,vi)=>`<div class="seller-product-row"><div style="display:grid;grid-template-columns:minmax(150px,1fr) 120px;gap:8px;flex:1"><input data-draft-field="value-name" data-gi="${gi}" data-vi="${vi}" value="${esc(v.name||'')}" placeholder="เช่น 25% / ไข่ดาว"><input type="number" min="0" step="0.01" data-draft-field="value-price" data-gi="${gi}" data-vi="${vi}" value="${Number(v.price_delta||0)}" placeholder="+ ราคา"></div><button type="button" class="mo-danger" data-draft-remove-value="${gi}:${vi}">ลบ</button></div>`).join('')||'<div class="mo-muted">ยังไม่มีตัวเลือก</div>'}<div class="mo-actions"><button type="button" class="mo-secondary" data-draft-add-value="${gi}">+ เพิ่มตัวเลือก</button></div></div></section>`).join(''):'<div class="mo-muted">ไม่จำเป็นต้องมีตัวเลือก หากสินค้านี้สั่งแบบปกติได้เลย</div>';
  }
  function draftAddOptionGroup(){productOptionDraft.push({name:'',selection_type:'single',required:false,min_select:0,max_select:1,values:[]});renderProductOptionDraft();}
  function draftRemoveOptionGroup(gi){productOptionDraft.splice(gi,1);renderProductOptionDraft();}
  function draftAddOptionValue(gi){productOptionDraft[gi]?.values.push({name:'',price_delta:0});renderProductOptionDraft();}
  function draftRemoveOptionValue(gi,vi){productOptionDraft[gi]?.values.splice(vi,1);renderProductOptionDraft();}
  function draftFieldChanged(el){const gi=Number(el.dataset.gi),vi=el.dataset.vi===undefined?null:Number(el.dataset.vi),g=productOptionDraft[gi];if(!g)return;switch(el.dataset.draftField){case'group-name':g.name=el.value;break;case'group-type':g.selection_type=el.value;g.max_select=el.value==='single'?1:Math.max(1,Number(g.max_select||3));renderProductOptionDraft();break;case'group-required':g.required=el.checked;g.min_select=el.checked?1:0;break;case'group-max':g.max_select=Math.max(1,Math.min(20,Number(el.value)||1));break;case'value-name':if(g.values[vi])g.values[vi].name=el.value;break;case'value-price':if(g.values[vi])g.values[vi].price_delta=Math.max(0,Number(el.value)||0);break;}}
  async function loadProductOptionDraft(productId){productOptionDraft=[];if(!productId)return;const [{data:groups,error:ge},{data:vals,error:ve}]=await Promise.all([db.from('market_product_option_groups').select('*').eq('product_id',productId).order('sort_order').order('created_at'),db.from('market_product_option_values').select('*,group:market_product_option_groups!inner(product_id)').eq('group.product_id',productId).order('sort_order').order('created_at')]);if(ge||ve)throw ge||ve;productOptionDraft=(groups||[]).map(g=>({name:g.name,selection_type:g.selection_type||'single',required:!!g.required,min_select:Number(g.min_select||0),max_select:Number(g.max_select||1),values:(vals||[]).filter(v=>String(v.group_id)===String(g.id)).map(v=>({name:v.name,price_delta:Number(v.price_delta||0)}))}));}
  function validateProductOptionDraft(){for(const g of productOptionDraft){if(!String(g.name||'').trim())return'กรุณากรอกชื่อกลุ่มตัวเลือก';if(!(g.values||[]).length)return`กลุ่ม “${g.name}” ต้องมีตัวเลือกอย่างน้อย 1 รายการ`;for(const v of g.values)if(!String(v.name||'').trim())return`กรุณากรอกชื่อตัวเลือกในกลุ่ม “${g.name}”`;if(g.selection_type==='multiple'&&Number(g.max_select||1)<1)return`จำนวนสูงสุดของ “${g.name}” ไม่ถูกต้อง`;}return'';}
  async function syncProductOptions(productId){const {error:del}=await db.from('market_product_option_groups').delete().eq('product_id',productId);if(del)throw del;for(let gi=0;gi<productOptionDraft.length;gi++){const g=productOptionDraft[gi],{data:ng,error:ge}=await db.from('market_product_option_groups').insert({product_id:productId,name:String(g.name).trim().slice(0,100),selection_type:g.selection_type==='multiple'?'multiple':'single',required:!!g.required,min_select:g.required?1:0,max_select:g.selection_type==='multiple'?Math.max(1,Math.min(20,Number(g.max_select||1))):1,sort_order:gi,active:true}).select('id').single();if(ge)throw ge;const rows=(g.values||[]).map((v,vi)=>({group_id:ng.id,name:String(v.name).trim().slice(0,100),price_delta:Math.max(0,Number(v.price_delta||0)),sort_order:vi,active:true}));if(rows.length){const {error:ve}=await db.from('market_product_option_values').insert(rows);if(ve)throw ve;}}}

  async function openProductEditor(productId=null){const shopId=document.getElementById('sellerShopId')?.value;if(!shopId)return;let p={};if(productId){const {data}=await db.from('market_products').select('*').eq('id',productId).maybeSingle();p=data||{}}const {data:categories,error:catErr}=await db.from('market_product_categories').select('*').eq('shop_id',shopId).eq('active',true).order('sort_order').order('created_at');if(catErr)return alert(catErr.message);try{await loadProductOptionDraft(productId)}catch(err){return alert('โหลดตัวเลือกสินค้าไม่สำเร็จ: '+err.message)}const st=p.sale_status||(p.active===false?'sold_out':'available');openModal(`<input id="productShopId" type="hidden" value="${esc(shopId)}"><input id="productId" type="hidden" value="${esc(p.id||'')}"><h2 class="mo-title">${productId?'แก้ไขสินค้า':'เพิ่มสินค้า'}</h2><div class="mo-form two"><label>ชื่อสินค้า *<input id="productName" value="${esc(p.name||'')}"></label><label>ราคา (บาท) *<input id="productPrice" type="number" min="0" step="0.01" value="${esc(p.price??'')}"></label><label>หมวดหมู่<select id="productCategory"><option value="">อื่น ๆ / ยังไม่กำหนด</option>${(categories||[]).map(c=>`<option value="${esc(c.id)}" ${String(p.category_id||'')===String(c.id)?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label>สถานะสินค้า<select id="productSaleStatus"><option value="available" ${st==='available'?'selected':''}>🟢 เปิดขาย</option><option value="sold_out" ${st==='sold_out'?'selected':''}>🟠 หมดชั่วคราว</option><option value="discontinued" ${st==='discontinued'?'selected':''}>⚫ เลิกขาย / หมดถาวร</option></select></label><label>ลำดับ<input id="productSort" type="number" value="${Number(p.sort_order||0)}"></label><label class="full">รายละเอียด<textarea id="productDescription" rows="3">${esc(p.description||'')}</textarea></label><label class="full">รูปสินค้า (1 รูป / ระบบย่อเป็น WebP อัตโนมัติ)<input id="productImage" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><small class="mo-muted">“หมดชั่วคราว” ยังเห็นรายการในหลังร้านและเปิดกลับได้ทันที ส่วน “เลิกขาย” จะซ่อนจากลูกค้าแต่ไม่ลบประวัติ</small></label></div><section class="seller-section" style="margin-top:14px"><div class="order-card-head"><div><h3 style="margin:0">⚙️ ตัวเลือกสินค้า</h3><div class="mo-muted">ไม่บังคับ · เช่น ความหวาน ความเผ็ด เพิ่มไข่ หรือ Topping</div></div><button type="button" id="draftAddOptionGroup" class="mo-primary">+ เพิ่มกลุ่มตัวเลือก</button></div><div id="productOptionsDraft"></div></section><div class="mo-actions"><button id="saveProductBtn" class="mo-primary">บันทึกสินค้าและตัวเลือก</button></div>`);renderProductOptionDraft();
  }
  async function saveProduct(){
    const shopId=document.getElementById('productShopId').value,id=document.getElementById('productId').value,name=document.getElementById('productName').value.trim(),price=Number(document.getElementById('productPrice').value),description=document.getElementById('productDescription').value.trim(),category_id=document.getElementById('productCategory')?.value||null,sale_status=document.getElementById('productSaleStatus').value,active=sale_status==='available',sort=Number(document.getElementById('productSort').value||0),file=document.getElementById('productImage').files?.[0];
    if(!name||!Number.isFinite(price)||price<0)return alert('กรอกชื่อและราคาให้ถูกต้อง');if(!id){const {count,error:countErr}=await db.from('market_products').select('id',{count:'exact',head:true}).eq('shop_id',shopId);if(countErr)return alert(countErr.message);if(Number(count||0)>=100)return alert('ร้านนี้มีสินค้าครบ 100 รายการแล้ว ไม่สามารถเพิ่มสินค้าใหม่ได้');}const optionErr=validateProductOptionDraft();if(optionErr)return alert(optionErr);
    let image=null,imagePath=null,oldImagePath=null,newImagePath=null;
    if(id){const {data}=await db.from('market_products').select('image_url,image_path').eq('id',id).maybeSingle();image=data?.image_url||null;imagePath=data?.image_path||null;oldImagePath=imagePath;}
    if(file){try{const packed=await compressImage(file,{maxSide:1200,targetBytes:300*1024,quality:.82,minQuality:.58});newImagePath=`${session.user.id}/${shopId}/products/${Date.now()}-${uuid().slice(0,8)}.webp`;const {error:up}=await db.storage.from('shop-images').upload(newImagePath,packed,{contentType:'image/webp',upsert:false});if(up)throw up;image=db.storage.from('shop-images').getPublicUrl(newImagePath).data.publicUrl;imagePath=newImagePath;}catch(err){return alert('เตรียมหรืออัปโหลดรูปสินค้าไม่สำเร็จ: '+err.message)}}
    const payload={shop_id:shopId,name,price,description:description||null,category_id:category_id||null,active,sale_status,sort_order:sort,image_url:image,image_path:imagePath,updated_at:new Date().toISOString()};let productId=id;
    try{if(id){const {error}=await db.from('market_products').update(payload).eq('id',id);if(error)throw error;}else{const {data,error}=await db.from('market_products').insert(payload).select('id').single();if(error)throw error;productId=data.id;}await syncProductOptions(productId);}catch(error){if(newImagePath)await safeRemove('shop-images',newImagePath);return alert('บันทึกสินค้า/ตัวเลือกไม่สำเร็จ: '+error.message)}
    if(newImagePath&&oldImagePath&&oldImagePath!==newImagePath)await safeRemove('shop-images',oldImagePath);alert('บันทึกสินค้าและตัวเลือกแล้ว');await refreshProductShops();openSellerShop(shopId);
  }
  async function quickToggleProductStatus(productId,currentStatus){
    const next=currentStatus==='available'?'sold_out':'available';
    const label=next==='sold_out'?'หมดชั่วคราว':'เปิดขาย';
    const {data:p,error:readErr}=await db.from('market_products').select('id,shop_id,name,sale_status').eq('id',productId).maybeSingle();
    if(readErr||!p)return alert(readErr?.message||'ไม่พบสินค้า');
    if(p.sale_status==='discontinued')return alert('สินค้านี้อยู่สถานะเลิกขาย กรุณาเข้าแก้ไขสินค้าหากต้องการเปิดขายใหม่');
    const {error}=await db.from('market_products').update({
      sale_status:next,
      active:next==='available',
      updated_at:new Date().toISOString()
    }).eq('id',productId);
    if(error)return alert('เปลี่ยนสถานะสินค้าไม่สำเร็จ: '+error.message);
    await refreshProductShops();
    openSellerShop(p.shop_id);
  }

  async function deleteProduct(id){
    if(!confirm('ลบสินค้านี้ถาวรจริงหรือไม่?\n\nแนะนำให้ใช้สถานะ “เลิกขาย” แทน เพื่อเก็บข้อมูลสินค้าไว้ หากเป็นสินค้าที่เคยขายจริง'))return;
    const {data:p,error:readErr}=await db.from('market_products').select('shop_id,image_path').eq('id',id).maybeSingle();if(readErr||!p)return alert(readErr?.message||'ไม่พบสินค้า');const {error}=await db.from('market_products').delete().eq('id',id);if(error)return alert(error.message);if(p.image_path)await safeRemove('shop-images',p.image_path);await refreshProductShops();openSellerShop(p.shop_id);
  }
  async function sellerAcceptOrder(orderId){
    if(!confirm('รับออเดอร์นี้และเปิดให้ลูกค้าชำระเงิน?'))return;
    const {data,error}=await db.rpc('market_shop_accept_order',{p_order_id:orderId});if(error)return alert(error.message);sendOrderPush('shop_accepted',{order_id:orderId});alert('รับออเดอร์แล้ว ลูกค้าสามารถชำระเงินได้');openSellerShop(data?.shop_id||document.getElementById('sellerShopId')?.value);
  }
  async function sellerProposeRevision(orderId){
    const note=prompt('รายละเอียดที่ตกลง/ต้องการเสนอให้ลูกค้า\nเช่น หมูหมด เปลี่ยนเป็นไก่ / เพิ่มไข่ดาว 1 ฟอง');if(note===null)return;if(!note.trim())return alert('กรุณาระบุรายละเอียด');
    const current=prompt('ยอดรวมใหม่ที่ต้องการให้ลูกค้ายืนยัน (บาท)');if(current===null)return;const subtotal=Number(current);if(!Number.isFinite(subtotal)||subtotal<0)return alert('กรุณากรอกยอดใหม่ให้ถูกต้อง');
    const {data,error}=await db.rpc('market_shop_propose_order_revision',{p_order_id:orderId,p_revision_note:note.trim(),p_revision_subtotal:subtotal});if(error)return alert(error.message);sendOrderPush('revision_requested',{order_id:orderId});alert('ส่งรายการแก้ไขให้ลูกค้ายืนยันแล้ว');openSellerShop(data?.shop_id||document.getElementById('sellerShopId')?.value);
  }
  async function customerConfirmRevision(orderId){
    if(!confirm('ยืนยันรายการและยอดใหม่ที่ร้านเสนอ? หลังยืนยันจึงจะสามารถชำระเงินได้'))return;const {data,error}=await db.rpc('market_customer_confirm_order_revision',{p_order_id:orderId});if(error)return alert(error.message);sendOrderPush('revision_confirmed',{order_id:orderId});alert('ยืนยันรายการใหม่แล้ว สามารถชำระเงินได้');guideCustomerFromOrder(orderId,'ร้านปรับรายการเรียบร้อยแล้ว · ขั้นต่อไปชำระเงินร้านนี้');
  }
  async function customerCancelShopOrder(orderId){
    const reason=prompt('เหตุผลที่ต้องการยกเลิกร้านนี้ (ไม่บังคับ)','');if(reason===null)return;if(!confirm('ยืนยันยกเลิกเฉพาะออเดอร์ของร้านนี้? ร้านอื่นในชุดยังดำเนินการต่อ'))return;const {data,error}=await db.rpc('market_customer_cancel_order',{p_order_id:orderId,p_reason:reason||null});if(error)return alert(error.message);sendOrderPush('order_cancelled',{order_id:orderId});alert('ยกเลิกร้านนี้แล้ว');openAccountHub('customer');
  }
  async function sellerCompletePickup(orderId){
    if(!confirm('ยืนยันว่าลูกค้ารับสินค้าเรียบร้อยแล้ว?'))return;
    const {data,error}=await db.rpc('market_complete_pickup_order',{p_order_id:orderId});
    if(error)return alert(error.message);
    alert(data?.group_completed?'✅ ลูกค้ารับสินค้าครบทุกร้านแล้ว ชุดคำสั่งซื้อเสร็จสมบูรณ์':'✅ ปิดการรับสินค้าของร้านนี้แล้ว');
    openSellerShop(data?.shop_id||document.getElementById('sellerShopId')?.value);
  }
  async function sellerSetStatus(orderId,status){if(status==='awaiting_payment'&&!confirm('ยืนยันว่าร้านยังไม่พบยอดชำระ?'))return;const {data,error}=await db.rpc('market_shop_set_order_status',{p_order_id:orderId,p_status:status});if(error)return alert(error.message);if(status==='ready')sendOrderPush('order_ready',{order_id:orderId});else if(status==='preparing')sendOrderPush('payment_confirmed',{order_id:orderId});if(status==='preparing')sellerOrderTab='preparing';else if(status==='ready')sellerOrderTab='ready';else sellerOrderTab='action';sellerOrderPage=1;alert(status==='ready'?'แจ้งลูกค้าว่าสินค้าพร้อมแล้ว':'อัปเดตสถานะแล้ว');openSellerShop(data?.shop_id||data||document.getElementById('sellerShopId')?.value);}
  async function sellerRejectOrder(orderId){
    const reason=prompt('เหตุผลที่ปฏิเสธออเดอร์\nเช่น สินค้าหมด / ร้านใกล้ปิด / ทำไม่ทัน / อื่น ๆ');if(reason===null)return;if(!reason.trim())return alert('กรุณาระบุเหตุผล');
    if(!confirm('ยืนยันปฏิเสธออเดอร์นี้?\nหากลูกค้ายังไม่ชำระจะจบรายการทันที หากชำระแล้วระบบจะเข้าสู่ขั้นตอนคืนเงิน'))return;
    const {data,error}=await db.rpc('market_shop_reject_order',{p_order_id:orderId,p_reason:reason.trim()});if(error)return alert(error.message);sendOrderPush('order_cancelled',{order_id:orderId});alert(data?.refund_required?'ยกเลิกออเดอร์แล้ว ⚠️ มีหลักฐาน/สถานะชำระเงิน กรุณาคืนเงินลูกค้าโดยตรง':'ยกเลิกออเดอร์แล้ว');openSellerShop(data?.shop_id||document.getElementById('sellerShopId')?.value);
  }
  async function customerCancelOrder(orderId){
    const reason=prompt('เหตุผลที่ยกเลิกร้านนี้ (ไม่บังคับ)\nเช่น เปลี่ยนใจ / สั่งผิด / รอนาน');if(reason===null)return;
    if(!confirm('ยืนยันยกเลิกเฉพาะร้านนี้?\n\nทำได้เฉพาะก่อนแจ้งชำระเงิน ร้านอื่นในชุดคำสั่งซื้อจะยังดำเนินการต่อ'))return;
    const {error}=await db.rpc('market_customer_cancel_order',{p_order_id:orderId,p_reason:reason.trim()||null});if(error)return alert(error.message);alert('ยกเลิกร้านนี้แล้ว ร้านอื่นในชุดยังดำเนินการต่อ');openAccountHub('customer');
  }

  function refundDestinationLabel(o,masked=false){
    const val=String(o?.refund_destination_value||'');
    const shown=masked&&val.length>4?'••••'+val.slice(-4):val;
    if(o?.refund_destination_type==='promptpay'){
      const t=o.refund_destination_promptpay_type==='national_id'?'เลขบัตรประชาชน/เลขผู้เสียภาษี':'เบอร์โทรศัพท์';
      return `PromptPay (${t}) ${shown} · ${o.refund_destination_name||''}`.trim();
    }
    if(o?.refund_destination_type==='bank')return `${o.refund_destination_bank||'บัญชีธนาคาร'} ${shown} · ${o.refund_destination_name||''}`.trim();
    return 'ยังไม่ได้ระบุ';
  }
  async function openRefundDestination(orderId){
    const {data:o,error}=await db.from('market_orders').select('id,refund_required,refund_status,refund_destination_type,refund_destination_promptpay_type,refund_destination_value,refund_destination_bank,refund_destination_name').eq('id',orderId).eq('customer_id',session.user.id).maybeSingle();
    if(error||!o)return alert(error?.message||'ไม่พบออเดอร์');if(!o.refund_required)return alert('ออเดอร์นี้ไม่มีรายการคืนเงิน');if(['seller_submitted','completed'].includes(o.refund_status))return alert('ร้านดำเนินการคืนเงินแล้ว ไม่สามารถแก้ไขช่องทางได้');
    const type=o.refund_destination_type||'promptpay';
    openModal(`<input id="refundDestinationOrderId" type="hidden" value="${esc(orderId)}"><h2 class="mo-title">💸 ช่องทางรับเงินคืน</h2><div class="warning-banner">กรุณาตรวจข้อมูลให้ถูกต้อง ร้านจะโอนเงินคืนตามข้อมูลนี้</div><div class="mo-form"><label>รับเงินคืนผ่าน<select id="refundDestinationType"><option value="promptpay" ${type==='promptpay'?'selected':''}>PromptPay</option><option value="bank" ${type==='bank'?'selected':''}>โอนเข้าบัญชีธนาคาร</option></select></label><div id="refundDestinationFields"></div></div><div class="mo-actions"><button id="saveRefundDestinationBtn" class="mo-primary">ยืนยันช่องทางรับเงินคืน</button></div>`);
    window.__refundDestinationDraft=o;renderRefundDestinationFields();
  }
  function renderRefundDestinationFields(){
    const box=document.getElementById('refundDestinationFields');if(!box)return;const o=window.__refundDestinationDraft||{},type=document.getElementById('refundDestinationType')?.value||'promptpay';
    if(type==='promptpay')box.innerHTML=`<label>ประเภท PromptPay<select id="refundPromptpayType"><option value="phone" ${o.refund_destination_promptpay_type!=='national_id'?'selected':''}>เบอร์โทรศัพท์</option><option value="national_id" ${o.refund_destination_promptpay_type==='national_id'?'selected':''}>เลขบัตรประชาชน / เลขผู้เสียภาษี</option></select></label><label>หมายเลข PromptPay *<input id="refundDestinationValue" inputmode="numeric" value="${esc(o.refund_destination_type==='promptpay'?o.refund_destination_value||'':'')}" placeholder="กรอกเฉพาะตัวเลข"></label><label>ชื่อผู้รับเงิน *<input id="refundDestinationName" value="${esc(o.refund_destination_name||'')}" placeholder="ชื่อที่ผูกกับ PromptPay"></label>`;
    else box.innerHTML=`<label>ธนาคาร *<select id="refundDestinationBank"><option value="">เลือกธนาคาร</option>${['กสิกรไทย','กรุงเทพ','กรุงไทย','ไทยพาณิชย์','กรุงศรีอยุธยา','ทหารไทยธนชาต','ออมสิน','ธ.ก.ส.','เกียรตินาคินภัทร','ซีไอเอ็มบี ไทย','ยูโอบี','แลนด์ แอนด์ เฮ้าส์'].map(x=>`<option ${o.refund_destination_bank===x?'selected':''}>${x}</option>`).join('')}</select></label><label>เลขบัญชี *<input id="refundDestinationValue" inputmode="numeric" value="${esc(o.refund_destination_type==='bank'?o.refund_destination_value||'':'')}" placeholder="กรอกเลขบัญชี"></label><label>ชื่อบัญชี *<input id="refundDestinationName" value="${esc(o.refund_destination_name||'')}" placeholder="ชื่อเจ้าของบัญชี"></label>`;
  }
  async function saveRefundDestination(){
    const orderId=document.getElementById('refundDestinationOrderId')?.value,type=document.getElementById('refundDestinationType')?.value,value=String(document.getElementById('refundDestinationValue')?.value||'').replace(/\D/g,''),name=document.getElementById('refundDestinationName')?.value.trim();
    const ppType=type==='promptpay'?document.getElementById('refundPromptpayType')?.value:null,bank=type==='bank'?document.getElementById('refundDestinationBank')?.value:null;
    if(!value||!name)return alert('กรุณากรอกข้อมูลรับเงินคืนให้ครบ');if(type==='promptpay'&&ppType==='phone'&&value.length!==10)return alert('เบอร์ PromptPay ต้องมี 10 หลัก');if(type==='promptpay'&&ppType==='national_id'&&value.length!==13)return alert('เลขบัตรประชาชน/เลขผู้เสียภาษีต้องมี 13 หลัก');if(type==='bank'&&!bank)return alert('กรุณาเลือกธนาคาร');if(type==='bank'&&(value.length<9||value.length>15))return alert('กรุณาตรวจเลขบัญชีธนาคาร');
    const {error}=await db.rpc('market_customer_set_refund_destination',{p_order_id:orderId,p_type:type,p_promptpay_type:ppType,p_value:value,p_bank:bank,p_name:name});if(error)return alert(error.message);sendOrderPush('refund_destination',{order_id:orderId});alert('บันทึกช่องทางรับเงินคืนแล้ว');window.__refundDestinationDraft=null;openAccountHub('customer');
  }
  async function openRefundModal(orderId){
    const {data:o,error}=await db.from('market_orders').select('id,subtotal,refund_required,refund_status,refund_amount,refund_destination_type,refund_destination_promptpay_type,refund_destination_value,refund_destination_bank,refund_destination_name,refund_destination_submitted_at,group:market_delivery_groups(customer_name,customer_phone)').eq('id',orderId).maybeSingle();if(error||!o)return alert(error?.message||'ไม่พบออเดอร์');if(!o.refund_required)return alert('ออเดอร์นี้ไม่ต้องคืนเงิน');if((o.refund_status||'pending')==='completed')return alert('ลูกค้ายืนยันได้รับเงินคืนแล้ว');if(!o.refund_destination_submitted_at)return alert('ลูกค้ายังไม่ได้ระบุช่องทางรับเงินคืน กรุณารอก่อนโอน');
    openModal(`<input id="refundOrderId" type="hidden" value="${esc(orderId)}"><h2 class="mo-title">💸 แจ้งคืนเงินลูกค้า</h2><div class="warning-banner">ยอดที่ต้องคืน <b>${money(o.refund_amount||o.subtotal)} บาท</b><br>ผู้รับ: ${esc(o.group?.customer_name||'ลูกค้า')}<br><b>${esc(refundDestinationLabel(o,false))}</b><br><small>กรุณาตรวจชื่อและหมายเลขก่อนโอน</small></div><div class="mo-form"><label>เลขอ้างอิงการคืนเงิน (ถ้ามี)<input id="refundRef" placeholder="เช่น 483921"></label><label>แนบสลิปคืนเงิน *<input id="refundSlip" type="file" accept="image/*" required></label></div><div class="mo-actions"><button id="submitRefundBtn" class="mo-primary">ส่งหลักฐานคืนเงินให้ลูกค้า</button></div>`);
  }
  async function submitRefund(){
    if(!session)return requireLogin();const orderId=document.getElementById('refundOrderId')?.value,ref=document.getElementById('refundRef')?.value.trim(),file=document.getElementById('refundSlip')?.files?.[0];if(!orderId||!file)return alert('กรุณาแนบสลิปคืนเงิน');const btn=document.getElementById('submitRefundBtn');btn.disabled=true;btn.textContent='กำลังส่ง...';
    let oldPath=null,newPath=null;try{const {data:o,error:readErr}=await db.from('market_orders').select('refund_slip_path').eq('id',orderId).maybeSingle();if(readErr)throw readErr;oldPath=o?.refund_slip_path||null;const packed=await compressImage(file,{maxSide:1800,targetBytes:600*1024,quality:.86,minQuality:.68});newPath=`${orderId}/${session.user.id}/refund-${Date.now()}.webp`;const {error:up}=await db.storage.from('order-slips').upload(newPath,packed,{contentType:'image/webp',upsert:false});if(up)throw up;const {data,error}=await db.rpc('market_shop_submit_refund',{p_order_id:orderId,p_refund_ref:ref||null,p_refund_slip_path:newPath});if(error)throw error;if(oldPath&&oldPath!==newPath)await safeRemove('order-slips',oldPath);sendOrderPush('refund_submitted',{order_id:orderId});alert('แจ้งคืนเงินแล้ว รอลูกค้ายืนยันว่าได้รับเงิน');openSellerShop(data?.shop_id||document.getElementById('sellerShopId')?.value);}catch(err){if(newPath)await safeRemove('order-slips',newPath);btn.disabled=false;btn.textContent='ส่งหลักฐานคืนเงินให้ลูกค้า';alert('แจ้งคืนเงินไม่สำเร็จ: '+err.message)}
  }
  async function viewDeliveryProof(batchId){
    const {data:b,error}=await db.from('market_delivery_batches').select('proof_path,proof_deleted_at').eq('id',batchId).maybeSingle();
    if(error||!b)return alert(error?.message||'ไม่พบข้อมูลการส่งมอบ');
    if(b.proof_deleted_at||!b.proof_path)return alert('หลักฐานรูปถูกลบตามนโยบายแล้ว');
    const {data,error:se}=await db.storage.from('rider-delivery-proof').createSignedUrl(b.proof_path,120);
    if(se||!data?.signedUrl)return alert(se?.message||'เปิดหลักฐานไม่สำเร็จ');
    window.open(data.signedUrl,'_blank');
  }
  async function customerConfirmDelivery(batchId){
    if(!confirm('ยืนยันว่าคุณได้รับสินค้าครบและถูกต้องแล้ว? หลังยืนยันงานจัดส่งจะเสร็จสมบูรณ์'))return;
    const {data,error}=await db.rpc('market_customer_confirm_delivery',{p_batch_id:batchId});
    if(error)return alert(error.message);
    alert('✅ ยืนยันได้รับสินค้าแล้ว ขอบคุณครับ');guideCustomerToGroup(data?.group_id||'','จัดส่งเสร็จสมบูรณ์ · รายการถูกเก็บไว้ในประวัติ');
  }
  async function customerReportDeliveryIssue(batchId){
    const note=prompt('กรุณาระบุปัญหา\nเช่น ยังไม่ได้รับสินค้า / ส่งผิดบ้าน / สินค้าไม่ครบ');
    if(note===null)return;if(!note.trim())return alert('กรุณาระบุปัญหา');
    const {error}=await db.rpc('market_customer_report_delivery_issue',{p_batch_id:batchId,p_note:note.trim()});
    if(error)return alert(error.message);
    alert('รับแจ้งปัญหาแล้ว ระบบจะเก็บหลักฐานรูปไว้จนกว่าจะตรวจสอบเสร็จ');openAccountHub('customer');
  }
  async function customerConfirmRefund(orderId){
    if(!confirm('ยืนยันว่าคุณได้รับเงินคืนจากร้านครบแล้ว?'))return;const {data,error}=await db.rpc('market_customer_confirm_refund',{p_order_id:orderId});if(error)return alert(error.message);alert('ยืนยันได้รับเงินคืนแล้ว ขอบคุณครับ');openAccountHub('customer');
  }

  function haversine(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
  function routeKm(stops){let km=0;for(let i=1;i<stops.length;i++)km+=haversine(stops[i-1],stops[i]);return km}
  function fareFor(km,pickups){if(km>10)return null;const base=km<=2?25:25+Math.ceil((km-2)/2)*10,extra=Math.max(0,pickups-1)*EXTRA_PICKUP_FEE;return{base,extra,total:base+extra}}
  async function customerCancelProblemShop(orderId){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}
    const reason=prompt('เหตุผลที่ตัดร้านนี้ออก\\nเช่น ร้านแจ้งว่าสินค้าหมด / ร้านไม่สามารถทำออเดอร์ได้');
    if(reason===null)return;if(!reason.trim())return alert('กรุณาระบุเหตุผล');
    if(!confirm('ยกเลิกเฉพาะร้านนี้ใช่หรือไม่?\\n\\nร้านอื่นจะไม่ถูกยกเลิกและ Delivery ไปต่อได้'))return;
    const {data,error}=await db.rpc('market_customer_cancel_problem_shop',{p_order_id:orderId,p_reason:reason.trim()});
    if(error)return alert(error.message);
    alert(data?.refund_required?`ยกเลิกร้านนี้แล้ว\\nยอดที่ต้องคืน ${money(data.refund_amount||0)} บาท\\nร้านอื่นยังไปต่อได้`:'ยกเลิกร้านนี้แล้ว ร้านอื่นยังไปต่อได้');
    openAccountHub('customer');
  }
  async function createDelivery(groupId){
    try{await ensureCheckoutSession()}catch(err){return alert(err.message)}
    const {data:g,error}=await db.from('market_delivery_groups').select('*,orders:market_orders(id,status,shop:market_shops(id,name,latitude,longitude,phone,landmark,address)),batches:market_delivery_batches(id,status,batch_orders:market_delivery_batch_orders(order_id))').eq('id',groupId).eq('customer_id',session.user.id).maybeSingle();
    if(error||!g)return alert('ไม่พบชุดคำสั่งซื้อ');
    if(g.fulfillment_method==='pickup')return alert('ออเดอร์นี้เลือกรับเองที่ร้าน');
    const active=(g.orders||[]).filter(o=>o.status!=='cancelled');
    const batchedIds=new Set((g.batches||[]).filter(b=>b.status!=='cancelled').flatMap(b=>(b.batch_orders||[]).map(x=>String(x.order_id))));
    const unbatched=active.filter(o=>!batchedIds.has(String(o.id)));
    const ready=unbatched.filter(o=>o.status==='ready'),notReady=unbatched.filter(o=>o.status!=='ready');
    if(!ready.length)return alert('ยังไม่มีร้านที่พร้อมส่ง');
    const partial=notReady.length>0;
    if(partial&&!confirm(`ตอนนี้พร้อม ${ready.length} ร้าน และยังไม่พร้อม ${notReady.length} ร้าน\n\nต้องการเรียกวินรับเฉพาะร้านที่พร้อมก่อนหรือไม่?\nร้านที่เหลือสามารถเรียกวินรอบถัดไปได้ และอาจมีค่าส่งเพิ่ม`))return;
    if(!partial&&!confirm(`เรียกวินรับสินค้า ${ready.length} ร้านตอนนี้?`))return;

    const orderIds=ready.map(o=>o.id);
    const {data:batchId,error:batchErr}=await db.rpc('market_create_delivery_batch',{p_group_id:groupId,p_order_ids:orderIds});
    if(batchErr)return alert('สร้างรอบจัดส่งไม่สำเร็จ: '+batchErr.message);

    try{
      const pickups=[];
      for(const o of ready){
        const sh=o.shop,lat=Number(sh?.latitude),lng=Number(sh?.longitude);
        if(!Number.isFinite(lat)||!Number.isFinite(lng)||!lat||!lng)throw new Error(`ร้าน ${sh?.name||''} ยังไม่มีพิกัด`);
        pickups.push({type:'pickup',label:sh.name,lat,lng,note:sh.landmark||sh.address||'',shop_id:sh.id,contact_name:sh.name,contact_phone:sh.phone||''});
      }
      const drop={type:'dropoff',label:g.delivery_address||'จุดส่งลูกค้า',lat:Number(g.delivery_lat),lng:Number(g.delivery_lng),note:`ผู้รับ ${g.customer_name} โทร ${g.customer_phone}`,shop_id:null,contact_name:g.customer_name,contact_phone:g.customer_phone};
      const stops=[...pickups,drop],km=routeKm(stops),fare=fareFor(km,pickups.length);
      if(!fare)throw new Error('เส้นทางรวมเกิน 10 กม. ซึ่งเกินพื้นที่ทดสอบของระบบวิน');

      const payer='recipient';
      const payerLabel='ลูกค้าปลายทาง';
      if(!confirm(`ยืนยันเรียกวิน\n\nค่าจัดส่งประมาณ ${fare.total} บาท\nผู้ชำระค่าจัดส่ง: ${payerLabel}\n\nยืนยันเรียกวินสำหรับ ${ready.length} ร้านหรือไม่?`)){
        await db.rpc('market_cancel_delivery_batch_creation',{p_batch_id:batchId});
        return;
      }
      const {data:jobId,error:jobErr}=await db.rpc('rider_create_multistop_job',{p_stops:stops,p_job_note:`MARKET_BATCH:${batchId} | ชุดคำสั่งซื้อ ${String(groupId).slice(0,8).toUpperCase()}`,p_payer:payer,p_distance_km:+km.toFixed(3),p_fare_estimate:fare.total,p_extra_stop_fee:fare.extra});
      if(jobErr)throw jobErr;
      const {error:attachErr}=await db.rpc('market_attach_delivery_batch',{p_batch_id:batchId,p_rider_job_id:jobId,p_delivery_fee:fare.total,p_distance_km:+km.toFixed(3)});
      if(attachErr)throw attachErr;
      alert(`เรียกวินแล้วสำหรับ ${ready.length} ร้าน\nค่าส่งประมาณ ${fare.total} บาท${partial?`\nยังเหลือ ${notReady.length} ร้านรอพร้อม`:''}`);
      guideCustomerToGroup(groupId,partial?`เรียกวินสำหรับ ${ready.length} ร้านแล้ว · ติดตามวินได้ที่นี่ และยังเหลือ ${notReady.length} ร้านรอพร้อม`:'เรียกวินแล้ว · ติดตามสถานะวินและการจัดส่งได้ที่นี่');
    }catch(err){
      try{await db.rpc('market_cancel_delivery_batch_creation',{p_batch_id:batchId})}catch(_e){}
      alert('เรียกวินไม่สำเร็จ: '+(err?.message||err));
    }
  }
  init();

  document.addEventListener('change',e=>{if(e.target?.matches('input[name="fulfillmentMethod"]'))updateFulfillmentUI();if(e.target?.id==='pickupTimeChoice')updatePickupCustomUI();});
})();
