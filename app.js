(() => {
  'use strict';
  console.info('Talad Krathumbaen Main v0.5.22.44 Guest Header 3-Column Fix loaded');

  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(
    cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('PASTE_') &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('PASTE_')
  );
  const db = configured ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const DEMO = [{id:'demo',name:'Snowtee ตลาดกระทุ่มแบน',description:'เครื่องดื่ม ไอศกรีมซอฟต์เสิร์ฟ และเบเกอรี่ บรรยากาศริมคลอง',category:{name:'เครื่องดื่ม'},address:'ตลาดกระทุ่มแบน จังหวัดสมุทรสาคร',phone:'0642211876',facebook:'https://facebook.com/snowtee68',line:'snowtee68',latitude:13.6549,longitude:100.2639,status:'approved',featured:true,cover_url:null}];

  const ANALYTICS_EVENTS=new Set(['page_view','shop_view','navigate_click','phone_click','order_click','order_lineman_click','order_grab_click','order_shopee_click']);
  let analyticsPeriod='7d';
  function analyticsSessionId(){
    const key='talad_analytics_session_v1';
    try{
      let item=JSON.parse(localStorage.getItem(key)||'null');
      const now=Date.now();
      if(!item?.id||!item?.created||now-item.created>24*60*60*1000){item={id:crypto.randomUUID(),created:now};localStorage.setItem(key,JSON.stringify(item));}
      return item.id;
    }catch(_){return 'session-'+Math.random().toString(36).slice(2)+Date.now().toString(36);}
  }
  async function trackAnalytics(eventType,shopId=null){
    if(!db||!ANALYTICS_EVENTS.has(eventType))return;
    try{await db.rpc('track_market_event',{p_event_type:eventType,p_shop_id:shopId||null,p_session_id:analyticsSessionId()});}
    catch(err){console.debug('Analytics skipped',err?.message||err);}
  }
  function analyticsMetricLabel(type){return ({page_view:'เปิดเว็บ',shop_view:'เปิดดูร้าน',navigate_click:'กดนำทาง',phone_click:'กดโทร',order_click:'คลิกช่องทางสั่งซื้อ',order_lineman_click:'LINE MAN',order_grab_click:'Grab',order_shopee_click:'ShopeeFood'})[type]||type;}
  let globalDeliveryEnabled=true;
  async function loadGlobalDeliverySetting(){
    if(!db)return true;
    try{
      const {data,error}=await db.rpc('market_get_system_settings');
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      globalDeliveryEnabled=row?.delivery_enabled!==false;
      return globalDeliveryEnabled;
    }catch(err){
      console.warn('Global delivery setting:',err?.message||err);
      return true;
    }
  }
  async function loadDeliverySystemAdmin(){
    if(!db||profile?.role!=='admin')return;
    const enabled=await loadGlobalDeliverySetting();
    const form=$('deliverySystemForm'),status=$('deliverySystemAdminStatus');
    if(form?.elements?.delivery_enabled)form.elements.delivery_enabled.checked=enabled;
    if(status)status.textContent=enabled?'🟢 Delivery เปิดทั้งระบบ':'⚪ Delivery ปิด — รับเองเท่านั้น';
  }
  async function saveDeliverySystemSetting(ev){
    ev.preventDefault();
    if(!db||profile?.role!=='admin')return alert('เฉพาะ Admin เท่านั้น');
    const enabled=Boolean(ev.currentTarget?.elements?.delivery_enabled?.checked);
    const msg=enabled?'เปิดระบบ Delivery ทั้งระบบใช่หรือไม่?':'ปิด Delivery สำหรับออเดอร์ใหม่ทั้งหมด และให้ลูกค้าเลือกรับเองที่ร้านเท่านั้นใช่หรือไม่?';
    if(!confirm(msg))return;
    try{
      const {data,error}=await db.rpc('market_admin_set_delivery_enabled',{p_enabled:enabled});
      if(error)throw error;
      globalDeliveryEnabled=data!==false;
      await loadDeliverySystemAdmin();
      showNotice(globalDeliveryEnabled?'เปิดระบบ Delivery แล้ว':'ปิดระบบ Delivery แล้ว — ออเดอร์ใหม่จะเป็นรับเองเท่านั้น');
    }catch(err){
      alert('บันทึกการตั้งค่า Delivery ไม่สำเร็จ: '+(err?.message||err));
    }
  }



  let myRiderApplication=null;

  function riderApplicationStatusText(status){
    return ({pending:'⏳ รอตรวจสอบ',approved:'✅ อนุมัติแล้ว',rejected:'❌ ไม่ผ่านการอนุมัติ'})[status]||'ยังไม่ได้สมัคร';
  }

  async function loadMyRiderApplication(){
    myRiderApplication=null;
    if(!db||!session){
      updateRiderJoinButton();
      return null;
    }
    try{
      const {data,error}=await db.rpc('market_my_rider_application');
      if(error)throw error;
      myRiderApplication=data&&typeof data==='object'&&!Array.isArray(data)?data:null;
    }catch(err){
      console.warn('load rider application skipped',err);
    }
    updateRiderJoinButton();
    return myRiderApplication;
  }

  function updateRiderJoinButton(){
    const btn=$('riderJoinBtn'),label=$('riderJoinLabel');
    if(!btn||!label)return;
    const st=myRiderApplication?.status;
    label.textContent=st==='approved'?'งานวิน':st==='pending'?'รอตรวจสอบวิน':st==='rejected'?'สมัครวินอีกครั้ง':'สมัครเป็นวิน';
    btn.title=st==='approved'?'บัญชีวินของฉัน':st==='pending'?'ดูสถานะคำขอสมัครวิน':'สมัครเป็นวินส่งของ';
  }

  function fillRiderApplicationModal(){
    const form=$('riderApplyForm'),status=$('riderApplyStatusBox'),approved=$('riderApprovedBox'),title=$('riderApplyTitle');
    if(!form)return;
    const a=myRiderApplication;
    form.classList.remove('hidden');
    approved?.classList.add('hidden');
    if(a){
      form.elements.rider_name.value=a.display_name||currentDisplayName()||'';
      form.elements.rider_phone.value=a.phone||'';
      if(form.elements.service_area_consent)form.elements.service_area_consent.checked=Boolean(a.service_area);
      form.elements.vehicle_plate.value=a.vehicle_plate||'';
      if(status)status.innerHTML=`สถานะปัจจุบัน: <b>${riderApplicationStatusText(a.status)}</b>${a.admin_note?`<br><small>หมายเหตุ: ${esc(a.admin_note)}</small>`:''}`;
      if(a.status==='pending'){
        if(title)title.textContent='⏳ คำขอสมัครวิน';
        [...form.elements].forEach(el=>el.disabled=true);
        form.querySelector('button[type=submit]').textContent='รอ Admin ตรวจสอบ';
      }else if(a.status==='approved'){
        if(title)title.textContent='🛵 งานวิน';
        form.classList.add('hidden'); approved?.classList.remove('hidden');
      }else{
        if(title)title.textContent='🛵 สมัครเป็นวินอีกครั้ง';
        [...form.elements].forEach(el=>el.disabled=false);
        form.querySelector('button[type=submit]').textContent='ส่งใบสมัครใหม่';
      }
    }else{
      if(title)title.textContent='🛵 สมัครเป็นวินส่งของ';
      if(status)status.textContent='กรอกข้อมูลเพื่อส่งให้ Admin ตรวจสอบ';
      [...form.elements].forEach(el=>el.disabled=false);
      form.reset();
      form.elements.rider_name.value=currentDisplayName()||'';
      form.querySelector('button[type=submit]').textContent='ส่งใบสมัครเป็นวิน';
    }
  }

  async function openRiderApplication(){
    if(!session){
      openModal('authModal');
      alert('กรุณาเข้าสู่ระบบก่อนสมัครเป็นวิน');
      return;
    }
    await loadMyRiderApplication();
    fillRiderApplicationModal();
    openModal('riderApplyModal');
  }

  async function submitRiderApplication(ev){
    ev.preventDefault();
    if(!db||!session)return openModal('authModal');
    const f=ev.currentTarget;
    const name=String(f.elements.rider_name.value||'').trim();
    const phone=String(f.elements.rider_phone.value||'').trim();
    const areaConsent=Boolean(f.elements.service_area_consent?.checked);
    const area='อำเภอกระทุ่มแบนและพื้นที่ใกล้เคียงตามที่ระบบกำหนด';
    const plate=String(f.elements.vehicle_plate.value||'').trim();
    if(!name||!phone||!plate||!areaConsent)return alert('กรุณากรอกข้อมูลให้ครบ และติ๊กยินยอมรับทราบพื้นที่ให้บริการ');
    const btn=f.querySelector('button[type=submit]');
    btn.disabled=true;btn.textContent='กำลังส่งใบสมัคร...';
    try{
      const {error}=await db.rpc('market_apply_as_rider',{
        p_display_name:name,p_phone:phone,p_service_area:area,p_vehicle_plate:plate
      });
      if(error)throw error;
      await loadMyRiderApplication();
      fillRiderApplicationModal();
      alert('ส่งใบสมัครเป็นวินแล้ว กรุณารอ Admin ตรวจสอบ');
    }catch(err){
      alert('ส่งใบสมัครไม่สำเร็จ: '+(err?.message||err));
    }finally{
      btn.disabled=false;
      if(myRiderApplication?.status!=='pending')btn.textContent='ส่งใบสมัครเป็นวิน';
    }
  }

  async function loadAdminRiderApplicants(){
    const box=$('adminRiderApplicantList');
    if(!box||!db||profile?.role!=='admin')return;
    box.innerHTML='<p class="muted">กำลังโหลดคำขอสมัครวิน...</p>';
    try{
      const {data,error}=await db.rpc('market_admin_rider_applications');
      if(error)throw error;
      const rows=data||[];
      const pending=rows.filter(x=>x.status==='pending');
      box.innerHTML=rows.length?rows.map(a=>`<div style="padding:12px 0;border-bottom:1px solid #eee">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><b>${esc(a.display_name||'-')}</b> · <a href="tel:${esc(a.phone||'')}">${esc(a.phone||'-')}</a>
          <small class="muted" style="display:block">พื้นที่: ${esc(a.service_area||'-')} · ทะเบียน: ${esc(a.vehicle_plate||'-')}</small>
          <small class="muted" style="display:block">${riderApplicationStatusText(a.status)} · สมัคร ${a.created_at?new Date(a.created_at).toLocaleString('th-TH'):'-'}</small></div>
          <div>${a.status==='pending'?`<button type="button" class="primary" data-rider-approve="${a.user_id}">✅ อนุมัติ</button> <button type="button" class="danger" data-rider-reject="${a.user_id}">ไม่อนุมัติ</button>`:`<span class="muted">${riderApplicationStatusText(a.status)}</span>`}</div>
        </div>
      </div>`).join(''):'<p class="muted">ยังไม่มีคำขอสมัครวิน</p>';
      const status=$('riderRegistryStatus');
      if(status&&pending.length)status.textContent=`มีคำขอรอตรวจสอบ ${pending.length} คน`;
    }catch(err){
      box.innerHTML=`<p class="muted">โหลดคำขอสมัครวินไม่ได้: ${esc(err?.message||err)}</p>`;
    }
  }

  async function decideRiderApplication(userId,approve){
    if(!db||profile?.role!=='admin')return;
    let note='';
    if(!approve){
      note=prompt('เหตุผลที่ยังไม่อนุมัติ (ผู้สมัครจะเห็นข้อความนี้)')||'';
      if(note===null)return;
    }
    if(!confirm(approve?'อนุมัติผู้สมัครคนนี้เป็นวินในระบบ?':'ยืนยันไม่อนุมัติคำขอนี้?'))return;
    try{
      const {error}=await db.rpc('market_admin_decide_rider_application',{
        p_user_id:userId,p_approve:approve,p_admin_note:note
      });
      if(error)throw error;
      await Promise.all([loadAdminRiderApplicants(),loadRiderAdminPanel()]);
      showNotice(approve?'อนุมัติวินเรียบร้อยแล้ว':'อัปเดตคำขอสมัครวินแล้ว');
    }catch(err){
      alert('อัปเดตคำขอไม่สำเร็จ: '+(err?.message||err));
    }
  }

  function riderJobStatusLabel(status){
    return ({created:'รอวินรับงาน',accepted:'วินรับงานแล้ว',pickup_started:'กำลังไปรับสินค้า',picked_up:'รับสินค้าแล้ว',delivering:'กำลังจัดส่ง',completed:'ส่งสำเร็จ',cancelled:'ยกเลิก'})[status]||status||'-';
  }
  async function loadRiderAdminPanel(){
    if(!db||profile?.role!=='admin')return;
    loadAdminRiderApplicants();
    const list=$('adminRiderList'),jobs=$('adminRiderJobs'),status=$('riderRegistryStatus');
    if(list)list.innerHTML='<p class="muted">กำลังโหลดรายชื่อวิน...</p>';
    if(jobs)jobs.innerHTML='<p class="muted">กำลังโหลดงาน Delivery...</p>';
    try{
      const [{data:riders,error:e1},{data:recent,error:e2}]=await Promise.all([
        db.rpc('market_admin_rider_directory'),
        db.rpc('market_admin_recent_rider_jobs',{p_limit:50})
      ]);
      if(e1)throw e1;if(e2)throw e2;
      const rows=riders||[];
      if(status)status.textContent=`${rows.length.toLocaleString('th-TH')} คนในทะเบียน`;
      if(list)list.innerHTML=rows.length?rows.map(r=>{const systemRider=r.source==='rider_profiles';const sourceLabel=systemRider?' · บัญชีวินในระบบ':r.source==='admin'?' · Admin เพิ่ม':' · พบจากงาน Delivery';const action=systemRider?'<span class="muted" style="font-size:12px">จัดการสถานะจากระบบวิน</span>':`<button type="button" class="${r.enabled?'danger':'secondary'}" data-rider-toggle="${r.id}" data-rider-enabled="${r.enabled?'true':'false'}">${r.enabled?'ปิดใช้งาน':'เปิดใช้งาน'}</button>`;return `<div style="display:grid;grid-template-columns:minmax(150px,1.5fr) minmax(125px,1fr) minmax(90px,.7fr) minmax(110px,.8fr) minmax(110px,.9fr);gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #eee"><div><b>${esc(r.display_name||'ไม่ระบุชื่อ')}</b><small class="muted" style="display:block">${r.enabled?'🟢 เปิดใช้งาน':'⚫ ปิดใช้งาน'}${sourceLabel}</small></div><div><a href="tel:${esc(r.phone||'')}">${esc(r.phone||'-')}</a></div><div><b>${Number(r.active_jobs||0)}</b><small class="muted" style="display:block">งานกำลังทำ</small></div><div><b>${Number(r.completed_jobs||0)}</b><small class="muted" style="display:block">ส่งสำเร็จ</small></div>${action}</div>`}).join(''):'<p class="muted">ยังไม่มีวินในระบบ</p>';
      const jr=recent||[];
      if(jobs)jobs.innerHTML=jr.length?jr.map(j=>{const genuinelyWaiting=['creating','waiting_rider','created','open'].includes(String(j.status||''));const hasRider=!!(j.rider_name||j.rider_phone);const riderTitle=hasRider?(j.rider_name||'ไม่ระบุชื่อวิน'):(genuinelyWaiting?'รอวินรับงาน':'ไม่พบข้อมูลวิน (งานเก่า)');const riderSub=j.rider_phone?`<a href="tel:${esc(j.rider_phone)}">${esc(j.rider_phone)}</a>`:(genuinelyWaiting?'ยังไม่มีเบอร์':'ไม่มีข้อมูลผู้รับงานที่บันทึกไว้');return `<div style="display:grid;grid-template-columns:minmax(130px,1fr) minmax(170px,1.5fr) minmax(120px,1fr) minmax(120px,1fr);gap:10px;padding:9px 0;border-bottom:1px solid #eee"><div><b>${esc(String(j.batch_id||'').slice(0,8).toUpperCase())}</b><small class="muted" style="display:block">${j.rider_job_id?esc(String(j.rider_job_id).slice(0,10)):'-'}</small></div><div><b>${hasRider?'🛵 ':genuinelyWaiting?'⏳ ':'⚠️ '}${esc(riderTitle)}</b><small style="display:block">${riderSub}</small></div><div><b>${esc(riderJobStatusLabel(j.status))}</b><small class="muted" style="display:block">${j.accepted_at?new Date(j.accepted_at).toLocaleString('th-TH'):'-'}</small></div><div><b>${j.delivery_fee?Number(j.delivery_fee).toLocaleString('th-TH')+' บาท':'-'}</b><small class="muted" style="display:block">${j.distance_km?Number(j.distance_km).toFixed(1)+' กม.':''}</small></div></div>`}).join(''):'<p class="muted">ยังไม่มีงาน Delivery</p>';
    }catch(err){
      const msg='ยังโหลดทะเบียนวินไม่ได้: '+(err?.message||'กรุณารัน SQL V0.5.22.15');
      if(list)list.innerHTML=`<p class="muted">${esc(msg)}</p>`;
      if(jobs)jobs.innerHTML='';
    }
  }
  async function saveAdminRider(ev){
    ev.preventDefault();
    if(!db||profile?.role!=='admin')return alert('เฉพาะ Admin เท่านั้น');
    const f=ev.currentTarget,name=f.elements.rider_name.value.trim(),phone=f.elements.rider_phone.value.trim();
    if(!name||!phone)return alert('กรอกชื่อและเบอร์โทรวินให้ครบ');
    try{
      const {error}=await db.rpc('market_admin_upsert_rider',{p_name:name,p_phone:phone});
      if(error)throw error;
      f.reset();await loadRiderAdminPanel();showNotice('บันทึกวินในทะเบียนแล้ว');
    }catch(err){alert('เพิ่มวินไม่สำเร็จ: '+(err?.message||err));}
  }
  async function toggleAdminRider(id,enabled){
    if(!db||profile?.role!=='admin')return;
    try{
      const {error}=await db.rpc('market_admin_set_rider_enabled',{p_rider_id:id,p_enabled:!enabled});
      if(error)throw error;await loadRiderAdminPanel();
    }catch(err){alert('เปลี่ยนสถานะวินไม่สำเร็จ: '+(err?.message||err));}
  }

  async function loadAnalyticsDashboard(period=analyticsPeriod){
    if(!db||profile?.role!=='admin')return;
    const allowed=new Set(['today','7d','30d','all']);
    analyticsPeriod=allowed.has(period)?period:'7d';
    const cards=$('analyticsCards'),top=$('analyticsTopShops'),caption=$('analyticsPeriodCaption');
    if(cards)cards.innerHTML='<div class="analytics-loading">กำลังโหลดสถิติ...</div>';
    if(top)top.innerHTML='';
    const labels={today:'วันนี้ ตั้งแต่ 00:00 น.', '7d':'7 วันปฏิทินล่าสุด', '30d':'30 วันปฏิทินล่าสุด', all:'สะสมทั้งหมดตั้งแต่เริ่มเก็บข้อมูล'};
    if(caption)caption.textContent=labels[analyticsPeriod]||'';
    try{
      const [{data:summary,error:e1},{data:shopsData,error:e2}]=await Promise.all([
        db.rpc('market_analytics_summary_v2',{p_period:analyticsPeriod}),
        db.rpc('market_analytics_top_shops_v2',{p_period:analyticsPeriod,p_limit:10})
      ]);
      if(e1)throw e1;if(e2)throw e2;
      const rows=summary||[],byType=Object.fromEntries(rows.map(r=>[r.event_type,r]));
      const unique=Math.max(...rows.map(r=>Number(r.unique_sessions||0)),0);
      const metrics=[['ผู้เข้าชมโดยประมาณ (ไม่ซ้ำ)',unique,'sessions'],['จำนวนครั้งที่เปิดเว็บ',Number(byType.page_view?.event_count||0),'page_view'],['เปิดดูร้าน',Number(byType.shop_view?.event_count||0),'shop_view'],['กดนำทาง',Number(byType.navigate_click?.event_count||0),'navigate_click'],['กดโทร',Number(byType.phone_click?.event_count||0),'phone_click'],['คลิกช่องทางสั่งซื้อ',Number(byType.order_click?.event_count||0)+Number(byType.order_lineman_click?.event_count||0)+Number(byType.order_grab_click?.event_count||0)+Number(byType.order_shopee_click?.event_count||0),'order_click']];
      if(cards)cards.innerHTML=metrics.map(([label,value,key])=>`<div class="analytics-card"><small>${esc(label)}</small><strong>${Number(value).toLocaleString('th-TH')}</strong><span>${key==='sessions'?'session โดยประมาณ':'ครั้ง'}</span></div>`).join('');
      if(top)top.innerHTML=(shopsData||[]).length?(shopsData||[]).map((r,i)=>`<div class="analytics-shop-row"><b>${i+1}. ${esc(r.shop_name||'ร้านค้า')}</b><span>${Number(r.view_count||0).toLocaleString('th-TH')} ครั้ง</span></div>`).join(''):'<p class="muted">ยังไม่มีข้อมูลการเปิดดูร้านในช่วงนี้</p>';
      document.querySelectorAll('[data-analytics-period]').forEach(b=>b.classList.toggle('active',b.dataset.analyticsPeriod===analyticsPeriod));
    }catch(err){if(cards)cards.innerHTML=`<div class="analytics-error">ยังโหลดสถิติไม่ได้: ${esc(err.message||'กรุณารัน SQL Analytics V0.5.22.10')}</div>`;}
  }


  let shops = [], shopIndex = [], featuredShops = [], favoriteShops = [], categories = [], promotions = [], reviewStats = {}, favorites = new Set(), currentCategory = 'all', session = null, profile = null, shopSort = 'recommended', shopOnlyOpen = false, shopOnlyPromo = false, shopTotalCount = 0, shopPage = 0, shopLoading = false;
  const SHOP_PAGE_SIZE = 10;
  let map, mapMarkers = [], mapMarkerLayer = null, userLocation = null, userMarker = null, userAccuracyCircle = null, mapFilterMode = 'all', mapCategoryFilter = 'all';
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

  function normalizeLoginPhone(value=''){
    const d=String(value||'').replace(/\D/g,'');
    if(/^0\d{9}$/.test(d))return '+66'+d.slice(1);
    if(/^66\d{9}$/.test(d))return '+'+d;
    return null;
  }
  function phoneLoginEmail(phone=''){
    const p=normalizeLoginPhone(phone);
    return p ? p.slice(1)+'@phone.talad-kratumbaen.invalid' : null;
  }
  function setAuthMethod(method){
    const form=$('authForm'); if(!form)return;
    const phone=method==='phone';
    form.elements.auth_method.value=phone?'phone':'email';
    form.elements.email.required=!phone; form.elements.phone.required=phone;
    $('authEmailLabel').classList.toggle('hidden',phone);
    $('authPhoneLabel').classList.toggle('hidden',!phone);
    $('authPhoneHelp').classList.toggle('hidden',!phone);
    document.querySelectorAll('[data-auth-method]').forEach(b=>b.classList.toggle('active',b.dataset.authMethod===(phone?'phone':'email')));
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

  function hasShopCoordinates(shop){
    const lat=Number(shop?.latitude), lng=Number(shop?.longitude);
    return Number.isFinite(lat)&&Number.isFinite(lng)&&lat!==0&&lng!==0&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
  }

  function googleMapsTarget(shop){
    if(hasShopCoordinates(shop)){
      return {url:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${Number(shop.latitude)},${Number(shop.longitude)}`)}`,label:'🧭 นำทาง'};
    }
    const query=[shop?.name,shop?.address,'กระทุ่มแบน สมุทรสาคร'].filter(Boolean).join(' ');
    return query?{url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,label:'🔎 ค้นหาใน Google Maps'}:null;
  }

  function markerPopup(shop){
    const category=shop.category?.name||'ร้านค้า';
    const rating=ratingForShop(shop.id);
    const state=openState(shop);
    const promo=visiblePromotionForShop(shop.id);
    const distance=shopDistance(shop);
    const mapsTarget=googleMapsTarget(shop);
    return `<div class="map-shop-popup">
      <div class="map-popup-title">${esc(shop.name)}</div>
      <div class="map-popup-category">${esc(category)}</div>
      ${rating.count?`<div class="map-popup-line">⭐ ${rating.average.toFixed(1)} (${rating.count} รีวิว)</div>`:''}
      <div class="map-popup-line ${state.open===true?'open':state.open===false?'closed':''}">${state.open===true?'🟢':state.open===false?'🔴':'🕒'} ${esc(state.text)}</div>
      ${distance==null?'':`<div class="map-popup-line">📏 ห่าง ${esc(formatDistance(distance))}</div>`}
      ${shop.landmark?`<div class="map-popup-line map-popup-landmark">📍 จุดสังเกต: ${esc(shop.landmark)}</div>`:''}
      ${promo?`<div class="map-popup-promo">🔥 ${esc(promo.discount_text||promo.title||'มีโปรโมชั่น')}</div>`:''}
      <div class="map-popup-actions">
        <button type="button" data-action="details" data-shop-id="${esc(shop.id)}">ดูร้านค้า</button>
        ${mapsTarget?`<a href="${esc(mapsTarget.url)}" target="_blank" rel="noopener noreferrer">${esc(mapsTarget.label)}</a>`:''}
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
    L.tileLayer(tiles,{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
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
    box.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',async()=>{box.querySelectorAll('button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');currentCategory=btn.dataset.category;await resetShopList({scroll:true});}));
    renderMapFilters();
  }

  async function loadShopIndex(){
    if(!db){ shopIndex=DEMO; return; }
    const {data,error}=await db.from('market_shops')
      .select('id,name,description,address,landmark,category_id,created_at,featured,latitude,longitude,opening_hours,temporarily_closed,open_24_hours,category:market_categories(id,name,icon)')
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

  async function loadPublicShops({reset=false,page=null,scroll=false}={}){
    if(!db){
      shops=DEMO; shopIndex=DEMO; shopTotalCount=DEMO.length; shopPage=0;
      showNotice('กำลังแสดงข้อมูลตัวอย่าง — กรุณาใส่ Supabase URL และ Anon Key ใน config.js');
      renderShops(); renderRecommended(); return;
    }
    if(shopLoading)return;
    shopLoading=true;
    try{
      if(reset) shopPage=0;
      if(Number.isInteger(page)) shopPage=Math.max(0,page);

      const ordered=orderedShopIndex();
      shopTotalCount=ordered.length;
      const totalPages=Math.max(1,Math.ceil(shopTotalCount/SHOP_PAGE_SIZE));
      if(shopPage>=totalPages) shopPage=Math.max(0,totalPages-1);

      const start=shopPage*SHOP_PAGE_SIZE;
      const pageIds=ordered.slice(start,start+SHOP_PAGE_SIZE).map(shop=>shop.id);
      shops=pageIds.length?await fetchFullShopsByIds(pageIds):[];

      hideNotice();
      renderShops();
      await loadFeaturedShops();
      if(scroll) scrollToShopList();
    }finally{
      shopLoading=false;
    }
  }

  function scrollToShopList(){
    const target=document.getElementById('shopResultsSection')||document.getElementById('shopGrid');
    if(!target)return;
    const top=target.getBoundingClientRect().top+window.scrollY-84;
    window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  }

  async function goToShopPage(page){
    const totalPages=Math.max(1,Math.ceil(shopTotalCount/SHOP_PAGE_SIZE));
    const next=Math.min(Math.max(0,page),totalPages-1);
    if(next===shopPage||shopLoading)return;
    await loadPublicShops({page:next,scroll:true});
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
    missionProgressCache=null;refreshMissionNav().catch(()=>{});
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

  function recommendedCompactCard(s){
    const rating=ratingForShop(s.id);
    const cover=s.cover_url?`<img src="${esc(s.cover_url)}" alt="${esc(s.name)}" loading="lazy" onerror="this.remove()">`:'';
    return `<article class="recommended-compact-card" data-id="${esc(s.id)}">
      <div class="recommended-compact-image">${cover}</div>
      <div class="recommended-compact-body">
        <h3>${esc(s.name)}</h3>
        <div class="rating-line">
          <span>${stars(rating.average)}</span>
          <b>${rating.count?rating.average.toFixed(1):'ใหม่'}</b>
          <small>${rating.count?`${rating.count} รีวิว`:'ยังไม่มีรีวิว'}</small>
        </div>
        <button type="button" class="recommended-detail-btn" data-action="details" data-shop-id="${esc(s.id)}">รายละเอียดเพิ่มเติม</button>
      </div>
    </article>`;
  }

  function renderRecommended(){
    const box=$('recommendedGrid');
    if(!box)return;
    const list=recommendedShops();
    box.innerHTML=list.length?list.map(s=>recommendedCompactCard(s)).join(''):'<div class="empty-inline">ยังไม่มีร้านแนะนำ</div>';
  }


  let missionRewardCache=null;
  async function loadMissionReward(force=false){
    if(!db)return null;
    if(missionRewardCache&&!force)return missionRewardCache;
    try{
      const {data,error}=await db.from('market_mission_settings').select('mission_active,reward_title,reward_detail,claim_note,reward_active,reward_claim_until,updated_at,coupon_id').eq('mission_key','mission_v1').maybeSingle();
      if(error)throw error;
      const result=data||{mission_active:true,reward_title:'',reward_detail:'',claim_note:'',reward_active:false,reward_claim_until:null,coupon_id:null};
      if(result.coupon_id){
        const {data:coupon}=await db.rpc('market_coupon_get',{p_coupon_id:result.coupon_id});
        result.coupon=coupon&&typeof coupon==='object'?coupon:null;
      }
      return missionRewardCache=result;
    }catch(_e){return missionRewardCache={mission_active:true,reward_title:'',reward_detail:'',claim_note:'',reward_active:false,reward_claim_until:null,coupon_id:null,coupon:null};}
  }
  function missionRewardHtml(reward,allDone=false){
    if(!reward?.reward_active||!reward?.reward_title)return '';
    return `<div class="mission-reward ${allDone?'earned':''}"><div class="mission-reward-icon">🎁</div><div><small>${allDone?'รางวัลของคุณ':'รางวัลเมื่อทำครบ'}</small><b>${esc(reward.reward_title)}</b>${reward.reward_detail?`<p>${esc(reward.reward_detail)}</p>`:''}${allDone&&reward.claim_note?`<em>วิธีรับ: ${esc(reward.claim_note)}</em>`:''}</div></div>`;
  }

  function missionRewardClaimExpired(settings){
    if(!settings?.reward_claim_until)return false;
    const t=new Date(settings.reward_claim_until).getTime();
    return Number.isFinite(t)&&Date.now()>t;
  }
  function missionAvailable(settings){
    return settings?.mission_active!==false&&!missionRewardClaimExpired(settings);
  }
  async function loadMissionRewardAdmin(){
    if(profile?.role!=='admin')return;
    const form=$('missionRewardForm');if(!form)return;
    ensureMissionCouponAdminUI();
    const r=await loadMissionReward(true);
    form.elements.mission_active.checked=r?.mission_active!==false;
    form.elements.reward_title.value=r?.reward_title||'';
    form.elements.reward_detail.value=r?.reward_detail||'';
    form.elements.claim_note.value=r?.claim_note||'';
    form.elements.reward_active.checked=Boolean(r?.reward_active);
    if(form.elements.reward_claim_until)form.elements.reward_claim_until.value=toLocalDateTimeInput(r?.reward_claim_until);
    await fillMissionCouponShopOptions(r?.coupon?.shop_id||'');
    if(form.elements.mission_coupon_active)form.elements.mission_coupon_active.checked=Boolean(r?.coupon?.active);
    if(form.elements.mission_coupon_discount_type)form.elements.mission_coupon_discount_type.value=r?.coupon?.discount_type||'fixed';
    if(form.elements.mission_coupon_discount_value)form.elements.mission_coupon_discount_value.value=r?.coupon?.discount_value??'';
    if(form.elements.mission_coupon_min_spend)form.elements.mission_coupon_min_spend.value=r?.coupon?.min_spend??0;
    if(form.elements.mission_coupon_max_discount)form.elements.mission_coupon_max_discount.value=r?.coupon?.max_discount??'';
    if(form.elements.mission_coupon_channel)form.elements.mission_coupon_channel.value=r?.coupon?.channel||'both';
    if(form.elements.mission_coupon_ends_at)form.elements.mission_coupon_ends_at.value=toLocalDateTimeInput(r?.coupon?.ends_at);
    const st=$('missionRewardAdminStatus');if(st)st.textContent=r?.updated_at?`อัปเดตล่าสุด ${new Date(r.updated_at).toLocaleString('th-TH')}`:'ยังไม่ได้ตั้งรางวัล';
  }
  async function saveMissionReward(ev){
    ev.preventDefault();if(!db||profile?.role!=='admin')return alert('เฉพาะ Admin เท่านั้น');
    const f=ev.currentTarget,btn=f.querySelector('button[type="submit"]');
    const couponActive=Boolean(f.elements.mission_coupon_active?.checked);
    const payload={p_mission_active:f.elements.mission_active.checked,p_reward_title:f.elements.reward_title.value.trim(),p_reward_detail:f.elements.reward_detail.value.trim(),p_claim_note:f.elements.claim_note.value.trim(),p_reward_active:f.elements.reward_active.checked,p_reward_claim_until:f.elements.reward_claim_until?.value?new Date(f.elements.reward_claim_until.value).toISOString():null,
      p_coupon_active:couponActive,p_coupon_shop_id:f.elements.mission_coupon_shop_id?.value||null,p_coupon_discount_type:f.elements.mission_coupon_discount_type?.value||'fixed',p_coupon_discount_value:Number(f.elements.mission_coupon_discount_value?.value||0),p_coupon_min_spend:Number(f.elements.mission_coupon_min_spend?.value||0),p_coupon_max_discount:f.elements.mission_coupon_max_discount?.value?Number(f.elements.mission_coupon_max_discount.value):null,p_coupon_channel:f.elements.mission_coupon_channel?.value||'both',p_coupon_ends_at:f.elements.mission_coupon_ends_at?.value?new Date(f.elements.mission_coupon_ends_at.value).toISOString():null};
    if(payload.p_reward_active&&!payload.p_reward_title)return alert('กรุณาระบุชื่อรางวัลก่อนเปิดใช้งาน');
    if(couponActive&&!payload.p_coupon_shop_id)return alert('กรุณาเลือกร้านสำหรับคูปอง Mission');
    if(couponActive&&(!Number.isFinite(payload.p_coupon_discount_value)||payload.p_coupon_discount_value<=0))return alert('กรุณาระบุส่วนลดคูปองให้มากกว่า 0');
    if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก...';}
    try{const {error}=await db.rpc('market_admin_set_mission_reward',payload);if(error)throw error;missionRewardCache=null;missionProgressCache=null;await loadMissionRewardAdmin();await refreshMissionNav();if(!f.elements.mission_active.checked){closeModal('missionModal');closeModal('missionWelcomeModal');}alert('บันทึกการตั้งค่า Mission แล้ว');}
    catch(err){alert('บันทึกรางวัลไม่สำเร็จ: '+(err.message||err));}
    finally{if(btn){btn.disabled=false;btn.textContent='💾 บันทึกการตั้งค่า Mission';}}
  }

  const MISSION_V1=[
    {id:'explorer',icon:'🔍',title:'นักสำรวจตลาด',detail:'เปิดดูรายละเอียดร้านไม่ซ้ำกัน 5 ร้าน',goal:5},
    {id:'favorite',icon:'❤️',title:'ร้านที่ถูกใจ',detail:'เพิ่มร้านชื่นชอบ 3 ร้าน',goal:3},
    {id:'review',icon:'⭐',title:'เสียงจากลูกค้า',detail:'รีวิวร้านค้า 1 ร้าน',goal:1},
    {id:'buyer',icon:'🛍️',title:'อุดหนุนร้านในชุมชน',detail:'มีออเดอร์สำเร็จ 1 ออเดอร์',goal:1}
  ];
  let missionProgressCache=null;
  async function recordMissionShopView(shopId){
    if(!db||!session||!shopId)return;
    try{await db.from('market_mission_shop_views').upsert({user_id:session.user.id,shop_id:shopId,last_viewed_at:new Date().toISOString()},{onConflict:'user_id,shop_id'});missionProgressCache=null;refreshMissionNav().catch(()=>{});}catch(_e){}
  }
  async function loadMissionProgress(force=false){
    if(!session||!db)return null;if(missionProgressCache&&!force)return missionProgressCache;const uid=session.user.id;
    const [{count:viewCount},{count:favCount},{count:reviewCount},{data:fulfilledCount,error:fulfilledError}]=await Promise.all([
      db.from('market_mission_shop_views').select('shop_id',{count:'exact',head:true}).eq('user_id',uid),
      db.from('market_favorites').select('shop_id',{count:'exact',head:true}).eq('user_id',uid),
      db.from('market_reviews').select('id',{count:'exact',head:true}).eq('user_id',uid).eq('status','approved'),
      db.rpc('market_mission_completed_order_count')
    ]);
    if(fulfilledError)throw fulfilledError;
    const values={explorer:Number(viewCount||0),favorite:Number(favCount||0),review:Number(reviewCount||0),buyer:Number(fulfilledCount||0)};
    const items=MISSION_V1.map(m=>({...m,value:Math.min(values[m.id]||0,m.goal),done:(values[m.id]||0)>=m.goal}));
    return missionProgressCache={items,done:items.filter(x=>x.done).length,total:items.length,allDone:items.every(x=>x.done)};
  }
  async function refreshMissionNav(){
    const btn=$('missionBtn'),count=$('missionNavCount');if(!btn)return;
    if(!session){btn.classList.add('hidden');if(count)count.textContent='';return;}
    try{
      const settings=await loadMissionReward(true);
      const active=missionAvailable(settings);
      btn.classList.toggle('hidden',!active);
      if(!active){if(count)count.textContent='';return;}
      const p=await loadMissionProgress(true);if(count)count.textContent=p?`${p.done}/${p.total}`:'';
    }catch(_e){btn.classList.add('hidden');if(count)count.textContent='';}
  }
  async function showMissionWelcomeOncePerDay(){
    const modal=$('missionWelcomeModal');
    if(!modal)return;
    const settings=await loadMissionReward(true);
    if(!missionAvailable(settings))return;
    const now=new Date();
    const dayKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const storageKey='market_mission_welcome_last_seen_v0_5_21_8';
    try{
      if(localStorage.getItem(storageKey)===dayKey)return;
    }catch(_e){}
    setTimeout(()=>{
      // Do not interrupt another modal that is already open (e.g. password recovery/direct-link flow).
      const anotherOpen=[...document.querySelectorAll('.modal:not(.hidden)')].some(x=>x.id!=='missionWelcomeModal');
      if(anotherOpen)return;
      openModal('missionWelcomeModal');
      // Mark as seen only after the popup is actually opened.
      try{localStorage.setItem(storageKey,dayKey);}catch(_e){}
    },1400);
  }

  async function openMission(){
    const settings=await loadMissionReward(true);
    if(settings?.mission_active===false)return alert('ขณะนี้ Mission ยังไม่ได้เปิดใช้งาน');
    if(missionRewardClaimExpired(settings))return alert('Mission นี้สิ้นสุดระยะเวลารับรางวัลแล้ว');
    if(!session){openModal('authModal');return alert('กรุณาเข้าสู่ระบบก่อนทำ Mission');}
    const box=$('missionContent');openModal('missionModal');if(box)box.innerHTML='<h2>🎯 Mission กระทุ่มแบน</h2><p>กำลังตรวจสอบความคืบหน้า...</p>';
    try{const [p,reward]=await Promise.all([loadMissionProgress(true),loadMissionReward(true)]);if(p.allDone&&db){try{await db.rpc('market_sync_mission_coupon_claim');}catch(syncErr){console.warn('mission coupon sync skipped',syncErr);}}const percent=Math.round(p.done/p.total*100);
      box.innerHTML=`<div class="mission-head"><div><span class="eyebrow red">ภารกิจเริ่มต้น</span><h2>🎯 Mission กระทุ่มแบน</h2><p>ลองใช้ฟังก์ชันต่าง ๆ ของตลาดให้ครบ ${p.total} ภารกิจ</p></div><strong class="mission-score">${p.done}/${p.total}</strong></div>${missionRewardHtml(reward,p.allDone)}<div class="mission-progress"><span style="width:${percent}%"></span></div><div class="mission-list">${p.items.map(m=>`<article class="mission-item ${m.done?'done':''}"><div class="mission-icon">${m.done?'✅':m.icon}</div><div class="mission-copy"><b>${esc(m.title)}</b><small>${esc(m.detail)}</small><div class="mission-mini-progress"><span style="width:${Math.min(100,Math.round(m.value/m.goal*100))}%"></span></div></div><strong>${m.value}/${m.goal}</strong></article>`).join('')}</div>${p.allDone?`<div class="mission-complete">🎉 Mission สำเร็จครบแล้ว!<small>${reward?.reward_active&&reward?.reward_title?'คุณได้รับสิทธิ์รางวัลตามที่แสดงด้านบน':'ขณะนี้ Admin ยังไม่ได้เปิดรางวัลสำหรับ Mission นี้'}</small></div>`:'<div class="mission-note">ระบบตรวจ Mission ให้อัตโนมัติ ไม่ต้องกดยืนยันว่าทำแล้ว</div>'}`;
    }catch(err){const msg=err?.message||String(err||'ไม่ทราบสาเหตุ');box.innerHTML=`<h2>🎯 Mission กระทุ่มแบน</h2><div class="mission-note">โหลด Mission ไม่สำเร็จ<br><small>${esc(msg)}</small></div>`;console.error('Mission load failed',err);}
  }

  async function openShopDetails(shopId){
    trackAnalytics('shop_view',shopId);
    let shop=null;
    try{shop=await getFullShop(shopId);}catch(err){console.error(err);}
    if(!shop)return alert('ไม่พบข้อมูลร้านค้านี้');
    recordMissionShopView(shopId);
    const promo=visiblePromotionForShop(shopId);
    const rating=ratingForShop(shopId);
    const mapsTarget=googleMapsTarget(shop);
    const contactButtons=[
      mapsTarget?`<a class="detail-action go" href="${esc(mapsTarget.url)}" target="_blank" rel="noopener noreferrer">${esc(mapsTarget.label)}</a>`:'',
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
      ${shop.landmark?`<p class="detail-landmark"><b>📍 จุดสังเกต:</b> ${esc(shop.landmark)}</p>`:''}
      ${promo?`<div class="detail-promo"><b>🔥 ${esc(promo.title)}</b><span>${esc(promo.description||'')}</span><small>⏰ ${esc(promotionTimingText(promo))}</small></div>`:''}
      <div id="shopPublicCouponBox" data-shop-coupons="${esc(shop.id)}"></div>
      ${deliveryButtons?`<div class="detail-order-grid">${deliveryButtons}</div>`:''}
      <div class="detail-action-grid">${contactButtons}</div>
      <div class="shop-share-actions">
        <button type="button" data-share-shop="${esc(shop.id)}">↗️ แชร์ร้านนี้</button>
        <button type="button" data-copy-shop-link="${esc(shop.id)}">🔗 คัดลอกลิงก์ร้าน</button>
        <button type="button" data-browse-other-shops>🏪 ดูร้านอื่นในตลาด</button>
      </div>
    `;
    $('reviewShopId').value=shopId;
    $('reviewShopName').textContent=shop.name;
    closeModal('promotionDetailModal');
    openModal('shopDetailModal');
    await Promise.all([loadShopReviews(shopId),loadPublicShopCoupons(shopId)]);
  }

  function shopDirectUrl(shopId){
    const u=new URL(window.location.href);
    u.searchParams.set('shop',String(shopId));
    ['order','group','job','rider_job'].forEach(k=>u.searchParams.delete(k));
    u.hash='';
    return u.toString();
  }
  async function copyShopDirectLink(shopId){
    const url=shopDirectUrl(shopId);
    try{await navigator.clipboard.writeText(url);showNotice('คัดลอกลิงก์ร้านแล้ว');}
    catch(_e){prompt('คัดลอกลิงก์ร้านนี้',url);}
  }
  async function shareShopDirectLink(shopId){
    const shop=[...shops,...shopIndex].find(s=>String(s.id)===String(shopId));
    const url=shopDirectUrl(shopId);
    if(navigator.share){
      try{await navigator.share({title:shop?.name||'ร้านค้าในตลาดกระทุ่มแบน',text:`ดูร้าน ${shop?.name||''} ในตลาดกระทุ่มแบน`,url});return;}catch(e){if(e?.name==='AbortError')return;}
    }
    copyShopDirectLink(shopId);
  }
  function browseOtherShops(){
    closeModal('shopDetailModal');
    const u=new URL(window.location.href);u.searchParams.delete('shop');
    history.replaceState({},'',u.pathname+(u.searchParams.toString()?`?${u.searchParams}`:'')+u.hash);
    document.getElementById('shops')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function handleShopDirectLink(){
    const shopId=new URLSearchParams(location.search).get('shop');
    if(!shopId)return;
    // Direct shop links land on that shop, but the rest of the marketplace remains available.
    await openShopDetails(shopId);
  }

  async function loadShopReviews(shopId,targetId='reviewList'){
    const box=$(targetId);
    box.innerHTML='<p>กำลังโหลดรีวิว...</p>';
    if(!db){box.innerHTML='<p>ยังไม่มีรีวิว</p>';return;}

    const id=String(shopId||'').trim();
    let data=null,error=null;
    const rpcResult=await db.rpc('market_public_shop_reviews',{p_shop_id:id});
    if(!rpcResult.error){
      data=Array.isArray(rpcResult.data)?rpcResult.data:(rpcResult.data||[]);
    }else{
      console.warn('market_public_shop_reviews fallback',rpcResult.error);
      const fallbackDirect=await db
        .from('market_reviews')
        .select('id,shop_id,reviewer_name,rating,comment,status,created_at')
        .eq('shop_id',id)
        .eq('status','approved')
        .order('created_at',{ascending:false})
        .limit(50);
      data=fallbackDirect.data; error=fallbackDirect.error;
    }

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
    ensureShopCouponManagerUI();
    await Promise.all([loadOwnerPromotions(shopId),loadShopCoupons(shopId)]);
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
    if(!currentDisplayName()){
      alert('ก่อนรีวิว กรุณาตั้ง “ชื่อที่ใช้แสดงในระบบ” ก่อน');
      closeModal('reviewModal');
      openProfileNameEditor();
      return;
    }
    const payload={
      shop_id:shopId,
      user_id:session.user.id,
      reviewer_name:currentDisplayName()||'สมาชิกตลาด',
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
      renderShops();renderRecommended();missionProgressCache=null;refreshMissionNav().catch(()=>{});
    }catch(err){alert('ส่งรีวิวไม่สำเร็จ: '+friendlyAuthError(err.message));}
    finally{btn.disabled=false;btn.textContent='ส่งรีวิว';}
  }


  const MARKET_MAP_CENTER={lat:13.6549,lng:100.2639};
  const MARKET_MAP_MAX_DISTANCE_KM=30;

  function validCoordinates(shop){
    const lat=Number(shop?.latitude), lng=Number(shop?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat>=-90 && lat<=90 && lng>=-180 && lng<=180 && !(lat===0&&lng===0);
  }

  function validMarketCoordinates(shop){
    if(!validCoordinates(shop))return false;
    return distanceKm(MARKET_MAP_CENTER.lat,MARKET_MAP_CENTER.lng,Number(shop.latitude),Number(shop.longitude))<=MARKET_MAP_MAX_DISTANCE_KM;
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

  async function resetShopList({scroll=false}={}){
    await loadPublicShops({reset:true,scroll});
  }

  function shopCard(s, dashboard=false){
    const category=s.category?.name||'ร้านค้า';
    const cover=s.cover_url?`<img src="${esc(s.cover_url)}" alt="${esc(s.name)}" loading="lazy" onerror="this.remove()">`:'';
    const rating=ratingForShop(s.id);
    const state=openState(s);

    if(dashboard){
      const status=`<span class="status-pill ${s.status==='approved'?'approved':''}">${s.status==='approved'?'เผยแพร่แล้ว':s.status==='rejected'?'ไม่อนุมัติ':'รอตรวจสอบ'}</span>`;
      return `<article class="card" data-id="${esc(s.id)}">
        <div class="card-img">${cover}<span class="tag">${esc(category)}</span></div>
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h3>${esc(s.name)}</h3>${status}</div>
          <div class="rating-line"><span>${stars(rating.average)}</span><b>${rating.count?rating.average.toFixed(1):'ใหม่'}</b><small>${rating.count?`(${rating.count})`:'ยังไม่มีรีวิว'}</small></div>
          <p>${esc(s.description||'ร้านค้าในตลาดกระทุ่มแบน')}</p>
          <div class="community-actions"><button data-action="details">ดูรายละเอียด</button><button data-action="review">⭐ รีวิว</button>${favoriteButton(s.id)}</div>
          <div class="admin-actions"><button data-action="edit">แก้ไขร้าน</button><button class="manage-promo-btn" data-action="manage-promotions">⚙️ จัดการโปรโมชั่น</button><button data-action="promotion">+ เพิ่มโปรโมชั่น</button>${profile?.role==='admin'&&s.status!=='approved'?'<button data-action="approve">อนุมัติ</button>':''}${profile?.role==='admin'?`${s.status==='approved'&&s.delivery_access_known?`<button class="${s.delivery_access_enabled?'delivery-access-on':'delivery-access-off'}" data-action="admin-delivery-toggle" data-enabled="${s.delivery_access_enabled?'true':'false'}">${s.delivery_access_enabled?'🟢 Delivery เปิด':'⚪ Delivery ปิด'}</button>`:''}<button data-action="feature">${s.featured?'ยกเลิกแนะนำ':'แนะนำร้าน'}</button><button data-action="reject">ไม่อนุมัติ</button>`:''}</div>
        </div>
      </article>`;
    }

    return `<article class="card compact-shop-card" data-id="${esc(s.id)}">
      <div class="card-img">${cover}</div>
      <div class="card-body">
        <h3>${esc(s.name)}</h3>
        <div class="rating-line">
          <span>${stars(rating.average)}</span>
          <b>${rating.count?rating.average.toFixed(1):'ใหม่'}</b>
          <small>${rating.count?`${rating.count} รีวิว`:'ยังไม่มีรีวิว'}</small>
        </div>
        <p class="compact-shop-description">${esc(s.description||'ร้านค้าในตลาดกระทุ่มแบน')}</p>
        <div class="compact-shop-footer">
          <div class="open-badge ${state.open===false?'closed':''}">${state.open===true?'🟢':state.open===false?'🔴':'🕒'} ${esc(state.text)}</div>
          <button data-action="details">ดูรายละเอียด</button>
        </div>
      </div>
    </article>`;
  }

  function renderShops(){
    const shown=shops;
    const totalPages=Math.max(1,Math.ceil(shopTotalCount/SHOP_PAGE_SIZE));
    const currentPage=Math.min(shopPage+1,totalPages);
    const start=shopTotalCount?shopPage*SHOP_PAGE_SIZE+1:0;
    const end=shopTotalCount?Math.min(shopPage*SHOP_PAGE_SIZE+shown.length,shopTotalCount):0;

    $('shopGrid').innerHTML=shown.map(s=>shopCard(s)).join('');
    $('resultCount').textContent=shopTotalCount
      ? `พบ ${shopTotalCount} ร้าน • แสดง ${start}–${end} • หน้า ${currentPage} จาก ${totalPages}`
      : 'ไม่พบร้านค้า';
    $('shopCount').textContent=shopIndex.length;
    $('emptyState').classList.toggle('hidden',shopTotalCount>0);

    renderShopPagination(totalPages,currentPage);
    renderPins(shopIndex);
  }

  function paginationItems(totalPages,current){
    if(totalPages<=7)return Array.from({length:totalPages},(_,i)=>i+1);
    const items=[1];
    let from=Math.max(2,current-1),to=Math.min(totalPages-1,current+1);
    if(current<=3)to=4;
    if(current>=totalPages-2)from=totalPages-3;
    if(from>2)items.push('…');
    for(let i=from;i<=to;i++)items.push(i);
    if(to<totalPages-1)items.push('…');
    items.push(totalPages);
    return items;
  }

  function renderShopPagination(totalPages,currentPage){
    const pager=$('shopPagination');
    if(!pager)return;
    if(shopTotalCount<=SHOP_PAGE_SIZE){
      pager.innerHTML='';
      pager.classList.add('hidden');
      return;
    }
    pager.classList.remove('hidden');
    const pages=paginationItems(totalPages,currentPage).map(item=>item==='…'
      ? '<span class="page-ellipsis" aria-hidden="true">…</span>'
      : `<button type="button" class="page-number ${item===currentPage?'active':''}" data-shop-page="${item-1}" ${item===currentPage?'aria-current="page"':''}>${item}</button>`).join('');
    pager.innerHTML=`
      <div class="pagination-summary">หน้า <b>${currentPage}</b> จาก <b>${totalPages}</b></div>
      <div class="pagination-controls">
        <button type="button" class="page-nav first" data-shop-page="0" ${currentPage===1?'disabled':''}>⏮ หน้าแรก</button>
        <button type="button" class="page-nav" data-shop-page="${shopPage-1}" ${currentPage===1?'disabled':''}>← ก่อนหน้า</button>
        <div class="page-numbers" aria-label="เลือกหน้าร้านค้า">${pages}</div>
        <button type="button" class="page-nav" data-shop-page="${shopPage+1}" ${currentPage===totalPages?'disabled':''}>ถัดไป →</button>
      </div>`;
  }

  function renderPins(list){
    if(mapMarkerLayer)mapMarkerLayer.clearLayers();
    mapMarkers=[];
    const filtered=filteredMapShops(list);
    const valid=filtered.filter(validMarketCoordinates);
    const invalidCount=filtered.filter(s=>validCoordinates(s)&&!validMarketCoordinates(s)).length;
    valid.forEach(shop=>{
      const ll=[+shop.latitude,+shop.longitude];
      const marker=L.marker(ll,{icon:shopMarkerIcon(shop)}).bindPopup(markerPopup(shop),{maxWidth:290});
      mapMarkers.push(marker);
      mapMarkerLayer.addLayer(marker);
    });
    $('mapResultCount') && ($('mapResultCount').textContent=`แสดง ${valid.length} ร้านบนแผนที่${invalidCount?` • ไม่แสดง ${invalidCount} ร้านที่พิกัดอยู่นอกพื้นที่`:''}`);
    if(valid.length>1){
      const bounds=L.latLngBounds(valid.map(s=>[+s.latitude,+s.longitude]));
      map.fitBounds(bounds.pad(.22),{maxZoom:16});
    }else if(valid.length===1){
      map.setView([+valid[0].latitude,+valid[0].longitude],17);
    }
  }


  function cleanDisplayName(value=''){
    return String(value||'').replace(/\s+/g,' ').trim().slice(0,50);
  }

  function currentDisplayName(){
    return cleanDisplayName(profile?.display_name||session?.user?.user_metadata?.display_name||'');
  }

  async function saveMyDisplayName(name,{silent=false}={}){
    if(!db||!session?.user?.id)throw new Error('กรุณาเข้าสู่ระบบก่อน');
    const displayName=cleanDisplayName(name);
    if(displayName.length<2)throw new Error('กรุณาตั้งชื่ออย่างน้อย 2 ตัวอักษร');
    const {data,error}=await db.rpc('market_set_my_display_name',{p_display_name:displayName});
    if(error)throw error;
    const {data:p,error:profileError}=await db.from('market_profiles').select('*').eq('id',session.user.id).maybeSingle();
    if(profileError)throw profileError;
    profile=p;
    try{await db.auth.updateUser({data:{display_name:displayName}});}catch(_err){}
    updateAccountUI();
    fillProfileDisplayName();
    await loadMyRiderApplication();
    if(!silent)alert('บันทึกชื่อที่ใช้แสดงเรียบร้อยแล้ว');
    return data;
  }

  function fillProfileDisplayName(){
    const form=$('profileDisplayNameForm');
    if(!form)return;
    const name=currentDisplayName();
    form.elements.display_name.value=name;
    const status=$('profileNameStatus');
    if(status)status.textContent=name?`แสดงเป็น “${name}”`:'ยังไม่ได้ตั้งชื่อ';
  }

  function openProfileNameEditor(){
    if(!session)return openModal('authModal');
    const form=$('mobileProfileDisplayNameForm');
    if(form?.elements?.display_name)form.elements.display_name.value=currentDisplayName();
    openModal('profileNameModal');
    setTimeout(()=>form?.elements?.display_name?.focus(),80);
  }

  async function refreshAuth(){
    if(!db){ updateAccountUI(); return; }
    const {data}=await db.auth.getSession(); session=data.session;
    profile=null;
    if(session){
      const {data:p}=await db.from('market_profiles').select('*').eq('id',session.user.id).maybeSingle();profile=p;
      const metadataName=cleanDisplayName(session.user.user_metadata?.display_name||'');
      if(!cleanDisplayName(profile?.display_name)&&metadataName){
        try{await saveMyDisplayName(metadataName,{silent:true});}catch(err){console.warn('display name metadata sync skipped',err);}
      }
    }
    updateAccountUI();
    fillProfileDisplayName();
    await loadFavorites();
    renderShops(); renderRecommended();
    if(session) await loadDashboard();
  }

  function updateAccountUI(){
    document.body.classList.toggle('guest-session',!session);
    const accountBtn=$('accountBtn');
    const headerUserName=$('headerUserName');
    if(accountBtn){
      accountBtn.innerHTML=session
        ? '<span class="nav-ico">🏪</span><span class="nav-label">ร้านของฉัน</span>'
        : '<span class="nav-ico">👤</span><span class="nav-label">เข้าสู่ระบบ</span>';
    }
    if(headerUserName){
      headerUserName.textContent=session?(currentDisplayName()||'สมาชิก'):'';
      headerUserName.classList.toggle('hidden',!session);
      headerUserName.title=session?'แตะเพื่อแก้ไขชื่อ':'';
      headerUserName.setAttribute('role',session?'button':'status');
      headerUserName.tabIndex=session?0:-1;
    }
    $('dashboard').classList.toggle('hidden',!session);
    const favBtn=$('favoritesBtn'); if(favBtn)favBtn.classList.toggle('hidden',!session);
    const missionBtn=$('missionBtn'); if(missionBtn)missionBtn.classList.add('hidden');
    ensureCouponWalletUI();
    if(session)refreshMissionNav().catch(()=>{});
  }



  let adminActiveView='home';
  function adminViewHeader(title,subtitle=''){
    return `<div class="admin-view-head"><div><h3>${title}</h3>${subtitle?`<small class="muted">${subtitle}</small>`:''}</div><button type="button" class="ghost admin-back-home" data-admin-nav="home">← เมนู Admin</button></div>`;
  }
  function showAdminView(view='home'){
    const panel=$('adminPanel'); if(!panel)return;
    adminActiveView=view;
    panel.querySelectorAll('[data-admin-view]').forEach(el=>el.classList.toggle('hidden',el.dataset.adminView!==view));
    panel.querySelectorAll('[data-admin-nav]').forEach(btn=>btn.classList.toggle('active',btn.dataset.adminNav===view));
    const titles={home:'ศูนย์ควบคุม Admin',shops:'จัดการร้านค้า',mission:'Mission',coupons:'คูปอง',delivery:'Delivery',riders:'วิน / ไรเดอร์',analytics:'สถิติ'};
    const t=$('dashboardTitle');if(t&&profile?.role==='admin')t.textContent=titles[view]||'ศูนย์ควบคุม Admin';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function ensureAdminControlCenter(){
    const panel=$('adminPanel');if(!panel||profile?.role!=='admin')return;
    if($('adminControlCenter'))return;

    const nav=document.createElement('div');nav.id='adminControlCenter';nav.className='admin-control-center';
    nav.innerHTML=`<div class="admin-control-title"><div><span class="eyebrow red">Admin</span><h3>ศูนย์ควบคุมระบบ</h3><small class="muted">เลือกเมนูที่ต้องการจัดการ ไม่ต้องเลื่อนหาทุกระบบในหน้าเดียว</small></div></div><div class="admin-control-grid">
      <button type="button" class="admin-control-btn active" data-admin-nav="home"><span class="ico">🏠</span><b>Dashboard</b><small>หน้าเมนูหลัก</small></button>
      <button type="button" class="admin-control-btn" data-admin-nav="shops"><span class="ico">🏪</span><b>ร้านค้า</b><small>อนุมัติและจัดการร้าน</small></button>
      <button type="button" class="admin-control-btn" data-admin-nav="mission"><span class="ico">🎯</span><b>Mission</b><small>เปิดปิดและตั้งรางวัล</small></button>
      <button type="button" class="admin-control-btn" data-admin-nav="coupons"><span class="ico">🎟️</span><b>คูปอง</b><small>ทางลัดจัดการคูปอง</small></button>
      <button type="button" class="admin-control-btn" data-admin-nav="delivery"><span class="ico">🛵</span><b>Delivery</b><small>ควบคุมระบบจัดส่ง</small></button>
      <button type="button" class="admin-control-btn" data-admin-nav="riders"><span class="ico">👤</span><b>วิน / ไรเดอร์</b><small>รายชื่อและงานล่าสุด</small></button>
      <button type="button" class="admin-control-btn" data-admin-nav="analytics"><span class="ico">📊</span><b>สถิติ</b><small>ผู้เข้าชมและร้านยอดนิยม</small></button>
    </div>`;
    panel.prepend(nav);

    const delivery=$('deliverySystemForm')?.closest('section');
    const riders=$('adminRiderForm')?.closest('section');
    const mission=$('missionRewardForm')?.closest('section');
    const analytics=panel.querySelector('.analytics-panel');
    if(delivery){delivery.dataset.adminView='delivery';delivery.insertAdjacentHTML('afterbegin',adminViewHeader('🛵 Delivery','สวิตช์ควบคุม Delivery ทั้งระบบ'));}
    if(riders){riders.dataset.adminView='riders';riders.insertAdjacentHTML('afterbegin',adminViewHeader('👤 วิน / ไรเดอร์','ทะเบียนวิน เบอร์ติดต่อ และงานล่าสุด'));}
    if(mission){mission.dataset.adminView='mission';mission.insertAdjacentHTML('afterbegin',adminViewHeader('🎯 Mission','ตั้งค่ากิจกรรมและรางวัล Mission'));}
    if(analytics){analytics.dataset.adminView='analytics';analytics.insertAdjacentHTML('afterbegin',adminViewHeader('📊 สถิติ','เลือกดูวันนี้ 7 วัน 30 วัน หรือทั้งหมด'));}

    const pending=$('pendingGrid'),all=$('adminAllGrid');
    if(pending&&all){
      const children=Array.from(panel.children);const start=children.indexOf(pending.previousElementSibling);const end=children.indexOf(all);
      if(start>=0&&end>=start){const wrap=document.createElement('section');wrap.dataset.adminView='shops';wrap.className='admin-shops-view';wrap.innerHTML=adminViewHeader('🏪 ร้านค้า','อนุมัติ แก้ไข และกำหนดสิทธิ์ Delivery รายร้าน');panel.insertBefore(wrap,children[start]);for(let i=start;i<=end;i++)wrap.appendChild(children[i]);}
    }

    const coupon=document.createElement('section');coupon.dataset.adminView='coupons';coupon.className='admin-coupon-view';coupon.innerHTML=adminViewHeader('🎟️ คูปอง','ระบบคูปองใช้จุดจัดการเดิมเพื่อไม่เปลี่ยน logic ที่ใช้งานอยู่')+`<div class="admin-home-note"><b>จัดการคูปองจากจุดเดิมได้เหมือนเดิม</b><p class="muted">คูปอง Mission ตั้งจากหน้า Mission ส่วนคูปองร้านค้าสร้างจาก “จัดการโปรโมชั่น” ของร้านนั้น</p><div class="admin-coupon-links"><button type="button" class="secondary" data-admin-nav="mission">🎯 ไปตั้งคูปอง Mission</button><button type="button" class="secondary" data-admin-nav="shops">🏪 ไปเลือกร้านและจัดการโปรโมชั่น</button></div></div>`;panel.appendChild(coupon);

    const home=document.createElement('section');home.dataset.adminView='home';home.className='admin-home-view';home.innerHTML=`<div class="admin-home-note"><b>เลือกเมนูด้านบนเพื่อจัดการระบบ</b><p class="muted" style="margin-bottom:0">แต่ละฟังก์ชันถูกแยกเป็นหน้าควบคุมภายใน Admin เดียวกัน ข้อมูลและฟังก์ชันเดิมยังใช้ชุดเดิมทั้งหมด</p></div>`;nav.insertAdjacentElement('afterend',home);

    panel.addEventListener('click',ev=>{const b=ev.target.closest('[data-admin-nav]');if(b){ev.preventDefault();showAdminView(b.dataset.adminNav||'home');}});
    showAdminView('home');
  }

  async function loadDashboard(){
    if(!db||!session)return;
    const {data:mine,error}=await db.from('market_shops').select('*, category:market_categories(id,name,icon)').eq('owner_id',session.user.id).order('created_at',{ascending:false});
    if(error) showNotice(error.message,true);
    $('myShopGrid').innerHTML=(mine||[]).length?(mine||[]).map(s=>shopCard(s,true)).join(''):'<p>ยังไม่มีร้านในบัญชีนี้</p>';
    $('adminPanel').classList.toggle('hidden',profile?.role!=='admin');
    if(profile?.role==='admin'){
      ensureAdminControlCenter();
      loadAnalyticsDashboard(analyticsPeriod);
      loadRiderAdminPanel();
      const [{data:pending,error:pendingError},{data:allShops,error:allShopsError},{data:deliveryAccess,error:deliveryAccessError}]=await Promise.all([
        db.from('market_shops').select('*, category:market_categories(id,name,icon)').eq('status','pending').order('created_at'),
        db.from('market_shops').select('*, category:market_categories(id,name,icon)').order('created_at',{ascending:false}),
        db.rpc('market_admin_list_order_shop_access')
      ]);
      if(pendingError)showNotice(pendingError.message,true);
      if(allShopsError)showNotice(allShopsError.message,true);
      if(deliveryAccessError)console.warn('Delivery access:',deliveryAccessError.message);
      const accessMap=new Map((deliveryAccess||[]).map(x=>[String(x.shop_id),Boolean(x.enabled)]));
      const withAccess=(allShops||[]).map(s=>({...s,delivery_access_known:true,delivery_access_enabled:accessMap.get(String(s.id))===true}));
      $('pendingGrid').innerHTML=(pending||[]).length?(pending||[]).map(s=>shopCard({...s,delivery_access_known:true,delivery_access_enabled:false},true)).join(''):'<p>ไม่มีร้านรออนุมัติ</p>';
      loadMissionRewardAdmin().catch(()=>{});
      loadDeliverySystemAdmin().catch(()=>{});
      const adminAllGrid=$('adminAllGrid');
      if(adminAllGrid)adminAllGrid.innerHTML=withAccess.length?withAccess.map(s=>shopCard(s,true)).join(''):'<p>ยังไม่มีร้านค้า</p>';
    }
  }

  async function uploadCover(file, shopId){
    return uploadCompressedImage(file,'shop-images',`${session.user.id}/${shopId}`,{maxWidth:1600,maxHeight:1600,maxBytes:900*1024});
  }

  function useCurrentLocationForShop(){
    const form=$('shopForm'), btn=$('useCurrentShopLocationBtn'), status=$('shopLocationStatus');
    if(!form)return;
    if(!navigator.geolocation){if(status)status.textContent='อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง';return;}
    if(btn){btn.disabled=true;btn.textContent='กำลังหาตำแหน่ง...';}
    if(status)status.textContent='กำลังอ่าน GPS ของอุปกรณ์ กรุณาอยู่ใกล้ตำแหน่งร้าน';
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=Number(pos.coords.latitude), lng=Number(pos.coords.longitude), accuracy=Math.round(pos.coords.accuracy||0);
      if(form.elements.latitude)form.elements.latitude.value=lat.toFixed(7);
      if(form.elements.longitude)form.elements.longitude.value=lng.toFixed(7);
      if(status)status.textContent=`บันทึกตำแหน่งแล้ว${accuracy?` • ความแม่นยำประมาณ ±${accuracy} เมตร`:''} กรุณาตรวจสอบก่อนกดบันทึกร้าน`;
      if(btn){btn.disabled=false;btn.textContent='✓ ใช้ตำแหน่งนี้แล้ว';}
    },err=>{
      const msg=err.code===1?'กรุณาอนุญาตให้เว็บไซต์ใช้ตำแหน่งของคุณ':err.code===2?'ไม่พบตำแหน่ง กรุณาเปิด GPS / Location Services':'ค้นหาตำแหน่งนานเกินไป กรุณาลองใหม่';
      if(status)status.textContent=msg;
      if(btn){btn.disabled=false;btn.textContent='📍 ใช้ตำแหน่งปัจจุบันของฉัน';}
    },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  }

  async function submitShop(ev){
    ev.preventDefault();
    if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase ใน config.js');
    if(!session){closeModal('shopModal');openModal('authModal');return;}
    const form=ev.currentTarget, fd=new FormData(form);
    const existingId=String(fd.get('id')||'').trim();
    const id=existingId||crypto.randomUUID();
    const file=fd.get('cover');
    let existingShop=null;
    if(existingId){
      const {data:existingData,error:existingError}=await db.from('market_shops').select('*').eq('id',existingId).maybeSingle();
      if(existingError)return alert('โหลดข้อมูลร้านเดิมไม่สำเร็จ: '+existingError.message);
      existingShop=existingData;
      if(!existingShop)return alert('ไม่พบร้านที่ต้องการแก้ไข');
      if(profile?.role!=='admin'&&existingShop.owner_id!==session.user.id)return alert('คุณไม่มีสิทธิ์แก้ไขร้านนี้');
    }
    const oldCoverUrl=existingShop?.cover_url||'';
    const ownerId=existingShop?.owner_id||session.user.id;
    const payload={name:String(fd.get('name')||'').trim(),category_id:fd.get('category_id'),description:fd.get('description')||null,address:fd.get('address')||null,zone:fd.get('zone')||null,lock_number:fd.get('lock_number')||null,floor:fd.get('floor')||null,landmark:fd.get('landmark')||null,phone:fd.get('phone')||null,email:fd.get('email')||null,line:fd.get('line')||null,facebook:fd.get('facebook')||null,tiktok:fd.get('tiktok')||null,instagram:fd.get('instagram')||null,website:fd.get('website')||null,latitude:fd.get('latitude')?Number(fd.get('latitude')):null,longitude:fd.get('longitude')?Number(fd.get('longitude')):null,opening_hours:readOpeningHours(form),temporarily_closed:form.elements.temporarily_closed.checked,open_24_hours:form.elements.open_24_hours.checked,delivery:form.elements.delivery.checked,lineman:form.elements.lineman.checked,grab:form.elements.grab.checked,shopeefood:form.elements.shopeefood.checked,lineman_url:fd.get('lineman_url')||null,grab_url:fd.get('grab_url')||null,shopeefood_url:fd.get('shopeefood_url')||null,qr_payment:form.elements.qr_payment.checked,card_payment:form.elements.card_payment.checked,parking:form.elements.parking.checked,pet_friendly:form.elements.pet_friendly.checked,wheelchair_accessible:form.elements.wheelchair_accessible.checked,owner_id:ownerId};
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='กำลังบันทึก...';
    try{
      if(file&&file.size)payload.cover_url=await uploadCover(file,id);
      let result;
      if(existingId){
        let updateQuery=db.from('market_shops').update(payload).eq('id',existingId);
        if(profile?.role!=='admin')updateQuery=updateQuery.eq('owner_id',session.user.id);
        result=await updateQuery;
      }else{
        result=await db.from('market_shops').insert({...payload,id,status:'pending'});
      }
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
    if(profile?.role!=='admin'&&data.owner_id!==session?.user?.id)return alert('คุณไม่มีสิทธิ์แก้ไขร้านนี้');
    const f=$('shopForm');Object.entries(data).forEach(([k,v])=>{if(!f.elements[k]||k==='cover'||k==='opening_hours')return;if(f.elements[k].type==='checkbox')f.elements[k].checked=Boolean(v);else f.elements[k].value=v??'';});fillOpeningHours(f,data.opening_hours||{});$('shopFormTitle').textContent=profile?.role==='admin'&&data.owner_id!==session?.user?.id?'แก้ไขข้อมูลร้าน (Admin)':'แก้ไขข้อมูลร้าน';openModal('shopModal');
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


  // v0.5.22.8 COUPON WALLET / PUBLIC CLAIM MODULE
  function walletStatusLabel(v){return v==='used'?'ใช้แล้ว':v==='locked'?'กำลังใช้กับออเดอร์':v==='expired'?'หมดอายุ':'พร้อมใช้';}
  async function loadPublicShopCoupons(shopId){
    const box=$('shopPublicCouponBox');if(!box||!db)return;
    box.innerHTML='';
    const {data,error}=await db.rpc('market_public_shop_coupons',{p_shop_id:shopId});if(error){console.warn('coupon list',error);return;}
    const list=Array.isArray(data)?data:[];if(!list.length)return;
    box.innerHTML=`<div style="margin:14px 0 4px"><b>🎟️ คูปองร้านค้า</b><div style="display:grid;gap:8px;margin-top:8px">${list.map(c=>`<div style="border:1px dashed #bbb;border-radius:12px;padding:10px;display:flex;justify-content:space-between;gap:10px;align-items:center"><div><b>${esc(c.title)}</b><div>${esc(c.discount_label||'')} ${Number(c.min_spend||0)>0?`· ขั้นต่ำ ${Number(c.min_spend)} บาท`:''}</div><small class="muted">${esc(couponChannelLabel(c.channel))}${c.ends_at?' · ถึง '+new Date(c.ends_at).toLocaleDateString('th-TH'):''}</small></div><button type="button" class="${c.claimed?'ghost':'primary'}" data-claim-coupon="${esc(c.id)}" ${c.claimed?'disabled':''}>${c.claimed?'✓ เก็บแล้ว':'🎟️ เก็บคูปอง'}</button></div>`).join('')}</div></div>`;
  }
  async function claimShopCoupon(id){
    if(!session){openModal('authModal');return alert('กรุณาเข้าสู่ระบบก่อนเก็บคูปอง');}
    const {error}=await db.rpc('market_claim_coupon',{p_coupon_id:id});if(error)return alert(error.message||'เก็บคูปองไม่สำเร็จ');
    const box=$('shopPublicCouponBox'),shopId=box?.dataset?.shopCoupons;if(shopId)await loadPublicShopCoupons(shopId);showNotice('เก็บคูปองไว้ในคูปองของฉันแล้ว');
  }
  function ensureCouponWalletUI(){
    if(!$('couponWalletBtn')){const b=document.createElement('button');b.id='couponWalletBtn';b.className='ghost hidden header-shortcut';b.type='button';b.innerHTML='<span class="nav-ico">🎟️</span><span class="nav-label">คูปองของฉัน</span>';const account=$('accountBtn');account?.parentNode?.insertBefore(b,account);b.addEventListener('click',openCouponWallet);}
    if(!$('couponWalletModal')){const m=document.createElement('div');m.id='couponWalletModal';m.className='modal hidden';m.innerHTML=`<div class="backdrop" data-close="couponWalletModal"></div><div class="modal-card"><button class="close" data-close="couponWalletModal">×</button><div class="section-head"><div><span class="eyebrow red">บัญชีของฉัน</span><h2>🎟️ คูปองของฉัน</h2></div></div><div id="couponWalletTabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="ghost" data-wallet-filter="available">พร้อมใช้</button><button type="button" class="ghost" data-wallet-filter="locked">กำลังใช้</button><button type="button" class="ghost" data-wallet-filter="used">ใช้แล้ว</button><button type="button" class="ghost" data-wallet-filter="expired">หมดอายุ</button></div><div id="couponWalletList"></div></div>`;document.body.appendChild(m);}
    $('couponWalletBtn')?.classList.toggle('hidden',!session);
  }
  let couponWalletCache=[],couponWalletFilter='available';
  async function openCouponWallet(){if(!session){openModal('authModal');return;}ensureCouponWalletUI();openModal('couponWalletModal');const box=$('couponWalletList');box.innerHTML='<p>กำลังโหลดคูปอง...</p>';try{await db.rpc('market_sync_mission_coupon_claim');}catch(syncErr){console.warn('mission coupon sync skipped',syncErr);}const {data,error}=await db.rpc('market_my_coupon_wallet');if(error){console.error('coupon wallet',error);box.innerHTML=`<p>โหลดคูปองไม่สำเร็จ</p><small class="muted">${esc(error.message||'กรุณาตรวจ SQL คูปอง')}</small>`;return;}couponWalletCache=Array.isArray(data)?data:[];renderCouponWallet();}
  function renderCouponWallet(){const box=$('couponWalletList');if(!box)return;const list=couponWalletCache.filter(c=>c.wallet_status===couponWalletFilter);box.innerHTML=list.length?`<div style="display:grid;gap:10px">${list.map(c=>`<article style="border:1px solid #ddd;border-radius:14px;padding:12px"><div style="display:flex;justify-content:space-between;gap:10px"><div><b>${esc(c.title)}</b><div>${esc(c.discount_label||'')}</div><small class="muted">${esc(c.shop_name||'ร้านค้าในตลาด')} · ${esc(couponChannelLabel(c.channel))}</small></div><strong>${walletStatusLabel(c.wallet_status)}</strong></div>${Number(c.min_spend||0)>0?`<small>ยอดขั้นต่ำ ${Number(c.min_spend)} บาท</small>`:''}${c.ends_at?`<small style="display:block">หมดอายุ ${new Date(c.ends_at).toLocaleString('th-TH')}</small>`:''}</article>`).join('')}</div>`:'<div class="empty-inline">ยังไม่มีคูปองในหมวดนี้</div>';}

  // v0.5.22.8 SAFE COUPON MODULE
  // UI is injected only inside existing admin/promotion modals. No home-page markup or global CSS is changed.
  let shopCouponCache=[];
  function toLocalDateTimeInput(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,16);}
  function couponDiscountLabel(c){return c?.discount_type==='percent'?`ลด ${Number(c.discount_value||0)}%${Number(c.max_discount||0)>0?` สูงสุด ${Number(c.max_discount)} บาท`:''}`:`ลด ${Number(c?.discount_value||0)} บาท`;}
  function couponChannelLabel(v){return v==='delivery'?'Delivery เท่านั้น':v==='pickup'?'รับเองเท่านั้น':'รับเอง + Delivery';}

  function ensureMissionCouponAdminUI(){
    const f=$('missionRewardForm');if(!f||$('missionCouponAdminBlock'))return;
    const save=f.querySelector('button[type="submit"]');if(!save)return;
    const wrap=document.createElement('div');wrap.id='missionCouponAdminBlock';wrap.style.cssText='border-top:1px solid #e5e5e5;margin-top:14px;padding-top:14px';
    wrap.innerHTML=`<div style="font-weight:800;margin-bottom:8px">🎟️ คูปองเมื่อ Mission สำเร็จ (ไม่บังคับ)</div>
      <label>วัน/เวลาสิ้นสุดการรับรางวัล<input name="reward_claim_until" type="datetime-local"><small class="muted">เมื่อพ้นเวลานี้ Mission จะหายจากหน้าเว็บและจะไม่เด้ง Popup อีก</small></label>
      <label class="check"><input name="mission_coupon_active" type="checkbox"> เปิดให้รางวัล Mission เป็นคูปองด้วย</label>
      <label>ร้านที่ใช้คูปอง<select name="mission_coupon_shop_id"><option value="">เลือกร้าน</option></select></label>
      <div class="form-grid"><label>ประเภทส่วนลด<select name="mission_coupon_discount_type"><option value="fixed">ลดเป็นบาท</option><option value="percent">ลดเป็นเปอร์เซ็นต์</option></select></label><label>ส่วนลด<input name="mission_coupon_discount_value" type="number" min="0" step="0.01"></label></div>
      <div class="form-grid"><label>ยอดซื้อขั้นต่ำ<input name="mission_coupon_min_spend" type="number" min="0" step="0.01" value="0"></label><label>ลดสูงสุด (ถ้ามี)<input name="mission_coupon_max_discount" type="number" min="0" step="0.01"></label></div>
      <div class="form-grid"><label>ช่องทาง<select name="mission_coupon_channel"><option value="both">รับเอง + Delivery</option><option value="delivery">Delivery เท่านั้น</option><option value="pickup">รับเองเท่านั้น</option></select></label><label>หมดอายุ<input name="mission_coupon_ends_at" type="datetime-local"></label></div>
      <small class="muted">คูปอง Mission ใช้ได้ 1 ครั้งต่อบัญชี และหักเฉพาะค่าสินค้า ไม่ลดค่าจัดส่ง</small>`;
    save.insertAdjacentElement('beforebegin',wrap);
  }
  async function fillMissionCouponShopOptions(selected=''){
    const sel=$('missionRewardForm')?.elements?.mission_coupon_shop_id;if(!sel||!db)return;
    const {data}=await db.from('market_shops').select('id,name').eq('status','approved').order('name');
    sel.innerHTML='<option value="">เลือกร้าน</option>'+((data||[]).map(s=>`<option value="${esc(s.id)}" ${String(s.id)===String(selected)?'selected':''}>${esc(s.name)}</option>`).join(''));
  }

  function ensureShopCouponManagerUI(){
    if($('ownerCouponSection'))return;
    const list=$('ownerPromotionList');if(!list)return;
    const sec=document.createElement('section');sec.id='ownerCouponSection';sec.style.cssText='border-top:1px solid #e5e5e5;margin-top:18px;padding-top:16px';
    sec.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h3 style="margin:0">🎟️ คูปองของร้าน</h3><small class="muted">ใช้ได้กับรับเอง / Delivery ตามที่ร้านกำหนด · 1 ครั้งต่อบัญชี</small></div><button type="button" class="primary" data-coupon-action="new">+ สร้างคูปอง</button></div><div id="ownerCouponList" style="margin-top:12px"></div>`;
    list.insertAdjacentElement('afterend',sec);
    ensureShopCouponEditorModal();
  }
  function ensureShopCouponEditorModal(){
    if($('shopCouponEditorModal'))return;
    const modal=document.createElement('div');modal.id='shopCouponEditorModal';modal.className='modal hidden';
    modal.innerHTML=`<div class="backdrop" data-coupon-action="close"></div><div class="modal-card small"><button class="close" type="button" data-coupon-action="close">×</button><h2 id="shopCouponEditorTitle">สร้างคูปอง</h2><form id="shopCouponForm"><input name="coupon_id" type="hidden"><input name="shop_id" type="hidden"><label>ชื่อคูปอง<input name="title" maxlength="120" required placeholder="เช่น ลด 15 บาท"></label><label>รายละเอียด<textarea name="description" rows="2" maxlength="500"></textarea></label><div class="form-grid"><label>ประเภทส่วนลด<select name="discount_type"><option value="fixed">ลดเป็นบาท</option><option value="percent">ลดเป็นเปอร์เซ็นต์</option></select></label><label>ส่วนลด<input name="discount_value" type="number" min="0.01" step="0.01" required></label></div><div class="form-grid"><label>ยอดขั้นต่ำ<input name="min_spend" type="number" min="0" step="0.01" value="0"></label><label>ลดสูงสุด (ถ้ามี)<input name="max_discount" type="number" min="0" step="0.01"></label></div><div class="form-grid"><label>ช่องทาง<select name="channel"><option value="both">รับเอง + Delivery</option><option value="delivery">Delivery เท่านั้น</option><option value="pickup">รับเองเท่านั้น</option></select></label><label>จำนวนสิทธิ์รวม<input name="total_limit" type="number" min="1" step="1" placeholder="เว้นว่าง = ไม่จำกัด"></label></div><div class="form-grid"><label>เริ่มใช้<input name="starts_at" type="datetime-local"></label><label>หมดอายุ<input name="ends_at" type="datetime-local"></label></div><label class="check"><input name="active" type="checkbox" checked> เปิดใช้งานคูปอง</label><small class="muted">ลูกค้าแต่ละบัญชีใช้คูปองนี้ได้ 1 ครั้ง ส่วนลดจะหักเฉพาะค่าสินค้าของร้าน</small><button type="submit" class="primary" style="margin-top:12px">💾 บันทึกคูปอง</button></form></div>`;
    document.body.appendChild(modal);
    $('shopCouponForm')?.addEventListener('submit',saveShopCoupon);
  }
  async function loadShopCoupons(shopId){
    const box=$('ownerCouponList');if(!box||!shopId||!db)return;
    box.innerHTML='<p>กำลังโหลดคูปอง...</p>';
    const {data,error}=await db.rpc('market_shop_coupon_list',{p_shop_id:shopId});
    if(error){box.innerHTML=`<p class="form-message">${esc(error.message)}</p>`;return;}
    shopCouponCache=Array.isArray(data)?data:[];
    box.innerHTML=shopCouponCache.length?shopCouponCache.map(c=>`<article class="owner-promo-item"><div><div class="owner-promo-title"><b>${esc(c.title)}</b><span class="owner-promo-state ${c.active?'active':'inactive'}">${c.active?'เปิด':'ปิด'}</span></div><p>${esc(couponDiscountLabel(c))} · ขั้นต่ำ ${Number(c.min_spend||0)} บาท · ${esc(couponChannelLabel(c.channel))}</p><small>${c.ends_at?'หมดอายุ '+new Date(c.ends_at).toLocaleString('th-TH'):'ไม่กำหนดวันหมดอายุ'}${c.total_limit?` · ${Number(c.redeemed_count||0)}/${Number(c.total_limit)} สิทธิ์`:` · ใช้แล้ว ${Number(c.redeemed_count||0)} ครั้ง`}</small></div><div class="owner-promo-actions"><button type="button" class="ghost" data-coupon-action="edit" data-coupon-id="${esc(c.id)}">แก้ไข</button><button type="button" class="danger" data-coupon-action="delete" data-coupon-id="${esc(c.id)}">ลบ</button></div></article>`).join(''):'<div class="empty-inline">ร้านนี้ยังไม่มีคูปอง</div>';
  }
  function openShopCouponEditor(couponId=''){
    ensureShopCouponEditorModal();const f=$('shopCouponForm');if(!f)return;
    const shopId=$('managePromotionShopId')?.value||'';const c=shopCouponCache.find(x=>String(x.id)===String(couponId));f.reset();f.elements.shop_id.value=shopId;f.elements.coupon_id.value=c?.id||'';f.elements.title.value=c?.title||'';f.elements.description.value=c?.description||'';f.elements.discount_type.value=c?.discount_type||'fixed';f.elements.discount_value.value=c?.discount_value??'';f.elements.min_spend.value=c?.min_spend??0;f.elements.max_discount.value=c?.max_discount??'';f.elements.channel.value=c?.channel||'both';f.elements.total_limit.value=c?.total_limit??'';f.elements.starts_at.value=toLocalDateTimeInput(c?.starts_at);f.elements.ends_at.value=toLocalDateTimeInput(c?.ends_at);f.elements.active.checked=c?Boolean(c.active):true;$('shopCouponEditorTitle').textContent=c?'แก้ไขคูปอง':'สร้างคูปอง';$('shopCouponEditorModal').classList.remove('hidden');
  }
  async function saveShopCoupon(ev){
    ev.preventDefault();const f=ev.currentTarget,btn=f.querySelector('button[type="submit"]');const p={p_coupon_id:f.elements.coupon_id.value||null,p_shop_id:f.elements.shop_id.value,p_title:f.elements.title.value.trim(),p_description:f.elements.description.value.trim(),p_discount_type:f.elements.discount_type.value,p_discount_value:Number(f.elements.discount_value.value||0),p_min_spend:Number(f.elements.min_spend.value||0),p_max_discount:f.elements.max_discount.value?Number(f.elements.max_discount.value):null,p_channel:f.elements.channel.value,p_starts_at:f.elements.starts_at.value?new Date(f.elements.starts_at.value).toISOString():null,p_ends_at:f.elements.ends_at.value?new Date(f.elements.ends_at.value).toISOString():null,p_total_limit:f.elements.total_limit.value?Number(f.elements.total_limit.value):null,p_active:f.elements.active.checked};
    if(!p.p_title)return alert('กรุณาระบุชื่อคูปอง');if(!Number.isFinite(p.p_discount_value)||p.p_discount_value<=0)return alert('ส่วนลดต้องมากกว่า 0');if(p.p_discount_type==='percent'&&p.p_discount_value>100)return alert('ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%');
    if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก...'}const {error}=await db.rpc('market_shop_coupon_upsert',p);if(btn){btn.disabled=false;btn.textContent='💾 บันทึกคูปอง'}if(error)return alert('บันทึกคูปองไม่สำเร็จ: '+error.message);$('shopCouponEditorModal').classList.add('hidden');await loadShopCoupons(p.p_shop_id);
  }
  async function deleteShopCoupon(id){
    const shopId=$('managePromotionShopId')?.value;if(!shopId||!id||!confirm('ยืนยันลบคูปองนี้?'))return;const {error}=await db.rpc('market_shop_coupon_delete',{p_coupon_id:id,p_shop_id:shopId});if(error)return alert('ลบคูปองไม่สำเร็จ: '+error.message);await loadShopCoupons(shopId);
  }
  document.addEventListener('click',ev=>{const claim=ev.target.closest('[data-claim-coupon]');if(claim){claimShopCoupon(claim.dataset.claimCoupon);return;}const wf=ev.target.closest('[data-wallet-filter]');if(wf){couponWalletFilter=wf.dataset.walletFilter;renderCouponWallet();return;}
    const b=ev.target.closest('[data-coupon-action]');if(!b)return;const a=b.dataset.couponAction;if(a==='new')openShopCouponEditor();else if(a==='edit')openShopCouponEditor(b.dataset.couponId);else if(a==='delete')deleteShopCoupon(b.dataset.couponId);else if(a==='close')$('shopCouponEditorModal')?.classList.add('hidden');
  });

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


  async function adminToggleDeliveryAccess(shopId,currentEnabled){
    if(!session||profile?.role!=='admin')return alert('เฉพาะ Admin เท่านั้น');
    const next=!currentEnabled;
    const actionText=next?'เปิดสิทธิ์ขาย/Delivery':'ปิดสิทธิ์ขาย/Delivery';
    if(!confirm(`${actionText} สำหรับร้านนี้ใช่หรือไม่?`))return;
    const note=next?'เปิดสิทธิ์โดย Admin':'ปิดสิทธิ์โดย Admin';
    const {error}=await db.rpc('market_admin_set_order_shop_access',{p_shop_id:shopId,p_enabled:next,p_note:note});
    if(error)return alert('เปลี่ยนสิทธิ์ไม่สำเร็จ: '+friendlyAuthError(error.message));
    showNotice(next?'เปิดสิทธิ์ขาย/Delivery ให้ร้านแล้ว':'ปิดสิทธิ์ขาย/Delivery ของร้านแล้ว');
    await loadDashboard();
  }

  function bindEvents(){
    document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>closeModal(x.dataset.close)));
    document.addEventListener('click',ev=>{const closer=ev.target.closest?.('[data-close]');if(closer?.dataset?.close)closeModal(closer.dataset.close);});
    $('floatingHomeBtn')?.addEventListener('click',goHome);
    $('floatingBackBtn')?.addEventListener('click',goBack);
    document.querySelectorAll('[data-analytics-period]').forEach(btn=>btn.addEventListener('click',()=>loadAnalyticsDashboard(btn.dataset.analyticsPeriod||'7d')));
    $('accountBtn').addEventListener('click',()=>{
      if(!session)return openModal('authModal');
      $('dashboard').scrollIntoView({behavior:'smooth'});
    });
    $('headerUserName')?.addEventListener('click',()=>{if(session)openProfileNameEditor();});
    $('headerUserName')?.addEventListener('keydown',ev=>{if(session&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();openProfileNameEditor();}});
    $('guestSignUpBtn')?.addEventListener('click',()=>{setAuthMethod('email');openModal('authModal');setTimeout(()=>document.querySelector('#authModal input[name="email"]')?.focus(),60);});
    $('addShopBtn').addEventListener('click',()=>{if(!session)return openModal('authModal');$('shopForm').reset();fillOpeningHours($('shopForm'),{});$('shopFormTitle').textContent='เพิ่มร้านของฉัน';openModal('shopModal');});
    $('searchBtn').addEventListener('click',()=>resetShopList({scroll:true}));
    $('searchInput').addEventListener('keydown',ev=>{
      if(ev.key==='Enter'){
        ev.preventDefault();
        resetShopList({scroll:true});
      }
    });
    document.querySelectorAll('[data-auth-method]').forEach(b=>b.addEventListener('click',()=>setAuthMethod(b.dataset.authMethod)));
    setAuthMethod('email');
    $('authForm').addEventListener('submit',async ev=>{
      ev.preventDefault();
      if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');
      const form=ev.currentTarget;
      if(!form.reportValidity())return;
      const fd=new FormData(form), method=String(fd.get('auth_method')||'email');
      const email=String(fd.get('email')||'').trim();
      const phone=normalizeLoginPhone(fd.get('phone'));
      const password=String(fd.get('password')||'');
      if(password.length<6)return alert('กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัว');
      if(method==='email'&&!email)return alert('กรุณากรอกอีเมล');
      if(method==='phone'&&!phone)return alert('กรุณากรอกเบอร์โทร 10 หลัก เช่น 0812345678');
      const btn=form.querySelector('button[type=submit]');
      btn.disabled=true;btn.textContent='กำลังเข้าสู่ระบบ...';
      try{
        const loginEmail=method==='phone'?phoneLoginEmail(phone):email;
        const {error}=await db.auth.signInWithPassword({email:loginEmail,password});
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
      const fd=new FormData(form), method=String(fd.get('auth_method')||'email');
      const email=String(fd.get('email')||'').trim();
      const phone=normalizeLoginPhone(fd.get('phone'));
      const password=String(fd.get('password')||'');
      const displayName=cleanDisplayName(fd.get('display_name'));
      if(displayName.length<2)return alert('กรุณาตั้งชื่อที่ใช้แสดงอย่างน้อย 2 ตัวอักษร');
      if(password.length<6)return alert('กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัว');
      if(method==='email'&&!email)return alert('กรุณากรอกอีเมล');
      if(method==='phone'&&!phone)return alert('กรุณากรอกเบอร์โทร 10 หลัก เช่น 0812345678');
      const btn=$('signUpBtn');btn.disabled=true;btn.textContent='กำลังสมัคร...';
      try{
        const signupEmail=method==='phone'?phoneLoginEmail(phone):email;
        const options=method==='phone'
          ? {data:{signup_method:'phone_alias',phone_local:'0'+phone.slice(3),phone_e164:phone,display_name:displayName}}
          : {emailRedirectTo:window.location.origin,data:{display_name:displayName}};
        const {data,error}=await db.auth.signUp({email:signupEmail,password,options});
        if(error)throw error;
        if(data.session){
          session=data.session;
          try{await db.rpc('market_set_my_display_name',{p_display_name:displayName});}catch(err){console.warn('initial display name save skipped',err);}
          alert(method==='phone'?'สมัครด้วยเบอร์โทรสำเร็จ และเข้าสู่ระบบแล้ว':'สมัครสมาชิกสำเร็จ และเข้าสู่ระบบแล้ว');
          closeModal('authModal'); await refreshAuth();
        }else{
          alert(method==='phone'?'สมัครไม่สำเร็จทันที: โปรดตรวจว่า Confirm email ปิดอยู่':'สมัครสมาชิกสำเร็จ กรุณาเปิดอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ');
        }
      }catch(err){alert('สมัครสมาชิกไม่สำเร็จ: '+friendlyAuthError(err.message));}
      finally{btn.disabled=false;btn.textContent='สมัครสมาชิก';}
    });
    $('forgotPasswordBtn').addEventListener('click',async()=>{
      if(!db)return alert('ยังไม่ได้ตั้งค่า Supabase');
      const form=$('authForm');
      if(String(form.elements.auth_method.value)==='phone'){
        return alert('บัญชีที่สมัครด้วยเบอร์โทร: กรุณาติดต่อผู้ดูแลเพื่อขอรีเซ็ตรหัสผ่าน');
      }
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
    $('riderJoinBtn')?.addEventListener('click',openRiderApplication);
    $('riderApplyForm')?.addEventListener('submit',submitRiderApplication);
    $('riderCloseApprovedBtn')?.addEventListener('click',()=>closeModal('riderApplyModal'));
    $('adminRiderApplicantList')?.addEventListener('click',ev=>{
      const approve=ev.target.closest('[data-rider-approve]');
      const reject=ev.target.closest('[data-rider-reject]');
      if(approve)decideRiderApplication(approve.dataset.riderApprove,true);
      if(reject)decideRiderApplication(reject.dataset.riderReject,false);
    });
    $('mobileProfileDisplayNameForm')?.addEventListener('submit',async ev=>{
      ev.preventDefault();
      const form=ev.currentTarget;
      const btn=form.querySelector('button[type=submit]');
      btn.disabled=true;btn.textContent='กำลังบันทึก...';
      try{
        await saveMyDisplayName(form.elements.display_name.value);
        closeModal('profileNameModal');
      }catch(err){alert('บันทึกชื่อไม่สำเร็จ: '+(err.message||err));}
      finally{btn.disabled=false;btn.textContent='💾 บันทึกชื่อ';}
    });
    $('profileDisplayNameForm')?.addEventListener('submit',async ev=>{
      ev.preventDefault();
      const form=ev.currentTarget;
      const btn=form.querySelector('button[type=submit]');
      btn.disabled=true;btn.textContent='กำลังบันทึก...';
      try{await saveMyDisplayName(form.elements.display_name.value);}
      catch(err){alert('บันทึกชื่อไม่สำเร็จ: '+(err.message||err));}
      finally{btn.disabled=false;btn.textContent='💾 บันทึกชื่อ';}
    });
    $('reviewForm').addEventListener('submit',submitReview);
    $('openReviewBtn').addEventListener('click',()=>{closeModal('shopDetailModal');openModal('reviewModal');});
    $('showAllPromotionsBtn').addEventListener('click',openAllPromotions);
    $('shopPagination')?.addEventListener('click',ev=>{
      const btn=ev.target.closest('[data-shop-page]');
      if(!btn||btn.disabled)return;
      goToShopPage(Number(btn.dataset.shopPage));
    });
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
    $('missionRewardForm')?.addEventListener('submit',saveMissionReward);
    $('deliverySystemForm')?.addEventListener('submit',saveDeliverySystemSetting);
    $('adminRiderForm')?.addEventListener('submit',saveAdminRider);
    $('adminRiderRefreshBtn')?.addEventListener('click',loadRiderAdminPanel);
    $('adminRiderList')?.addEventListener('click',ev=>{const b=ev.target.closest('[data-rider-toggle]');if(b)toggleAdminRider(b.dataset.riderToggle,b.dataset.riderEnabled==='true');});
    $('missionBtn')?.addEventListener('click',openMission);
    $('missionWelcomeStartBtn')?.addEventListener('click',()=>{closeModal('missionWelcomeModal');openMission();});
    const locateMapBtn=$('locateMapBtn');
    if(locateMapBtn)locateMapBtn.addEventListener('click',()=>userLocation?showUserLocation({coords:{latitude:userLocation.lat,longitude:userLocation.lng,accuracy:userLocation.accuracy}}):requestUserLocation());
    const useCurrentShopLocationBtn=$('useCurrentShopLocationBtn');if(useCurrentShopLocationBtn)useCurrentShopLocationBtn.addEventListener('click',useCurrentLocationForShop);
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
      const clickedLink=ev.target.closest('a');
      if(clickedLink){
        const href=clickedLink.getAttribute('href')||'';
        const analyticsCard=clickedLink.closest('.card[data-id]');
        const currentDetailShopId=$('reviewShopId')?.value||null;
        const analyticsShopId=analyticsCard?.dataset.id||currentDetailShopId||null;
        const text=(clickedLink.textContent||'').toLowerCase();
        if(href.startsWith('tel:'))trackAnalytics('phone_click',analyticsShopId);
        else if(text.includes('นำทาง')||text.includes('google maps')||clickedLink.classList.contains('go'))trackAnalytics('navigate_click',analyticsShopId);
        else if(text.includes('line man')||clickedLink.classList.contains('lineman'))trackAnalytics('order_lineman_click',analyticsShopId);
        else if(text.includes('grab')||clickedLink.classList.contains('grab'))trackAnalytics('order_grab_click',analyticsShopId);
        else if(text.includes('shopee')||clickedLink.classList.contains('shopee'))trackAnalytics('order_shopee_click',analyticsShopId);
        else if(clickedLink.classList.contains('order-btn')||clickedLink.classList.contains('detail-order'))trackAnalytics('order_click',analyticsShopId);
      }
      const shareBtn=ev.target.closest('[data-share-shop]');if(shareBtn){shareShopDirectLink(shareBtn.dataset.shareShop);return;}
      const copyBtn=ev.target.closest('[data-copy-shop-link]');if(copyBtn){copyShopDirectLink(copyBtn.dataset.copyShopLink);return;}
      if(ev.target.closest('[data-browse-other-shops]')){browseOtherShops();return;}
      const action=ev.target.dataset.action;
      const explicitShopId=ev.target.dataset.shopId;
      const card=ev.target.closest('.card[data-id]');
      const shopId=explicitShopId||card?.dataset.id;
      if(!action||!shopId)return;
      if(action==='favorite'){toggleFavorite(shopId);return;}
      if(action==='admin-delivery-toggle'){adminToggleDeliveryAccess(shopId,ev.target.dataset.enabled==='true');return;}
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
    trackAnalytics('page_view');
    try{await loadCategories();await loadReviewStats();await loadPromotions();await loadShopIndex();await loadPublicShops({reset:true});renderShops();renderRecommended();await refreshAuth();ensureCouponWalletUI();await handleRecoveryLink();await handleShopDirectLink();showMissionWelcomeOncePerDay().catch(()=>{});}
    catch(err){console.error(err);showNotice('เกิดข้อผิดพลาด: '+err.message,true);}
  }
  start();
})();

/* === PWA install experience: Main v5.7.9.14 === */
let deferredInstallPrompt = null;

function isAppStandalone(){
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOSDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isSamsungInternet(){
  return /SamsungBrowser/i.test(navigator.userAgent);
}

function isAndroidDevice(){
  return /Android/i.test(navigator.userAgent);
}

function isLineOrSocialInApp(){
  return /Line\//i.test(navigator.userAgent) || /FBAN|FBAV|Instagram/i.test(navigator.userAgent);
}

function openCurrentPageInChrome(){
  if(!isAndroidDevice()) return false;
  try{
    const u=new URL(location.href);
    const scheme=u.protocol.replace(':','');
    const fallback=encodeURIComponent(u.href);
    location.href=`intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
    return true;
  }catch(err){
    console.warn('Open Chrome failed:',err);
    return false;
  }
}


function refreshInstallButton(){
  const btn = document.getElementById('installAppBtn');
  const hint = document.getElementById('installAppHint');
  if(!btn) return;
  const installed = isAppStandalone();
  btn.classList.toggle('hidden', installed);
  if(hint) hint.classList.toggle('hidden', installed);
}

function showInstallInstructions(html){
  const box = document.getElementById('installAppInstructions');
  const modal = document.getElementById('installAppModal');
  if(box) box.innerHTML = html;
  if(modal) modal.classList.remove('hidden');
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  refreshInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  refreshInstallButton();
});

document.addEventListener('DOMContentLoaded', () => {
  refreshInstallButton();
  const installBtn = document.getElementById('installAppBtn');
  if(installBtn){
    installBtn.addEventListener('click', async () => {
      if(isAppStandalone()){
        refreshInstallButton();
        return;
      }

      // Android opened inside LINE / Facebook / Instagram:
      // installation is unreliable there, so send the same page to Chrome.
      if(isAndroidDevice() && isLineOrSocialInApp()){
        showInstallInstructions(`
          <p><b>ติดตั้งผ่าน Google Chrome</b></p>
          <p>LINE / Facebook / Instagram อาจบล็อกการติดตั้งจากเบราว์เซอร์ภายในแอป</p>
          <button type="button" class="btn primary" id="openChromeInstallBtn">เปิดด้วย Chrome</button>
          <p class="install-note">ระบบจะพยายามเปิด Chrome ให้อัตโนมัติ หาก Android ไม่อนุญาตให้แตะปุ่มด้านบน หรือเลือก “เปิดในเบราว์เซอร์ภายนอก” จากเมนูของแอป</p>`);
        setTimeout(()=>openCurrentPageInChrome(),250);
        return;
      }

      // Samsung Internet: prefer Chrome to avoid browser-generated APK / Play Protect warnings.
      if(isAndroidDevice() && isSamsungInternet()){
        showInstallInstructions(`
          <p><b>แนะนำติดตั้งผ่าน Google Chrome</b></p>
          <p>เพื่อหลีกเลี่ยงคำเตือนจาก Play Protect ให้เปิดเว็บไซต์นี้ด้วย Chrome ก่อนติดตั้ง</p>
          <button type="button" class="btn primary" id="openChromeInstallBtn">เปิดด้วย Chrome</button>`);
        return;
      }

      // Native PWA install prompt on supported Android Chrome / Chromium.
      if(deferredInstallPrompt){
        const promptEvent=deferredInstallPrompt;
        deferredInstallPrompt=null;
        try{
          await promptEvent.prompt();
          const choice=await promptEvent.userChoice;
          if(choice?.outcome==='accepted'){
            const hint=document.getElementById('installAppHint');
            if(hint) hint.textContent='ติดตั้ง ตลาดกระทุ่มแบน เรียบร้อยแล้ว';
          }
        }catch(err){ console.warn('PWA install prompt failed:',err); }
        refreshInstallButton();
        return;
      }

      // iPhone/iPad: Apple does not expose the Android-style install prompt.
      if(isIOSDevice()){
        if(isLineOrSocialInApp()){
          showInstallInstructions(`
            <p><b>ติดตั้งบน iPhone / iPad</b></p>
            <p>ขณะนี้เปิดจาก LINE / Facebook / Instagram</p>
            <ol>
              <li>แตะเมนู <b>…</b> ของแอป</li>
              <li>เลือก <b>เปิดใน Safari</b></li>
              <li>ใน Safari กด <b>แชร์ ⬆️</b></li>
              <li>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b> → <b>เพิ่ม</b></li>
            </ol>`);
        }else{
          showInstallInstructions(`
            <p><b>ติดตั้ง “ตลาดกระทุ่มแบน” บน iPhone / iPad</b></p>
            <ol>
              <li>เปิดด้วย <b>Safari</b></li>
              <li>กด <b>แชร์ ⬆️</b></li>
              <li>เลือก <b>เพิ่มไปยังหน้าจอโฮม</b></li>
              <li>กด <b>เพิ่ม</b></li>
            </ol>
            <p class="install-note">iOS ไม่อนุญาตให้เว็บไซต์กด Install อัตโนมัติเหมือน Android</p>`);
        }
        return;
      }

      if(isAndroidDevice()){
        showInstallInstructions(`
          <p><b>ยังไม่พบคำสั่งติดตั้งจาก Android</b></p>
          <button type="button" class="btn primary" id="openChromeInstallBtn">เปิดด้วย Chrome</button>
          <p>หรือใน Chrome แตะ <b>⋮ → ติดตั้งแอป / เพิ่มลงในหน้าจอหลัก</b></p>`);
        return;
      }

      showInstallInstructions(`<p><b>เบราว์เซอร์นี้ยังไม่รองรับการติดตั้งโดยตรง</b></p><p>ลองเปิดด้วย Chrome หรือใช้เมนูของเบราว์เซอร์เพื่อเพิ่มเว็บไซต์เป็นแอป</p>`);
    });
  }

  document.addEventListener('click',(event)=>{
    const btn=event.target?.closest?.('#openChromeInstallBtn');
    if(btn){
      event.preventDefault();
      openCurrentPageInChrome();
    }
  });

  if('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?v=0.5.22.44', {scope:'./',updateViaCache:'none'}).catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
});
