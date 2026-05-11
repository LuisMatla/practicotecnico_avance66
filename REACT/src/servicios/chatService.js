
import { supabase } from '../supabase/config'

export const crearSesionChat = async (userId, matricula) => {
  try {
    console.log('Creando sesión de chat...')

    const intentos = [

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

    let ultimoError = null;

    for (let i = 0; i < intentos.length; i++) {

      try {
        console.log(`Intento ${i + 1}/${intentos.length} de crear sesión...`);
        const { data, error } = await supabase
          .from('chat_sesiones')
          .insert(intentos[i])
          .select()

        if (error) {
          ultimoError = error;
          console.log(`Intento ${i + 1} falló:`, error.message);
          continue;
        }

        console.log('Sesión de chat creada:', data[0].id);
        return data[0];
      } catch (insertError) {
        ultimoError = insertError;
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

export const obtenerSesionActiva = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('chat_sesiones')
      .select('*')
      .eq('userId', userId)
      .order('fechaCreacion', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
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

export const obtenerTodasSesiones = async (userId, limite = 50, offset = 0) => {
  try {
    const limiteFinal = Math.min(limite, 500)
    const hasta = offset + limiteFinal - 1

    const { count } = await supabase
      .from('chat_sesiones')
      .select('*', { count: 'exact', head: true })
      .eq('userId', userId)

    const { data, error } = await supabase
      .from('chat_sesiones')
      .select('*')
      .eq('userId', userId)
      .order('ultimaActividad', { ascending: false })
      .range(offset, hasta)

    if (error) {
      console.error('Error obteniendo sesiones:', error)
      throw new Error(error.message)
    }

    const tieneMas = count ? (offset + (data?.length || 0)) < count : false

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

export const agregarMensaje = async (sesionId, userId, matricula, mensaje, tipo, categoria = 'general') => {
  try {
    console.log('Agregando mensaje a sesión:', sesionId)

    const { data, error } = await supabase
      .from('chat_mensajes')
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
        .select('totalMensajes')
        .eq('id', sesionId)
        .single()

      const nuevoTotal = (sesionData?.totalMensajes || 0) + 1

      await supabase
        .from('chat_sesiones')
        .update({
          ultimaActividad: new Date().toISOString(),
          totalMensajes: nuevoTotal
        })
        .eq('id', sesionId)
    } catch (updateError) {
      console.warn('Error actualizando contador de mensajes:', updateError)
    }

    console.log('Mensaje agregado:', mensajeGuardado.id)
    return mensajeGuardado

  } catch (error) {
    console.error('Error en agregarMensaje:', error)
    throw error
  }
}

export const obtenerMensajes = async (sesionId, limite = 100, offset = 0) => {
  try {
    const limiteFinal = Math.min(limite, 1000)
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
      .order('timestamp', { ascending: false })
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

    const mensajesOrdenados = data.reverse()

    const mensajesNormalizados = mensajesOrdenados.map(msg => ({

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

export const eliminarSesion = async (sesionId, userId) => {
  try {
    console.log('Eliminando sesión de chat:', sesionId)

    const tieneAcceso = await verificarAcceso(sesionId, userId)
    if (!tieneAcceso) {
      throw new Error('No tienes permiso para eliminar esta sesión')
    }

    const { error: mensajesError } = await supabase
      .from('chat_mensajes')
      .delete()
      .eq('sesionId', sesionId)

    if (mensajesError) {
      console.error('Error eliminando mensajes:', mensajesError)
      throw new Error(mensajesError.message)
    }

    const { error: sesionError } = await supabase
      .from('chat_sesiones')
      .delete()
      .eq('id', sesionId)

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

export const guardarConsulta = async (userId, matricula, consulta, respuesta, categoria) => {
  try {
    console.log('Guardando consulta en historial...')

    const { data, error } = await supabase
      .from('historial_consultas')
      .insert({
        userId: userId,
        matricula: matricula,
        consulta: consulta,
        respuesta: respuesta,
        categoria: categoria,
        fechaConsulta: new Date().toISOString(),
        timestamp: new Date().toISOString()
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
