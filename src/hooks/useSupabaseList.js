import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function useSupabaseList(table, options = {}) {
  const { select = '*', orderBy = 'created_at', ascending = false, filters = [], limit = 20 } = options
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!isSupabaseConfigured) {
        setLoading(false)
        return
      }
      try {
        let query = supabase.from(table).select(select).limit(limit)
        filters.forEach(({ column, operator = 'eq', value }) => {
          if (typeof query[operator] === 'function') query = query[operator](column, value)
        })
        if (orderBy) query = query.order(orderBy, { ascending })
        const { data: rows, error: queryError } = await query
        if (queryError) throw queryError
        if (active) setData(rows || [])
      } catch (err) {
        if (active) setError(err.message || 'ไม่สามารถโหลดข้อมูลได้')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [table, select, orderBy, ascending, limit, JSON.stringify(filters)])

  return { data, loading, error }
}
