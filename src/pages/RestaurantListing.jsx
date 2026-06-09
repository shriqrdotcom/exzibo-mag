import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, MoreVertical } from 'lucide-react'
import { useFavourites } from '../context/FavouritesContext'

const RESTAURANTS = [
  {
    id: '1',
    name: 'La Maison Noire',
    cuisine: 'French · Fine Dining',
    rating: 4.8,
    reviews: 320,
    location: 'Cyber City, Gurugram',
    color: '#C0392B',
    initial: 'L',
    tag: 'Top Rated',
  },
  {
    id: '2',
    name: 'Sakura Garden',
    cuisine: 'Japanese · Sushi',
    rating: 4.6,
    reviews: 210,
    location: 'Connaught Place, Delhi',
    color: '#8E44AD',
    initial: 'S',
    tag: 'New',
  },
  {
    id: '3',
    name: 'Bella Napoli',
    cuisine: 'Italian · Pizza & Pasta',
    rating: 4.5,
    reviews: 480,
    location: 'Bandra West, Mumbai',
    color: '#1A6B3A',
    initial: 'B',
    tag: 'Popular',
  },
  {
    id: '4',
    name: 'Spice Route',
    cuisine: 'Indian · Regional Cuisine',
    rating: 4.7,
    reviews: 560,
    location: 'Koramangala, Bengaluru',
    color: '#D35400',
    initial: 'S',
    tag: 'Trending',
  },
  {
    id: '5',
    name: 'The Blue Anchor',
    cuisine: 'Seafood · Continental',
    rating: 4.4,
    reviews: 190,
    location: 'Marine Drive, Mumbai',
    color: '#1565C0',
    initial: 'T',
    tag: null,
  },
]

function StarRating({ rating }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="none">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#F59E0B' }}>{rating.toFixed(1)}</span>
    </div>
  )
}

function ThreeDotsMenu({ restaurantId }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          width: '34px', height: '34px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <MoreVertical size={16} color="rgba(255,255,255,0.65)" />
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: '38px', right: 0, zIndex: 20,
            background: '#1e1e1e',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '12px',
            minWidth: '150px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
            {['View Menu', 'Share', 'Report'].map(label => (
              <button
                key={label}
                onClick={() => setOpen(false)}
                style={{
                  width: '100%', padding: '11px 16px',
                  background: 'none', border: 'none',
                  color: label === 'Report' ? '#E8321A' : 'rgba(255,255,255,0.85)',
                  fontSize: '13px', fontWeight: 500,
                  textAlign: 'left', cursor: 'pointer',
                  display: 'block',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RestaurantCard({ restaurant }) {
  const navigate = useNavigate()
  const { isFavourite, toggleFavourite } = useFavourites()
  const fav = isFavourite(restaurant.id)

  function handleHeart(e) {
    e.stopPropagation()
    toggleFavourite(restaurant.id)
    navigate('/favourites')
  }

  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '18px',
      padding: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      position: 'relative',
      cursor: 'pointer',
      transition: 'border-color 0.2s ease, transform 0.15s ease',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Logo */}
      <div style={{
        width: '58px', height: '58px', borderRadius: '14px',
        background: restaurant.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        fontSize: '22px', fontWeight: 700, color: '#fff',
        letterSpacing: '-0.5px',
      }}>
        {restaurant.initial}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
          <span style={{
            fontSize: '15px', fontWeight: 700,
            color: '#fff', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {restaurant.name}
          </span>
          {restaurant.tag && (
            <span style={{
              fontSize: '10px', fontWeight: 700,
              background: 'rgba(232,50,26,0.18)',
              color: '#E8321A',
              borderRadius: '6px', padding: '2px 7px',
              flexShrink: 0,
            }}>
              {restaurant.tag}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginBottom: '6px' }}>
          {restaurant.cuisine}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <StarRating rating={restaurant.rating} />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
            ({restaurant.reviews} reviews)
          </span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          marginTop: '5px',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
            {restaurant.location}
          </span>
        </div>
      </div>

      {/* Top-right action icons */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        alignSelf: 'flex-start',
        paddingTop: '2px',
      }}>
        {/* Heart button */}
        <button
          onClick={handleHeart}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: fav ? '#E8321A' : '#111',
            border: fav ? '1px solid #E8321A' : '1px solid rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title={fav ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart
            size={16}
            color="#fff"
            fill={fav ? '#fff' : 'none'}
            strokeWidth={fav ? 0 : 2}
          />
        </button>

        {/* Three-dot menu */}
        <ThreeDotsMenu restaurantId={restaurant.id} />
      </div>
    </div>
  )
}

export default function RestaurantListing() {
  const navigate = useNavigate()
  const { favourites } = useFavourites()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      color: '#fff',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.4px' }}>
            Explore
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '1px' }}>
            Discover restaurants near you
          </div>
        </div>

        {/* Favourites shortcut */}
        <button
          onClick={() => navigate('/favourites')}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: 'rgba(232,50,26,0.12)',
            border: '1px solid rgba(232,50,26,0.25)',
            borderRadius: '12px',
            padding: '8px 14px',
            color: '#E8321A', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Heart size={14} fill={favourites.size > 0 ? '#E8321A' : 'none'} color="#E8321A" />
          Favourites
          {favourites.size > 0 && (
            <span style={{
              background: '#E8321A', color: '#fff',
              borderRadius: '10px', padding: '1px 7px',
              fontSize: '11px', fontWeight: 700,
            }}>
              {favourites.size}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 16px', maxWidth: '480px', margin: '0 auto' }}>
        {/* Section label */}
        <div style={{
          fontSize: '12px', fontWeight: 700,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: '14px',
        }}>
          {RESTAURANTS.length} Restaurants
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {RESTAURANTS.map(r => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))}
        </div>
      </div>
    </div>
  )
}
