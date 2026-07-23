(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(
    cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('PASTE_') &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('PASTE_')
  );
  const db = configured ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const DEMO = [{id:'demo',name:'Snowtee ตลาดกระทุ่มแบน',description:'เครื่องดื่ม ไอศกรีมซอฟต์เสิร์ฟ และเบเกอรี่ บรรยากาศริมคลอง',category:{name:'เครื่องดื่ม'},address:'ตลาดกระทุ่มแบน จังหวัดสมุทรสาคร',phone:'0642211876',facebook:'https://facebook.com/snowtee68',line:'snowtee68',latitude:13.6549,longitude:100.2639,status:'approved',featured:true,cover_url:null}];

  let shops = [], categories = [], currentCategory = 'all', session = null, profile = null;
  let map, miniMap, mapMarkers = [], miniMarkers = [];
  const $ = id => document.getElementById(id);

  const esc = (value='') => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const link = (value, type) => {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (type === 'facebook') return `https://facebook.com/${value.replace(/^@/,'')}`;
    if (type === 'line') return `https://line.me/ti/p/~${value.replace(/^@/,'')}`;
    if (type === 'tiktok') return `https://www.tiktok.com/@${value.replace(/^@/,'')}`;
    return `https://${value}`;
  };
  const showNotice = (text, isError=false) => { const n=$('notice'); n.textContent=text; n.classList.remove('hidden'); n.style.background=isError?'#ffe5e5':'#fff4d7'; };
  const hideNotice = () => $('notice').classList.add('hidden');
  const openModal = id => { $(id).classList.remove('hidden'); document.body.style.overflow='hidden'; };
  const closeModal = id => { $(id).classList.add('hidden'); document.body.style.overflow=''; };

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

  function initMaps(){
    const center=[13.6549,100.2639], tiles='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    map=L.map('map').setView(center,16);
    miniMap=L.map('miniMap',{zoomControl:false,attributionControl:false}).setView(center,16);
    L.tileLayer(tiles,{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    L.tileLayer(tiles).addTo(miniMap);
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
    box.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{box.querySelectorAll('button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');currentCategory=btn.dataset.category;renderShops();}));
  }

  async function loadPublicShops(){
    if(!db){ shops=DEMO; showNotice('กำลังแสดงข้อมูลตัวอย่าง — กรุณาใส่ Supabase URL และ Anon Key ใน config.js'); renderShops(); return; }
    const {data,error}=await db.from('market_shops').select('*, category:market_categories(id,name,icon)').eq('status','approved').order('featured',{ascending:false}).order('created_at',{ascending:false});
    if(error) throw error;
    shops=data||[]; hideNotice(); renderShops();
  }

  function filteredShops(){
    const q=$('searchInput').value.trim().toLowerCase();
    return shops.filter(s => (currentCategory==='all'||s.category_id===currentCategory) && (!q||[s.name,s.description,s.address,s.category?.name].filter(Boolean).join(' ').toLowerCase().includes(q)));
  }

  function shopCard(s, dashboard=false){
    const category=s.category?.name||'ร้านค้า';
    const go=s.latitude&&s.longitude?`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name+' ตลาดกระทุ่มแบน')}`;
    const cover=s.cover_url?`<img src="${esc(s.cover_url)}" alt="${esc(s.name)}" loading="lazy" onerror="this.remove()">`:'';
    const status=dashboard?`<span class="status-pill ${s.status==='approved'?'approved':''}">${s.status==='approved'?'เผยแพร่แล้ว':s.status==='rejected'?'ไม่อนุมัติ':'รอตรวจสอบ'}</span>`:'';
    const state=openState(s), loc=[s.zone,s.lock_number,s.floor].filter(Boolean).join(' • '), badges=serviceBadges(s);
    return `<article class="card" data-id="${esc(s.id)}"><div class="card-img">${cover}<span class="tag">${esc(category)}</span></div><div class="card-body"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h3>${esc(s.name)}</h3>${status}</div><p>${esc(s.description||'ร้านค้าในตลาดกระทุ่มแบน')}</p><div class="meta">📍 ${esc(s.address||'ตลาดกระทุ่มแบน')}</div>${loc?`<div class="location-line">🏪 ${esc(loc)}</div>`:''}<div class="open-badge ${state.open===false?'closed':''}">${state.open===true?'🟢':state.open===false?'🔴':'🕒'} ${esc(state.text)}</div>${badges?`<div class="service-badges">${badges}</div>`:''}<div class="links"><a class="go" href="${go}" target="_blank" rel="noopener">🧭 นำทาง</a>${s.phone?`<a href="tel:${esc(s.phone)}">📞 โทร</a>`:''}${s.facebook?`<a href="${link(s.facebook,'facebook')}" target="_blank" rel="noopener">Facebook</a>`:''}${s.line?`<a href="${link(s.line,'line')}" target="_blank" rel="noopener">LINE</a>`:''}</div>${dashboard?`<div class="admin-actions"><button data-action="edit">แก้ไข</button>${profile?.role==='admin'&&s.status!=='approved'?'<button data-action="approve">อนุมัติ</button>':''}${profile?.role==='admin'?'<button data-action="reject">ไม่อนุมัติ</button>':''}</div>`:''}</div></article>`;
  }

  function renderShops(){
    const list=filteredShops();
    $('shopGrid').innerHTML=list.map(s=>shopCard(s)).join('');
    $('resultCount').textContent=`พบ ${list.length} ร้าน`;
    $('shopCount').textContent=shops.length;
    $('emptyState').classList.toggle('hidden',list.length>0);
    renderPins(list);
  }

  function renderPins(list){
    mapMarkers.forEach(m=>map.removeLayer(m)); miniMarkers.forEach(m=>miniMap.removeLayer(m)); mapMarkers=[]; miniMarkers=[];
    const valid=list.filter(s=>Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude)));
    valid.forEach(s=>{const ll=[+s.latitude,+s.longitude],popup=`<b>${esc(s.name)}</b><br>${esc(s.category?.name||'ร้านค้า')}`;mapMarkers.push(L.marker(ll).bindPopup(popup).addTo(map));miniMarkers.push(L.circleMarker(ll,{radius:8}).bindPopup(popup).addTo(miniMap));});
    if(valid.length>1){const bounds=L.latLngBounds(valid.map(s=>[+s.latitude,+s.longitude]));map.fitBounds(bounds.pad(.22));miniMap.fitBounds(bounds.pad(.22));}
    else if(valid.length===1){map.setView([+valid[0].latitude,+valid[0].longitude],17);miniMap.setView([+valid[0].latitude,+valid[0].longitude],16);}
  }

  async function refreshAuth(){
    if(!db){ updateAccountUI(); return; }
    const {data}=await db.auth.getSession(); session=data.session;
    profile=null;
    if(session){const {data:p}=await db.from('market_profiles').select('*').eq('id',session.user.id).maybeSingle();profile=p;}
    updateAccountUI();
    if(session) await loadDashboard();
  }

  function updateAccountUI(){
    $('accountBtn').textContent=session?(profile?.display_name||session.user.email):'เข้าสู่ระบบ';
    $('dashboard').classList.toggle('hidden',!session);
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
    if(!file)return null;
    if(file.size>5*1024*1024)throw new Error('รูปต้องมีขนาดไม่เกิน 5 MB');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`${session.user.id}/${shopId}/${Date.now()}.${ext}`;
    const {error}=await db.storage.from('shop-images').upload(path,file,{upsert:false,contentType:file.type});
    if(error)throw error;
    return db.storage.from('shop-images').getPublicUrl(path).data.publicUrl;
  }

  async function submitShop(ev){
    ev.preventDefault();
    if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase ใน config.js');
    if(!session){closeModal('shopModal');openModal('authModal');return;}
    const form=ev.currentTarget, fd=new FormData(form), id=fd.get('id')||crypto.randomUUID(), file=fd.get('cover');
    const payload={name:fd.get('name').trim(),category_id:fd.get('category_id'),description:fd.get('description')||null,address:fd.get('address')||null,zone:fd.get('zone')||null,lock_number:fd.get('lock_number')||null,floor:fd.get('floor')||null,landmark:fd.get('landmark')||null,phone:fd.get('phone')||null,email:fd.get('email')||null,line:fd.get('line')||null,facebook:fd.get('facebook')||null,tiktok:fd.get('tiktok')||null,instagram:fd.get('instagram')||null,website:fd.get('website')||null,latitude:fd.get('latitude')?Number(fd.get('latitude')):null,longitude:fd.get('longitude')?Number(fd.get('longitude')):null,opening_hours:readOpeningHours(form),temporarily_closed:form.elements.temporarily_closed.checked,open_24_hours:form.elements.open_24_hours.checked,delivery:form.elements.delivery.checked,lineman:form.elements.lineman.checked,grab:form.elements.grab.checked,shopeefood:form.elements.shopeefood.checked,qr_payment:form.elements.qr_payment.checked,card_payment:form.elements.card_payment.checked,parking:form.elements.parking.checked,pet_friendly:form.elements.pet_friendly.checked,wheelchair_accessible:form.elements.wheelchair_accessible.checked,owner_id:session.user.id,status:'pending'};
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='กำลังบันทึก...';
    try{
      if(file&&file.size)payload.cover_url=await uploadCover(file,id);
      const existing=fd.get('id');
      const result=existing?await db.from('market_shops').update(payload).eq('id',existing):await db.from('market_shops').insert({...payload,id});
      if(result.error)throw result.error;
      form.reset();closeModal('shopModal');showNotice('บันทึกข้อมูลแล้ว และกำลังรอแอดมินตรวจสอบ');await loadDashboard();
    }catch(err){alert('บันทึกไม่สำเร็จ: '+err.message);}finally{btn.disabled=false;btn.textContent='บันทึกข้อมูลร้าน';}
  }

  async function editShop(id){
    const {data,error}=await db.from('market_shops').select('*').eq('id',id).single();if(error)return alert(error.message);
    const f=$('shopForm');Object.entries(data).forEach(([k,v])=>{if(!f.elements[k]||k==='cover'||k==='opening_hours')return;if(f.elements[k].type==='checkbox')f.elements[k].checked=Boolean(v);else f.elements[k].value=v??'';});fillOpeningHours(f,data.opening_hours||{});$('shopFormTitle').textContent='แก้ไขข้อมูลร้าน';openModal('shopModal');
  }
  async function setStatus(id,status){
    const {error}=await db.from('market_shops').update({status}).eq('id',id);if(error)return alert(error.message);await Promise.all([loadDashboard(),loadPublicShops()]);
  }

  function isRecoveryLink(){
    const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
    const query=new URLSearchParams(window.location.search);
    return hash.get('type')==='recovery'||query.get('type')==='recovery';
  }

  async function handleRecoveryLink(){
    if(!db||!isRecoveryLink())return;
    openModal('resetPasswordModal');
  }

  function bindEvents(){
    document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>closeModal(x.dataset.close)));
    $('accountBtn').addEventListener('click',()=>session?$('dashboard').scrollIntoView({behavior:'smooth'}):openModal('authModal'));
    $('addShopBtn').addEventListener('click',()=>{if(!session)return openModal('authModal');$('shopForm').reset();fillOpeningHours($('shopForm'),{});$('shopFormTitle').textContent='เพิ่มร้านของฉัน';openModal('shopModal');});
    $('searchBtn').addEventListener('click',renderShops);$('searchInput').addEventListener('input',renderShops);
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
        const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
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
        alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
        closeModal('resetPasswordModal');
        history.replaceState(null,'',window.location.pathname);
        await refreshAuth();
      }catch(err){alert('เปลี่ยนรหัสผ่านไม่สำเร็จ: '+friendlyAuthError(err.message));}
      finally{btn.disabled=false;btn.textContent='บันทึกรหัสผ่านใหม่';}
    });
    $('signOutBtn').addEventListener('click',async()=>{await db.auth.signOut();session=null;profile=null;updateAccountUI();window.scrollTo({top:0,behavior:'smooth'});});
    $('shopForm').addEventListener('submit',submitShop);
    $('nearBtn').addEventListener('click',()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>{const ll=[p.coords.latitude,p.coords.longitude];L.marker(ll).addTo(map).bindPopup('ตำแหน่งของคุณ').openPopup();map.setView(ll,17);$('map').scrollIntoView({behavior:'smooth'});},()=>alert('กรุณาอนุญาต Location ใน Safari')):alert('อุปกรณ์ไม่รองรับ Location'));
    document.addEventListener('click',ev=>{const card=ev.target.closest('.card[data-id]');if(!card)return;const action=ev.target.dataset.action;if(action==='edit')editShop(card.dataset.id);if(action==='approve')setStatus(card.dataset.id,'approved');if(action==='reject')setStatus(card.dataset.id,'rejected');});
    if(db)db.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));
  }

  async function start(){
    renderHoursEditor();initMaps();bindEvents();
    try{await loadCategories();await loadPublicShops();await refreshAuth();await handleRecoveryLink();}
    catch(err){console.error(err);showNotice('เกิดข้อผิดพลาด: '+err.message,true);}
  }
  start();
})();
