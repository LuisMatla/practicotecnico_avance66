
import { supabase } from '../supabase/config'

export const verificarCorreoBloqueado = async (correo) => {
  try {
    console.log('Verificando si el correo está bloqueado:', correo)

    await supabase.rpc('limpiar_correos_expirados')

    const { data, error } = await supabase
      .from('correos_bloqueados')
      .select('*')
      .eq('correo', correo)
      .eq('activo', true)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error(' Error verificando correo bloqueado:', error)
      throw new Error(error.message)
    }

    if (data) {
      const tiempoTranscurrido = Date.now() - new Date(data.fechaBloqueo).getTime()
      const minutosTranscurridos = Math.floor(tiempoTranscurrido / (1000 * 60))

      if (minutosTranscurridos < 5) {
        const minutosRestantes = 5 - minutosTranscurridos
        return {
          bloqueado: true,
          minutosRestantes,
          mensaje: `Este correo está temporalmente bloqueado. Intenta nuevamente en ${minutosRestantes} minuto(s).`
        }
      } else {
        await supabase
          .from('correos_bloqueados')
          .delete()
          .eq('correo', correo)

        return { bloqueado: false }
      }
    }

    return { bloqueado: false }

  } catch (error) {
    console.error(' Error en verificarCorreoBloqueado:', error)
    throw error
  }
}

export const bloquearCorreo = async (correo) => {
  try {
    console.log('Bloqueando correo temporalmente:', correo)

    const { error } = await supabase
      .from('correos_bloqueados')
      .upsert({
        correo: correo,
        fechaBloqueo: new Date().toISOString(),
        activo: true
      }, {
        onConflict: 'correo',
        ignoreDuplicates: false
      })

    if (error) {
      console.error(' Error bloqueando correo:', error)
      throw new Error(error.message)
    }

    console.log(' Correo bloqueado exitosamente')
    return {
      success: true,
      message: 'Correo bloqueado temporalmente'
    }

  } catch (error) {
    console.error(' Error en bloquearCorreo:', error)
    throw error
  }
}

export const desbloquearCorreo = async (correo) => {
  try {
    console.log('Desbloqueando correo:', correo)

    const { error } = await supabase
      .from('correos_bloqueados')
      .delete()
      .eq('correo', correo)

    if (error) {
      console.error(' Error desbloqueando correo:', error)
      throw new Error(error.message)
    }

    console.log(' Correo desbloqueado exitosamente')
    return {
      success: true,
      message: 'Correo desbloqueado exitosamente'
    }

  } catch (error) {
    console.error(' Error en desbloquearCorreo:', error)
    throw error
  }
}

export const limpiarUsuarioNoVerificado = async (uid, correo) => {
  try {
    console.log(' Limpiando usuario no verificado:', correo)

    const { data: usuarioEnBD, error: bdError } = await supabase
      .from('usuarios')
      .select('uid')
      .eq('uid', uid)
      .single()

    if (!usuarioEnBD || bdError?.code === 'PGRST116') {
      console.log(' Usuario no verificado encontrado, limpiando...')

      await desbloquearCorreo(correo)

      await supabase
        .from('usuarios_por_matricula')
        .delete()
        .eq('uid', uid)

      console.log(' Usuario no verificado limpiado, correo desbloqueado')
      return {
        success: true,
        message: 'Usuario no verificado eliminado'
      }
    }

    console.log(' Usuario ya está verificado, no se elimina')
    return {
      success: true,
      message: 'Usuario verificado'
    }

  } catch (error) {
    console.error(' Error en limpiarUsuarioNoVerificado:', error)
    throw error
  }
}

export const crearUsuarioDespuesVerificacion = async (uid, usuarioData) => {
  try {
    console.log(' Creando usuario en BD después de verificación:', uid)

    const { error: dbError } = await supabase
      .from('usuarios')
      .upsert({
        uid: uid,
        nombre: usuarioData.nombre,
        apellidos: usuarioData.apellidos,
        matricula: usuarioData.matricula,
        carrera: usuarioData.carrera,
        facultad: usuarioData.facultad,
        correo: usuarioData.correo,
        fechanacimiento: usuarioData.fechaNacimiento,
        fecharegistro: new Date().toISOString(),
        ultimoacceso: new Date().toISOString(),
        activo: true
      }, { onConflict: 'uid' })

    if (dbError) {
      console.error(' Error guardando en BD:', dbError)
      throw new Error(dbError.message)
    }

    const { error: indexError } = await supabase
      .from('usuarios_por_matricula')
      .upsert({
        uid: uid,
        matricula: usuarioData.matricula
      }, { onConflict: 'matricula' })

    if (indexError) {
      console.error(' Error creando índice:', indexError)
    }

    await desbloquearCorreo(usuarioData.correo)

    console.log(' Usuario creado en BD después de verificación')
    return {
      success: true,
      message: 'Usuario creado exitosamente'
    }

  } catch (error) {
    console.error(' Error en crearUsuarioDespuesVerificacion:', error)
    throw error
  }
}

