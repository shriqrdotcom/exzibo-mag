import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Phone, Star, Globe,
  ChevronLeft, ChevronRight, Home, UtensilsCrossed,
  ShoppingCart, ClipboardList, CalendarDays, ArrowUp,
  MapPin, ExternalLink, AtSign, Share2, MessageCircle
} from 'lucide-react'

const HERO_IMAGES = [
  '/menu/wagyu-ribeye.png',
  '/menu/lobster-thermidor.png',
  '/menu/truffle-beef-carpaccio.png',
  '/menu/mushroom-risotto.png',
  '/menu/atlantic-oysters.png',
]

const BESTSELLERS_FALLBACK = [
  { name: 'Truffle Beef Carpaccio', price: 2100, img: '/menu/truffle-beef-carpaccio.png', tag: 'Popular' },
  { name: 'A5 Wagyu Ribeye', price: 15500, img: '/menu/wagyu-ribeye.png', tag: 'Chef\'s Pick' },
  { name: 'Lobster Thermidor', price: 7950, img: '/menu/lobster-thermidor.png', tag: 'Seasonal' },
  { name: 'Heirloom Burrata', price: 1650, img: '/menu/heirloom-burrata.png', tag: 'Vegetarian' },
  { name: 'Noir Negroni', price: 1850, img: '/menu/noir-negroni.png', tag: 'Popular' },
  { name: 'Forest Mushroom Risotto', price: 3500, img: '/menu/mushroom-risotto.png', tag: 'Gluten Free' },
]

