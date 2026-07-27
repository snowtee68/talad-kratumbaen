import { MapPin, Star } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ShopCard({ shop }) {
  const id = shop.id || shop.slug || 'demo'
  return <Link className="shop-card" to={`/shops/${id}`} state={{ shop }}>
    <div className="shop-image" style={shop.cover_url ? {backgroundImage:`url(${shop.cover_url})`} : {}}>
      {!shop.cover_url && <span>🏪</span>}
      {shop.featured && <b>แนะนำ</b>}
    </div>
    <div className="shop-body">
      <h3>{shop.name || 'ร้านค้าในตลาด'}</h3>
      <p>{shop.description || shop.category || 'ร้านอร่อยและบริการดีในตลาดกระทุ่มแบน'}</p>
      <div className="meta"><span><MapPin size={14}/> {shop.zone || shop.address || 'ตลาดกระทุ่มแบน'}</span><span><Star size={14}/> {shop.rating || 'ใหม่'}</span></div>
    </div>
  </Link>
}
