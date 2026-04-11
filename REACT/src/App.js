// enrutador principal y carga diferida (lazy) de paginas pesadas.
import React, { Suspense, lazy } from 'react'; //react con suspense para lazy.
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'; //enrutador del navegador.
import './estilos/App.css'; //estilos del contenedor app.
import ProtegerRuta from './componentes/ProtegerRuta'; //exige sesion de usuario normal.
import ProtegerAdmin from './componentes/ProtegerAdmin'; //exige sesion de administrador.

const Login = lazy(() => import('./paginas/Login')); //pagina de inicio de sesion alumnado.
const Registro = lazy(() => import('./paginas/Registro')); //pagina de registro.
const Chat = lazy(() => import('./paginas/Chat')); //chat protegido para usuario.
const AdminLogin = lazy(() => import('./paginas/AdminLogin')); //login del panel admin.
const Admin = lazy(() => import('./paginas/Admin')); //panel admin (usuarios y preguntas).

const LoadingFallback = () => (
  //pantalla de espera mientras se descarga el chunk de la ruta.
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #18529D 0%, #28AD56 100%)',
    color: 'white'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '4px solid rgba(255,255,255,0.3)',
      borderTop: '4px solid var(--blanco-UV)',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

function App() {
  return (
    <Router>
      <div className="App">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/registro" element={<Registro />} />
            <Route path="/chat" element={
              <ProtegerRuta>
                <Chat />
              </ProtegerRuta>
            } />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin" element={
              <ProtegerAdmin>
                <Admin />
              </ProtegerAdmin>
            } />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
