
import React, { useState, useEffect } from 'react';
import { crearUsuarioAdmin, actualizarUsuarioAdmin } from '../servicios/supabase';
import './FormularioUsuario.css';

const FormularioUsuario = ({ usuario, onCerrar, onGuardar }) => {
  const [formulario, setFormulario] = useState({
    nombre: '',
    apellidos: '',
    matricula: '',
    carrera: 'Ingeniería Informática',
    facultad: 'Facultad de Ingeniería Eléctrica y Electrónica',
    correo: '',
    fechaNacimiento: '',
    activo: true
  });
  const [cargando, setCargando] = useState(false);
  const [errores, setErrores] = useState({});

  const carreras = [
    'Ingeniería Informática',
    'Ingeniería Mecatrónica',
    'Ingeniería Electrónica y Comunicaciones'
  ];

  useEffect(() => {
    if (usuario) {
      setFormulario({
        nombre: usuario.nombre || '',
        apellidos: usuario.apellidos || '',
        matricula: usuario.matricula || '',
        carrera: usuario.carrera || 'Ingeniería Informática',
        facultad: usuario.facultad || 'Facultad de Ingeniería Eléctrica y Electrónica',
        correo: usuario.correo || '',
        fechaNacimiento: usuario.fechanacimiento || '',
        activo: usuario.activo !== undefined ? usuario.activo : true
      });
    }
  }, [usuario]);

  const manejarCambio = (e) => {
    const { name, value, type, checked } = e.target;
    setFormulario(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    if (errores[name]) {
      setErrores(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validarFormulario = () => {
    const nuevosErrores = {};

    if (!formulario.nombre.trim()) {
      nuevosErrores.nombre = 'El nombre es requerido';
    }

    if (!formulario.apellidos.trim()) {
      nuevosErrores.apellidos = 'Los apellidos son requeridos';
    }

    if (!formulario.matricula.trim()) {
      nuevosErrores.matricula = 'La matrícula es requerida';
    } else if (!/^[Ss]\d{8}$/.test(formulario.matricula)) {
      nuevosErrores.matricula = 'Formato de matrícula inválido (ej: S21020225)';
    }

    if (!formulario.correo.trim()) {
      nuevosErrores.correo = 'El correo es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulario.correo)) {
      nuevosErrores.correo = 'Formato de correo inválido';
    }

    if (!formulario.fechaNacimiento) {
      nuevosErrores.fechaNacimiento = 'La fecha de nacimiento es requerida';
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const manejarEnvio = async (e) => {
    e.preventDefault();

    if (!validarFormulario()) {
      return;
    }

    try {
      setCargando(true);

      if (usuario) {
        await actualizarUsuarioAdmin(usuario.uid, formulario);
        onGuardar();
        onCerrar();
      } else {
        await crearUsuarioAdmin(formulario);
        onGuardar();
        onCerrar();
      }
    } catch (error) {
      console.error('Error en formulario:', error);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="formulario-usuario-overlay"> {}
      <div className="formulario-usuario-container"> {}
        <div className="formulario-usuario-header"> {}
          <h2>{usuario ? 'Editar Usuario' : 'Crear Usuario'}</h2> {}
          <button className="cerrar-formulario-boton" onClick={onCerrar}> {}
          </button>
        </div>

        <form onSubmit={manejarEnvio} className="formulario-usuario-form"> {}
          <div className="formulario-grid"> {}
            <div className="form-group"> {}
              <label htmlFor="nombre">Nombre *</label> {}
              <input
                type="text"
                id="nombre"
                name="nombre"
                value={formulario.nombre}
                onChange={manejarCambio}
                className={errores.nombre ? 'error' : ''}
                disabled={cargando}
              />
              {errores.nombre && <span className="error-text">{errores.nombre}</span>} {}
            </div>

            <div className="form-group"> {}
              <label htmlFor="apellidos">Apellidos *</label> {}
              <input
                type="text"
                id="apellidos"
                name="apellidos"
                value={formulario.apellidos}
                onChange={manejarCambio}
                className={errores.apellidos ? 'error' : ''}
                disabled={cargando}
              />
              {errores.apellidos && <span className="error-text">{errores.apellidos}</span>} {}
            </div>

            <div className="form-group"> {}
              <label htmlFor="matricula">Matrícula *</label> {}
              <input
                type="text"
                id="matricula"
                name="matricula"
                value={formulario.matricula}
                onChange={manejarCambio}
                placeholder="S21020225"
                className={errores.matricula ? 'error' : ''}
                disabled={cargando}
              />
              {errores.matricula && <span className="error-text">{errores.matricula}</span>} {}
            </div>

            <div className="form-group"> {}
              <label htmlFor="correo">Correo Electrónico *</label> {}
              <input
                type="email"
                id="correo"
                name="correo"
                value={formulario.correo}
                onChange={manejarCambio}
                className={errores.correo ? 'error' : ''}
                disabled={cargando}
              />
              {errores.correo && <span className="error-text">{errores.correo}</span>} {}
            </div>

            <div className="form-group"> {}
              <label htmlFor="carrera">Carrera *</label> {}
              <select
                id="carrera"
                name="carrera"
                value={formulario.carrera}
                onChange={manejarCambio}
                disabled={cargando}
              >
                {carreras.map((carrera) => (
                  <option key={carrera} value={carrera}>
                    {carrera}
                    {}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group"> {}
              <label htmlFor="fechaNacimiento">Fecha de Nacimiento *</label> {}
              <input
                type="date"
                id="fechaNacimiento"
                name="fechaNacimiento"
                value={formulario.fechaNacimiento}
                onChange={manejarCambio}
                className={errores.fechaNacimiento ? 'error' : ''}
                disabled={cargando}
              />
              {errores.fechaNacimiento && <span className="error-text">{errores.fechaNacimiento}</span>} {}
            </div>

            <div className="form-group"> {}
              <label htmlFor="facultad">Facultad</label> {}
              <input
                type="text"
                id="facultad"
                name="facultad"
                value={formulario.facultad}
                onChange={manejarCambio}
                disabled={cargando}
              />
            </div>

            <div className="form-group checkbox-group"> {}
              <label className="checkbox-label"> {}
                <input
                  type="checkbox"
                  name="activo"
                  checked={formulario.activo}
                  onChange={manejarCambio}
                  disabled={cargando}
                />
                <span className="checkbox-text">Usuario activo</span> {}
              </label>
            </div>
          </div>

          <div className="formulario-usuario-actions"> {}
            <button
              type="button"
              className="cancelar-boton"
              onClick={onCerrar}
              disabled={cargando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="guardar-boton"
              disabled={cargando}
            >
              {cargando ? (
                <>
                  <div className="spinner"></div> {}
                  {usuario ? 'Actualizando...' : 'Creando...'} {}
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

