
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase/config';
import './AdminLogin.css';

const AdminLogin = () => {
  const [credenciales, setCredenciales] = useState({
    usuario: '',
    contraseña: ''
  });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    setCredenciales(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const manejarEnvio = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError('');

    try {
      if (credenciales.usuario === 'admin' && credenciales.contraseña === 'superdemian') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: 'admin@bitbotfiee.xyz',
          password: 'superdemian'
        });

        if (authError) {
          console.error('Error autenticando admin:', authError);
          setError('Error al autenticar administrador. Verifica que el usuario admin esté creado en Supabase Auth.');
          return;
        }

        if (!authData.user) {
          setError('Error al autenticar administrador.');
          return;
        }

        localStorage.setItem('adminSession', 'true');
        localStorage.setItem('adminUser', credenciales.usuario);

        console.log('Admin autenticado con Supabase Auth:', authData.user.id);
        navigate('/admin');
      } else {
        setError('Credenciales incorrectas');
      }
    } catch (error) {
      setError('Error al iniciar sesión');
    } finally {
      setCargando(false);
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

