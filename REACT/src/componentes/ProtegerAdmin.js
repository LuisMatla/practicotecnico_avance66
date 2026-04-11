// envoltorio que exige sesion admin antes de renderizar hijos.
import React from 'react'; //react base.
import { useNavigate } from 'react-router-dom'; //navegacion para redireccionar.
import { useEffect, useState } from 'react'; //hooks de estado y efecto.
import { supabase } from '../supabase/config'; //cliente supabase para auth.

const ProtegerAdmin = ({ children }) => {
  const [verificando, setVerificando] = useState(true); //muestra pantalla de verificacion.
  const navigate = useNavigate(); //funcion para navegar rutas.

  useEffect(() => {
    const verificarSesionAdmin = async () => {
      const adminSession = localStorage.getItem('adminSession'); //bandera local de admin.
      const adminUser = localStorage.getItem('adminUser'); //usuario local de admin.

      const { data: { user }, error } = await supabase.auth.getUser(); //obtiene usuario logueado.

      if (error || !user) {
        console.log(' No hay sesión de Supabase Auth'); //log de auditoria.
        localStorage.removeItem('adminSession'); //limpia bandera.
        localStorage.removeItem('adminUser'); //limpia usuario.
        navigate('/admin-login'); //redirige a login admin.
        return; //corta la verificacion.
      }

      if (user.email !== 'admin@bitbotfiee.xyz') {
        console.log(' Usuario no es admin'); //log de auditoria.
        localStorage.removeItem('adminSession'); //limpia bandera.
        localStorage.removeItem('adminUser'); //limpia usuario.
        navigate('/admin-login'); //redirige a login admin.
        return; //corta la verificacion.
      }

      if (!adminSession || !adminUser || adminUser !== 'admin') {
        localStorage.setItem('adminSession', 'true'); //persistencia simple de admin.
        localStorage.setItem('adminUser', 'admin'); //marca usuario como admin.
      }

      console.log(' Sesión de admin verificada:', user.id); //log de confirmacion.
      setVerificando(false); //habilita renderizado de hijos.
    };

    verificarSesionAdmin(); //ejecuta verificacion al montar.
  }, [navigate]);

  if (verificando) {
    return (
      <div style={{
        display: 'flex', //layout flex.
        flexDirection: 'column', //columna.
        alignItems: 'center', //centra horizontal.
        justifyContent: 'center', //centra vertical.
        minHeight: '100vh', //alto completo.
        background: 'linear-gradient(135deg, var(--azul-UV) 0%, var(--verde-UV) 100%)', //degradado institucional.
        color: 'var(--blanco-UV)', //texto blanco.
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' //tipografia consistente.
      }}>
        <div style={{
          width: '40px', //tamano loader.
          height: '40px', //tamano loader.
          border: '4px solid rgba(255,255,255,0.3)', //anillo base.
          borderTop: '4px solid var(--blanco-UV)', //acento del anillo.
          borderRadius: '50%', //circulo.
          animation: 'spin 1s linear infinite', //giro.
          marginBottom: '1rem' //espacio inferior.
        }}></div>
        <p>Verificando acceso de administrador...</p> {/*mensaje de estado*/}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return children; //renderiza contenido protegido.
};

export default ProtegerAdmin;

