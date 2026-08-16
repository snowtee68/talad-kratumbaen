(() => {
  'use strict';
  console.info('Talad Krathumbaen Main v5.7.9.1 Pagination Review Fix loaded');

  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(
    cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('PASTE_') &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('PASTE_')
  );
  const db = configured ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const DEMO = [{id:'demo',name:'Snowtee ตลาดกระทุ่มแบน',description:'เครื่องดื่ม ไอศกรีมซอฟต์เสิร์ฟ และเบเกอรี่ บรรยากาศริมคลอง',category:{name:'เครื่องดื่ม'},address:'ตลาดกระทุ่มแบน จังหวัดสมุทรสาคร',phone:'0642211876',facebook:'https://facebook.com/snowtee68',line:'snowtee68',latitude:13.6549,longitude:100.2639,status:'approved',featured:true,cover_url:null}];

  let shops = [], shopIndex = [], featuredShops = [], favoriteShops = [], categories = [], promotions = [], reviewStats = {}, favorites = new Set(), currentCategory = 'all', session = null, profile = null, shopSort = 'recommended', shopOnlyOpen = false, shopOnlyPromo = false, shopTotalCount = 0, shopPage = 0, shopLoading = false;
  const SHOP_PAGE_SIZE = 10;
  let map, miniMap, mapMarkers = [], miniMarkers = [], mapMarkerLayer = null, userLocation = null, userMarker = null, userAccuracyCircle = null, mapFilterMode = 'all', mapCategoryFilter = 'all';
  const $ = id => document.getElementById(id);

  const esc = (value='') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const link = (value, type) => {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (type === 'facebook') return `https://facebook.com/${value.replace(/^@/,'')}`;
    if (type === 'line') return `https://line.me/ti/p/~${value.replace(/^@/,'')}`;
    if (type === 'tiktok') return `https://www.tiktok.com/@${value.replace(/^@/,'')}`;
    if (type === 'instagram') return `https://www.instagram.com/${value.replace(/^@/,'').replace(/\/$/,'')}`;
    return `https://${value}`;
  };
  const safeExternalUrl = value => {
    if (!value) return '';
    const v=String(value).trim();
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  };
  const showNotice = (text, isError=false) => { const n=$('notice'); n.textContent=text; n.classList.remove('hidden'); n.style.background=isError?'#ffe5e5':'#fff4d7'; };
  const hideNotice = () => $('notice').classList.add('hidden');
  const openModal = id => { $(id).classList.remove('hidden'); document.body.style.overflow='hidden'; };
  const closeModal = id => { $(id).classList.add('hidden'); document.body.style.overflow=''; };


  const IMAGE_LIMITS = {
    inputBytes: 20 * 1024 * 1024,
    outputBytes: 900 * 1024,
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.84
  };


  function formatFileSize(bytes=0){
    if(bytes<1024)return `${bytes} B`;
    if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
  }

  async function previewPromotionImage(file){
    const preview=$('promotionImagePreview');
    if(!preview)return;
    if(!file||!file.size){
      preview.innerHTML='<small>ยังไม่ได้เลือกรูป</small>';
      return;
    }
    if(!file.type.startsWith('image/')){
      preview.innerHTML='<small>กรุณาเลือกไฟล์รูปภาพเท่านั้น</small>';
      return;
    }
    if(file.size>IMAGE_LIMITS.inputBytes){
      preview.innerHTML=`<small>ไฟล์ ${esc(formatFileSize(file.size))} ใหญ่เกินกำหนด สูงสุด 20 MB</small>`;
      return;
    }
    const url=URL.createObjectURL(file);
    preview.innerHTML=`<img src="${url}" alt="ตัวอย่างรูปโปรโมชั่น"><small>ไฟล์ต้นฉบับ ${esc(formatFileSize(file.size))} • ระบบจะย่อและแปลงเป็น WebP ก่อนอัปโหลดจริง</small>`;
    const img=preview.querySelector('img');
    if(img)img.onload=()=>setTimeout(()=>URL.revokeObjectURL(url),0);
  }

  function loadImageFile(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพนี้ได้'));};
      img.src=url;
    });
  }

  function canvasToBlob(canvas,type,quality){
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('บีบอัดรูปภาพไม่สำเร็จ')),type,quality));
  }

  async function compressImage(file,{maxWidth=IMAGE_LIMITS.maxWidth,maxHeight=IMAGE_LIMITS.maxHeight,maxBytes=IMAGE_LIMITS.outputBytes}={}){
    if(!file||!file.size)return null;
    if(!file.type.startsWith('image/'))throw new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
    if(file.size>IMAGE_LIMITS.inputBytes)throw new Error('รูปต้นฉบับต้องมีขนาดไม่เกิน 20 MB');

    const img=await loadImageFile(file);
    const ratio=Math.min(1,maxWidth/img.naturalWidth,maxHeight/img.naturalHeight);
    let width=Math.max(1,Math.round(img.naturalWidth*ratio));
    let height=Math.max(1,Math.round(img.naturalHeight*ratio));
    let quality=0.86;
    let blob=null;

    for(let attempt=0;attempt<24;attempt++){
      const canvas=document.createElement('canvas');
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('อุปกรณ์นี้ไม่รองรับการย่อรูป');
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,width,height);
      ctx.drawImage(img,0,0,width,height);
      blob=await canvasToBlob(canvas,'image/webp',quality);

      if(blob.size<=maxBytes)break;

      if(quality>0.46){
        quality=Math.max(0.46,quality-0.07);
      }else{
        const scale=blob.size>maxBytes*2 ? 0.72 : 0.84;
        width=Math.max(480,Math.round(width*scale));
        height=Math.max(360,Math.round(height*scale));
        quality=0.74;
      }
    }

    if(!blob||blob.size>maxBytes){
      throw new Error(`ย่อรูปไม่สำเร็จ กรุณาใช้รูป JPG/PNG ที่ไม่เกิน 20 MB`);
    }

    return new File([blob],`${Date.now()}.webp`,{type:'image/webp'});
  }

  function storagePathFromPublicUrl(url,bucket){
    if(!url)return '';
    const marker=`/storage/v1/object/public/${bucket}/`;
    const i=String(url).indexOf(marker);
    return i>=0?decodeURIComponent(String(url).slice(i+marker.length)):'';
  }

  async function removeStoredImage(url,bucket){
    const path=storagePathFromPublicUrl(url,bucket);
    if(!path)return;
    const {error}=await db.storage.from(bucket).remove([path]);
    if(error)console.warn('ลบรูปเก่าไม่สำเร็จ:',error.message);
  }

  async function uploadCompressedImage(file,bucket,pathPrefix,limits={}){
    const compressed=await compressImage(file,limits);
    if(!compressed)return null;
    const path=`${pathPrefix}/${Date.now()}-${crypto.randomUUID()}.webp`;
    const {error}=await db.storage.from(bucket).upload(path,compressed,{upsert:false,contentType:'image/webp',cacheControl:'31536000'});
    if(error)throw error;
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  function friendlyAuthError(message=''){
    const m=String(message).toLowerCase();
    if(m.includes('invalid login credentials')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if(m.includes('email not confirmed')) return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
    if(m.includes('email rate limit exceeded')) return 'ส่งอีเมลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
    if(m.includes('user already registered')) return 'อีเมลนี้สมัครสมาชิกแล้ว กรุณาเข้าสู่ระบบหรือกดลืมรหัสผ่าน';
    if(m.includes('password should be')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว';
    if(m.includes('same password')) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม';
    if(m.includes('otp expired')||m.includes('token has expired')) return 'ลิงก์หมดอายุ กรุณาขอลิงก์ใหม่';
    return message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  }


  const DAYS = [
    ['mon','จันทร์'],['tue','อังคาร'],['wed','พุธ'],['thu','พฤหัสบดี'],
    ['fri','ศุกร์'],['sat','เสาร์'],['sun','อาทิตย์']
  ];

  function renderHoursEditor(){
    const box=$('hoursRows'); if(!box)return;
    box.innerHTML=DAYS.map(([key,label])=>`<div class="hours-row" data-day="${key}"><strong>${label}</strong><label class="check"><input type="checkbox" name="${key}_closed"> ปิด</label><input type="time" name="${key}_open" value="09:00"><input type="time" name="${key}_close" value="20:00"></div>`).join('');
    box.querySelectorAll('input[type=checkbox]').forEach(c=>c.addEventListener('change',()=>c.closest('.hours-row').classList.toggle('closed',c.checked)));
  }

  function readOpeningHours(form){
    const result={};
    DAYS.forEach(([key])=>{result[key]={closed:form.elements[`${key}_closed`].checked,open:form.elements[`${key}_open`].value||'09:00',close:form.elements[`${key}_close`].value||'20:00'};});
    return result;
  }

  function fillOpeningHours(form,hours={}){
    DAYS.forEach(([key])=>{const d=hours?.[key]||{};form.elements[`${key}_closed`].checked=Boolean(d.closed);form.elements[`${key}_open`].value=d.open||'09:00';form.elements[`${key}_close`].value=d.close||'20:00';form.elements[`${key}_closed`].dispatchEvent(new Event('change'));});
  }

  function openState(shop){
    if(shop.temporarily_closed)return {open:false,text:'ปิดชั่วคราว'};
    if(shop.open_24_hours)return {open:true,text:'เปิด 24 ชั่วโมง'};
    const keys=['sun','mon','tue','wed','thu','fri','sat'];
    const now=new Date(), d=shop.opening_hours?.[keys[now.getDay()]];
    if(!d)return {open:null,text:'ยังไม่ระบุเวลา'};
    if(d.closed)return {open:false,text:'วันนี้ปิด'};
    const mins=t=>{const [h,m]=String(t||'00:00').split(':').map(Number);return h*60+m;};
    const current=now.getHours()*60+now.getMinutes(), start=mins(d.open), end=mins(d.close);
    const isOpen=end>=start ? current>=start&&current<end : current>=start||current<end;
    return {open:isOpen,text:isOpen?`เปิดอยู่ • ปิด ${d.close} น.`:`ปิดแล้ว • ${d.open}–${d.close} น.`};
  }

  function serviceBadges(s){
    const items=[];
    if(s.delivery)items.push('🚚 Delivery'); if(s.lineman)items.push('LINE MAN'); if(s.grab)items.push('Grab'); if(s.shopeefood)items.push('ShopeeFood');
    if(s.qr_payment)items.push('QR Payment'); if(s.card_payment)items.push('รับบัตร'); if(s.parking)items.push('🅿️ ที่จอดรถ'); if(s.pet_friendly)items.push('🐶 Pet friendly'); if(s.wheelchair_accessible)items.push('♿ รถเข็น');
    return items.slice(0,5).map(x=>`<span>${x}</span>`).join('');
  }

  function shopMarkerType(shop){
    if(shop.featured)return 'featured';
    if(visiblePromotionForShop(shop.id))return 'promo';
    return 'normal';
  }

  function shopMarkerIcon(shop){
    const type=shopMarkerType(shop);
    const badge=type==='featured'?'★':type==='promo'?'PROMO':'';
    return L.divIcon({
      className:'shop-marker-wrapper',
      html:`<div class="shop-map-marker ${type}" aria-label="${esc(shop.name)}"><span class="marker-pin"></span>${badge?`<b>${badge}</b>`:''}</div>`,
      iconSize:[38,48],
      iconAnchor:[19,46],
      popupAnchor:[0,-42]
    });
  }

  function markerPopup(shop){
    const category=shop.category?.name||'ร้านค้า';
    const rating=ratingForShop(shop.id);
    const state=openState(shop);
    const promo=visiblePromotionForShop(shop.id);
    const distance=shopDistance(shop);
    const go=shop.latitude&&shop.longitude
      ?`https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`
      :`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name+' ตลาดกระทุ่มแบน')}`;
    return `<div class="map-shop-popup">
      <div class="map-popup-title">${esc(shop.name)}</div>
      <div class="map-popup-category">${esc(category)}</div>
      ${rating.count?`<div class="map-popup-line">⭐ ${rating.average.toFixed(1)} (${rating.count} รีวิว)</div>`:''}
      <div class="map-popup-line ${state.open===true?'open':state.open===false?'closed':''}">${state.open===true?'🟢':state.open===false?'🔴':'🕒'} ${esc(state.text)}</div>
      ${distance==null?'':`<div class="map-popup-line">📏 ห่าง ${esc(formatDistance(distance))}</div>`}
      ${promo?`<div class="map-popup-promo">🔥 ${esc(promo.discount_text||promo.title||'มีโปรโมชั่น')}</div>`:''}
      <div class="map-popup-actions">
        <button type="button" data-action="details" data-shop-id="${esc(shop.id)}">ดูร้านค้า</button>
        <a href="${esc(go)}" target="_blank" rel="noopener noreferrer">นำทาง</a>
      </div>
    </div>`;
  }

  function renderMapFilters(){
    const box=$('mapFilterBar');
    if(!box)return;
    box.innerHTML=`<button type="button" class="${mapFilterMode==='all'&&mapCategoryFilter==='all'?'active':''}" data-map-filter="all">ทุกร้าน</button>
      <button type="button" class="${mapFilterMode==='featured'?'active':''}" data-map-filter="featured">⭐ ร้านแนะนำ</button>
      <button type="button" class="${mapFilterMode==='promo'?'active':''}" data-map-filter="promo">🔥 มีโปรโมชั่น</button>
      ${categories.map(c=>`<button type="button" class="${mapCategoryFilter===String(c.id)?'active':''}" data-map-category="${esc(c.id)}">${esc(c.icon||'🏪')} ${esc(c.name)}</button>`).join('')}`;
  }

  function filteredMapShops(list){
    return list.filter(shop=>{
      if(mapFilterMode==='featured'&&!shop.featured)return false;
      if(mapFilterMode==='promo'&&!visiblePromotionForShop(shop.id))return false;
      if(mapCategoryFilter!=='all'&&String(shop.category_id)!==String(mapCategoryFilter))return false;
      return true;
    });
  }

  function initMaps(){
    const center=[13.6549,100.2639], tiles='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    map=L.map('map').setView(center,16);
    miniMap=L.map('miniMap',{zoomControl:false,attributionControl:false}).setView(center,16);
    L.tileLayer(tiles,{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    L.tileLayer(tiles).addTo(miniMap);
    mapMarkerLayer=typeof L.markerClusterGroup==='function'
      ?L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:46,spiderfyOnMaxZoom:true})
      :L.layerGroup();
    map.addLayer(mapMarkerLayer);
  }

  async function loadCategories(){
    if(!db){ categories=[{id:'food',name:'อาหาร',icon:'🍜'},{id:'drink',name:'เครื่องดื่ม',icon:'🥤'},{id:'fashion',name:'แฟชั่น',icon:'👕'},{id:'service',name:'บริการ',icon:'🛠'}]; renderCategories(); return; }
    const {data,error}=await db.from('market_categories').select('*').eq('active',true).order('sort_order');
    if(error) throw error;
    categories=data||[]; renderCategories();
  }

  function renderCategories(){
    const box=$('categoryButtons'), select=$('categorySelect');
    box.innerHTML='<button class="active" data-category="all">ทั้งหมด</button>'+categories.map(c=>`<button data-category="${esc(c.id)}">${esc(c.icon||'🏪')} ${esc(c.name)}</button>`).join('');
    select.innerHTML='<option value="">เลือกหมวดหมู่</option>'+categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    box.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',async()=>{box.querySelectorAll('button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');currentCategory=btn.dataset.category;await resetShopList();}));
    renderMapFilters();
  }

  async function loadShopIndex(){
    if(!db){ shopIndex=DEMO; return; }
    const {data,error}=await db.from('market_shops')
      .select('id,name,description,address,category_id,created_at,featured,latitude,longitude,opening_hours,temporarily_closed,open_24_hours,category:market_categories(id,name,icon)')
      .eq('status','approved')
      .order('created_at',{ascending:false});
    if(error)throw error;
    shopIndex=data||[];
  }

  function orderedShopIndex(){
    const q=$('searchInput')?.value.trim().toLowerCase()||'';
    let list=shopIndex.filter(shop=>{
      if(currentCategory!=='all'&&String(shop.category_id)!==String(currentCategory))return false;
      if(q&&![shop.name,shop.description,shop.address,shop.category?.name].filter(Boolean).join(' ').toLowerCase().includes(q))return false;
      if(shopOnlyOpen&&openState(shop).open!==true)return false;
      if(shopOnlyPromo&&!visiblePromotionForShop(shop.id))return false;
      return true;
    });
    list.sort((a,b)=>{
      const ar=ratingForShop(a.id),br=ratingForShop(b.id);
      if(shopSort==='rating')return (br.average-ar.average)||(br.count-ar.count);
      if(shopSort==='newest')return new Date(b.created_at||0)-new Date(a.created_at||0);
      if(shopSort==='name')return String(a.name||'').localeCompare(String(b.name||''),'th');
      if(shopSort==='distance'){
        const ad=shopDistance(a),bd=shopDistance(b);
        if(ad==null&&bd==null)return 0;
        if(ad==null)return 1;
        if(bd==null)return -1;
        return ad-bd;
      }
      const ap=visiblePromotionForShop(a.id)?1:0,bp=visiblePromotionForShop(b.id)?1:0;
      const as=(a.featured?100:0)+(ap*25)+(ar.average*10)+Math.min(ar.count,20);
      const bs=(b.featured?100:0)+(bp*25)+(br.average*10)+Math.min(br.count,20);
      return bs-as;
    });
    return list;
  }

  async function fetchFullShopsByIds(ids){
    if(!ids.length)return [];
    const {data,error}=await db.from('market_shops')
      .select('*, category:market_categories(id,name,icon)')
      .in('id',ids)
      .eq('status','approved');
    if(error)throw error;
    const byId=new Map((data||[]).map(shop=>[String(shop.id),shop]));
    return ids.map(id=>byId.get(String(id))).filter(Boolean);
  }

  async function loadFeaturedShops(){
    const featured=[...shopIndex].filter(shop=>shop.featured===true).sort((a,b)=>{
      const ar=ratingForShop(a.id),br=ratingForShop(b.id);
      const ap=visiblePromotionForShop(a.id)?1:0,bp=visiblePromotionForShop(b.id)?1:0;
      const as=(ap*25)+(ar.average*10)+Math.min(ar.count,20);
      const bs=(bp*25)+(br.average*10)+Math.min(br.count,20);
      return bs-as;
    });
    const ids=featured.slice(0,6).map(shop=>shop.id);
    featuredShops=db?await fetchFullShopsByIds(ids):DEMO.filter(shop=>shop.featured===true).slice(0,6);
    renderRecommended();
  }

  async function loadPublicShops({reset=false}={}){
    if(!db){
      shops=DEMO; shopIndex=DEMO; shopTotalCount=DEMO.length; shopPage=1;
      showNotice('กำลังแสดงข้อมูลตัวอย่าง — กรุณาใส่ Supabase URL และ Anon Key ใน config.js');
      renderShops(); renderRecommended(); return;
    }
    if(shopLoading)return;
    shopLoading=true;
    try{
      if(reset){ shops=[]; shopPage=0; }
      const ordered=orderedShopIndex();
      shopTotalCount=ordered.length;
      const start=shopPage*SHOP_PAGE_SIZE;
      const pageIds=ordered.slice(start,start+SHOP_PAGE_SIZE).map(shop=>shop.id);
      if(pageIds.length){
        const page=await fetchFullShopsByIds(pageIds);
        const existing=new Set(shops.map(shop=>String(shop.id)));
        shops=[...shops,...page.filter(shop=>!existing.has(String(shop.id)))];
        shopPage+=1;
      }
      hideNotice();
      renderShops();
      await loadFeaturedShops();
    }finally{
      shopLoading=false;
    }
  }

  async function getFullShop(shopId){
    const id=String(shopId);
    const cached=[...shops,...featuredShops,...favoriteShops].find(shop=>String(shop.id)===id);
    if(cached)return cached;
    if(!db)return DEMO.find(shop=>String(shop.id)===id)||null;
    const {data,error}=await db.from('market_shops').select('*, category:market_categories(id,name,icon)').eq('id',shopId).eq('status','approved').maybeSingle();
    if(error)throw error;
    return data||null;
  }


  function formatThaiDate(value){
    if(!value)return '';
    return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric'}).format(new Date(value));
  }

  function formatThaiDateTime(value){
    if(!value)return '';
    return new Intl.DateTimeFormat('th-TH',{
      day:'numeric',month:'short',year:'numeric',
      hour:'2-digit',minute:'2-digit',hour12:false
    }).format(new Date(value)).replace(',', ' เวลา')+' น.';
  }

  function promotionState(p){
    const now=new Date();
    const start=p.starts_at?new Date(p.starts_at):null;
    const end=p.ends_at?new Date(p.ends_at):null;
    if(p.active===false)return 'inactive';
    if(end&&end<now)return 'expired';
    if(start&&start>now)return 'upcoming';
    return 'active';
  }

  function activePromotionForShop(shopId){
    return promotions.find(p=>p.shop_id===shopId&&promotionState(p)==='active');
  }

  function visiblePromotionForShop(shopId){
    const current=promotions.find(p=>p.shop_id===shopId&&promotionState(p)==='active');
    if(current)return current;
    return promotions.find(p=>p.shop_id===shopId&&promotionState(p)==='upcoming');
  }

  function promotionTimingText(p){
    const state=promotionState(p);
    if(state==='upcoming')return p.starts_at?`เริ่ม ${formatThaiDateTime(p.starts_at)}`:'กำลังจะเริ่มเร็ว ๆ นี้';
    if(p.ends_at)return `ใช้ได้ถึง ${formatThaiDateTime(p.ends_at)}`;
    return p.starts_at?`เริ่มใช้ ${formatThaiDateTime(p.starts_at)}`:'กำลังใช้งาน';
  }


  function promotionInterval(p){
    const start=p.starts_at?new Date(p.starts_at).getTime():Date.now();
    const end=p.ends_at?new Date(p.ends_at).getTime():Number.POSITIVE_INFINITY;
    return {start,end};
  }

  function exceedsThreeConcurrent(existing,newPromo){
    const promos=[...existing.filter(p=>p.active!==false),newPromo];
    const points=[];
    promos.forEach(p=>{
      const {start,end}=promotionInterval(p);
      points.push([start,1]);
      if(Number.isFinite(end))points.push([end+1,-1]);
    });
    points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    let concurrent=0;
    for(const [,delta] of points){
      concurrent+=delta;
      if(concurrent>3)return true;
    }
    return false;
  }

  function ownerPromotionStateText(p){
    const state=promotionState(p);
    if(state==='active')return 'กำลังใช้งาน';
    if(state==='upcoming')return 'กำลังจะเริ่ม';
    if(state==='expired')return 'หมดอายุแล้ว';
    return 'ปิดใช้งาน';
  }

  function ratingForShop(shopId){
    return reviewStats[shopId]||{average:0,count:0};
  }

  function stars(value){
    const rounded=Math.round(Number(value)||0);
    return '★'.repeat(rounded)+'☆'.repeat(Math.max(0,5-rounded));
  }

  async function loadPromotions(){
    if(!db){promotions=[];renderPromotions();return;}
    const {data,error}=await db
      .from('market_promotions')
      .select('*, shop:market_shops(id,name,cover_url,status)')
      .eq('active',true)
      .order('featured',{ascending:false})
      .order('created_at',{ascending:false});
    if(error){
      console.warn('Promotions are not ready:',error.message);
      promotions=[];
    }else{
      promotions=(data||[])
        .filter(p=>p.shop?.status==='approved'&&promotionState(p)!=='expired'&&promotionState(p)!=='inactive')
        .sort((a,b)=>{
          const order={active:0,upcoming:1};
          const stateDiff=(order[promotionState(a)]??9)-(order[promotionState(b)]??9);
          if(stateDiff)return stateDiff;
          if(promotionState(a)==='upcoming')return new Date(a.starts_at||0)-new Date(b.starts_at||0);
          return Number(Boolean(b.featured))-Number(Boolean(a.featured));
        });
    }
    renderPromotions();
    renderRecommended();
  }

  async function loadReviewStats(){
    if(!db){reviewStats={};return;}
    const {data,error}=await db
      .from('market_reviews')
      .select('shop_id,rating')
      .eq('status','approved');
    if(error){
      console.warn('Reviews are not ready:',error.message);
      reviewStats={};
      return;
    }
    const grouped={};
    (data||[]).forEach(r=>{
      grouped[r.shop_id] ||= {sum:0,count:0};
      grouped[r.shop_id].sum+=Number(r.rating)||0;
      grouped[r.shop_id].count+=1;
    });
    reviewStats={};
    Object.entries(grouped).forEach(([shopId,v])=>{
      reviewStats[shopId]={average:v.count?v.sum/v.count:0,count:v.count};
    });
  }

  function promotionCard(p){
    const shopName=p.shop?.name||'ร้านค้าในตลาด';
    const image=p.image_url||p.shop?.cover_url;
    const state=promotionState(p);
    const dateText=promotionTimingText(p);
    return `<article class="promo-card ${state==='upcoming'?'upcoming':''}" data-shop-id="${esc(p.shop_id)}">
      <div class="promo-image">${image?`<img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy">`:'<span>🔥</span>'}
        ${p.discount_text?`<b>${esc(p.discount_text)}</b>`:''}
        ${state==='upcoming'?'<i class="promo-status">เร็ว ๆ นี้</i>':'<i class="promo-status active">กำลังใช้ได้</i>'}
      </div>
      <div class="promo-body">
        <small>${esc(shopName)}</small>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.description||'โปรโมชั่นพิเศษจากร้านค้าในตลาดกระทุ่มแบน')}</p>
        <div class="promo-foot"><span>⏰ ${esc(dateText)}</span><div class="promo-action-row"><button data-action="promo-details" data-promotion-id="${esc(p.id)}" data-shop-id="${esc(p.shop_id)}">ดูรายละเอียด</button><button data-action="details" data-shop-id="${esc(p.shop_id)}">ดูร้าน</button></div></div>
      </div>
    </article>`;
  }

  function renderPromotions(){
    const box=$('promotionGrid');
    if(!box)return;
    const featured=promotions.slice(0,6);
    box.innerHTML=featured.length
      ? featured.map(promotionCard).join('')
      : '<div class="empty-inline">ยังไม่มีโปรโมชั่นที่เปิดใช้งาน</div>';

    const allBtn=$('showAllPromotionsBtn');
    if(allBtn){
      allBtn.classList.toggle('hidden',promotions.length<=6);
      allBtn.textContent=`ดูโปรโมชั่นทั้งหมด (${promotions.length})`;
    }
  }

  function openAllPromotions(){
    const grid=$('allPromotionsGrid');
    const count=$('allPromotionsCount');
    if(!grid)return;
    grid.innerHTML=promotions.length
      ? promotions.map(promotionCard).join('')
      : '<div class="empty-inline">ยังไม่มีโปรโมชั่นที่เปิดใช้งาน</div>';
    if(count)count.textContent=`ทั้งหมด ${promotions.length} โปรโมชั่น`;
    openModal('allPromotionsModal');
  }

  function openPromotionDetails(promotionId){
    const p=promotions.find(item=>String(item.id)===String(promotionId));
    if(!p)return alert('ไม่พบข้อมูลโปรโมชั่นนี้');
    const shop=[...shops,...featuredShops,...favoriteShops].find(s=>String(s.id)===String(p.shop_id))||p.shop||{};
    const image=p.image_url||shop.cover_url||'';
    const state=promotionState(p);
    const stateText=state==='active'?'กำลังใช้ได้':state==='upcoming'?'เร็ว ๆ นี้':state==='expired'?'หมดอายุ':'ปิดใช้งาน';
    $('promotionDetailTitle').textContent=p.title||'รายละเอียดโปรโมชั่น';
    $('promotionDetailBody').innerHTML=`
      ${image?`<img class="promotion-detail-image" src="${esc(image)}" alt="${esc(p.title||'โปรโมชั่น')}" loading="lazy">`:''}
      <div class="promotion-detail-status ${esc(state)}">${esc(stateText)}</div>
      ${p.discount_text?`<div class="promotion-detail-discount">${esc(p.discount_text)}</div>`:''}
      <p class="promotion-detail-shop">ร้าน: <b>${esc(shop.name||'ร้านค้าในตลาด')}</b></p>
      <p class="promotion-detail-description">${esc(p.description||'ไม่มีรายละเอียดเพิ่มเติม')}</p>
      <p class="promotion-detail-time">⏰ ${esc(promotionTimingText(p))}</p>
      <div class="promotion-detail-actions">
        <button type="button" class="primary" data-action="details" data-shop-id="${esc(p.shop_id)}">ดูร้านค้า</button>
      </div>`;
    openModal('promotionDetailModal');
  }

  function recommendedShops(){
    return featuredShops.slice(0,6);
  }

  function isFavorite(shopId){ return favorites.has(String(shopId)); }

  function favoriteButton(shopId, extraClass=''){
    const active=isFavorite(shopId);
    return `<button type="button" class="favorite-btn ${active?'active':''} ${extraClass}" data-action="favorite" data-shop-id="${esc(shopId)}" aria-pressed="${active}" title="${active?'ยกเลิกร้านชื่นชอบ':'เพิ่มเป็นร้านชื่นชอบ'}">${active?'❤️':'♡'} <span>${active?'ชื่นชอบแล้ว':'ร้านชื่นชอบ'}</span></button>`;
  }

  async function loadFavorites(){
    favorites=new Set();
    if(!db||!session){ renderFavoriteList(); return; }
    const {data,error}=await db.from('market_favorites').select('shop_id').eq('user_id',session.user.id);
    if(error){ console.warn('โหลดร้านชื่นชอบไม่สำเร็จ:',error.message); return; }
    favorites=new Set((data||[]).map(x=>String(x.shop_id)));
    const ids=[...favorites];
    favoriteShops=ids.length?await fetchFullShopsByIds(ids):[];
    renderFavoriteList();
  }

  async function toggleFavorite(shopId){
    if(!session){ alert('กรุณาเข้าสู่ระบบก่อนบันทึกร้านชื่นชอบ'); openModal('authModal'); return; }
    if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');
    const id=String(shopId), active=isFavorite(id);
    if(active){
      const {error}=await db.from('market_favorites').delete().eq('user_id',session.user.id).eq('shop_id',id);
      if(error)return alert('ยกเลิกร้านชื่นชอบไม่สำเร็จ: '+error.message);
      favorites.delete(id);
    }else{
      const {error}=await db.from('market_favorites').insert({user_id:session.user.id,shop_id:id});
      if(error)return alert('บันทึกร้านชื่นชอบไม่สำเร็จ: '+error.message);
      favorites.add(id);
    }
    favoriteShops=[...favorites].length?await fetchFullShopsByIds([...favorites]):[];
    renderShops(); renderRecommended(); renderFavoriteList();
    const detailShopId=$('reviewShopId')?.value;
    if(detailShopId===id){ const holder=$('detailFavoriteHolder'); if(holder)holder.innerHTML=favoriteButton(id,'detail-favorite'); }
  }

  function renderFavoriteList(){
    const box=$('favoriteGrid'), count=$('favoriteCount');
    if(!box)return;
    if(!session){ box.innerHTML='<div class="empty-inline">กรุณาเข้าสู่ระบบเพื่อดูร้านชื่นชอบของคุณ</div>'; if(count)count.textContent=''; return; }
    const list=favoriteShops.filter(s=>isFavorite(s.id));
    box.innerHTML=list.length?list.map(s=>shopCard(s)).join(''):'<div class="empty-inline">ยังไม่มีร้านชื่นชอบ กด ♡ ที่ร้านที่คุณชอบได้เลย</div>';
    if(count)count.textContent=`${list.length} ร้าน`;
  }

  function openFavorites(){
    if(!session){ alert('กรุณาเข้าสู่ระบบก่อนดูร้านชื่นชอบ'); openModal('authModal'); return; }
    renderFavoriteList(); openModal('favoritesModal');
  }

  function renderRecommended(){
    const box=$('recommendedGrid');
    if(!box)return;
    const list=recommendedShops();
    box.innerHTML=list.length?list.map(s=>shopCard(s)).join(''):'<div class="empty-inline">ยังไม่มีร้านแนะนำ</div>';
  }

  async function openShopDetails(shopId){
    let shop=null;
    try{shop=await getFullShop(shopId);}catch(err){console.error(err);}
    if(!shop)return alert('ไม่พบข้อมูลร้านค้านี้');
    const promo=visiblePromotionForShop(shopId);
    const rating=ratingForShop(shopId);
    const go=(shop.latitude&&shop.longitude)
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${shop.latitude},${shop.longitude}`)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.address||shop.name||'ตลาดกระทุ่มแบน')}`;
    const contactButtons=[
      `<a class="detail-action go" href="${esc(go)}" target="_blank" rel="noopener noreferrer">🧭 นำทาง</a>`,
      shop.phone?`<a class="detail-action" href="tel:${esc(shop.phone)}">📞 โทรสั่ง / สอบถาม</a>`:'',
      shop.facebook?`<a class="detail-action" href="${esc(link(shop.facebook,'facebook'))}" target="_blank" rel="noopener noreferrer">Facebook</a>`:'',
      shop.line?`<a class="detail-action" href="${esc(link(shop.line,'line'))}" target="_blank" rel="noopener noreferrer">LINE</a>`:'',
      shop.tiktok?`<a class="detail-action" href="${esc(link(shop.tiktok,'tiktok'))}" target="_blank" rel="noopener noreferrer">TikTok</a>`:'',
      shop.instagram?`<a class="detail-action" href="${esc(link(shop.instagram,'instagram'))}" target="_blank" rel="noopener noreferrer">Instagram</a>`:'',
      shop.website?`<a class="detail-action" href="${esc(safeExternalUrl(shop.website))}" target="_blank" rel="noopener noreferrer">🌐 Website</a>`:'',
      shop.email?`<a class="detail-action" href="mailto:${esc(shop.email)}">✉️ Email</a>`:''
    ].filter(Boolean).join('');
    const deliveryButtons=[
      shop.lineman_url?`<a class="detail-order lineman" href="${esc(safeExternalUrl(shop.lineman_url))}" target="_blank" rel="noopener noreferrer">สั่งผ่าน LINE MAN</a>`:'',
      shop.grab_url?`<a class="detail-order grab" href="${esc(safeExternalUrl(shop.grab_url))}" target="_blank" rel="noopener noreferrer">สั่งผ่าน GrabFood</a>`:'',
      shop.shopeefood_url?`<a class="detail-order shopee" href="${esc(safeExternalUrl(shop.shopeefood_url))}" target="_blank" rel="noopener noreferrer">สั่งผ่าน ShopeeFood</a>`:''
    ].filter(Boolean).join('');
    $('detailTitle').textContent=shop.name;
    $('detailSummary').innerHTML=`
      <div id="detailFavoriteHolder" class="detail-favorite-holder">${favoriteButton(shop.id,'detail-favorite')}</div>
      ${shop.cover_url?`<img class="detail-cover" src="${esc(shop.cover_url)}" alt="${esc(shop.name)}">`:''}
      <div class="detail-rating"><b>${rating.average?rating.average.toFixed(1):'ยังไม่มีคะแนน'}</b>
      <span>${rating.count?`${stars(rating.average)} (${rating.count} รีวิว)`:'เป็นคนแรกที่รีวิวร้านนี้'}</span></div>
      <p>${esc(shop.description||'ร้านค้าในตลาดกระทุ่มแบน')}</p>
      ${shop.address?`<p class="detail-address">📍 ${esc(shop.address)}</p>`:''}
      ${promo?`<div class="detail-promo"><b>🔥 ${esc(promo.title)}</b><span>${esc(promo.description||'')}</span><small>⏰ ${esc(promotionTimingText(promo))}</small></div>`:''}
      ${deliveryButtons?`<div class="detail-order-grid">${deliveryButtons}</div>`:''}
      <div class="detail-action-grid">${contactButtons}</div>
    `;
    $('reviewShopId').value=shopId;
    $('reviewShopName').textContent=shop.name;
    closeModal('promotionDetailModal');
    openModal('shopDetailModal');
    await loadShopReviews(shopId);
  }

  async function loadShopReviews(shopId,targetId='reviewList'){
    const box=$(targetId);
    box.innerHTML='<p>กำลังโหลดรีวิว...</p>';
    if(!db){box.innerHTML='<p>ยังไม่มีรีวิว</p>';return;}

    const id=String(shopId||'').trim();
    let {data,error}=await db
      .from('market_reviews')
      .select('id,shop_id,reviewer_name,rating,comment,status,created_at')
      .eq('shop_id',id)
      .eq('status','approved')
      .order('created_at',{ascending:false})
      .limit(50);

    // Fallback สำหรับกรณี client/query ไม่คืนแถว ทั้งที่สถิติบอกว่าร้านมีรีวิว
    if(!error && (!data || !data.length) && (reviewStats[id]?.count||0)>0){
      const fallback=await db
        .from('market_reviews')
        .select('id,shop_id,reviewer_name,rating,comment,status,created_at')
        .eq('status','approved')
        .order('created_at',{ascending:false})
        .limit(500);
      if(!fallback.error){
        data=(fallback.data||[]).filter(r=>String(r.shop_id)===id).slice(0,50);
      }else{
        error=fallback.error;
      }
    }

    if(error){
      console.error('loadShopReviews failed', {shopId:id,error});
      box.innerHTML=`<p>โหลดรีวิวไม่สำเร็จ: ${esc(error.message)}</p>`;
      return;
    }
    box.innerHTML=(data||[]).length?(data||[]).map(r=>`
      <article class="review-item">
        <div><b>${esc(r.reviewer_name||'สมาชิกตลาด')}</b><span>${stars(r.rating)} ${Number(r.rating).toFixed(1)}</span></div>
        <p>${esc(r.comment||'')}</p>
        <small>${formatThaiDate(r.created_at)}</small>
      </article>`).join(''):'<p class="empty-inline">ยังไม่มีรีวิว เป็นคนแรกที่แสดงความคิดเห็นได้เลย</p>';
  }

  function toLocalDateTimeInput(value){
    if(!value)return '';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function openPromotionForm(shopId,promotion=null){
    if(!session)return openModal('authModal');
    const form=$('promotionForm');
    form.reset();
    form.elements.id.value=promotion?.id||'';
    form.elements.shop_id.value=shopId;
    form.elements.title.value=promotion?.title||'';
    form.elements.discount_text.value=promotion?.discount_text||'';
    form.elements.description.value=promotion?.description||'';
    form.elements.image_url.value=promotion?.image_url||'';
    form.elements.existing_image_url.value=promotion?.image_url||'';
    form.elements.promotion_image.value='';
    const preview=$('promotionImagePreview');
    if(preview){preview.innerHTML=promotion?.image_url?`<img src="${esc(promotion.image_url)}" alt="รูปโปรโมชั่นปัจจุบัน"><small>รูปปัจจุบัน — เลือกรูปใหม่เพื่อแทนที่</small>`:'<small>ระบบจะย่อรูปอัตโนมัติให้ไม่เกินประมาณ 900 KB</small>';}
    form.elements.starts_at.value=toLocalDateTimeInput(promotion?.starts_at);
    form.elements.ends_at.value=toLocalDateTimeInput(promotion?.ends_at);
    form.elements.active.checked=promotion ? promotion.active!==false : true;
    form.elements.featured.checked=Boolean(promotion?.featured);
    const shop=shops.find(s=>s.id===shopId);
    $('promotionShopName').textContent=shop?.name||'ร้านของฉัน';
    $('promotionFormTitle').textContent=promotion?'แก้ไขโปรโมชั่น':'เพิ่มโปรโมชั่น';
    form.querySelector('button[type=submit]').textContent=promotion?'บันทึกการแก้ไข':'เผยแพร่โปรโมชั่น';
    openModal('promotionModal');
  }

  async function editPromotion(promotionId,shopId){
    const {data,error}=await db.from('market_promotions').select('*').eq('id',promotionId).eq('owner_id',session.user.id).single();
    if(error)return alert('โหลดโปรโมชั่นไม่สำเร็จ: '+friendlyAuthError(error.message));
    closeModal('managePromotionsModal');
    openPromotionForm(shopId,data);
  }

  async function togglePromotion(promotionId,shopId,currentActive){
    const next=!currentActive;
    if(next){
      const {data:target,error:targetError}=await db.from('market_promotions').select('*').eq('id',promotionId).eq('owner_id',session.user.id).single();
      if(targetError)return alert(friendlyAuthError(targetError.message));
      const {data:existing,error:loadError}=await db.from('market_promotions').select('id,starts_at,ends_at,active').eq('shop_id',shopId).eq('owner_id',session.user.id).eq('active',true).neq('id',promotionId);
      if(loadError)return alert(friendlyAuthError(loadError.message));
      if(exceedsThreeConcurrent(existing||[],{...target,active:true}))return alert('ช่วงเวลานี้มีโปรโมชั่นใช้งานซ้อนกันครบ 3 โปรโมชั่นแล้ว กรุณาปิดหรือปรับช่วงเวลาโปรอื่นก่อน');
    }
    const {error}=await db.from('market_promotions').update({active:next}).eq('id',promotionId).eq('owner_id',session.user.id);
    if(error)return alert('เปลี่ยนสถานะไม่สำเร็จ: '+friendlyAuthError(error.message));
    await Promise.all([loadOwnerPromotions(shopId),loadPromotions()]);
    renderShops();renderRecommended();
  }

  async function duplicatePromotion(promotionId,shopId){
    const {data,error}=await db.from('market_promotions').select('*').eq('id',promotionId).eq('owner_id',session.user.id).single();
    if(error)return alert('คัดลอกโปรโมชั่นไม่สำเร็จ: '+friendlyAuthError(error.message));
    const copy={...data,title:`${data.title} (สำเนา)`,active:false,featured:false};
    delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.shop;
    const {error:insertError}=await db.from('market_promotions').insert(copy);
    if(insertError)return alert('คัดลอกโปรโมชั่นไม่สำเร็จ: '+friendlyAuthError(insertError.message));
    showNotice('คัดลอกโปรโมชั่นแล้ว โดยตั้งเป็นปิดใช้งานไว้ก่อน');
    await loadOwnerPromotions(shopId);
  }


  async function openPromotionManager(shopId){
    if(!session)return openModal('authModal');
    const shop=shops.find(s=>s.id===shopId);
    $('managePromotionShopName').textContent=shop?.name||'ร้านของฉัน';
    $('managePromotionShopId').value=shopId;
    openModal('managePromotionsModal');
    await loadOwnerPromotions(shopId);
  }

  async function loadOwnerPromotions(shopId){
    const box=$('ownerPromotionList');
    box.innerHTML='<p>กำลังโหลดโปรโมชั่น...</p>';
    const {data,error}=await db
      .from('market_promotions')
      .select('*')
      .eq('shop_id',shopId)
      .eq('owner_id',session.user.id)
      .order('created_at',{ascending:false});
    if(error){box.innerHTML=`<p class="form-message">${esc(error.message)}</p>`;return;}
    const rows=data||[];
    box.innerHTML=rows.length?rows.map(p=>`<article class="owner-promo-item" data-promotion-id="${esc(p.id)}">
      <div>
        <div class="owner-promo-title"><b>${esc(p.title)}</b><span class="owner-promo-state ${promotionState(p)}">${esc(ownerPromotionStateText(p))}</span></div>
        <p>${esc(p.description||'ไม่มีรายละเอียด')}</p>
        <small>⏰ ${esc(promotionTimingText(p))}</small>
      </div>
      <div class="owner-promo-actions">
        <button type="button" class="ghost" data-action="edit-promotion" data-promotion-id="${esc(p.id)}" data-shop-id="${esc(shopId)}">แก้ไข</button>
        <button type="button" class="ghost" data-action="toggle-promotion" data-promotion-id="${esc(p.id)}" data-shop-id="${esc(shopId)}" data-active="${p.active!==false}">${p.active!==false?'ปิดใช้งาน':'เปิดใช้งาน'}</button>
        <button type="button" class="ghost" data-action="duplicate-promotion" data-promotion-id="${esc(p.id)}" data-shop-id="${esc(shopId)}">คัดลอก</button>
        <button type="button" class="danger delete-promotion-btn" data-action="delete-promotion" data-promotion-id="${esc(p.id)}" data-shop-id="${esc(shopId)}">ลบ</button>
      </div>
    </article>`).join(''):'<div class="empty-inline">ร้านนี้ยังไม่มีโปรโมชั่น</div>';
  }

  async function deletePromotion(promotionId,shopId){
    if(!confirm('ต้องการลบโปรโมชั่นนี้ใช่หรือไม่? เมื่อลบแล้วจะกู้คืนไม่ได้'))return;
    const {data:promotion}=await db.from('market_promotions').select('image_url').eq('id',promotionId).eq('owner_id',session.user.id).maybeSingle();
    const {error}=await db
      .from('market_promotions')
      .delete()
      .eq('id',promotionId)
      .eq('owner_id',session.user.id);
    if(error)return alert('ลบโปรโมชั่นไม่สำเร็จ: '+friendlyAuthError(error.message));
    if(promotion?.image_url)await removeStoredImage(promotion.image_url,'promotion-images');
    showNotice('ลบโปรโมชั่นและรูปภาพเรียบร้อยแล้ว');
    await Promise.all([loadOwnerPromotions(shopId),loadPromotions()]);
    renderShops();renderRecommended();
  }

  async function submitPromotion(ev){
    ev.preventDefault();
    if(!db||!session)return;
    const form=ev.currentTarget,fd=new FormData(form);
    const promotionId=String(fd.get('id')||'');
    const shopId=String(fd.get('shop_id')||'');
    const imageFile=fd.get('promotion_image');
    const previousImageUrl=String(fd.get('existing_image_url')||'');
    const payload={
      shop_id:shopId,
      owner_id:session.user.id,
      title:String(fd.get('title')||'').trim(),
      description:fd.get('description')||null,
      discount_text:fd.get('discount_text')||null,
      image_url:fd.get('image_url')||previousImageUrl||null,
      starts_at:fd.get('starts_at')?new Date(fd.get('starts_at')).toISOString():new Date().toISOString(),
      ends_at:fd.get('ends_at')?new Date(fd.get('ends_at')).toISOString():null,
      active:form.elements.active.checked,
      featured:form.elements.featured.checked
    };
    const btn=form.querySelector('button[type=submit]');
    btn.disabled=true;btn.textContent='กำลังบันทึก...';
    try{
      const {data:existing,error:loadError}=await db
        .from('market_promotions')
        .select('id,starts_at,ends_at,active')
        .eq('shop_id',shopId)
        .eq('owner_id',session.user.id)
        .eq('active',true)
        .neq('id',promotionId||'00000000-0000-0000-0000-000000000000');
      if(loadError)throw loadError;
      if(payload.active&&exceedsThreeConcurrent(existing||[],payload)){
        throw new Error('ร้านหนึ่งสามารถมีโปรโมชั่นที่มีช่วงเวลาใช้งานซ้อนกันได้สูงสุด 3 โปรโมชั่น กรุณาปรับวันเริ่มหรือวันสิ้นสุดของโปรนี้');
      }
      let uploadedImageUrl='';
      if(imageFile&&imageFile.size){
        uploadedImageUrl=await uploadCompressedImage(imageFile,'promotion-images',`${session.user.id}/${shopId}`,{maxWidth:1600,maxHeight:1200,maxBytes:900*1024});
        payload.image_url=uploadedImageUrl;
      }
      const result=promotionId
        ? await db.from('market_promotions').update(payload).eq('id',promotionId).eq('owner_id',session.user.id)
        : await db.from('market_promotions').insert(payload);
      if(result.error){if(uploadedImageUrl)await removeStoredImage(uploadedImageUrl,'promotion-images');throw result.error;}
      if(uploadedImageUrl&&previousImageUrl&&uploadedImageUrl!==previousImageUrl)await removeStoredImage(previousImageUrl,'promotion-images');
      closeModal('promotionModal');form.reset();
      showNotice(promotionId?'แก้ไขโปรโมชั่นเรียบร้อยแล้ว':'เพิ่มโปรโมชั่นแล้ว และแสดงบนหน้าเว็บไซต์ทันที');
      await loadPromotions();
      if($('managePromotionShopId').value===shopId)await loadOwnerPromotions(shopId);
    }catch(err){alert('เพิ่มโปรโมชั่นไม่สำเร็จ: '+friendlyAuthError(err.message));}
    finally{btn.disabled=false;btn.textContent='เผยแพร่โปรโมชั่น';}
  }

  async function submitReview(ev){
    ev.preventDefault();
    if(!db)return;
    if(!session){
      closeModal('reviewModal');
      openModal('authModal');
      return alert('กรุณาเข้าสู่ระบบก่อนเขียนรีวิว');
    }
    const form=ev.currentTarget,fd=new FormData(form);
    const shopId=String(fd.get('shop_id')||'');
    const payload={
      shop_id:shopId,
      user_id:session.user.id,
      reviewer_name:profile?.display_name||session.user.email?.split('@')[0]||'สมาชิกตลาด',
      rating:Number(fd.get('rating')),
      comment:String(fd.get('comment')||'').trim(),
      status:'approved'
    };
    const btn=form.querySelector('button[type=submit]');
    btn.disabled=true;btn.textContent='กำลังส่งรีวิว...';
    try{
      const {error}=await db.from('market_reviews').upsert(payload,{onConflict:'shop_id,user_id'});
      if(error)throw error;
      closeModal('reviewModal');form.reset();
      showNotice('บันทึกรีวิวของคุณแล้ว ขอบคุณที่ช่วยแนะนำร้านในชุมชน');
      await loadReviewStats();
      await loadShopReviews(shopId);
      renderShops();renderRecommended();
    }catch(err){alert('ส่งรีวิวไม่สำเร็จ: '+friendlyAuthError(err.message));}
    finally{btn.disabled=false;btn.textContent='ส่งรีวิว';}
  }


  function validCoordinates(shop){
    return Number.isFinite(Number(shop?.latitude)) && Number.isFinite(Number(shop?.longitude));
  }

  function distanceKm(lat1, lon1, lat2, lon2){
    const toRad=value=>Number(value)*Math.PI/180;
    const earth=6371;
    const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
    const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return earth*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }

  function shopDistance(shop){
    if(!userLocation||!validCoordinates(shop))return null;
    return distanceKm(userLocation.lat,userLocation.lng,Number(shop.latitude),Number(shop.longitude));
  }

  function formatDistance(km){
    if(km==null||!Number.isFinite(km))return '';
    if(km<1)return `${Math.max(1,Math.round(km*1000))} เมตร`;
    return `${km.toFixed(km<10?1:0)} กม.`;
  }

  function showUserLocation(position,{centerMap=true}={}){
    const lat=position.coords.latitude, lng=position.coords.longitude, accuracy=position.coords.accuracy||0;
    userLocation={lat,lng,accuracy};
    if(userMarker)map.removeLayer(userMarker);
    if(userAccuracyCircle)map.removeLayer(userAccuracyCircle);
    userMarker=L.circleMarker([lat,lng],{radius:10,color:'#fff',weight:3,fillColor:'#2677ff',fillOpacity:1}).addTo(map).bindPopup('ตำแหน่งปัจจุบันของคุณ');
    userAccuracyCircle=L.circle([lat,lng],{radius:accuracy,color:'#2677ff',weight:1,fillColor:'#2677ff',fillOpacity:.08}).addTo(map);
    if(centerMap){map.setView([lat,lng],17);userMarker.openPopup();$('map').scrollIntoView({behavior:'smooth',block:'center'});}
    const option=$('shopSort')?.querySelector('option[value="distance"]');
    if(option)option.disabled=false;
    renderShops();
  }

  function requestUserLocation({sortNearby=false}={}){
    if(!navigator.geolocation)return alert('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    const btn=$('nearBtn');
    const old=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='กำลังหาตำแหน่ง...';}
    navigator.geolocation.getCurrentPosition(
      position=>{
        showUserLocation(position);
        if(sortNearby){shopSort='distance';$('shopSort').value='distance';resetShopList();}
        if(btn){btn.disabled=false;btn.textContent=old||'📍 ร้านใกล้ฉัน';}
      },
      error=>{
        if(btn){btn.disabled=false;btn.textContent=old||'📍 ร้านใกล้ฉัน';}
        const message=error.code===1?'กรุณาอนุญาตให้เว็บไซต์ใช้ตำแหน่งของคุณ':error.code===2?'ไม่พบตำแหน่งปัจจุบัน กรุณาเปิด GPS หรือ Location Services':'ค้นหาตำแหน่งนานเกินไป กรุณาลองใหม่';
        alert(message);
      },
      {enableHighAccuracy:true,timeout:12000,maximumAge:60000}
    );
  }

  function filteredShops(){
    return shops;
  }

  async function resetShopList(){
    await loadPublicShops({reset:true});
  }

  function shopCard(s, dashboard=false){
    const category=s.category?.name||'ร้านค้า';
    const go=s.latitude&&s.longitude?`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name+' ตลาดกระทุ่มแบน')}`;
    const cover=s.cover_url?`<img src="${esc(s.cover_url)}" alt="${esc(s.name)}" loading="lazy" onerror="this.remove()">`:'';
    const status=dashboard?`<span class="status-pill ${s.status==='approved'?'approved':''}">${s.status==='approved'?'เผยแพร่แล้ว':s.status==='rejected'?'ไม่อนุมัติ':'รอตรวจสอบ'}</span>`:'';
    const state=openState(s), loc=[s.zone,s.lock_number,s.floor].filter(Boolean).join(' • '), badges=serviceBadges(s);
    const rating=ratingForShop(s.id), promo=visiblePromotionForShop(s.id), distance=shopDistance(s);
    const distanceLine=distance==null?'':`<div class="distance-line">📏 ห่างจากคุณ ${esc(formatDistance(distance))}</div>`;
    return `<article class="card" data-id="${esc(s.id)}"><div class="card-img">${cover}<span class="tag">${esc(category)}</span>${promo?`<span class="promo-ribbon ${promotionState(promo)==='upcoming'?'upcoming':''}">🔥 ${esc(promo.discount_text||'มีโปรโมชั่น')}<small>${esc(promotionTimingText(promo))}</small></span>`:''}</div><div class="card-body"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h3>${esc(s.name)}</h3>${status}</div><div class="rating-line"><span>${stars(rating.average)}</span><b>${rating.count?rating.average.toFixed(1):'ใหม่'}</b><small>${rating.count?`(${rating.count})`:'ยังไม่มีรีวิว'}</small></div><p>${esc(s.description||'ร้านค้าในตลาดกระทุ่มแบน')}</p><div class="meta">📍 ${esc(s.address||'ตลาดกระทุ่มแบน')}</div>${loc?`<div class="location-line">🏪 ${esc(loc)}</div>`:''}${distanceLine}<div class="open-badge ${state.open===false?'closed':''}">${state.open===true?'🟢':state.open===false?'🔴':'🕒'} ${esc(state.text)}</div>${badges?`<div class="service-badges">${badges}</div>`:''}<div class="links"><a class="go" href="${go}" target="_blank" rel="noopener noreferrer">🧭 นำทาง</a>${s.phone?`<a href="tel:${esc(s.phone)}">📞 โทร</a>`:''}${s.email?`<a href="mailto:${esc(s.email)}">✉️ Email</a>`:''}${s.facebook?`<a href="${esc(link(s.facebook,'facebook'))}" target="_blank" rel="noopener noreferrer">Facebook</a>`:''}${s.line?`<a href="${esc(link(s.line,'line'))}" target="_blank" rel="noopener noreferrer">LINE</a>`:''}${s.tiktok?`<a href="${esc(link(s.tiktok,'tiktok'))}" target="_blank" rel="noopener noreferrer">TikTok</a>`:''}${s.instagram?`<a href="${esc(link(s.instagram,'instagram'))}" target="_blank" rel="noopener noreferrer">Instagram</a>`:''}${s.website?`<a href="${esc(safeExternalUrl(s.website))}" target="_blank" rel="noopener noreferrer">🌐 Website</a>`:''}</div>${(s.lineman_url||s.grab_url||s.shopeefood_url)?`<div class="delivery-links">${s.lineman_url?`<a class="order-btn lineman" href="${esc(safeExternalUrl(s.lineman_url))}" target="_blank" rel="noopener noreferrer">สั่ง LINE MAN</a>`:''}${s.grab_url?`<a class="order-btn grab" href="${esc(safeExternalUrl(s.grab_url))}" target="_blank" rel="noopener noreferrer">สั่ง GrabFood</a>`:''}${s.shopeefood_url?`<a class="order-btn shopee" href="${esc(safeExternalUrl(s.shopeefood_url))}" target="_blank" rel="noopener noreferrer">สั่ง ShopeeFood</a>`:''}</div>`:''}<div class="community-actions"><button data-action="details">ดูรายละเอียด</button><button data-action="review">⭐ รีวิว</button>${favoriteButton(s.id)}</div>${dashboard?`<div class="admin-actions"><button data-action="edit">แก้ไขร้าน</button><button class="manage-promo-btn" data-action="manage-promotions">⚙️ จัดการโปรโมชั่น</button><button data-action="promotion">+ เพิ่มโปรโมชั่น</button>${profile?.role==='admin'&&s.status!=='approved'?'<button data-action="approve">อนุมัติ</button>':''}${profile?.role==='admin'?`<button data-action="feature">${s.featured?'ยกเลิกแนะนำ':'แนะนำร้าน'}</button><button data-action="reject">ไม่อนุมัติ</button>`:''}</div>`:''}</div></article>`;
  }

  function renderShops(){
    const shown=shops;
    $('shopGrid').innerHTML=shown.map(s=>shopCard(s)).join('');
    $('resultCount').textContent=`พบ ${shopTotalCount} ร้าน • แสดง ${shown.length} ร้าน`;
    $('shopCount').textContent=shopIndex.length;
    $('emptyState').classList.toggle('hidden',shopTotalCount>0);

    const moreBtn=$('loadMoreBtn');
    if(moreBtn){
      moreBtn.classList.toggle('hidden',shown.length>=shopTotalCount||shopLoading);
      moreBtn.disabled=shopLoading;
      moreBtn.textContent=shopLoading?'กำลังโหลด...':`ดูร้านเพิ่มเติม (${Math.min(SHOP_PAGE_SIZE,Math.max(0,shopTotalCount-shown.length))} ร้าน)`;
    }

    renderPins(shopIndex);
  }

  function renderPins(list){
    if(mapMarkerLayer)mapMarkerLayer.clearLayers();
    miniMarkers.forEach(m=>miniMap.removeLayer(m));
    mapMarkers=[];
    miniMarkers=[];
    const valid=filteredMapShops(list).filter(s=>Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude)));
    valid.forEach(shop=>{
      const ll=[+shop.latitude,+shop.longitude];
      const marker=L.marker(ll,{icon:shopMarkerIcon(shop)}).bindPopup(markerPopup(shop),{maxWidth:290});
      mapMarkers.push(marker);
      mapMarkerLayer.addLayer(marker);
      const miniColor=shop.featured?'#d59a00':visiblePromotionForShop(shop.id)?'#b31217':'#d7262e';
      const mini=L.circleMarker(ll,{radius:8,color:'#fff',weight:2,fillColor:miniColor,fillOpacity:1}).bindPopup(`<b>${esc(shop.name)}</b><br>${esc(shop.category?.name||'ร้านค้า')}`);
      miniMarkers.push(mini.addTo(miniMap));
    });
    $('mapResultCount') && ($('mapResultCount').textContent=`แสดง ${valid.length} ร้านบนแผนที่`);
    if(valid.length>1){
      const bounds=L.latLngBounds(valid.map(s=>[+s.latitude,+s.longitude]));
      map.fitBounds(bounds.pad(.22));
      miniMap.fitBounds(bounds.pad(.22));
    }else if(valid.length===1){
      map.setView([+valid[0].latitude,+valid[0].longitude],17);
      miniMap.setView([+valid[0].latitude,+valid[0].longitude],16);
    }
  }

  async function refreshAuth(){
    if(!db){ updateAccountUI(); return; }
    const {data}=await db.auth.getSession(); session=data.session;
    profile=null;
    if(session){const {data:p}=await db.from('market_profiles').select('*').eq('id',session.user.id).maybeSingle();profile=p;}
    updateAccountUI();
    await loadFavorites();
    renderShops(); renderRecommended();
    if(session) await loadDashboard();
  }

  function updateAccountUI(){
    $('accountBtn').textContent=session?(profile?.display_name||session.user.email):'เข้าสู่ระบบ';
    $('dashboard').classList.toggle('hidden',!session);
    const favBtn=$('favoritesBtn'); if(favBtn)favBtn.classList.toggle('hidden',!session);
  }

  async function loadDashboard(){
    if(!db||!session)return;
    const {data:mine,error}=await db.from('market_shops').select('*, category:market_categories(id,name,icon)').eq('owner_id',session.user.id).order('created_at',{ascending:false});
    if(error) showNotice(error.message,true);
    $('myShopGrid').innerHTML=(mine||[]).length?(mine||[]).map(s=>shopCard(s,true)).join(''):'<p>ยังไม่มีร้านในบัญชีนี้</p>';
    $('adminPanel').classList.toggle('hidden',profile?.role!=='admin');
    if(profile?.role==='admin'){
      const {data:pending}=await db.from('market_shops').select('*, category:market_categories(id,name,icon)').eq('status','pending').order('created_at');
      $('pendingGrid').innerHTML=(pending||[]).length?(pending||[]).map(s=>shopCard(s,true)).join(''):'<p>ไม่มีร้านรออนุมัติ</p>';
    }
  }

  async function uploadCover(file, shopId){
    return uploadCompressedImage(file,'shop-images',`${session.user.id}/${shopId}`,{maxWidth:1600,maxHeight:1600,maxBytes:900*1024});
  }

  async function submitShop(ev){
    ev.preventDefault();
    if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase ใน config.js');
    if(!session){closeModal('shopModal');openModal('authModal');return;}
    const form=ev.currentTarget, fd=new FormData(form);
    const existingId=String(fd.get('id')||'').trim();
    const id=existingId||crypto.randomUUID();
    const file=fd.get('cover');
    const existingShop=existingId?shops.find(s=>s.id===existingId):null;
    const oldCoverUrl=existingShop?.cover_url||'';
    const payload={name:String(fd.get('name')||'').trim(),category_id:fd.get('category_id'),description:fd.get('description')||null,address:fd.get('address')||null,zone:fd.get('zone')||null,lock_number:fd.get('lock_number')||null,floor:fd.get('floor')||null,landmark:fd.get('landmark')||null,phone:fd.get('phone')||null,email:fd.get('email')||null,line:fd.get('line')||null,facebook:fd.get('facebook')||null,tiktok:fd.get('tiktok')||null,instagram:fd.get('instagram')||null,website:fd.get('website')||null,latitude:fd.get('latitude')?Number(fd.get('latitude')):null,longitude:fd.get('longitude')?Number(fd.get('longitude')):null,opening_hours:readOpeningHours(form),temporarily_closed:form.elements.temporarily_closed.checked,open_24_hours:form.elements.open_24_hours.checked,delivery:form.elements.delivery.checked,lineman:form.elements.lineman.checked,grab:form.elements.grab.checked,shopeefood:form.elements.shopeefood.checked,lineman_url:fd.get('lineman_url')||null,grab_url:fd.get('grab_url')||null,shopeefood_url:fd.get('shopeefood_url')||null,qr_payment:form.elements.qr_payment.checked,card_payment:form.elements.card_payment.checked,parking:form.elements.parking.checked,pet_friendly:form.elements.pet_friendly.checked,wheelchair_accessible:form.elements.wheelchair_accessible.checked,owner_id:session.user.id};
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='กำลังบันทึก...';
    try{
      if(file&&file.size)payload.cover_url=await uploadCover(file,id);
      const result=existingId
        ? await db.from('market_shops').update(payload).eq('id',existingId).eq('owner_id',session.user.id)
        : await db.from('market_shops').insert({...payload,id,status:'pending'});
      if(result.error){if(payload.cover_url)await removeStoredImage(payload.cover_url,'shop-images');throw result.error;}
      if(payload.cover_url&&oldCoverUrl&&payload.cover_url!==oldCoverUrl)await removeStoredImage(oldCoverUrl,'shop-images');
      form.reset();closeModal('shopModal');
      showNotice(existingId?'บันทึกการแก้ไขแล้ว สถานะการอนุมัติเดิมยังคงอยู่':'เพิ่มร้านแล้ว และกำลังรอแอดมินตรวจสอบ');
      await loadShopIndex();
      await Promise.all([loadDashboard(),loadPublicShops({reset:true})]);
    }catch(err){alert('บันทึกไม่สำเร็จ: '+friendlyAuthError(err.message));}
    finally{btn.disabled=false;btn.textContent='บันทึกข้อมูลร้าน';}
  }

  async function editShop(id){
    const {data,error}=await db.from('market_shops').select('*').eq('id',id).single();if(error)return alert(error.message);
    const f=$('shopForm');Object.entries(data).forEach(([k,v])=>{if(!f.elements[k]||k==='cover'||k==='opening_hours')return;if(f.elements[k].type==='checkbox')f.elements[k].checked=Boolean(v);else f.elements[k].value=v??'';});fillOpeningHours(f,data.opening_hours||{});$('shopFormTitle').textContent='แก้ไขข้อมูลร้าน';openModal('shopModal');
  }
  async function setFeatured(id,featured){
    const {error}=await db.from('market_shops').update({featured}).eq('id',id);
    if(error)return alert(error.message);
    await loadShopIndex();
      await Promise.all([loadDashboard(),loadPublicShops({reset:true})]);
    renderRecommended();
  }

  async function setStatus(id,status){
    if(!db||!session)return alert('กรุณาเข้าสู่ระบบก่อน');
    const label=status==='approved'?'อนุมัติร้าน':status==='rejected'?'ไม่อนุมัติร้าน':'อัปเดตสถานะ';
    const {data,error}=await db
      .from('market_shops')
      .update({status})
      .eq('id',id)
      .select('id,name,status')
      .maybeSingle();
    if(error)return alert(`${label}ไม่สำเร็จ: ${friendlyAuthError(error.message)}`);
    if(!data||data.status!==status)return alert(`${label}ไม่สำเร็จ ระบบไม่ได้เปลี่ยนสถานะ กรุณาตรวจสอบสิทธิ์ Admin และ RLS`);
    showNotice(`${label}สำเร็จ: ${data.name}`);
    await loadShopIndex();
      await Promise.all([loadDashboard(),loadPublicShops({reset:true})]);
  }

  function isRecoveryLink(){
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
    const query=new URLSearchParams(window.location.search);
    return hash.get('type')==='recovery'||query.get('type')==='recovery'||query.has('code');
  }

  async function handleRecoveryLink(){
    if(!db||!isRecoveryLink())return;
    await new Promise(resolve=>setTimeout(resolve,150));
    openModal('resetPasswordModal');
  }

  function closeVisibleModal(){
    const visible=[...document.querySelectorAll('.modal:not(.hidden)')].pop();
    if(!visible)return false;
    closeModal(visible.id);
    return true;
  }

  function goHome(){
    document.querySelectorAll('.modal:not(.hidden)').forEach(modal=>closeModal(modal.id));
    history.replaceState(null,'',window.location.pathname+window.location.search);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function goBack(){
    if(closeVisibleModal())return;
    if(window.scrollY>160){
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    if(history.length>1)history.back();
    else goHome();
  }

  function bindEvents(){
    document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>closeModal(x.dataset.close)));
    $('floatingHomeBtn')?.addEventListener('click',goHome);
    $('floatingBackBtn')?.addEventListener('click',goBack);
    $('accountBtn').addEventListener('click',()=>session?$('dashboard').scrollIntoView({behavior:'smooth'}):openModal('authModal'));
    $('addShopBtn').addEventListener('click',()=>{if(!session)return openModal('authModal');$('shopForm').reset();fillOpeningHours($('shopForm'),{});$('shopFormTitle').textContent='เพิ่มร้านของฉัน';openModal('shopModal');});
    let searchTimer=null;
    $('searchBtn').addEventListener('click',()=>resetShopList());
    $('searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>resetShopList(),250);});
    $('authForm').addEventListener('submit',async ev=>{
      ev.preventDefault();
      if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');
      const form=ev.currentTarget;
      if(!form.reportValidity())return;
      const fd=new FormData(form);
      const email=String(fd.get('email')||'').trim();
      const password=String(fd.get('password')||'');
      if(!email||password.length<6)return alert('กรุณากรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัว');
      const btn=form.querySelector('button[type=submit]');
      btn.disabled=true;btn.textContent='กำลังเข้าสู่ระบบ...';
      try{
        const {error}=await db.auth.signInWithPassword({email,password});
        if(error)throw error;
        closeModal('authModal');
        await refreshAuth();
      }catch(err){alert('เข้าสู่ระบบไม่สำเร็จ: '+friendlyAuthError(err.message));}
      finally{btn.disabled=false;btn.textContent='เข้าสู่ระบบ';}
    });
    $('signUpBtn').addEventListener('click',async()=>{
      if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');
      const form=$('authForm');
      if(!form.reportValidity())return;
      const fd=new FormData(form);
      const email=String(fd.get('email')||'').trim();
      const password=String(fd.get('password')||'');
      if(!email||password.length<6)return alert('กรุณากรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัว');
      const btn=$('signUpBtn');
      btn.disabled=true;btn.textContent='กำลังสมัคร...';
      try{
        const {data,error}=await db.auth.signUp({
          email,
          password,
          options:{emailRedirectTo:window.location.origin}
        });
        if(error)throw error;
        if(data.session){
          alert('สมัครสมาชิกสำเร็จ และเข้าสู่ระบบแล้ว');
          closeModal('authModal');
          await refreshAuth();
        }else{
          alert('สมัครสมาชิกสำเร็จ กรุณาเปิดอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ');
        }
      }catch(err){alert('สมัครสมาชิกไม่สำเร็จ: '+friendlyAuthError(err.message));}
      finally{btn.disabled=false;btn.textContent='สมัครสมาชิก';}
    });
    $('forgotPasswordBtn').addEventListener('click',async()=>{
      if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');
      const form=$('authForm');
      const email=String(new FormData(form).get('email')||'').trim();
      if(!email)return alert('กรุณากรอกอีเมลก่อนกดลืมรหัสผ่าน');
      const btn=$('forgotPasswordBtn');
      btn.disabled=true; btn.textContent='กำลังส่งอีเมล...';
      try{
        const resetRedirect=`${window.location.origin}${window.location.pathname}`;
        const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:resetRedirect});
        if(error)throw error;
        alert('ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว กรุณาตรวจสอบอีเมล');
      }catch(err){alert('ส่งอีเมลไม่สำเร็จ: '+friendlyAuthError(err.message));}
      finally{btn.disabled=false;btn.textContent='ลืมรหัสผ่าน';}
    });
    $('resetPasswordForm').addEventListener('submit',async ev=>{
      ev.preventDefault();
      if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');
      const form=ev.currentTarget, fd=new FormData(form);
      const password=String(fd.get('new_password')||''), confirm=String(fd.get('confirm_password')||'');
      if(password.length<6)return alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัว');
      if(password!==confirm)return alert('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='กำลังบันทึก...';
      try{
        const {error}=await db.auth.updateUser({password});
        if(error)throw error;
        alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่');
        form.reset();closeModal('resetPasswordModal');
        history.replaceState(null,'',window.location.pathname);
        await db.auth.signOut();session=null;profile=null;updateAccountUI();openModal('authModal');
      }catch(err){alert('เปลี่ยนรหัสผ่านไม่สำเร็จ: '+friendlyAuthError(err.message));}
      finally{btn.disabled=false;btn.textContent='บันทึกรหัสผ่านใหม่';}
    });
    $('signOutBtn').addEventListener('click',async()=>{
      if(!db)return;
      const {error}=await db.auth.signOut();
      if(error)return alert('ออกจากระบบไม่สำเร็จ: '+friendlyAuthError(error.message));
      session=null;profile=null;updateAccountUI();
      await loadPublicShops({reset:true});
      window.scrollTo({top:0,behavior:'smooth'});
    });
    const promotionImageInput=document.querySelector('#promotionForm input[name="promotion_image"]');
    if(promotionImageInput){
      promotionImageInput.addEventListener('change',ev=>previewPromotionImage(ev.target.files?.[0]));
    }
    $('shopForm').addEventListener('submit',submitShop);
    $('promotionForm').addEventListener('submit',submitPromotion);
    $('reviewForm').addEventListener('submit',submitReview);
    $('openReviewBtn').addEventListener('click',()=>{closeModal('shopDetailModal');openModal('reviewModal');});
    $('showAllPromotionsBtn').addEventListener('click',openAllPromotions);
    $('loadMoreBtn').addEventListener('click',()=>loadPublicShops());
    $('shopSort').addEventListener('change',ev=>{
      shopSort=ev.target.value;
      resetShopList();
    });
    $('onlyOpenBtn').addEventListener('click',ev=>{
      shopOnlyOpen=!shopOnlyOpen;
      ev.currentTarget.classList.toggle('active',shopOnlyOpen);
      ev.currentTarget.setAttribute('aria-pressed',String(shopOnlyOpen));
      resetShopList();
    });
    $('onlyPromoBtn').addEventListener('click',ev=>{
      shopOnlyPromo=!shopOnlyPromo;
      ev.currentTarget.classList.toggle('active',shopOnlyPromo);
      ev.currentTarget.setAttribute('aria-pressed',String(shopOnlyPromo));
      resetShopList();
    });
    $('nearBtn').addEventListener('click',()=>requestUserLocation({sortNearby:true}));
    $('favoritesBtn')?.addEventListener('click',openFavorites);
    const locateMapBtn=$('locateMapBtn');
    if(locateMapBtn)locateMapBtn.addEventListener('click',()=>userLocation?showUserLocation({coords:{latitude:userLocation.lat,longitude:userLocation.lng,accuracy:userLocation.accuracy}}):requestUserLocation());
    document.addEventListener('click',ev=>{
      const toggleButton=ev.target.closest('[data-password-toggle]');
      if(toggleButton){
        const input=toggleButton.closest('.password-field')?.querySelector('input');
        if(input){
          const show=input.type==='password';
          input.type=show?'text':'password';
          toggleButton.textContent=show?'🙈':'👁️';
          toggleButton.setAttribute('aria-label',show?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน');
          toggleButton.title=show?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน';
          input.focus({preventScroll:true});
        }
        return;
      }
      const mapFilterButton=ev.target.closest('[data-map-filter]');
      if(mapFilterButton){
        mapFilterMode=mapFilterButton.dataset.mapFilter;
        mapCategoryFilter='all';
        renderMapFilters();
        renderPins(shopIndex);
        return;
      }
      const mapCategoryButton=ev.target.closest('[data-map-category]');
      if(mapCategoryButton){
        mapFilterMode='all';
        mapCategoryFilter=mapCategoryButton.dataset.mapCategory;
        renderMapFilters();
        renderPins(shopIndex);
        return;
      }
      const action=ev.target.dataset.action;
      const explicitShopId=ev.target.dataset.shopId;
      const card=ev.target.closest('.card[data-id]');
      const shopId=explicitShopId||card?.dataset.id;
      if(!action||!shopId)return;
      if(action==='favorite'){toggleFavorite(shopId);return;}
      if(action==='edit')editShop(shopId);
      if(action==='approve')setStatus(shopId,'approved');
      if(action==='reject')setStatus(shopId,'rejected');
      if(action==='feature'){
        const shop=shops.find(s=>s.id===shopId);
        setFeatured(shopId,!shop?.featured);
      }
      if(action==='promotion')openPromotionForm(shopId);
      if(action==='manage-promotions')openPromotionManager(shopId);
      if(action==='edit-promotion')editPromotion(ev.target.dataset.promotionId,shopId);
      if(action==='toggle-promotion')togglePromotion(ev.target.dataset.promotionId,shopId,ev.target.dataset.active==='true');
      if(action==='duplicate-promotion')duplicatePromotion(ev.target.dataset.promotionId,shopId);
      if(action==='delete-promotion')deletePromotion(ev.target.dataset.promotionId,shopId);
      if(action==='promo-details')openPromotionDetails(ev.target.dataset.promotionId);
      if(action==='details'){closeModal('promotionDetailModal');openShopDetails(shopId);}
      if(action==='review'){
        $('reviewShopId').value=shopId;
        $('reviewShopName').textContent=[...shops,...shopIndex].find(s=>String(s.id)===String(shopId))?.name||'ร้านค้า';
        openModal('reviewModal');
        loadShopReviews(shopId,'reviewModalList');
      }
    });
    if(db)db.auth.onAuthStateChange((event)=>{
      if(event==='PASSWORD_RECOVERY')setTimeout(()=>openModal('resetPasswordModal'),0);
      setTimeout(refreshAuth,0);
    });
  }

  async function start(){
    renderHoursEditor();initMaps();bindEvents();
    try{await loadCategories();await loadReviewStats();await loadPromotions();await loadShopIndex();await loadPublicShops({reset:true});renderShops();renderRecommended();await refreshAuth();await handleRecoveryLink();}
    catch(err){console.error(err);showNotice('เกิดข้อผิดพลาด: '+err.message,true);}
  }
  start();
})();
