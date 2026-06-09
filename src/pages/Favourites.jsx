import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, MoreVertical } from 'lucide-react'
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

function FavouriteCard({ restaurant }) {
  const { isFavourite, toggleFavourite } = useFavourites()
  const fav = isFavourite(restaurant.id)

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
      transition: 'border-color 0.2s ease',
    }}>
      {/* Logo */}
      <div style={{
        width: '58px', height: '58px', borderRadius: '14px',
        background: restaurant.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        fontSize: '22px', fontWeight: 700, color: '#fff',
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
              background: 'rgba(232,50,26,0.18)', color: '#E8321A',
              borderRadius: '6px', padding: '2px 7px', flexShrink: 0,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
            {restaurant.location}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        alignSelf: 'flex-start', paddingTop: '2px',
      }}>
        <button
          onClick={() => toggleFavourite(restaurant.id)}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: fav ? '#E8321A' : '#111',
            border: fav ? '1px solid #E8321A' : '1px solid rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.2s ease, transform 0.15s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Remove from favourites"
        >
          <Heart size={16} color="#fff" fill={fav ? '#fff' : 'none'} strokeWidth={fav ? 0 : 2} />
        </button>
        <button
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
      </div>
    </div>
  )
}

export default function Favourites() {
  const navigate = useNavigate()
  const { favourites } = useFavourites()

  const favouriteList = RESTAURANTS.filter(r => favourites.has(r.id))

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
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <button
          onClick={() => navigate('/explore')}
          style={{
            width: '38px', height: '38px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <ArrowLeft size={18} color="rgba(255,255,255,0.85)" />
        </button>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.4px' }}>
            My Favourites
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '1px' }}>
            {favouriteList.length} saved {favouriteList.length === 1 ? 'restaurant' : 'restaurants'}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 16px', maxWidth: '480px', margin: '0 auto' }}>
        {favouriteList.length === 0 ? (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            paddingTop: '80px', gap: '16px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '36px',
              background: 'rgba(232,50,26,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Heart size={32} color="rgba(232,50,26,0.45)" />
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' }}>
                No favourites added yet
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                Tap the heart icon on any restaurant{'\n'}to save it here
              </div>
            </div>
            <button
              onClick={() => navigate('/explore')}
              style={{
                marginTop: '8px',
                background: '#E8321A', color: '#fff',
                border: 'none', borderRadius: '14px',
                padding: '12px 28px',
                fontSize: '14px', fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Browse Restaurants
            </button>
          </div>
        ) : (
          <>
            <div style={{
              fontSize: '12px', fontWeight: 700,
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: '14px',
            }}>
              Saved
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {favouriteList.map(r => (
                <FavouriteCard key={r.id} restaurant={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
