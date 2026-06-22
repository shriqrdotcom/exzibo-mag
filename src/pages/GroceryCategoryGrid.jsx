import React from 'react'

const CATEGORIES = {
  row1: [
    {
      id: 'more1',
      label: '& More',
      wide: true,
      products: ['🫖', '☕', '🍵', '🥛'],
    },
    {
      id: 'more2',
      label: '& More',
      wide: false,
      products: ['🍦', '🍨'],
    },
    {
      id: 'food',
      label: 'Food',
      wide: false,
      products: ['🍟', '🍗'],
    },
  ],
  row2: [
    { id: 'sweet',    label: 'Sweet',       products: ['🍮', '🍫'] },
    { id: 'drinks',   label: 'Cold Drinks', products: ['🧃', '🥤'] },
    { id: 'munchies', label: 'Munchies',    products: ['🫘', '🍿', '🥔'] },
    { id: 'biscuits', label: 'Biscuits',    products: ['🍪', '🟤'] },
  ],
}

function CategoryCard({ cat, cardH = 120 }) {
  const [hov, setHov] = React.useState(false)
  const wide = cat.wide
  const count = cat.products.length

  const emojiSize = wide ? 46 : count >= 3 ? 36 : 42

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          width: '100%',
          height: cardH,
          borderRadius: '20px',
          background: 'rgba(255,255,255,0.18)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.35)',
          boxShadow: hov
            ? '0 12px 40px rgba(31,38,135,0.30)'
            : '0 6px 24px rgba(31,38,135,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          transform: hov ? 'translateY(-3px)' : 'none',
          overflow: 'hidden',
          padding: '12px 8px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: wide ? '8px' : '6px',
          width: '100%',
        }}>
          {cat.products.map((emoji, i) => {
            const scale = i === 0 ? 1 : i % 2 === 0 ? 0.92 : 0.88
            return (
              <span
                key={i}
                style={{
                  fontSize: emojiSize * scale,
                  lineHeight: 1,
                  filter: 'drop-shadow(0 3px 8px rgba(0,0,40,0.25))',
                  display: 'block',
                  flexShrink: 0,
                }}
              >
                {emoji}
              </span>
            )
          })}
        </div>
      </div>
      <span style={{
        fontSize: '13px',
        fontWeight: 700,
        color: '#0f1f4d',
        letterSpacing: '0.01em',
        textAlign: 'center',
        lineHeight: 1.2,
      }}>
        {cat.label}
      </span>
    </div>
  )
}

export default function GroceryCategoryGrid() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #1a3a8f 0%, #2a68c0 50%, #4a90d9 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Row 1 — wide + 2 equal */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: '16px',
          alignItems: 'end',
        }}>
          {CATEGORIES.row1.map(cat => (
            <CategoryCard key={cat.id} cat={cat} cardH={130} />
          ))}
        </div>

        {/* Row 2 — 4 equal */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          alignItems: 'end',
        }}>
          {CATEGORIES.row2.map(cat => (
            <CategoryCard key={cat.id} cat={cat} cardH={118} />
          ))}
        </div>

      </div>
    </div>
  )
}
