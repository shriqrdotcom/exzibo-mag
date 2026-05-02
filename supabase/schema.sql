-- ============================================================
-- Exzibo — Supabase Schema
-- Run this in your Supabase SQL Editor (supabase.com → SQL Editor)
-- ============================================================

-- Restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  uid          TEXT NOT NULL,
  logo         TEXT,
  status       TEXT DEFAULT 'active',
  plan         TEXT DEFAULT 'STARTER',
  place        TEXT,
  note         TEXT,
  start_date   TIMESTAMPTZ DEFAULT NOW(),
  end_date     TIMESTAMPTZ,
  accent_color TEXT DEFAULT '#6366F1',
  currency     TEXT DEFAULT 'INR',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, uid)
);

-- Menu categories (sections like Starters, Mains, Drinks)
CREATE TABLE IF NOT EXISTS menu_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  emoji         TEXT DEFAULT '🍽️',
  position      INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Menu items
CREATE TABLE IF NOT EXISTS menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  category_id   UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         DECIMAL(10,2) DEFAULT 0,
  image         TEXT,
  available     BOOLEAN DEFAULT true,
  veg           BOOLEAN DEFAULT true,
  tags          JSONB DEFAULT '[]',
  add_ons       JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  table_number    TEXT,
  customer_name   TEXT,
  customer_phone  TEXT,
  customer_location TEXT,
  items           JSONB DEFAULT '[]',
  status          TEXT DEFAULT 'pending',
  total           DECIMAL(10,2) DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT,
  customer_email  TEXT,
  guests          INTEGER DEFAULT 1,
  date            TEXT,
  time            TEXT,
  occasion        TEXT,
  seating         TEXT,
  notes           TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  owner_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL,
  category      TEXT,
  department    TEXT,
  avatar        TEXT,
  phone         TEXT,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  global_config JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE restaurants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings   ENABLE ROW LEVEL SECURITY;

-- Restaurants: owners only
CREATE POLICY "owners_select_restaurants" ON restaurants FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "owners_insert_restaurants" ON restaurants FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owners_update_restaurants" ON restaurants FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "owners_delete_restaurants" ON restaurants FOR DELETE USING (auth.uid() = owner_id);

-- Menu categories: owners manage, public can read
CREATE POLICY "owners_manage_menu_categories" ON menu_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = menu_categories.restaurant_id AND restaurants.owner_id = auth.uid()));
CREATE POLICY "public_read_menu_categories" ON menu_categories FOR SELECT USING (true);

-- Menu items: owners manage, public can read
CREATE POLICY "owners_manage_menu_items" ON menu_items FOR ALL
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = menu_items.restaurant_id AND restaurants.owner_id = auth.uid()));
CREATE POLICY "public_read_menu_items" ON menu_items FOR SELECT USING (true);

-- Orders: owners manage, customers can insert
CREATE POLICY "owners_manage_orders" ON orders FOR ALL
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = orders.restaurant_id AND restaurants.owner_id = auth.uid()));
CREATE POLICY "public_insert_orders" ON orders FOR INSERT WITH CHECK (true);

-- Bookings: owners manage, customers can insert
CREATE POLICY "owners_manage_bookings" ON bookings FOR ALL
  USING (EXISTS (SELECT 1 FROM restaurants WHERE restaurants.id = bookings.restaurant_id AND restaurants.owner_id = auth.uid()));
CREATE POLICY "public_insert_bookings" ON bookings FOR INSERT WITH CHECK (true);

-- Team members: owner manages their own
CREATE POLICY "owners_manage_team" ON team_members FOR ALL USING (auth.uid() = owner_id);

-- User settings
CREATE POLICY "users_manage_settings" ON user_settings FOR ALL USING (auth.uid() = user_id);
