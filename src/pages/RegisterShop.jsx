import { useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
export default function RegisterShop(){
 const [form,setForm]=useState({name:'',description:'',category:'',phone:'',address:''}); const [message,setMessage]=useState('')
 const submit=async e=>{e.preventDefault(); if(!isSupabaseConfigured){setMessage('กรุณาตั้งค่า Supabase Environment Variables บน Netlify ก่อน');return} const {error}=await supabase.from('shops').insert({...form,status:'pending'}); setMessage(error?error.message:'ส่งข้อมูลแล้ว ร้านจะปรากฏหลังผู้ดูแลอนุมัติ')}
 return <section className="page section narrow"><div className="page-title"><small>เข้าร่วมชุมชนตลาดออนไลน์</small><h1>ลงทะเบียนร้านค้า</h1></div><form className="form-card" onSubmit={submit}>{[['name','ชื่อร้าน'],['category','หมวดหมู่'],['phone','เบอร์โทร'],['address','ที่อยู่/โซน']].map(([k,l])=><label key={k}>{l}<input required={k==='name'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label>รายละเอียดร้าน<textarea rows="5" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><button className="primary-button">ส่งข้อมูลร้านค้า</button>{message&&<p className="form-message">{message}</p>}</form></section>
}
