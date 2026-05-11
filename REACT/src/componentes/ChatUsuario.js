import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  crearSesionChat,
  obtenerSesionActiva,
  obtenerTodasSesiones,
  agregarMensaje,
  obtenerMensajes,
  guardarConsulta,
  eliminarSesion
} from '../servicios/chatService';
import { enviarMensajeRasa } from '../servicios/rasaService';
import { obtenerUsuarioActual, cerrarSesion } from '../servicios/supabase';
import { supabase } from '../supabase/config';
import './ChatUsuario.css';

const ChatUsuario = ({ modoAdmin = false }) => {
  const [mensajes, setMensajes] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [sesionId, setSesionId] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [temaOscuro, setTemaOscuro] = useState(() => {
    const temaGuardado = localStorage.getItem('temaOscuro');
    return temaGuardado === 'true';
  });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [sesionEliminando, setSesionEliminando] = useState(null);
  const mensajesEndRef = useRef(null);
  const navigate = useNavigate();

  const inicializarChat = useCallback(async () => {
    const inicioCarga = Date.now();
    try {
      setCargando(true);
      const user = await obtenerUsuarioActual();
      if (!user) {
        navigate(modoAdmin ? '/admin-login' : '/');
        return;
      }

      const { data: usuarioDb, error: errorUsuario } = await supabase
        .from('usuarios')
        .select('*')
        .eq('uid', user.id)
        .single();

      let usuarioData;

      if (modoAdmin) {
        if (usuarioDb && !errorUsuario) {
          usuarioData = usuarioDb;
        } else {
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
      } else {
        if (errorUsuario) {
          console.error('Error obteniendo datos del usuario:', errorUsuario);
          return;
        }
        if (!usuarioDb) {
          return;
        }
        usuarioData = usuarioDb;
      }

      setUsuario(usuarioData);

      const resultadoSesiones = await obtenerTodasSesiones(user.id, 50, 0);
      setSesiones(resultadoSesiones.sesiones || []);

      let sesion = await obtenerSesionActiva(user.id);
      if (!sesion) {
        try {
          sesion = await crearSesionChat(user.id, usuarioData.matricula);
          if (!sesion || !sesion.id) {
            throw new Error('No se pudo crear la sesion de chat');
          }
          const sesionesActualizadas = await obtenerTodasSesiones(user.id, 50, 0);
          setSesiones(sesionesActualizadas.sesiones || []);
        } catch (errorSesion) {
          console.error('Error creando sesion:', errorSesion);
          throw new Error(`Error al crear sesion de chat: ${errorSesion.message}`);
        }
      }

      if (!sesion || !sesion.id) {
        throw new Error('No se pudo obtener o crear la sesion de chat');
      }

      setSesionId(sesion.id);

      const resultadoMensajes = await obtenerMensajes(sesion.id, 100, 0);
      const mensajesExistentes = resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes)
        ? resultadoMensajes.mensajes
        : [];

      if (mensajesExistentes.length > 0) {
        setMensajes(mensajesExistentes);
      } else {
        setMensajes([]);
      }
    } catch (error) {
      console.error('Error al inicializar el chat:', error);
    } finally {
      const tiempoTranscurrido = Date.now() - inicioCarga;
      const tiempoRestante = Math.max(0, 2800 - tiempoTranscurrido);
      setTimeout(() => {
      setCargando(false);
        setCargandoInicial(false);
      }, tiempoRestante);
    }
  }, [navigate, modoAdmin]);

  useEffect(() => {
    inicializarChat();
  }, [inicializarChat]);

  useEffect(() => {
    const tituloOriginal = document.title;
    document.title = modoAdmin ? 'BITBOT Admin' : 'BITBOT';
    return () => {
      document.title = tituloOriginal;
    };
  }, [modoAdmin]);

  useEffect(() => {
    scrollToBottom();
  }, [mensajes]);

  const scrollToBottom = () => {
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const enviarMensaje = async (e) => {
    e.preventDefault();

    if (!nuevoMensaje.trim() || !sesionId) return;

    const mensajeUsuario = nuevoMensaje.trim();
    setNuevoMensaje('');

    try {
      const nuevoMensajeUsuario = {
        id: `temp-${Date.now()}`,
        sesionId: sesionId,
        userId: usuario.uid,
        matricula: usuario.matricula,
        mensaje: mensajeUsuario,
        tipo: 'usuario',
        timestamp: new Date().toISOString()
      };

      setMensajes(prev => [...prev, nuevoMensajeUsuario]);

      setCargando(true);

      try {
        await agregarMensaje(sesionId, usuario.uid, usuario.matricula, mensajeUsuario, 'usuario');
      } catch (errorDB) {
        console.warn(' Error al guardar mensaje del usuario en BD (continuando):', errorDB);
      }

      let respuestaBot;
      try {
        respuestaBot = await enviarMensajeRasa(mensajeUsuario, usuario.uid);
        if (!respuestaBot || respuestaBot.trim() === '') {
          throw new Error('Rasa no devolvió una respuesta válida');
        }
      } catch (errorRasa) {
        console.error('Error al obtener respuesta de Rasa:', errorRasa);
        throw new Error(`Error al comunicarse con Rasa: ${errorRasa.message || 'Error desconocido'}`);
      }

      const nuevoMensajeBot = {
        id: `temp-${Date.now() + 1}`,
        sesionId: sesionId,
        userId: usuario.uid,
        matricula: usuario.matricula,
        mensaje: respuestaBot,
        tipo: 'bot',
        timestamp: new Date().toISOString()
      };

      setMensajes(prev => [...prev, nuevoMensajeBot]);

      try {
        await agregarMensaje(sesionId, usuario.uid, usuario.matricula, respuestaBot, 'bot');
      } catch (errorDB) {
        console.warn(' Error al guardar mensaje del bot en BD (continuando):', errorDB);
      }

      try {
        await guardarConsulta(
          usuario.uid,
          usuario.matricula,
          mensajeUsuario,
          respuestaBot,
          'general'
        );
      } catch (errorHistorial) {
        console.warn(' Error al guardar en historial (continuando):', errorHistorial);
      }

      const resultadoMensajes = await obtenerMensajes(sesionId, 100, 0);
      if (resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes)) {
        setMensajes(resultadoMensajes.mensajes);
      } else {
        console.warn(' Mensajes actualizados no son un array válido');
      }

      if (usuario) {
        const resultadoSesiones = await obtenerTodasSesiones(usuario.uid, 50, 0);
        setSesiones(resultadoSesiones.sesiones || []);
      }

    } catch (error) {
      console.error('Error completo al enviar mensaje:', error);
    } finally {
      setCargando(false);
    }
  };

  const cambiarSesion = async (nuevaSesionId) => {
    if (nuevaSesionId === sesionId) return;

    try {
      setCargando(true);
      setSesionId(nuevaSesionId);

      const resultadoMensajes = await obtenerMensajes(nuevaSesionId, 100, 0);
      if (resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes)) {
        setMensajes(resultadoMensajes.mensajes);
      } else {
        console.warn(' Mensajes de nueva sesión no son un array válido');
        setMensajes([]);
      }

    } catch (error) {
    } finally {
      setCargando(false);
    }
  };

  const crearNuevaSesion = async () => {
    try {
      setCargando(true);
      const nuevaSesion = await crearSesionChat(usuario.uid, usuario.matricula);

      const resultadoSesiones = await obtenerTodasSesiones(usuario.uid, 50, 0);
      setSesiones(resultadoSesiones.sesiones || []);

      setSesionId(nuevaSesion.id);
      setMensajes([]);

      const resultadoMensajes = await obtenerMensajes(nuevaSesion.id, 100, 0);
      if (resultadoMensajes && resultadoMensajes.mensajes && Array.isArray(resultadoMensajes.mensajes)) {
        setMensajes(resultadoMensajes.mensajes);
      } else {
        console.warn(' Mensajes de nueva sesión no son un array válido');
        setMensajes([]);
      }

    } catch (error) {
    } finally {
      setCargando(false);
    }
  };

  const obtenerPreviewMensaje = (sesion) => {
    if (sesion.totalMensajes && sesion.totalMensajes > 0) {
      const preview = `Conversación #${sesion.id}`;
      return preview.length > 30 ? preview.substring(0, 30) + '...' : preview;
    }
    return 'Nueva conversación';
  };

  const manejarEliminarSesion = async (sesionIdAEliminar, e) => {
    e.stopPropagation();

    try {
      setSesionEliminando(sesionIdAEliminar);
      setMenuAbierto(null);

      const user = await obtenerUsuarioActual();
      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      await eliminarSesion(sesionIdAEliminar, user.id);

      if (sesionIdAEliminar === sesionId) {
        const sesionesRestantes = sesiones.filter(s => s.id !== sesionIdAEliminar);
        if (sesionesRestantes.length > 0) {
          await cambiarSesion(sesionesRestantes[0].id);
        } else {
          await crearNuevaSesion();
        }
      }

      const resultadoSesiones = await obtenerTodasSesiones(user.id, 50, 0);
      setSesiones(resultadoSesiones.sesiones || []);
    } catch (error) {
      console.error('Error eliminando sesión:', error);
    } finally {
      setSesionEliminando(null);
    }
  };

  useEffect(() => {
    if (!menuAbierto) return;

    const handleClickOutside = (event) => {
      if (!event.target.closest('.chat-item-menu') && !event.target.closest('.chat-item-menu-panel')) {
        setMenuAbierto(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuAbierto]);

  const toggleTema = () => {
    const nuevoTema = !temaOscuro;
    setTemaOscuro(nuevoTema);
    localStorage.setItem('temaOscuro', nuevoTema.toString());
  };

  const manejarCerrarSesion = async () => {
    try {
      setCargando(true);
      await cerrarSesion();
      navigate('/');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    } finally {
      setCargando(false);
    }
  };

  const obtenerLogoUV = () => {
    return temaOscuro ? '/logouvn.png' : '/logouvb.png';
  };

  const obtenerLogoMult = () => {
    return temaOscuro ? '/multn.png' : '/multb.png';
  };

  const obtenerLogoBitbot = () => {
    return temaOscuro ? '/bitbot-logonegro.png' : '/bitbot-logoblanco.png';
  };

  if (cargandoInicial) {
    return (
      <div className="chat-cargando">
        <img
          src={process.env.PUBLIC_URL + '/bitbotv.gif'}
          alt="Cargando..."
          className="video-carga"
        />
      </div>
    );
  }

  return (
    <div className={`chat-usuario ${temaOscuro ? 'tema-oscuro' : 'tema-claro'}`}>
      <div className={`chat-sidebar ${sidebarVisible ? '' : 'sidebar-oculto'}`}>
        <div
          className="sidebar-logo"
          onClick={() => setSidebarVisible(true)}
          style={{ cursor: sidebarVisible ? 'default' : 'pointer' }}
        >
          <img
            src={process.env.PUBLIC_URL + obtenerLogoBitbot()}
            alt="BiTBoT Logo"
            className="logo-imgagen"
          />
          <div className="logo-nombre">BITBOT</div>
        </div>

        <div className="sidebar-menu">
          <button
            className="sidebar-boton nuevo-chat"
            onClick={crearNuevaSesion}
          >
            <img
              src={process.env.PUBLIC_URL + obtenerLogoMult()}
              alt="Logo"
              className="sidebar-imagen"
            />
            <span>Nuevo chat</span>
          </button>
        </div>

        <div className="sidebar-zona">
          <div className="sidebar-header">Chats</div>
          <div className="chats-lista">
            {sesiones.length === 0 ? (
              <div className="chats-vacio">
                <p>No hay chats aún</p>
                <p className="chats-vacio-ayuda">Crea un nuevo chat para comenzar</p>
              </div>
            ) : (
              sesiones.map((sesion) => (
                <div
                  key={sesion.id}
                  className={`chat-item-container ${sesion.id === sesionId ? 'chat-item-actual' : ''}`}
                >
                  <button
                    className={`chat-item ${sesion.id === sesionId ? 'chat-item-actual' : ''}`}
                    onClick={() => cambiarSesion(sesion.id)}
                  >
                    <div className="chat-item-icono"></div>
                    <div className="chat-item-etiqueta">
                      <div className="chat-item-titulo">
                        {obtenerPreviewMensaje(sesion)}
                      </div>
                      <div className="chat-item-fecha">
                        {new Date(sesion.ultimaActividad || sesion.fechaCreacion).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short'
                        })}
                      </div>
                    </div>
                  </button>

                  <div className="chat-item-menu">
                    <button
                      className="chat-item-menu-boton"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuAbierto(menuAbierto === sesion.id ? null : sesion.id);
                      }}
                      title="Opciones"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="5" r="2" fill="currentColor"/>
                        <circle cx="12" cy="12" r="2" fill="currentColor"/>
                        <circle cx="12" cy="19" r="2" fill="currentColor"/>
                      </svg>
                    </button>

                    {menuAbierto === sesion.id && (
                      <div className="chat-item-menu-panel">
                        <button
                          className="chat-item-menu-opcion"
                          onClick={(e) => manejarEliminarSesion(sesion.id, e)}
                          disabled={sesionEliminando === sesion.id}
                        >
                          {sesionEliminando === sesion.id ? 'Eliminando...' : 'Eliminar chat'}
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

      <div className={`chat-main ${sidebarVisible ? '' : 'chat-main-expandido'}`}>
        {sidebarVisible && (
          <button
            className="boton-triangulo"
            onClick={() => setSidebarVisible(false)}
            aria-label="Ocultar historial de chats"
            title="Ocultar historial"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        {!sidebarVisible && (
          <div className="linea-divisoria">
            <div className="linea-divisoria-contenido">
              <div
                className="linea-divisoria-logo"
                onClick={() => setSidebarVisible(true)}
                title="Mostrar historial de chats"
              >
                <img
                  src={process.env.PUBLIC_URL + obtenerLogoBitbot()}
                  alt="BiTBoT Logo"
                  className="logo-img-divisoria"
                />
              </div>
            </div>
          </div>
        )}

        <div className="chat-main-header">
          <div className="header-icon">
            <img
              src={process.env.PUBLIC_URL + obtenerLogoUV()}
              alt="Logo UV"
              className="header-logo-uv"
            />
          </div>
          <div className="header-info">
            <h1 className="header-titulo">Secretaría Universitaria FIEE</h1>
            <p className="header-subtitulo">Asistente virtual - Atención para estudiantes</p>
          </div>
          <div className="header-ajustes-container">
            <button
              className="ajustes-boton"
              onClick={() => setMostrarAjustes(!mostrarAjustes)}
              aria-label="Ajustes"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.74198 9.96512 4.01128 9.77251C4.28057 9.5799 4.48571 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.80618 14.2743 4.07447C14.452 4.34276 14.7042 4.55324 15 4.68C15.3016 4.81312 15.6362 4.85282 15.9606 4.794C16.285 4.73519 16.5843 4.58054 16.82 4.35L16.88 4.29C17.0657 4.10405 17.2863 3.95653 17.5291 3.85588C17.7719 3.75523 18.0322 3.70343 18.295 3.70343C18.5578 3.70343 18.8181 3.75523 19.0609 3.85588C19.3037 3.95653 19.5243 4.10405 19.71 4.29C19.896 4.47575 20.0435 4.69632 20.1441 4.93912C20.2448 5.18192 20.2966 5.44217 20.2966 5.705C20.2966 5.96783 20.2448 6.22808 20.1441 6.47088C20.0435 6.71368 19.896 6.93425 19.71 7.12L19.65 7.18C19.4195 7.41568 19.2648 7.71502 19.206 8.03941C19.1472 8.36381 19.1869 8.69838 19.32 9V9.08C19.4468 9.37577 19.6572 9.62802 19.9255 9.80569C20.1938 9.98337 20.5082 10.0787 20.83 10.08H21C21.5304 10.08 22.0391 10.2907 22.4142 10.6658C22.7893 11.0409 23 11.5496 23 12.08C23 12.6104 22.7893 13.1191 22.4142 13.4942C22.0391 13.8693 21.5304 14.08 21 14.08H20.91C20.5882 14.0813 20.2738 14.1766 20.0055 14.3543C19.7372 14.532 19.5268 14.7842 19.4 15.08V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div className={`panel-ajustes ${mostrarAjustes ? 'panel-ajustes-abierto' : ''}`}>
              <div className="panel-ajustes-header">
                <h3>Ajustes</h3>
                <button
                  className="cerrar-ajustes-boton"
                  onClick={() => setMostrarAjustes(false)}
                  aria-label="Cerrar ajustes"
                >
                </button>
              </div>
              <div className="panel-ajustes-contenido">
                <div className="ajuste-item">
                  <label className="ajuste-label">
                    <span>Tema Oscuro</span>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={temaOscuro}
                        onChange={toggleTema}
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </label>
                  <p className="ajuste-descripcion">
                    Cambia entre tema claro y oscuro
                  </p>
                </div>

                <div className="ajuste-item ajuste-item-separador">
                  <button
                    className="cerrar-sesion-boton"
                    onClick={manejarCerrarSesion}
                    disabled={cargando}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>Cerrar Sesión</span>
                  </button>
                  <p className="ajuste-descripcion">
                    Cierra tu sesión y regresa a la página de inicio
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mensajes-contenedor">
          {mensajes && mensajes.length > 0 ? (
            mensajes.map((mensaje, index) => {
              const mensajeTexto = mensaje.mensaje || mensaje.message || '';
              const mensajeTipo = mensaje.tipo || mensaje.type || 'bot';
              const mensajeTimestamp = mensaje.timestamp || mensaje.created_at || new Date().toISOString();

              return (
                <div
                  key={mensaje.id || `mensaje-${index}-${mensajeTimestamp}`}
                  className={`mensaje ${mensajeTipo === 'usuario' ? 'mensaje-usuario' : 'mensaje-bot'}`}
                >
                  <div className="mensaje-contenido">
                    <div className="mensaje-texto">
                      {mensajeTexto}
                    </div>
                    <div className="mensaje-timestamp">
                      {new Date(mensajeTimestamp).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mensajes-vacios">
              <p>No hay mensajes aún. ¡Comienza la conversación!</p>
            </div>
          )}
          {cargando && (
            <div className="mensaje mensaje-bot">
              <div className="mensaje-contenido">
                <div className="mensaje-texto">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={mensajesEndRef} />
        </div>

        <form className="chat-formulario" onSubmit={enviarMensaje}>
          <input
            type="text"
            value={nuevoMensaje}
            onChange={(e) => setNuevoMensaje(e.target.value)}
            placeholder="Escribe tu consulta aquí..."
            disabled={cargando}
            className="mensaje-input"
          />
          <button
            type="submit"
            disabled={cargando || !nuevoMensaje.trim()}
            className="enviar-boton"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </form>
      </div>

    </div>
  );
};

export default ChatUsuario;