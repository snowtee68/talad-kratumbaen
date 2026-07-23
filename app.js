(() => {
  "use strict";
  const CONFIG = window.APP_CONFIG || {};
  const configured = Boolean(CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes("PASTE_") && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.includes("PASTE_"));
  const db = configured ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
  const MARKET_CENTER = [13.6549, 100.2639];
  const categories = ["ทั้งหมด", "อาหาร", "เครื่องดื่ม", "แฟชั่น", "บริการ", "ของใช้", "สุขภาพและความงาม", "อื่น ๆ"];
  const icons = {ทั้งหมด:"🏪",อาหาร:"🍜",เครื่องดื่ม:"🥤",แฟชั่น:"👕",บริการ:"🛠️",ของใช้:"🛍️","สุขภาพและความงาม":"💆","อื่น ๆ":"✨"};
  const demo = [{
    id:"demo-snowtee", name:"Snowtee ตลาดกระทุ่มแบน", description:"เครื่องดื่ม ไอศกรีมซอฟต์เสิร์ฟ และเบเกอรี่ บรรยากาศริมคลอง", category:"เครื่องดื่ม", address:"ตลาดกระทุ่มแบน จังหวัดสมุทรสาคร", phone:"0642211876", facebook:"https://facebook.com/snowtee68", line:"snowtee68", tiktok:"https://www.tiktok.com/@snowtee68", latitude:13.6549, longitude:100.2639, approved:true, featured:true, open_time:"09:00", close_time:"21:00", created_at:"2026-07-01T00:00:00Z"
  }];

  const state = { shops:[], category:"ทั้งหมด", openOnly:false, featuredOnly:false, favoriteOnly:false, sort:"featured", location:null, map:null, miniMap:null, markers:[], miniMarkers:[], userMarker:null };
  const $ = id => document.getElementById(id);
  const els = {grid:$("grid"),status:$("status"),search:$("search"),result:$("result"),empty:$("empty"),toast:$("toast")};

  function escapeHtml(value="") { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
  function normalizeUrl(value, type="web") {
    if (!value) return "";
    const raw = String(value).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (type === "facebook") return `https://facebook.com/${raw.replace(/^@/,"")}`;
    if (type === "tiktok") return `https://www.tiktok.com/@${raw.replace(/^@/,"")}`;
    if (type === "line") return `https://line.me/ti/p/~${raw.replace(/^@/,"")}`;
    return `https://${raw}`;
  }
  function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
  function haversine(lat1, lon1, lat2, lon2) {
    const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function distanceFor(shop) { return state.location && number(shop.latitude)!==null && number(shop.longitude)!==null ? haversine(state.location.lat,state.location.lng,+shop.latitude,+shop.longitude) : null; }
  function distanceText(km) { if (km===null) return ""; return km<1 ? `${Math.round(km*1000)} ม.` : `${km.toFixed(km<10?1:0)} กม.`; }
  function isOpen(shop, now=new Date()) {
    if (!shop.open_time || !shop.close_time) return null;
    const mins = now.getHours()*60+now.getMinutes();
    const [oh,om]=shop.open_time.slice(0,5).split(":").map(Number), [ch,cm]=shop.close_time.slice(0,5).split(":").map(Number);
    const start=oh*60+om, end=ch*60+cm;
    return end>=start ? mins>=start&&mins<=end : mins>=start||mins<=end;
  }
  function favoriteKey(shop) { return String(shop.id || shop.name); }
  function favorites() { try { return new Set(JSON.parse(localStorage.getItem("talad-favorites")||"[]")); } catch { return new Set(); } }
  function isFavorite(shop) { return favorites().has(favoriteKey(shop)); }
  function toggleFavorite(shop) {
    const set=favorites(), key=favoriteKey(shop); set.has(key)?set.delete(key):set.add(key);
    localStorage.setItem("talad-favorites",JSON.stringify([...set])); render(); showToast(set.has(key)?"เพิ่มในร้านโปรดแล้ว":"นำออกจากร้านโปรดแล้ว");
  }
  function showToast(message) { els.toast.textContent=message; els.toast.classList.remove("hidden"); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>els.toast.classList.add("hidden"),2600); }
  function showStatus(message, kind="info") { els.status.textContent=message; els.status.className=`status ${kind}`; }
  function hideStatus() { els.status.className="status hidden"; }

  function initCategories() {
    $("cats").innerHTML = categories.map(cat=>`<button class="${cat==="ทั้งหมด"?"active":""}" data-cat="${escapeHtml(cat)}">${icons[cat]||"✨"} ${escapeHtml(cat)}</button>`).join("");
    $("cats").addEventListener("click", e=>{ const btn=e.target.closest("button[data-cat]"); if(!btn)return; state.category=btn.dataset.cat; document.querySelectorAll("#cats button").forEach(x=>x.classList.toggle("active",x===btn)); render(); });
  }
  function initMaps() {
    const tiles="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    state.map=L.map("map").setView(MARKET_CENTER,16);
    state.miniMap=L.map("miniMap",{zoomControl:false,attributionControl:false,dragging:true,scrollWheelZoom:false}).setView(MARKET_CENTER,16);
    L.tileLayer(tiles,{attribution:"&copy; OpenStreetMap contributors"}).addTo(state.map);
    L.tileLayer(tiles).addTo(state.miniMap);
  }
  async function loadShops() {
    if (!db) {
      state.shops=demo;
      showStatus("ขณะนี้กำลังแสดงข้อมูลตัวอย่าง กรุณาใส่ Supabase URL และ Anon Key ใน config.js เพื่อใช้ฐานข้อมูลออนไลน์ร่วมกัน", "warning");
      render(); return;
    }
    showStatus("กำลังโหลดข้อมูลร้านค้า...", "info");
    const {data,error}=await db.from("shops").select("*").eq("approved",true).order("featured",{ascending:false}).order("created_at",{ascending:false});
    if (error) { state.shops=demo; showStatus("เชื่อมฐานข้อมูลไม่สำเร็จ จึงแสดงข้อมูลตัวอย่าง: "+error.message,"error"); }
    else { state.shops=data||[]; hideStatus(); }
    render();
  }

  function filteredShops() {
    const q=els.search.value.trim().toLowerCase();
    let list=state.shops.filter(shop=>{
      const searchable=[shop.name,shop.description,shop.category,shop.address].filter(Boolean).join(" ").toLowerCase();
      if (state.category!=="ทั้งหมด" && shop.category!==state.category) return false;
      if (q && !searchable.includes(q)) return false;
      if (state.openOnly && isOpen(shop)!==true) return false;
      if (state.featuredOnly && !shop.featured) return false;
      if (state.favoriteOnly && !isFavorite(shop)) return false;
      return true;
    });
    list=list.map(shop=>({...shop,_distance:distanceFor(shop)}));
    if (state.sort==="name") list.sort((a,b)=>(a.name||"").localeCompare(b.name||"","th"));
    else if (state.sort==="newest") list.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
    else if (state.sort==="distance") list.sort((a,b)=>(a._distance??Infinity)-(b._distance??Infinity));
    else list.sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured)) || new Date(b.created_at||0)-new Date(a.created_at||0));
    return list;
  }

  function render() {
    const list=filteredShops();
    $("shopCount").textContent=state.shops.length;
    els.result.textContent=`พบ ${list.length} ร้าน${state.favoriteOnly?"ในร้านโปรด":""}`;
    els.grid.innerHTML="";
    els.empty.classList.toggle("hidden",list.length>0);
    list.forEach(shop=>els.grid.appendChild(shopCard(shop)));
    updateMapPins(list);
    $("favoriteNav").classList.toggle("active",state.favoriteOnly);
    $("openNow").classList.toggle("active",state.openOnly);
    $("featuredOnly").classList.toggle("active",state.featuredOnly);
  }

  function shopCard(shop) {
    const article=document.createElement("article"); article.className="card";
    const open=isOpen(shop), distance=shop._distance ?? distanceFor(shop), image=shop.image?`<img src="${escapeHtml(shop.image)}" alt="${escapeHtml(shop.name)}" loading="lazy" onerror="this.parentElement.classList.add('noImage');this.remove()">`:"";
    article.innerHTML=`
      <div class="cardImage ${image?"":"noImage"}">${image}<div class="imageFallback">${icons[shop.category]||"🏪"}</div>
        <span class="categoryTag">${escapeHtml(shop.category||"ร้านค้า")}</span>
        ${shop.featured?'<span class="featuredTag">⭐ แนะนำ</span>':''}
        <button class="heart ${isFavorite(shop)?"saved":""}" aria-label="ร้านโปรด">${isFavorite(shop)?"♥":"♡"}</button>
      </div>
      <div class="cardBody">
        <div class="cardTitleRow"><h3>${escapeHtml(shop.name||"ร้านค้า")}</h3>${open===null?"":`<span class="openState ${open?"open":"closed"}">${open?"เปิดอยู่":"ปิดแล้ว"}</span>`}</div>
        <p>${escapeHtml(shop.description||"ร้านค้าในตลาดกระทุ่มแบน")}</p>
        <div class="metaLine">📍 ${escapeHtml(shop.address||"ตลาดกระทุ่มแบน")}</div>
        <div class="infoChips">${shop.open_time&&shop.close_time?`<span>🕒 ${shop.open_time.slice(0,5)}–${shop.close_time.slice(0,5)}</span>`:""}${distance!==null?`<span>📏 ${distanceText(distance)}</span>`:""}</div>
        <div class="cardActions"><button class="viewDetail">ดูรายละเอียด</button><a class="navigate" href="${mapsUrl(shop)}" target="_blank" rel="noopener">🧭 นำทาง</a></div>
      </div>`;
    article.querySelector(".heart").onclick=()=>toggleFavorite(shop);
    article.querySelector(".viewDetail").onclick=()=>openDetail(shop);
    article.querySelector(".cardImage").ondblclick=()=>openDetail(shop);
    return article;
  }

  function mapsUrl(shop) {
    return number(shop.latitude)!==null&&number(shop.longitude)!==null ? `https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((shop.name||"")+" ตลาดกระทุ่มแบน")}`;
  }
  function openDetail(shop) {
    const open=isOpen(shop), distance=distanceFor(shop);
    const channels=[];
    if(shop.phone)channels.push(`<a href="tel:${escapeHtml(shop.phone)}">📞 โทร ${escapeHtml(shop.phone)}</a>`);
    if(shop.facebook)channels.push(`<a href="${normalizeUrl(shop.facebook,"facebook")}" target="_blank" rel="noopener">Facebook</a>`);
    if(shop.line)channels.push(`<a href="${normalizeUrl(shop.line,"line")}" target="_blank" rel="noopener">LINE</a>`);
    if(shop.tiktok)channels.push(`<a href="${normalizeUrl(shop.tiktok,"tiktok")}" target="_blank" rel="noopener">TikTok</a>`);
    if(shop.website)channels.push(`<a href="${normalizeUrl(shop.website)}" target="_blank" rel="noopener">เว็บไซต์</a>`);
    $("detailContent").innerHTML=`
      <div class="detailHero ${shop.image?"":"noImage"}">${shop.image?`<img src="${escapeHtml(shop.image)}" alt="${escapeHtml(shop.name)}" onerror="this.remove()">`:""}<div class="imageFallback">${icons[shop.category]||"🏪"}</div></div>
      <div class="detailBody"><div class="detailBadges"><span>${escapeHtml(shop.category||"ร้านค้า")}</span>${shop.featured?"<span>⭐ ร้านแนะนำ</span>":""}${open===null?"":`<span class="${open?"openText":"closedText"}">${open?"🟢 เปิดอยู่":"🔴 ปิดแล้ว"}</span>`}</div>
      <h2 id="detailName">${escapeHtml(shop.name||"ร้านค้า")}</h2><p class="detailDescription">${escapeHtml(shop.description||"ร้านค้าในตลาดกระทุ่มแบน")}</p>
      <div class="detailInfo"><div><b>สถานที่</b><span>${escapeHtml(shop.address||"ตลาดกระทุ่มแบน")}</span></div>${shop.open_time&&shop.close_time?`<div><b>เวลาเปิด–ปิด</b><span>${shop.open_time.slice(0,5)}–${shop.close_time.slice(0,5)} น.</span></div>`:""}${distance!==null?`<div><b>ระยะทางโดยประมาณ</b><span>${distanceText(distance)}</span></div>`:""}</div>
      <div class="detailActions"><a class="primaryLink" href="${mapsUrl(shop)}" target="_blank" rel="noopener">🧭 เปิดเส้นทาง</a><button id="shareShop">แชร์ร้าน</button><button id="favDetail">${isFavorite(shop)?"♥ ร้านโปรด":"♡ เพิ่มร้านโปรด"}</button></div>
      ${channels.length?`<div class="channels"><h3>ช่องทางติดต่อ</h3>${channels.join("")}</div>`:""}</div>`;
    $("shareShop").onclick=()=>shareShop(shop);
    $("favDetail").onclick=()=>{toggleFavorite(shop);openDetail(shop)};
    openModal("detailModal");
  }
  async function shareShop(shop) {
    const text=`${shop.name} - ${shop.description||"ร้านค้าในตลาดกระทุ่มแบน"}`;
    try { if(navigator.share) await navigator.share({title:shop.name,text,url:mapsUrl(shop)}); else { await navigator.clipboard.writeText(`${text}\n${mapsUrl(shop)}`); showToast("คัดลอกข้อมูลร้านแล้ว"); } } catch(e) { if(e.name!=="AbortError") showToast("ไม่สามารถแชร์ได้"); }
  }

  function updateMapPins(list) {
    state.markers.forEach(m=>state.map.removeLayer(m)); state.miniMarkers.forEach(m=>state.miniMap.removeLayer(m)); state.markers=[]; state.miniMarkers=[];
    const valid=list.filter(s=>number(s.latitude)!==null&&number(s.longitude)!==null);
    valid.forEach(shop=>{
      const ll=[+shop.latitude,+shop.longitude], popup=`<b>${escapeHtml(shop.name)}</b><br>${escapeHtml(shop.category||"")}<br><button class="popupBtn" onclick="window.__openShop('${escapeHtml(favoriteKey(shop))}')">ดูร้าน</button>`;
      state.markers.push(L.marker(ll).bindPopup(popup).addTo(state.map));
      state.miniMarkers.push(L.circleMarker(ll,{radius:7,weight:3,color:"#a70d13",fillColor:"#fff",fillOpacity:1}).bindTooltip(shop.name).addTo(state.miniMap));
    });
    fitMap(valid);
  }
  function fitMap(valid=filteredShops().filter(s=>number(s.latitude)!==null&&number(s.longitude)!==null)) {
    if(valid.length>1){const bounds=L.latLngBounds(valid.map(s=>[+s.latitude,+s.longitude]));state.map.fitBounds(bounds.pad(.18));state.miniMap.fitBounds(bounds.pad(.2));}
    else if(valid.length===1){state.map.setView([+valid[0].latitude,+valid[0].longitude],17);state.miniMap.setView([+valid[0].latitude,+valid[0].longitude],16);}
    else {state.map.setView(MARKET_CENTER,16);state.miniMap.setView(MARKET_CENTER,16);}
  }
  window.__openShop = key => { const shop=state.shops.find(s=>favoriteKey(s)===key); if(shop)openDetail(shop); };

  function locateUser(scroll=true) {
    if(!navigator.geolocation){showToast("อุปกรณ์ไม่รองรับตำแหน่งที่ตั้ง");return;}
    showStatus("กำลังค้นหาตำแหน่งของคุณ...","info");
    navigator.geolocation.getCurrentPosition(pos=>{
      state.location={lat:pos.coords.latitude,lng:pos.coords.longitude}; state.sort="distance"; $("sort").value="distance";
      if(state.userMarker)state.map.removeLayer(state.userMarker);
      state.userMarker=L.circleMarker([state.location.lat,state.location.lng],{radius:9,color:"#1769e0",fillColor:"#3b82f6",fillOpacity:1}).addTo(state.map).bindPopup("ตำแหน่งของคุณ").openPopup();
      hideStatus(); render(); if(scroll)$("shopsSection").scrollIntoView({behavior:"smooth"}); showToast("เรียงร้านใกล้คุณแล้ว");
    },()=>{showStatus("ไม่สามารถอ่านตำแหน่งได้ กรุณาอนุญาต Location ในเบราว์เซอร์","error")},{enableHighAccuracy:true,timeout:10000});
  }

  function openModal(id){const modal=$(id);modal.classList.remove("hidden");modal.setAttribute("aria-hidden","false");document.body.classList.add("modalOpen");}
  function closeModal(id){const modal=$(id);modal.classList.add("hidden");modal.setAttribute("aria-hidden","true");document.body.classList.remove("modalOpen");}
  function resetFilters(){state.category="ทั้งหมด";state.openOnly=false;state.featuredOnly=false;state.favoriteOnly=false;state.sort="featured";els.search.value="";$("sort").value="featured";document.querySelectorAll("#cats button").forEach(b=>b.classList.toggle("active",b.dataset.cat==="ทั้งหมด"));render();}

  async function submitShop(event) {
    event.preventDefault();
    if(!db){showToast("ยังไม่ได้เชื่อม Supabase กรุณาตั้งค่า config.js ก่อน");return;}
    const form=event.currentTarget, data=Object.fromEntries(new FormData(form)); delete data[""];
    data.approved=false; data.featured=false; data.latitude=data.latitude?+data.latitude:null; data.longitude=data.longitude?+data.longitude:null;
    for(const key of Object.keys(data)) if(data[key]==="") data[key]=null;
    const button=form.querySelector("button[type=submit]"),old=button.textContent;button.disabled=true;button.textContent="กำลังส่งข้อมูล...";
    const {error}=await db.from("shops").insert(data);
    button.disabled=false;button.textContent=old;
    if(error){showToast("ส่งข้อมูลไม่สำเร็จ: "+error.message);return;}
    form.reset();closeModal("submitModal");showStatus("ส่งข้อมูลร้านสำเร็จแล้ว ขณะนี้รอการตรวจสอบก่อนเผยแพร่","success");window.scrollTo({top:0,behavior:"smooth"});
  }

  function bindEvents() {
    $("searchBtn").onclick=()=>{render();$("shopsSection").scrollIntoView({behavior:"smooth"})}; els.search.oninput=render;
    $("openNow").onclick=()=>{state.openOnly=!state.openOnly;render()}; $("featuredOnly").onclick=()=>{state.featuredOnly=!state.featuredOnly;render()};
    $("favoriteNav").onclick=()=>{state.favoriteOnly=!state.favoriteOnly;render();$("shopsSection").scrollIntoView({behavior:"smooth"})};
    $("sort").onchange=e=>{if(e.target.value==="distance"&&!state.location){locateUser(false);return}state.sort=e.target.value;render()};
    $("near").onclick=()=>locateUser(true); $("fitMap").onclick=()=>fitMap(); $("clearFilters").onclick=resetFilters;
    [$("openSubmit"),$("openSubmitBottom")].forEach(btn=>btn.onclick=()=>openModal("submitModal"));
    document.querySelectorAll("[data-close]").forEach(el=>el.onclick=()=>closeModal(el.dataset.close==="detail"?"detailModal":"submitModal"));
    document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal("detailModal");closeModal("submitModal")}});
    $("form").onsubmit=submitShop;
  }

  initCategories(); initMaps(); bindEvents(); loadShops();
})();