export const registrarUsuario = async (usuarioData) => {
  try {
    console.log(' Iniciando registro con Supabase...')

    const estadoCorreo = await verificarCorreoBloqueado(usuarioData.correo)
    if (estadoCorreo.bloqueado) {
      throw new Error(estadoCorreo.mensaje)
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: usuarioData.correo,
      password: usuarioData.password,
      options: {
        data: {
          nombre: usuarioData.nombre,
          apellidos: usuarioData.apellidos,
          matricula: usuarioData.matricula,
          carrera: usuarioData.carrera,
          facultad: usuarioData.facultad,
          fechanacimiento: usuarioData.fechaNacimiento
        },
        emailRedirectTo: `${window.location.origin}/`
      }
    })

    if (authError) {
      console.error(' Error en autenticación:', authError)
      throw new Error(authError.message)
    }

    if (!authData.user) {
      throw new Error('No se pudo crear el usuario')
    }

    console.log(' Usuario creado en Auth:', authData.user.id)

    try {
      await bloquearCorreo(usuarioData.correo)
      console.log(' Correo bloqueado temporalmente')
    } catch (bloqueoError) {
      console.warn(' No se pudo bloquear el correo, pero continuamos:', bloqueoError.message)
    }

    console.log(' Correo de verificación enviado (si está configurado en Supabase)')

    try {
      const { error: dbError } = await supabase
        .from('usuarios')
        .upsert({
          uid: authData.user.id,
          nombre: usuarioData.nombre,
          apellidos: usuarioData.apellidos,
          matricula: usuarioData.matricula,
          carrera: usuarioData.carrera,
          facultad: usuarioData.facultad,
          correo: usuarioData.correo,
          fechanacimiento: usuarioData.fechaNacimiento,
          fecharegistro: new Date().toISOString(),
          ultimoacceso: new Date().toISOString(),
          activo: true
        }, { onConflict: 'uid' })
      if (dbError) {
        console.error(' Error guardando usuario en BD:', dbError)
      }

      await supabase
        .from('usuarios_por_matricula')
        .upsert({ uid: authData.user.id, matricula: usuarioData.matricula }, { onConflict: 'matricula' })
    } catch (_) {
    }

    setTimeout(async () => {
      try {
        await limpiarUsuarioNoVerificado(authData.user.id, usuarioData.correo)
      } catch (error) {
        console.error(' Error en limpieza automática:', error)
      }
    }, 5 * 60 * 1000)

    console.log(' Usuario registrado, esperando verificación de correo')
    return {
      success: true,
      user: authData.user,
      message: 'Usuario registrado exitosamente. Revisa tu correo para verificar tu cuenta.'
    }

  } catch (error) {
    console.error(' Error en registro:', error)
    throw error
  }
}

