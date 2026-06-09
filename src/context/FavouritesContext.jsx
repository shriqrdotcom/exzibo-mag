import React, { createContext, useContext, useState } from 'react'

const FavouritesContext = createContext(null)

export function FavouritesProvider({ children }) {
  const [favourites, setFavourites] = useState(new Set())

  function toggleFavourite(id) {
    setFavourites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function isFavourite(id) {
    return favourites.has(id)
  }

  return (
    <FavouritesContext.Provider value={{ favourites, toggleFavourite, isFavourite }}>
      {children}
    </FavouritesContext.Provider>
  )
}

export function useFavourites() {
  const ctx = useContext(FavouritesContext)
  if (!ctx) throw new Error('useFavourites must be used within FavouritesProvider')
  return ctx
}
