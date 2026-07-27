import { ExternalLink, MapPin, Phone } from 'lucide-react'
import { useLocation, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
export default function ShopDetail(){
 const {id}=useParams(); const {state}=useLocation(); const [shop,setShop]=useState(state?.shop||null)
 useEffect(()=>{if(!shop&&isSupabaseConfigured) supabase.from('shops').select('*').eq('id',id).single().then(({data})=>setShop(data))},[id,shop])
 if(!shop) return <section className="page section"><div className="state-box">กำลังเปิดข้อมูลร้าน…</div></section>
 return <section className="page section"><div className="detail-cover" style={shop.cover_url?{backgroundImage:`url(${shop.cover_url})`}:{}}></div><div className="detail-card"><small>{shop.category}</small><h1>{shop.name}</h1><p>{shop.description}</p><div className="detail-meta"><span><MapPin size={17}/>{shop.address||shop.zone||'ตลาดกระทุ่มแบน'}</span>{shop.phone&&<a href={`tel:${shop.phone}`}><Phone size={17}/>{shop.phone}</a>}</div><div className="button-row">{shop.lineman&&<a className="primary-button" href={shop.lineman} target="_blank" rel="noreferrer">สั่ง LINE MAN <ExternalLink size={16}/></a>}{shop.facebook&&<a className="secondary-button" href={shop.facebook} target="_blank" rel="noreferrer">Facebook</a>}</div></div></section>
}
