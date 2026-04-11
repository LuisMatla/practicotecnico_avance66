// panel de administracion: usuarios, faq y vista rasa.
import React, { useState, useEffect, useCallback } from 'react'; //react y hooks.
import { useNavigate } from 'react-router-dom'; //navegacion para redireccionar.
import ChatUsuario from '../componentes/ChatUsuario'; //chat embebido en vista admin.
import { 
  obtenerTodosUsuarios, //lista usuarios para admin.
  eliminarUsuarioAdmin, //elimina usuario (admin).
  cerrarSesion as cerrarSesionSupabase, //logout supabase.
} from '../servicios/supabase'; //servicios supabase (admin/auth).
import FormularioUsuario from '../componentes/FormularioUsuario'; //modal alta/edicion usuario.
import catalogoRasaEstatico from '../datos/catalogoRasa.json'; //fallback local del catalogo de Rasa.
import {
  fetchCatalogoRasa, //trae catalogo remoto.
  fetchIntentDetalle, //trae detalle por intent.
  guardarIntentRasa, //crea/actualiza intent.
  eliminarIntentRasa, //elimina intent.
  resumirMensajeErrorAdmin, //normaliza mensaje de error.
} from '../servicios/rasaAdminService'; //servicio admin Rasa (via proxy/URL).
import './Admin.css'; //estilos del panel admin.

const INTENT_NO_ELIMINAR = new Set(['nlu_fallback']); //intents protegidos (no eliminar).

