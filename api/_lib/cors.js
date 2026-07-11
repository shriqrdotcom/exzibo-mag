/**
 * api/_lib/cors.js — Shared CORS headers for all API functions
 * Extracted from api/_lib/supabase.js (which is now deleted).
 */
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
