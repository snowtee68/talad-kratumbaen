(() => {
  'use strict';
  const cfg=window.APP_CONFIG||{};
  if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY||!window.supabase){console.warn('Order module: Supabase not configured');return;}
  const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const CART_KEY='talad_multishop_cart_v1';
  // TEST MODE: keep ordering hidden from the public until the flow is fully tested.
  // Change ORDER_PUBLIC_ENABLED to true when ready to launch publicly.
  const ORDER_PUBLIC_ENABLED=false;
  const ORDER_TEST_EMAILS=['snowtee68@gmail.com'];
  const MAX_PICKUPS=5, EXTRA_PICKUP_FEE=10;
  let session=null, productShopIds=new Set(), productOptionDraft=[];
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2});
  const uuid=()=>crypto.randomUUID?.()||('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)}));
  const getCart=()=>{try{return JSON.parse(localStorage.getItem(CART_KEY)||'[]')}catch(_){return[]}};
  const saveCart=c=>{localStorage.setItem(CART_KEY,JSON.stringify(c));updateCartBadge();};
  const statusText=s=>({awaiting_payment:'รอชำระเงิน',payment_review:'ร้านกำลังตรวจสอบเงิน',preparing:'กำลังเตรียมสินค้า',ready:'พร้อมรับสินค้า',cancelled:'ยกเลิกแล้ว'})[s]||s;
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

  const canUseOrders=()=>ORDER_PUBLIC_ENABLED||ORDER_TEST_EMAILS.includes(String(session?.user?.email||'').toLowerCase());

  async function init(){
    const {data}=await db.auth.getSession();session=data.session;
    injectUI();wire();renderNavState();updateCartBadge();applyOrderAccess();
    db.auth.onAuthStateChange(async(_e,s)=>{session=s;renderNavState();applyOrderAccess();if(canUseOrders()){await refreshProductShops();decorateShopCards();}});
    if(canUseOrders()){await refreshProductShops();decorateShopCards();}
    new MutationObserver(()=>{if(canUseOrders())decorateShopCards();}).observe(document.body,{childList:true,subtree:true});
  }

  function injectUI(){
    if(!document.querySelector('link[href*="order.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='order.css?v=0.3.2';document.head.appendChild(css);}
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
      if(e.target.closest('#confirmAddConfiguredProduct'))return confirmAddConfiguredProduct();
      if(e.target.closest('#customQtyMinus'))return changeCustomQty(-1);
      if(e.target.closest('#customQtyPlus'))return changeCustomQty(1);
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
      const setst=e.target.closest('[data-order-status]');if(setst)return sellerSetStatus(setst.dataset.orderId,setst.dataset.orderStatus);
      const reject=e.target.closest('[data-reject-order]');if(reject)return sellerRejectOrder(reject.dataset.rejectOrder);
      const refund=e.target.closest('[data-refund-order]');if(refund)return openRefundModal(refund.dataset.refundOrder);
      if(e.target.closest('#submitRefundBtn'))return submitRefund();
      const confirmRefund=e.target.closest('[data-confirm-refund]');if(confirmRefund)return customerConfirmRefund(confirmRefund.dataset.confirmRefund);
      const ship=e.target.closest('[data-create-delivery]');if(ship)return createDelivery(ship.dataset.createDelivery);
      const hubtab=e.target.closest('[data-hub-tab]');if(hubtab)return document.getElementById('hubContent')?renderHubTab(hubtab.dataset.hubTab):openAccountHub(hubtab.dataset.hubTab);
    });
    document.addEventListener('input',e=>{const el=e.target.closest('[data-draft-field]');if(el)draftFieldChanged(el);});
    document.addEventListener('change',e=>{const el=e.target.closest('[data-draft-field]');if(el)draftFieldChanged(el);if(e.target.closest('[data-option-value]'))updateCustomProductTotal();});
  }
  function openModal(html,wide=false){const m=document.getElementById('marketOrderModal');m.querySelector('.market-order-panel').classList.toggle('wide',wide);document.getElementById('marketOrderBody').innerHTML=html;m.classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeModal(){document.getElementById('marketOrderModal')?.classList.add('hidden');document.body.style.overflow='';}
  function requireLogin(){alert('กรุณาเข้าสู่ระบบก่อนทำรายการ');document.getElementById('accountBtn')?.click();}
  function applyOrderAccess(){
    const allowed=canUseOrders();
    const nav=document.getElementById('marketOrdersBtn'),cart=document.getElementById('marketCartBtn');
    if(nav)nav.style.display=allowed?'':'none';
    if(cart)cart.style.display=allowed?'':'none';
    if(!allowed){document.querySelectorAll('[data-market-order-shop]').forEach(el=>el.remove());closeModal();}
  }
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
    const {data,error}=await db.from('market_products').select('shop_id').eq('sale_status','available').limit(5000);
    if(error){console.debug('Order SQL not installed yet:',error.message);productShopIds=new Set();return;}
    productShopIds=new Set((data||[]).map(x=>String(x.shop_id)));
  }
  function decorateShopCards(){
    if(!canUseOrders())return;
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
    if(!canUseOrders())return;
    const [{data:shop},{data:setting},{data:products,error}]=await Promise.all([
      db.from('market_shops').select('id,name,cover_url').eq('id',shopId).maybeSingle(),
      db.from('market_shop_order_settings').select('*').eq('shop_id',shopId).maybeSingle(),
      db.from('market_products').select('*').eq('shop_id',shopId).neq('sale_status','discontinued').order('sort_order').order('created_at')
    ]);
    if(error)return alert('โหลดสินค้าไม่สำเร็จ: '+error.message);
    const av=shopAvailability(setting),notice=av.ok?`<div class="mo-muted">${esc(av.msg)} · เลือกสินค้าใส่ตะกร้าได้ และสั่งจากหลายร้านพร้อมกัน</div>`:`<div class="warning-banner">⏸️ ${esc(av.msg)}</div>`;
    openModal(`<h2 class="mo-title">${esc(shop?.name||'ร้านค้า')}</h2>${notice}<div class="product-grid">${(products||[]).map(p=>{const sold=p.sale_status==='sold_out',can=av.ok&&p.sale_status==='available';return `<article class="product-card">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}">`:'<div style="aspect-ratio:4/3;background:#f3f3f3;display:grid;place-items:center;font-size:42px">🛍️</div>'}<div class="body"><h4>${esc(p.name)}</h4><p>${esc(p.description||'')}</p><div class="price">${money(p.price)} บาท</div>${sold?'<div class="status-pill">หมดชั่วคราว</div>':''}<button ${can?`data-add-product="${esc(p.id)}"`:'disabled'}>${sold?'สินค้าหมด':av.ok?'+ ใส่ตะกร้า':'ยังไม่เปิดรับออเดอร์'}</button></div></article>`}).join('')||'<p>ร้านนี้ยังไม่มีสินค้าที่เปิดขาย</p>'}</div>`,true);
  }
  async function addProduct(productId){
    const {data:p,error}=await db.from('market_products').select('id,shop_id,name,price,image_url,sale_status,shop:market_shops(name)').eq('id',productId).eq('sale_status','available').maybeSingle();
    if(error||!p)return alert(error?.message||'สินค้านี้ไม่พร้อมขาย');
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

  async function openCheckout(){
    if(!session)return requireLogin();const groups=groupedCart();if(!groups.length)return renderCart();if(groups.length>MAX_PICKUPS)return alert(`ระบบวินรองรับสูงสุด ${MAX_PICKUPS} ร้านต่อหนึ่งเที่ยว กรุณาแบ่งสั่งเป็น 2 รอบ`);
    const ids=groups.map(g=>g.shop_id);const {data:settings,error}=await db.from('market_shop_order_settings').select('*').in('shop_id',ids);
    if(error)return alert('ยังไม่ได้ติดตั้งระบบสั่งซื้อใน Supabase หรือโหลดข้อมูลการชำระเงินไม่สำเร็จ');
    const by=Object.fromEntries((settings||[]).map(s=>[s.shop_id,s]));const unavailable=groups.map(g=>({g,av:shopAvailability(by[g.shop_id])})).filter(x=>!x.av.ok);
    if(unavailable.length)return alert('ยังสั่งซื้อไม่ได้:\n'+unavailable.map(x=>`• ${x.g.shop_name}: ${x.av.msg}`).join('\n'));
    const total=getCart().reduce((s,x)=>s+x.price*x.qty,0);
    openModal(`<h2 class="mo-title">ยืนยันคำสั่งซื้อ</h2><div class="checkout-summary">${groups.map(g=>`<div style="display:flex;justify-content:space-between;gap:10px;margin:5px 0"><span>${esc(g.shop_name)}</span><b>${money(g.items.reduce((s,x)=>s+x.price*x.qty,0))} บาท</b></div>`).join('')}<hr><div style="display:flex;justify-content:space-between"><b>รวมค่าสินค้า</b><b>${money(total)} บาท</b></div></div><div class="warning-banner">หลังสร้างออเดอร์ ระบบจะแสดง QR ของแต่ละร้านให้ชำระแยกกัน ส่วนค่าจัดส่งชำระให้วินเมื่อได้รับสินค้า</div><div class="mo-form two"><label>ชื่อผู้รับ *<input id="coName" required></label><label>เบอร์โทร *<input id="coPhone" inputmode="tel" required></label><label class="full">ที่อยู่/จุดส่ง *<textarea id="coAddress" rows="3" required></textarea></label><label>ละติจูด *<input id="coLat" inputmode="decimal" required></label><label>ลองจิจูด *<input id="coLng" inputmode="decimal" required></label></div><div class="mo-actions"><button id="useDeliveryLocationBtn" class="mo-secondary">📍 ใช้ตำแหน่งปัจจุบัน</button><button id="submitCheckoutBtn" class="mo-primary">สร้างออเดอร์</button></div>`);
  }
  function captureDeliveryLocation(){if(!navigator.geolocation)return alert('อุปกรณ์นี้ไม่รองรับตำแหน่ง');navigator.geolocation.getCurrentPosition(p=>{document.getElementById('coLat').value=p.coords.latitude.toFixed(7);document.getElementById('coLng').value=p.coords.longitude.toFixed(7);},e=>alert('ระบุตำแหน่งไม่สำเร็จ: '+e.message),{enableHighAccuracy:true,timeout:12000});}
  async function submitCheckout(){
    if(!session)return requireLogin();const name=document.getElementById('coName')?.value.trim(),phone=document.getElementById('coPhone')?.value.trim(),address=document.getElementById('coAddress')?.value.trim(),lat=Number(document.getElementById('coLat')?.value),lng=Number(document.getElementById('coLng')?.value);if(!name||!phone||!address||!Number.isFinite(lat)||!Number.isFinite(lng))return alert('กรอกชื่อ เบอร์โทร ที่อยู่ และพิกัดจุดส่งให้ครบ');
    const groups=groupedCart();const payload=groups.map(g=>({shop_id:g.shop_id,items:g.items.map(x=>({product_id:x.product_id,qty:x.qty,option_value_ids:(x.selected_options||[]).map(o=>o.value_id),note:x.note||null}))}));
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
    if(!canUseOrders())return;
    if(!session)return requireLogin();
    openModal(`<h2 class="mo-title">🛍️ ออเดอร์และร้านของฉัน</h2><div class="seller-tabs"><button data-hub-tab="customer" class="${tab==='customer'?'active':''}">ออเดอร์ที่ฉันสั่ง</button><button data-hub-tab="seller" class="${tab==='seller'?'active':''}">ร้าน / ออเดอร์ที่ได้รับ</button></div><div id="hubContent">กำลังโหลด...</div>`,true);await renderHubTab(tab);
  }
  async function renderHubTab(tab){document.querySelectorAll('[data-hub-tab]').forEach(b=>b.classList.toggle('active',b.dataset.hubTab===tab));const box=document.getElementById('hubContent');if(!box)return;if(tab==='seller')return renderSellerHub(box);return renderCustomerHub(box);}
  async function renderCustomerHub(box){
    box.innerHTML='กำลังโหลด...';const {data:groups,error}=await db.from('market_delivery_groups').select('*,orders:market_orders(id,shop_id,subtotal,status,payment_ref,rejection_reason,refund_required,refund_status,refund_amount,refund_ref,refund_slip_path,refund_submitted_at,refund_confirmed_at,created_at,shop:market_shops(name,latitude,longitude,phone,landmark,address),items:market_order_items(product_name,unit_price,qty,options_json,note))').eq('customer_id',session.user.id).order('created_at',{ascending:false}).limit(30);if(error){box.innerHTML=`<div class="warning-banner">${esc(error.message)}</div>`;return}
    box.innerHTML=(groups||[]).map(g=>{const os=g.orders||[],activeOrders=os.filter(o=>o.status!=='cancelled'),readyCount=activeOrders.filter(o=>o.status==='ready').length,waitingCount=Math.max(0,activeOrders.length-readyCount),allReady=activeOrders.length>0&&waitingCount===0,groupOpen=!['cancelled','completed'].includes(g.status),canDelivery=allReady&&groupOpen&&!g.rider_job_id;const deliveryState=g.rider_job_id?`<div class="delivery-cost-box">🛵 สร้างงานวินแล้ว #${esc(String(g.rider_job_id).slice(0,8).toUpperCase())}</div>`:canDelivery?(activeOrders.length>1?`<div class="ready-banner">✅ พร้อมครบ ${readyCount}/${activeOrders.length} ร้าน สามารถเรียกวินไปรับรวมเที่ยวเดียวได้</div><button class="mo-primary" data-create-delivery="${g.id}">🛵 เรียกวินรับของทั้ง ${activeOrders.length} ร้าน</button>`:`<div class="ready-banner">✅ ร้านพร้อมรับสินค้าแล้ว สามารถเรียกวินได้</div><button class="mo-primary" data-create-delivery="${g.id}">🛵 เรียกวินรับสินค้า</button>`):groupOpen&&activeOrders.length?`<div class="warning-banner">⏳ รออีก ${waitingCount} ร้านพร้อมรับสินค้า (${readyCount}/${activeOrders.length} ร้านพร้อม)</div><button class="mo-primary" disabled aria-disabled="true" title="ต้องรอทุกร้านพร้อมก่อนเรียกวิน" style="opacity:.5;cursor:not-allowed">🛵 รอทุกร้านพร้อมก่อนเรียกวิน</button>`:'';return `<article class="order-card"><div class="order-card-head"><div><b>ชุดคำสั่งซื้อ #${esc(String(g.id).slice(0,8).toUpperCase())}</b><div class="mo-muted">${new Date(g.created_at).toLocaleString('th-TH')}</div></div><span class="status-pill">${esc(g.status||'กำลังดำเนินการ')}</span></div>${os.map(o=>{let refund='';if(o.refund_required){if((o.refund_status||'pending')==='pending')refund=`<div class="warning-banner">🔄 ร้านต้องคืนเงิน ${money(o.refund_amount||o.subtotal)} บาท กรุณารอร้านดำเนินการ หากร้านต้องการข้อมูลเพิ่มเติมจะติดต่อที่เบอร์ผู้รับ</div>`;else if(o.refund_status==='seller_submitted')refund=`<div class="ready-banner">💸 ร้านแจ้งคืนเงิน ${money(o.refund_amount||o.subtotal)} บาทแล้ว ${o.refund_submitted_at?`<br><small>${new Date(o.refund_submitted_at).toLocaleString('th-TH')}</small>`:''}</div><div class="mo-actions">${o.refund_slip_path?`<button class="mo-secondary" onclick="window.marketOrderOpenRefundSlip('${o.id}','${esc(o.refund_slip_path)}')">ดูหลักฐานคืนเงิน</button>`:''}<button class="mo-primary" data-confirm-refund="${o.id}">✅ ได้รับเงินคืนแล้ว</button></div>`;else if(o.refund_status==='completed')refund=`<div class="ready-banner">✅ ยืนยันได้รับเงินคืน ${money(o.refund_amount||o.subtotal)} บาทแล้ว${o.refund_confirmed_at?` · ${new Date(o.refund_confirmed_at).toLocaleString('th-TH')}`:''}</div>`;}return `<div class="payment-card"><div class="order-card-head"><b>🏪 ${esc(o.shop?.name||'ร้าน')}</b><span class="status-pill status-${esc(o.status)}">${esc(statusText(o.status))}</span></div><div class="order-items">${(o.items||[]).map(i=>renderOrderItem(i,true)).join('')}</div><b>${money(o.subtotal)} บาท</b>${o.rejection_reason?`<div class="warning-banner">ร้านยกเลิก: ${esc(o.rejection_reason)}</div>`:''}${refund}${o.status==='awaiting_payment'?`<div class="mo-actions"><button class="mo-primary" data-pay-order="${o.id}">ชำระ/แจ้งชำระเงิน</button></div>`:''}</div>`}).join('')}${deliveryState}</article>`}).join('')||'<p>ยังไม่มีออเดอร์</p>';
  }
  async function renderSellerHub(box){
    box.innerHTML='กำลังโหลด...';const {data:shops,error}=await db.from('market_shops').select('id,name,status').eq('owner_id',session.user.id).order('created_at',{ascending:false});if(error){box.innerHTML=esc(error.message);return}box.innerHTML=`<div class="mo-muted">เลือกแท็บร้านเพื่อจัดสินค้า QR รับเงิน และดูออเดอร์ที่ลูกค้าสั่งเข้ามา</div>${(shops||[]).map(s=>`<button class="seller-shop-card" style="display:block;width:100%;text-align:left;background:#fff;cursor:pointer" data-seller-shop="${s.id}"><b>🏪 ${esc(s.name)}</b><div class="mo-muted">สถานะร้าน: ${esc(s.status)}</div></button>`).join('')||'<p>บัญชีนี้ยังไม่มีร้าน</p>'}`;
  }

  async function openSellerShop(shopId){
    const [{data:shop},{data:setting},{data:products},{data:orders,error}]=await Promise.all([
      db.from('market_shops').select('id,name,owner_id').eq('id',shopId).maybeSingle(),db.from('market_shop_order_settings').select('*').eq('shop_id',shopId).maybeSingle(),db.from('market_products').select('*').eq('shop_id',shopId).order('sort_order').order('created_at'),db.from('market_orders').select('id,subtotal,status,payment_ref,payment_slip_path,payment_submitted_at,paid_at,rejection_reason,refund_required,refund_status,refund_amount,refund_ref,refund_slip_path,refund_submitted_at,refund_confirmed_at,created_at,customer_id,group:market_delivery_groups(customer_name,customer_phone,delivery_address),items:market_order_items(product_name,unit_price,qty,options_json,note)').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(50)
    ]);if(error)return alert(error.message);
    const accepting=setting?.accepting_status||'open';
    openModal(`<input id="sellerShopId" type="hidden" value="${esc(shopId)}"><h2 class="mo-title">🏪 ${esc(shop?.name||'ร้าน')}</h2><section class="seller-section"><h3>รับออเดอร์และการชำระเงิน</h3><div class="mo-form two"><label class="full"><input id="orderEnabled" type="checkbox" ${setting?.enabled?'checked':''}> เปิดระบบรับออเดอร์ผ่านตลาด</label><label>สถานะรับออเดอร์ตอนนี้<select id="acceptingStatus"><option value="open" ${accepting==='open'?'selected':''}>🟢 เปิดรับออเดอร์</option><option value="paused" ${accepting==='paused'?'selected':''}>⏸️ พักรับออเดอร์ชั่วคราว</option></select></label><label>เหตุผลที่พักรับ<input id="pauseReason" value="${esc(setting?.pause_reason||'')}" placeholder="เช่น ของหมด / คนไม่พอ"></label><label>เริ่มรับออเดอร์<input id="orderStartTime" type="time" value="${esc(hhmm(setting?.order_start_time))}"></label><label>หยุดรับออเดอร์<input id="orderEndTime" type="time" value="${esc(hhmm(setting?.order_end_time))}"></label><label>ชื่อบัญชี/ชื่อรับเงิน<input id="paymentName" value="${esc(setting?.payment_name||'')}"></label><label>หมายเหตุการชำระเงิน<input id="paymentNote" value="${esc(setting?.payment_note||'')}"></label><label class="full">อัปโหลดรูป QR PromptPay<input id="paymentQrFile" type="file" accept="image/*"></label>${setting?.payment_qr_url?`<div class="full"><img src="${esc(setting.payment_qr_url)}" style="max-width:180px;border:1px solid #ddd;border-radius:12px"></div>`:''}</div><div class="warning-banner">ถ้าไม่กำหนดเวลาเริ่ม/หยุด ระบบจะรับออเดอร์ตลอดวันที่ร้านเปิดระบบไว้</div><div class="mo-actions"><button id="saveOrderSettingsBtn" class="mo-primary">บันทึกการตั้งค่า</button></div></section><section class="seller-section"><div class="order-card-head"><h3>สินค้า</h3><button id="addProductBtn" class="mo-primary">+ เพิ่มสินค้า</button></div>${(products||[]).map(p=>`<div class="seller-product-row"><div><b>${esc(p.name)}</b> · ${money(p.price)} บาท <span class="status-pill">${esc(productStatusText(p.sale_status|| (p.active?'available':'sold_out')))}</span></div><div><button class="mo-secondary" data-product-options="${p.id}">⚙️ ตัวเลือก</button> <button class="mo-secondary" data-edit-product="${p.id}">แก้ไข</button> <button class="mo-danger" data-delete-product="${p.id}">ลบถาวร</button></div></div>`).join('')||'<p>ยังไม่มีสินค้า</p>'}</section><section class="seller-section"><h3>ออเดอร์ที่ได้รับ</h3>${(orders||[]).map(o=>sellerOrderCard(o)).join('')||'<p>ยังไม่มีออเดอร์</p>'}</section>`,true);
  }
  function renderOrderItem(i,withTotal=false){const opts=Array.isArray(i.options_json)?i.options_json:[],opt=opts.length?`<div class="mo-muted">${opts.map(o=>`${esc(o.group_name)}: ${esc(o.value_name)}${Number(o.price_delta||0)?` (+${money(o.price_delta)}฿)`:''}`).join(' · ')}</div>`:'',note=i.note?`<div class="mo-muted">📝 ${esc(i.note)}</div>`:'',total=withTotal?` = ${money(Number(i.unit_price)*i.qty)} บาท`:'';return `<div style="margin-bottom:7px"><b>${esc(i.product_name)} × ${i.qty}${total}</b>${opt}${note}</div>`;}
  function sellerOrderCard(o){
    const rejectable=['awaiting_payment','payment_review','preparing'].includes(o.status);let refund='';
    if(o.refund_required){const rs=o.refund_status||'pending';if(rs==='pending')refund=`<div class="warning-banner">⚠️ ต้องคืนเงินลูกค้า ${money(o.refund_amount||o.subtotal)} บาท<br><small>ติดต่อ/คืนผ่าน PromptPay ตามเบอร์ผู้รับ: ${esc(o.group?.customer_phone||'-')}</small></div><div class="mo-actions"><button class="mo-primary" data-refund-order="${o.id}">💸 แจ้งคืนเงินแล้ว</button></div>`;else if(rs==='seller_submitted')refund=`<div class="ready-banner">💸 ร้านแจ้งคืนเงิน ${money(o.refund_amount||o.subtotal)} บาทแล้ว กำลังรอลูกค้ายืนยัน</div><div class="mo-actions">${o.refund_slip_path?`<button class="mo-secondary" onclick="window.marketOrderOpenRefundSlip('${o.id}','${esc(o.refund_slip_path)}')">ดูหลักฐานคืนเงิน</button>`:''}</div>`;else if(rs==='completed')refund=`<div class="ready-banner">✅ ลูกค้ายืนยันได้รับเงินคืน ${money(o.refund_amount||o.subtotal)} บาทแล้ว</div>`;}
    return `<article class="order-card"><div class="order-card-head"><div><b>Order #${esc(String(o.id).slice(0,8).toUpperCase())}</b><div class="mo-muted">${esc(o.group?.customer_name||'ลูกค้า')} · ${esc(o.group?.customer_phone||'')}<br>${esc(o.group?.delivery_address||'')}</div></div><span class="status-pill status-${esc(o.status)}">${esc(statusText(o.status))}</span></div><div class="order-items">${(o.items||[]).map(i=>renderOrderItem(i,false)).join('')}</div><b>ยอด ${money(o.subtotal)} บาท</b>${o.payment_ref?`<div>อ้างอิง: ${esc(o.payment_ref)}</div>`:''}${o.rejection_reason?`<div class="mo-muted">เหตุผลยกเลิก: ${esc(o.rejection_reason)}</div>`:''}${refund}<div class="mo-actions">${o.payment_slip_path?`<button class="mo-secondary" onclick="window.marketOrderOpenSlip('${esc(o.payment_slip_path)}')">ดูสลิปชำระ</button>`:''}${o.status==='payment_review'?`<button class="mo-primary" data-order-id="${o.id}" data-order-status="preparing">✅ เงินเข้าแล้ว / เริ่มเตรียม</button><button class="mo-danger" data-order-id="${o.id}" data-order-status="awaiting_payment">ยังไม่พบยอด</button>`:''}${o.status==='preparing'?`<button class="mo-primary" data-order-id="${o.id}" data-order-status="ready">📦 สินค้าพร้อมรับ</button>`:''}${rejectable?`<button class="mo-danger" data-reject-order="${o.id}">ปฏิเสธออเดอร์</button>`:''}</div></article>`;
  }
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
    const shopId=document.getElementById('sellerShopId').value,enabled=document.getElementById('orderEnabled').checked,accepting_status=document.getElementById('acceptingStatus').value,pause_reason=document.getElementById('pauseReason').value.trim(),order_start_time=document.getElementById('orderStartTime').value||null,order_end_time=document.getElementById('orderEndTime').value||null,name=document.getElementById('paymentName').value.trim(),note=document.getElementById('paymentNote').value.trim(),file=document.getElementById('paymentQrFile').files?.[0];let qr=null;
    const {data:old}=await db.from('market_shop_order_settings').select('payment_qr_url,payment_qr_path').eq('shop_id',shopId).maybeSingle();qr=old?.payment_qr_url||null;let qrPath=old?.payment_qr_path||null,newQrPath=null;
    if(file){try{const packed=await compressImage(file,{maxSide:1400,targetBytes:450*1024,quality:.95,minQuality:.82});newQrPath=`${session.user.id}/${shopId}/payment-qr-${Date.now()}.webp`;const {error:up}=await db.storage.from('shop-images').upload(newQrPath,packed,{contentType:'image/webp'});if(up)throw up;qr=db.storage.from('shop-images').getPublicUrl(newQrPath).data.publicUrl;qrPath=newQrPath;}catch(err){return alert('อัปโหลด QR ไม่สำเร็จ: '+err.message)}}
    if(enabled&&!qr)return alert('เปิดรับออเดอร์ได้เมื่ออัปโหลด QR รับเงินแล้ว');if((order_start_time&&!order_end_time)||(!order_start_time&&order_end_time))return alert('ถ้ากำหนดเวลารับออเดอร์ กรุณาใส่ทั้งเวลาเริ่มและเวลาหยุด');
    const {error}=await db.from('market_shop_order_settings').upsert({shop_id:shopId,enabled,accepting_status,pause_reason:accepting_status==='paused'?(pause_reason||null):null,order_start_time,order_end_time,payment_qr_url:qr,payment_qr_path:qrPath,payment_name:name||null,payment_note:note||null,updated_at:new Date().toISOString()});if(error){if(newQrPath)await safeRemove('shop-images',newQrPath);return alert(error.message)}if(newQrPath&&old?.payment_qr_path&&old.payment_qr_path!==newQrPath)await safeRemove('shop-images',old.payment_qr_path);alert('บันทึกแล้ว');await refreshProductShops();openSellerShop(shopId);
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

  async function openProductEditor(productId=null){const shopId=document.getElementById('sellerShopId')?.value;if(!shopId)return;let p={};if(productId){const {data}=await db.from('market_products').select('*').eq('id',productId).maybeSingle();p=data||{}}try{await loadProductOptionDraft(productId)}catch(err){return alert('โหลดตัวเลือกสินค้าไม่สำเร็จ: '+err.message)}const st=p.sale_status||(p.active===false?'sold_out':'available');openModal(`<input id="productShopId" type="hidden" value="${esc(shopId)}"><input id="productId" type="hidden" value="${esc(p.id||'')}"><h2 class="mo-title">${productId?'แก้ไขสินค้า':'เพิ่มสินค้า'}</h2><div class="mo-form two"><label>ชื่อสินค้า *<input id="productName" value="${esc(p.name||'')}"></label><label>ราคา (บาท) *<input id="productPrice" type="number" min="0" step="0.01" value="${esc(p.price??'')}"></label><label>สถานะสินค้า<select id="productSaleStatus"><option value="available" ${st==='available'?'selected':''}>🟢 เปิดขาย</option><option value="sold_out" ${st==='sold_out'?'selected':''}>🟠 หมดชั่วคราว</option><option value="discontinued" ${st==='discontinued'?'selected':''}>⚫ เลิกขาย / หมดถาวร</option></select></label><label>ลำดับ<input id="productSort" type="number" value="${Number(p.sort_order||0)}"></label><label class="full">รายละเอียด<textarea id="productDescription" rows="3">${esc(p.description||'')}</textarea></label><label class="full">รูปสินค้า (1 รูป / ระบบย่อเป็น WebP อัตโนมัติ)<input id="productImage" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><small class="mo-muted">“หมดชั่วคราว” ยังเห็นรายการในหลังร้านและเปิดกลับได้ทันที ส่วน “เลิกขาย” จะซ่อนจากลูกค้าแต่ไม่ลบประวัติ</small></label></div><section class="seller-section" style="margin-top:14px"><div class="order-card-head"><div><h3 style="margin:0">⚙️ ตัวเลือกสินค้า</h3><div class="mo-muted">ไม่บังคับ · เช่น ความหวาน ความเผ็ด เพิ่มไข่ หรือ Topping</div></div><button type="button" id="draftAddOptionGroup" class="mo-primary">+ เพิ่มกลุ่มตัวเลือก</button></div><div id="productOptionsDraft"></div></section><div class="mo-actions"><button id="saveProductBtn" class="mo-primary">บันทึกสินค้าและตัวเลือก</button></div>`);renderProductOptionDraft();
  }
  async function saveProduct(){
    const shopId=document.getElementById('productShopId').value,id=document.getElementById('productId').value,name=document.getElementById('productName').value.trim(),price=Number(document.getElementById('productPrice').value),description=document.getElementById('productDescription').value.trim(),sale_status=document.getElementById('productSaleStatus').value,active=sale_status==='available',sort=Number(document.getElementById('productSort').value||0),file=document.getElementById('productImage').files?.[0];
    if(!name||!Number.isFinite(price)||price<0)return alert('กรอกชื่อและราคาให้ถูกต้อง');const optionErr=validateProductOptionDraft();if(optionErr)return alert(optionErr);
    let image=null,imagePath=null,oldImagePath=null,newImagePath=null;
    if(id){const {data}=await db.from('market_products').select('image_url,image_path').eq('id',id).maybeSingle();image=data?.image_url||null;imagePath=data?.image_path||null;oldImagePath=imagePath;}
    if(file){try{const packed=await compressImage(file,{maxSide:1200,targetBytes:300*1024,quality:.82,minQuality:.58});newImagePath=`${session.user.id}/${shopId}/products/${Date.now()}-${uuid().slice(0,8)}.webp`;const {error:up}=await db.storage.from('shop-images').upload(newImagePath,packed,{contentType:'image/webp',upsert:false});if(up)throw up;image=db.storage.from('shop-images').getPublicUrl(newImagePath).data.publicUrl;imagePath=newImagePath;}catch(err){return alert('เตรียมหรืออัปโหลดรูปสินค้าไม่สำเร็จ: '+err.message)}}
    const payload={shop_id:shopId,name,price,description:description||null,active,sale_status,sort_order:sort,image_url:image,image_path:imagePath,updated_at:new Date().toISOString()};let productId=id;
    try{if(id){const {error}=await db.from('market_products').update(payload).eq('id',id);if(error)throw error;}else{const {data,error}=await db.from('market_products').insert(payload).select('id').single();if(error)throw error;productId=data.id;}await syncProductOptions(productId);}catch(error){if(newImagePath)await safeRemove('shop-images',newImagePath);return alert('บันทึกสินค้า/ตัวเลือกไม่สำเร็จ: '+error.message)}
    if(newImagePath&&oldImagePath&&oldImagePath!==newImagePath)await safeRemove('shop-images',oldImagePath);alert('บันทึกสินค้าและตัวเลือกแล้ว');await refreshProductShops();openSellerShop(shopId);
  }
  async function deleteProduct(id){
    if(!confirm('ลบสินค้านี้ถาวรจริงหรือไม่?\n\nแนะนำให้ใช้สถานะ “เลิกขาย” แทน เพื่อเก็บข้อมูลสินค้าไว้ หากเป็นสินค้าที่เคยขายจริง'))return;
    const {data:p,error:readErr}=await db.from('market_products').select('shop_id,image_path').eq('id',id).maybeSingle();if(readErr||!p)return alert(readErr?.message||'ไม่พบสินค้า');const {error}=await db.from('market_products').delete().eq('id',id);if(error)return alert(error.message);if(p.image_path)await safeRemove('shop-images',p.image_path);await refreshProductShops();openSellerShop(p.shop_id);
  }
  async function sellerSetStatus(orderId,status){if(status==='awaiting_payment'&&!confirm('ยืนยันว่าร้านยังไม่พบยอดชำระ?'))return;const {data,error}=await db.rpc('market_shop_set_order_status',{p_order_id:orderId,p_status:status});if(error)return alert(error.message);alert(status==='ready'?'แจ้งลูกค้าว่าสินค้าพร้อมแล้ว':'อัปเดตสถานะแล้ว');openSellerShop(data?.shop_id||data||document.getElementById('sellerShopId')?.value);}
  async function sellerRejectOrder(orderId){
    const reason=prompt('เหตุผลที่ปฏิเสธออเดอร์\nเช่น สินค้าหมด / ร้านใกล้ปิด / ทำไม่ทัน / อื่น ๆ');if(reason===null)return;if(!reason.trim())return alert('กรุณาระบุเหตุผล');
    if(!confirm('ยืนยันปฏิเสธออเดอร์นี้?\nถ้าลูกค้าชำระเงินแล้ว ร้านต้องคืนเงินให้ลูกค้าโดยตรง'))return;
    const {data,error}=await db.rpc('market_shop_reject_order',{p_order_id:orderId,p_reason:reason.trim()});if(error)return alert(error.message);alert(data?.refund_required?'ยกเลิกออเดอร์แล้ว ⚠️ มีหลักฐาน/สถานะชำระเงิน กรุณาคืนเงินลูกค้าโดยตรง':'ยกเลิกออเดอร์แล้ว');openSellerShop(data?.shop_id||document.getElementById('sellerShopId')?.value);
  }
  async function openRefundModal(orderId){
    const {data:o,error}=await db.from('market_orders').select('id,subtotal,refund_required,refund_status,refund_amount,group:market_delivery_groups(customer_name,customer_phone)').eq('id',orderId).maybeSingle();if(error||!o)return alert(error?.message||'ไม่พบออเดอร์');if(!o.refund_required)return alert('ออเดอร์นี้ไม่ต้องคืนเงิน');if((o.refund_status||'pending')==='completed')return alert('ลูกค้ายืนยันได้รับเงินคืนแล้ว');
    openModal(`<input id="refundOrderId" type="hidden" value="${esc(orderId)}"><h2 class="mo-title">💸 แจ้งคืนเงินลูกค้า</h2><div class="warning-banner">ยอดที่ต้องคืน <b>${money(o.refund_amount||o.subtotal)} บาท</b><br>ผู้รับ: ${esc(o.group?.customer_name||'ลูกค้า')} · ${esc(o.group?.customer_phone||'')}<br><small>แนะนำ PromptPay ตามเบอร์ผู้รับ หากไม่แน่ใจให้ติดต่อผู้รับก่อนโอน</small></div><div class="mo-form"><label>เลขอ้างอิงการคืนเงิน (ถ้ามี)<input id="refundRef" placeholder="เช่น 483921"></label><label>แนบสลิปคืนเงิน *<input id="refundSlip" type="file" accept="image/*" required></label></div><div class="mo-actions"><button id="submitRefundBtn" class="mo-primary">ส่งหลักฐานคืนเงินให้ลูกค้า</button></div>`);
  }
  async function submitRefund(){
    if(!session)return requireLogin();const orderId=document.getElementById('refundOrderId')?.value,ref=document.getElementById('refundRef')?.value.trim(),file=document.getElementById('refundSlip')?.files?.[0];if(!orderId||!file)return alert('กรุณาแนบสลิปคืนเงิน');const btn=document.getElementById('submitRefundBtn');btn.disabled=true;btn.textContent='กำลังส่ง...';
    let oldPath=null,newPath=null;try{const {data:o,error:readErr}=await db.from('market_orders').select('refund_slip_path').eq('id',orderId).maybeSingle();if(readErr)throw readErr;oldPath=o?.refund_slip_path||null;const packed=await compressImage(file,{maxSide:1800,targetBytes:600*1024,quality:.86,minQuality:.68});newPath=`${orderId}/${session.user.id}/refund-${Date.now()}.webp`;const {error:up}=await db.storage.from('order-slips').upload(newPath,packed,{contentType:'image/webp',upsert:false});if(up)throw up;const {data,error}=await db.rpc('market_shop_submit_refund',{p_order_id:orderId,p_refund_ref:ref||null,p_refund_slip_path:newPath});if(error)throw error;if(oldPath&&oldPath!==newPath)await safeRemove('order-slips',oldPath);alert('แจ้งคืนเงินแล้ว รอลูกค้ายืนยันว่าได้รับเงิน');openSellerShop(data?.shop_id||document.getElementById('sellerShopId')?.value);}catch(err){if(newPath)await safeRemove('order-slips',newPath);btn.disabled=false;btn.textContent='ส่งหลักฐานคืนเงินให้ลูกค้า';alert('แจ้งคืนเงินไม่สำเร็จ: '+err.message)}
  }
  async function customerConfirmRefund(orderId){
    if(!confirm('ยืนยันว่าคุณได้รับเงินคืนจากร้านครบแล้ว?'))return;const {data,error}=await db.rpc('market_customer_confirm_refund',{p_order_id:orderId});if(error)return alert(error.message);alert('ยืนยันได้รับเงินคืนแล้ว ขอบคุณครับ');openAccountHub('customer');
  }

  function haversine(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
  function routeKm(stops){let km=0;for(let i=1;i<stops.length;i++)km+=haversine(stops[i-1],stops[i]);return km}
  function fareFor(km,pickups){if(km>10)return null;const base=km<=2?25:25+Math.ceil((km-2)/2)*10,extra=Math.max(0,pickups-1)*EXTRA_PICKUP_FEE;return{base,extra,total:base+extra}}
  async function createDelivery(groupId){
    if(!session)return requireLogin();const {data:g,error}=await db.from('market_delivery_groups').select('*,orders:market_orders(id,status,shop:market_shops(id,name,latitude,longitude,phone,landmark,address))').eq('id',groupId).eq('customer_id',session.user.id).maybeSingle();if(error||!g)return alert('ไม่พบชุดคำสั่งซื้อ');const orders=(g.orders||[]).filter(o=>o.status!=='cancelled');const notReady=orders.filter(o=>o.status!=='ready');if(!orders.length)return alert('ไม่มีออเดอร์ที่สามารถเรียกวินได้');if(notReady.length)return alert(`ยังเรียกวินไม่ได้ ต้องรออีก ${notReady.length} ร้านพร้อมรับสินค้าก่อน`);if(g.rider_job_id)return alert('สร้างงานวินแล้ว');
    const pickups=[];for(const o of orders){const s=o.shop,lat=Number(s?.latitude),lng=Number(s?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng)||!lat||!lng)return alert(`ร้าน ${s?.name||''} ยังไม่มีพิกัด จึงยังเรียกวินอัตโนมัติไม่ได้`);pickups.push({type:'pickup',label:s.name,lat,lng,note:s.landmark||s.address||'',shop_id:s.id,contact_name:s.name,contact_phone:s.phone||''})}
    const drop={type:'dropoff',label:g.delivery_address||'จุดส่งลูกค้า',lat:Number(g.delivery_lat),lng:Number(g.delivery_lng),note:`ผู้รับ ${g.customer_name} โทร ${g.customer_phone}`,shop_id:null,contact_name:g.customer_name,contact_phone:g.customer_phone};const stops=[...pickups,drop],km=routeKm(stops),fare=fareFor(km,pickups.length);if(!fare)return alert('เส้นทางรวมเกิน 10 กม. ซึ่งเกินพื้นที่ทดสอบของระบบวิน');if(!confirm(`เรียกวินไปรับ ${pickups.length} ร้าน แล้วส่งเที่ยวเดียว\nระยะทางประมาณ ${km.toFixed(1)} กม.\nค่าจัดส่งประมาณ ${fare.total} บาท\n\nค่าส่งชำระให้วินเมื่อได้รับสินค้า`))return;
    const {data:jobId,error:jobErr}=await db.rpc('rider_create_multistop_job',{p_stops:stops,p_job_note:`ชุดคำสั่งซื้อ ${String(groupId).slice(0,8).toUpperCase()}`,p_payer:'receiver',p_distance_km:+km.toFixed(3),p_fare_estimate:fare.total,p_extra_stop_fee:fare.extra});if(jobErr)return alert('สร้างงานวินไม่สำเร็จ: '+jobErr.message);const {error:up}=await db.rpc('market_attach_rider_job',{p_group_id:groupId,p_rider_job_id:jobId,p_delivery_fee:fare.total,p_distance_km:+km.toFixed(3)});if(up)return alert('สร้างงานวินแล้ว แต่ผูกกับออเดอร์ไม่สำเร็จ: '+up.message);alert(`เรียกวินแล้ว ค่าส่งประมาณ ${fare.total} บาท`);openAccountHub('customer');
  }

  init();
})();