const Admin = () => {
  const [usuarios, setUsuarios] = useState([]); //lista de usuarios para tabla.
  const [cargando, setCargando] = useState(true); //carga de usuarios.
  const [carreraSeleccionada, setCarreraSeleccionada] = useState(null); //filtro por carrera.
  const [generacionSeleccionada, setGeneracionSeleccionada] = useState(null); //filtro por generacion.
  const [filtroTexto, setFiltroTexto] = useState(''); //busqueda por texto.
  const [mostrarFormulario, setMostrarFormulario] = useState(false); //abre/cierra modal usuario.
  const [usuarioEditando, setUsuarioEditando] = useState(null); //usuario actual a editar.
  const [usuarioEliminando, setUsuarioEliminando] = useState(null); //usuario seleccionado para eliminar.
  const [pagina] = useState(1); //pagina actual (constante en esta vista).
  const [faqError, setFaqError] = useState(''); //errores del panel NLU.
  const [seccionAdmin, setSeccionAdmin] = useState('principal'); //seccion activa: principal/usuarios/faq.
  const [menuAdminAbierto, setMenuAdminAbierto] = useState(false); //control del menu lateral.
  const [panelFaqAbierto, setPanelFaqAbierto] = useState(false); //control del panel FAQ/NLU.
  const [subVistaPreguntas, setSubVistaPreguntas] = useState('nlu'); //subvista dentro de preguntas.
  const [filtroCatalogoRasa, setFiltroCatalogoRasa] = useState(''); //filtro de intents.
  const [nluExpandidoIntent, setNluExpandidoIntent] = useState(null); //intent expandido en lista.
  const [catalogoRasa, setCatalogoRasa] = useState(catalogoRasaEstatico); //catalogo actual (remoto o local).
  const [catalogoCargando, setCatalogoCargando] = useState(false); //carga del catalogo.
  const [catalogoError, setCatalogoError] = useState(''); //error al cargar catalogo remoto.
  const [catalogoRemoto, setCatalogoRemoto] = useState(false); //marca si el catalogo viene del servidor.
  const [nluMenuAbiertoIntent, setNluMenuAbiertoIntent] = useState(null); //menu contextual por intent.
  const [intentPanelModo, setIntentPanelModo] = useState('crear'); //modo del panel: crear/editar.
  const [guardandoIntent, setGuardandoIntent] = useState(false); //bloquea UI al guardar intent.
  const [intentForm, setIntentForm] = useState({ //estado del formulario de intent.
    intent: '', //nombre del intent.
    ejemplos: '', //ejemplos NLU (texto).
    respuesta: '', //respuesta del bot.
    reglaTitulo: '', //titulo de regla.
    historiaTitulo: '', //titulo de historia.
    accionCustom: '', //accion custom opcional.
    previousIntent: '' //intent previo (para renombre).
  });
  const navigate = useNavigate(); //funcion para navegar rutas.

  const carreras = [
    'Ingeniería Informática',
    'Ingeniería Mecatrónica', 
    'Ingeniería Electrónica y Comunicaciones'
  ];

  const generaciones = ['S20', 'S21', 'S22', 'S23', 'S24', 'S25'];

  const cargarUsuarios = useCallback(async () => {
    try {
      setCargando(true); //activa loading.
      const resultado = await obtenerTodosUsuarios(pagina, 50, filtroTexto); //consulta usuarios.
      setUsuarios(resultado.usuarios || []); //guarda usuarios o arreglo vacio.
    } catch (error) {
    } finally {
      setCargando(false); //desactiva loading.
    }
  }, [pagina, filtroTexto]);

  useEffect(() => {
    cargarUsuarios(); //carga usuarios al montar o cambiar filtro.
  }, [cargarUsuarios]);

  useEffect(() => {
    if (!menuAdminAbierto) return undefined;
    const cerrarConEscape = (e) => {
      if (e.key === 'Escape') setMenuAdminAbierto(false);
    };
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, [menuAdminAbierto]);

  const cerrarPanelFaq = useCallback(() => {
    setPanelFaqAbierto(false); //cierra panel.
    setNluMenuAbiertoIntent(null); //cierra menu contextual.
    setFaqError(''); //limpia error visible.
  }, []);

  useEffect(() => {
    if (!panelFaqAbierto) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') cerrarPanelFaq();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelFaqAbierto, cerrarPanelFaq]);

  const cargarCatalogoRemoto = useCallback(async () => {
    setCatalogoCargando(true); //activa loading del catalogo.
    setCatalogoError(''); //limpia error previo.
    try {
      const cat = await fetchCatalogoRasa(); //trae catalogo remoto.
      setCatalogoRasa(cat); //actualiza catalogo en estado.
      setCatalogoRemoto(true); //marca fuente remota.
    } catch (e) {
      const detalle = resumirMensajeErrorAdmin(
        e?.message ? String(e.message) : 'Error desconocido'
      );
      setCatalogoError(
        `No se pudo cargar el catálogo desde el servidor Rasa (se muestran datos locales). Motivo: ${detalle}`
      );
      setCatalogoRasa(catalogoRasaEstatico); //fallback local.
      setCatalogoRemoto(false); //marca fuente local.
    } finally {
      setCatalogoCargando(false); //desactiva loading.
    }
  }, []);

  useEffect(() => {
    if (seccionAdmin !== 'faq') return undefined;
    cargarCatalogoRemoto();
  }, [seccionAdmin, cargarCatalogoRemoto]);

  useEffect(() => {
    if (nluMenuAbiertoIntent === null) return undefined;
    const cerrar = (e) => {
      if (e.target.closest && e.target.closest('.faq-nlu-menu-wrap')) return;
      setNluMenuAbiertoIntent(null);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [nluMenuAbiertoIntent]);

  const filtrarUsuarios = () => {
    let usuariosFiltrados = usuarios;

    if (carreraSeleccionada) {
      usuariosFiltrados = usuariosFiltrados.filter(usuario => 
        usuario.carrera === carreraSeleccionada
      );
    }

    if (generacionSeleccionada) {
      usuariosFiltrados = usuariosFiltrados.filter(usuario => 
        usuario.matricula.startsWith(generacionSeleccionada)
      );
    }

    if (filtroTexto) {
      usuariosFiltrados = usuariosFiltrados.filter(usuario => 
        usuario.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        usuario.apellidos.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        usuario.matricula.toLowerCase().includes(filtroTexto.toLowerCase()) ||
        usuario.correo.toLowerCase().includes(filtroTexto.toLowerCase())
      );
    }

    return usuariosFiltrados;
  };

  const obtenerEstadisticas = () => {
    const totalUsuarios = usuarios.length;
    const usuariosPorCarrera = {};
    const usuariosPorGeneracion = {};

    carreras.forEach(carrera => {
      usuariosPorCarrera[carrera] = usuarios.filter(u => u.carrera === carrera).length;
    });

    generaciones.forEach(gen => {
      usuariosPorGeneracion[gen] = usuarios.filter(u => u.matricula.startsWith(gen)).length;
    });

    return {
      totalUsuarios,
      usuariosPorCarrera,
      usuariosPorGeneracion
    };
  };

  const limpiarFiltros = () => {
    setCarreraSeleccionada(null);
    setGeneracionSeleccionada(null);
    setFiltroTexto('');
  };

  const cerrarSesion = async () => {
    try {
      await cerrarSesionSupabase();
    } catch (error) {
      console.error('Error cerrando sesión de Supabase:', error);
    }
    localStorage.removeItem('adminSession');
    localStorage.removeItem('adminUser');
    navigate('/');
  };

  const abrirFormularioCrear = () => {
    setUsuarioEditando(null);
    setMostrarFormulario(true);
  };

  const abrirFormularioEditar = (usuario) => {
    setUsuarioEditando(usuario);
    setMostrarFormulario(true);
  };

  const cerrarFormulario = () => {
    setMostrarFormulario(false);
    setUsuarioEditando(null);
  };

  const guardarUsuario = () => {
    cargarUsuarios();
  };

  const confirmarEliminarUsuario = (usuario) => {
    setUsuarioEliminando(usuario);
  };

  const eliminarUsuario = async () => {
    if (!usuarioEliminando) return;

    try {
      await eliminarUsuarioAdmin(usuarioEliminando.uid);
      cargarUsuarios();
    } catch (error) {
    } finally {
      setUsuarioEliminando(null);
    }
  };

  const estadisticas = obtenerEstadisticas();
  const usuariosFiltrados = filtrarUsuarios();

  const filtroRasaCoincide = (s) => {
    const q = filtroCatalogoRasa.trim().toLowerCase();
    if (!q) return true;
    return String(s || '').toLowerCase().includes(q);
  };

  const nluCombinado = catalogoRasa.nlu || [];

  const nluFiltrado = nluCombinado.filter(
    (n) =>
      filtroRasaCoincide(n.intent) ||
      (n.samples && n.samples.some((ej) => filtroRasaCoincide(ej)))
  );

  const piezasPorIntent = (intentName) => {
    const rulesBase = catalogoRasa.rules.filter((r) => r.intent === intentName);
    const storiesBase = catalogoRasa.stories.filter((s) => s.intent === intentName);
    const domainBase = catalogoRasa.responses;

    const rules = rulesBase;
    const stories = storiesBase;
    const acciones = new Set();
    rules.forEach((r) => {
      if (r.action) acciones.add(r.action);
    });
    stories.forEach((s) => {
      if (s.action) acciones.add(s.action);
    });
    const lista = [...acciones];
    const utters = lista.filter((a) => a.startsWith('utter_'));
    const accionesCustom = lista.filter((a) => !a.startsWith('utter_'));
    const dominio = utters.map((utter) => {
      const r = domainBase.find((x) => x.utter === utter);
      return r || { utter, variantCount: 0, preview: '' };
    });
    return { rules, stories, dominio, accionesCustom };
  };

  const abrirPanelCrearIntent = () => {
    setFaqError('');
    setIntentPanelModo('crear');
    setPanelFaqAbierto(true);
    setIntentForm({
      intent: '',
      ejemplos: '',
      respuesta: '',
      reglaTitulo: '',
      historiaTitulo: '',
      accionCustom: '',
      previousIntent: ''
    });
  };

  const abrirModificarIntent = async (row) => {
    setNluMenuAbiertoIntent(null);
    setFaqError('');
    setIntentPanelModo('editar');
    setGuardandoIntent(true);
    try {
      const det = await fetchIntentDetalle(row.intent);
      if (!det) {
        setIntentForm({
          intent: row.intent,
          ejemplos: (row.samples || []).join('\n'),
          respuesta: '',
          reglaTitulo: '',
          historiaTitulo: '',
          accionCustom: '',
          previousIntent: row.intent
        });
        setFaqError(
          'No se obtuvo detalle del servidor; revisa la API o los datos mostrados pueden estar incompletos.'
        );
      } else {
        setIntentForm({
          intent: det.intent,
          ejemplos: (det.ejemplos || []).join('\n'),
          respuesta: det.respuesta || '',
          reglaTitulo: det.reglaTitulo || '',
          historiaTitulo: det.historiaTitulo || '',
          accionCustom: det.accionCustom || '',
          previousIntent: det.intent
        });
      }
      setPanelFaqAbierto(true);
    } catch (error) {
      setFaqError(
        resumirMensajeErrorAdmin(error.message || 'Error al cargar la intención.')
      );
    } finally {
      setGuardandoIntent(false);
    }
  };

  const eliminarIntentDesdeMenu = async (row) => {
    if (INTENT_NO_ELIMINAR.has(row.intent)) {
      setFaqError('Esta intención no se puede eliminar.');
      setNluMenuAbiertoIntent(null);
      return;
    }
    const confirmado = window.confirm(
      `¿Eliminar la intención "${row.intent}" en el servidor Rasa? Se actualizarán nlu.yml, domain.yml, rules.yml y stories.yml.`
    );
    if (!confirmado) return;
    setNluMenuAbiertoIntent(null);
    setFaqError('');
    try {
      setGuardandoIntent(true);
      const data = await eliminarIntentRasa(row.intent);
      if (data.catalog) {
        setCatalogoRasa(data.catalog);
        setCatalogoRemoto(true);
      } else {
        const cat = await fetchCatalogoRasa();
        setCatalogoRasa(cat);
        setCatalogoRemoto(true);
      }
      setNluExpandidoIntent(null);
    } catch (error) {
      setFaqError(resumirMensajeErrorAdmin(error.message || 'No se pudo eliminar.'));
    } finally {
      setGuardandoIntent(false);
    }
  };

  const guardarIntentRasaHandler = async (event) => {
    event.preventDefault();
    const intent = intentForm.intent.trim();
    const ejemplos = intentForm.ejemplos
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const respuesta = intentForm.respuesta.trim();

    if (!intent) {
      setFaqError('El nombre de intent es obligatorio.');
      return;
    }
    if (ejemplos.length === 0) {
      setFaqError('Añade al menos un ejemplo NLU.');
      return;
    }
    if (!respuesta && intentPanelModo === 'crear') {
      setFaqError('La respuesta (domain) es obligatoria al crear una intención.');
      return;
    }

    const payload = {
      intent,
      ejemplos,
      respuesta,
      reglaTitulo: intentForm.reglaTitulo.trim(),
      historiaTitulo: intentForm.historiaTitulo.trim(),
      accionCustom: intentForm.accionCustom.trim()
    };
    if (intentPanelModo === 'editar') {
      payload.previousIntent = intentForm.previousIntent.trim() || intent;
    }

    setFaqError('');
    try {
      setGuardandoIntent(true);
      const data = await guardarIntentRasa(payload);
      if (data.catalog) {
        setCatalogoRasa(data.catalog);
        setCatalogoRemoto(true);
      } else {
        const cat = await fetchCatalogoRasa();
        setCatalogoRasa(cat);
        setCatalogoRemoto(true);
      }
      setNluExpandidoIntent(intent);
      setPanelFaqAbierto(false);
    } catch (error) {
      setFaqError(resumirMensajeErrorAdmin(error.message || 'No se pudo guardar.'));
    } finally {
      setGuardandoIntent(false);
    }
  };

  const irASeccion = (seccion) => {
    setSeccionAdmin(seccion);
    setMenuAdminAbierto(false);
  };

  return (
    <div className="admin-container">
      {menuAdminAbierto && (
        <button
          type="button"
          className="admin-menu-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMenuAdminAbierto(false)}
        />
      )}
      <aside
        className={`admin-menu-panel ${menuAdminAbierto ? 'admin-menu-panel--abierto' : ''}`}
        aria-hidden={!menuAdminAbierto}
        id="admin-menu-lateral"
      >
        <div className="admin-menu-panel-header">
          <span>Menú</span>
          <button
            type="button"
            className="admin-menu-cerrar"
            onClick={() => setMenuAdminAbierto(false)}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <nav className="admin-menu-nav" aria-label="Secciones">
          {[
            { id: 'principal', label: 'Principal' },
            { id: 'usuarios', label: 'Usuarios' },
            { id: 'faq', label: 'Preguntas' },
            { id: 'chatbot', label: 'Chatbot' }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-menu-item ${seccionAdmin === item.id ? 'activo' : ''}`}
              onClick={() => irASeccion(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="admin-header">
        <div className="admin-header-izquierda">
          <button
            type="button"
            className="admin-menu-trigger"
            onClick={() => setMenuAdminAbierto(true)}
            aria-expanded={menuAdminAbierto}
            aria-controls="admin-menu-lateral"
            title="Abrir menú"
          >
            <span className="admin-menu-trigger-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
          <div className="admin-titulo">
            <h1>Panel de Administración</h1>
            <p>BiTBoT — FIEE</p>
          </div>
        </div>
        <button className="cerrar-sesion-boton" onClick={cerrarSesion}>
          Cerrar Sesión
        </button>
      </div>

      {seccionAdmin === 'principal' && (
        <div className="admin-seccion-principal">
          <p className="admin-bienvenida">
            Resumen rápido del sistema. Usa el menú (⋮) para ir a <strong>Usuarios</strong>,{' '}
            <strong>Preguntas</strong> o probar el <strong>Chatbot</strong> igual que un alumno.
          </p>
        </div>
      )}

      {seccionAdmin === 'usuarios' && (
        <>
      {cargando && (
        <div className="admin-inline-loading" role="status">
          <div className="spinner" />
          <span>Cargando usuarios…</span>
        </div>
      )}

      <div className="admin-stats">
        <div className="stat-card">
          <h3>Total Usuarios</h3>
          <span className="stat-number">{estadisticas.totalUsuarios}</span>
        </div>
        {carreras.map((carrera) => (
          <div key={carrera} className="stat-card">
            <h3>{carrera}</h3>
            <span className="stat-number">{estadisticas.usuariosPorCarrera[carrera] || 0}</span>
          </div>
        ))}
      </div>

      <div className="admin-filters">
        <div className="filter-section">
          <h3>Filtros</h3>
          
          <div className="filter-group">
            <label>Carrera:</label>
            <select 
              value={carreraSeleccionada || ''} 
              onChange={(e) => setCarreraSeleccionada(e.target.value || null)}
            >
              <option value="">Todas las carreras</option>
              {carreras.map(carrera => (
                <option key={carrera} value={carrera}>{carrera}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Generación:</label>
            <select 
              value={generacionSeleccionada || ''} 
              onChange={(e) => setGeneracionSeleccionada(e.target.value || null)}
            >
              <option value="">Todas las generaciones</option>
              {generaciones.map(gen => (
                <option key={gen} value={gen}>{gen}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Buscar:</label>
            <input
              type="text"
              placeholder="Nombre, apellidos, matrícula o correo..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>

          <button className="limpiar-filtros-boton" onClick={limpiarFiltros}>
            Limpiar Filtros
          </button>
        </div>
      </div>

      <div className="admin-content">
        <div className="usuarios-header">
          <h2>Lista de Usuarios ({usuariosFiltrados.length})</h2>
          <div className="usuarios-actions">
            <button className="crear-usuario-boton" onClick={abrirFormularioCrear}>
              Crear Usuario
            </button>
            <button className="actualizar-boton" onClick={cargarUsuarios}>
              Actualizar
            </button>
          </div>
        </div>

        <div className="usuarios-grid">
          {usuariosFiltrados.map(usuario => (
            <div key={usuario.uid} className="usuario-card">
              <div className="usuario-header">
                <div className="usuario-avatar">
                  {usuario.nombre.charAt(0)}{usuario.apellidos.charAt(0)}
                </div>
                <div className="usuario-info">
                  <h3>{usuario.nombre} {usuario.apellidos}</h3>
                  <p className="usuario-matricula">{usuario.matricula}</p>
                </div>
              </div>
              
              <div className="usuario-details">
                <div className="detail-item">
                  <span className="detail-label">Correo:</span>
                  <span className="detail-value">{usuario.correo}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Carrera:</span>
                  <span className="detail-value">{usuario.carrera}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Facultad:</span>
                  <span className="detail-value">{usuario.facultad}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Fecha de Nacimiento:</span>
                  <span className="detail-value">{usuario.fechanacimiento}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Registro:</span>
                  <span className="detail-value">
                    {usuario.fecharegistro ? 
                      new Date(usuario.fecharegistro).toLocaleDateString() : 
                      'N/A'
                    }
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Estado:</span>
                  <span className={`detail-value ${usuario.activo ? 'activo' : 'inactivo'}`}>
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
              
              <div className="usuario-actions">
                <button 
                  className="editar-boton"
                  onClick={() => abrirFormularioEditar(usuario)}
                  title="Editar usuario"
                >
                  Editar
                </button>
                <button 
                  className="eliminar-boton"
                  onClick={() => confirmarEliminarUsuario(usuario)}
                  title="Eliminar usuario"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

        {usuariosFiltrados.length === 0 && (
          <div className="no-usuarios">
            <p>No se encontraron usuarios con los filtros aplicados</p>
          </div>
        )}
      </div>
        </>
      )}

      {seccionAdmin === 'faq' && (
      <div className="faq-section">
        <div className="faq-toolbar">
          <div className="faq-toolbar-texto">
            <h2>Conocimiento del chatbot (Rasa)</h2>
            <p className="faq-toolbar-subtitulo">
              Diccionario de intenciones (nlu.yml): elige una intención para ver ejemplos de lo que dice el usuario y, al desplegar, cómo se conecta con domain, rules y stories.
            </p>
            <p className="faq-toolbar-meta">
              {catalogoCargando && <span>Cargando catálogo desde Rasa… </span>}
              {catalogoRemoto && !catalogoCargando && (
                <span className="faq-catalogo-remoto">Conectado al servidor · </span>
              )}
              Catálogo YAML: {catalogoRasa.meta.generado.slice(0, 10)} · {catalogoRasa.intents.length}{' '}
              intenciones · {catalogoRasa.responses.length} respuestas en dominio · {catalogoRasa.rules.length}{' '}
              reglas · {catalogoRasa.stories.length} historias
            </p>
            {catalogoError && <p className="faq-catalogo-aviso">{catalogoError}</p>}
          </div>
          <div className="faq-toolbar-acciones">
            <input
              type="search"
              className="faq-toolbar-buscar"
              placeholder="Filtrar intenciones o ejemplos…"
              value={filtroCatalogoRasa}
              onChange={(event) => setFiltroCatalogoRasa(event.target.value)}
              aria-label="Búsqueda"
            />
            <button
              type="button"
              className="actualizar-boton"
              onClick={() => cargarCatalogoRemoto()}
              disabled={catalogoCargando}
              title="Reintentar conexión con el servidor Rasa"
              aria-label="Reintentar catálogo Rasa"
            >
              Reintentar
            </button>
            <button
              type="button"
              className="faq-boton-mas"
              onClick={abrirPanelCrearIntent}
              title="Agregar intención completa"
              aria-label="Agregar intención completa"
            >
              +
            </button>
          </div>
        </div>

        <nav className="faq-rasa-tabs" role="tablist" aria-label="Vista de preguntas">
          {[{ id: 'nlu', label: 'Intenciones (NLU)' }].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subVistaPreguntas === tab.id}
              className={`faq-rasa-tab ${subVistaPreguntas === tab.id ? 'faq-rasa-tab--activo' : ''}`}
              onClick={() => {
                setSubVistaPreguntas(tab.id);
                setNluExpandidoIntent(null);
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {subVistaPreguntas === 'nlu' && (
          <div className="faq-rasa-panel" role="tabpanel">
            <details className="faq-rasa-ayuda">
              <summary>
                Cómo encajan NLU, domain.yml, rules.yml y stories.yml (para una misma intención)
              </summary>
              <div className="faq-rasa-ayuda-body">
                <p>
                  <strong>nlu.yml</strong> — Diccionario de intenciones: ejemplos de cómo habla el usuario.
                  Sirve para que el modelo mapee el texto a un <em>Intent</em>. Aquí también se entrena el
                  reconocimiento de entidades (fechas, nombres, etc.).
                </p>
                <p>
                  <strong>domain.yml</strong> — Cerebro del bot: declara intenciones, entidades, slots,
                  respuestas <code>utter_*</code> y acciones personalizadas. Si algo no está aquí, el bot no
                  puede usarlo.
                </p>
                <p>
                  <strong>stories.yml</strong> — Guiones de diálogo: ejemplo de secuencias intención →
                  acción para que el modelo generalice conversaciones abiertas.
                </p>
                <p>
                  <strong>rules.yml</strong> — Leyes fijas: si el intent coincide, la acción es siempre la
                  misma (sin depender del historial). Útil para saludos, despedidas, etc.
                </p>
              </div>
            </details>

            <ul className="faq-nlu-lista">
              {nluFiltrado.map((row) => {
                const abierto = nluExpandidoIntent === row.intent;
                const { rules, stories, dominio, accionesCustom } = piezasPorIntent(row.intent);
                return (
                  <li key={row.intent} className="faq-nlu-item">
                    <button
                      type="button"
                      className="faq-nlu-cabecera"
                      onClick={() =>
                        setNluExpandidoIntent(abierto ? null : row.intent)
                      }
                      aria-expanded={abierto}
                    >
                      <span className="faq-nlu-chevron">{abierto ? '▾' : '▸'}</span>
                      <code className="faq-rasa-code">{row.intent}</code>
                      <span className="faq-nlu-cabecera-derecha">
                        <span className="faq-nlu-count">
                          {row.exampleCount} formas de preguntar
                        </span>
                        <span
                          className="faq-nlu-menu-wrap"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <button
                            type="button"
                            className="faq-nlu-menu-dots"
                            aria-haspopup="menu"
                            aria-expanded={nluMenuAbiertoIntent === row.intent}
                            title="Opciones de intención"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNluMenuAbiertoIntent((prev) =>
                                prev === row.intent ? null : row.intent
                              );
                            }}
                          >
                            ⋮
                          </button>
                          {nluMenuAbiertoIntent === row.intent && (
                            <ul className="faq-nlu-menu-dropdown" role="menu">
                              <li role="none">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="faq-nlu-menu-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirModificarIntent(row);
                                  }}
                                >
                                  Modificar
                                </button>
                              </li>
                              <li role="none">
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="faq-nlu-menu-item faq-nlu-menu-item--peligro"
                                  disabled={INTENT_NO_ELIMINAR.has(row.intent)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    eliminarIntentDesdeMenu(row);
                                  }}
                                >
                                  Eliminar
                                </button>
                              </li>
                            </ul>
                          )}
                        </span>
                      </span>
                    </button>
                    {abierto && (
                      <div className="faq-nlu-expandido">
                        <section className="faq-nlu-seccion-ejemplos">
                          <h4 className="faq-nlu-titulo-seccion">nlu.yml — ejemplos</h4>
                          <p className="faq-nlu-hint">
                            Frases que enseñan al bot a reconocer esta intención (muestra parcial; el archivo
                            tiene más).
                          </p>
                          <ul className="faq-nlu-ejemplos">
                            {row.samples.map((ej, i) => (
                              <li key={i}>{ej}</li>
                            ))}
                            {row.exampleCount > row.samples.length && (
                              <li className="faq-nlu-mas">
                                … y {row.exampleCount - row.samples.length} más en nlu.yml
                              </li>
                            )}
                          </ul>
                        </section>

                        <div className="faq-nlu-grid-tres">
                          <section className="faq-nlu-columna">
                            <h4 className="faq-nlu-titulo-seccion">domain.yml</h4>
                            <p className="faq-nlu-col-desc">
                              Respuestas y acciones que el bot puede ejecutar para esta intención.
                            </p>
                            {dominio.length === 0 && accionesCustom.length === 0 && (
                              <p className="faq-nlu-sin-datos">Sin respuesta <code>utter_*</code> enlazada.</p>
                            )}
                            {dominio.map((d) => (
                              <div key={d.utter} className="faq-nlu-dominio-card">
                                <code className="faq-rasa-code">{d.utter}</code>
                                <span className="faq-nlu-variantes">{d.variantCount} variantes</span>
                                <p className="faq-nlu-previa">{d.preview || '—'}</p>
                              </div>
                            ))}
                            {accionesCustom.map((a) => (
                              <div key={a} className="faq-nlu-dominio-card faq-nlu-dominio-accion">
                                <span className="faq-nlu-accion-label">Acción</span>
                                <code className="faq-rasa-code">{a}</code>
                              </div>
                            ))}
                          </section>

                          <section className="faq-nlu-columna">
                            <h4 className="faq-nlu-titulo-seccion">rules.yml</h4>
                            <p className="faq-nlu-col-desc">
                              Respuesta fija cuando el intent coincide (sin depender del historial).
                            </p>
                            {rules.length === 0 ? (
                              <p className="faq-nlu-sin-datos">Sin regla para este intent.</p>
                            ) : (
                              <ul className="faq-nlu-mini-lista">
                                {rules.map((r, idx) => (
                                  <li key={`${r.title}-${idx}`}>
                                    <span className="faq-nlu-mini-titulo">{r.title}</span>
                                    <span className="faq-nlu-mini-flecha"> → </span>
                                    <code className="faq-rasa-code">{r.action || '—'}</code>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </section>

                          <section className="faq-nlu-columna">
                            <h4 className="faq-nlu-titulo-seccion">stories.yml</h4>
                            <p className="faq-nlu-col-desc">
                              Ejemplos de historia (intención → acción) para entrenar el modelo.
                            </p>
                            {stories.length === 0 ? (
                              <p className="faq-nlu-sin-datos">Sin historia para este intent.</p>
                            ) : (
                              <ul className="faq-nlu-mini-lista">
                                {stories.map((s, idx) => (
                                  <li key={`${s.title}-${idx}`}>
                                    <span className="faq-nlu-mini-titulo">{s.title}</span>
                                    <span className="faq-nlu-mini-flecha"> → </span>
                                    <code className="faq-rasa-code">{s.action || '—'}</code>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </section>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {nluFiltrado.length === 0 && (
              <p className="faq-rasa-vacio">Nada coincide con el filtro.</p>
            )}
          </div>
        )}

        {panelFaqAbierto && (
          <>
            <div
              className="faq-panel-backdrop"
              onClick={cerrarPanelFaq}
              aria-hidden="true"
            />
            <aside
              className="faq-panel-lateral"
              role="dialog"
              aria-modal="true"
              aria-labelledby="faq-panel-titulo"
            >
              <div className="faq-panel-cabecera">
                <h2 id="faq-panel-titulo">
                  {intentPanelModo === 'editar'
                    ? 'Modificar intención'
                    : 'Nueva intención completa'}
                </h2>
                <button
                  type="button"
                  className="faq-panel-cerrar"
                  onClick={cerrarPanelFaq}
                  aria-label="Cerrar panel"
                >
                  ×
                </button>
              </div>
              <form className="faq-form faq-panel-formulario" onSubmit={guardarIntentRasaHandler}>
                <label>
                  Intent (nlu/domain)
                  <input
                    type="text"
                    placeholder="ask_for_ejemplo"
                    value={intentForm.intent}
                    onChange={(event) =>
                      setIntentForm((prev) => ({ ...prev, intent: event.target.value.trim() }))
                    }
                  />
                </label>
                <label>
                  Ejemplos NLU (una línea por ejemplo)
                  <textarea
                    rows="6"
                    placeholder={"hola\nbuenas tardes\nquiero saber sobre ..."}
                    value={intentForm.ejemplos}
                    onChange={(event) =>
                      setIntentForm((prev) => ({ ...prev, ejemplos: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Respuesta principal (domain utter)
                  <textarea
                    rows="5"
                    placeholder="Texto que dirá el bot."
                    value={intentForm.respuesta}
                    onChange={(event) =>
                      setIntentForm((prev) => ({ ...prev, respuesta: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Título de regla (rules.yml)
                  <input
                    type="text"
                    placeholder="Regla ask_for_ejemplo"
                    value={intentForm.reglaTitulo}
                    onChange={(event) =>
                      setIntentForm((prev) => ({ ...prev, reglaTitulo: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Título de historia (stories.yml)
                  <input
                    type="text"
                    placeholder="Historia ask_for_ejemplo"
                    value={intentForm.historiaTitulo}
                    onChange={(event) =>
                      setIntentForm((prev) => ({ ...prev, historiaTitulo: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Acción custom opcional (si no, se usa utter_intent)
                  <input
                    type="text"
                    placeholder="action_algo_especial"
                    value={intentForm.accionCustom}
                    onChange={(event) =>
                      setIntentForm((prev) => ({ ...prev, accionCustom: event.target.value }))
                    }
                  />
                </label>
                <div className="faq-form-actions">
                  <button
                    className="guardar-faq-boton"
                    type="submit"
                    disabled={guardandoIntent}
                  >
                    {guardandoIntent
                      ? 'Guardando…'
                      : intentPanelModo === 'editar'
                        ? 'Guardar cambios en Rasa'
                        : 'Agregar intención en Rasa'}
                  </button>
                  <button
                    className="cancelar-faq-boton"
                    type="button"
                    onClick={cerrarPanelFaq}
                  >
                    Cancelar
                  </button>
                </div>
                {faqError && <p className="faq-error">{faqError}</p>}
              </form>
            </aside>
          </>
        )}
      </div>
      )}

      {seccionAdmin === 'chatbot' && (
        <div className="admin-chatbot-embed" aria-label="Chat BiTBoT (modo administrador)">
          <p className="admin-chatbot-embed-nota">
            Mismo chat que usan los alumnos: conversación con Rasa y sesiones guardadas con tu cuenta de
            administrador.
          </p>
          <div className="admin-chatbot-embed-inner">
            <ChatUsuario modoAdmin />
          </div>
        </div>
      )}

      {mostrarFormulario && (
        <FormularioUsuario
          usuario={usuarioEditando}
          onCerrar={cerrarFormulario}
          onGuardar={guardarUsuario}
        />
      )}

      {usuarioEliminando && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Confirmar Eliminación</h3>
            </div>
            <div className="modal-body">
              <p>¿Estás seguro de que quieres eliminar al usuario?</p>
              <div className="usuario-info-modal">
                <strong>{usuarioEliminando.nombre} {usuarioEliminando.apellidos}</strong>
                <br />
                <span>Matrícula: {usuarioEliminando.matricula}</span>
                <br />
                <span>Correo: {usuarioEliminando.correo}</span>
              </div>
              <p className="warning-text">Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-actions">
              <button 
                className="cancelar-modal-boton"
                onClick={() => setUsuarioEliminando(null)}
              >
                Cancelar
              </button>
              <button 
                className="eliminar-modal-boton"
                onClick={eliminarUsuario}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
