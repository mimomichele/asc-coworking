import { useState, useMemo } from 'react'
import { useMenuDelGiorno, useSlotOrari } from './useRosticceria'
import Checkout from './Checkout'

const TODAY = new Date().toISOString().split('T')[0]

const fmt = (n) =>
  '€\u00a0' + Number(n).toFixed(2).replace('.', ',')

export default function RosticceriaMenu({ session }) {
  const [cart, setCart] = useState({})       // { [dailyMenuId]: { productId, name, price, qty } }
  const [activeCat, setActiveCat] = useState('tutti')
  const [showCheckout, setShowCheckout] = useState(false)
  const [orderDone, setOrderDone] = useState(null)

  const { categories, items, loading, error } = useMenuDelGiorno(TODAY)
  const { slots } = useSlotOrari(TODAY)

  // Raggruppamento per categoria
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
    // Rispetta il limite porzioni
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
      {/* Header */}
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
      <div>
        <button
          onClick={onBack}
          style={{
            background: '#D85A30', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 24px',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Torna al menù
        </button>
      </div>
    </div>
  )
}