export const iniciarSesion = async (matricula, password) => {
  try {
    console.log(' Iniciando sesión con Supabase...')

    if (String(matricula).includes('@')) {
      throw new Error('Inicia sesión usando tu matrícula')
    }

    const matriculaNorm = String(matricula).trim()

    const emailEsperado = `z${matriculaNorm}@estudiantes.uv.mx`

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailEsperado,
      password: password
    })

    if (authError) {
      console.error(' Error en autenticación:', authError)
      if (String(authError.message || '').toLowerCase().includes('email not confirmed')) {
        throw new Error('Tu correo aún no está verificado. Revisa tu correo y confirma tu cuenta.')
      }
      throw new Error(authError.message)
    }

    if (!authData.user) {
      throw new Error('No se pudo iniciar sesión')
    }

    let usuarioEnBD = null

    const { data: idxRow } = await supabase
      .from('usuarios_por_matricula')
      .select('uid, matricula')
      .eq('matricula', matriculaNorm)
      .single()

    if (idxRow) {
      const { data: uRow } = await supabase
        .from('usuarios')
        .select('correo, activo, uid')
        .eq('matricula', matriculaNorm)
        .single()

      if (uRow) {
        usuarioEnBD = uRow
      }
    } else {
      const { data: usuarioPorMatricula } = await supabase
        .from('usuarios')
        .select('correo, activo, uid')
        .eq('matricula', matriculaNorm)
        .single()

      if (usuarioPorMatricula) {
        usuarioEnBD = usuarioPorMatricula
      }
    }

    if (!usuarioEnBD) {
      console.log(' Usuario autenticado pero no encontrado en BD, creando desde user_metadata...')

      const metadata = authData.user.user_metadata || {}
      const matriculaFromMetadata = metadata.matricula || matriculaNorm

      try {
        const { error: createError } = await supabase
          .from('usuarios')
          .upsert({
            uid: authData.user.id,
            nombre: metadata.nombre || '',
            apellidos: metadata.apellidos || '',
            matricula: matriculaFromMetadata,
            carrera: metadata.carrera || '',
            facultad: metadata.facultad || '',
            correo: authData.user.email,
            fechanacimiento: metadata.fechanacimiento || null,
            fecharegistro: new Date().toISOString(),
            ultimoacceso: new Date().toISOString(),
            activo: true
          }, { onConflict: 'uid' })

        if (createError) {
          console.error(' Error creando usuario:', createError)
        } else {
          await supabase
            .from('usuarios_por_matricula')
            .upsert({ uid: authData.user.id, matricula: matriculaFromMetadata }, { onConflict: 'matricula' })

          console.log(' Usuario creado exitosamente en BD')

          const { data: nuevoUsuario } = await supabase
            .from('usuarios')
            .select('correo, activo, uid')
            .eq('uid', authData.user.id)
            .single()

          if (nuevoUsuario) {
            usuarioEnBD = nuevoUsuario
          }
        }
      } catch (createErr) {
        console.error(' Error al crear usuario:', createErr)
      }
    }

    if (usuarioEnBD && usuarioEnBD.activo === false) {
      console.error(' Usuario inactivo en la base de datos')
      await supabase.auth.signOut()
      throw new Error('Tu cuenta ha sido desactivada. Contacta al administrador.')
    }

    if (usuarioEnBD && authData.user.id !== usuarioEnBD.uid) {
      console.error(' El UID no coincide con el de la base de datos')
      await supabase.auth.signOut()
      throw new Error('Error de autenticación. Por favor, intenta nuevamente.')
    }

    if (usuarioEnBD) {
      await supabase
        .from('usuarios')
        .update({ ultimoacceso: new Date().toISOString() })
        .eq('uid', authData.user.id)
    }

    await desbloquearCorreo(authData.user.email)

    console.log(' Login exitoso:', authData.user.id)
    return {
      success: true,
      user: authData.user,
      message: 'Sesión iniciada exitosamente'
    }

  } catch (error) {
    console.error(' Error en login:', error)
    throw error
  }
}

export const cerrarSesion = async () => {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw new Error(error.message)
    }

    return {
      success: true,
      message: 'Sesión cerrada exitosamente'
    }
  } catch (error) {
    console.error(' Error cerrando sesión:', error)
    throw error
  }
}

export const obtenerUsuarioActual = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      console.error(' Error obteniendo usuario:', error)
      return null
    }

    const { data: usuarioEnBD, error: bdError } = await supabase
      .from('usuarios')
      .select('uid, activo')
      .eq('uid', user.id)
      .single()

    if (!usuarioEnBD || bdError?.code === 'PGRST116') {
      console.error(' Usuario no encontrado en la base de datos')
      await supabase.auth.signOut()
      return null
    }

    if (usuarioEnBD.activo === false) {
      console.error(' Usuario inactivo en la base de datos')
      await supabase.auth.signOut()
      return null
    }

    return user
  } catch (error) {
    console.error(' Error obteniendo usuario:', error)
    return null
  }
}

