// sesiones de chat, mensajes y consultas en supabase.
import { supabase } from '../supabase/config' //cliente supabase.

export const crearSesionChat = async (userId, matricula) => { //crea una sesion de chat para un usuario.
  try {
    console.log('Creando sesión de chat...')
    
    const intentos = [
      //variantes de payload por si el esquema de columnas difiere en despliegues viejos.
      {
        userId: userId,
        matricula: matricula,
        fechaCreacion: new Date().toISOString(),
        ultimaActividad: new Date().toISOString(),
        totalMensajes: 0,
        categoriaPrincipal: 'general'
      },
      {
        userId: userId,
        matricula: matricula,
        fechaCreacion: new Date().toISOString(),
        ultimaActividad: new Date().toISOString(),
        totalMensajes: 0
      },
      {
        userId: userId,
        matricula: matricula,
        totalMensajes: 0
      },
      {
        userId: userId,
        matricula: matricula
      }
    ];
    
    let ultimoError = null; //guarda el ultimo error de insert para el mensaje final.
    
    for (let i = 0; i < intentos.length; i++) {
      //prueba cada variante hasta que una inserte sin error.
      try {
        console.log(`Intento ${i + 1}/${intentos.length} de crear sesión...`);
        const { data, error } = await supabase
          .from('chat_sesiones') //tabla de sesiones.
          .insert(intentos[i]) //inserta el payload actual.
          .select() //devuelve la fila creada.
        
        if (error) {
          ultimoError = error; //memoriza error.
          console.log(`Intento ${i + 1} falló:`, error.message);
          continue; //pasa al siguiente intento.
        }
        
        console.log('Sesión de chat creada:', data[0].id);
        return data[0]; //sesion creada con exito.
      } catch (insertError) {
        ultimoError = insertError; //captura excepciones de red o runtime.
        console.log(`Intento ${i + 1} falló con excepción:`, insertError.message);
        continue;
      }
    }
    
    console.error('Todos los intentos fallaron. Último error:', ultimoError);
    throw new Error(`No se pudo crear la sesión después de ${intentos.length} intentos. Error: ${ultimoError?.message || 'Desconocido'}`);

  } catch (error) {
    console.error('Error en crearSesionChat:', error)
    throw error
  }
}

export const obtenerSesionActiva = async (userId) => { //obtiene la sesion mas reciente (activa) del usuario.
  try {
    const { data, error } = await supabase
      .from('chat_sesiones')
      .select('*')
      .eq('userId', userId) //filtra por usuario autenticado.
      .order('fechaCreacion', { ascending: false }) //la mas nueva primero.
      .limit(1)
      .single() //espera un solo registro.

    if (error) {
      if (error.code === 'PGRST116') {
        return null //postgrest: sin filas no es error fatal aqui.
      }
      console.error('Error obteniendo sesión:', error)
      throw new Error(error.message)
    }

    return data
  } catch (error) {
    console.error('Error en obtenerSesionActiva:', error)
    return null
  }
}

export const obtenerTodasSesiones = async (userId, limite = 50, offset = 0) => { //lista sesiones del usuario (paginadas).
  try {
    const limiteFinal = Math.min(limite, 500) //tapa el limite para no sobrecargar.
    const hasta = offset + limiteFinal - 1 //indice final inclusivo para range.
    
    const { count } = await supabase
      .from('chat_sesiones')
      .select('*', { count: 'exact', head: true }) //solo cuenta sin traer filas.
      .eq('userId', userId)

    const { data, error } = await supabase
      .from('chat_sesiones')
      .select('*')
      .eq('userId', userId)
      .order('ultimaActividad', { ascending: false }) //orden por actividad reciente.
      .range(offset, hasta) //paginacion por rango.

    if (error) {
      console.error('Error obteniendo sesiones:', error)
      throw new Error(error.message)
    }

    const tieneMas = count ? (offset + (data?.length || 0)) < count : false //true si quedan paginas.

    return {
      sesiones: data || [],
      total: count || 0,
      tieneMas
    }
  } catch (error) {
    console.error('Error en obtenerTodasSesiones:', error)
    return {
      sesiones: [],
      total: 0,
      tieneMas: false
    }
  }
}

export const agregarMensaje = async (sesionId, userId, matricula, mensaje, tipo, categoria = 'general') => { //guarda un mensaje en una sesion.
  try {
    console.log('Agregando mensaje a sesión:', sesionId)
    
    const { data, error } = await supabase
      .from('chat_mensajes') //tabla de mensajes por sesion.
      .insert({
        sesionId: sesionId,
        userId: userId,
        matricula: matricula,
        mensaje: mensaje,
        tipo: tipo,
        timestamp: new Date().toISOString(),
        categoria: categoria
      })
      .select()

    if (error) {
      console.error('Error agregando mensaje:', error)
      throw new Error(error.message)
    }

    if (!data || !data[0]) {
      throw new Error('No se recibió el mensaje guardado de la base de datos')
    }

    const mensajeGuardado = {
      //normaliza mayusculas/minusculas por compatibilidad con distintos drivers.
      id: data[0].id || data[0].Id,
      sesionId: data[0].sesionId || data[0].sesionid || sesionId,
      userId: data[0].userId || data[0].userid,
      matricula: data[0].matricula || matricula,
      mensaje: data[0].mensaje || data[0].message || mensaje,
      tipo: data[0].tipo || data[0].type || tipo,
      timestamp: data[0].timestamp || data[0].created_at || new Date().toISOString(),
      categoria: data[0].categoria || data[0].category || categoria
    }

    try {
      const { data: sesionData } = await supabase
        .from('chat_sesiones')
        .select('totalMensajes') //lee contador actual de la sesion.
        .eq('id', sesionId)
        .single()

      const nuevoTotal = (sesionData?.totalMensajes || 0) + 1 //incrementa en uno.

      await supabase
        .from('chat_sesiones')
        .update({
          ultimaActividad: new Date().toISOString(),
          totalMensajes: nuevoTotal
        })
        .eq('id', sesionId) //actualiza solo la sesion afectada.
    } catch (updateError) {
      console.warn('Error actualizando contador de mensajes:', updateError) //no bloquea si falla el contador.
    }

    console.log('Mensaje agregado:', mensajeGuardado.id)
    return mensajeGuardado

  } catch (error) {
    console.error('Error en agregarMensaje:', error)
    throw error
  }
}

