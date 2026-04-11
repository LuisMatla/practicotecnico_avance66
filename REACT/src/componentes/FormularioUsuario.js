// modal crear o editar usuario desde el panel admin.
import React, { useState, useEffect } from 'react'; //react y hooks.
import { crearUsuarioAdmin, actualizarUsuarioAdmin } from '../servicios/supabase'; //servicios CRUD admin.
import './FormularioUsuario.css'; //estilos del modal.

const FormularioUsuario = ({ usuario, onCerrar, onGuardar }) => {
  const [formulario, setFormulario] = useState({
    nombre: '', //campo nombre.
    apellidos: '', //campo apellidos.
    matricula: '', //campo matricula.
    carrera: 'Ingeniería Informática', //valor por defecto.
    facultad: 'Facultad de Ingeniería Eléctrica y Electrónica', //valor por defecto.
    correo: '', //campo correo.
    fechaNacimiento: '', //campo fecha (input type=date).
    activo: true //estado activo del usuario.
  }); //estado del formulario.
  const [cargando, setCargando] = useState(false); //bloquea inputs al guardar.
  const [errores, setErrores] = useState({}); //errores por campo.

  const carreras = [
    'Ingeniería Informática',
    'Ingeniería Mecatrónica',
    'Ingeniería Electrónica y Comunicaciones'
  ]; //opciones de carrera.

  useEffect(() => {
    if (usuario) { //si viene usuario, es modo edicion.
      setFormulario({
        nombre: usuario.nombre || '', //prellena nombre.
        apellidos: usuario.apellidos || '', //prellena apellidos.
        matricula: usuario.matricula || '', //prellena matricula.
        carrera: usuario.carrera || 'Ingeniería Informática', //prellena carrera.
        facultad: usuario.facultad || 'Facultad de Ingeniería Eléctrica y Electrónica', //prellena facultad.
        correo: usuario.correo || '', //prellena correo.
        fechaNacimiento: usuario.fechanacimiento || '', //mapea fechanacimiento → fechaNacimiento.
        activo: usuario.activo !== undefined ? usuario.activo : true //prellena activo.
      });
    }
  }, [usuario]);

  const manejarCambio = (e) => {
    const { name, value, type, checked } = e.target; //lee evento del input.
    setFormulario(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value //soporta checkbox y texto.
    })); //actualiza campo dinamico.
    
    if (errores[name]) { //si habia error en ese campo.
      setErrores(prev => ({
        ...prev,
        [name]: '' //limpia el error al cambiar.
      })); //actualiza errores.
    }
  };

  const validarFormulario = () => {
    const nuevosErrores = {}; //objeto acumulador de errores.

    if (!formulario.nombre.trim()) { //valida nombre.
      nuevosErrores.nombre = 'El nombre es requerido'; //mensaje de error.
    }

    if (!formulario.apellidos.trim()) { //valida apellidos.
      nuevosErrores.apellidos = 'Los apellidos son requeridos'; //mensaje de error.
    }

    if (!formulario.matricula.trim()) { //valida matricula.
      nuevosErrores.matricula = 'La matrícula es requerida'; //mensaje de error.
    } else if (!/^[Ss]\d{8}$/.test(formulario.matricula)) { //valida formato S########.
      nuevosErrores.matricula = 'Formato de matrícula inválido (ej: S21020225)'; //mensaje de error.
    }

    if (!formulario.correo.trim()) { //valida correo.
      nuevosErrores.correo = 'El correo es requerido'; //mensaje de error.
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulario.correo)) { //valida regex simple de email.
      nuevosErrores.correo = 'Formato de correo inválido'; //mensaje de error.
    }

    if (!formulario.fechaNacimiento) { //valida fecha.
      nuevosErrores.fechaNacimiento = 'La fecha de nacimiento es requerida'; //mensaje de error.
    }

    setErrores(nuevosErrores); //refleja errores en UI.
    return Object.keys(nuevosErrores).length === 0; //true si no hay errores.
  };

  const manejarEnvio = async (e) => {
    e.preventDefault(); //evita submit nativo.

    if (!validarFormulario()) {
      return; //corta si hay errores.
    }

    try {
      setCargando(true); //bloquea UI mientras guarda.

      if (usuario) {
        await actualizarUsuarioAdmin(usuario.uid, formulario); //actualiza usuario existente.
        onGuardar(); //notifica para refrescar lista.
        onCerrar(); //cierra modal.
      } else {
        await crearUsuarioAdmin(formulario); //crea usuario nuevo.
        onGuardar(); //notifica para refrescar lista.
        onCerrar(); //cierra modal.
      }
    } catch (error) {
      console.error('Error en formulario:', error); //log del error.
    } finally {
      setCargando(false); //libera UI.
    }
  };

  return (
    <div className="formulario-usuario-overlay"> {/*fondo semitransparente del modal*/}
      <div className="formulario-usuario-container"> {/*tarjeta del modal*/}
        <div className="formulario-usuario-header"> {/*cabecera con titulo y cerrar*/}
          <h2>{usuario ? 'Editar Usuario' : 'Crear Usuario'}</h2> {/*titulo segun modo*/}
          <button className="cerrar-formulario-boton" onClick={onCerrar}> {/*cierra sin guardar*/}
          </button>
        </div>

        <form onSubmit={manejarEnvio} className="formulario-usuario-form"> {/*formulario principal*/}
          <div className="formulario-grid"> {/*grid de campos*/}
            <div className="form-group"> {/*grupo nombre*/}
              <label htmlFor="nombre">Nombre *</label> {/*etiqueta nombre*/}
              <input
                type="text" //texto simple.
                id="nombre" //id para accesibilidad.
                name="nombre" //nombre del campo en estado.
                value={formulario.nombre} //valor controlado.
                onChange={manejarCambio} //actualiza estado.
                className={errores.nombre ? 'error' : ''} //marca error visual.
                disabled={cargando} //bloquea mientras guarda.
              />
              {errores.nombre && <span className="error-text">{errores.nombre}</span>} {/*mensaje error*/}
            </div>

            <div className="form-group"> {/*grupo apellidos*/}
              <label htmlFor="apellidos">Apellidos *</label> {/*etiqueta apellidos*/}
              <input
                type="text" //texto simple.
                id="apellidos" //id para accesibilidad.
                name="apellidos" //nombre del campo en estado.
                value={formulario.apellidos} //valor controlado.
                onChange={manejarCambio} //actualiza estado.
                className={errores.apellidos ? 'error' : ''} //marca error visual.
                disabled={cargando} //bloquea mientras guarda.
              />
              {errores.apellidos && <span className="error-text">{errores.apellidos}</span>} {/*mensaje error*/}
            </div>

            <div className="form-group"> {/*grupo matricula*/}
              <label htmlFor="matricula">Matrícula *</label> {/*etiqueta matricula*/}
              <input
                type="text" //texto simple.
                id="matricula" //id para accesibilidad.
                name="matricula" //nombre del campo en estado.
                value={formulario.matricula} //valor controlado.
                onChange={manejarCambio} //actualiza estado.
                placeholder="S21020225" //ejemplo de formato.
                className={errores.matricula ? 'error' : ''} //marca error visual.
                disabled={cargando} //bloquea mientras guarda.
              />
              {errores.matricula && <span className="error-text">{errores.matricula}</span>} {/*mensaje error*/}
            </div>

            <div className="form-group"> {/*grupo correo*/}
              <label htmlFor="correo">Correo Electrónico *</label> {/*etiqueta correo*/}
              <input
                type="email" //tipo email (validacion basica del navegador).
                id="correo" //id para accesibilidad.
                name="correo" //nombre del campo en estado.
                value={formulario.correo} //valor controlado.
                onChange={manejarCambio} //actualiza estado.
                className={errores.correo ? 'error' : ''} //marca error visual.
                disabled={cargando} //bloquea mientras guarda.
              />
              {errores.correo && <span className="error-text">{errores.correo}</span>} {/*mensaje error*/}
            </div>

            <div className="form-group"> {/*grupo carrera*/}
              <label htmlFor="carrera">Carrera *</label> {/*etiqueta carrera*/}
              <select
                id="carrera" //id para accesibilidad.
                name="carrera" //nombre del campo en estado.
                value={formulario.carrera} //valor controlado.
                onChange={manejarCambio} //actualiza estado.
                disabled={cargando} //bloquea mientras guarda.
              >
                {carreras.map(carrera => (
                  <option key={carrera} value={carrera}>{carrera}</option> {/*opcion de carrera*/}
                ))}
              </select>
            </div>

            <div className="form-group"> {/*grupo fecha nacimiento*/}
              <label htmlFor="fechaNacimiento">Fecha de Nacimiento *</label> {/*etiqueta fecha*/}
              <input
                type="date" //selector de fecha.
                id="fechaNacimiento" //id para accesibilidad.
                name="fechaNacimiento" //nombre del campo en estado.
                value={formulario.fechaNacimiento} //valor controlado.
                onChange={manejarCambio} //actualiza estado.
                className={errores.fechaNacimiento ? 'error' : ''} //marca error visual.
                disabled={cargando} //bloquea mientras guarda.
              />
              {errores.fechaNacimiento && <span className="error-text">{errores.fechaNacimiento}</span>} {/*mensaje error*/}
            </div>

            <div className="form-group"> {/*grupo facultad*/}
              <label htmlFor="facultad">Facultad</label> {/*etiqueta facultad*/}
              <input
                type="text" //texto simple.
                id="facultad" //id para accesibilidad.
                name="facultad" //nombre del campo en estado.
                value={formulario.facultad} //valor controlado.
                onChange={manejarCambio} //actualiza estado.
                disabled={cargando} //bloquea mientras guarda.
              />
            </div>

            <div className="form-group checkbox-group"> {/*grupo activo*/}
              <label className="checkbox-label"> {/*label envuelve checkbox*/}
                <input
                  type="checkbox" //booleano activo/inactivo.
                  name="activo" //nombre del campo en estado.
                  checked={formulario.activo} //valor controlado.
                  onChange={manejarCambio} //actualiza estado.
                  disabled={cargando} //bloquea mientras guarda.
                />
                <span className="checkbox-text">Usuario activo</span> {/*texto del checkbox*/}
              </label>
            </div>
          </div>

          <div className="formulario-usuario-actions"> {/*acciones inferiores*/}
            <button
              type="button" //no hace submit del form.
              className="cancelar-boton" //estilo secundario.
              onClick={onCerrar} //cierra modal.
              disabled={cargando} //bloquea mientras guarda.
            >
              Cancelar
            </button>
            <button
              type="submit" //dispara onSubmit del form.
              className="guardar-boton" //estilo primario.
              disabled={cargando} //bloquea doble envio.
            >
              {cargando ? (
                <>
                  <div className="spinner"></div> {/*spinner de carga*/}
                  {usuario ? 'Actualizando...' : 'Creando...'} {/*texto segun modo*/}
                </>
              ) : (
                usuario ? 'Actualizar Usuario' : 'Crear Usuario'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FormularioUsuario;


