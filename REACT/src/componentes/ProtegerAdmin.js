
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase/config';

const ProtegerAdmin = ({ children }) => {
  const [verificando, setVerificando] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const verificarSesionAdmin = async () => {
      const adminSession = localStorage.getItem('adminSession');
      const adminUser = localStorage.getItem('adminUser');

      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        console.log(' No hay sesión de Supabase Auth');
        localStorage.removeItem('adminSession');
        localStorage.removeItem('adminUser');
        navigate('/admin-login');
        return;
      }

      if (user.email !== 'admin@bitbotfiee.xyz') {
        console.log(' Usuario no es admin');
        localStorage.removeItem('adminSession');
        localStorage.removeItem('adminUser');
        navigate('/admin-login');
        return;
      }

      if (!adminSession || !adminUser || adminUser !== 'admin') {
        localStorage.setItem('adminSession', 'true');
        localStorage.setItem('adminUser', 'admin');
      }

      console.log(' Sesión de admin verificada:', user.id);
      setVerificando(false);
    };

    verificarSesionAdmin();
  }, [navigate]);

  if (verificando) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, var(--azul-UV) 0%, var(--verde-UV) 100%)',
        color: 'var(--blanco-UV)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid rgba(255,255,255,0.3)',
          borderTop: '4px solid var(--blanco-UV)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1rem'
        }}></div>
        <p>Verificando acceso de administrador...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return children;
};

export default ProtegerAdmin;

