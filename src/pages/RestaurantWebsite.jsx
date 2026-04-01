import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Phone, Star, Globe, ChevronLeft, ChevronRight,
  Home, UtensilsCrossed, ShoppingCart, ClipboardList,
  CalendarDays, MapPin, AtSign, Share2, MessageCircle,
  Search, Bell, ChevronRight as ArrowRight, Heart,
  Flame, Award, Leaf, Clock, Users, ExternalLink, ArrowUp
} from 'lucide-react'

const FALLBACK_IMAGES = [
  '/menu/wagyu-ribeye.png',
  '/menu/lobster-thermidor.png',
  '/menu/truffle-beef-carpaccio.png',
  '/menu/mushroom-risotto.png',
  '/menu/atlantic-oysters.png',
]

const BESTSELLERS_FALLBACK = [
  { name: 'Truffle Beef Carpaccio', price: 2100, img: '/menu/truffle-beef-carpaccio.png', rating: 4.9, tag: 'Popular', tags: ['Popular'] },
  { name: 'A5 Wagyu Ribeye', price: 15500, img: '/menu/wagyu-ribeye.png', rating: 4.8, tag: "Chef's Pick", tags: ['Popular'] },
  { name: 'Lobster Thermidor', price: 7950, img: '/menu/lobster-thermidor.png', rating: 4.7, tag: 'Seasonal', tags: ['Seasonal'] },
  { name: 'Heirloom Burrata', price: 1650, img: '/menu/heirloom-burrata.png', rating: 4.6, tag: 'Vegetarian', tags: ['Vegetarian'] },
  { name: 'Noir Negroni', price: 1850, img: '/menu/noir-negroni.png', rating: 4.8, tag: 'Popular', tags: ['Popular'] },
  { name: 'Forest Mushroom Risotto', price: 3500, img: '/menu/mushroom-risotto.png', rating: 4.5, tag: 'Gluten Free', tags: ['Gluten Free'] },
]

const MENU_FALLBACK = {
  starters: [
    { name: 'Truffle Beef Carpaccio', price: 2100, img: '/menu/truffle-beef-carpaccio.png', description: 'Thin-sliced wagyu with black truffle and aged parmesan', tags: ['Popular'] },
    { name: 'Atlantic Oysters', price: 2800, img: '/menu/atlantic-oysters.png', description: 'Half dozen with mignonette and lemon', tags: ['Seasonal'] },
    { name: 'Heirloom Burrata', price: 1650, img: '/menu/heirloom-burrata.png', description: 'Fresh burrata with heirloom tomatoes and basil oil', tags: ['Vegetarian'] },
  ],
  mains: [
    { name: 'A5 Wagyu Ribeye', price: 15500, img: '/menu/wagyu-ribeye.png', description: 'Japanese A5 Wagyu with bone marrow butter', tags: ['Popular'] },
    { name: 'Lobster Thermidor', price: 7950, img: '/menu/lobster-thermidor.png', description: 'Whole Maine lobster in cognac cream sauce', tags: ['Seasonal'] },
    { name: 'Forest Mushroom Risotto', price: 3500, img: '/menu/mushroom-risotto.png', description: 'Arborio rice with wild porcini and truffle oil', tags: ['Vegetarian', 'Gluten Free'] },
  ],
  drinks: [
    { name: 'Noir Negroni', price: 1850, img: '/menu/noir-negroni.png', description: 'Gin, Campari, vermouth with activated charcoal', tags: ['Popular'] },
    { name: 'Smoke & Mirrors', price: 1600, img: '/menu/noir-negroni.png', description: 'Mezcal, jalapeño, lime, smoked salt rim', tags: [] },
  ],
}

