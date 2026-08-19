(() => {
  const cfg = window.APP_CONFIG || {};
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let session = null;
  let profile = null;
  let riderProfile = null;

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt = n => new Intl.NumberFormat('th-TH',{maximumFractionDigits:1}).format(n);
  const fmtTime = iso => iso ? new Date(iso).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'}) : '-';
  const statusText = {open:'รอวินรับงาน',assigned:'วินกำลังรับของ',arrived_pickup:'ถึงจุดรับ',picked_up:'รับของครบแล้ว',delivering:'กำลังจัดส่ง',completed:'ส่งสำเร็จ',cancelled:'ยกเลิก'};
  const MAX_PICKUPS = 5;
  const EXTRA_PICKUP_FEE = 10;
  let shopSearchTimer = null;
  let marketShopIndex = [];
  let marketShopLoadError = null;

  function haversine(lat1,lng1,lat2,lng2){
    const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function baseFareForKm(km){ if(km>10) return null; if(km<=2) return 25; return 25 + Math.ceil((km-2)/2)*10; }
  function fareForRoute(km,pickupCount){ const base=baseFareForKm(km); if(base===null)return null; return {base,extra:Math.max(0,pickupCount-1)*EXTRA_PICKUP_FEE,total:base+Math.max(0,pickupCount-1)*EXTRA_PICKUP_FEE}; }
  function gmaps(lat,lng){ return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`; }
  function openModal(id){ $('#'+id)?.classList.remove('hidden'); }
  function closeModal(id){ $('#'+id)?.classList.add('hidden'); }

  async function init(){
    const {data:{session:s}} = await db.auth.getSession(); session=s;
    db.auth.onAuthStateChange(async (_e,s2)=>{session=s2; await refreshAuth();});
    wire(); renderPickupStops(1); await Promise.all([refreshAuth(), loadMarketShopIndex()]);
  }

  function wire(){
    $('#accountBtn').onclick = async () => { if(session){ await db.auth.signOut(); } else openModal('authModal'); };
    $$('[data-close]').forEach(el=>el.onclick=()=>closeModal(el.dataset.close));
    $('#showPass').onclick=()=>{const p=$('#authForm [name=password]');p.type=p.type==='password'?'text':'password'};
    $('#authForm').onsubmit=login;
    $('#signUpBtn').onclick=signup;
    $('#jobForm').onsubmit=createJob;
    $('#addPickupBtn').onclick=()=>{ const n=$$('.pickup-stop').length; if(n>=MAX_PICKUPS)return alert(`เพิ่มจุดรับได้สูงสุด ${MAX_PICKUPS} จุด`); addPickupStop(); updateFare(); };
    $('#jobForm').addEventListener('input',handleJobFormInput);
    $('#jobForm').addEventListener('click',handleFormClick);
    $('#riderForm').onsubmit=registerRider;
    $('#onlineToggle').onchange=toggleOnline;
    $('#riderModeBtn').onclick=()=>$('#riderPanel').scrollIntoView({behavior:'smooth'});
    $('#refreshMyJobs').onclick=loadMyJobs;
    $('#refreshOpenJobs').onclick=loadRiderJobs;
    document.addEventListener('click',handleAction);
  }

  function renderPickupStops(count){ $('#pickupStops').innerHTML=''; for(let i=0;i<count;i++) addPickupStop(); }
  function addPickupStop(){
    const index=$$('.pickup-stop').length+1;
    const el=document.createElement('div');
    el.className='location-block pickup-stop';
    el.dataset.stopType='pickup';
    el.innerHTML=`
      <div class="pickup-stop-head">
        <div class="pickup-stop-index">📍 จุดรับ ${index}</div>
        ${index>1?'<button type="button" class="remove-stop">ลบจุดนี้</button>':''}
      </div>
      <div class="pickup-methods">
        <div class="shop-search-wrap">
          <label>🔎 ค้นหาร้านในตลาด
            <input class="shop-search" autocomplete="off" placeholder="พิมพ์ชื่อร้าน เช่น SNOWTEE">
          </label>
          <div class="shop-results hidden"></div>
        </div>
        <div class="or-divider"><span>หรือ</span></div>
        <button type="button" class="location-btn stop-location-btn">📍 ใช้ตำแหน่งปัจจุบัน</button>
      </div>
      <input class="stop-label" type="hidden" required><input class="stop-lat" type="hidden"><input class="stop-lng" type="hidden"><input class="stop-shop-id" type="hidden">
      <div class="selected-location"><span class="location-state">ยังไม่ได้เลือกจุดรับ</span></div>
      <div class="form-grid two">
        <label>ชื่อจุดรับ / ผู้ติดต่อ<input class="stop-contact-name" placeholder="กรณีไม่ใช่ร้านในระบบ"></label>
        <label>เบอร์โทรจุดรับ<input class="stop-contact-phone" type="tel" inputmode="tel" placeholder="08x-xxx-xxxx"></label>
      </div>
      <label>รายละเอียดจุดรับ / จุดสังเกต<input class="stop-note" placeholder="เช่น หน้าร้านติดสะพาน"></label>`;
    $('#pickupStops').appendChild(el);
    renumberPickupStops();
  }
  function renumberPickupStops(){ $$('.pickup-stop').forEach((el,i)=>{ const x=$('.pickup-stop-index',el); if(x)x.textContent=`📍 จุดรับ ${i+1}`; const rm=$('.remove-stop',el); if(i===0&&rm)rm.remove(); }); }
  function handleFormClick(e){
    const result=e.target.closest('.shop-result');
    if(result){ const block=result.closest('.pickup-stop'); try{return selectMarketShop(block,JSON.parse(result.dataset.shop));}catch(_){return;} }
    const loc=e.target.closest('.stop-location-btn');
    if(loc){ const block=loc.closest('.location-block'); return captureLocationForBlock(block); }
    const rm=e.target.closest('.remove-stop');
    if(rm){ rm.closest('.pickup-stop')?.remove(); renumberPickupStops(); updateFare(); }
  }


  function handleJobFormInput(e){
    if(e.target.matches('.stop-lat,.stop-lng,.stop-label')) updateFare();
    if(e.target.matches('.shop-search')){
      const input=e.target, block=input.closest('.pickup-stop');
      clearTimeout(shopSearchTimer);
      shopSearchTimer=setTimeout(()=>searchMarketShops(input.value.trim(),block),220);
    }
  }

  async function loadMarketShopIndex(){
    marketShopLoadError=null;
    const {data,error}=await db.from('market_shops')
      .select('id,name,phone,landmark,address,latitude,longitude')
      .eq('status','approved')
      .order('name');
    if(error){
      marketShopIndex=[];
      marketShopLoadError=error.message||'โหลดรายชื่อร้านไม่สำเร็จ';
      console.error('loadMarketShopIndex',error);
      return;
    }
    marketShopIndex=data||[];
  }

  async function searchMarketShops(keyword,block){
    const box=$('.shop-results',block);
    if(!keyword || keyword.length<1){box.classList.add('hidden');box.innerHTML='';return;}
    if(!marketShopIndex.length && !marketShopLoadError) await loadMarketShopIndex();
    if(marketShopLoadError){
      box.innerHTML=`<div class="shop-result-empty">ค้นหาร้านไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง</div>`;
      box.classList.remove('hidden');
      return;
    }
    const q=keyword.trim().toLocaleLowerCase('th-TH');
    const data=marketShopIndex.filter(shop=>
      [shop.name,shop.address,shop.landmark].filter(Boolean).join(' ').toLocaleLowerCase('th-TH').includes(q)
    ).slice(0,8);
    if(!data.length){box.innerHTML=`<div class="shop-result-empty">ไม่พบร้าน “${esc(keyword)}”</div>`;box.classList.remove('hidden');return;}
    box.innerHTML=data.map(shop=>{
      const hasCoords=Number.isFinite(Number(shop.latitude))&&Number.isFinite(Number(shop.longitude))&&Number(shop.latitude)&&Number(shop.longitude);
      return `<button type="button" class="shop-result" data-shop='${esc(JSON.stringify(shop))}'>
        <b>${esc(shop.name)}</b>
        <small>${hasCoords?'📍 มีพิกัดพร้อมนำทาง':'⚠️ ร้านยังไม่มีพิกัด'}${shop.landmark?` · ${esc(shop.landmark)}`:''}</small>
      </button>`;
    }).join('');
    box.classList.remove('hidden');
  }

  function selectMarketShop(block,shop){
    const lat=Number(shop.latitude),lng=Number(shop.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||!lat||!lng){
      alert('ร้านนี้ยังไม่มีพิกัดในระบบ กรุณาใช้ตำแหน่งปัจจุบันขณะอยู่ที่ร้าน หรือเลือกจุดอื่น');
      return;
    }
    $('.stop-shop-id',block).value=shop.id||'';
    $('.stop-label',block).value=shop.name||'';
    $('.stop-lat',block).value=lat;
    $('.stop-lng',block).value=lng;
    $('.stop-contact-name',block).value=shop.name||'';
    $('.stop-contact-phone',block).value=shop.phone||'';
    if(!$('.stop-note',block).value) $('.stop-note',block).value=shop.landmark||shop.address||'';
    const state=$('.location-state',block);
    state.innerHTML=`<b>🏪 ${esc(shop.name)}</b>${shop.landmark?`<small>จุดสังเกต: ${esc(shop.landmark)}</small>`:''}${shop.phone?`<small>📞 ${esc(shop.phone)}</small>`:''}`;
    $('.shop-search',block).value=shop.name||'';
    $('.shop-results',block).classList.add('hidden');
    updateFare();
  }

  async function login(e){e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await db.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});if(error)return alert(error.message);closeModal('authModal')}
  async function signup(){const f=$('#authForm');const email=f.email.value,password=f.password.value;if(!email||password.length<6)return alert('กรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัวอักษร');const {error}=await db.auth.signUp({email,password});alert(error?error.message:'สมัครสำเร็จ กรุณาตรวจอีเมลยืนยัน (ถ้าระบบเปิดยืนยันอีเมล)')}

  async function refreshAuth(){
    $('#accountBtn').textContent=session?'ออกจากระบบ':'เข้าสู่ระบบ';
    $('#guestNotice').classList.toggle('hidden',!!session);
    $('#customerPanel').classList.toggle('hidden',!session);
    $('#riderPanel').classList.toggle('hidden',!session);
    $('#riderModeBtn').classList.toggle('hidden',!session);
    profile=null;riderProfile=null;
    if(!session) return;
    const uid=session.user.id;
    const {data:p}=await db.from('market_profiles').select('role,display_name').eq('id',uid).maybeSingle(); profile=p;
    const {data:r}=await db.from('rider_profiles').select('*').eq('user_id',uid).maybeSingle(); riderProfile=r;
    renderRiderState();
    await Promise.all([loadMyJobs(),loadRiderJobs(),loadPendingRiders()]);
  }

  function captureLocationForBlock(block){
    if(!navigator.geolocation)return alert('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    navigator.geolocation.getCurrentPosition(pos=>{
      $('.stop-lat',block).value=pos.coords.latitude.toFixed(7);
      $('.stop-lng',block).value=pos.coords.longitude.toFixed(7);
      const shopId=$('.stop-shop-id',block); if(shopId) shopId.value='';
      const label=$('.stop-label',block);
      if(label && !label.value) label.value=block.dataset.stopType==='pickup'?'ตำแหน่งจุดรับ':'ตำแหน่งจุดส่ง';
      const state=$('.location-state',block); if(state) state.innerHTML=`<b>📍 ใช้ตำแหน่ง GPS แล้ว</b><small>ความแม่นยำประมาณ ${Math.round(pos.coords.accuracy)} เมตร</small>`;
      updateFare();
      alert(`บันทึกตำแหน่งลงในจุดนี้แล้ว (ความแม่นยำประมาณ ${Math.round(pos.coords.accuracy)} เมตร)`);
    },err=>alert('ไม่สามารถอ่านตำแหน่งได้: '+err.message),{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  }

  function collectStops(requireLabels=false){
    const blocks=[...$$('.pickup-stop'),$('.dropoff-block')].filter(Boolean);
    return blocks.map((b,i)=>{
      const type=b.dataset.stopType;
      const label=$('.stop-label',b).value.trim();
      const lat=Number($('.stop-lat',b).value),lng=Number($('.stop-lng',b).value);
      const note=$('.stop-note',b).value.trim();
      const shopId=$('.stop-shop-id',b)?.value||null;
      const contactName=$('.stop-contact-name',b)?.value.trim()||'';
      const contactPhone=$('.stop-contact-phone',b)?.value.trim()||'';
      if(requireLabels&&(!label||!Number.isFinite(lat)||!Number.isFinite(lng)||!lat||!lng)) throw new Error(`กรอกข้อมูล${type==='pickup'?'จุดรับ':'จุดส่ง'}ให้ครบ`);
      if(requireLabels&&type==='pickup'&&!shopId&&(!contactName||!contactPhone)) throw new Error('จุดรับที่ไม่ใช่ร้านในระบบ กรุณากรอกชื่อผู้ติดต่อและเบอร์โทร');
      return {type,label,lat,lng,note,shop_id:shopId,contact_name:contactName,contact_phone:contactPhone,order:i+1};
    });
  }
  function routeDistance(stops){
    let km=0;
    for(let i=1;i<stops.length;i++){
      const a=stops[i-1],b=stops[i];
      if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)||!a.lat||!a.lng||!b.lat||!b.lng)return null;
      km+=haversine(a.lat,a.lng,b.lat,b.lng);
    }
    return km;
  }
  function updateFare(){
    const stops=collectStops(false),km=routeDistance(stops),pickups=stops.filter(s=>s.type==='pickup').length;
    if(km===null){$('#farePreview').textContent='ระบุพิกัดทุกจุดเพื่อคำนวณค่าบริการ';return;}
    const fare=fareForRoute(km,pickups);
    if(fare===null){$('#farePreview').innerHTML=`ระยะทางรวมประมาณ ${fmt(km)} กม. — เกินพื้นที่ทดสอบ 10 กม.`;return;}
    $('#farePreview').innerHTML=`ระยะทางรวมประมาณ ${fmt(km)} กม. · ค่าบริการโดยประมาณ ${fare.total} บาท<div class="fare-breakdown">ค่าระยะทาง ${fare.base} บาท${fare.extra?` + ค่าจุดรับเพิ่ม ${fare.extra} บาท (${pickups-1} จุด × ${EXTRA_PICKUP_FEE})`:''}</div>`;
  }

  async function createJob(e){
    e.preventDefault(); if(!session)return openModal('authModal');
    let stops; try{stops=collectStops(true)}catch(err){return alert(err.message)}
    const pickups=stops.filter(s=>s.type==='pickup').length;
    if(pickups<1||pickups>MAX_PICKUPS)return alert(`จุดรับต้องมี 1–${MAX_PICKUPS} จุด`);
    const km=routeDistance(stops),fare=fareForRoute(km,pickups); if(!fare)return alert('พื้นที่ทดสอบรองรับระยะทางรวมไม่เกิน 10 กม.');
    const fd=new FormData(e.currentTarget);
    const payload=stops.map(s=>({type:s.type,label:s.label,lat:s.lat,lng:s.lng,note:s.note,shop_id:s.shop_id,contact_name:s.contact_name,contact_phone:s.contact_phone}));
    const {data:job,error}=await db.rpc('rider_create_multistop_job',{
      p_stops:payload,
      p_job_note:fd.get('job_note')||'',
      p_payer:fd.get('payer'),
      p_distance_km:+km.toFixed(3),
      p_fare_estimate:fare.total,
      p_extra_stop_fee:fare.extra
    });
    if(error)return alert('สร้างงานไม่สำเร็จ: '+error.message);
    alert('สร้างงานเรียบร้อย หมายเลข '+job);
    e.currentTarget.reset(); renderPickupStops(1); updateFare(); await loadMyJobs();
  }

  function renderRiderState(){
    $('#riderRegisterCard').classList.toggle('hidden',!!riderProfile);
    $('#riderStatusCard').classList.toggle('hidden',!riderProfile);
    const approved=riderProfile?.approval_status==='approved';
    $('#riderWorkArea').classList.toggle('hidden',!approved);
    if(riderProfile){$('#riderName').textContent=riderProfile.display_name;$('#riderApproval').textContent='สถานะ: '+(approved?'อนุมัติแล้ว':riderProfile.approval_status==='rejected'?'ไม่อนุมัติ':'รอ Admin อนุมัติ');$('#onlineToggle').checked=!!riderProfile.online;$('#onlineToggle').disabled=!approved;}
    $('#adminRiderArea').classList.toggle('hidden',profile?.role!=='admin');
  }

  async function registerRider(e){e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await db.from('rider_profiles').insert({user_id:session.user.id,display_name:fd.get('display_name'),phone:fd.get('phone'),vehicle_label:fd.get('vehicle_label')||null,plate:fd.get('plate')||null});if(error)return alert(error.message);alert('ส่งสมัครแล้ว รอ Admin อนุมัติ');await refreshAuth()}
  async function toggleOnline(){const online=$('#onlineToggle').checked;const {error}=await db.from('rider_profiles').update({online}).eq('user_id',session.user.id);if(error){alert(error.message);$('#onlineToggle').checked=!online}else{riderProfile.online=online;await loadRiderJobs()}}

  const jobSelect='*, rider_job_stops(*)';
  function sortStops(j){ return [...(j.rider_job_stops||[])].sort((a,b)=>a.stop_order-b.stop_order); }
  async function loadMyJobs(){
    if(!session)return;const {data,error}=await db.from('rider_jobs').select(jobSelect).eq('creator_id',session.user.id).order('created_at',{ascending:false}).limit(30);if(error)return $('#myJobs').innerHTML=`<div class="notice">${esc(error.message)}</div>`;$('#myJobs').innerHTML=(data||[]).map(j=>jobCard(j,'customer')).join('')||'<div class="notice">ยังไม่มีงาน</div>';
  }
  async function loadRiderJobs(){
    if(!riderProfile||riderProfile.approval_status!=='approved')return;
    const [{data:open,error:openErr},{data:mine,error:mineErr}]=await Promise.all([
      db.from('rider_jobs').select('*').eq('status','open').order('created_at',{ascending:true}).limit(30),
      db.from('rider_jobs').select(jobSelect).eq('assigned_rider_id',session.user.id).neq('status','completed').neq('status','cancelled').order('created_at',{ascending:false})
    ]);
    $('#openJobs').innerHTML=openErr?`<div class="notice">${esc(openErr.message)}</div>`:(open||[]).map(j=>jobCard(j,'open')).join('')||'<div class="notice">ยังไม่มีงานใหม่</div>';
    $('#riderJobs').innerHTML=mineErr?`<div class="notice">${esc(mineErr.message)}</div>`:(mine||[]).map(j=>jobCard(j,'rider')).join('')||'<div class="notice">ยังไม่มีงานที่กำลังทำ</div>';
  }

  function routeMarkup(stops,mode){
    if(!stops.length)return '';
    const nextIncomplete=stops.find(s=>s.stop_type==='pickup'&&!s.completed_at);
    return `<div class="route-list">${stops.map((s,i)=>{
      const done=!!s.completed_at, current=mode==='rider'&&nextIncomplete?.id===s.id;
      const contact=mode==='rider'&&(s.contact_name||s.contact_phone)?`<div class="stop-contact">${s.contact_name?`<small>ผู้ติดต่อ: ${esc(s.contact_name)}</small>`:''}${s.contact_phone?`<small>📞 ${esc(s.contact_phone)}</small>`:''}</div>`:'';
      const callBtn=mode==='rider'&&s.contact_phone?`<a class="ghost call-link" href="tel:${esc(s.contact_phone)}">📞 โทร</a>`:'';
      return `<div class="route-stop ${done?'done':''} ${current?'current':''}"><div class="route-num">${done?'✓':i+1}</div><div class="route-detail"><b>${s.stop_type==='pickup'?'📦 รับ':'🏠 ส่ง'}: ${esc(s.label)}</b>${s.note?`<small>${esc(s.note)}</small>`:''}${contact}${mode==='rider'?`<div class="stop-actions"><button class="ghost" data-action="navigate-stop" data-lat="${s.lat}" data-lng="${s.lng}">🧭 นำทาง</button>${callBtn}${current?`<button class="primary" data-action="complete-pickup" data-id="${s.job_id}" data-stop-id="${s.id}">รับของจุดนี้แล้ว</button>`:''}</div>`:''}</div></div>`;
    }).join('')}</div>`;
  }

  function jobCard(j,mode){
    const payer=j.payer==='recipient'?'ผู้รับปลายทาง':'ผู้เรียก';
    const pickupCount=Number(j.pickup_count||1);
    const stops=sortStops(j);
    let actions='';
    if(mode==='open')actions=`<button class="primary" data-action="claim" data-id="${j.id}">รับงาน</button>`;
    if(mode==='customer'&&j.status==='open')actions=`<button class="danger" data-action="cancel" data-id="${j.id}">ยกเลิกงาน</button>`;
    if(mode==='rider'){
      if(j.status==='picked_up') actions=`<button class="primary" data-action="start-delivery" data-id="${j.id}">เริ่มจัดส่ง</button>`;
      else if(j.status==='delivering') actions=`<button class="primary" data-action="complete-delivery" data-id="${j.id}">ส่งสำเร็จ</button>`;
      actions += `<button class="ghost" data-action="route" data-id="${j.id}">ดูเส้นทางทั้งหมด</button>`;
    }
    const title=pickupCount>1?`รับ ${pickupCount} จุด → ${esc(j.dropoff_label)}`:`${esc(j.pickup_label)} → ${esc(j.dropoff_label)}`;
    const extra=j.extra_stop_fee?`<span>ค่าจุดเพิ่ม ${j.extra_stop_fee} บาท</span>`:'';
    return `<article class="job-card" data-job-id="${j.id}"><div class="job-top"><div><b>${title}</b><div class="job-meta"><span>${pickupCount} จุดรับ</span><span>${fmt(j.distance_km)} กม.</span><span>ประมาณ ${j.fare_estimate} บาท</span>${extra}<span>${payer}จ่าย</span></div></div><span class="status ${j.status}">${statusText[j.status]||j.status}</span></div>${stops.length?routeMarkup(stops,mode):`<div class="route-summary">รายละเอียดพิกัดจะแสดงหลังรับงาน</div>`}<div class="job-meta"><span>สร้าง ${fmtTime(j.created_at)}</span>${j.assigned_rider_name?`<span>วิน: ${esc(j.assigned_rider_name)}</span>`:''}</div><div class="job-actions">${actions}</div></article>`;
  }

  async function handleAction(e){
    const b=e.target.closest('[data-action]');if(!b)return;
    const id=b.dataset.id,action=b.dataset.action;
    if(action==='claim'){const {error}=await db.rpc('rider_claim_job',{p_job_id:id});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='cancel'){if(!confirm('ยกเลิกงานนี้?'))return;const {error}=await db.rpc('rider_cancel_job',{p_job_id:id});if(error)return alert(error.message);await loadMyJobs();}
    if(action==='complete-pickup'){const {error}=await db.rpc('rider_complete_pickup_stop',{p_job_id:id,p_stop_id:b.dataset.stopId});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='start-delivery'){const {error}=await db.rpc('rider_start_delivery',{p_job_id:id});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='complete-delivery'){if(!confirm('ยืนยันว่าส่งของถึงปลายทางแล้ว?'))return;const {error}=await db.rpc('rider_complete_delivery',{p_job_id:id});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='route') await showRoute(id);
    if(action==='navigate-stop') window.open(gmaps(b.dataset.lat,b.dataset.lng),'_blank');
    if(action==='approve-rider'){const {error}=await db.rpc('rider_admin_set_approval',{p_user_id:id,p_status:b.dataset.status});if(error)return alert(error.message);await loadPendingRiders();}
  }

  async function showRoute(id){
    const {data,error}=await db.from('rider_job_stops').select('*').eq('job_id',id).order('stop_order');
    if(error)return alert(error.message); if(!data?.length)return alert('ไม่พบข้อมูลเส้นทาง');
    const first=data.find(s=>!s.completed_at)||data[data.length-1];
    const msg=data.map((s,i)=>`${s.completed_at?'✓':'•'} ${i+1}. ${s.stop_type==='pickup'?'รับ':'ส่ง'}: ${s.label}${s.note?`\n   ${s.note}`:''}`).join('\n');
    if(confirm(msg+'\n\nกด OK เพื่อนำทางไปจุดถัดไป')) window.open(gmaps(first.lat,first.lng),'_blank');
  }

  async function loadPendingRiders(){if(profile?.role!=='admin')return;const {data,error}=await db.from('rider_profiles').select('*').eq('approval_status','pending').order('created_at');if(error)return;$('#pendingRiders').innerHTML=(data||[]).map(r=>`<article class="job-card"><div><b>${esc(r.display_name)}</b><div class="job-meta"><span>${esc(r.phone)}</span><span>${esc(r.vehicle_label||'')}</span><span>${esc(r.plate||'')}</span></div></div><div class="job-actions"><button class="primary" data-action="approve-rider" data-id="${r.user_id}" data-status="approved">อนุมัติ</button><button class="danger" data-action="approve-rider" data-id="${r.user_id}" data-status="rejected">ไม่อนุมัติ</button></div></article>`).join('')||'<div class="notice">ไม่มีวินรออนุมัติ</div>'}

  init();
})();
