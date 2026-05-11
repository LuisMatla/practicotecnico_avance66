
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registrarUsuario } from '../servicios/supabase';
import './Registro.css';

const Registro = () => {
  const [formulario, setFormulario] = useState({
    nombre: '',
    apellidos: '',
    matricula: '',
    carrera: '',
    facultad: 'Facultad de Ingeniería Eléctrica y Electrónica',
    correo: '',
    fechaNacimiento: '',
    password: '',
    confirmarPassword: ''
  });

  const [errores, setErrores] = useState({
    matricula: '',
    correo: ''
  });

  const [cargando, setCargando] = useState(false);
  const [mensajeCarga, setMensajeCarga] = useState('');
  const navigate = useNavigate();

  const validarMatricula = (matricula) => {
    const regex = /^S2\d{7}$/;
    return regex.test(matricula);
  };

  const validarCorreo = (correo, matricula) => {
    if (!matricula) {
      return { valido: false, mensaje: 'Primero ingresa tu matrícula' };
    }

    const correoEsperado = `z${matricula}@estudiantes.uv.mx`;

    if (correo !== correoEsperado) {
      return {
        valido: false,
        mensaje: `El correo debe ser: z${matricula}@estudiantes.uv.mx`
      };
    }

    return { valido: true, mensaje: '' };
  };

  const manejarCambio = (e) => {
    const { name, value } = e.target;

    setFormulario({
      ...formulario,
      [name]: value
    });

    if (name === 'matricula') {
      if (value && !validarMatricula(value)) {
        setErrores({
          ...errores,
          matricula: 'La matrícula debe empezar con S2 seguido de 7 dígitos (Ej: S21234567)'
        });
      } else {
        setErrores({
          ...errores,
          matricula: ''
        });
      }
    }

    if (name === 'correo') {
      const resultadoValidacion = validarCorreo(value, formulario.matricula);
      if (value && !resultadoValidacion.valido) {
        setErrores({
          ...errores,
          correo: resultadoValidacion.mensaje
        });
      } else {
        setErrores({
          ...errores,
          correo: ''
        });
      }
    }
  };

  const manejarEnvio = async (e) => {
    e.preventDefault();

    if (!validarMatricula(formulario.matricula)) {
      return;
    }

    const resultadoCorreo = validarCorreo(formulario.correo, formulario.matricula);
    if (!resultadoCorreo.valido) {
      return;
    }

    if (!formulario.password || formulario.password.length < 8) {
      return;
    }

    if (formulario.password !== formulario.confirmarPassword) {
      return;
    }

    setCargando(true);
    setMensajeCarga('Registrando...');

    try {
      const response = await registrarUsuario({
        ...formulario,
        password: formulario.password
      });

      if (response && response.success) {
        setMensajeCarga('¡Listo!');
        await new Promise(resolve => setTimeout(resolve, 1000));
        navigate('/');
      } else {
        setMensajeCarga('¡Listo!');
        await new Promise(resolve => setTimeout(resolve, 1000));
        navigate('/');
      }
    } catch (error) {
      console.error('Error en registro:', error);

      if (error.message.includes('bloqueado')) {
      } else {
      }
    } finally {
      setCargando(false);
      setMensajeCarga('');
    }
  };

  return (
    <div className="pagina-registro">
      <div className="contenedor-registro">
        <div className="tarjeta-registro">
          <div className="header-formulario">
            <div className="logo-contenedor">
              <img
                src={process.env.PUBLIC_URL + '/bitbot-logo.png'}
                alt="BiTBoT Logo"
                className="logo-bitbot"
              />
            </div>
            <h2 className="subtitulo">Registro de usuario</h2>
          </div>

          <form className="formulario-registro" onSubmit={manejarEnvio}>
            <div className="campo-formulario">
              <label htmlFor="nombre">Nombre</label>
              <input
                type="text"
                id="nombre"
                name="nombre"
                value={formulario.nombre}
                onChange={manejarCambio}
                placeholder="Tu nombre"
                required
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="apellidos">Apellidos</label>
              <input
                type="text"
                id="apellidos"
                name="apellidos"
                value={formulario.apellidos}
                onChange={manejarCambio}
                placeholder="Tus apellidos"
                required
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="matricula">Matrícula</label>
              <input
                type="text"
                id="matricula"
                name="matricula"
                value={formulario.matricula}
                onChange={manejarCambio}
                placeholder="Ej: S21234567"
                maxLength="9"
                required
                className={errores.matricula ? 'campo-error' : ''}
              />
              {errores.matricula && (
                <span className="mensaje-error">{errores.matricula}</span>
              )}
            </div>

            <div className="campo-formulario">
              <label htmlFor="carrera">Carrera</label>
              <select
                id="carrera"
                name="carrera"
                value={formulario.carrera}
                onChange={manejarCambio}
                required
              >
                <option value="">Selecciona tu carrera</option>
                <option value="Ingeniería Informática">Ingeniería Informática</option>
                <option value="Ingeniería Mecatrónica">Ingeniería Mecatrónica</option>
                <option value="Ingeniería Electrónica y Comunicaciones">Ingeniería Electrónica y Comunicaciones</option>
              </select>
            </div>

            <div className="campo-formulario">
              <label htmlFor="facultad">Facultad</label>
              <input
                type="text"
                id="facultad"
                name="facultad"
                value={formulario.facultad}
                readOnly
                className="campo-readonly"
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="correo">Correo electrónico</label>
              <input
                type="text"
                id="correo"
                name="correo"
                value={formulario.correo}
                onChange={manejarCambio}
                placeholder="correo@estudiantes.uv.mx"
                required
                disabled={!validarMatricula(formulario.matricula)}
                className={errores.correo ? 'campo-error' : ''}
              />
              {errores.correo && (
                <span className="mensaje-error">{errores.correo}</span>
              )}
              {!validarMatricula(formulario.matricula) && formulario.matricula && (
                <span className="mensaje-info">Ingresa primero una matrícula válida para habilitar este campo</span>
              )}
            </div>

            <div className="campo-formulario">
              <label htmlFor="fechaNacimiento">Fecha de nacimiento</label>
              <input
                type="date"
                id="fechaNacimiento"
                name="fechaNacimiento"
                value={formulario.fechaNacimiento}
                onChange={manejarCambio}
                required
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="password">Contraseña</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formulario.password}
                onChange={manejarCambio}
                placeholder="Mínimo 8 caracteres"
                required
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="confirmarPassword">Confirmar contraseña</label>
              <input
                type="password"
                id="confirmarPassword"
                name="confirmarPassword"
                value={formulario.confirmarPassword}
                onChange={manejarCambio}
                placeholder="Repite tu contraseña"
                required
              />
            </div>

            <button type="submit" className="boton-registro" disabled={cargando}>
              {cargando ? (mensajeCarga || 'Registrando...') : 'Registrarse'}
            </button>
          </form>

          <div className="enlaces-ayuda">
            <Link to="/" className="enlace-ayuda">
              ¿Ya tienes cuenta? Inicia sesión aquí
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

};

export default Registro;

