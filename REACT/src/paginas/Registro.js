// alta de usuario y validacion de campos del registro.
import React, { useState } from 'react'; //react y estado.
import { Link, useNavigate } from 'react-router-dom'; //links y navegacion.
import { registrarUsuario } from '../servicios/supabase'; //servicio de registro.
import './Registro.css'; //estilos del registro.

const Registro = () => {
  const [formulario, setFormulario] = useState({
    nombre: '', //campo nombre.
    apellidos: '', //campo apellidos.
    matricula: '', //campo matricula.
    carrera: '', //campo carrera.
    facultad: 'Facultad de Ingeniería Eléctrica y Electrónica', //valor fijo.
    correo: '', //campo correo institucional.
    fechaNacimiento: '', //campo fecha.
    password: '', //password.
    confirmarPassword: '' //confirmacion.
  }); //estado del formulario.

  const [errores, setErrores] = useState({
    matricula: '', //error de matricula.
    correo: '' //error de correo.
  }); //estado de errores.
 
  const [cargando, setCargando] = useState(false); //bloquea boton mientras registra.
  const [mensajeCarga, setMensajeCarga] = useState(''); //texto de progreso.
  const navigate = useNavigate(); //funcion para navegar rutas.

  const validarMatricula = (matricula) => {
    const regex = /^S2\d{7}$/; //S2 + 7 digitos.
    return regex.test(matricula); //true si cumple.
  };

  const validarCorreo = (correo, matricula) => {
    if (!matricula) {
      return { valido: false, mensaje: 'Primero ingresa tu matrícula' }; //requiere matricula primero.
    }
    
    const correoEsperado = `z${matricula}@estudiantes.uv.mx`; //correo institucional esperado.
    
    if (correo !== correoEsperado) {
      return { 
        valido: false, 
        mensaje: `El correo debe ser: z${matricula}@estudiantes.uv.mx` 
      };
    }
    
    return { valido: true, mensaje: '' }; //correo valido.
  };

  const manejarCambio = (e) => {
    const { name, value } = e.target; //lee campo modificado.
    
    setFormulario({
      ...formulario,
      [name]: value //actualiza campo dinamico.
    }); //actualiza estado.

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
      const resultadoValidacion = validarCorreo(value, formulario.matricula); //valida contra matricula actual.
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
    e.preventDefault(); //evita submit nativo.
    
    if (!validarMatricula(formulario.matricula)) {
      return; //corta si matricula invalida.
    }

    const resultadoCorreo = validarCorreo(formulario.correo, formulario.matricula); //valida correo institucional.
    if (!resultadoCorreo.valido) {
      return; //corta si correo invalido.
    }

    if (!formulario.password || formulario.password.length < 8) {
      return; //corta si password corta.
    }

    if (formulario.password !== formulario.confirmarPassword) {
      return; //corta si no coincide.
    }
    
    setCargando(true); //activa carga.
    setMensajeCarga('Registrando...'); //mensaje UI.
    
    try {
      const response = await registrarUsuario({
        ...formulario,
        password: formulario.password //envia password final.
      }); //registra usuario en supabase.
      
      if (response && response.success) {
        setMensajeCarga('¡Listo!'); //mensaje UI.
        await new Promise(resolve => setTimeout(resolve, 1000)); //pausa corta para feedback.
        navigate('/'); //vuelve al login.
      } else {
        setMensajeCarga('¡Listo!'); //mensaje UI (misma salida).
        await new Promise(resolve => setTimeout(resolve, 1000)); //pausa corta.
        navigate('/'); //vuelve al login.
      }
    } catch (error) {
      console.error('Error en registro:', error); //log tecnico.
      
      if (error.message.includes('bloqueado')) {
      } else {
      }
    } finally {
      setCargando(false); //libera UI.
      setMensajeCarga(''); //limpia mensaje.
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



