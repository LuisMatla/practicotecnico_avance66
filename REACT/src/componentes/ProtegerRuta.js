
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerUsuarioActual } from '../servicios/supabase';
import { supabase } from '../supabase/config';

const ProtegerRuta = ({ children }) => {
  const [cargando, setCargando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const navigate = useNavigate();

  const verificarAutenticacion = useCallback(async () => {
    const inicioCarga = Date.now();
    try {
      const user = await obtenerUsuarioActual();

      if (!user) {
        navigate('/');
        return;
      }

      const { data: usuarioEnBD, error } = await supabase
        .from('usuarios')
        .select('uid, activo')
        .eq('uid', user.id)
        .single();

      if (!usuarioEnBD || error?.code === 'PGRST116') {
        await supabase.auth.signOut();
        navigate('/');
        return;
      }

      if (usuarioEnBD.activo === false) {
        await supabase.auth.signOut();
        navigate('/');
        return;
      }

      setAutenticado(true);
    } catch (error) {
      console.error('Error verificando autenticación:', error);
      navigate('/');
    } finally {
      const tiempoTranscurrido = Date.now() - inicioCarga;
      const tiempoRestante = Math.max(0, 2800 - tiempoTranscurrido);
      setTimeout(() => {
        setCargando(false);
      }, tiempoRestante);
    }
  }, [navigate]);

  useEffect(() => {
    verificarAutenticacion();
  }, [verificarAutenticacion]);

  if (cargando) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100vw',
        background: 'var(--blanco-UV)',
        overflow: 'hidden'
      }}>
        <img
          src={process.env.PUBLIC_URL + '/bitbotv.gif'}
          alt="Cargando..."
          style={{
            width: '300px',
            height: '300px',
            objectFit: 'contain'
          }}
        />
      </div>
    );
  }

  if (!autenticado) {
    return null;
  }

  return children;
};

export default ProtegerRuta;

