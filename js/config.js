// ════════════════════════════════════════════════════════════════
//  Conexión a tu base de Supabase.
//
//  Los dos valores salen de Supabase → Project Settings → API:
//    · Project URL          → SUPABASE_URL
//    · anon / public key    → SUPABASE_ANON_KEY
//
//  La "anon key" está hecha para ir en el código de una página
//  pública: no da acceso a nada sin iniciar sesión, porque cada
//  tabla tiene reglas que solo te dejan ver lo tuyo.
//  NUNCA pongas acá la "service_role key".
//
//  Si los dejás vacíos, la app te los pide en pantalla y los
//  guarda en ese dispositivo.
// ════════════════════════════════════════════════════════════════

   export const SUPABASE_URL = 'https://ckongzmutfghuljkbwku.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_Y9ot9s3DwEu6gSbUml5Bdw_1HtUF4nJ';
