import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const fmt = (n) => '€ ' + Number(n).toFixed(2).replace('.', ',')
const TODAY = new Date().toISOString().split('T')[0]
const DAYS = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato']
const MONTHS = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const S = {
  card: { background: '#fff', borderRadius: 12, border: '0.5px solid #e8e8e4', marginBottom: 8, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 },
  tabBar: { display: 'flex', background: '#fff', borderBottom: '0.5px solid #e8e8e4', overflowX: 'auto', scrollbarWidth: 'none' },
  tab: (active) => ({ flexShrink: 0, padding: '11px 16px', fontSize: 13, fontWeight: active ? 500 : 400, color: active ? '#D85A30' : '#888', background: 'none', border: 'none', borderBottom: active ? '2px solid #D85A30' : '2px solid transparent', cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }),
  badge: (n) => ({ display: n > 0 ? 'inline-flex' : 'none', alignItems: 'center', justifyContent: 'center', background: '#D85A30', color: '#fff', borderRadius: 10, fontSize: 11, minWidth: 17, height: 17, padding: '0 4px', marginLeft: 4 }),
  orderCard: (isNew) => ({ background: '#fff', borderRadius: 12, border: isNew ? '0.5px solid #D85A30' : '0.5px solid #e8e8e4', marginBottom: 8, overflow: 'hidden' }),
  orderHeader: { padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '0.5px solid #f0f0ee', flexWrap: 'wrap' },
  customerName: { fontSize: 15, fontWeight: 500, color: '#1a1a1a', flex: 1 },
  modeBadge: (mode) => ({ fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 500, background: mode === 'reception' ? '#E6F1FB' : '#FAEEDA', color: mode === 'reception' ? '#185FA5' : '#854F0B' }),
  newBadge: { fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D', fontWeight: 500 },
  orderBody: { padding: '10px 14px' },
  orderItemRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', lineHeight: 1.9 },
  orderNote: { marginTop: 6, fontSize: 12, color: '#aaa', background: '#f5f5f3', borderRadius: 8, padding: '5px 8px' },
  orderFooter: { padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '0.5px solid #f0f0ee', background: '#fafaf8' },
  btnPrimary: { background: '#D85A30', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 500, cursor: 'pointer', width: '100%', marginTop: 12 },
  btnSecondary: { background: '#f5f5f3', color: '#1a1a1a', border: '0.5px solid #e8e8e4', borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 500, cursor: 'pointer', width: '100%', marginTop: 8 },
  input: { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid #ddd', background: '#fff', color: '#1a1a1a', outline: 'none' },
  pill: (active) => ({ flexShrink: 0, padding: '5px 12px', borderRadius: 20, fontSize: 12, border: active ? 'none' : '0.5px solid #ddd', background: active ? '#D85A30' : '#f5f5f3', color: active ? '#fff' : '#888', cursor: 'pointer', fontWeight: active ? 500 : 400 }),
  divider: { fontSize: 11, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' },
  prodLine: { display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '0.5px solid #f0f0ee', gap: 10 },
  qtyBig: { fontSize: 22, fontWeight: 500, color: '#1a1a1a', minWidth: 36, textAlign: 'right' },
}

function ConfirmDialog({ msg, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e8e8e4', padding: 24, maxWidth: 300, width: '90%', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#1a1a1a', marginBottom: 16, lineHeight: 1.5 }}>{msg}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 8, borderRadius: 8, border: '0.5px solid #ddd', background: '#f5f5f3', fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: '#E24B4A', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Elimina</button>
        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{ position: 'relative', width: 34, height: 19, flexShrink: 0, cursor: 'pointer' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: checked ? '#1D9E75' : '#ddd', transition: 'background .2s' }} />
      <div style={{ position: 'absolute', top: 2, left: checked ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
    </div>
  )
}

async function generateOrdersPDF(orders) {
  const { jsPDF } = await import('https://esm.sh/jspdf@2.5.1')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const now = new Date().toLocaleString('it-IT')
  let y = 15
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('ASC Hotel — Ordini rosticceria', 15, y); y += 7
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(120)
  doc.text(`Generato il ${now}`, 15, y); doc.setTextColor(0); y += 10
  orders.forEach((order, i) => {
    if (y > 260) { doc.addPage(); y = 15 }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text(`#${String(i + 1).padStart(3, '0')} — ${order.customer_name}`, 15, y); y += 5
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    const mode = order.delivery_mode === 'camera' ? `Camera ${order.room_number}` : 'Reception'
    const slotTime = order.delivery_slots?.time?.slice(0, 5) || ''
    doc.text(`${mode} · Ore ${slotTime}`, 15, y); y += 5
    order.order_items?.forEach(item => {
      doc.text(`  ${item.product_name} x${item.quantity}   ${fmt(item.unit_price * item.quantity)}`, 15, y); y += 5
    })
    if (order.notes) { doc.setTextColor(150); doc.text(`  Note: ${order.notes}`, 15, y); doc.setTextColor(0); y += 5 }
    doc.setFont('helvetica', 'bold')
    doc.text(`  Totale: ${fmt(order.total)}`, 15, y); doc.setFont('helvetica', 'normal'); y += 8
    doc.setDrawColor(230); doc.line(15, y - 3, 195, y - 3)
  })
  doc.save(`ordini-rosticceria-${TODAY}.pdf`)
}

async function generateProduzionePDF(grouped, slotFilter) {
  const { jsPDF } = await import('https://esm.sh/jspdf@2.5.1')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const now = new Date().toLocaleString('it-IT')
  let y = 15
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('ASC Hotel — Lista produzione', 15, y); y += 7
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(120)
  doc.text(`${slotFilter === 'tutti' ? 'Tutti gli orari' : 'Ore ' + slotFilter} · Generato il ${now}`, 15, y)
  doc.setTextColor(0); y += 10
  Object.entries(grouped).forEach(([cat, items]) => {
    if (y > 260) { doc.addPage(); y = 15 }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 80, 30)
    doc.text(cat.toUpperCase(), 15, y); doc.setTextColor(0); y += 6
    items.forEach(item => {
      doc.setFontSize(13); doc.setFont('helvetica', 'normal')
      doc.text(item.name, 15, y)
      doc.setFont('helvetica', 'bold'); doc.text(`${item.qty} pz`, 175, y, { align: 'right' })
      doc.setFont('helvetica', 'normal'); y += 7
    })
    y += 3
  })
  doc.save(`produzione-rosticceria-${TODAY}.pdf`)
}

function TabOrdini({ orders, loading }) {
  const nuovi = orders.filter(o => (Date.now() - new Date(o.created_at).getTime()) / 60000 < 30)
  const precedenti = orders.filter(o => (Date.now() - new Date(o.created_at).getTime()) / 60000 >= 30)
  return (
    <div>
      <button style={{ ...S.btnSecondary, marginTop: 0, marginBottom: 12 }} onClick={() => generateOrdersPDF(orders)}>
        ↓ Scarica PDF ordini
      </button>
      {loading && <div style={{ textAlign: 'center', padding: 32, color: '#aaa', fontSize: 14 }}>Caricamento...</div>}
      {!loading && orders.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: '#aaa', fontSize: 14 }}>Nessun ordine oggi</div>}
      {nuovi.length > 0 && <div style={S.divider}>Nuovi</div>}
      {nuovi.map(o => <OrderCard key={o.id} order={o} isNew />)}
      {precedenti.length > 0 && <div style={S.divider}>Ricevuti oggi</div>}
      {precedenti.map(o => <OrderCard key={o.id} order={o} isNew={false} />)}
    </div>
  )
}

