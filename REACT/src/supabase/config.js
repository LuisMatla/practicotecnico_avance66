
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || ''
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Supabase: faltan REACT_APP_SUPABASE_URL o REACT_APP_SUPABASE_ANON_KEY en el entorno.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export const config = {
  supabaseUrl,
  supabaseKey
}

export { supabaseUrl, supabaseKey }
