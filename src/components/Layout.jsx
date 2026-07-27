import { Home, Store, Newspaper, UserRound, PlusCircle } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const nav = [
  ['/', 'หน้าหลัก', Home],
  ['/shops', 'ร้านค้า', Store],
  ['/feed', 'อัปเดต', Newspaper],
  ['/register-shop', 'เพิ่มร้าน', PlusCircle],
  ['/profile', 'บัญชี', UserRound],
]

export default function Layout() {
  return <div className="app-shell">
    <header className="topbar">
      <div><strong>ตลาดกระทุ่มแบน</strong><small>ตลาดของเรา เรื่องราวของเรา</small></div>
      <NavLink className="dashboard-link" to="/dashboard">หลังร้าน</NavLink>
    </header>
    <main><Outlet /></main>
    <nav className="bottom-nav">
      {nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'} className={({isActive}) => isActive ? 'active' : ''}>
        <Icon size={21}/><span>{label}</span>
      </NavLink>)}
    </nav>
  </div>
}