export default function RestaurantWebsite() {
  const { slug } = useParams()
  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [menuData, setMenuData] = useState({ starters: [], mains: [], drinks: [] })
  const [activeNav, setActiveNav] = useState('home')
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [showTop, setShowTop] = useState(false)
  const carouselRef = useRef(null)
  const menuRef = useRef(null)
  const aboutRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = restaurants.find(r => r.slug === slug || r.id === slug)
    if (found) {
      setRestaurant(found)
      const saved = localStorage.getItem(`exzibo_menu_${found.id}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        setMenuData({
          starters: parsed.starters || [],
          mains: parsed.mains || [],
          drinks: parsed.drinks || [],
        })
        setMenuItems([
          ...(parsed.starters || []),
          ...(parsed.mains || []),
          ...(parsed.drinks || []),
        ])
      }
    } else {
      setNotFound(true)
    }
  }, [slug])

  useEffect(() => {
    const interval = setInterval(() => {
      setCarouselIdx(i => (i + 1) % HERO_IMAGES.length)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (ref, nav) => {
    setActiveNav(nav)
    ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const taggedItems = menuItems.filter(m => m.tags?.includes('Popular') || m.tags?.includes('Seasonal'))
  const bestsellers = menuItems.length > 0
    ? (taggedItems.length > 0 ? taggedItems : menuItems).slice(0, 6)
    : BESTSELLERS_FALLBACK

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '48px', fontWeight: 900, color: 'rgba(255,255,255,0.07)' }}>404</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#555' }}>Restaurant not found</div>
        <a href="/" style={{ fontSize: '13px', color: '#E8321A', textDecoration: 'none', fontWeight: 600 }}>← Back to home</a>
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(232,50,26,0.3)', borderTopColor: '#E8321A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ color: '#444', fontSize: '13px' }}>Loading restaurant...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#080808', color: '#fff', minHeight: '100vh', fontFamily: "'Inter', -apple-system, sans-serif", paddingBottom: '80px' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(232,50,26,0.4); border-radius: 4px; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .food-card:hover .food-card-img { transform: scale(1.07); }
        .food-card:hover { transform: translateY(-4px); box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .nav-icon-btn:hover { color: #E8321A !important; }
        .action-btn-primary:hover { background: #ff4d35 !important; box-shadow: 0 0 30px rgba(232,50,26,0.5) !important; transform: translateY(-2px); }
        .action-btn-secondary:hover { background: rgba(255,255,255,0.1) !important; transform: translateY(-2px); }
        .social-icon:hover { color: #E8321A !important; transform: scale(1.2); }
      `}</style>

      {/* ─── HEADER ─── */}
      <header ref={carouselRef} style={{ position: 'relative', height: '100svh', minHeight: '580px', maxHeight: '820px', overflow: 'hidden' }}>
        {HERO_IMAGES.map((src, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${src})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: i === carouselIdx ? 1 : 0,
            transition: 'opacity 1.2s ease',
            zIndex: i === carouselIdx ? 1 : 0,
          }} />
        ))}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'linear-gradient(to bottom, rgba(8,8,8,0.55) 0%, rgba(8,8,8,0.2) 40%, rgba(8,8,8,0.85) 85%, #080808 100%)',
        }} />

        {/* Carousel dots */}
        <div style={{ position: 'absolute', bottom: '120px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', zIndex: 5 }}>
          {HERO_IMAGES.map((_, i) => (
            <button key={i} onClick={() => setCarouselIdx(i)} style={{
              width: i === carouselIdx ? '24px' : '6px', height: '6px',
              borderRadius: '3px', background: i === carouselIdx ? '#E8321A' : 'rgba(255,255,255,0.3)',
              border: 'none', cursor: 'pointer', transition: 'all 0.35s ease', padding: 0,
            }} />
          ))}
        </div>

        {/* Carousel arrows */}
        <button onClick={() => setCarouselIdx(i => (i - 1 + HERO_IMAGES.length) % HERO_IMAGES.length)} style={{
          position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', cursor: 'pointer', zIndex: 5, transition: 'all 0.2s',
        }}>
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => setCarouselIdx(i => (i + 1) % HERO_IMAGES.length)} style={{
          position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#fff', cursor: 'pointer', zIndex: 5, transition: 'all 0.2s',
        }}>
          <ChevronRight size={18} />
        </button>

        {/* Header content */}
        <div style={{
          position: 'absolute', bottom: '60px', left: 0, right: 0, zIndex: 4,
          padding: '0 24px', textAlign: 'center',
          animation: 'slideIn 0.8s ease both',
        }}>
          {restaurant.rating && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: '20px', padding: '4px 12px', marginBottom: '14px' }}>
              <Star size={12} fill="#FFB800" color="#FFB800" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFB800' }}>{restaurant.rating}</span>
            </div>
          )}
          <h1 style={{ fontSize: 'clamp(38px, 8vw, 80px)', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', textShadow: '0 4px 30px rgba(0,0,0,0.7)', marginBottom: '10px' }}>
            {restaurant.name}
          </h1>
          {restaurant.description && (
            <p style={{ fontSize: 'clamp(13px, 2vw, 15px)', color: 'rgba(255,255,255,0.65)', maxWidth: '480px', margin: '0 auto 16px', lineHeight: 1.6 }}>
              {restaurant.description.slice(0, 100)}{restaurant.description.length > 100 ? '…' : ''}
            </p>
          )}
          {restaurant.location && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'rgba(255,255,255,0.45)', fontSize: '12px' }}>
              <MapPin size={12} /> {restaurant.location}
            </div>
          )}
        </div>

        {/* Sticky top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
          padding: '18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.1em' }}>
            EXZI<span style={{ color: '#E8321A' }}>BO</span>
          </div>
          {restaurant.phone && (
            <a href={`tel:${restaurant.phone}`} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '50px', padding: '9px 18px',
              color: '#fff', fontSize: '12px', fontWeight: 700, textDecoration: 'none',
              transition: 'all 0.25s',
            }}>
              <Phone size={13} />
              {restaurant.phone}
            </a>
          )}
        </div>
      </header>

      {/* ─── ACTION BUTTONS ─── */}
      <section style={{ padding: '28px 20px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', animation: 'scaleIn 0.5s ease 0.2s both' }}>
        <button
          className="action-btn-primary"
          onClick={() => scrollTo(menuRef, 'menu')}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: '#E8321A', border: 'none', borderRadius: '50px',
            padding: '15px 32px', color: '#fff', fontSize: '14px', fontWeight: 800,
            cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.25s ease',
            boxShadow: '0 8px 25px rgba(232,50,26,0.35)',
          }}
        >
          <UtensilsCrossed size={16} />
          VIEW MENU
        </button>
        {restaurant.phone && (
          <a
            href={`tel:${restaurant.phone}`}
            className="action-btn-secondary"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '50px', padding: '15px 32px', color: '#fff', fontSize: '14px',
              fontWeight: 800, cursor: 'pointer', letterSpacing: '0.05em', textDecoration: 'none',
              transition: 'all 0.25s ease', backdropFilter: 'blur(8px)',
            }}
          >
            <Phone size={16} />
            CALL STAFF
          </a>
        )}
        {restaurant.digitalMenuLink && (
          <a
            href={restaurant.digitalMenuLink}
            target="_blank"
            rel="noopener noreferrer"
            className="action-btn-secondary"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '50px', padding: '15px 32px', color: '#fff', fontSize: '14px',
              fontWeight: 800, cursor: 'pointer', letterSpacing: '0.05em', textDecoration: 'none',
              transition: 'all 0.25s ease', backdropFilter: 'blur(8px)',
            }}
          >
            <ExternalLink size={16} />
            ORDER ONLINE
          </a>
        )}
      </section>

      {/* ─── BEST SELLERS ─── */}
      <section style={{ padding: '10px 0 40px', animation: 'slideIn 0.6s ease 0.3s both' }}>
        <SectionTitle label="Best Sellers" sub="Crowd favourites, every single time" />
        <div ref={scrollRef} style={{
          display: 'flex', gap: '16px', overflowX: 'auto', padding: '8px 24px 16px',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
        }}>
          {bestsellers.map((item, i) => (
            <FoodCard key={i} item={item} />
          ))}
        </div>
      </section>

      {/* ─── FULL MENU ─── */}
      <section ref={menuRef} style={{ padding: '10px 20px 40px', maxWidth: '960px', margin: '0 auto', animation: 'slideIn 0.6s ease 0.4s both' }}>
        <SectionTitle label="Our Menu" sub="Crafted with precision and passion" />
        <MenuSection title="Starters" items={menuData.starters.length ? menuData.starters : BESTSELLERS_FALLBACK.slice(0, 3)} />
        <MenuSection title="Mains" items={menuData.mains.length ? menuData.mains : BESTSELLERS_FALLBACK.slice(1, 4)} />
        <MenuSection title="Drinks" items={menuData.drinks.length ? menuData.drinks : BESTSELLERS_FALLBACK.slice(3, 6)} />
      </section>

      {/* ─── ABOUT ─── */}
      <section ref={aboutRef} style={{ padding: '10px 20px 50px', maxWidth: '960px', margin: '0 auto' }}>
        <SectionTitle label="Our Story" sub="Where every plate tells a story" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(232,50,26,0.08) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(232,50,26,0.15)',
            borderRadius: '24px', padding: '32px', animation: 'slideIn 0.6s ease both',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: '#E8321A', textTransform: 'uppercase', marginBottom: '14px' }}>
              The Philosophy
            </div>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#aaa' }}>
              {restaurant.description || 'An uncompromising culinary experience rooted in craft, quality, and atmosphere. Every dish is a conversation between heritage and innovation.'}
            </p>
            {restaurant.additionalInfo && (
              <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#666', marginTop: '14px' }}>
                {restaurant.additionalInfo}
              </p>
            )}
          </div>

          {restaurant.chefInfo && (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '24px', padding: '32px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase', marginBottom: '14px' }}>
                Executive Chef
              </div>
              <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#aaa' }}>
                {restaurant.chefInfo}
              </p>
            </div>
          )}

          {restaurant.servantInfo && (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '24px', padding: '32px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase', marginBottom: '14px' }}>
                Hospitality
              </div>
              <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#aaa' }}>
                {restaurant.servantInfo}
              </p>
            </div>
          )}

          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '24px', padding: '32px',
            display: 'flex', flexDirection: 'column', gap: '18px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
              Quick Info
            </div>
            {restaurant.location && (
              <InfoRow icon={<MapPin size={15} />} label="Location" value={restaurant.location} />
            )}
            {restaurant.tables && (
              <InfoRow icon={<UtensilsCrossed size={15} />} label="Capacity" value={`${restaurant.tables} Tables`} />
            )}
            {restaurant.phone && (
              <InfoRow icon={<Phone size={15} />} label="Reservations" value={restaurant.phone} />
            )}
            {restaurant.rating && (
              <InfoRow icon={<Star size={15} />} label="Rating" value={restaurant.rating} />
            )}
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '50px 24px 30px',
        textAlign: 'center',
        background: 'linear-gradient(to bottom, transparent, rgba(232,50,26,0.04))',
      }}>
        <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '0.05em', marginBottom: '6px' }}>
          {restaurant.name}
        </div>
        {restaurant.location && (
          <div style={{ fontSize: '12px', color: '#444', marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <MapPin size={11} /> {restaurant.location}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '32px', flexWrap: 'wrap' }}>
          {restaurant.socialLinks?.instagram && (
            <a href={restaurant.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="social-icon" style={{ color: '#555', transition: 'all 0.2s', display: 'flex' }}>
              <AtSign size={22} />
            </a>
          )}
          {restaurant.socialLinks?.facebook && (
            <a href={restaurant.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="social-icon" style={{ color: '#555', transition: 'all 0.2s', display: 'flex' }}>
              <Share2 size={22} />
            </a>
          )}
          {restaurant.socialLinks?.twitter && (
            <a href={restaurant.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="social-icon" style={{ color: '#555', transition: 'all 0.2s', display: 'flex' }}>
              <MessageCircle size={22} />
            </a>
          )}
          {restaurant.socialLinks?.website && (
            <a href={restaurant.socialLinks.website} target="_blank" rel="noopener noreferrer" className="social-icon" style={{ color: '#555', transition: 'all 0.2s', display: 'flex' }}>
              <Globe size={22} />
            </a>
          )}
        </div>

        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.25)',
            borderRadius: '50px', padding: '11px 24px', color: '#FFB800', fontSize: '13px', fontWeight: 700,
            textDecoration: 'none', letterSpacing: '0.05em', transition: 'all 0.25s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,184,0,0.18)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,184,0,0.1)'; e.currentTarget.style.transform = 'none' }}
        >
          <Star size={14} fill="#FFB800" /> RATE US ON GOOGLE
        </a>

        <div style={{ marginTop: '40px', fontSize: '11px', color: '#2a2a2a', letterSpacing: '0.08em' }}>
          POWERED BY EXZIBO · PREMIUM DINING PLATFORM
        </div>
      </footer>

      {/* ─── BOTTOM NAV ─── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '20px 20px 0 0',
        padding: '10px 8px 14px',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
      }}>
        {[
          { id: 'home', icon: <Home size={20} />, label: 'Home', action: () => { scrollTo(carouselRef, 'home'); window.scrollTo({ top: 0, behavior: 'smooth' }) } },
          { id: 'menu', icon: <UtensilsCrossed size={20} />, label: 'Menu', action: () => scrollTo(menuRef, 'menu') },
          { id: 'cart', icon: <ShoppingCart size={20} />, label: 'Cart', action: () => {} },
          { id: 'orders', icon: <ClipboardList size={20} />, label: 'Orders', action: () => {} },
          { id: 'booking', icon: <CalendarDays size={20} />, label: 'Book', action: () => {} },
        ].map(({ id, icon, label, action }) => (
          <button
            key={id}
            className="nav-icon-btn"
            onClick={() => { setActiveNav(id); action() }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeNav === id ? '#E8321A' : '#444',
              transition: 'color 0.2s', padding: '4px 12px',
              position: 'relative',
            }}
          >
            {activeNav === id && (
              <div style={{
                position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                width: '28px', height: '3px', background: '#E8321A', borderRadius: '0 0 3px 3px',
              }} />
            )}
            {icon}
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
          </button>
        ))}
      </nav>

      {/* ─── SCROLL TO TOP ─── */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: 'fixed', bottom: '90px', right: '20px', zIndex: 90,
            width: '42px', height: '42px', borderRadius: '50%',
            background: '#E8321A', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer', boxShadow: '0 4px 20px rgba(232,50,26,0.4)',
            animation: 'scaleIn 0.2s ease',
          }}
        >
          <ArrowUp size={18} />
        </button>
      )}
    </div>
  )
}

