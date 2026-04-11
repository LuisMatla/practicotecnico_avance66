import React, { useState, useEffect, useRef, useCallback } from 'react'; //importa react y hooks.
import { useNavigate } from 'react-router-dom'; //importa navegacion para redireccionar.
import { //importa servicios de chat para sesiones y mensajes.
  crearSesionChat, //crea una sesion.
  obtenerSesionActiva, //obtiene la sesion activa.
  obtenerTodasSesiones, //lista sesiones del usuario.
  agregarMensaje, //guarda un mensaje en bd.
  obtenerMensajes, //carga mensajes de una sesion.
  guardarConsulta, //guarda consulta en historial.
  eliminarSesion //elimina una sesion.
} from '../servicios/chatService'; //ruta del servicio de chat.
import { enviarMensajeRasa } from '../servicios/rasaService'; //envia un mensaje al bot.
import { obtenerUsuarioActual, cerrarSesion } from '../servicios/supabase'; //autenticacion y salida.
import { supabase } from '../supabase/config'; //cliente supabase.
import './ChatUsuario.css'; //estilos del chat.

const ChatUsuario = ({ modoAdmin = false }) => { //define el componente y recibe modo admin.
  const [mensajes, setMensajes] = useState([]); //estado de mensajes renderizados.
  const [nuevoMensaje, setNuevoMensaje] = useState(''); //estado del input.
  const [sesionId, setSesionId] = useState(null); //estado de sesion activa.
  const [cargando, setCargando] = useState(false); //estado de carga general.
  const [cargandoInicial, setCargandoInicial] = useState(true); //estado de carga inicial.
  const [usuario, setUsuario] = useState(null); //estado del usuario actual.
  const [sesiones, setSesiones] = useState([]); //estado de lista de sesiones.
  const [mostrarAjustes, setMostrarAjustes] = useState(false); //muestra u oculta ajustes.
  const [temaOscuro, setTemaOscuro] = useState(() => { //estado del tema con inicializador.
    const temaGuardado = localStorage.getItem('temaOscuro'); //lee preferencia guardada.
    return temaGuardado === 'true'; //convierte a boolean.
  });
  const [sidebarVisible, setSidebarVisible] = useState(true); //controla visibilidad de sidebar.
  const [menuAbierto, setMenuAbierto] = useState(null); //controla menu contextual por sesion.
  const [sesionEliminando, setSesionEliminando] = useState(null); //marca sesion en eliminacion.
  const mensajesEndRef = useRef(null); //referencia al final del listado.
  const navigate = useNavigate(); //funcion para navegar rutas.

  const inicializarChat = useCallback(async () => { //inicializa usuario, sesion y mensajes.
    const inicioCarga = Date.now(); //marca el inicio para animacion minima.
    try { //inicia bloque protegido.
      setCargando(true); //activa indicador de carga.
      const user = await obtenerUsuarioActual(); //obtiene usuario autenticado.
      if (!user) { //valida sesion.
        navigate(modoAdmin ? '/admin-login' : '/'); //redirige segun modo.
        return; //corta la inicializacion.
      }

      const { data: usuarioDb, error: errorUsuario } = await supabase //consulta datos extra del usuario.
        .from('usuarios') //tabla de usuarios.
        .select('*') //selecciona columnas.
        .eq('uid', user.id) //filtra por uid.
        .single(); //espera un registro.

      let usuarioData; //declara contenedor final del usuario.

      if (modoAdmin) { //si es modo admin.
        if (usuarioDb && !errorUsuario) { //usa datos de bd si existen.
          usuarioData = usuarioDb; //asigna datos de bd.
        } else { //si no hay datos validos.
          usuarioData = {
            uid: user.id,
            matricula: 'ADMIN',
            nombre: 'Administrador',
            apellidos: 'BiTBoT',
            correo: user.email || 'admin@bitbotfiee.xyz',
            carrera: 'FIEE',
            facultad: 'Facultad de Ingenieria',
            fechanacimiento: '',
            activo: true
          };
        }
      } else { //si es modo usuario.
        if (errorUsuario) { //si hubo error en consulta.
          console.error('Error obteniendo datos del usuario:', errorUsuario); //log de error.
          return; //corta inicializacion.
        }
        if (!usuarioDb) { //si no encontro usuario.
          return; //corta inicializacion.
        }
        usuarioData = usuarioDb; //asigna datos de bd.
      }

      setUsuario(usuarioData); //guarda usuario en estado.

      const resultadoSesiones = await obtenerTodasSesiones(user.id, 50, 0); //carga sesiones recientes.
      setSesiones(resultadoSesiones.sesiones || []); //guarda sesiones o arreglo vacio.

      let sesion = await obtenerSesionActiva(user.id); //obtiene sesion activa.
      if (!sesion) { //si no hay sesion activa.
        try { //intenta crear sesion.
          sesion = await crearSesionChat(user.id, usuarioData.matricula); //crea sesion nueva.
          if (!sesion || !sesion.id) { //valida sesion creada.
            throw new Error('No se pudo crear la sesion de chat'); //lanza error.
          }
          const sesionesActualizadas = await obtenerTodasSesiones(user.id, 50, 0); //refresca lista.
          setSesiones(sesionesActualizadas.sesiones || []); //actualiza sesiones en estado.
        } catch (errorSesion) { //captura error de sesion.
          console.error('Error creando sesion:', errorSesion); //log del error.
          throw new Error(`Error al crear sesion de chat: ${errorSesion.message}`); //eleva error con detalle.
        }
      }
      
      if (!sesion || !sesion.id) { //valida que exista sesion final.
        throw new Error('No se pudo obtener o crear la sesion de chat'); //lanza error.
      }
      
      setSesionId(sesion.id); //establece sesion activa en estado.

      const resultadoMensajes = await obtenerMensajes(sesion.id, 100, 0); //carga mensajes de la sesion.
      const mensajesExistentes = resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes) //valida estructura.
        ? resultadoMensajes.mensajes //usa mensajes recibidos.
        : []; //usa arreglo vacio si no es valido.
      
      if (mensajesExistentes.length > 0) { //si hay mensajes previos.
        setMensajes(mensajesExistentes); //carga mensajes en estado.
      } else { //si no hay mensajes.
        setMensajes([]); //inicia sin mensajes.
      }
    } catch (error) { //captura fallos de inicializacion.
      console.error('Error al inicializar el chat:', error); //log del error.
    } finally { //siempre se ejecuta al final.
      const tiempoTranscurrido = Date.now() - inicioCarga; //calcula duracion.
      const tiempoRestante = Math.max(0, 2800 - tiempoTranscurrido); //aplica minimo de espera.
      setTimeout(() => { //difere el fin de la carga.
      setCargando(false); //desactiva cargando.
        setCargandoInicial(false); //desactiva carga inicial.
      }, tiempoRestante); //usa el tiempo restante.
    }
  }, [navigate, modoAdmin]); //dependencias del callback.

  useEffect(() => { //montaje o cambio de inicializar chat.
    inicializarChat(); //ejecuta la carga inicial del chat.
  }, [inicializarChat]); //depende del callback memoizado.

  useEffect(() => { //sincroniza el titulo del documento con el modo.
    const tituloOriginal = document.title; //guarda el titulo previo.
    document.title = modoAdmin ? 'BITBOT Admin' : 'BITBOT'; //aplica titulo segun modo.
    return () => { //limpia al desmontar o al cambiar modo.
      document.title = tituloOriginal; //restaura el titulo original.
    };
  }, [modoAdmin]); //depende del modo admin.

  useEffect(() => { //sincroniza scroll con nuevos mensajes.
    scrollToBottom(); //baja al final del listado.
  }, [mensajes]); //depende del arreglo de mensajes.

  const scrollToBottom = () => { //mueve el scroll al ultimo mensaje.
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" }); //scroll suave al ancla final.
  };

  const enviarMensaje = async (e) => { //envia mensaje del usuario y procesa respuesta del bot.
    e.preventDefault(); //evita recarga del formulario.
    
    if (!nuevoMensaje.trim() || !sesionId) return; //valida texto y sesion activa.

    const mensajeUsuario = nuevoMensaje.trim(); //texto limpio del usuario.
    setNuevoMensaje(''); //limpia el input de inmediato.

    try { //flujo principal de envio.
      const nuevoMensajeUsuario = { //objeto temporal para mostrar en ui.
        id: `temp-${Date.now()}`, //id temporal unico.
        sesionId: sesionId, //id de sesion actual.
        userId: usuario.uid, //uid del usuario.
        matricula: usuario.matricula, //matricula del usuario.
        mensaje: mensajeUsuario, //contenido del mensaje.
        tipo: 'usuario', //marca como mensaje de usuario.
        timestamp: new Date().toISOString() //marca de tiempo iso.
      };

      setMensajes(prev => [...prev, nuevoMensajeUsuario]); //agrega mensaje del usuario al estado.
      
      setCargando(true); //activa indicador de espera.

      try { //intenta persistir el mensaje del usuario.
        await agregarMensaje(sesionId, usuario.uid, usuario.matricula, mensajeUsuario, 'usuario'); //inserta en bd.
      } catch (errorDB) { //si falla bd no detiene el flujo.
        console.warn(' Error al guardar mensaje del usuario en BD (continuando):', errorDB); //aviso en consola.
      }
      
      let respuestaBot; //texto de respuesta del bot.
      try { //llama al servicio de rasa.
        respuestaBot = await enviarMensajeRasa(mensajeUsuario, usuario.uid); //envia al webhook de rasa.
        if (!respuestaBot || respuestaBot.trim() === '') { //valida respuesta no vacia.
          throw new Error('Rasa no devolvió una respuesta válida'); //fuerza error si viene vacio.
        }
      } catch (errorRasa) { //captura fallo de rasa.
        console.error('Error al obtener respuesta de Rasa:', errorRasa); //log del error de rasa.
        throw new Error(`Error al comunicarse con Rasa: ${errorRasa.message || 'Error desconocido'}`); //propaga error claro.
      }
      
      const nuevoMensajeBot = { //objeto temporal del mensaje del bot.
        id: `temp-${Date.now() + 1}`, //id temporal distinto al del usuario.
        sesionId: sesionId, //id de sesion actual.
        userId: usuario.uid, //uid del usuario propietario de la sesion.
        matricula: usuario.matricula, //matricula del usuario.
        mensaje: respuestaBot, //texto devuelto por rasa.
        tipo: 'bot', //marca como mensaje del bot.
        timestamp: new Date().toISOString() //marca de tiempo iso.
      };

      setMensajes(prev => [...prev, nuevoMensajeBot]); //agrega respuesta del bot al estado.
      
      try { //intenta persistir la respuesta del bot.
        await agregarMensaje(sesionId, usuario.uid, usuario.matricula, respuestaBot, 'bot'); //inserta en bd.
      } catch (errorDB) { //si falla bd no detiene el flujo.
        console.warn(' Error al guardar mensaje del bot en BD (continuando):', errorDB); //aviso en consola.
      }

      try { //guarda la consulta en el historial resumido.
        await guardarConsulta( //persiste pregunta y respuesta.
          usuario.uid, //uid del usuario.
          usuario.matricula, //matricula del usuario.
          mensajeUsuario, //pregunta del usuario.
          respuestaBot, //respuesta del bot.
          'general' //categoria fija por ahora.
        );
      } catch (errorHistorial) { //si falla historial no detiene el flujo.
        console.warn(' Error al guardar en historial (continuando):', errorHistorial); //aviso en consola.
      }

      const resultadoMensajes = await obtenerMensajes(sesionId, 100, 0); //recarga mensajes desde bd.
      if (resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes)) { //valida estructura.
        setMensajes(resultadoMensajes.mensajes); //sincroniza estado con bd.
      } else { //si la respuesta no es valida.
        console.warn(' Mensajes actualizados no son un array válido'); //aviso en consola.
      }

      if (usuario) { //si hay usuario en memoria.
        const resultadoSesiones = await obtenerTodasSesiones(usuario.uid, 50, 0); //actualiza lista de sesiones.
        setSesiones(resultadoSesiones.sesiones || []); //guarda sesiones o arreglo vacio.
      }

    } catch (error) { //captura errores del flujo principal.
      console.error('Error completo al enviar mensaje:', error); //log del error completo.
    } finally { //siempre apaga el indicador de carga.
      setCargando(false); //desactiva estado cargando.
    }
  };
  
  const cambiarSesion = async (nuevaSesionId) => { //cambia la sesion activa y carga sus mensajes.
    if (nuevaSesionId === sesionId) return; //evita recarga si ya es la misma sesion.
    
    try { //carga mensajes de la sesion seleccionada.
      setCargando(true); //activa indicador de carga.
      setSesionId(nuevaSesionId); //actualiza sesion activa en estado.
      
      const resultadoMensajes = await obtenerMensajes(nuevaSesionId, 100, 0); //obtiene mensajes de la sesion.
      if (resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes)) { //valida estructura.
        setMensajes(resultadoMensajes.mensajes); //sincroniza mensajes.
      } else { //si la respuesta no es valida.
        console.warn(' Mensajes de nueva sesión no son un array válido'); //aviso en consola.
        setMensajes([]); //limpia mensajes en estado.
      }
      
    } catch (error) { //captura errores del cambio de sesion.
    } finally { //siempre apaga el indicador de carga.
      setCargando(false); //desactiva estado cargando.
    }
  };

  const crearNuevaSesion = async () => { //crea una nueva sesion y la establece como activa.
    try { //flujo de creacion de sesion.
      setCargando(true); //activa indicador de carga.
      const nuevaSesion = await crearSesionChat(usuario.uid, usuario.matricula); //crea nueva sesion en bd.
      
      const resultadoSesiones = await obtenerTodasSesiones(usuario.uid, 50, 0); //actualiza lista de sesiones.
      setSesiones(resultadoSesiones.sesiones || []); //guarda sesiones o arreglo vacio.
      
      setSesionId(nuevaSesion.id); //selecciona la nueva sesion.
      setMensajes([]); //limpia mensajes antes de recargar.
      
      const resultadoMensajes = await obtenerMensajes(nuevaSesion.id, 100, 0); //carga mensajes de la nueva sesion.
      if (resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes)) { //valida estructura.
        setMensajes(resultadoMensajes.mensajes); //sincroniza mensajes.
      } else { //si la respuesta no es valida.
        console.warn(' Mensajes de nueva sesión no son un array válido'); //aviso en consola.
        setMensajes([]); //limpia mensajes en estado.
      }
      
    } catch (error) { //captura errores del flujo de creacion.
    } finally { //siempre apaga el indicador de carga.
      setCargando(false); //desactiva estado cargando.
    }
  };

  const obtenerPreviewMensaje = (sesion) => { //genera texto corto para la lista lateral.
    if (sesion.totalMensajes && sesion.totalMensajes > 0) { //si hay mensajes registrados.
      const preview = `Conversación #${sesion.id}`; //texto de vista previa.
      return preview.length > 30 ? preview.substring(0, 30) + '...' : preview; //trunca si es muy largo.
    }
    return 'Nueva conversación'; //texto por defecto para sesion vacia.
  };

  const manejarEliminarSesion = async (sesionIdAEliminar, e) => { //elimina una sesion y reacomoda la activa.
    e.stopPropagation(); //evita que el click dispare el cambio de sesion.

    try { //flujo de eliminacion.
      setSesionEliminando(sesionIdAEliminar); //marca sesion en proceso de borrado.
      setMenuAbierto(null); //oculta menu contextual.
      
      const user = await obtenerUsuarioActual(); //obtiene usuario autenticado.
      if (!user) { //valida sesion.
        throw new Error('Usuario no autenticado'); //fuerza error si no hay usuario.
      }

      await eliminarSesion(sesionIdAEliminar, user.id); //borra en bd.

      if (sesionIdAEliminar === sesionId) { //si se borro la sesion actual.
        const sesionesRestantes = sesiones.filter(s => s.id !== sesionIdAEliminar); //filtra sesiones restantes.
        if (sesionesRestantes.length > 0) { //si queda alguna sesion.
          await cambiarSesion(sesionesRestantes[0].id); //salta a la primera disponible.
        } else { //si no quedan sesiones.
          await crearNuevaSesion(); //crea una nueva para evitar estado vacio.
        }
      }

      const resultadoSesiones = await obtenerTodasSesiones(user.id, 50, 0); //refresca lista de sesiones.
      setSesiones(resultadoSesiones.sesiones || []); //actualiza estado en ui.
    } catch (error) { //captura errores de eliminacion.
      console.error('Error eliminando sesión:', error); //log del error.
    } finally { //siempre limpia el estado de borrado.
      setSesionEliminando(null); //quita marca de bloqueo.
    }
  };

  useEffect(() => { //escucha clicks globales para el menu contextual.
    if (!menuAbierto) return; //no registra listeners si no hay menu abierto.

    const handleClickOutside = (event) => { //maneja click fuera del menu.
      if (!event.target.closest('.chat-item-menu') && !event.target.closest('.chat-item-menu-panel')) { //click fuera de controles.
        setMenuAbierto(null); //oculta menu.
      }
    };

    document.addEventListener('mousedown', handleClickOutside); //registra listener.
    return () => { //limpia al desmontar o al cambiar estado.
      document.removeEventListener('mousedown', handleClickOutside); //elimina listener.
    };
  }, [menuAbierto]); //depende del estado del menu.

  const toggleTema = () => { //alterna tema claro u oscuro y lo persiste.
    const nuevoTema = !temaOscuro; //invierte booleano.
    setTemaOscuro(nuevoTema); //actualiza estado.
    localStorage.setItem('temaOscuro', nuevoTema.toString()); //guarda preferencia en localstorage.
  };

  const manejarCerrarSesion = async () => { //logout del usuario y redireccion al inicio.
    try { //flujo de salida.
      setCargando(true); //activa indicador de carga.
      await cerrarSesion(); //ejecuta logout en supabase.
      navigate('/'); //vuelve al login o home.
    } catch (error) { //captura fallos de logout.
      console.error('Error al cerrar sesión:', error); //log del error.
    } finally { //siempre apaga el indicador de carga.
      setCargando(false); //desactiva estado cargando.
    }
  };

  const obtenerLogoUV = () => { //elige logo uv segun tema.
    return temaOscuro ? '/logouvn.png' : '/logouvb.png'; //ruta oscura o clara.
  };

  const obtenerLogoMult = () => { //elige icono multiuso segun tema.
    return temaOscuro ? '/multn.png' : '/multb.png'; //ruta oscura o clara.
  };

  const obtenerLogoBitbot = () => { //elige logo bitbot segun tema.
    return temaOscuro ? '/bitbot-logonegro.png' : '/bitbot-logoblanco.png'; //ruta oscura o clara.
  };

  if (cargandoInicial) { //muestra pantalla de carga mientras inicializa.
    return ( //render temprano de carga.
      <div className="chat-cargando"> //contenedor centrado de carga.
        <img 
          src={process.env.PUBLIC_URL + '/bitbotv.gif'} //gif animado de carga.
          alt="Cargando..." //texto accesible.
          className="video-carga" //clase css para estilo.
        />
      </div>
    );
  }

  return ( //render principal del chat.
    <div className={`chat-usuario ${temaOscuro ? 'tema-oscuro' : 'tema-claro'}`}> //contenedor raiz con clase de tema.
      <div className={`chat-sidebar ${sidebarVisible ? '' : 'sidebar-oculto'}`}> //barra lateral de sesiones.
        <div //bloque de marca en sidebar.
          className="sidebar-logo" //estilo del area de logo.
          onClick={() => setSidebarVisible(true)} //vuelve a mostrar sidebar si estaba colapsada.
          style={{ cursor: sidebarVisible ? 'default' : 'pointer' }} //cursor segun visibilidad.
        > //fin atributos logo sidebar.
          <img 
            src={process.env.PUBLIC_URL + obtenerLogoBitbot()} //logo bitbot segun tema.
            alt="BiTBoT Logo" //texto alterno de imagen.
            className="logo-imgagen" //clase css del logo.
          />
          <div className="logo-nombre">BITBOT</div> //titulo de marca.
        </div> //fin bloque logo.
        
        <div className="sidebar-menu"> //zona del boton nuevo chat.
          <button 
            className="sidebar-boton nuevo-chat" //estilo del boton.
            onClick={crearNuevaSesion} //crea sesion nueva.
          > //fin atributos boton.
            <img 
              src={process.env.PUBLIC_URL + obtenerLogoMult()} //icono segun tema.
              alt="Logo" //texto alterno.
              className="sidebar-imagen" //clase css.
            />
            <span>Nuevo chat</span> //etiqueta visible.
          </button>
        </div>

        <div className="sidebar-zona"> //lista de chats.
          <div className="sidebar-header">Chats</div> //titulo de seccion.
          <div className="chats-lista"> //contenedor scroll de items.
            {sesiones.length === 0 ? ( //si no hay sesiones.
              <div className="chats-vacio"> //estado vacio.
                <p>No hay chats aún</p> //mensaje principal.
                <p className="chats-vacio-ayuda">Crea un nuevo chat para comenzar</p> //mensaje de ayuda.
              </div>
            ) : ( //si hay sesiones.
              sesiones.map((sesion) => ( //itera cada sesion.
                <div
                  key={sesion.id} //clave estable por id.
                  className={`chat-item-container ${sesion.id === sesionId ? 'chat-item-actual' : ''}`} //resalta la activa.
                > //fin atributos contenedor item.
                  <button
                    className={`chat-item ${sesion.id === sesionId ? 'chat-item-actual' : ''}`} //boton seleccionable.
                    onClick={() => cambiarSesion(sesion.id)} //cambia a esta sesion.
                  > //fin atributos boton item.
                    <div className="chat-item-icono"></div> //icono decorativo.
                    <div className="chat-item-etiqueta"> //textos del item.
                      <div className="chat-item-titulo"> //linea principal.
                        {obtenerPreviewMensaje(sesion)} //preview generado.
                      </div>
                      <div className="chat-item-fecha"> //linea secundaria.
                        {new Date(sesion.ultimaActividad || sesion.fechaCreacion).toLocaleDateString('es-ES', { //fecha corta.
                          day: 'numeric', //dia numerico.
                          month: 'short' //mes en texto corto.
                        })}
                      </div>
                    </div>
                  </button>
                  
                  <div className="chat-item-menu"> //menu de tres puntos.
                    <button
                      className="chat-item-menu-boton" //boton del menu.
                      onClick={(e) => { //toggle del panel de opciones.
                        e.stopPropagation(); //evita seleccionar sesion.
                        setMenuAbierto(menuAbierto === sesion.id ? null : sesion.id); //alterna menu de esta sesion.
                      }}
                      title="Opciones" //tooltip.
                    > //fin atributos boton menu.
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> //icono svg menu.
                        <circle cx="12" cy="5" r="2" fill="currentColor"/> //punto superior.
                        <circle cx="12" cy="12" r="2" fill="currentColor"/> //punto medio.
                        <circle cx="12" cy="19" r="2" fill="currentColor"/> //punto inferior.
                      </svg>
                    </button>
                    
                    {menuAbierto === sesion.id && ( //panel solo si menu abierto.
                      <div className="chat-item-menu-panel"> //contenedor flotante.
                        <button
                          className="chat-item-menu-opcion" //estilo de opcion.
                          onClick={(e) => manejarEliminarSesion(sesion.id, e)} //elimina sesion.
                          disabled={sesionEliminando === sesion.id} //bloquea si ya se esta borrando.
                        > //fin atributos boton eliminar.
                          {sesionEliminando === sesion.id ? 'Eliminando...' : 'Eliminar chat'} //texto segun estado.
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className={`chat-main ${sidebarVisible ? '' : 'chat-main-expandido'}`}> //area principal de conversacion.
        {sidebarVisible && ( //boton colapsar sidebar.
          <button 
            className="boton-triangulo" //estilo flecha.
            onClick={() => setSidebarVisible(false)} //oculta sidebar.
            aria-label="Ocultar historial de chats" //accesibilidad.
            title="Ocultar historial" //tooltip.
          > //fin atributos boton.
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> //icono flecha.
              <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/> //trazo de flecha.
            </svg>
          </button>
        )}
        
        {!sidebarVisible && ( //barra fina cuando sidebar oculto.
          <div className="linea-divisoria"> //contenedor divisor.
            <div className="linea-divisoria-contenido"> //contenido centrado.
              <div 
                className="linea-divisoria-logo" //area clicable para expandir.
                onClick={() => setSidebarVisible(true)} //muestra sidebar.
                title="Mostrar historial de chats" //tooltip.
              > //fin atributos.
                <img 
                  src={process.env.PUBLIC_URL + obtenerLogoBitbot()} //logo pequeno.
                  alt="BiTBoT Logo" //texto alterno.
                  className="logo-img-divisoria" //clase css.
                />
              </div>
            </div>
          </div>
        )}

        <div className="chat-main-header"> //cabecera del chat principal.
          <div className="header-icon"> //contenedor del logo uv.
            <img 
              src={process.env.PUBLIC_URL + obtenerLogoUV()} //logo universidad segun tema.
              alt="Logo UV" //texto alterno.
              className="header-logo-uv" //clase css.
            />
          </div>
          <div className="header-info"> //titulos del encabezado.
            <h1 className="header-titulo">Secretaría Universitaria FIEE</h1> //titulo institucional.
            <p className="header-subtitulo">Asistente virtual - Atención para estudiantes</p> //subtitulo.
          </div>
          <div className="header-ajustes-container"> //area de engrane y panel lateral.
            <button 
              className="ajustes-boton" //boton que muestra u oculta ajustes.
              onClick={() => setMostrarAjustes(!mostrarAjustes)} //alterna panel de ajustes.
              aria-label="Ajustes" //etiqueta accesible.
            > //fin atributos boton engrane.
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> //icono engrane svg.
                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> //circulo central del engrane.
                <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.74198 9.96512 4.01128 9.77251C4.28057 9.5799 4.48571 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.80618 14.2743 4.07447C14.452 4.34276 14.7042 4.55324 15 4.68C15.3016 4.81312 15.6362 4.85282 15.9606 4.794C16.285 4.73519 16.5843 4.58054 16.82 4.35L16.88 4.29C17.0657 4.10405 17.2863 3.95653 17.5291 3.85588C17.7719 3.75523 18.0322 3.70343 18.295 3.70343C18.5578 3.70343 18.8181 3.75523 19.0609 3.85588C19.3037 3.95653 19.5243 4.10405 19.71 4.29C19.896 4.47575 20.0435 4.69632 20.1441 4.93912C20.2448 5.18192 20.2966 5.44217 20.2966 5.705C20.2966 5.96783 20.2448 6.22808 20.1441 6.47088C20.0435 6.71368 19.896 6.93425 19.71 7.12L19.65 7.18C19.4195 7.41568 19.2648 7.71502 19.206 8.03941C19.1472 8.36381 19.1869 8.69838 19.32 9V9.08C19.4468 9.37577 19.6572 9.62802 19.9255 9.80569C20.1938 9.98337 20.5082 10.0787 20.83 10.08H21C21.5304 10.08 22.0391 10.2907 22.4142 10.6658C22.7893 11.0409 23 11.5496 23 12.08C23 12.6104 22.7893 13.1191 22.4142 13.4942C22.0391 13.8693 21.5304 14.08 21 14.08H20.91C20.5882 14.0813 20.2738 14.1766 20.0055 14.3543C19.7372 14.532 19.5268 14.7842 19.4 15.08V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> //trazos externos del engrane.
              </svg>
            </button>
            
            <div className={`panel-ajustes ${mostrarAjustes ? 'panel-ajustes-abierto' : ''}`}> //panel lateral de ajustes.
              <div className="panel-ajustes-header"> //encabezado del panel.
                <h3>Ajustes</h3> //titulo del panel.
                <button 
                  className="cerrar-ajustes-boton" //boton vacio para icono css.
                  onClick={() => setMostrarAjustes(false)} //oculta panel de ajustes.
                  aria-label="Cerrar ajustes" //accesibilidad.
                > //fin atributos boton x.
                </button>
              </div>
              <div className="panel-ajustes-contenido"> //cuerpo del panel.
                <div className="ajuste-item"> //bloque de tema.
                  <label className="ajuste-label"> //etiqueta con toggle.
                    <span>Tema Oscuro</span> //texto del toggle.
                    <div className="toggle-switch"> //contenedor del switch.
                      <input
                        type="checkbox" //checkbox nativo.
                        checked={temaOscuro} //valor controlado.
                        onChange={toggleTema} //manejador de cambio.
                      />
                      <span className="toggle-slider"></span> //slider visual.
                    </div>
                  </label>
                  <p className="ajuste-descripcion"> //texto de ayuda.
                    Cambia entre tema claro y oscuro
                  </p>
                </div>
                
                <div className="ajuste-item ajuste-item-separador"> //bloque de salida.
                  <button 
                    className="cerrar-sesion-boton" //boton de logout.
                    onClick={manejarCerrarSesion} //ejecuta logout.
                    disabled={cargando} //evita doble click mientras carga.
                  > //fin atributos boton logout.
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> //icono salida.
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path> //contorno de puerta.
                      <polyline points="16 17 21 12 16 7"></polyline> //flecha de salida.
                      <line x1="21" y1="12" x2="9" y2="12"></line> //linea horizontal.
                    </svg>
                    <span>Cerrar Sesión</span> //texto visible.
                  </button>
                  <p className="ajuste-descripcion"> //ayuda del boton logout.
                    Cierra tu sesión y regresa a la página de inicio
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mensajes-contenedor"> //lista de burbujas de mensajes.
          {mensajes && mensajes.length > 0 ? ( //si hay mensajes para mostrar.
            mensajes.map((mensaje, index) => { //itera cada mensaje.
              const mensajeTexto = mensaje.mensaje || mensaje.message || ''; //texto con fallback de campos.
              const mensajeTipo = mensaje.tipo || mensaje.type || 'bot'; //tipo con fallback.
              const mensajeTimestamp = mensaje.timestamp || mensaje.created_at || new Date().toISOString(); //fecha con fallback.
              
              return ( //fila de mensaje.
                <div 
                  key={mensaje.id || `mensaje-${index}-${mensajeTimestamp}`} //clave estable.
                  className={`mensaje ${mensajeTipo === 'usuario' ? 'mensaje-usuario' : 'mensaje-bot'}`} //estilo por rol.
                > //fin atributos burbuja.
                  <div className="mensaje-contenido"> //layout interno.
                    <div className="mensaje-texto"> //cuerpo del texto.
                      {mensajeTexto} //contenido renderizado.
                    </div>
                    <div className="mensaje-timestamp"> //hora del mensaje.
                      {new Date(mensajeTimestamp).toLocaleTimeString('es-ES', { //hora local.
                        hour: '2-digit', //hora con dos digitos.
                        minute: '2-digit' //minuto con dos digitos.
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          ) : ( //estado sin mensajes.
            <div className="mensajes-vacios"> //mensaje vacio.
              <p>No hay mensajes aún. ¡Comienza la conversación!</p> //texto guia.
            </div>
          )}
          {cargando && ( //indicador de escritura mientras espera respuesta.
            <div className="mensaje mensaje-bot"> //burbuja tipo bot.
              <div className="mensaje-contenido"> //layout interno.
                <div className="mensaje-texto"> //contenedor del indicador.
                  <div className="typing-indicator"> //animacion de puntos.
                    <span></span> //punto 1.
                    <span></span> //punto 2.
                    <span></span> //punto 3.
                  </div>
                </div>
              </div>
            </div>
          )}
          
          
          <div ref={mensajesEndRef} /> //ancla invisible para scroll automatico.
        </div>

        <form className="chat-formulario" onSubmit={enviarMensaje}> //formulario de envio.
          <input
            type="text" //campo de texto.
            value={nuevoMensaje} //valor controlado.
            onChange={(e) => setNuevoMensaje(e.target.value)} //actualiza estado al escribir.
            placeholder="Escribe tu consulta aquí..." //placeholder.
            disabled={cargando} //deshabilita mientras carga.
            className="mensaje-input" //clase css.
          />
          <button 
            type="submit" //envio del formulario.
            disabled={cargando || !nuevoMensaje.trim()} //deshabilita si vacio o cargando.
            className="enviar-boton" //clase css.
          > //fin atributos boton enviar.
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> //icono avion de papel.
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> //trazo del icono.
            </svg>
          </button>
        </form>
      </div>

    </div>
  );
};

export default ChatUsuario; //export default del componente.