# CRIMSONLUXE

A luxury dark-themed restaurant management web platform with a cinematic, premium aesthetic.

## Architecture

- **Frontend**: React + Vite (single-page app, no backend)
- **Routing**: React Router DOM
- **Icons**: Lucide React
- **Port**: 5000 (dev server)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — cinematic hero with CTA buttons |
| `/dashboard` | Admin dashboard with KPI cards and enterprise partners table |
| `/menu-editor` | Real-time menu editor with categories, item CRUD, restaurant info |
| `/settings` | Profile, security, preferences, session management |
| `/create-website` | Deployment console for onboarding new restaurants |
| `/restaurant/:slug/food/:itemName` | Premium dark-theme food detail page (upgraded) |

## Design System

- **Background**: `#0A0A0A` (obsidian black)
- **Primary Accent**: `#E8321A` (crimson red)
- **Typography**: Inter (bold headings, clean body)
- **UI**: Glassmorphism, rounded cards (18-24px radius), glow effects
- **Animations**: Fade-in, pulse glow, hover transitions

## Commands

```bash
npm run dev    # Start dev server on port 5000
npm run build  # Production build
```
