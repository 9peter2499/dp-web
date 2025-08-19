// supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const directSupabaseUrl = "https://fhnprrlmlhleomfqqvpp.supabase.co";

// สร้างและตั้งค่า Supabase client ที่นี่ที่เดียว
// SUPABASE_URL

export const _supabase = createClient(directSupabaseUrl, SUPABASE_ANON_KEY, {
  global: {
    headers: { "x-client-info": "supabase-js/2.x" },
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    revalidateOnFocus: false,
    // ✅ เพิ่ม Option นี้เพื่อให้ทำงานบนมือถือและเบราว์เซอร์สมัยใหม่ได้ดีขึ้น (สำคัญมาก)
    flowType: "pkce",
  },
});
