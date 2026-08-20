(() => {
  'use strict';
  const cfg=window.APP_CONFIG||{};
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY||!window.supabase){console.warn('Order module: Supabase not configured');return;}
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const CART_KEY='talad_multishop_cart_v1';
  const MAX_PICKUPS=5, EXTRA_PICKUP_FEE=10;
  let session=null, productShopIds=new Set();
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2});
  const uuid=()=>crypto.randomUUID?.()||('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)}));
  const getCart=()=>{try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]')}catch(_){return[]}};
  const saveCart=c=>{localStorage.setItem(CART_KEY,JSON.stringify(c));updateCartBadge();};
  const statusText=s=>({awaiting_payment:'รอชำระเงิน',payment_review:'ร้านกำลังตรวจสอบเงิน',preparing:'กำลังเตรียมสินค้า',ready:'พร้อมรับสินค้า',cancelled:'ยกเลิกแล้ว'})[s]||s;

  async function init(){
    const {data}=await db.auth.getSession();session=data.session;
    db.auth.onAuthStateChange((_e,s)=>{session=s;renderNavState();});
    injectUI();wire();renderNavState();updateCartBadge();await refreshProductShops();decorateShopCards();
    new MutationObserver(()=>decorateShopCards()).observe(document.body,{childList:true,subtree:true});
  }

  function injectUI(){
    if(!document.querySelector('link[href*="order.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='order.css?v=0.2';document.head.appendChild(css);}
    const nav=document.querySelector('.nav-actions');
    if(nav&&!document.getElementById('marketOrdersBtn')){
      const b=document.createElement('button');b.id='marketOrdersBtn';b.className='ghost market-order-nav';b.textContent='🛍️ ออเดอร์';nav.insertBefore(b,document.getElementById('accountBtn')||null);
    }
    const f=document.createElement('button');f.id='marketCartBtn';f.className='order-floating-cart';f.innerHTML='🛒 ตะกร้า <span class="count">0</span>';document.body.appendChild(f);
    const modal=document.createElement('div');modal.id='marketOrderModal';modal.className='market-order-modal hidden';modal.innerHTML='<div class="mo-backdrop" data-mo-close></div><div class="market-order-panel"><button class="mo-close" data-mo-close>×</button><div id="marketOrderBody"></div></div>';document.body.appendChild(modal);
  }
  function wire(){
    document.getElementById('marketCartBtn')?.addEventListener('click',renderCart);
    document.getElementById('marketOrdersBtn')?.addEventListener('click',()=>session?openAccountHub():requireLogin());
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-mo-close]'))return closeModal();
      const orderBtn=e.target.closest('[data-market-order-shop]');if(orderBtn){e.preventDefault();return openShopMenu(orderBtn.dataset.marketOrderShop);}
      const add=e.target.closest('[data-add-product]');if(add)return addProduct(add.dataset.addProduct);
      const qty=e.target.closest('[data-cart-qty]');if(qty)return changeQty(qty.dataset.cartQty,Number(qty.dataset.delta));
      const rm=e.target.closest('[data-cart-remove]');if(rm)return removeLine(rm.dataset.cartRemove);
      if(e.target.closest('#goCheckoutBtn'))return openCheckout();
      if(e.target.closest('#useDeliveryLocationBtn'))return captureDeliveryLocation();
      if(e.target.closest('#submitCheckoutBtn'))return submitCheckout();
      const pay=e.target.closest('[data-pay-order]');if(pay)return openPayment(pay.dataset.payOrder);
      if(e.target.closest('#submitPaymentBtn'))return submitPayment();
      const seller=e.target.closest('[data-seller-shop]');if(seller)return openSellerShop(seller.dataset.sellerShop);
      if(e.target.closest('#saveOrderSettingsBtn'))return saveOrderSettings();
      if(e.target.closest('#addProductBtn'))return openProductEditor();
      const editp=e.target.closest('[data-edit-product]');if(editp)return openProductEditor(editp.dataset.editProduct);
      const delp=e.target.closest('[data-delete-product]');if(delp)return deleteProduct(delp.dataset.deleteProduct);
      if(e.target.closest('#saveProductBtn'))return saveProduct();
      const setst=e.target.closest('[data-order-status]');if(setst)return sellerSetStatus(setst.dataset.orderId,setst.dataset.orderStatus);
      const ship=e.target.closest('[data-create-delivery]');if(ship)return createDelivery(ship.dataset.createDelivery);
      const hubtab=e.target.closest('[data-hub-tab]');if(hubtab)return document.getElementById('hubContent')?renderHubTab(hubtab.dataset.hubTab):openAccountHub(hubtab.dataset.hubTab);
    });
  }
  function openModal(html,wide=false){const m=document.getElementById('marketOrderModal');m.querySelector('.market-order-panel').classList.toggle('wide',wide);document.getElementById('marketOrderBody').innerHTML=html;m.classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeModal(){document.getElementById('marketOrderModal')?.classList.add('hidden');document.body.style.overflow='';}
  function requireLogin(){alert('กรุณาเข้าสู่ระบบก่อนทำรายการ');document.getElementById('accountBtn')?.click();}
  function renderNavState(){const b=document.getElementById('marketOrdersBtn');if(b)b.title=session?'ดูออเดอร์และจัดการร้าน':'เข้าสู่ระบบเพื่อดูออเดอร์';}
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
    const {data,error}=await db.from('market_products').select('shop_id').eq('active',true).limit(5000);
    if(error){console.debug('Order SQL not installed yet:',error.message);productShopIds=new Set();return;}
    productShopIds=new Set((data||[]).map(x=>String(x.shop_id)));
  }
  function decorateShopCards(){
    document.querySelectorAll('.card[data-id]').forEach(card=>{
      const id=String(card.dataset.id||''); if(!productShopIds.has(id)||card.querySelector('[data-market-order-shop]'))return;
      const actions=card.querySelector('.community-actions')||card.querySelector('.card-body');if(!actions)return;
      const b=document.createElement('button');b.className='market-order-btn';b.dataset.marketOrderShop=id;b.textContent='🛒 สั่งผ่านตลาด';actions.appendChild(b);
    });
    const detail=document.getElementById('detailSummary');
    if(detail&&!detail.querySelector('[data-market-order-shop]')){
      const id=document.getElementById('reviewShopId')?.value;if(id&&productShopIds.has(String(id))){const b=document.createElement('button');b.className='market-order-btn';b.dataset.marketOrderShop=id;b.textContent='🛒 ดูสินค้า / สั่งผ่านตลาด';detail.prepend(b);}
    }
  }

  async function openShopMenu(shopId){
    const [{data:shop},{data:products,error}]=await Promise.all([
      db.from('market_shops').select('id,name,cover_url').eq('id',shopId).maybeSingle(),
      db.from('market_products').select('*').eq('shop_id',shopId).eq('active',true).order('sort_order').order('created_at')
    ]);
    if(error)return alert('โหลดสินค้าไม่สำเร็จ: '+error.message);
    openModal(`<h2 class="mo-title">${esc(shop?.name||'ร้านค้า')}</h2><div class="mo-muted">เลือกสินค้าใส่ตะกร้าได้ และสามารถสั่งจากหลายร้านพร้อมกัน</div><div class="product-grid">${(products||[]).map(p=>`<article class="product-card">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:'<div style="aspect-ratio:4/3;background:#f3f3f3;display:grid;place-items:center;font-size:42px">🛍️</div>'}<div class="body"><h4>${esc(p.name)}</h4><p>${esc(p.description||'')}</p><div class="price">${money(p.price)} บาท</div><button data-add-product="${esc(p.id)}">+ ใส่ตะกร้า</button></div></article>`).join('')||'<p>ร้านนี้ยังไม่มีสินค้าที่เปิดขาย</p>'}</div>`,true);
  }
  async function addProduct(productId){
    const {data:p,error}=await db.from('market_products').select('id,shop_id,name,price,image_url,shop:market_shops(name)').eq('id',productId).eq('active',true).maybeSingle();
    if(error||!p)return alert('สินค้านี้ไม่พร้อมขายแล้ว');
    let c=getCart();const found=c.find(x=>x.product_id===p.id);if(found)found.qty+=1;else c.push({line_id:uuid(),product_id:p.id,shop_id:p.shop_id,shop_name:p.shop?.name||'ร้านค้า',name:p.name,price:Number(p.price),image_url:p.image_url||'',qty:1});saveCart(c);alert('เพิ่มลงตะกร้าแล้ว');
  }
  function groupedCart(){const g={};for(const x of getCart()){(g[x.shop_id]??={shop_id:x.shop_id,shop_name:x.shop_name,items:[]}).items.push(x)}return Object.values(g)}
  function renderCart(){const groups=groupedCart(),total=getCart().reduce((s,x)=>s+x.price*x.qty,0);openModal(`<h2 class="mo-title">🛒 ตะกร้าของฉัน</h2><div class="mo-muted">ตะกร้าเดียว สั่งได้หลายร้าน ระบบจะแยกยอดเงินให้แต่ละร้านอัตโนมัติ</div>${groups.map(g=>`<section class="cart-shop"><div class="cart-shop-head">🏪 ${esc(g.shop_name)}</div>${g.items.map(x=>`<div class="cart-line"><div><b>${esc(x.name)}</b><small>${money(x.price)} บาท × ${x.qty} = ${money(x.price*x.qty)} บาท</small></div><div class="qty-control"><button data-cart-qty="${x.line_id}" data-delta="-1">−</button><b>${x.qty}</b><button data-cart-qty="${x.line_id}" data-delta="1">+</button><button data-cart-remove="${x.line_id}" title="ลบ">🗑️</button></div></div>`).join('')}</section>`).join('')||'<p>ยังไม่มีสินค้าในตะกร้า</p>'}<div class="cart-total"><span>รวมค่าสินค้า</span><span>${money(total)} บาท</span></div>${groups.length?`<button id="goCheckoutBtn" class="mo-primary" style="width:100%">ดำเนินการสั่งซื้อ</button>`:''}`);}
  function changeQty(lineId,d){let c=getCart();const x=c.find(i=>i.line_id===lineId);if(!x)return;x.qty=Math.max(1,x.qty+d);saveCart(c);renderCart();}
  function removeLine(lineId){saveCart(getCart().filter(x=>x.line_id!==lineId));renderCart();}

  async function openCheckout(){
    if(!session)return requireLogin();const groups=groupedCart();if(!groups.length)return renderCart();if(groups.length>MAX_PICKUPS)return alert(`ระบบวินรองรับสูงสุด ${MAX_PICKUPS} ร้านต่อหนึ่งเที่ยว กรุณาแบ่งสั่งเป็น 2 รอบ`);
    const ids=groups.map(g=>g.shop_id);const {data:settings,error}=await db.from('market_shop_order_settings').select('*').in('shop_id',ids);
    if(error)return alert('ยังไม่ได้ติดตั้งระบบสั่งซื้อใน Supabase หรือโหลดข้อมูลการชำระเงินไม่สำเร็จ');
    const by=Object.fromEntries((settings||[]).map(s=>[s.shop_id,s]));const unavailable=groups.filter(g=>!by[g.shop_id]?.enabled||!by[g.shop_id]?.payment_qr_url);
    if(unavailable.length)return alert('ร้านต่อไปนี้ยังไม่ได้เปิดรับออเดอร์/ตั้ง QR ชำระเงิน: '+unavailable.map(x=>x.shop_name).join(', '));
    const total=getCart().reduce((s,x)=>s+x.price*x.qty,0);
    openModal(`<h2 class="mo-title">ยืนยันคำสั่งซื้อ</h2><div class="checkout-summary">${groups.map(g=>`<div style="display:flex;justify-content:space-between;gap:10px;margin:5px 0"><span>${esc(g.shop_name)}</span><b>${money(g.items.reduce((s,x)=>s+x.price*x.qty,0))} บาท</b></div>`).join('')}<hr><div style="display:flex;justify-content:space-between"><b>รวมค่าสินค้า</b><b>${money(total)} บาท</b></div></div><div class="warning-banner">หลังสร้างออเดอร์ ระบบจะแสดง QR ของแต่ละร้านให้ชำระแยกกัน ส่วนค่าจัดส่งชำระให้วินเมื่อได้รับสินค้า</div><div class="mo-form two"><label>ชื่อผู้รับ *<input id="coName" required></label><label>เบอร์โทร *<input id="coPhone" inputmode="tel" required></label><label class="full">ที่อยู่/จุดส่ง *<textarea id="coAddress" rows="3" required></textarea></label><label>ละติจูด *<input id="coLat" inputmode="decimal" required></label><label>ลองจิจูด *<input id="coLng" inputmode="decimal" required></label></div><div class="mo-actions"><button id="useDeliveryLocationBtn" class="mo-secondary">📍 ใช้ตำแหน่งปัจจุบัน</button><button id="submitCheckoutBtn" class="mo-primary">สร้างออเดอร์</button></div>`);
  }
  function captureDeliveryLocation(){if(!navigator.geolocation)return alert('อุปกรณ์นี้ไม่รองรับตำแหน่ง');navigator.geolocation.getCurrentPosition(p=>{document.getElementById('coLat').value=p.coords.latitude.toFixed(7);document.getElementById('coLng').value=p.coords.longitude.toFixed(7);},e=>alert('ระบุตำแหน่งไม่สำเร็จ: '+e.message),{enableHighAccuracy:true,timeout:12000});}
  async function submitCheckout(){
    if(!session)return requireLogin();const name=document.getElementById('coName')?.value.trim(),phone=document.getElementById('coPhone')?.value.trim(),address=document.getElementById('coAddress')?.value.trim(),lat=Number(document.getElementById('coLat')?.value),lng=Number(document.getElementById('coLng')?.value);if(!name||!phone||!address||!Number.isFinite(lat)||!Number.isFinite(lng))return alert('กรอกชื่อ เบอร์โทร ที่อยู่ และพิกัดจุดส่งให้ครบ');
    const groups=groupedCart();const payload=groups.map(g=>({shop_id:g.shop_id,items:g.items.map(x=>({product_id:x.product_id,qty:x.qty}))}));
    const btn=document.getElementById('submitCheckoutBtn');if(btn){btn.disabled=true;btn.textContent='กำลังสร้างออเดอร์...'}
    const {data,error}=await db.rpc('market_create_checkout',{p_customer_name:name,p_customer_phone:phone,p_delivery_address:address,p_delivery_lat:lat,p_delivery_lng:lng,p_orders:payload});
    if(error){if(btn){btn.disabled=false;btn.textContent='สร้างออเดอร์'}return alert('สร้างออเดอร์ไม่สำเร็จ: '+error.message)}
    saveCart([]);await showCheckoutResult(data?.group_id||data);
  }
  async function showCheckoutResult(groupId){
    const {data:orders,error}=await db.from('market_orders').select('id,shop_id,subtotal,status,payment_qr_url,payment_name,payment_note,shop:market_shops(name)').eq('group_id',groupId).order('created_at');
    if(error)return alert(error.message);
    openModal(`<h2 class="mo-title">สร้างคำสั่งซื้อแล้ว ✅</h2><div class="warning-banner">ชำระค่าสินค้าแยกตามร้านด้านล่าง หลังโอนแล้วกด “แจ้งชำระเงิน” ร้านจะตรวจสอบและเริ่มเตรียมสินค้า</div>${(orders||[]).map(o=>`<div class="payment-card"><b>🏪 ${esc(o.shop?.name||'ร้านค้า')}</b><div class="payment-amount">${money(o.subtotal)} บาท</div>${o.payment_qr_url?`<img src="${esc(o.payment_qr_url)}" alt="QR ชำระเงิน">`:''}<div>${esc(o.payment_name||'')}</div><small>${esc(o.payment_note||'')}</small><div class="mo-actions"><button class="mo-primary" data-pay-order="${o.id}">แจ้งชำระเงิน</button></div></div>`).join('')}<div class="mo-actions"><button class="mo-secondary" data-hub-tab="customer">ดูสถานะออเดอร์</button></div>`,true);
  }

  async function openPayment(orderId){
    if(!session)return requireLogin();const {data:o,error}=await db.from('market_orders').select('id,subtotal,status,payment_qr_url,payment_name,payment_note,shop:market_shops(name)').eq('id',orderId).maybeSingle();if(error||!o)return alert('ไม่พบออเดอร์');
    openModal(`<h2 class="mo-title">แจ้งชำระเงิน</h2><div class="payment-card"><b>${esc(o.shop?.name||'ร้านค้า')}</b><div class="payment-amount">${money(o.subtotal)} บาท</div>${o.payment_qr_url?`<img src="${esc(o.payment_qr_url)}">`:''}<div>${esc(o.payment_name||'')}</div></div><input id="paymentOrderId" type="hidden" value="${esc(orderId)}"><div class="mo-form"><label>เลขอ้างอิง/4–6 หลักท้าย (ถ้ามี)<input id="paymentRef" placeholder="เช่น 483921"></label><label>แนบสลิป<input id="paymentSlip" type="file" accept="image/*"></label></div><div class="mo-actions"><button id="submitPaymentBtn" class="mo-primary">ส่งหลักฐานให้ร้านตรวจสอบ</button></div>`);
  }
  async function submitPayment(){
    if(!session)return requireLogin();const orderId=document.getElementById('paymentOrderId').value,ref=document.getElementById('paymentRef').value.trim(),file=document.getElementById('paymentSlip').files?.[0];let path=null;
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
    const {error}=await db.rpc('market_submit_payment',{p_order_id:orderId,p_payment_ref:ref||null,p_slip_path:path});btn.disabled=false;btn.textContent='ส่งหลักฐานให้ร้านตรวจสอบ';if(error){if(path)await safeRemove('order-slips',path);return alert(error.message)}if(path&&oldSlipPath&&oldSlipPath!==path)await safeRemove('order-slips',oldSlipPath);alert('แจ้งชำระเงินแล้ว ร้านค้าจะตรวจสอบยอด');openAccountHub('customer');
  }

  async function openAccountHub(tab='customer'){
    if(!session)return requireLogin();
    openModal(`<h2 class="mo-title">🛍️ ออเดอร์และร้านของฉัน</h2><div class="seller-tabs"><button data-hub-tab="customer" class="${tab==='customer'?'active':''}">ออเดอร์ที่ฉันสั่ง</button><button data-hub-tab="seller" class="${tab==='seller'?'active':''}">ร้าน / ออเดอร์ที่ได้รับ</button></div><div id="hubContent">กำลังโหลด...</div>`,true);await renderHubTab(tab);
  }
  async function renderHubTab(tab){document.querySelectorAll('[data-hub-tab]').forEach(b=>b.classList.toggle('active',b.dataset.hubTab===tab));const box=document.getElementById('hubContent');if(!box)return;if(tab==='seller')return renderSellerHub(box);return renderCustomerHub(box);}
  async function renderCustomerHub(box){
    box.innerHTML='กำลังโหลด...';const {data:groups,error}=await db.from('market_delivery_groups').select('*,orders:market_orders(id,shop_id,subtotal,status,payment_ref,created_at,shop:market_shops(name,latitude,longitude,phone,landmark,address),items:market_order_items(product_name,unit_price,qty))').eq('customer_id',session.user.id).order('created_at',{ascending:false}).limit(30);if(error){box.innerHTML=`<div class="warning-banner">${esc(error.message)}</div>`;return}
    box.innerHTML=(groups||[]).map(g=>{const os=g.orders||[],activeOrders=os.filter(o=>o.status!=='cancelled'),allReady=activeOrders.length&&activeOrders.every(o=>o.status==='ready'),canDelivery=allReady&&!g.rider_job_id&&!['cancelled','completed'].includes(g.status);return `<article class="order-card"><div class="order-card-head"><div><b>ชุดคำสั่งซื้อ #${esc(String(g.id).slice(0,8).toUpperCase())}</b><div class="mo-muted">${new Date(g.created_at).toLocaleString('th-TH')}</div></div><span class="status-pill">${esc(g.status||'กำลังดำเนินการ')}</span></div>${os.map(o=>`<div class="payment-card"><div class="order-card-head"><b>🏪 ${esc(o.shop?.name||'ร้าน')}</b><span class="status-pill status-${esc(o.status)}">${esc(statusText(o.status))}</span></div><div class="order-items">${(o.items||[]).map(i=>`${esc(i.product_name)} × ${i.qty} = ${money(Number(i.unit_price)*i.qty)} บาท`).join('<br>')}</div><b>${money(o.subtotal)} บาท</b>${o.status==='awaiting_payment'?`<div class="mo-actions"><button class="mo-primary" data-pay-order="${o.id}">ชำระ/แจ้งชำระเงิน</button></div>`:''}</div>`).join('')}${allReady?'<div class="ready-banner">✅ ทุกร้านพร้อมแล้ว สามารถเรียกวินให้ไปรับรวมเที่ยวเดียวได้</div>':''}${canDelivery?`<button class="mo-primary" data-create-delivery="${g.id}">🛵 เรียกวินรับของทุกร้าน</button>`:g.rider_job_id?`<div class="delivery-cost-box">🛵 สร้างงานวินแล้ว #${esc(String(g.rider_job_id).slice(0,8).toUpperCase())}</div>`:''}</article>`}).join('')||'<p>ยังไม่มีออเดอร์</p>';
  }
  async function renderSellerHub(box){
    box.innerHTML='กำลังโหลด...';const {data:shops,error}=await db.from('market_shops').select('id,name,status').eq('owner_id',session.user.id).order('created_at',{ascending:false});if(error){box.innerHTML=esc(error.message);return}box.innerHTML=`<div class="mo-muted">เลือกแท็บร้านเพื่อจัดสินค้า QR รับเงิน และดูออเดอร์ที่ลูกค้าสั่งเข้ามา</div>${(shops||[]).map(s=>`<button class="seller-shop-card" style="display:block;width:100%;text-align:left;background:#fff;cursor:pointer" data-seller-shop="${s.id}"><b>🏪 ${esc(s.name)}</b><div class="mo-muted">สถานะร้าน: ${esc(s.status)}</div></button>`).join('')||'<p>บัญชีนี้ยังไม่มีร้าน</p>'}`;
  }

  async function openSellerShop(shopId){
    const [{data:shop},{data:setting},{data:products},{data:orders,error}]=await Promise.all([
      db.from('market_shops').select('id,name,owner_id').eq('id',shopId).maybeSingle(),db.from('market_shop_order_settings').select('*').eq('shop_id',shopId).maybeSingle(),db.from('market_products').select('*').eq('shop_id',shopId).order('sort_order').order('created_at'),db.from('market_orders').select('id,subtotal,status,payment_ref,payment_slip_path,created_at,customer_id,group:market_delivery_groups(customer_name,customer_phone,delivery_address),items:market_order_items(product_name,unit_price,qty)').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(50)
    ]);if(error)return alert(error.message);
    openModal(`<input id="sellerShopId" type="hidden" value="${esc(shopId)}"><h2 class="mo-title">🏪 ${esc(shop?.name||'ร้าน')}</h2><section class="seller-section"><h3>รับออเดอร์และการชำระเงิน</h3><div class="mo-form two"><label class="full"><input id="orderEnabled" type="checkbox" ${setting?.enabled?'checked':''}> เปิดรับออเดอร์ผ่านตลาด</label><label>ชื่อบัญชี/ชื่อรับเงิน<input id="paymentName" value="${esc(setting?.payment_name||'')}"></label><label>หมายเหตุการชำระเงิน<input id="paymentNote" value="${esc(setting?.payment_note||'')}"></label><label class="full">อัปโหลดรูป QR PromptPay<input id="paymentQrFile" type="file" accept="image/*"></label>${setting?.payment_qr_url?`<div class="full"><img src="${esc(setting.payment_qr_url)}" style="max-width:180px;border:1px solid #ddd;border-radius:12px"></div>`:''}</div><div class="mo-actions"><button id="saveOrderSettingsBtn" class="mo-primary">บันทึกการตั้งค่า</button></div></section><section class="seller-section"><div class="order-card-head"><h3>สินค้า</h3><button id="addProductBtn" class="mo-primary">+ เพิ่มสินค้า</button></div>${(products||[]).map(p=>`<div class="seller-product-row"><div><b>${esc(p.name)}</b> · ${money(p.price)} บาท <span class="status-pill">${p.active?'เปิดขาย':'ปิด'}</span></div><div><button class="mo-secondary" data-edit-product="${p.id}">แก้ไข</button> <button class="mo-danger" data-delete-product="${p.id}">ลบ</button></div></div>`).join('')||'<p>ยังไม่มีสินค้า</p>'}</section><section class="seller-section"><h3>ออเดอร์ที่ได้รับ</h3>${(orders||[]).map(o=>sellerOrderCard(o)).join('')||'<p>ยังไม่มีออเดอร์</p>'}</section>`,true);
  }
  function sellerOrderCard(o){return `<article class="order-card"><div class="order-card-head"><div><b>Order #${esc(String(o.id).slice(0,8).toUpperCase())}</b><div class="mo-muted">${esc(o.group?.customer_name||'ลูกค้า')} · ${esc(o.group?.customer_phone||'')}<br>${esc(o.group?.delivery_address||'')}</div></div><span class="status-pill status-${esc(o.status)}">${esc(statusText(o.status))}</span></div><div class="order-items">${(o.items||[]).map(i=>`${esc(i.product_name)} × ${i.qty}`).join('<br>')}</div><b>ยอด ${money(o.subtotal)} บาท</b>${o.payment_ref?`<div>อ้างอิง: ${esc(o.payment_ref)}</div>`:''}<div class="mo-actions">${o.payment_slip_path?`<button class="mo-secondary" onclick="window.marketOrderOpenSlip('${esc(o.payment_slip_path)}')">ดูสลิป</button>`:''}${o.status==='payment_review'?`<button class="mo-primary" data-order-id="${o.id}" data-order-status="preparing">✅ เงินเข้าแล้ว / เริ่มเตรียม</button><button class="mo-danger" data-order-id="${o.id}" data-order-status="awaiting_payment">ยังไม่พบยอด</button>`:''}${o.status==='preparing'?`<button class="mo-primary" data-order-id="${o.id}" data-order-status="ready">📦 สินค้าพร้อมรับ</button>`:''}</div></article>`}
  window.marketOrderOpenSlip=async path=>{const {data,error}=await db.storage.from('order-slips').createSignedUrl(path,120);if(error)return alert(error.message);window.open(data.signedUrl,'_blank')};
  async function saveOrderSettings(){
    const shopId=document.getElementById('sellerShopId').value,enabled=document.getElementById('orderEnabled').checked,name=document.getElementById('paymentName').value.trim(),note=document.getElementById('paymentNote').value.trim(),file=document.getElementById('paymentQrFile').files?.[0];let qr=null;
    const {data:old}=await db.from('market_shop_order_settings').select('payment_qr_url,payment_qr_path').eq('shop_id',shopId).maybeSingle();qr=old?.payment_qr_url||null;let qrPath=old?.payment_qr_path||null,newQrPath=null;
    if(file){try{const packed=await compressImage(file,{maxSide:1400,targetBytes:450*1024,quality:.95,minQuality:.82});newQrPath=`${session.user.id}/${shopId}/payment-qr-${Date.now()}.webp`;const {error:up}=await db.storage.from('shop-images').upload(newQrPath,packed,{contentType:'image/webp'});if(up)throw up;qr=db.storage.from('shop-images').getPublicUrl(newQrPath).data.publicUrl;qrPath=newQrPath;}catch(err){return alert('อัปโหลด QR ไม่สำเร็จ: '+err.message)}}
    if(enabled&&!qr)return alert('เปิดรับออเดอร์ได้เมื่ออัปโหลด QR รับเงินแล้ว');const {error}=await db.from('market_shop_order_settings').upsert({shop_id:shopId,enabled,payment_qr_url:qr,payment_qr_path:qrPath,payment_name:name||null,payment_note:note||null,updated_at:new Date().toISOString()});if(error){if(newQrPath)await safeRemove('shop-images',newQrPath);return alert(error.message)}if(newQrPath&&old?.payment_qr_path&&old.payment_qr_path!==newQrPath)await safeRemove('shop-images',old.payment_qr_path);alert('บันทึกแล้ว');await refreshProductShops();openSellerShop(shopId);
  }
  async function openProductEditor(productId=null){const shopId=document.getElementById('sellerShopId')?.value;if(!shopId)return;let p={};if(productId){const {data}=await db.from('market_products').select('*').eq('id',productId).maybeSingle();p=data||{}}openModal(`<input id="productShopId" type="hidden" value="${esc(shopId)}"><input id="productId" type="hidden" value="${esc(p.id||'')}"><h2 class="mo-title">${productId?'แก้ไขสินค้า':'เพิ่มสินค้า'}</h2><div class="mo-form two"><label>ชื่อสินค้า *<input id="productName" value="${esc(p.name||'')}"></label><label>ราคา (บาท) *<input id="productPrice" type="number" min="0" step="0.01" value="${esc(p.price??'')}"></label><label class="full">รายละเอียด<textarea id="productDescription" rows="3">${esc(p.description||'')}</textarea></label><label class="full">รูปสินค้า (1 รูป / ระบบย่อเป็น WebP อัตโนมัติ)<input id="productImage" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><small class="mo-muted">ไม่จำเป็นต้องใส่รูป ระบบจะย่อด้านยาวไม่เกิน 1,200 px และพยายามคุมไฟล์ประมาณ 300 KB</small></label><label><input id="productActive" type="checkbox" ${p.active!==false?'checked':''}> เปิดขาย</label><label>ลำดับ<input id="productSort" type="number" value="${Number(p.sort_order||0)}"></label></div><div class="mo-actions"><button id="saveProductBtn" class="mo-primary">บันทึกสินค้า</button></div>`);
  }
  async function saveProduct(){
    const shopId=document.getElementById('productShopId').value,id=document.getElementById('productId').value,name=document.getElementById('productName').value.trim(),price=Number(document.getElementById('productPrice').value),description=document.getElementById('productDescription').value.trim(),active=document.getElementById('productActive').checked,sort=Number(document.getElementById('productSort').value||0),file=document.getElementById('productImage').files?.[0];
    if(!name||!Number.isFinite(price)||price<0)return alert('กรอกชื่อและราคาให้ถูกต้อง');
    let image=null,imagePath=null,oldImagePath=null,newImagePath=null;
    if(id){const {data}=await db.from('market_products').select('image_url,image_path').eq('id',id).maybeSingle();image=data?.image_url||null;imagePath=data?.image_path||null;oldImagePath=imagePath;}
    if(file){
      try{
        const packed=await compressImage(file,{maxSide:1200,targetBytes:300*1024,quality:.82,minQuality:.58});
        newImagePath=`${session.user.id}/${shopId}/products/${Date.now()}-${uuid().slice(0,8)}.webp`;
        const {error:up}=await db.storage.from('shop-images').upload(newImagePath,packed,{contentType:'image/webp',upsert:false});if(up)throw up;
        image=db.storage.from('shop-images').getPublicUrl(newImagePath).data.publicUrl;imagePath=newImagePath;
      }catch(err){return alert('เตรียมหรืออัปโหลดรูปสินค้าไม่สำเร็จ: '+err.message)}
    }
    const payload={shop_id:shopId,name,price,description:description||null,active,sort_order:sort,image_url:image,image_path:imagePath,updated_at:new Date().toISOString()};
    const q=id?db.from('market_products').update(payload).eq('id',id):db.from('market_products').insert(payload);const {error}=await q;
    if(error){if(newImagePath)await safeRemove('shop-images',newImagePath);return alert(error.message)}
    if(newImagePath&&oldImagePath&&oldImagePath!==newImagePath)await safeRemove('shop-images',oldImagePath);
    alert('บันทึกสินค้าแล้ว');await refreshProductShops();openSellerShop(shopId);
  }
  async function deleteProduct(id){
    if(!confirm('ลบสินค้านี้? รูปสินค้าที่เก็บไว้จะถูกลบออกด้วย'))return;
    const {data:p,error:readErr}=await db.from('market_products').select('shop_id,image_path').eq('id',id).maybeSingle();if(readErr||!p)return alert(readErr?.message||'ไม่พบสินค้า');
    const {error}=await db.from('market_products').delete().eq('id',id);if(error)return alert(error.message);
    if(p.image_path)await safeRemove('shop-images',p.image_path);
    await refreshProductShops();openSellerShop(p.shop_id);
  }
  async function sellerSetStatus(orderId,status){if(status==='awaiting_payment'&&!confirm('ยืนยันว่าร้านยังไม่พบยอดชำระ?'))return;const {data,error}=await db.rpc('market_shop_set_order_status',{p_order_id:orderId,p_status:status});if(error)return alert(error.message);alert(status==='ready'?'แจ้งลูกค้าว่าสินค้าพร้อมแล้ว':'อัปเดตสถานะแล้ว');openSellerShop(data?.shop_id||data||document.getElementById('sellerShopId')?.value);}

  function haversine(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
  function routeKm(stops){let km=0;for(let i=1;i<stops.length;i++)km+=haversine(stops[i-1],stops[i]);return km}
  function fareFor(km,pickups){if(km>10)return null;const base=km<=2?25:25+Math.ceil((km-2)/2)*10,extra=Math.max(0,pickups-1)*EXTRA_PICKUP_FEE;return{base,extra,total:base+extra}}
  async function createDelivery(groupId){
    if(!session)return requireLogin();const {data:g,error}=await db.from('market_delivery_groups').select('*,orders:market_orders(id,status,shop:market_shops(id,name,latitude,longitude,phone,landmark,address))').eq('id',groupId).eq('customer_id',session.user.id).maybeSingle();if(error||!g)return alert('ไม่พบชุดคำสั่งซื้อ');const orders=(g.orders||[]).filter(o=>o.status!=='cancelled');if(!orders.length||!orders.every(o=>o.status==='ready'))return alert('ยังมีร้านที่สินค้าไม่พร้อม');if(g.rider_job_id)return alert('สร้างงานวินแล้ว');
    const pickups=[];for(const o of orders){const s=o.shop,lat=Number(s?.latitude),lng=Number(s?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng)||!lat||!lng)return alert(`ร้าน ${s?.name||''} ยังไม่มีพิกัด จึงยังเรียกวินอัตโนมัติไม่ได้`);pickups.push({type:'pickup',label:s.name,lat,lng,note:s.landmark||s.address||'',shop_id:s.id,contact_name:s.name,contact_phone:s.phone||''})}
    const drop={type:'dropoff',label:g.delivery_address||'จุดส่งลูกค้า',lat:Number(g.delivery_lat),lng:Number(g.delivery_lng),note:`ผู้รับ ${g.customer_name} โทร ${g.customer_phone}`,shop_id:null,contact_name:g.customer_name,contact_phone:g.customer_phone};const stops=[...pickups,drop],km=routeKm(stops),fare=fareFor(km,pickups.length);if(!fare)return alert('เส้นทางรวมเกิน 10 กม. ซึ่งเกินพื้นที่ทดสอบของระบบวิน');if(!confirm(`เรียกวินไปรับ ${pickups.length} ร้าน แล้วส่งเที่ยวเดียว\nระยะทางประมาณ ${km.toFixed(1)} กม.\nค่าจัดส่งประมาณ ${fare.total} บาท\n\nค่าส่งชำระให้วินเมื่อได้รับสินค้า`))return;
    const {data:jobId,error:jobErr}=await db.rpc('rider_create_multistop_job',{p_stops:stops,p_job_note:`ชุดคำสั่งซื้อ ${String(groupId).slice(0,8).toUpperCase()}`,p_payer:'receiver',p_distance_km:+km.toFixed(3),p_fare_estimate:fare.total,p_extra_stop_fee:fare.extra});if(jobErr)return alert('สร้างงานวินไม่สำเร็จ: '+jobErr.message);const {error:up}=await db.rpc('market_attach_rider_job',{p_group_id:groupId,p_rider_job_id:jobId,p_delivery_fee:fare.total,p_distance_km:+km.toFixed(3)});if(up)return alert('สร้างงานวินแล้ว แต่ผูกกับออเดอร์ไม่สำเร็จ: '+up.message);alert(`เรียกวินแล้ว ค่าส่งประมาณ ${fare.total} บาท`);openAccountHub('customer');
  }

  init();
})();
