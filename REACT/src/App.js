
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './estilos/App.css';
import ProtegerRuta from './componentes/ProtegerRuta';
import ProtegerAdmin from './componentes/ProtegerAdmin';

const Login = lazy(() => import('./paginas/Login'));
const Registro = lazy(() => import('./paginas/Registro'));
const Chat = lazy(() => import('./paginas/Chat'));
const AdminLogin = lazy(() => import('./paginas/AdminLogin'));
const Admin = lazy(() => import('./paginas/Admin'));

const LoadingFallback = () => (

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
