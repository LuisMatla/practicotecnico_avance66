// cliente supabase (saas): auth y base de datos; front en vercel.
import { createClient } from '@supabase/supabase-js' //sdk oficial de supabase.

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '' //url del proyecto supabase.
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '' //anon key (publica) para el front.

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Supabase: faltan REACT_APP_SUPABASE_URL o REACT_APP_SUPABASE_ANON_KEY en el entorno.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey) //instancia unica usada en servicios y componentes.

export const config = {
  supabaseUrl, //expone url para debug/diagnostico.
  supabaseKey //expone key para debug/diagnostico.
}

export { supabaseUrl, supabaseKey }
