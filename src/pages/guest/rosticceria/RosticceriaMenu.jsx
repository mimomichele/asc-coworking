import { useState, useMemo, useEffect } from 'react'
import { useMenuDelGiorno, useSlotOrari } from './useRosticceria'
import { supabase } from '../../../lib/supabase'
import Checkout from './Checkout'

const TODAY = new Date().toISOString().split('T')[0]
const fmt = (n) => '€\u00a0' + Number(n).toFixed(2).replace('.', ',')

export default function RosticceriaMenu({ session }) {
  const [cart, setCart] = useState({})
  const [activeCat, setActiveCat] = useState('tutti')
  const [showCheckout, setShowCheckout] = useState(false)
  const [orderDone, setOrderDone] = useState(null)
  const [myOrders, setMyOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)

  const { categories, items, loading, error } = useMenuDelGiorno(TODAY)
  const { slots } = useSlotOrari(TODAY)

  useEffect(() => { fetchMyOrders() }, [orderDone])

  async function fetchMyOrders() {
    setOrdersLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id, delivery_mode, room_number, total, created_at, notes,
        delivery_slots ( time ),
        order_items ( product_name, quantity, unit_price )
      `)
      .eq('user_id', session.user.id)
      .gte('created_at', TODAY + 'T00:00:00')
      .order('created_at', { ascending: false })
    setMyOrders(data || [])
    setOrdersLoading(false)
  }

  const grouped = useMemo(() => {
    const map = {}
    items.forEach((item) => {
      const catId = item.products?.category_id
      if (!catId) return
      if (!map[catId]) map[catId] = []
      map[catId].push(item)
    })
    return map
  }, [items])

  const cartCount = Object.values(cart).reduce((s, i) => s + i.qty, 0)
  const cartTotal = Object.values(cart).reduce((s, i) => s + i.price * i.qty, 0)
  const cartItems = Object.values(cart).filter((i) => i.qty > 0)

  function changeQty(item, delta) {
    const id = item.id
    const current = cart[id]?.qty || 0
    const next = Math.max(0, current + delta)
    const maxPortions = item.portions ?? Infinity
    if (delta > 0 && current >= maxPortions) return
    if (next === 0) {
      const updated = { ...cart }
      delete updated[id]
      setCart(updated)
    } else {
      setCart({
        ...cart,
        [id]: {
          productId: item.products.id,
          name: item.products.name,
          price: item.products.price,
          qty: next,
        },
      })
    }
  }

  if (orderDone) {
    return <OrderConfirmation order={orderDone} onBack={() => setOrderDone(null)} />
  }

  if (showCheckout) {
    return (
      <Checkout
        session={session}
        cartItems={cartItems}
        cartTotal={cartTotal}
        slots={slots}
        onBack={() => setShowCheckout(false)}
        onSuccess={(order) => { setCart({}); setOrderDone(order) }}
      />
    )
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Brand card rosticceria — logo, indirizzo (cliccabile → Maps), CTA chiama/WhatsApp */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '0.5px solid #e8e8e4',
        padding: 14,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <img
            src="/logo-rosticceria-103.png"
            alt="Rosticceria 103"
            width={64}
            height={64}
            style={{ width: 64, height: 64, borderRadius: 8, flexShrink: 0, display: 'block' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
              Rosticceria 103
            </div>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Via+della+Chimera+103+52100+Arezzo"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12, color: '#888', textDecoration: 'none',
                display: 'block', lineHeight: 1.45,
              }}
            >
              <span style={{ marginRight: 4 }}>📍</span>
              Via della Chimera 103<br />52100 Arezzo (AR)
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="tel:+390575356202"
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 10,
              background: '#D85A30', color: '#fff',
              textAlign: 'center', textDecoration: 'none',
              fontSize: 14, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }} aria-hidden="true">
              <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 0 0-1.01.24l-2.2 2.2a15.07 15.07 0 0 1-6.59-6.59l2.2-2.2a1 1 0 0 0 .25-1.01A11.36 11.36 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1c0 9.39 7.61 17 17 17a1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1Z" />
            </svg>
            Chiama
          </a>
          <a
            href="https://wa.me/393500334300"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, padding: '12px 14px', borderRadius: 10,
              background: '#25D366', color: '#fff',
              textAlign: 'center', textDecoration: 'none',
              fontSize: 14, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }} aria-hidden="true">
              <path d="M20.5 3.5A11.07 11.07 0 0 0 12 0C5.92 0 1 4.92 1 11c0 1.95.51 3.79 1.4 5.4L1 23l6.78-1.38A10.95 10.95 0 0 0 12 22c6.08 0 11-4.92 11-11 0-2.96-1.15-5.74-3.5-7.5Zm-3.94 13.31c-.32.88-1.6 1.65-2.34 1.74-.6.07-1.37.1-2.21-.14-.51-.16-1.16-.38-2-.74-3.52-1.52-5.82-5.08-6-5.31-.18-.23-1.44-1.92-1.44-3.66 0-1.74.92-2.6 1.25-2.95.32-.35.7-.44.94-.44h.67c.21 0 .5-.08.78.6.32.78 1.09 2.7 1.18 2.89.09.19.16.42.03.66-.13.23-.19.38-.39.59-.19.21-.41.46-.59.62-.19.16-.4.34-.17.66.23.32 1.03 1.7 2.21 2.75 1.52 1.35 2.8 1.77 3.13 1.97.32.19.51.16.7-.1.19-.26.81-.94 1.03-1.27.21-.32.42-.27.71-.16.29.1 1.85.87 2.17 1.03.32.16.53.24.61.37.07.13.07.75-.25 1.63Z" />
            </svg>
            WhatsApp
          </a>
        </div>
      </div>

      {/* Header (titolo del giorno) */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
          Rosticceria
        </h2>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          Menù di oggi —{' '}
          {new Date().toLocaleDateString('it-IT', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </p>
      </div>

      {/* Filtri categoria */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16, scrollbarWidth: 'none' }}>
          <CatPill label="Tutti" active={activeCat === 'tutti'} onClick={() => setActiveCat('tutti')} />
          {categories
            .filter((c) => grouped[c.id]?.length > 0)
            .map((c) => (
              <CatPill
                key={c.id}
                label={c.name}
                active={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
              />
            ))}
        </div>
      )}

      {/* Stato loading / errore */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 14 }}>
          Caricamento menù...
        </div>
      )}
      {error && (
        <div style={{ background: '#FCEBEB', borderRadius: 8, padding: 12, fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>
          Errore nel caricamento: {error}
        </div>
      )}
      {!loading && items.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 14 }}>
          Nessun piatto disponibile oggi.
        </div>
      )}

      {/* Lista prodotti */}
      {!loading && categories
        .filter((c) => grouped[c.id]?.length > 0)
        .filter((c) => activeCat === 'tutti' || activeCat === c.id)
        .map((cat) => (
          <div key={cat.id} style={{ marginBottom: 8 }}>
            {activeCat === 'tutti' && (
              <p style={{ fontSize: 11, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {cat.name}
              </p>
            )}
            {grouped[cat.id].map((item) => {
              const qty = cart[item.id]?.qty || 0
              const esaurito = item.portions !== null && item.portions <= 0
              return (
                <div
                  key={item.id}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: '0.5px solid #e8e8e4',
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 8,
                    opacity: esaurito ? 0.5 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
                      {item.products?.name}
                    </p>
                    {item.products?.description && (
                      <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.products.description}
                      </p>
                    )}
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', margin: '4px 0 0' }}>
                      {fmt(item.products?.price)}
                    </p>
                    {item.portions !== null && item.portions <= 3 && item.portions > 0 && (
                      <p style={{ fontSize: 11, color: '#BA7517', margin: '2px 0 0' }}>
                        Ultime {item.portions} porzioni
                      </p>
                    )}
                    {esaurito && (
                      <p style={{ fontSize: 11, color: '#A32D2D', margin: '2px 0 0' }}>Esaurito</p>
                    )}
                  </div>

                  {!esaurito && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {qty > 0 && (
                        <>
                          <QtyBtn onClick={() => changeQty(item, -1)}>−</QtyBtn>
                          <span style={{ fontSize: 14, fontWeight: 500, minWidth: 16, textAlign: 'center', color: '#1a1a1a' }}>
                            {qty}
                          </span>
                        </>
                      )}
                      <QtyBtn add onClick={() => changeQty(item, 1)}>+</QtyBtn>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

      {/* I miei ordini oggi */}
      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          I miei ordini oggi
        </p>
        {ordersLoading && (
          <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>Caricamento...</div>
        )}
        {!ordersLoading && myOrders.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e8e8e4', padding: 16, fontSize: 13, color: '#aaa', textAlign: 'center' }}>
            Nessun ordine effettuato oggi
          </div>
        )}
        {myOrders.map((order) => {
          const time = order.delivery_slots?.time?.slice(0, 5) || ''
          const mode = order.delivery_mode
          return (
            <div key={order.id} style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e8e8e4', marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '0.5px solid #f0f0ee' }}>
                <span style={{ fontSize: 12, color: '#bbb' }}>#{order.id.slice(-4).toUpperCase()}</span>
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 20, fontWeight: 500,
                  background: mode === 'reception' ? '#E6F1FB' : '#FAEEDA',
                  color: mode === 'reception' ? '#185FA5' : '#854F0B',
                }}>
                  {mode === 'camera' ? `Camera ${order.room_number}` : 'Reception'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
                  {mode === 'camera' ? 'Consegna' : 'Ritiro'} ore {time}
                </span>
              </div>
              <div style={{ padding: '10px 14px' }}>
                {order.order_items?.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', lineHeight: 1.9 }}>
                    <span>{item.product_name} ×{item.quantity}</span>
                    <span>{fmt(item.unit_price * item.quantity)}</span>
                  </div>
                ))}
                {order.notes && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#aaa', background: '#f5f5f3', borderRadius: 8, padding: '5px 8px' }}>
                    {order.notes}
                  </div>
                )}
              </div>
              <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid #f0f0ee', background: '#fafaf8' }}>
                <span style={{ fontSize: 12, color: '#888' }}>Totale</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>{fmt(order.total)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Barra carrello fissa */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: '0.5px solid #e8e8e4',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        zIndex: 50,
      }}>
        <span style={{
          background: cartCount > 0 ? '#D85A30' : '#e8e8e4',
          color: cartCount > 0 ? '#fff' : '#aaa',
          borderRadius: 20, padding: '4px 10px',
          fontSize: 12, fontWeight: 500, flexShrink: 0,
          transition: 'all .15s',
        }}>
          {cartCount}
        </span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: cartCount > 0 ? 500 : 400, color: cartCount > 0 ? '#1a1a1a' : '#aaa' }}>
          {cartCount > 0 ? fmt(cartTotal) : 'Nessun articolo'}
        </span>
        <button
          disabled={cartCount === 0}
          onClick={() => setShowCheckout(true)}
          style={{
            background: cartCount > 0 ? '#D85A30' : '#e8e8e4',
            color: cartCount > 0 ? '#fff' : '#aaa',
            border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 500,
            cursor: cartCount > 0 ? 'pointer' : 'default',
            flexShrink: 0, transition: 'background .15s',
          }}
        >
          Ordina
        </button>
      </div>
    </div>
  )
}

function CatPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '5px 14px',
        borderRadius: 20,
        border: active ? 'none' : '0.5px solid #ddd',
        background: active ? '#D85A30' : '#f5f5f3',
        color: active ? '#fff' : '#888',
        fontSize: 12, fontWeight: active ? 500 : 400,
        cursor: 'pointer', transition: 'all .15s',
      }}
    >
      {label}
    </button>
  )
}

function QtyBtn({ children, onClick, add }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: '50%',
        border: add ? 'none' : '0.5px solid #ddd',
        background: add ? '#D85A30' : '#f5f5f3',
        color: add ? '#fff' : '#1a1a1a',
        fontSize: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 400, lineHeight: 1, transition: 'all .1s',
      }}
    >
      {children}
    </button>
  )
}

function OrderConfirmation({ order, onBack }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: '#E1F5EE',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
          <path d="M1 7L8 13L21 1" stroke="#0F6E56" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 500, color: '#1a1a1a', margin: '0 0 8px' }}>
        Ordine inviato!
      </h3>
      <p style={{ fontSize: 14, color: '#888', lineHeight: 1.6, margin: '0 0 16px' }}>
        La rosticceria ha ricevuto il tuo ordine.
        {order.deliveryMode === 'camera'
          ? ` Consegna in camera ${order.roomNumber} alle ${order.slotTime}.`
          : ` Ritiro in reception alle ${order.slotTime}.`}
      </p>
      <div style={{
        display: 'inline-block',
        background: '#f5f5f3', borderRadius: 8,
        padding: '8px 16px', fontSize: 13, color: '#888',
        marginBottom: 32,
      }}>
        Ordine <strong style={{ color: '#1a1a1a' }}>#{order.orderId?.slice(-4).toUpperCase()}</strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <button
          onClick={onBack}
          style={{
            background: '#D85A30', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 24px',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Aggiungi altro ordine
        </button>
        <button
          onClick={() => window.location.replace('/guest')}
          style={{
            background: 'none', color: '#888', border: '0.5px solid #ddd',
            borderRadius: 8, padding: '10px 24px',
            fontSize: 14, cursor: 'pointer',
          }}
        >
          Torna alla home
        </button>
      </div>
    </div>
  )
}
