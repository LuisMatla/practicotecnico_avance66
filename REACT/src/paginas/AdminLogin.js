// acceso al panel de administracion con supabase auth.
import React, { useState } from 'react'; //react y estado.
import { useNavigate } from 'react-router-dom'; //navegacion para redireccionar.
import { supabase } from '../supabase/config'; //cliente supabase para auth.
import './AdminLogin.css'; //estilos del login admin.

const AdminLogin = () => {
  const [credenciales, setCredenciales] = useState({
    usuario: '', //usuario admin.
    contraseña: '' //password admin.
  }); //estado del formulario.
  const [cargando, setCargando] = useState(false); //bloquea inputs mientras autentica.
  const [error, setError] = useState(''); //mensaje de error visible.
  const navigate = useNavigate(); //funcion para navegar rutas.

  const manejarCambio = (e) => {
    const { name, value } = e.target; //lee el input editado.
    setCredenciales(prev => ({ //actualiza campo dinamico.
      ...prev, //conserva lo demas.
      [name]: value //asigna por nombre.
    }));
    setError(''); //limpia error al escribir.
  };

  const manejarEnvio = async (e) => {
    e.preventDefault(); //evita submit nativo.
    setCargando(true); //activa estado de carga.
    setError(''); //limpia error previo.

    try {
      if (credenciales.usuario === 'admin' && credenciales.contraseña === 'superdemian') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ //login en supabase auth.
          email: 'admin@bitbotfiee.xyz', //correo fijo del admin.
          password: 'superdemian' //password fija del admin.
        });

        if (authError) {
          console.error('Error autenticando admin:', authError); //log tecnico.
          setError('Error al autenticar administrador. Verifica que el usuario admin esté creado en Supabase Auth.'); //mensaje UI.
          return; //corta flujo.
        }

        if (!authData.user) {
          setError('Error al autenticar administrador.'); //mensaje UI.
          return; //corta flujo.
        }

        localStorage.setItem('adminSession', 'true'); //marca sesion admin local.
        localStorage.setItem('adminUser', credenciales.usuario); //guarda usuario admin local.
        
        console.log('Admin autenticado con Supabase Auth:', authData.user.id); //log de auditoria.
        navigate('/admin'); //redirige al panel.
      } else {
        setError('Credenciales incorrectas'); //mensaje UI.
      }
    } catch (error) {
      setError('Error al iniciar sesión'); //mensaje UI generico.
    } finally {
      setCargando(false); //libera UI.
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <h1>Acceso de Administrador</h1>
          <p>Panel de control del sistema BiTBoT</p>
        </div>

        <form onSubmit={manejarEnvio} className="admin-login-form">
          <div className="form-group">
            <label htmlFor="usuario">Usuario:</label>
            <input
              type="text"
              id="usuario"
              name="usuario"
              value={credenciales.usuario}
              onChange={manejarCambio}
              placeholder="Ingresa tu usuario"
              required
              disabled={cargando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="contraseña">Contraseña:</label>
            <input
              type="password"
              id="contraseña"
              name="contraseña"
              value={credenciales.contraseña}
              onChange={manejarCambio}
              placeholder="Ingresa tu contraseña"
              required
              disabled={cargando}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="admin-login-boton"
            disabled={cargando}
          >
            {cargando ? (
              <>
                <div className="spinner"></div>
                Iniciando sesión...
              </>
            ) : (
              'Acceder al Panel'
            )}
          </button>
        </form>

        <div className="admin-login-footer">
          <button 
            className="volver-boton"
            onClick={() => navigate('/')}
          >
            ← Volver al Login Principal
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;

