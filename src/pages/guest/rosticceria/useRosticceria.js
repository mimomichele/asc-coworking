import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export function useMenuDelGiorno(date) {
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!date) return
    fetchMenu(date)
  }, [date])
  async function fetchMenu(date) {
    setLoading(true)
    setError(null)
    try {
      const { data: cats, error: catsErr } = await supabase
        .from('menu_categories')
        .select('*')
        .order('sort_order')
      if (catsErr) throw catsErr
      const { data: menu, error: menuErr } = await supabase
        .from('daily_menu')
        .select(`
          id,
          portions,
          is_active,
          products (
            id,
            name,
            description,
            price,
            category_id,
            menu_categories ( id, name )
          )
        `)
        .eq('date', date)
        .eq('is_active', true)
      if (menuErr) throw menuErr
      setCategories(cats || [])
      setItems(menu || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  return { categories, items, loading, error }
}

export function useSlotOrari(date) {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!date) return
    fetchSlots(date)
  }, [date])
  async function fetchSlots(date) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('delivery_slots')
        .select('*')
        .eq('date', date)
        .eq('is_a
