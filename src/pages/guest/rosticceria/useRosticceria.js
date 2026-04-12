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
        .eq('is_active', true)
        .order('time')
      if (error) throw error
      setSlots(data || [])
    } catch (err) {
      console.error('Errore slot:', err)
      setSlots([])
    } finally {
      setLoading(false)
    }
  }
  return { slots, loading }
}

export function useInviaOrdine() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function inviaOrdine({ session, slotId, deliveryMode, roomNumber, notes, cartItems }) {
    setLoading(true)
    setError(null)
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', session.user.id)
        .single()

      const customerName = profile?.username || session.user.email

      const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0)

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          user_id: session.user.id,
          customer_name: customerName,
          slot_id: slotId,
          delivery_mode: deliveryMode,
          room_number: deliveryMode === 'camera' ? roomNumber : null,
          notes: notes || null,
          total: total,
        })
        .select()
        .single()
      if (orderErr) throw orderErr

      const orderItems = cartItems.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.name,
        quantity: item.qty,
        unit_price: item.price,
      }))
      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(orderItems)
      if (itemsErr) throw itemsErr

      return { success: true, orderId: order.id }
    } catch (err) {
      setError(err.message)
      return { success: false }
    } finally {
      setLoading(false)
    }
  }

  return { inviaOrdine, loading, error }
}