import { ArrowRight, Search, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import ShopCard from '../components/ShopCard'
import StateBox from '../components/StateBox'
import { useSupabaseList } from '../hooks/useSupabaseList'

const demo = [
  { id:'snowtee', name:'SNOWTEE ตลาดกระทุ่มแบน', category:'เครื่องดื่ม • ไอศกรีม • เบเกอรี่', zone:'ริมคลอง', featured:true },
  { id:'local-food', name:'ร้านอร่อยประจำตลาด', category:'อาหารและของกิน', zone:'โซนตลาดเก่า' }
]

export default function Home(){
  const { data, loading, error } = useSupabaseList('shops', { filters:[{column:'status', value:'approved'}], orderBy:'created_at', limit:8 })
  const shops = data.length ? data : demo
  return <>
    <section className="hero">
      <span className="eyebrow"><Sparkles size={16}/> ชุมชนออนไลน์ของตลาดกระทุ่มแบน</span>
      <h1>หาร้านอร่อย โปรโมชัน และเรื่องราวดี ๆ ใกล้ตัว</h1>
      <p>รวมร้านค้าในตลาดให้ค้นหาง่าย สนับสนุนผู้ประกอบการท้องถิ่น และช่วยให้ตลาดกลับมาคึกคักอีกครั้ง</p>
      <Link to="/shops" className="primary-button"><Search size={18}/> ค้นหาร้านค้า</Link>
    </section>
    <section className="quick-grid">
      <Link to="/feed"><b>มีอะไรใหม่วันนี้</b><span>ดูโพสต์ล่าสุดจากร้านค้า</span></Link>
      <Link to="/shops?promotion=1"><b>โปรโมชันน่าสนใจ</b><span>ค้นหาดีลก่อนใคร</span></Link>
      <Link to="/register-shop"><b>เพิ่มร้านของคุณ</b><span>สมัครร้านค้าเข้าร่วมฟรี</span></Link>
    </section>
    <section className="section">
      <div className="section-heading"><div><small>ร้านเด่นในชุมชน</small><h2>ร้านค้าที่น่าแวะ</h2></div><Link to="/shops">ดูทั้งหมด <ArrowRight size={16}/></Link></div>
      <StateBox loading={loading} error={error && data.length === 0} empty={!shops.length}>
        <div className="card-grid">{shops.map(s=><ShopCard key={s.id} shop={s}/>)}</div>
      </StateBox>
    </section>
  </>
}
