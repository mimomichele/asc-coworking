import { useState } from 'react'
import { useInviaOrdine } from './useRosticceria'

const fmt = (n) => '€\u00a0' + Number(n).toFixed(2).replace('.', ',')

export default function Checkout({ session, cartItems, cartTotal, slots, onBack, onSuccess }) {
  const [mode, setMode] = useState('reception')
  const [roomNumber, setRoomNumber] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(slots[0]?.id || null)
  const [notes, setNotes] = useState('')
  const { inviaOrdine, loading, error } = useInviaOrdine()

  const selectedSlotData = slots.find((s) => s.id === selectedSlot)
  const canSubmit =
    selectedSlot &&
    (mode === 'reception' || roomNumber.trim().length > 0) &&
    !loading

  async function handleConfirm() {
    const result = await inviaOrdine({
      session,
      slotId: selectedSlot,
      deliveryMode: mode,
      roomNumber,
      notes,
      cartItems,
    })
    if (result.success) {
      onSuccess({
        orderId: result.orderId,
        deliveryMode: mode,
        roomNumber,
        slotTime: selectedSlotData?.time?.slice(0, 5),
      })
    }
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '0.5px solid #ddd', background: '#f5f5f3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M7 1L3 5L7 9" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
          Riepilogo ordine
        </h2>
      </div>

      {/* Articoli */}
      <Section title="Articoli">
        {cartItems.map((item) => (
          <div key={item.productId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '0.5px solid #f0f0ee' }}>
            <span style={{ flex: 1, fontSize: 14, color: '#1a1a1a' }}>{item.name}</span>
            <span style={{ fontSize: 13, color: '#888', flexShrink: 0 }}>×{item.qty}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', minWidth: 56, textAlign: 'right' }}>
              {fmt(item.price * item.qty)}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTop: '0.5px solid #e8e8e4' }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>Totale</span>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>{fmt(cartTotal)}</span>
        </div>
      </Section>

      {/* Modalità */}
      <Section title="Modalità">
        <ModeOption
          selected={mode === 'reception'}
          onClick={() => setMode('reception')}
          label="Ritiro in reception"
          sub="Vieni a ritirare all'orario scelto"
        />
        <div style={{ marginTop: 8 }}>
          <ModeOption
            selected={mode === 'camera'}
            onClick={() => setMode('camera')}
            label="Consegna in camera"
            sub="Portiamo noi da te"
          />
          {mode === 'camera' && (
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="Numero camera (es. 204)"
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 14,
                  borderRadius: 8, border: '0.5px solid #ddd',
                  background: '#fff', color: '#1a1a1a',
                  outline: 'none',
                }}
              />
            </div>
          )}
        </div>
      </Section>

      {/* Orario */}
      <Section title="Orario di ritiro">
        {slots.length === 0 ? (
          <p style={{ fontSize: 13, color: '#aaa' }}>Nessun orario disponibile per oggi.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {slots.map((slot) => {
              const time = slot.time?.slice(0, 5)
              const active = slot.id === selectedSlot
              return (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlot(slot.id)}
                  style={{
                    padding: '7px 0', textAlign: 'center',
                    borderRadius: 8,
                    border: active ? 'none' : '0.5px solid #ddd',
                    background: active ? '#D85A30' : '#f5f5f3',
                    color: active ? '#fff' : '#888',
                    fontSize: 13, fontWeight: active ? 500 : 400,
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {time}
                </button>
              )
            })}
          </div>
        )}
      </Section>

      {/* Note */}
      <Section title="Note (opzionale)">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Es. senza cipolla, allergie..."
          style={{
            width: '100%', padding: '9px 12px', fontSize: 13,
            borderRadius: 8, border: '0.5px solid #ddd',
            background: '#fff', color: '#1a1a1a', outline: 'none',
          }}
        />
      </Section>

      {/* Errore */}
      {error && (
        <div style={{ background: '#FCEBEB', borderRadius: 8, padding: 10, fontSize: 13, color: '#A32D2D', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* CTA fissa */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: '0.5px solid #e8e8e4',
        padding: '12px 16px', zIndex: 50,
      }}>
        <button
          disabled={!canSubmit}
          onClick={handleConfirm}
          style={{
            width: '100%',
            background: canSubmit ? '#D85A30' : '#e8e8e4',
            color: canSubmit ? '#fff' : '#aaa',
            border: 'none', borderRadius: 8,
            padding: 13, fontSize: 15, fontWeight: 500,
            cursor: canSubmit ? 'pointer' : 'default',
            transition: 'background .15s',
          }}
        >
          {loading ? 'Invio in corso...' : 'Conferma ordine'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12,
      border: '0.5px solid #e8e8e4',
      padding: '14px 16px', marginBottom: 8,
    }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function ModeOption({ selected, onClick, label, sub }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '11px 12px', borderRadius: 8,
        border: selected ? '0.5px solid #D85A30' : '0.5px solid #ddd',
        background: selected ? '#FFF5F1' : '#fff',
        cursor: 'pointer', transition: 'all .15s',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        border: selected ? '5px solid #D85A30' : '1.5px solid #ccc',
        transition: 'all .15s',
      }} />
      <div>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{sub}</p>
      </div>
    </div>
  )
}
