// envoltorio que exige usuario autenticado en rutas privadas.
import React, { useEffect, useState, useCallback } from 'react'; //react y hooks.
import { useNavigate } from 'react-router-dom'; //navegacion para redireccionar.
import { obtenerUsuarioActual } from '../servicios/supabase'; //obtiene usuario autenticado actual.
import { supabase } from '../supabase/config'; //cliente supabase para validar estado en BD.

const ProtegerRuta = ({ children }) => {
  const [cargando, setCargando] = useState(true); //bandera de carga inicial.
  const [autenticado, setAutenticado] = useState(false); //bandera de acceso permitido.
  const navigate = useNavigate(); //funcion para navegar rutas.

  const verificarAutenticacion = useCallback(async () => {
    const inicioCarga = Date.now(); //marca inicio para mantener animacion minima.
    try {
      const user = await obtenerUsuarioActual(); //obtiene sesion (auth).
      
      if (!user) { //si no hay usuario autenticado.
        navigate('/'); //redirige a login.
        return; //corta la verificacion.
      }

      const { data: usuarioEnBD, error } = await supabase //valida que exista en tabla usuarios y este activo.
        .from('usuarios') //tabla de usuarios.
        .select('uid, activo') //campos necesarios.
        .eq('uid', user.id) //filtra por uid.
        .single(); //espera un registro.

      if (!usuarioEnBD || error?.code === 'PGRST116') { //si no existe en BD (o no hay fila).
        await supabase.auth.signOut(); //cierra sesion para limpiar estado.
        navigate('/'); //redirige a login.
        return; //corta la verificacion.
      }

      if (usuarioEnBD.activo === false) { //si el usuario esta desactivado.
        await supabase.auth.signOut(); //cierra sesion.
        navigate('/'); //redirige a login.
        return; //corta la verificacion.
      }

      setAutenticado(true); //permite renderizar la ruta privada.
    } catch (error) {
      console.error('Error verificando autenticación:', error); //log del error.
      navigate('/'); //redirige por seguridad.
    } finally {
      const tiempoTranscurrido = Date.now() - inicioCarga; //duracion real.
      const tiempoRestante = Math.max(0, 2800 - tiempoTranscurrido); //asegura minimo 2.8s de carga.
      setTimeout(() => {
        setCargando(false); //quita pantalla de carga.
      }, tiempoRestante);
    }
  }, [navigate]);

  useEffect(() => {
    verificarAutenticacion(); //dispara verificacion al montar.
  }, [verificarAutenticacion]);

  if (cargando) {
    return (
      <div style={{
        display: 'flex', //centra contenido.
        justifyContent: 'center', //centra horizontal.
        alignItems: 'center', //centra vertical.
        height: '100vh', //alto completo.
        width: '100vw', //ancho completo.
        background: 'var(--blanco-UV)', //fondo blanco.
        overflow: 'hidden' //evita scroll.
      }}>
        <img 
          src={process.env.PUBLIC_URL + '/bitbotv.gif'}  //gif local en /public.
          alt="Cargando..." //texto alternativo.
          style={{
            width: '300px', //tamano fijo.
            height: '300px', //tamano fijo.
            objectFit: 'contain' //ajuste sin recorte.
          }}
        />
      </div>
    );
  }

  if (!autenticado) {
    return null; //si no paso validacion, no renderiza nada.
  }

  return children; //renderiza contenido protegido.
};

export default ProtegerRuta;

