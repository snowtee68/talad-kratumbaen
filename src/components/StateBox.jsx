export default function StateBox({ loading, error, empty, children }) {
  if (loading) return <div className="state-box">กำลังโหลดข้อมูล…</div>
  if (error) return <div className="state-box warning">เชื่อมต่อข้อมูลไม่ได้: {error}</div>
  if (empty) return <div className="state-box">ยังไม่มีข้อมูลในส่วนนี้</div>
  return children
}
