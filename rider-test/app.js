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
  let jobAlertEnabled = false;
  let jobAlertRealtimeChannel = null;
  let jobAlertRealtimeState = 'disconnected';
  let knownOpenJobKeys = new Set();
  let audioContext = null;
  let jobAlertAudio = null;
  let audioUnlocked = false;
  let alertLoopTimer = null;
  let alertLoopEndsAt = 0;
  let alertSpeechActive = false;
  const JOB_ALERT_MAX_MS = 30000;
  const JOB_ALERT_REPEAT_MS = 1800;
  const JOB_ALERT_TEXT = 'มีงานใหม่เข้ามา มีงานใหม่เข้ามา';
  const JOB_ALERT_AUDIO_SRC = 'job-alert-long.wav?v=0.3.6.3';

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
    jobAlertEnabled=localStorage.getItem('rider_job_alert_enabled')==='1';
    const {data:{session:s}} = await db.auth.getSession(); session=s;
    db.auth.onAuthStateChange(async (_e,s2)=>{session=s2; await refreshAuth();});
    wire(); renderPickupStops(1); await Promise.all([refreshAuth(), loadMarketShopIndex()]);
  }

  function wire(){
    $('#accountBtn').onclick = async () => { if(session){ await db.auth.signOut(); } else openModal('authModal'); };
    $$('[data-close]').forEach(el=>el.onclick=()=>{ if(el.dataset.close==='jobAlertModal') stopJobAlertLoop(); closeModal(el.dataset.close); });
    $('#showPass').onclick=()=>{const p=$('#authForm [name=password]');p.type=p.type==='password'?'text':'password'};
    $('#authForm').onsubmit=login;
    $('#signUpBtn').onclick=signup;
    $('#jobForm').onsubmit=createJob;
    $('#addPickupBtn').onclick=()=>{ const n=$$('.pickup-stop').length; if(n>=MAX_PICKUPS)return alert(`เพิ่มจุดรับได้สูงสุด ${MAX_PICKUPS} จุด`); addPickupStop(); updateFare(); };
    $('#jobForm').addEventListener('input',handleJobFormInput);
    $('#jobForm').addEventListener('click',handleFormClick);
    $('#riderForm').onsubmit=registerRider;
    $('#onlineToggle').onchange=toggleOnline;
    $('#enableJobAlertBtn').onclick=enableJobAlerts;
    $('#disableJobAlertBtn').onclick=disableJobAlerts;
    $('#testJobAlertBtn').onclick=()=>startJobAlertLoop({test:true});
    $('#alertViewJobsBtn').onclick=()=>{ stopJobAlertLoop(); closeModal('jobAlertModal'); $('#openJobs')?.scrollIntoView({behavior:'smooth',block:'start'}); };
    $('#alertCloseBtn').onclick=()=>{ stopJobAlertLoop(); closeModal('jobAlertModal'); };
    const goRider=()=>{ if(!session){ openModal('authModal'); return; } $('#riderPanel').scrollIntoView({behavior:'smooth'}); };
    $('#riderModeBtn').onclick=goRider;
    $('#heroRiderBtn').onclick=goRider;
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
    $('#riderModeBtn').classList.remove('hidden');
    $('#riderModeBtn').textContent=session?'🛵 โหมดวิน':'🛵 สมัคร/โหมดวิน';
    profile=null;riderProfile=null;
    if(!session){ stopJobAlertRealtime(); return; }
    const uid=session.user.id;
    const {data:p}=await db.from('market_profiles').select('role,display_name').eq('id',uid).maybeSingle(); profile=p;
    const {data:r}=await db.from('rider_profiles').select('*').eq('user_id',uid).maybeSingle(); riderProfile=r;
    renderRiderState();
    await Promise.all([loadMyJobs(),loadRiderJobs(),loadPendingRiders(),loadApprovedRiders()]);
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
    if(riderProfile){
      $('#riderName').textContent=riderProfile.display_name;
      $('#riderApproval').textContent='สถานะ: '+(approved?'อนุมัติแล้ว':riderProfile.approval_status==='rejected'?'ไม่อนุมัติ':'รอ Admin อนุมัติ');
      $('#onlineToggle').checked=!!riderProfile.online;
      $('#onlineToggle').disabled=!approved;
      $('#jobAlertControls').classList.toggle('hidden',!approved);
      updateJobAlertUi();
      if(approved && riderProfile.online && jobAlertEnabled) startJobAlertRealtime(); else stopJobAlertRealtime();
    }
    $('#adminRiderArea').classList.toggle('hidden',profile?.role!=='admin');
  }

  async function registerRider(e){e.preventDefault();const fd=new FormData(e.currentTarget);const {error}=await db.from('rider_profiles').insert({user_id:session.user.id,display_name:fd.get('display_name'),phone:fd.get('phone'),vehicle_label:fd.get('vehicle_label')||null,plate:fd.get('plate')||null});if(error)return alert(error.message);alert('ส่งสมัครแล้ว รอ Admin อนุมัติ');await refreshAuth()}
  async function toggleOnline(){
    const online=$('#onlineToggle').checked;
    const {error}=await db.from('rider_profiles').update({online}).eq('user_id',session.user.id);
    if(error){ alert(error.message); $('#onlineToggle').checked=!online; return; }
    riderProfile.online=online;
    if(online && jobAlertEnabled) startJobAlertRealtime(); else stopJobAlertRealtime();
    await loadRiderJobs();
  }

  function updateJobAlertUi(){
    const status=$('#jobAlertStatus');
    if(status){
      if(!jobAlertEnabled) status.textContent='🔕 ยังไม่ได้เปิดเสียงแจ้งเตือน';
      else if(jobAlertRealtimeState==='connected') status.textContent='🟢 Realtime พร้อมแจ้งงานทันที';
      else if(jobAlertRealtimeState==='error') status.textContent='🟠 Realtime เชื่อมต่อไม่สำเร็จ — กดปิด/เปิดแจ้งเตือนใหม่';
      else if(riderProfile?.online) status.textContent='🟡 กำลังเชื่อมต่อ Realtime…';
      else status.textContent='🔔 แจ้งเตือนเปิดอยู่ · เปิด “พร้อมรับงาน” เพื่อเชื่อมต่อ Realtime';
    }
    $('#enableJobAlertBtn')?.classList.toggle('hidden',jobAlertEnabled);
    $('#disableJobAlertBtn')?.classList.toggle('hidden',!jobAlertEnabled);
  }

  function getJobAlertAudio(){
    if(!jobAlertAudio){
      jobAlertAudio=new Audio(JOB_ALERT_AUDIO_SRC);
      jobAlertAudio.preload='auto';
      jobAlertAudio.volume=1;
      jobAlertAudio.playsInline=true;
    }
    return jobAlertAudio;
  }

  async function unlockJobAlertAudio(){
    const a=getJobAlertAudio();
    try{
      a.pause(); a.currentTime=0; a.volume=0.06;
      await a.play();
      await new Promise(r=>setTimeout(r,120));
      a.pause(); a.currentTime=0; a.volume=1;
      audioUnlocked=true;
    }catch(err){
      a.volume=1;
      console.warn('Unable to unlock HTML audio',err);
    }
    // Prime Thai speech from the same direct user gesture.
    try{
      if('speechSynthesis' in window && window.SpeechSynthesisUtterance){
        window.speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance('เปิดแจ้งเตือนงานแล้ว');
        u.lang='th-TH'; u.rate=1; u.pitch=1; u.volume=0.85;
        const voices=window.speechSynthesis.getVoices?.()||[];
        const th=voices.find(v=>String(v.lang||'').toLowerCase().startsWith('th'));
        if(th) u.voice=th;
        window.speechSynthesis.speak(u);
      }
    }catch(_){ }
  }

  async function enableJobAlerts(){
    try{
      // Must be called from this button click so iPhone/Android grants audio playback.
      await unlockJobAlertAudio();
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(Ctx){ audioContext=audioContext||new Ctx(); if(audioContext.state==='suspended') await audioContext.resume(); }
      jobAlertEnabled=true;
      localStorage.setItem('rider_job_alert_enabled','1');
      updateJobAlertUi();
      await primeKnownOpenJobs();
      if(riderProfile?.online) startJobAlertRealtime();
      alert('เปิดแจ้งเตือนงานแล้ว กรุณาเปิดเสียงโทรศัพท์ไว้ เมื่อมีงานใหม่จะมีเสียงตี๊ดยาว + เสียงพูดแจ้งงาน + Popup');
    }catch(err){ alert('ไม่สามารถเปิดเสียงแจ้งเตือนได้: '+(err?.message||err)); }
  }

  function disableJobAlerts(){
    jobAlertEnabled=false;
    localStorage.removeItem('rider_job_alert_enabled');
    stopJobAlertRealtime();
    stopJobAlertLoop();
    updateJobAlertUi();
  }

  async function playJobAlertTone(test=false){
    // Primary path: a real preloaded WAV. Once unlocked by the Enable button,
    // iPhone is much more reliable playing this from a Realtime callback.
    try{
      const a=getJobAlertAudio();
      a.pause(); a.currentTime=0; a.volume=1;
      await a.play();
      await new Promise(resolve=>{
        const done=()=>{ a.removeEventListener('ended',done); resolve(); };
        a.addEventListener('ended',done,{once:true});
        setTimeout(done,3400);
      });
      return true;
    }catch(err){
      console.warn('HTML job alert audio failed, using WebAudio fallback',err);
    }
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return false;
    audioContext=audioContext||new Ctx();
    if(audioContext.state==='suspended'){ try{ await audioContext.resume(); }catch(_){ } }
    const start=audioContext.currentTime;
    const osc=audioContext.createOscillator(), gain=audioContext.createGain();
    osc.type='square'; osc.frequency.value=1080;
    gain.gain.setValueAtTime(0.0001,start);
    gain.gain.exponentialRampToValueAtTime(.78,start+.03);
    gain.gain.setValueAtTime(.78,start+2.45);
    gain.gain.exponentialRampToValueAtTime(.0001,start+2.68);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(start); osc.stop(start+2.7);
    return true;
  }


  function stopJobAlertLoop(){
    if(alertLoopTimer){ clearTimeout(alertLoopTimer); alertLoopTimer=null; }
    if(jobAlertAudio){ try{ jobAlertAudio.pause(); jobAlertAudio.currentTime=0; }catch(_){ } }
    alertLoopEndsAt=0;
    alertSpeechActive=false;
    if('speechSynthesis' in window){
      try{ window.speechSynthesis.cancel(); }catch(_){ }
    }
    if(navigator.vibrate){ try{ navigator.vibrate(0); }catch(_){ } }
  }

  function speakJobAlert(){
    return new Promise(resolve=>{
      if(!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return resolve(false);
      try{
        window.speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(JOB_ALERT_TEXT);
        u.lang='th-TH'; u.rate=0.95; u.pitch=1.03; u.volume=1;
        const voices=window.speechSynthesis.getVoices?.()||[];
        const th=voices.find(v=>String(v.lang||'').toLowerCase().startsWith('th'));
        if(th) u.voice=th;
        alertSpeechActive=true;
        const done=ok=>{ alertSpeechActive=false; resolve(ok); };
        u.onend=()=>done(true); u.onerror=()=>done(false);
        window.speechSynthesis.speak(u);
      }catch(_){ alertSpeechActive=false; resolve(false); }
    });
  }

  async function runJobAlertCycle(){
    if(!alertLoopEndsAt || Date.now()>alertLoopEndsAt){ stopJobAlertLoop(); return; }
    try{ await playJobAlertTone(false); }catch(_){ }
    if(navigator.vibrate){ try{ navigator.vibrate([300,140,300,140,550]); }catch(_){ } }
    const spoke=await speakJobAlert();
    if(!spoke){ try{ await playJobAlertTone(false); }catch(_){ } }
    if(alertLoopEndsAt && Date.now()<alertLoopEndsAt){
      alertLoopTimer=setTimeout(runJobAlertCycle,JOB_ALERT_REPEAT_MS);
    }else stopJobAlertLoop();
  }

  async function startJobAlertLoop({test=false}={}){
    stopJobAlertLoop();
    // A direct button gesture helps browsers unlock audio/speech.
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(Ctx){ audioContext=audioContext||new Ctx(); if(audioContext.state==='suspended') await audioContext.resume(); }
    }catch(_){ }
    alertLoopEndsAt=Date.now()+(test?15000:JOB_ALERT_MAX_MS);
    if(test){
      $('#jobAlertTitle').textContent='🔊 ทดสอบเสียงแจ้งเตือน';
      $('#jobAlertBody').innerHTML='<b>เสียงทดสอบ:</b> ตี๊ดยาว → “มีงานใหม่เข้ามา มีงานใหม่เข้ามา”<div class="job-meta alert-meta"><span>กด × หรือ “ปิดเสียง” เพื่อหยุด</span></div>';
      openModal('jobAlertModal');
    }
    runJobAlertCycle();
  }

  async function primeKnownOpenJobs(){
    const {data}=await db.from('rider_jobs').select('id,updated_at').eq('status','open').limit(100);
    knownOpenJobKeys=new Set((data||[]).map(x=>`${x.id}|${x.updated_at||''}`));
  }

  async function hasCurrentRiderWithdrawn(jobId){
    if(!session?.user?.id || !jobId) return false;
    const {data,error}=await db.from('rider_job_withdrawals')
      .select('id')
      .eq('job_id',jobId)
      .eq('rider_id',session.user.id)
      .limit(1);
    if(error) return false;
    return !!data?.length;
  }

  async function handleRealtimeJobChange(payload){
    if(!jobAlertEnabled || !riderProfile?.online) return;
    const job=payload?.new;
    if(!job?.id || job.status!=='open') return;
    const key=`${job.id}|${job.updated_at||''}`;
    if(knownOpenJobKeys.has(key)) return;
    knownOpenJobKeys.add(key);
    if(Number(job.reassign_count||0)>0 && await hasCurrentRiderWithdrawn(job.id)) return;
    await loadRiderJobs();
    notifyNewJob(job,1);
  }

  function startJobAlertRealtime(){
    if(jobAlertRealtimeChannel || !jobAlertEnabled || !riderProfile?.online) return;
    jobAlertRealtimeState='connecting';
    updateJobAlertUi();
    jobAlertRealtimeChannel=db
      .channel(`rider-open-jobs-${session?.user?.id||'anon'}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'rider_jobs'},handleRealtimeJobChange)
      .subscribe((status,err)=>{
        jobAlertRealtimeState=status==='SUBSCRIBED'?'connected':status==='CHANNEL_ERROR'?'error':status==='TIMED_OUT'?'error':status==='CLOSED'?'disconnected':'connecting';
        updateJobAlertUi();
        if(err) console.error('Rider Realtime subscription',err);
      });
  }

  function stopJobAlertRealtime(){
    if(jobAlertRealtimeChannel){
      const channel=jobAlertRealtimeChannel;
      jobAlertRealtimeChannel=null;
      try{ db.removeChannel(channel); }catch(_){ try{ channel.unsubscribe(); }catch(__){} }
    }
    jobAlertRealtimeState='disconnected';
    updateJobAlertUi();
  }

  async function notifyNewJob(job,count){
    const reopened=Number(job.reassign_count||0)>0;
    const title=count>1?`มีงานใหม่ ${count} งาน`:(reopened?'งานกลับมารอวินใหม่':'มีงานใหม่');
    $('#jobAlertTitle').textContent='🛵 '+title;
    $('#jobAlertBody').innerHTML=`<b>${Number(job.pickup_count||1)} จุดรับ → ${esc(job.dropoff_label||'จุดส่ง')}</b><div class="job-meta alert-meta"><span>${fmt(job.distance_km||0)} กม.</span><span>ประมาณ ${job.fare_estimate||'-'} บาท</span></div><small>${reopened?'วินก่อนหน้าถอนตัว ระบบเปิดให้อีกคนรับงานต่อ · ':''}เสียงจะเตือนซ้ำสูงสุดประมาณ 30 วินาที หรือจนกดปิดเสียง/ดูงาน</small>`;
    openModal('jobAlertModal');
    startJobAlertLoop({test:false});
  }

  document.addEventListener('visibilitychange',()=>{ if(!document.hidden && jobAlertEnabled && riderProfile?.online){ primeKnownOpenJobs().then(startJobAlertRealtime); } });

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
      const hasPickedUpAny=stops.some(s=>s.stop_type==='pickup'&&s.completed_at);
      if((j.status==='assigned'||j.status==='arrived_pickup')&&!hasPickedUpAny){
        actions+=`<button class="danger" data-action="withdraw" data-id="${j.id}">ถอนตัวจากงาน</button>`;
      }
      if(j.status==='picked_up') actions+=`<button class="primary" data-action="start-delivery" data-id="${j.id}">เริ่มจัดส่ง</button>`;
      else if(j.status==='delivering') actions+=`<button class="primary" data-action="complete-delivery" data-id="${j.id}">ส่งสำเร็จ</button>`;
      actions += `<button class="ghost" data-action="route" data-id="${j.id}">ดูเส้นทางทั้งหมด</button>`;
    }
    const title=pickupCount>1?`รับ ${pickupCount} จุด → ${esc(j.dropoff_label)}`:`${esc(j.pickup_label)} → ${esc(j.dropoff_label)}`;
    const extra=j.extra_stop_fee?`<span>ค่าจุดเพิ่ม ${j.extra_stop_fee} บาท</span>`:'';
    const reassigned=Number(j.reassign_count||0)>0;
    const reassignNotice=reassigned&&j.status==='open'?`<div class="notice compact">♻️ วินก่อนหน้าถอนตัว กำลังค้นหาวินคนใหม่${Number(j.reassign_count)>1?` · ครั้งที่ ${j.reassign_count}`:''}</div>`:'';
    return `<article class="job-card" data-job-id="${j.id}"><div class="job-top"><div><b>${title}</b><div class="job-meta"><span>${pickupCount} จุดรับ</span><span>${fmt(j.distance_km)} กม.</span><span>ประมาณ ${j.fare_estimate} บาท</span>${extra}<span>${payer}จ่าย</span>${reassigned?`<span>♻️ เปิดหาวินใหม่ ${j.reassign_count} ครั้ง</span>`:''}</div></div><span class="status ${j.status}">${statusText[j.status]||j.status}</span></div>${reassignNotice}${stops.length?routeMarkup(stops,mode):`<div class="route-summary">รายละเอียดพิกัดจะแสดงหลังรับงาน</div>`}<div class="job-meta"><span>สร้าง ${fmtTime(j.created_at)}</span>${j.assigned_rider_name?`<span>วิน: ${esc(j.assigned_rider_name)}</span>`:''}</div><div class="job-actions">${actions}</div></article>`;
  }

  async function handleAction(e){
    const b=e.target.closest('[data-action]');if(!b)return;
    const id=b.dataset.id,action=b.dataset.action;
    if(action==='claim'){const {error}=await db.rpc('rider_claim_job',{p_job_id:id});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='withdraw'){
      const reason=prompt('เหตุผลที่ถอนตัวจากงาน\nเช่น รถเสีย / เหตุฉุกเฉิน / ติดต่อจุดรับไม่ได้ / เส้นทางมีปัญหา');
      if(reason===null)return;
      if(!reason.trim())return alert('กรุณาระบุเหตุผลที่ถอนตัว');
      if(!confirm('ยืนยันถอนตัวจากงาน?\nงานจะกลับไปเปิดให้วินคนอื่นรับทันที'))return;
      const {error}=await db.rpc('rider_withdraw_job',{p_job_id:id,p_reason:reason.trim()});
      if(error)return alert('ถอนตัวไม่ได้: '+error.message);
      stopJobAlertLoop();
      alert('ถอนตัวเรียบร้อย ระบบเปิดงานให้วินคนอื่นรับต่อแล้ว');
      await Promise.all([loadRiderJobs(),loadMyJobs()]);
    }
    if(action==='cancel'){if(!confirm(`ยกเลิกงานนี้?\n\nยกเลิกได้เฉพาะก่อนมีวินรับงานเท่านั้น`))return;const {error}=await db.rpc('rider_cancel_job',{p_job_id:id});if(error)return alert('ยกเลิกไม่ได้: '+error.message);await loadMyJobs();}
    if(action==='complete-pickup'){const {error}=await db.rpc('rider_complete_pickup_stop',{p_job_id:id,p_stop_id:b.dataset.stopId});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='start-delivery'){const {error}=await db.rpc('rider_start_delivery',{p_job_id:id});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='complete-delivery'){if(!confirm('ยืนยันว่าส่งของถึงปลายทางแล้ว?'))return;const {error}=await db.rpc('rider_complete_delivery',{p_job_id:id});if(error)return alert(error.message);await Promise.all([loadRiderJobs(),loadMyJobs()]);}
    if(action==='route') await showRoute(id);
    if(action==='navigate-stop') window.open(gmaps(b.dataset.lat,b.dataset.lng),'_blank');
    if(action==='approve-rider'){const next=b.dataset.status;const label=next==='approved'?'อนุมัติวินคนนี้?':next==='suspended'?'ระงับวินคนนี้?':next==='pending'?'เปิดให้รออนุมัติอีกครั้ง?':'ไม่อนุมัติวินคนนี้?';if(!confirm(label))return;const {error}=await db.rpc('rider_admin_set_approval',{p_user_id:id,p_status:next});if(error)return alert(error.message);await Promise.all([loadPendingRiders(),loadApprovedRiders()]);}
  }

  async function showRoute(id){
    const {data,error}=await db.from('rider_job_stops').select('*').eq('job_id',id).order('stop_order');
    if(error)return alert(error.message); if(!data?.length)return alert('ไม่พบข้อมูลเส้นทาง');
    const first=data.find(s=>!s.completed_at)||data[data.length-1];
    const msg=data.map((s,i)=>`${s.completed_at?'✓':'•'} ${i+1}. ${s.stop_type==='pickup'?'รับ':'ส่ง'}: ${s.label}${s.note?`\n   ${s.note}`:''}`).join('\n');
    if(confirm(msg+'\n\nกด OK เพื่อนำทางไปจุดถัดไป')) window.open(gmaps(first.lat,first.lng),'_blank');
  }

  async function loadPendingRiders(){if(profile?.role!=='admin')return;const {data,error}=await db.from('rider_profiles').select('*').eq('approval_status','pending').order('created_at');if(error)return;$('#pendingRiders').innerHTML=(data||[]).map(r=>`<article class="job-card"><div><b>${esc(r.display_name)}</b><div class="job-meta"><span>${esc(r.phone)}</span><span>${esc(r.vehicle_label||'')}</span><span>${esc(r.plate||'')}</span></div></div><div class="job-actions"><button class="primary" data-action="approve-rider" data-id="${r.user_id}" data-status="approved">อนุมัติ</button><button class="danger" data-action="approve-rider" data-id="${r.user_id}" data-status="rejected">ไม่อนุมัติ</button></div></article>`).join('')||'<div class="notice">ไม่มีวินรออนุมัติ</div>'}

  async function loadApprovedRiders(){
    if(profile?.role!=='admin')return;
    const [{data,error},{data:withdrawals}]=await Promise.all([
      db.from('rider_profiles').select('*').neq('approval_status','pending').order('created_at',{ascending:false}),
      db.from('rider_job_withdrawals').select('rider_id').limit(5000)
    ]);
    if(error){$('#approvedRiders').innerHTML='<div class="notice">โหลดรายชื่อวินไม่สำเร็จ</div>';return;}
    const withdrawCount={}; (withdrawals||[]).forEach(w=>withdrawCount[w.rider_id]=(withdrawCount[w.rider_id]||0)+1);
    $('#approvedRiders').innerHTML=(data||[]).map(r=>{const st=r.approval_status||'pending';const badge=st==='approved'?'✅ อนุมัติแล้ว':st==='suspended'?'⛔ ระงับ':'❌ ไม่อนุมัติ';const actions=st==='approved'?`<button class="danger" data-action="approve-rider" data-id="${r.user_id}" data-status="suspended">ระงับ</button>`:`<button class="primary" data-action="approve-rider" data-id="${r.user_id}" data-status="approved">อนุมัติ/เปิดใช้งาน</button><button class="ghost" data-action="approve-rider" data-id="${r.user_id}" data-status="pending">กลับไปรออนุมัติ</button>`;return `<article class="job-card"><div class="job-top"><div><b>${esc(r.display_name)}</b><div class="job-meta"><span>📞 ${esc(r.phone)}</span><span>🏍️ ${esc(r.vehicle_label||'-')}</span><span>ทะเบียน ${esc(r.plate||'-')}</span><span>${r.online?'🟢 พร้อมรับงาน':'⚪ ออฟไลน์'}</span><span>ถอนงาน ${withdrawCount[r.user_id]||0} ครั้ง</span></div></div><span class="status">${badge}</span></div><div class="job-actions">${actions}</div></article>`}).join('')||'<div class="notice">ยังไม่มีวินที่ผ่านการพิจารณา</div>'
  }

  $('#refreshRidersBtn')?.addEventListener('click',()=>Promise.all([loadPendingRiders(),loadApprovedRiders()]));

  init();
})();
