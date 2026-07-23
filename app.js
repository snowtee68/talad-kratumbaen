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
    return `<article class="card" data-id="${esc(s.id)}"><div class="card-img">${cover}<span class="tag">${esc(category)}</span></div><div class="card-body"><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h3>${esc(s.name)}</h3>${status}</div><p>${esc(s.description||'ร้านค้าในตลาดกระทุ่มแบน')}</p><div class="meta">📍 ${esc(s.address||'ตลาดกระทุ่มแบน')}</div><div class="links"><a class="go" href="${go}" target="_blank" rel="noopener">🧭 นำทาง</a>${s.phone?`<a href="tel:${esc(s.phone)}">📞 โทร</a>`:''}${s.facebook?`<a href="${link(s.facebook,'facebook')}" target="_blank" rel="noopener">Facebook</a>`:''}${s.line?`<a href="${link(s.line,'line')}" target="_blank" rel="noopener">LINE</a>`:''}</div>${dashboard?`<div class="admin-actions"><button data-action="edit">แก้ไข</button>${profile?.role==='admin'&&s.status!=='approved'?'<button data-action="approve">อนุมัติ</button>':''}${profile?.role==='admin'?'<button data-action="reject">ไม่อนุมัติ</button>':''}</div>`:''}</div></article>`;
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
    const payload={name:fd.get('name').trim(),category_id:fd.get('category_id'),description:fd.get('description')||null,address:fd.get('address')||null,phone:fd.get('phone')||null,line:fd.get('line')||null,facebook:fd.get('facebook')||null,tiktok:fd.get('tiktok')||null,website:fd.get('website')||null,latitude:fd.get('latitude')?Number(fd.get('latitude')):null,longitude:fd.get('longitude')?Number(fd.get('longitude')):null,owner_id:session.user.id,status:'pending'};
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
    const f=$('shopForm');Object.entries(data).forEach(([k,v])=>{if(f.elements[k]&&k!=='cover')f.elements[k].value=v??'';});$('shopFormTitle').textContent='แก้ไขข้อมูลร้าน';openModal('shopModal');
  }
  async function setStatus(id,status){
    const {error}=await db.from('market_shops').update({status}).eq('id',id);if(error)return alert(error.message);await Promise.all([loadDashboard(),loadPublicShops()]);
  }

  function bindEvents(){
    document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>closeModal(x.dataset.close)));
    $('accountBtn').addEventListener('click',()=>session?$('dashboard').scrollIntoView({behavior:'smooth'}):openModal('authModal'));
    $('addShopBtn').addEventListener('click',()=>{if(!session)return openModal('authModal');$('shopForm').reset();$('shopFormTitle').textContent='เพิ่มร้านของฉัน';openModal('shopModal');});
    $('searchBtn').addEventListener('click',renderShops);$('searchInput').addEventListener('input',renderShops);
    $('authForm').addEventListener('submit',async ev=>{ev.preventDefault();if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');const fd=new FormData(ev.currentTarget);const {error}=await db.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});if(error)return alert(error.message);closeModal('authModal');await refreshAuth();});
    $('signUpBtn').addEventListener('click',async()=>{if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');const fd=new FormData($('authForm'));const {error}=await db.auth.signUp({email:fd.get('email'),password:fd.get('password')});if(error)return alert(error.message);alert('สมัครสำเร็จ กรุณาตรวจอีเมลยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ');});
    $('signOutBtn').addEventListener('click',async()=>{await db.auth.signOut();session=null;profile=null;updateAccountUI();window.scrollTo({top:0,behavior:'smooth'});});
    $('shopForm').addEventListener('submit',submitShop);
    $('nearBtn').addEventListener('click',()=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>{const ll=[p.coords.latitude,p.coords.longitude];L.marker(ll).addTo(map).bindPopup('ตำแหน่งของคุณ').openPopup();map.setView(ll,17);$('map').scrollIntoView({behavior:'smooth'});},()=>alert('กรุณาอนุญาต Location ใน Safari')):alert('อุปกรณ์ไม่รองรับ Location'));
    document.addEventListener('click',ev=>{const card=ev.target.closest('.card[data-id]');if(!card)return;const action=ev.target.dataset.action;if(action==='edit')editShop(card.dataset.id);if(action==='approve')setStatus(card.dataset.id,'approved');if(action==='reject')setStatus(card.dataset.id,'rejected');});
    if(db)db.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));
  }

  async function start(){
    initMaps();bindEvents();
    try{await loadCategories();await loadPublicShops();await refreshAuth();}
    catch(err){console.error(err);showNotice('เกิดข้อผิดพลาด: '+err.message,true);}
  }
  start();
})();
