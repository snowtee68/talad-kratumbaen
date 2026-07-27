import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import ShopCard from '../components/ShopCard'
import StateBox from '../components/StateBox'
import { useSupabaseList } from '../hooks/useSupabaseList'

export default function Shops(){
 const [q,setQ]=useState('')
 const {data,loading,error}=useSupabaseList('shops',{filters:[{column:'status',value:'approved'}],limit:100})
 const rows=useMemo(()=>data.filter(s=>`${s.name||''} ${s.description||''} ${s.category||''}`.toLowerCase().includes(q.toLowerCase())),[data,q])
 return <section className="page section"><div className="page-title"><small>ค้นหาและสนับสนุนร้านในชุมชน</small><h1>ร้านค้าทั้งหมด</h1></div>
 <label className="search-box"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหาชื่อร้าน หมวดหมู่ หรือสินค้า"/></label>
 <StateBox loading={loading} error={error} empty={!rows.length}><div className="card-grid">{rows.map(s=><ShopCard key={s.id} shop={s}/>)}</div></StateBox></section>
}
