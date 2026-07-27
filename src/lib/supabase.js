import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && key && !key.includes('ใส่ค่า'))
export const supabase = isSupabaseConfigured ? createClient(url, key) : null