function OrderCard({ order, isNew }) {
  const mode = order.delivery_mode
  const time = order.delivery_slots?.time?.slice(0, 5) || ''
  return (
    <div style={S.orderCard(isNew)}>
      <div style={S.orderHeader}>
        <span style={S.customerName}>{order.customer_name}</span>
        <span style={{ fontSize: 12, color: '#bbb' }}>#{order.id.slice(-4).toUpperCase()}</span>
        <span style={S.modeBadge(mode)}>{mode === 'camera' ? `Camera ${order.room_number}` : 'Reception'}</span>
        {isNew && <span style={S.newBadge}>Nuovo</span>}
      </div>
      <div style={S.orderBody}>
        {order.order_items?.map((item, i) => (
          <div key={i} style={S.orderItemRow}>
            <span>{item.product_name} ×{item.quantity}</span>
            <span>{fmt(item.unit_price * item.quantity)}</span>
          </div>
        ))}
        {order.notes && <div style={S.orderNote}>{order.notes}</div>}
      </div>
      <div style={S.orderFooter}>
        <span style={{ fontSize: 12, color: '#888' }}>{mode === 'camera' ? 'Consegna' : 'Ritiro'} ore {time}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>{fmt(order.total)}</span>
      </div>
    </div>
  )
}

function TabProduzione({ orders }) {
  const [slotFilter, setSlotFilter] = useState('tutti')
  const slots = [...new Set(orders.map(o => o.delivery_slots?.time?.slice(0, 5)).filter(Boolean))].sort()
  const filtered = slotFilter === 'tutti' ? orders : orders.filter(o => o.delivery_slots?.time?.slice(0, 5) === slotFilter)
  const grouped = {}
  filtered.forEach(order => {
    order.order_items?.forEach(item => {
      const cat = item.products?.menu_categories?.name || 'Altro'
      if (!grouped[cat]) grouped[cat] = {}
      if (!grouped[cat][item.product_name]) grouped[cat][item.product_name] = 0
      grouped[cat][item.product_name] += item.quantity
    })
  })
  const groupedArr = {}
  Object.entries(grouped).forEach(([cat, items]) => {
    groupedArr[cat] = Object.entries(items).map(([name, qty]) => ({ name, qty }))
  })
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button style={S.pill(slotFilter === 'tutti')} onClick={() => setSlotFilter('tutti')}>Tutti gli orari</button>
        {slots.map(s => <button key={s} style={S.pill(slotFilter === s)} onClick={() => setSlotFilter(s)}>{s}</button>)}
      </div>
      {Object.keys(groupedArr).length === 0 && <div style={{ textAlign: 'center', padding: 32, color: '#aaa', fontSize: 14 }}>Nessun ordine</div>}
      {Object.entries(groupedArr).map(([cat, items]) => (
        <div key={cat} style={{ ...S.card, marginBottom: 8 }}>
          <div style={{ padding: '10px 14px', background: '#fafaf8', borderBottom: '0.5px solid #f0f0ee', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{cat}</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>{items.reduce((s, i) => s + i.qty, 0)} pz totali</span>
          </div>
          {items.map((item, i) => (
            <div key={i} style={{ ...S.prodLine, borderBottom: i < items.length - 1 ? '0.5px solid #f0f0ee' : 'none' }}>
              <span style={{ flex: 1, fontSize: 14, color: '#1a1a1a' }}>{item.name}</span>
              <span style={S.qtyBig}>{item.qty}</span>
              <span style={{ fontSize: 12, color: '#aaa', minWidth: 24 }}>pz</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ background: '#f5f5f3', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: '#888' }}>Ordini inclusi</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>{filtered.length}</span>
      </div>
      <button style={S.btnSecondary} onClick={() => generateProduzionePDF(groupedArr, slotFilter)}>
        ↓ Scarica PDF produzione
      </button>
    </div>
  )
}

function TabMenu({ categories }) {
  const [menuDate, setMenuDate] = useState(TODAY)
  const [menuItems, setMenuItems] = useState([])
  const [products, setProducts] = useState([])

  useEffect(() => { fetchMenu() }, [menuDate])
  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('id, name, price, category_id').eq('is_active', true).order('name')
    setProducts(data || [])
  }

  async function fetchMenu() {
    const { data } = await supabase.from('daily_menu').select('id, product_id, portions, is_active').eq('date', menuDate)
    setMenuItems(data || [])
  }

  function getItem(productId) {
    return menuItems.find(m => m.product_id === productId)
  }

  async function toggleProduct(product, checked) {
    const existing = getItem(product.id)
    if (checked) {
      if (existing) {
        await supabase.from('daily_menu').update({ is_active: true }).eq('id', existing.id)
        setMenuItems(prev => prev.map(m => m.id === existing.id ? { ...m, is_active: true } : m))
      } else {
        const { data } = await supabase.from('daily_menu').insert({ product_id: product.id, date: menuDate, is_active: true, portions: null }).select().single()
        if (data) setMenuItems(prev => [...prev, data])
      }
    } else {
      if (existing) {
        await supabase.from('daily_menu').update({ is_active: false }).eq('id', existing.id)
        setMenuItems(prev => prev.map(m => m.id === existing.id ? { ...m, is_active: false } : m))
      }
    }
  }

  async function updatePortions(product, val) {
    const existing = getItem(product.id)
    if (!existing) return
    const portions = val === '' ? null : parseInt(val)
    await supabase.from('daily_menu').update({ portions }).eq('id', existing.id)
    setMenuItems(prev => prev.map(m => m.id === existing.id ? { ...m, portions } : m))
  }

  const isToday = menuDate === TODAY
  const isTomorrow = menuDate === addDays(TODAY, 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMenuDate(d => addDays(d, -1))} style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid #ddd', background: '#f5f5f3', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#1a1a1a', textAlign: 'center' }}>
          {fmtDate(menuDate)}
          {isToday && <span style={{ fontSize: 11, background: '#E1F5EE', color: '#0F6E56', borderRadius: 20, padding: '2px 8px', marginLeft: 6, fontWeight: 500 }}>Oggi</span>}
          {isTomorrow && <span style={{ fontSize: 11, background: '#FAEEDA', color: '#854F0B', borderRadius: 20, padding: '2px 8px', marginLeft: 6, fontWeight: 500 }}>Domani</span>}
        </span>
        <button onClick={() => setMenuDate(d => addDays(d, 1))} style={{ width: 28, height: 28, borderRadius: '50%', border: '0.5px solid #ddd', background: '#f5f5f3', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>
      {categories.map(cat => {
        const catProducts = products.filter(p => p.category_id === cat.id)
        if (!catProducts.length) return null
        return (
          <div key={cat.id} style={{ ...S.card, marginBottom: 8 }}>
            <div style={{ padding: '10px 12px', background: '#fafaf8', borderBottom: '0.5px solid #f0f0ee' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{cat.name}</span>
            </div>
            {catProducts.map((p, i) => {
              const item = getItem(p.id)
              const active = item ? item.is_active : false
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i < catProducts.length - 1 ? '0.5px solid #f0f0ee' : 'none' }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#1a1a1a' }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: '#aaa', minWidth: 44, textAlign: 'right' }}>€ {Number(p.price).toFixed(2).replace('.', ',')}</span>
                  {active && (
                    <>
                      <input
                        type="number" min="1" placeholder="∞"
                        value={item?.portions ?? ''}
                        onChange={e => updatePortions(p, e.target.value)}
                        style={{ width: 52, padding: '4px 6px', fontSize: 12, borderRadius: 8, border: '0.5px solid #ddd', background: '#f5f5f3', color: '#1a1a1a', textAlign: 'center', outline: 'none' }}
                      />
                      <span style={{ fontSize: 10, color: '#aaa', minWidth: 44 }}>porzioni</span>
                    </>
                  )}
                  <Toggle checked={active} onChange={v => toggleProduct(p, v)} />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function TabOrari() {
  const [slots, setSlots] = useState([])
  const [newTime, setNewTime] = useState('16:00')
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchSlots() }, [])

  async function fetchSlots() {
    const { data } = await supabase.from('delivery_slots').select('*').eq('date', TODAY).order('time')
    setSlots(data || [])
  }

  async function addSlot() {
    if (!newTime || slots.find(s => s.time.slice(0, 5) === newTime)) return
    setSaving(true)
    const { data } = await supabase.from('delivery_slots').insert({ date: TODAY, time: newTime, is_active: true }).select().single()
    if (data) setSlots(prev => [...prev, data].sort((a, b) => a.time.localeCompare(b.time)))
    setSaving(false)
  }

  async function deleteSlot(id) {
    await supabase.from('delivery_slots').delete().eq('id', id)
    setSlots(prev => prev.filter(s => s.id !== id))
    setConfirm(null)
  }

  return (
    <div>
      {confirm && <ConfirmDialog msg={`Eliminare lo slot delle ${confirm.time.slice(0, 5)}?`} onConfirm={() => deleteSlot(confirm.id)} onCancel={() => setConfirm(null)} />}
      <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Slot orari per oggi — {fmtDate(TODAY)}</p>
      {slots.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderRadius: 8, border: '0.5px solid #e8e8e4', marginBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a', minWidth: 44 }}>{s.time.slice(0, 5)}</span>
          <span style={{ flex: 1, fontSize: 12, color: '#aaa' }}>Slot attivo</span>
          <button onClick={() => setConfirm(s)} style={{ width: 26, height: 26, borderRadius: '50%', border: '0.5px solid #ddd', background: 'none', color: '#ccc', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      ))}
      {slots.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>Nessuno slot per oggi</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ flex: 1, padding: '8px 10px', fontSize: 14, borderRadius: 8, border: '0.5px solid #ddd', background: '#fff', color: '#1a1a1a', outline: 'none' }} />
        <button onClick={addSlot} disabled={saving} style={{ background: '#D85A30', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
          Aggiungi
        </button>
      </div>
    </div>
  )
}

function TabProdotti({ categories, onCategoriesChange }) {
  const [products, setProducts] = useState([])
  const [selectedCat, setSelectedCat] = useState('tutti')
  const [confirm, setConfirm] = useState(null)
  const [newCat, setNewCat] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', price: '', category_id: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('id, name, description, price, category_id, is_active').eq('is_active', true).order('name')
    setProducts(data || [])
  }

  async function deleteProduct(id) {
    await supabase.from('products').update({ is_active: false }).eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
    setConfirm(null)
  }

  async function addCategory() {
    const val = newCat.trim()
    if (!val) return
    const maxOrder = Math.max(0, ...categories.map(c => c.sort_order))
    const { data } = await supabase.from('menu_categories').insert({ name: val, sort_order: maxOrder + 1 }).select().single()
    if (data) { onCategoriesChange([...categories, data]); setNewCat('') }
  }

  async function saveProduct() {
    if (!form.name || !form.price || !form.category_id) return
    setSaving(true)
    const { data } = await supabase.from('products').insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parseFloat(form.price),
      category_id: form.category_id,
      is_active: true,
    }).select().single()
    if (data) {
      setProducts(prev => [...prev, data])
      setShowForm(false)
      setForm({ name: '', description: '', price: '', category_id: '' })
    }
    setSaving(false)
  }

  const filtered = selectedCat === 'tutti' ? products : products.filter(p => p.category_id === selectedCat)

  return (
    <div>
      {confirm && <ConfirmDialog msg={`Eliminare "${confirm.name}" dal catalogo? L'operazione non è reversibile.`} onConfirm={() => deleteProduct(confirm.id)} onCancel={() => setConfirm(null)} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nuova categoria (es. Secondi caldi)" style={{ ...S.input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addCategory()} />
        <button onClick={addCategory} style={{ background: '#D85A30', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>+ Categoria</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button style={S.pill(selectedCat === 'tutti')} onClick={() => setSelectedCat('tutti')}>Tutti</button>
        {categories.map(c => <button key={c.id} style={S.pill(selectedCat === c.id)} onClick={() => setSelectedCat(c.id)}>{c.name}</button>)}
      </div>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>Nessun prodotto</div>}
      {filtered.map(p => {
        const cat = categories.find(c => c.id === p.category_id)
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '0.5px solid #e8e8e4', marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{cat?.name}{p.description ? ' · ' + p.description : ''}</div>
            </div>
            <div style={{ fontSize: 13, color: '#888', flexShrink: 0 }}>€ {Number(p.price).toFixed(2).replace('.', ',')}</div>
            <button onClick={() => setConfirm(p)} style={{ width: 28, height: 28, borderRadius: 8, border: '0.5px solid #ddd', background: 'none', color: '#ccc', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        )
      })}
      {showForm ? (
        <div style={{ ...S.card, padding: 14, marginTop: 12 }}>
          <p style={S.sectionTitle}>Nuovo prodotto</p>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome" style={{ ...S.input, marginBottom: 8 }} />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrizione (opzionale)" style={{ ...S.input, marginBottom: 8 }} />
          <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="Prezzo (es. 7.50)" style={{ ...S.input, marginBottom: 8 }} />
          <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...S.input, marginBottom: 12 }}>
            <option value="">Seleziona categoria</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 9, borderRadius: 8, border: '0.5px solid #ddd', background: '#f5f5f3', fontSize: 13, cursor: 'pointer' }}>Annulla</button>
            <button onClick={saveProduct} disabled={saving} style={{ flex: 1, padding: 9, borderRadius: 8, border: 'none', background: '#D85A30', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {saving ? 'Salvataggio...' : 'Salva prodotto'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={{ ...S.btnPrimary, marginTop: 12 }}>+ Nuovo prodotto</button>
      )}
    </div>
  )
}

export default function RosticceriaPannello() {
  const [tab, setTab] = useState('ordini')
  const [orders, setOrders] = useState([])
  const [categories, setCategories] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [newOrderCount, setNewOrderCount] = useState(0)

  useEffect(() => {
    fetchCategories()
    fetchOrders()
    const sub = supabase
      .channel('orders-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
        setNewOrderCount(n => n + 1)
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [])

  async function fetchCategories() {
    const { data } = await supabase.from('menu_categories').select('*').order('sort_order')
    setCategories(data || [])
  }

  async function fetchOrders() {
    setOrdersLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id, customer_name, delivery_mode, room_number, notes, total, created_at,
        delivery_slots ( time ),
        order_items (
          product_name, quantity, unit_price,
          products ( menu_categories ( name ) )
        )
      `)
      .gte('created_at', TODAY + 'T00:00:00')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setOrdersLoading(false)
  }

  const tabs = [
    { id: 'ordini', label: 'Ordini', badge: newOrderCount },
    { id: 'produzione', label: 'Produzione' },
    { id: 'menu', label: 'Menù del giorno' },
    { id: 'orari', label: 'Orari' },
    { id: 'prodotti', label: 'Prodotti' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', animation: 'pulse 2s ease-in-out infinite' }} />
        <span style={{ fontSize: 12, color: '#0F6E56' }}>Live</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>Pannello rosticceria</span>
        <span style={{ fontSize: 13, color: '#aaa', marginLeft: 'auto' }}>{fmtDate(TODAY)}</span>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
      <div style={S.card}>
        <div style={S.tabBar}>
          {tabs.map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => { setTab(t.id); if (t.id === 'ordini') setNewOrderCount(0) }}>
              {t.label}
              {t.badge > 0 && <span style={S.badge(t.badge)}>{t.badge}</span>}
            </button>
          ))}
        </div>
        <div style={{ padding: 14 }}>
          {tab === 'ordini'     && <TabOrdini orders={orders} loading={ordersLoading} />}
          {tab === 'produzione' && <TabProduzione orders={orders} />}
          {tab === 'menu'       && <TabMenu categories={categories} />}
          {tab === 'orari'      && <TabOrari />}
          {tab === 'prodotti'   && <TabProdotti categories={categories} onCategoriesChange={setCategories} />}
        </div>
      </div>
    </div>
  )
}