export default function RestaurantWebsite() {
  const { slug } = useParams()
  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [menuData, setMenuData] = useState({ starters: [], mains: [], drinks: [] })
  const [activeNav, setActiveNav] = useState('home')
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [showTop, setShowTop] = useState(false)
  const [activeTab, setActiveTab] = useState('starters')
  const [liked, setLiked] = useState({})

  const heroRef = useRef(null)
  const menuRef = useRef(null)
  const aboutRef = useRef(null)

  useEffect(() => {
    if (slug === 'demo') {
      setRestaurant({
        id: 'demo',
        slug: 'demo',
        name: 'La Maison Noire',
        location: 'Cyber City, Gurugram',
        description: 'An uncompromising culinary experience rooted in craft, quality, and atmosphere. Every dish is a conversation between heritage and innovation.',
        chefInfo: 'Chef Marcus Aurélius, trained in Paris and Tokyo, brings 20 years of Michelin-star experience to every plate.',
        rating: '4.9',
        phone: '+91 98765 43210',
        tables: '24',
        images: FALLBACK_IMAGES,
        socialLinks: { instagram: '#', facebook: '#', twitter: '#', website: '#' },
      })
      setMenuData(MENU_FALLBACK)
      return
    }
    const restaurants = JSON.parse(localStorage.getItem('exzibo_restaurants') || '[]')
    const found = restaurants.find(r => r.slug === slug || r.id === slug)
    if (found) {
      setRestaurant(found)
      const saved = localStorage.getItem(`exzibo_menu_${found.id}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        setMenuData({
          starters: parsed.starters?.length ? parsed.starters : MENU_FALLBACK.starters,
          mains: parsed.mains?.length ? parsed.mains : MENU_FALLBACK.mains,
          drinks: parsed.drinks?.length ? parsed.drinks : MENU_FALLBACK.drinks,
        })
      } else {
        setMenuData(MENU_FALLBACK)
      }
    } else {
      setNotFound(true)
    }
  }, [slug])

  useEffect(() => {
    if (!restaurant) return
    const images = getCarouselImages(restaurant)
    if (images.length <= 1) return
    const interval = setInterval(() => {
      setCarouselIdx(i => (i + 1) % images.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [restaurant])

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const getCarouselImages = (r) => {
    if (r?.images?.length) return r.images
    return FALLBACK_IMAGES
  }

  const scrollTo = (ref, nav) => {
    setActiveNav(nav)
    ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const allMenuItems = [...menuData.starters, ...menuData.mains, ...menuData.drinks]
  const tagged = allMenuItems.filter(m => m.tags?.some(t => ['Popular', 'Seasonal', "Chef's Pick"].includes(t)))
  const bestsellers = (tagged.length > 0 ? tagged : allMenuItems).slice(0, 6)
  const activeMenuItems = menuData[activeTab] || []

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ fontSize: '64px', fontWeight: 900, color: 'rgba(255,255,255,0.05)' }}>404</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#444' }}>Restaurant not found</div>
        <a href="/" style={{ fontSize: '13px', color: '#E8321A', textDecoration: 'none', fontWeight: 600, letterSpacing: '0.05em' }}>← Back to Home</a>
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '44px', height: '44px', border: '3px solid rgba(232,50,26,0.2)', borderTopColor: '#E8321A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ color: '#555', fontSize: '13px', letterSpacing: '0.05em' }}>Loading...</div>
        </div>
      </div>
    )
  }

  const carouselImages = getCarouselImages(restaurant)

  return (
    <div style={{
      background: '#0A0A0A',
      color: '#fff',
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      paddingBottom: '80px',
      maxWidth: '480px',
      margin: '0 auto',
      position: 'relative',
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        html { scroll-behavior: smooth; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        .food-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .food-card:active { transform: scale(0.97); }
        .menu-item-row { transition: background 0.2s ease; }
        .menu-item-row:active { background: rgba(232,50,26,0.06) !important; }
        .nav-btn { transition: color 0.2s ease; }
        .section-fade { animation: fadeUp 0.5s ease both; }
        .tab-btn { transition: all 0.25s ease; }
      `}</style>

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={10} color="#E8321A" />
              {restaurant.location || 'Fine Dining'}
            </div>
            <div style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {restaurant.name}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {restaurant.rating && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.2)',
                borderRadius: '20px', padding: '4px 10px',
              }}>
                <Star size={11} fill="#FFB800" color="#FFB800" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFB800' }}>{restaurant.rating}</span>
              </div>
            )}
            <div style={{
              width: '36px', height: '36px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}>
              <Bell size={16} color="#888" />
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '14px', padding: '10px 14px',
        }}>
          <Search size={15} color="#555" />
          <span style={{ fontSize: '13px', color: '#444', fontWeight: 500 }}>Search menu items...</span>
        </div>
      </header>

      {/* ── HERO CAROUSEL ── */}
      <section ref={heroRef} style={{ position: 'relative', height: '260px', overflow: 'hidden', margin: '16px' }}>
        <div style={{ position: 'relative', height: '100%', borderRadius: '20px', overflow: 'hidden' }}>
          {carouselImages.map((src, i) => (
            <div key={i} style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: i === carouselIdx ? 1 : 0,
              transition: 'opacity 1s ease',
            }} />
          ))}

          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.6) 100%)',
            borderRadius: '20px',
          }} />

          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '20px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: 'rgba(232,50,26,0.9)',
              borderRadius: '8px', padding: '4px 10px', marginBottom: '8px',
              width: 'fit-content',
            }}>
              <Flame size={11} color="#fff" />
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Premium Dining
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, lineHeight: 1.15, textShadow: '0 2px 12px rgba(0,0,0,0.8)', marginBottom: '6px' }}>
              An Unforgettable<br />Culinary Experience
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
              {restaurant.description?.slice(0, 60) || 'Crafted with passion, served with precision'}
              {(restaurant.description?.length || 0) > 60 ? '…' : ''}
            </div>
          </div>

          {/* Carousel nav arrows */}
          {carouselImages.length > 1 && (
            <>
              <button
                onClick={() => setCarouselIdx(i => (i - 1 + carouselImages.length) % carouselImages.length)}
                style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%',
                  width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', cursor: 'pointer',
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCarouselIdx(i => (i + 1) % carouselImages.length)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%',
                  width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', cursor: 'pointer',
                }}
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Dots */}
          {carouselImages.length > 1 && (
            <div style={{ position: 'absolute', bottom: '12px', right: '16px', display: 'flex', gap: '5px' }}>
              {carouselImages.map((_, i) => (
                <button key={i} onClick={() => setCarouselIdx(i)} style={{
                  width: i === carouselIdx ? '18px' : '5px', height: '5px',
                  borderRadius: '3px', background: i === carouselIdx ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.3s ease', padding: 0,
                }} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── ACTION BUTTONS ── */}
      <section style={{ padding: '4px 16px 20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => scrollTo(menuRef, 'menu')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            background: '#E8321A', border: 'none', borderRadius: '14px',
            padding: '14px', color: '#fff', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.03em',
            boxShadow: '0 6px 20px rgba(232,50,26,0.4)',
          }}
        >
          <UtensilsCrossed size={16} />
          View Menu
        </button>
        {restaurant.phone ? (
          <a
            href={`tel:${restaurant.phone}`}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', padding: '14px', color: '#fff', fontSize: '13px',
              fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', textDecoration: 'none',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Phone size={16} />
            Call Staff
          </a>
        ) : (
          <button
            onClick={() => scrollTo(aboutRef, 'about')}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', padding: '14px', color: '#fff', fontSize: '13px',
              fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em',
            }}
          >
            <Users size={16} />
            About Us
          </button>
        )}
        {restaurant.digitalMenuLink && (
          <a
            href={restaurant.digitalMenuLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', padding: '14px 16px', color: '#fff',
              cursor: 'pointer', textDecoration: 'none',
            }}
          >
            <ExternalLink size={16} />
          </a>
        )}
      </section>

      {/* ── QUICK STATS ── */}
      <section style={{ padding: '0 16px 24px' }}>
        <div style={{
          display: 'flex', gap: '10px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '16px', padding: '14px 16px',
        }}>
          {[
            { icon: <Award size={16} color="#FFB800" />, label: restaurant.rating ? `${restaurant.rating} Rating` : 'Top Rated', sub: 'Google Reviews' },
            { icon: <Clock size={16} color="#60a5fa" />, label: '12pm – 11pm', sub: 'Open Today' },
            { icon: <UtensilsCrossed size={16} color="#4ade80" />, label: restaurant.tables ? `${restaurant.tables} Tables` : 'Fine Dining', sub: 'Capacity' },
          ].map((stat, i) => (
            <React.Fragment key={i}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                {stat.icon}
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#ddd', textAlign: 'center', lineHeight: 1.2 }}>{stat.label}</div>
                <div style={{ fontSize: '10px', color: '#555', textAlign: 'center' }}>{stat.sub}</div>
              </div>
              {i < 2 && <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)' }} />}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* ── BEST SELLERS ── */}
      <section className="section-fade" style={{ paddingBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 14px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.01em' }}>Best Sellers</div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Crowd favourites, every time</div>
          </div>
          <button
            onClick={() => scrollTo(menuRef, 'menu')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', color: '#E8321A',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
            }}
          >
            View all <ArrowRight size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', padding: '0 20px 4px', scrollbarWidth: 'none' }}>
          {bestsellers.map((item, i) => (
            <BestsellerCard key={i} item={item} liked={liked[i]} onLike={() => setLiked(l => ({ ...l, [i]: !l[i] }))} />
          ))}
        </div>
      </section>

      {/* ── FULL MENU ── */}
      <section ref={menuRef} className="section-fade" style={{ padding: '0 0 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.01em' }}>Our Menu</div>
            <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Crafted with precision & passion</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 20px 18px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { id: 'starters', label: 'Starters', icon: <Leaf size={12} /> },
            { id: 'mains', label: 'Mains', icon: <UtensilsCrossed size={12} /> },
            { id: 'drinks', label: 'Drinks', icon: <Flame size={12} /> },
          ].map(tab => (
            <button
              key={tab.id}
              className="tab-btn"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '10px', border: 'none',
                background: activeTab === tab.id ? '#E8321A' : 'rgba(255,255,255,0.05)',
                color: activeTab === tab.id ? '#fff' : '#666',
                fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', letterSpacing: '0.02em',
                boxShadow: activeTab === tab.id ? '0 4px 14px rgba(232,50,26,0.35)' : 'none',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activeMenuItems.map((item, i) => (
            <MenuItemCard key={i} item={item} />
          ))}
          {activeMenuItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#444', fontSize: '13px' }}>
              No items in this category yet
            </div>
          )}
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section ref={aboutRef} className="section-fade" style={{ padding: '0 16px 32px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.01em' }}>Our Story</div>
          <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>Where every plate tells a story</div>
        </div>

        {/* Hero about image */}
        {carouselImages.length > 1 && (
          <div style={{
            height: '160px', borderRadius: '16px', overflow: 'hidden',
            marginBottom: '14px',
            backgroundImage: `url(${carouselImages[1] || carouselImages[0]})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            position: 'relative',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }} />
          </div>
        )}

        <div style={{
          background: 'linear-gradient(135deg, rgba(232,50,26,0.07) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(232,50,26,0.12)',
          borderRadius: '16px', padding: '20px', marginBottom: '10px',
        }}>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#E8321A', textTransform: 'uppercase', marginBottom: '10px' }}>
            The Philosophy
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.75, color: '#bbb' }}>
            {restaurant.description || 'An uncompromising culinary experience rooted in craft, quality, and atmosphere. Every dish is a conversation between heritage and innovation, served in a setting that commands reverence.'}
          </p>
          {restaurant.additionalInfo && (
            <p style={{ fontSize: '12px', lineHeight: 1.7, color: '#666', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {restaurant.additionalInfo}
            </p>
          )}
        </div>

        {restaurant.chefInfo && (
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px', padding: '20px', marginBottom: '10px',
          }}>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Award size={11} /> Executive Chef
            </div>
            <p style={{ fontSize: '14px', lineHeight: 1.75, color: '#bbb' }}>{restaurant.chefInfo}</p>
          </div>
        )}

        {/* Info grid */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.2em', color: '#888', textTransform: 'uppercase', marginBottom: '16px' }}>
            Quick Info
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {restaurant.location && (
              <InfoRow icon={<MapPin size={14} color="#E8321A" />} label="Location" value={restaurant.location} />
            )}
            {restaurant.tables && (
              <InfoRow icon={<UtensilsCrossed size={14} color="#4ade80" />} label="Capacity" value={`${restaurant.tables} Tables`} />
            )}
            {restaurant.phone && (
              <InfoRow icon={<Phone size={14} color="#60a5fa" />} label="Reservations" value={restaurant.phone} />
            )}
            {restaurant.rating && (
              <InfoRow icon={<Star size={14} color="#FFB800" fill="#FFB800" />} label="Rating" value={`${restaurant.rating} / 5`} />
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        margin: '0 16px 16px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '20px',
        padding: '28px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '0.03em', marginBottom: '4px' }}>
          {restaurant.name}
        </div>
        {restaurant.location && (
          <div style={{ fontSize: '11px', color: '#444', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <MapPin size={10} /> {restaurant.location}
          </div>
        )}

        {/* Social links */}
        {(restaurant.socialLinks?.instagram || restaurant.socialLinks?.facebook || restaurant.socialLinks?.twitter || restaurant.socialLinks?.website) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
            {restaurant.socialLinks?.instagram && (
              <SocialBtn href={restaurant.socialLinks.instagram} icon={<AtSign size={18} />} />
            )}
            {restaurant.socialLinks?.facebook && (
              <SocialBtn href={restaurant.socialLinks.facebook} icon={<Share2 size={18} />} />
            )}
            {restaurant.socialLinks?.twitter && (
              <SocialBtn href={restaurant.socialLinks.twitter} icon={<MessageCircle size={18} />} />
            )}
            {restaurant.socialLinks?.website && (
              <SocialBtn href={restaurant.socialLinks.website} icon={<Globe size={18} />} />
            )}
          </div>
        )}

        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.name + ' ' + (restaurant.location || ''))}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)',
            borderRadius: '50px', padding: '10px 20px', color: '#FFB800',
            fontSize: '12px', fontWeight: 700, textDecoration: 'none', letterSpacing: '0.05em',
          }}
        >
          <Star size={12} fill="#FFB800" /> Rate Us on Google
        </a>

        <div style={{ marginTop: '20px', fontSize: '10px', color: '#222', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Powered by EXZIBO
        </div>
      </footer>

      {/* ── BOTTOM NAV ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '480px', zIndex: 100,
        background: 'rgba(8,8,8,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '20px 20px 0 0',
        padding: '10px 8px env(safe-area-inset-bottom, 10px)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
      }}>
        {[
          { id: 'home', icon: <Home size={22} />, label: 'Home', action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
          { id: 'menu', icon: <UtensilsCrossed size={22} />, label: 'Menu', action: () => scrollTo(menuRef, 'menu') },
          { id: 'cart', icon: <ShoppingCart size={22} />, label: 'Cart', action: () => {} },
          { id: 'orders', icon: <ClipboardList size={22} />, label: 'Orders', action: () => {} },
          { id: 'booking', icon: <CalendarDays size={22} />, label: 'Book', action: () => {} },
        ].map(({ id, icon, label, action }) => (
          <button
            key={id}
            className="nav-btn"
            onClick={() => { setActiveNav(id); action() }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeNav === id ? '#E8321A' : '#3a3a3a',
              padding: '4px 14px', position: 'relative',
            }}
          >
            {activeNav === id && (
              <div style={{
                position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                width: '24px', height: '3px', background: '#E8321A', borderRadius: '0 0 3px 3px',
              }} />
            )}
            {icon}
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
          </button>
        ))}
      </nav>

      {/* ── SCROLL TO TOP ── */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: 'fixed', bottom: '90px', right: '20px', zIndex: 90,
            width: '40px', height: '40px', borderRadius: '50%',
            background: '#E8321A', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(232,50,26,0.5)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <ArrowUp size={16} />
        </button>
      )}
    </div>
  )
}

function BestsellerCard({ item, liked, onLike }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  return (
    <div className="food-card" style={{
      flexShrink: 0, width: '160px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px', overflow: 'hidden',
      cursor: 'pointer',
    }}>
      <div style={{ height: '120px', overflow: 'hidden', position: 'relative', background: 'rgba(255,255,255,0.03)' }}>
        <img
          src={item.img || fallbackImg}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.src = fallbackImg }}
        />
        <button
          onClick={e => { e.stopPropagation(); onLike() }}
          style={{
            position: 'absolute', top: '8px', right: '8px',
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Heart size={13} fill={liked ? '#E8321A' : 'transparent'} color={liked ? '#E8321A' : '#aaa'} />
        </button>
        {(item.tag || item.tags?.[0]) && (
          <div style={{
            position: 'absolute', bottom: '8px', left: '8px',
            background: 'rgba(232,50,26,0.85)', backdropFilter: 'blur(6px)',
            borderRadius: '6px', padding: '2px 7px',
            fontSize: '9px', fontWeight: 800, color: '#fff', letterSpacing: '0.06em',
          }}>
            {item.tag || item.tags[0]}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.3, marginBottom: '4px', color: '#e0e0e0' }}>
          {item.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#E8321A' }}>
            ₹{(item.price || 0).toLocaleString('en-IN')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Star size={10} fill="#FFB800" color="#FFB800" />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#FFB800' }}>{item.rating || '4.8'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuItemCard({ item }) {
  const fallbackImg = '/menu/wagyu-ribeye.png'
  const tagColor = {
    Popular: '#E8321A', Seasonal: '#fbbf24', Vegetarian: '#4ade80', 'Gluten Free': '#60a5fa',
  }
  return (
    <div className="menu-item-row" style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: '14px', padding: '12px',
      cursor: 'pointer',
    }}>
      <div style={{ width: '70px', height: '70px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={item.img || fallbackImg}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.target.src = fallbackImg }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#e0e0e0', lineHeight: 1.3 }}>{item.name}</div>
          {item.tags?.[0] && (
            <div style={{
              flexShrink: 0,
              background: `${tagColor[item.tags[0]] || '#888'}18`,
              border: `1px solid ${tagColor[item.tags[0]] || '#888'}35`,
              borderRadius: '6px', padding: '2px 7px',
              fontSize: '9px', fontWeight: 700, color: tagColor[item.tags[0]] || '#888',
              letterSpacing: '0.06em',
            }}>
              {item.tags[0]}
            </div>
          )}
        </div>
        {item.description && (
          <div style={{ fontSize: '11px', color: '#555', lineHeight: 1.4, marginBottom: '6px' }}>
            {item.description?.slice(0, 60)}{(item.description?.length || 0) > 60 ? '…' : ''}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#E8321A' }}>
            ₹{(item.price || 0).toLocaleString('en-IN')}
          </div>
          <button style={{
            background: 'rgba(232,50,26,0.12)', border: '1px solid rgba(232,50,26,0.25)',
            borderRadius: '8px', padding: '4px 12px', color: '#E8321A',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
          }}>
            Add +
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '10px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#ccc', marginTop: '1px' }}>{value}</div>
      </div>
    </div>
  )
}

function SocialBtn({ href, icon }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        width: '40px', height: '40px', borderRadius: '12px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#666', textDecoration: 'none', transition: 'all 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#E8321A'; e.currentTarget.style.borderColor = 'rgba(232,50,26,0.3)' }}
      onMouseLeave={e => { e.currentTarget.style.color = '#666'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
    >
      {icon}
    </a>
  )
}
