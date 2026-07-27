import StateBox from '../components/StateBox'
import { useSupabaseList } from '../hooks/useSupabaseList'
export default function Feed(){
 const {data,loading,error}=useSupabaseList('market_posts',{select:'*, shops(name, cover_url)',limit:30})
 return <section className="page section"><div className="page-title"><small>ข่าวสารจากร้านค้า</small><h1>มีอะไรใหม่วันนี้</h1></div>
 <StateBox loading={loading} error={error} empty={!data.length}><div className="feed-list">{data.map(p=><article className="feed-card" key={p.id}><div className="feed-head"><div className="avatar">{p.shops?.name?.[0]||'ต'}</div><div><b>{p.shops?.name||p.author_name||'ร้านค้าในตลาด'}</b><small>{p.created_at ? new Date(p.created_at).toLocaleString('th-TH') : ''}</small></div></div>{p.image_url&&<img src={p.image_url} alt=""/>}<p>{p.content||p.caption||p.title}</p></article>)}</div></StateBox></section>
}
