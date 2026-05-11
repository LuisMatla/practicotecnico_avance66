import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatUsuario from '../componentes/ChatUsuario';
import { 
  obtenerTodosUsuarios,
  eliminarUsuarioAdmin,
  cerrarSesion as cerrarSesionSupabase,
} from '../servicios/supabase';
import FormularioUsuario from '../componentes/FormularioUsuario';
import catalogoRasaEstatico from '../datos/catalogoRasa.json';
import {
  fetchCatalogoRasa,
  fetchIntentDetalle,
  guardarIntentRasa,
  eliminarIntentRasa,
  entrenarRasaAhora,
  fetchEstadoEntrenamientoRasa,
  resumirMensajeErrorAdmin,
} from '../servicios/rasaAdminService';
import { supabase } from '../supabase/config';
import './Admin.css';

const INTENT_NO_ELIMINAR = new Set(['nlu_fallback']);
const crearIntentVacio = () => ({
  intent: '',
  ejemplos: '',
  respuesta: '',
  reglaTitulo: '',
  historiaTitulo: '',
  accionCustom: '',
  previousIntent: ''
});

const Admin = () => {
  const [dashboardCargando, setDashboardCargando] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardStats, setDashboardStats] = useState({
    consultasTotalesHoy: 0,
    usuariosActivos7d: 0,
    tasaExito: 0,
    tasaFallback: 0,
    totalAnalizado: 0,
    ultimasInteracciones: [],
    topPreguntas: [],
    totalConsultasDesdeOctubre: 0,
    periodoInicioLabel: '',
    periodoFinLabel: ''
  });
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [carreraSeleccionada, setCarreraSeleccionada] = useState(null);
  const [generacionSeleccionada, setGeneracionSeleccionada] = useState(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [usuarioEliminando, setUsuarioEliminando] = useState(null);
  const [pagina] = useState(1);
  const [faqError, setFaqError] = useState('');
  const [seccionAdmin, setSeccionAdmin] = useState('principal');
  const [menuAdminAbierto, setMenuAdminAbierto] = useState(false);
  const [panelFaqAbierto, setPanelFaqAbierto] = useState(false);
  const [subVistaPreguntas, setSubVistaPreguntas] = useState('nlu');
  const [filtroCatalogoRasa, setFiltroCatalogoRasa] = useState('');
  const [nluExpandidoIntent, setNluExpandidoIntent] = useState(null);
  const [catalogoRasa, setCatalogoRasa] = useState(catalogoRasaEstatico);
  const [catalogoCargando, setCatalogoCargando] = useState(false);
  const [catalogoError, setCatalogoError] = useState('');
  const [catalogoAviso, setCatalogoAviso] = useState('');
  const [catalogoRemoto, setCatalogoRemoto] = useState(false);
  const [entrenandoRasa, setEntrenandoRasa] = useState(false);
  const [nluMenuAbiertoIntent, setNluMenuAbiertoIntent] = useState(null);
  const [intentPanelModo, setIntentPanelModo] = useState('crear');
  const [guardandoIntent, setGuardandoIntent] = useState(false);
  const [intentForms, setIntentForms] = useState([crearIntentVacio()]);
  const [intentFormIndex, setIntentFormIndex] = useState(0);
  const intentForm = intentForms[intentFormIndex] || crearIntentVacio();
  const navigate = useNavigate();

  const carreras = [
    'Ingeniería Informática',
    'Ingeniería Mecatrónica', 
    'Ingeniería Electrónica y Comunicaciones'
  ];

  const generaciones = ['S20', 'S21', 'S22', 'S23', 'S24', 'S25'];

  const cargarUsuarios = useCallback(async () => {
    try {
      setCargando(true);
      const resultado = await obtenerTodosUsuarios(pagina, 50, filtroTexto);
      setUsuarios(resultado.usuarios || []);
    } catch (error) {
    } finally {
      setCargando(false);
    }
  }, [pagina, filtroTexto]);

  const esFallbackRespuesta = useCallback((texto) => {
    const t = String(texto || '').toLowerCase();
    return (
      t.includes('no encontré una respuesta exacta') ||
      t.includes('no encontre una respuesta exacta') ||
      t.includes('podrías darme más detalles') ||
      t.includes('podrias darme mas detalles') ||
      t.includes('no pude consultar la base de conocimientos') ||
      t.includes('no tengo respuestas registradas')
    );
  }, []);

  const normalizarTextoIntent = useCallback((texto) => {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const scoreCoincidenciaTexto = useCallback((a, b) => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.92;
    const tokensA = new Set(a.split(' '));
    const tokensB = new Set(b.split(' '));
    if (!tokensA.size || !tokensB.size) return 0;
    const inter = [...tokensA].filter((x) => tokensB.has(x)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    return union > 0 ? inter / union : 0;
  }, []);

  const inferirIntentDesdeNlu = useCallback((texto, nluData) => {
    const textoNorm = normalizarTextoIntent(texto);
    if (!textoNorm) return 'nlu_fallback';

    let mejorIntent = 'nlu_fallback';
    let mejorScore = 0;
    (nluData || []).forEach((bloque) => {
      const intent = bloque.intent;
      const samples = Array.isArray(bloque.samples) ? bloque.samples : [];
      samples.forEach((sample) => {
        const sNorm = normalizarTextoIntent(sample);
        const score = scoreCoincidenciaTexto(textoNorm, sNorm);
        if (score > mejorScore) {
          mejorScore = score;
          mejorIntent = intent;
        }
      });
    });

    return mejorScore >= 0.45 ? mejorIntent : 'nlu_fallback';
  }, [normalizarTextoIntent, scoreCoincidenciaTexto]);

  const formatearIntentParaGrafica = useCallback((intent) => {
    const raw = String(intent || '').trim();
    if (!raw) return 'nlu_fallback';
    const sinPrefijo = raw.replace(/^ask_for_/i, '');
    const base = sinPrefijo.replace(/_/g, ' ').trim();
    if (/^IL$/i.test(base)) return 'IL';
    return base.toLowerCase();
  }, []);

  const obtenerInicioPeriodoOctubre = useCallback(() => {
    const hoy = new Date();
    const anioInicio = hoy.getMonth() >= 9 ? hoy.getFullYear() : hoy.getFullYear() - 1;
    return new Date(anioInicio, 9, 1, 0, 0, 0, 0);
  }, []);

  const cargarDashboard = useCallback(async () => {
    setDashboardCargando(true);
    setDashboardError('');
    try {
      const inicioHoy = new Date();
      inicioHoy.setHours(0, 0, 0, 0);
      const hace7Dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const inicioOctubre = obtenerInicioPeriodoOctubre();
      const inicioOctubreIso = inicioOctubre.toISOString();

      const [
        { count: consultasHoy, error: errConsultasHoy },
        { count: consultasHoyMensajes, error: errConsultasHoyMensajes },
        { count: activos7d, error: errActivos7d },
        { data: usuariosMensajes7dRaw, error: errUsuariosMensajes7d },
        { data: historialRaw, error: errHistorial },
        { data: botMensajesRaw, error: errBotMensajes },
        { data: mensajesRecientesRaw, error: errMensajesRecientes },
        { data: preguntasOctubreRaw, error: errPreguntasOctubre }
      ] = await Promise.all([
        supabase
          .from('historial_consultas')
          .select('*', { count: 'exact', head: true })
          .gte('fechaConsulta', inicioHoy.toISOString()),
        supabase
          .from('chat_mensajes')
          .select('*', { count: 'exact', head: true })
          .eq('tipo', 'usuario')
          .gte('timestamp', inicioHoy.toISOString()),
        supabase
          .from('usuarios')
          .select('*', { count: 'exact', head: true })
          .eq('activo', true)
          .gte('ultimoacceso', hace7Dias),
        supabase
          .from('chat_mensajes')
          .select('userId')
          .eq('tipo', 'usuario')
          .gte('timestamp', hace7Dias),
        supabase
          .from('historial_consultas')
          .select('consulta,respuesta,categoria,matricula,fechaConsulta')
          .order('fechaConsulta', { ascending: false })
          .limit(1000),
        supabase
          .from('chat_mensajes')
          .select('mensaje,categoria,timestamp,tipo')
          .eq('tipo', 'bot')
          .gte('timestamp', inicioOctubreIso)
          .order('timestamp', { ascending: false })
          .limit(2000),
        supabase
          .from('chat_mensajes')
          .select('sesionId,matricula,mensaje,tipo,timestamp')
          .order('timestamp', { ascending: false })
          .limit(500),
        supabase
          .from('chat_mensajes')
          .select('mensaje,timestamp,tipo')
          .eq('tipo', 'usuario')
          .gte('timestamp', inicioOctubreIso)
          .order('timestamp', { ascending: false })
          .limit(5000)
      ]);

      const falloConsultas =
        Boolean(errConsultasHoy) && Boolean(errConsultasHoyMensajes);
      const falloActivos = Boolean(errActivos7d) && Boolean(errUsuariosMensajes7d);
      const falloTasas = Boolean(errHistorial) && Boolean(errBotMensajes);
      const falloInteracciones = Boolean(errHistorial) && Boolean(errMensajesRecientes);
      const falloTopPreguntas = Boolean(errPreguntasOctubre);
      const primerError =
        (falloConsultas && (errConsultasHoy || errConsultasHoyMensajes)) ||
        (falloActivos && (errActivos7d || errUsuariosMensajes7d)) ||
        (falloTasas && (errHistorial || errBotMensajes)) ||
        (falloInteracciones && (errHistorial || errMensajesRecientes)) ||
        (falloTopPreguntas && errPreguntasOctubre);
      if (primerError) {
        throw new Error(primerError.message || 'No se pudieron cargar las métricas.');
      }

      const historial = historialRaw || [];
      const botMensajes = botMensajesRaw || [];
      const fuenteTasas =
        historial.length > 0
          ? historial.map((h) => ({
              respuesta: h.respuesta,
              categoria: h.categoria
            }))
          : botMensajes.map((m) => ({
              respuesta: m.mensaje,
              categoria: m.categoria
            }));
      const totalAnalizado = fuenteTasas.length;
      const fallbacks = fuenteTasas.filter((h) => esFallbackRespuesta(h.respuesta)).length;
      const exitos = Math.max(0, totalAnalizado - fallbacks);
      const tasaExito = totalAnalizado > 0 ? (exitos / totalAnalizado) * 100 : 0;
      const tasaFallback = totalAnalizado > 0 ? (fallbacks / totalAnalizado) * 100 : 0;

      const usuariosActivosPorMensajes = new Set(
        (usuariosMensajes7dRaw || []).map((row) => row.userId).filter(Boolean)
      ).size;
      const usuariosActivosFinal =
        (activos7d && activos7d > 0 ? activos7d : usuariosActivosPorMensajes) || 0;

      const preguntasOctubre = (preguntasOctubreRaw || [])
        .map((row) => String(row.mensaje || '').trim())
        .filter(Boolean);
      const mapaPreguntasUnicas = new Map();
      preguntasOctubre.forEach((pregunta) => {
        const clave = pregunta.toLowerCase().replace(/\s+/g, ' ');
        mapaPreguntasUnicas.set(clave, (mapaPreguntasUnicas.get(clave) || 0) + 1);
      });
      const mapaIntents = new Map();
      mapaPreguntasUnicas.forEach((total, pregunta) => {
        const intentInferido = inferirIntentDesdeNlu(pregunta, catalogoRasaEstatico.nlu || []);
        if (intentInferido === 'saludo' || intentInferido === 'goodbye') return;
        const etiqueta = formatearIntentParaGrafica(intentInferido);
        const previo = mapaIntents.get(etiqueta);
        if (previo) {
          previo.total += total;
        } else {
          mapaIntents.set(etiqueta, { pregunta: etiqueta, total });
        }
      });
      const totalConsultasDesdeOctubre = preguntasOctubre.length;
      const topPreguntasBase = Array.from(mapaIntents.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 6);
      const totalTop6 = topPreguntasBase.reduce((acc, item) => acc + item.total, 0);
      const topPreguntas = topPreguntasBase.map((item) => ({
        ...item,
        porcentaje: totalTop6 > 0 ? (item.total / totalTop6) * 100 : 0
      }));

      let ultimasInteracciones = [];
      if (historial.length > 0) {
        ultimasInteracciones = historial.slice(0, 6).map((item) => ({
          fecha: item.fechaConsulta,
          matricula: item.matricula || '—',
          pregunta: item.consulta || '—',
          estado: esFallbackRespuesta(item.respuesta) ? 'fallback' : 'éxito'
        }));
      } else {
        const mensajesRecientes = mensajesRecientesRaw || [];
        const candidatosUsuario = mensajesRecientes.filter((m) => m.tipo === 'usuario');
        ultimasInteracciones = candidatosUsuario.slice(0, 6).map((u) => {
          const tsUsuario = new Date(u.timestamp).getTime();
          const botRelacion = mensajesRecientes.find(
            (m) =>
              m.tipo === 'bot' &&
              m.sesionId === u.sesionId &&
              Math.abs(new Date(m.timestamp).getTime() - tsUsuario) <= 2 * 60 * 1000
          );
          const estado = !botRelacion
            ? '—'
            : esFallbackRespuesta(botRelacion.mensaje)
              ? 'fallback'
              : 'éxito';
          return {
            fecha: u.timestamp,
            matricula: u.matricula || '—',
            pregunta: u.mensaje || '—',
            estado
          };
        });
      }

      const matriculasInteracciones = [
        ...new Set(
          ultimasInteracciones
            .map((item) => String(item.matricula || '').trim())
            .filter((m) => m && m !== '—')
        )
      ];
      let mapaNombresPorMatricula = {};
      if (matriculasInteracciones.length > 0) {
        const { data: usuariosPorMatricula, error: errUsuariosPorMatricula } = await supabase
          .from('usuarios')
          .select('matricula,nombre,apellidos')
          .in('matricula', matriculasInteracciones);
        if (!errUsuariosPorMatricula) {
          mapaNombresPorMatricula = (usuariosPorMatricula || []).reduce((acc, row) => {
            const mat = String(row.matricula || '').trim();
            if (!mat) return acc;
            const nombreCompleto = `${String(row.nombre || '').trim()} ${String(
              row.apellidos || ''
            ).trim()}`.trim();
            acc[mat] = nombreCompleto || `@${mat}`;
            return acc;
          }, {});
        }
      }
      ultimasInteracciones = ultimasInteracciones.map((item) => {
        const mat = String(item.matricula || '').trim();
        const alumno =
          (mat && mapaNombresPorMatricula[mat]) || (mat && mat !== '—' ? `@${mat}` : '—');
        return { ...item, alumno };
      });

      setDashboardStats({
        consultasTotalesHoy:
          (consultasHoy && consultasHoy > 0 ? consultasHoy : consultasHoyMensajes) || 0,
        usuariosActivos7d: usuariosActivosFinal,
        tasaExito,
        tasaFallback,
        totalAnalizado,
        ultimasInteracciones,
        topPreguntas,
        totalConsultasDesdeOctubre,
        periodoInicioLabel: inicioOctubre.toLocaleDateString(),
        periodoFinLabel: new Date().toLocaleDateString()
      });
    } catch (error) {
      setDashboardError(
        resumirMensajeErrorAdmin(
          error?.message || 'No se pudieron cargar las métricas del panel principal.'
        )
      );
      setDashboardStats({
        consultasTotalesHoy: 0,
        usuariosActivos7d: 0,
        tasaExito: 0,
        tasaFallback: 0,
        totalAnalizado: 0,
        ultimasInteracciones: [],
        topPreguntas: [],
        totalConsultasDesdeOctubre: 0,
        periodoInicioLabel: '',
        periodoFinLabel: ''
      });
    } finally {
      setDashboardCargando(false);
    }
  }, [esFallbackRespuesta]);

  useEffect(() => {
    cargarUsuarios();
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
    setPanelFaqAbierto(false);
    setNluMenuAbiertoIntent(null);
    setFaqError('');
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
    setCatalogoCargando(true);
    setCatalogoError('');
    try {
      const cat = await fetchCatalogoRasa();
      setCatalogoRasa(cat);
      setCatalogoRemoto(true);
    } catch (e) {
      const detalle = resumirMensajeErrorAdmin(
        e?.message ? String(e.message) : 'Error desconocido'
      );
      setCatalogoError(
        `No se pudo cargar el catálogo desde el servidor Rasa (se muestran datos locales). Motivo: ${detalle}`
      );
      setCatalogoRasa(catalogoRasaEstatico);
      setCatalogoRemoto(false);
    } finally {
      setCatalogoCargando(false);
    }
  }, []);

  useEffect(() => {
    if (seccionAdmin !== 'faq') return undefined;
    cargarCatalogoRemoto();
  }, [seccionAdmin, cargarCatalogoRemoto]);

  useEffect(() => {
    if (seccionAdmin !== 'principal') return undefined;
    cargarDashboard();
    return undefined;
  }, [seccionAdmin, cargarDashboard]);

  useEffect(() => {
    if (nluMenuAbiertoIntent === null) return undefined;
    const cerrar = (e) => {
      if (e.target.closest && e.target.closest('.faq-nlu-menu-wrap')) return;
      setNluMenuAbiertoIntent(null);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [nluMenuAbiertoIntent]);

  const entrenarModeloRasa = async () => {
    setFaqError('');
    setCatalogoError('');
    setCatalogoAviso('');
    try {
      setEntrenandoRasa(true);
      const data = await entrenarRasaAhora();
      if (data.status === 'already_running') {
        setCatalogoAviso('Ya hay un entrenamiento en curso en el servidor.');
      } else {
        setCatalogoAviso('Entrenamiento iniciado en segundo plano. Esperando resultado...');
      }
      for (let intento = 0; intento < 120; intento += 1) {
        const estado = await fetchEstadoEntrenamientoRasa();
        if (estado.running) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        if (estado.lastStatus !== 'ok') {
          const detalle = resumirMensajeErrorAdmin(estado.lastError || 'Error desconocido');
          setCatalogoError(`Entrenamiento finalizado con error: ${detalle}`);
          return;
        }
        if (estado.lastApplyStatus === 'ok') {
          setCatalogoAviso(
            `Entrenamiento completado y modelo aplicado: ${estado.lastApplyDetail || 'ok'}.`
          );
        } else {
          const detalle = resumirMensajeErrorAdmin(
            estado.lastApplyDetail || 'No se pudo aplicar el nuevo modelo automáticamente.'
          );
          setCatalogoError(`Entrenamiento completado, pero no se aplicó el modelo: ${detalle}`);
        }
        return;
      }
      setCatalogoError('El entrenamiento sigue en curso. Revisa de nuevo en unos minutos.');
    } catch (error) {
      setCatalogoError(
        resumirMensajeErrorAdmin(error.message || 'No se pudo iniciar el entrenamiento de Rasa.')
      );
    } finally {
      setEntrenandoRasa(false);
    }
  };

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
  const preguntasPie = dashboardStats.topPreguntas || [];
  const coloresPreguntasPie = ['#0b63ce', '#1fb66f', '#f2ad00', '#a148f0', '#ef4f5f', '#22a6b3'];
  const gradientePreguntasPie =
    preguntasPie.length === 0
      ? '#e5e7eb'
      : (() => {
          let inicio = 0;
          const segmentos = preguntasPie.map((item, idx) => {
            const fin = inicio + item.porcentaje;
            const color = coloresPreguntasPie[idx % coloresPreguntasPie.length];
            const tramo = `${color} ${inicio.toFixed(2)}% ${fin.toFixed(2)}%`;
            inicio = fin;
            return tramo;
          });
          return `conic-gradient(${segmentos.join(', ')})`;
        })();

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
    setIntentForms([crearIntentVacio()]);
    setIntentFormIndex(0);
  };

  const abrirModificarIntent = async (row) => {
    setNluMenuAbiertoIntent(null);
    setFaqError('');
    setIntentPanelModo('editar');
    setGuardandoIntent(true);
    try {
      const det = await fetchIntentDetalle(row.intent);
      if (!det) {
        setIntentForms([{
          intent: row.intent,
          ejemplos: (row.samples || []).join('\n'),
          respuesta: '',
          reglaTitulo: '',
          historiaTitulo: '',
          accionCustom: '',
          previousIntent: row.intent
        }]);
        setFaqError(
          'No se obtuvo detalle del servidor; revisa la API o los datos mostrados pueden estar incompletos.'
        );
      } else {
        setIntentForms([{
          intent: det.intent,
          ejemplos: (det.ejemplos || []).join('\n'),
          respuesta: det.respuesta || '',
          reglaTitulo: det.reglaTitulo || '',
          historiaTitulo: det.historiaTitulo || '',
          accionCustom: det.accionCustom || '',
          previousIntent: det.intent
        }]);
      }
      setIntentFormIndex(0);
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

  const actualizarIntentFormActual = (field, value) => {
    setIntentForms((prev) => {
      const next = [...prev];
      if (!next[intentFormIndex]) next[intentFormIndex] = crearIntentVacio();
      next[intentFormIndex] = { ...next[intentFormIndex], [field]: value };
      return next;
    });
  };

  const irIntentAnterior = () => {
    setFaqError('');
    setIntentFormIndex((prev) => Math.max(prev - 1, 0));
  };

  const irIntentSiguiente = () => {
    setFaqError('');
    setIntentForms((prev) => {
      if (intentFormIndex < prev.length - 1) return prev;
      return [...prev, crearIntentVacio()];
    });
    setIntentFormIndex((prev) => prev + 1);
  };

  const guardarIntentRasaHandler = async (event) => {
    event.preventDefault();
    const normalizarFormulario = (form) => {
      const intent = (form.intent || '').trim();
      const ejemplos = (form.ejemplos || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      const respuesta = (form.respuesta || '').trim();
      const reglaTitulo = (form.reglaTitulo || '').trim();
      const historiaTitulo = (form.historiaTitulo || '').trim();
      const accionCustom = (form.accionCustom || '').trim();
      const previousIntent = (form.previousIntent || '').trim();
      const tieneContenido = Boolean(
        intent || ejemplos.length || respuesta || reglaTitulo || historiaTitulo || accionCustom
      );
      return {
        intent,
        ejemplos,
        respuesta,
        reglaTitulo,
        historiaTitulo,
        accionCustom,
        previousIntent,
        tieneContenido
      };
    };

    let lotes = [];
    if (intentPanelModo === 'editar') {
      lotes = [normalizarFormulario(intentForm)];
    } else {
      lotes = intentForms
        .map((form) => normalizarFormulario(form))
        .filter((form) => form.tieneContenido);
    }

    if (lotes.length === 0) {
      setFaqError('Añade al menos una intención para guardar.');
      return;
    }

    const vistos = new Set();
    for (let idx = 0; idx < lotes.length; idx += 1) {
      const form = lotes[idx];
      const numero = idx + 1;
      if (!form.intent) {
        setFaqError(`Bloque ${numero}: el nombre de intent es obligatorio.`);
        return;
      }
      if (vistos.has(form.intent)) {
        setFaqError(`Bloque ${numero}: el intent "${form.intent}" está repetido en esta carga.`);
        return;
      }
      vistos.add(form.intent);
      if (form.ejemplos.length === 0) {
        setFaqError(`Bloque ${numero}: añade al menos un ejemplo NLU.`);
        return;
      }
      if (!form.respuesta && intentPanelModo === 'crear') {
        setFaqError(`Bloque ${numero}: la respuesta (domain) es obligatoria.`);
        return;
      }
    }

    setFaqError('');
    try {
      setGuardandoIntent(true);
      let catalogFinal = null;
      for (let idx = 0; idx < lotes.length; idx += 1) {
        const form = lotes[idx];
        const payload = {
          intent: form.intent,
          ejemplos: form.ejemplos,
          respuesta: form.respuesta,
          reglaTitulo: form.reglaTitulo,
          historiaTitulo: form.historiaTitulo,
          accionCustom: form.accionCustom
        };
        if (intentPanelModo === 'editar') {
          payload.previousIntent = form.previousIntent || form.intent;
        }
        const data = await guardarIntentRasa(payload);
        if (data.catalog) catalogFinal = data.catalog;
      }
      if (catalogFinal) {
        setCatalogoRasa(catalogFinal);
        setCatalogoRemoto(true);
      } else {
        const cat = await fetchCatalogoRasa();
        setCatalogoRasa(cat);
        setCatalogoRemoto(true);
      }
      setNluExpandidoIntent(lotes[lotes.length - 1].intent);
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
          {dashboardError && <p className="admin-dashboard-error">{dashboardError}</p>}
          {dashboardCargando ? (
            <div className="admin-inline-loading" role="status">
              <div className="spinner" />
              <span>Cargando métricas del panel…</span>
            </div>
          ) : (
            <>
              <div className="admin-kpi-grid">
                <article className="admin-kpi-card">
                  <span className="admin-kpi-icon admin-kpi-icon--consultas" aria-hidden>
                    <img
                      src={process.env.PUBLIC_URL + '/icons/icon-consultas.png'}
                      alt=""
                      className="admin-kpi-icon-img"
                    />
                  </span>
                  <div className="admin-kpi-body">
                    <p className="admin-kpi-title">Consultas totales (hoy)</p>
                    <p className="admin-kpi-value">{dashboardStats.consultasTotalesHoy}</p>
                  </div>
                </article>
                <article className="admin-kpi-card">
                  <span className="admin-kpi-icon admin-kpi-icon--usuarios" aria-hidden>
                    <img
                      src={process.env.PUBLIC_URL + '/icons/icon-usuarios.png'}
                      alt=""
                      className="admin-kpi-icon-img"
                    />
                  </span>
                  <div className="admin-kpi-body">
                    <p className="admin-kpi-title">Usuarios activos (últimos 7 días)</p>
                    <p className="admin-kpi-value">{dashboardStats.usuariosActivos7d}</p>
                  </div>
                </article>
                <article className="admin-kpi-card">
                  <span className="admin-kpi-icon admin-kpi-icon--exito" aria-hidden>
                    <img
                      src={process.env.PUBLIC_URL + '/icons/icon-exito.png'}
                      alt=""
                      className="admin-kpi-icon-img"
                    />
                  </span>
                  <div className="admin-kpi-body">
                    <p className="admin-kpi-title">Tasa de éxito de respuestas</p>
                    <p className="admin-kpi-value">{dashboardStats.tasaExito.toFixed(1)}%</p>
                  </div>
                </article>
                <article className="admin-kpi-card">
                  <span className="admin-kpi-icon admin-kpi-icon--fallback" aria-hidden>
                    <img
                      src={process.env.PUBLIC_URL + '/icons/icon-fallback.png'}
                      alt=""
                      className="admin-kpi-icon-img"
                    />
                  </span>
                  <div className="admin-kpi-body">
                    <p className="admin-kpi-title">Tasa de Fallbacks</p>
                    <p className="admin-kpi-value">{dashboardStats.tasaFallback.toFixed(1)}%</p>
                  </div>
                </article>
              </div>

              <div className="admin-dashboard-grid">
                <section className="admin-dashboard-card admin-dashboard-card--temas">
                  <h3>Distribución de consultas por pregunta</h3>
                  {preguntasPie.length === 0 ? (
                    <p className="admin-dashboard-vacio">Aún no hay consultas para mostrar.</p>
                  ) : (
                    <div className="admin-pastel-contenedor">
                      <div
                        className="admin-pastel-grafica"
                        style={{ background: gradientePreguntasPie }}
                        aria-label="Gráfica de pastel top 6 preguntas"
                      >
                        <div className="admin-pastel-centro">
                          <strong>{dashboardStats.totalConsultasDesdeOctubre}</strong>
                          <span>consultas</span>
                        </div>
                      </div>
                      <ul className="admin-pastel-leyenda">
                        {preguntasPie.map((item, idx) => (
                          <li key={`${item.pregunta}-${idx}`}>
                            <span
                              className="admin-pastel-dot"
                              style={{ backgroundColor: coloresPreguntasPie[idx % coloresPreguntasPie.length] }}
                            />
                            <span className="admin-pastel-pregunta" title={item.pregunta}>
                              {item.pregunta}
                            </span>
                            <span className="admin-pastel-valor">
                              {item.total} ({item.porcentaje.toFixed(1)}%)
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>

                <section className="admin-dashboard-card admin-dashboard-card--preguntas">
                  <h3>Registro de últimas Interacciones del chatbot</h3>
                  {dashboardStats.ultimasInteracciones.length === 0 ? (
                    <p className="admin-dashboard-vacio">Aún no hay interacciones para mostrar.</p>
                  ) : (
                    <div className="admin-dashboard-tabla-wrap">
                      <table className="admin-dashboard-tabla">
                        <thead>
                          <tr>
                            <th>Fecha/Hora</th>
                            <th>Alumno</th>
                            <th>Pregunta</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardStats.ultimasInteracciones.map((item, idx) => (
                            <tr key={`${item.fecha}-${idx}`}>
                              <td>{item.fecha ? new Date(item.fecha).toLocaleString() : '—'}</td>
                              <td>{item.alumno || `@${item.matricula}`}</td>
                              <td>{item.pregunta}</td>
                              <td>
                                <span
                                  className={
                                    item.estado === 'éxito'
                                      ? 'admin-estado admin-estado-exito'
                                      : item.estado === 'fallback'
                                        ? 'admin-estado admin-estado-fallback'
                                        : 'admin-estado'
                                  }
                                >
                                  {item.estado}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
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
              Diccionario de intenciones (nlu.yml): elige una intención para ver ejemplos de lo que dice el usuario.
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
            {catalogoAviso && <p className="faq-catalogo-ok">{catalogoAviso}</p>}
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
              className="actualizar-boton"
              onClick={entrenarModeloRasa}
              disabled={entrenandoRasa || guardandoIntent}
              title="Entrenar modelo de Rasa con los YAML actuales"
              aria-label="Entrenar modelo Rasa"
            >
              {entrenandoRasa ? 'Entrenando…' : 'Entrenar'}
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
                Como funcionan NLU, domain.yml, rules.yml y stories.yml en una misma intención
              </summary>
              <div className="faq-rasa-ayuda-body">
                <p>
                  <strong>nlu.yml</strong> — Aquí va como escribe el usuario.
                </p>
                <p>
                  <strong>domain.yml</strong> — Aquí es obligatorio declarar todos los elementos que
                  interactúan en la plataforma: las intenciones, las entidades, los slots, los textos de
                  respuesta (<code>utter_*</code>) y las acciones personalizadas.
                </p>
                <p>
                  <strong>stories.yml</strong> — Se utiliza para entrenar el manejo de conversaciones más
                  largas y variables.
                </p>
                <p>
                  <strong>rules.yml</strong> — Sirve para configurar condiciones donde un intent dispara
                  siempre la misma acción, sin importar lo que haya pasado antes en el historial del chat.
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
                            Frases que enseñan al bot a reconocer esta intención.
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
                <div className="faq-panel-cabecera-izquierda">
                  <h2 id="faq-panel-titulo">
                    {intentPanelModo === 'editar'
                      ? 'Modificar intención'
                      : 'Nueva intención completa'}
                  </h2>
                  {intentPanelModo === 'crear' && (
                    <div className="faq-intent-navegacion" aria-label="Navegación de bloques">
                      <button
                        type="button"
                        className="faq-intent-nav-boton"
                        onClick={irIntentAnterior}
                        disabled={intentFormIndex === 0 || guardandoIntent}
                        title="Bloque anterior"
                        aria-label="Bloque anterior"
                      >
                        ←
                      </button>
                      <span className="faq-intent-nav-indice">
                        {intentFormIndex + 1} / {intentForms.length}
                      </span>
                      <button
                        type="button"
                        className="faq-intent-nav-boton"
                        onClick={irIntentSiguiente}
                        disabled={guardandoIntent}
                        title="Siguiente bloque (crea uno nuevo si estás en el último)"
                        aria-label="Siguiente bloque"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
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
                    onChange={(event) => actualizarIntentFormActual('intent', event.target.value.trim())}
                  />
                </label>
                <label>
                  Ejemplos NLU (una línea por ejemplo)
                  <textarea
                    rows="6"
                    placeholder={"hola\nbuenas tardes\nquiero saber sobre ..."}
                    value={intentForm.ejemplos}
                    onChange={(event) => actualizarIntentFormActual('ejemplos', event.target.value)}
                  />
                </label>
                <label>
                  Respuesta principal (domain utter)
                  <textarea
                    rows="5"
                    placeholder="Texto que dirá el bot."
                    value={intentForm.respuesta}
                    onChange={(event) => actualizarIntentFormActual('respuesta', event.target.value)}
                  />
                </label>
                <label>
                  Título de regla (rules.yml)
                  <input
                    type="text"
                    placeholder="Regla ask_for_ejemplo"
                    value={intentForm.reglaTitulo}
                    onChange={(event) => actualizarIntentFormActual('reglaTitulo', event.target.value)}
                  />
                </label>
                <label>
                  Título de historia (stories.yml)
                  <input
                    type="text"
                    placeholder="Historia ask_for_ejemplo"
                    value={intentForm.historiaTitulo}
                    onChange={(event) => actualizarIntentFormActual('historiaTitulo', event.target.value)}
                  />
                </label>
                <label>
                  Acción custom opcional (si no, se usa utter_intent)
                  <input
                    type="text"
                    placeholder="action_algo_especial"
                    value={intentForm.accionCustom}
                    onChange={(event) => actualizarIntentFormActual('accionCustom', event.target.value)}
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
                        : `Guardar ${intentForms.filter((f) => (f.intent || '').trim() || (f.ejemplos || '').trim() || (f.respuesta || '').trim()).length || 1} intención(es)`}
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
