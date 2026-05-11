
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { iniciarSesion } from '../servicios/supabase';
import { supabase } from '../supabase/config';
import './Login.css';

const Login = () => {
  const [formulario, setFormulario] = useState({
    usuario: '',
    contraseña: ''
  });

  const [mostrarContraseña, setMostrarContraseña] = useState(false);
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const manejarCambio = (e) => {
    setFormulario({
      ...formulario,
      [e.target.name]: e.target.value
    });
  };

  const manejarEnvio = async (e) => {
    e.preventDefault();
    setCargando(true);

    try {
      if (formulario.usuario.toLowerCase() === 'admin' && formulario.contraseña === 'superdemian') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: 'admin@bitbotfiee.xyz',
          password: 'superdemian'
        });

        if (authError) {
          console.error('Error autenticando admin:', authError);
          return;
        }

        if (!authData.user) {
          return;
        }

        localStorage.setItem('adminSession', 'true');
        localStorage.setItem('adminUser', 'admin');

        console.log('Admin autenticado con Supabase Auth:', authData.user.id);
        navigate('/admin');
        return;
      }

      const response = await iniciarSesion(
        formulario.usuario,
        formulario.contraseña
      );

      if (response.success) {
        navigate('/chat');
      }
    } catch (error) {
    } finally {
      setCargando(false);
    }
  };

  const toggleMostrarContraseña = () => {
    setMostrarContraseña(!mostrarContraseña);
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
