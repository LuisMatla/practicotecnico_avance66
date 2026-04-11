// formulario de inicio de sesion con supabase.
import React, { useState } from 'react'; //react y estado.
import { Link, useNavigate } from 'react-router-dom'; //links y navegacion.
import { iniciarSesion } from '../servicios/supabase'; //login de usuario (matricula/password).
import { supabase } from '../supabase/config'; //auth directo para admin.
import './Login.css'; //estilos del login principal.

const Login = () => {
  const [formulario, setFormulario] = useState({
    usuario: '', //matricula o usuario.
    contraseña: '' //password.
  }); //estado del formulario.

  const [mostrarContraseña, setMostrarContraseña] = useState(false); //toggle de input type.
  const [cargando, setCargando] = useState(false); //bloquea boton mientras autentica.
  const navigate = useNavigate(); //funcion para navegar rutas.

  const manejarCambio = (e) => {
    setFormulario({
      ...formulario,
      [e.target.name]: e.target.value //actualiza campo dinamico.
    }); //actualiza estado de formulario.
  };

  const manejarEnvio = async (e) => {
    e.preventDefault(); //evita submit nativo.
    setCargando(true); //activa estado de carga.
    
    try {
      if (formulario.usuario.toLowerCase() === 'admin' && formulario.contraseña === 'superdemian') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ //login admin via supabase auth.
          email: 'admin@bitbotfiee.xyz', //correo fijo del admin.
          password: 'superdemian' //password fija del admin.
        });

        if (authError) {
          console.error('Error autenticando admin:', authError); //log tecnico.
          return; //corta flujo.
        }

        if (!authData.user) {
          return; //corta si no hay user.
        }

        localStorage.setItem('adminSession', 'true'); //marca sesion admin local.
        localStorage.setItem('adminUser', 'admin'); //marca usuario admin local.
        
        console.log('Admin autenticado con Supabase Auth:', authData.user.id); //log de auditoria.
        navigate('/admin'); //redirige al panel admin.
        return; //evita caer al login normal.
      }
      
      const response = await iniciarSesion(
        formulario.usuario, //matricula.
        formulario.contraseña //password.
      ); //login normal del usuario.
      
      if (response.success) {
        navigate('/chat'); //redirige al chat.
      }
    } catch (error) {
    } finally {
      setCargando(false); //libera UI.
    }
  };

  const toggleMostrarContraseña = () => {
    setMostrarContraseña(!mostrarContraseña); //invierte visibilidad.
  };

  return (
    <div className="pagina-login">
      <div className="gif-contenedor">
        <img 
          src={process.env.PUBLIC_URL + '/bot.gif'} 
          alt="Bot GIF" 
          className="gif-bot"
        />
      </div>
      <div className="contenedor-login">
        <div className="tarjeta-login">
          <div className="header-formulario">
            <div className="logo-contenedor">
              <img 
                src={process.env.PUBLIC_URL + '/bitbot-logo.png'} 
                alt="BiTBoT Logo" 
                className="logo-bitbot"
              />
            </div>
            <h2 className="subtitulo">Inicio de sesión</h2>
          </div>

          <form className="formulario-login" onSubmit={manejarEnvio}>
            <div className="campo-formulario">
              <label htmlFor="usuario">Matrícula</label>
              <input
                type="text"
                id="usuario"
                name="usuario"
                value={formulario.usuario}
                onChange={manejarCambio}
                placeholder="Ej: S21234567"
                required
              />
            </div>

            <div className="campo-formulario">
              <label htmlFor="contraseña">Contraseña</label>
              <div className="input-contenedor">
                <input
                  type={mostrarContraseña ? "text" : "password"}
                  id="contraseña"
                  name="contraseña"
                  value={formulario.contraseña}
                  onChange={manejarCambio}
                  placeholder="Tu contraseña"
                  required
                />
                <button
                  type="button"
                  className="boton-mostrar-contraseña"
                  onClick={toggleMostrarContraseña}
                  aria-label={mostrarContraseña ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {mostrarContraseña ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>

            <button type="submit" className="boton-login" disabled={cargando}>
              {cargando ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="enlaces-ayuda">
            <Link to="/registro" className="enlace-ayuda">
              ¿No tienes cuenta? Regístrate aquí
            </Link>
            <button type="button" className="enlace-ayuda" onClick={() => {}}>
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