export const obtenerMensajes = async (sesionId, limite = 100, offset = 0) => { //obtiene mensajes de una sesion (paginados).
  try {
    const limiteFinal = Math.min(limite, 1000) //tapa limite maximo.
    const hasta = offset + limiteFinal - 1
    
    console.log(`Obteniendo mensajes de sesión ${sesionId} (offset: ${offset}, límite: ${limiteFinal})...`)
    
    const { count } = await supabase
      .from('chat_mensajes')
      .select('*', { count: 'exact', head: true })
      .eq('sesionId', sesionId)

    const { data, error } = await supabase
      .from('chat_mensajes')
      .select('*')
      .eq('sesionId', sesionId)
      .order('timestamp', { ascending: false }) //mas recientes primero.
      .range(offset, hasta)

    if (error) {
      console.error('Error obteniendo mensajes:', error)
      throw new Error(error.message)
    }

    if (!data || data.length === 0) {
      console.log('No hay mensajes en esta sesión')
      return {
        mensajes: [],
        total: 0,
        tieneMas: false
      }
    }

    const mensajesOrdenados = data.reverse() //vuelve a orden cronologico ascendente en memoria.

    const mensajesNormalizados = mensajesOrdenados.map(msg => ({
      //mapea filas a forma estable para el componente de chat.
      id: msg.id || msg.Id,
      sesionId: msg.sesionId || msg.sesionid || sesionId,
      userId: msg.userId || msg.userid,
      matricula: msg.matricula || '',
      mensaje: msg.mensaje || msg.message || '',
      tipo: msg.tipo || msg.type || 'bot',
      timestamp: msg.timestamp || msg.created_at || new Date().toISOString(),
      categoria: msg.categoria || msg.category || 'general'
    }))

    const tieneMas = count ? (offset + mensajesNormalizados.length) < count : false

    console.log(`${mensajesNormalizados.length} mensajes obtenidos de ${count || 0} totales`)
    return {
      mensajes: mensajesNormalizados,
      total: count || 0,
      tieneMas
    }

  } catch (error) {
    console.error('Error en obtenerMensajes:', error)
    return {
      mensajes: [],
      total: 0,
      tieneMas: false
    }
  }
}

export const eliminarSesion = async (sesionId, userId) => { //elimina una sesion y sus mensajes (con verificacion de acceso).
  try {
    console.log('Eliminando sesión de chat:', sesionId)
    
    const tieneAcceso = await verificarAcceso(sesionId, userId) //comprueba propiedad de la sesion.
    if (!tieneAcceso) {
      throw new Error('No tienes permiso para eliminar esta sesión')
    }

    const { error: mensajesError } = await supabase
      .from('chat_mensajes')
      .delete()
      .eq('sesionId', sesionId) //borra primero hijos por integridad.

    if (mensajesError) {
      console.error('Error eliminando mensajes:', mensajesError)
      throw new Error(mensajesError.message)
    }

    const { error: sesionError } = await supabase
      .from('chat_sesiones')
      .delete()
      .eq('id', sesionId) //luego borra la sesion.

    if (sesionError) {
      console.error('Error eliminando sesión:', sesionError)
      throw new Error(sesionError.message)
    }

    console.log('Sesión eliminada completamente')
    return {
      success: true,
      message: 'Sesión eliminada exitosamente'
    }

  } catch (error) {
    console.error('Error en eliminarSesion:', error)
    throw error
  }
}

const verificarAcceso = async (sesionId, userId) => {
  //comprueba que la sesion pertenezca al userId (anti borrado ajeno).
  try {
    const { data, error } = await supabase
      .from('chat_sesiones')
      .select('userId')
      .eq('id', sesionId)
      .eq('userId', userId)
      .single()

    if (error) {
      return false
    }

    return !!data

  } catch (error) {
    console.error('Error verificando acceso:', error)
    return false
  }
}

export const guardarConsulta = async (userId, matricula, consulta, respuesta, categoria) => { //guarda consulta/respuesta en historial.
  try {
    console.log('Guardando consulta en historial...')
    
    const { data, error } = await supabase
      .from('historial_consultas') //tabla de historial del bot.
      .insert({
        userId: userId,
        matricula: matricula,
        consulta: consulta,
        respuesta: respuesta,
        categoria: categoria,
        fechaConsulta: new Date().toISOString(),
        timestamp: new Date().toISOString() //campo extra por compatibilidad con payloads viejos.
      })
      .select()

    if (error) {
      console.error('Error guardando consulta:', error)
      throw new Error(error.message)
    }

    console.log('Consulta guardada en historial')
    return data[0]

  } catch (error) {
    console.error('Error en guardarConsulta:', error)
    throw error
  }
}