function SectionTitle({ label, sub }) {
  return (
    <div style={{ padding: '0 0 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.25em', color: '#E8321A', textTransform: 'uppercase', marginBottom: '8px' }}>
        {sub}
      </div>
      <h2 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
        {label}
      </h2>
    </div>
  )
}

function FoodCard({ item }) {
  return (
    <div className="food-card" style={{
      flexShrink: 0, width: '200px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '20px', overflow: 'hidden',
      cursor: 'pointer', transition: 'all 0.3s ease',
    }}>
      <div style={{ height: '150px', overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
        <img
          className="food-card-img"
          src={item.img || '/menu/wagyu-ribeye.png'}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease', display: 'block' }}
          onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
        />
      </div>
      <div style={{ padding: '14px' }}>
        {item.tag && (
          <div style={{
            display: 'inline-block', marginBottom: '7px',
            background: 'rgba(232,50,26,0.15)', border: '1px solid rgba(232,50,26,0.25)',
            borderRadius: '6px', padding: '2px 8px',
            fontSize: '9px', fontWeight: 700, color: '#E8321A', letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {item.tag || (item.tags?.[0])}
          </div>
        )}
        <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.3, marginBottom: '6px' }}>{item.name}</div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#E8321A' }}>
          ₹{(item.price || 0).toLocaleString('en-IN')}
        </div>
      </div>
    </div>
  )
}

function MenuSection({ title, items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: '36px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: '#555',
        textTransform: 'uppercase', marginBottom: '16px', paddingLeft: '4px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
        {title}
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map((item, i) => <MenuRow key={i} item={item} />)}
      </div>
    </div>
  )
}

function MenuRow({ item }) {
  const [hovered, setHovered] = useState(false)
  const tagColorMap = {
    Popular: '#E8321A',
    Seasonal: '#fbbf24',
    Vegetarian: '#4ade80',
    'Gluten Free': '#60a5fa',
  }
  const firstTag = item.tags?.[0]
  const tagColor = tagColorMap[firstTag] || '#888'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${hovered ? 'rgba(232,50,26,0.2)' : 'rgba(255,255,255,0.04)'}`,
        borderRadius: '14px', padding: '12px 16px',
        transition: 'all 0.2s ease', cursor: 'default',
      }}
    >
      <div style={{ width: '56px', height: '56px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)' }}>
        <img
          src={item.img || '/menu/wagyu-ribeye.png'}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.src = '/menu/wagyu-ribeye.png' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{item.name}</span>
          {firstTag && (
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: tagColor, textTransform: 'uppercase', background: `${tagColor}18`, border: `1px solid ${tagColor}30`, borderRadius: '4px', padding: '2px 6px' }}>
              {firstTag}
            </span>
          )}
        </div>
        {item.desc && (
          <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.desc}
          </div>
        )}
      </div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
        ₹{(item.price || 0).toLocaleString('en-IN')}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
      <div style={{ color: '#E8321A', marginTop: '1px', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#444', textTransform: 'uppercase', marginBottom: '3px' }}>{label}</div>
        <div style={{ fontSize: '14px', color: '#bbb', fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  )
}