export const obtenerTodosUsuarios = async (pagina = 1, limite = 50, busqueda = '') => {
  try {
    const limiteFinal = Math.min(limite, 1000)
    const desde = (pagina - 1) * limiteFinal
    const hasta = desde + limiteFinal - 1

    console.log(` Obteniendo usuarios (página ${pagina}, límite: ${limiteFinal})...`)

    let query = supabase
      .from('usuarios')
      .select('*', { count: 'exact' })
      .order('fecharegistro', { ascending: false })
      .range(desde, hasta)

    if (busqueda && busqueda.trim()) {
      const busquedaTrim = busqueda.trim()
      query = query.or(`nombre.ilike.%${busquedaTrim}%,apellidos.ilike.%${busquedaTrim}%,matricula.ilike.%${busquedaTrim}%,correo.ilike.%${busquedaTrim}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error(' Error obteniendo usuarios:', error)
      if (error.message.includes('permission') || error.message.includes('policy') || error.code === '42501') {
        console.error(' Error de permisos RLS. Necesitas crear una política para administradores.')
        throw new Error('No tienes permisos para ver usuarios. Verifica las políticas RLS en Supabase.')
      }
      throw new Error(error.message)
    }

    const totalPaginas = count ? Math.ceil(count / limiteFinal) : 1

    console.log(`Obtenidos ${data?.length || 0} usuarios de ${count || 0} totales`)
    return {
      usuarios: data || [],
      total: count || 0,
      pagina,
      totalPaginas,
      limite: limiteFinal
    }

  } catch (error) {
    console.error(' Error en obtenerTodosUsuarios:', error)
    throw error
  }
}

export const crearUsuarioAdmin = async (usuarioData) => {
  try {
    console.log(' Creando usuario desde admin...')

    const { data, error } = await supabase
      .from('usuarios')
      .insert({
        nombre: usuarioData.nombre,
        apellidos: usuarioData.apellidos,
        matricula: usuarioData.matricula,
        carrera: usuarioData.carrera,
        facultad: usuarioData.facultad,
        correo: usuarioData.correo,
        fechanacimiento: usuarioData.fechaNacimiento,
        fecharegistro: new Date().toISOString(),
        ultimoacceso: new Date().toISOString(),
        activo: true
      })
      .select()

    if (error) {
      console.error(' Error creando usuario:', error)
      throw new Error(error.message)
    }

    await supabase
      .from('usuarios_por_matricula')
      .insert({
        uid: data[0].uid,
        matricula: usuarioData.matricula
      })

    console.log(' Usuario creado desde admin')
    return {
      success: true,
      user: data[0],
      message: 'Usuario creado exitosamente'
    }

  } catch (error) {
    console.error(' Error en crearUsuarioAdmin:', error)
    throw error
  }
}

export const actualizarUsuarioAdmin = async (uid, usuarioData) => {
  try {
    console.log(' Actualizando usuario:', uid)

    const { data, error } = await supabase
      .from('usuarios')
      .update({
        nombre: usuarioData.nombre,
        apellidos: usuarioData.apellidos,
        matricula: usuarioData.matricula,
        carrera: usuarioData.carrera,
        facultad: usuarioData.facultad,
        correo: usuarioData.correo,
        fechanacimiento: usuarioData.fechaNacimiento,
        ultimoacceso: new Date().toISOString()
      })
      .eq('uid', uid)
      .select()

    if (error) {
      console.error(' Error actualizando usuario:', error)
      throw new Error(error.message)
    }

    await supabase
      .from('usuarios_por_matricula')
      .update({ matricula: usuarioData.matricula })
      .eq('uid', uid)

    console.log(' Usuario actualizado')
    return {
      success: true,
      user: data[0],
      message: 'Usuario actualizado exitosamente'
    }

  } catch (error) {
    console.error(' Error en actualizarUsuarioAdmin:', error)
    throw error
  }
}

export const eliminarUsuarioAdmin = async (uid) => {
  try {
    console.log(' Eliminando usuario:', uid)

    await supabase
      .from('usuarios_por_matricula')
      .delete()
      .eq('uid', uid)

    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('uid', uid)

    if (error) {
      console.error(' Error eliminando usuario:', error)
      throw new Error(error.message)
    }

    console.log(' Usuario eliminado')
    return {
      success: true,
      message: 'Usuario eliminado exitosamente'
    }

  } catch (error) {
    console.error(' Error en eliminarUsuarioAdmin:', error)
    throw error
  }
}

export const obtenerUsuarioPorUID = async (uid) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('uid', uid)
      .single()

    if (error) {
      console.error(' Error obteniendo usuario:', error)
      return null
    }

    return data
  } catch (error) {
    console.error(' Error en obtenerUsuarioPorUID:', error)
    return null
  }
}
