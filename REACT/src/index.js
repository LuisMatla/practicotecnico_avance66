// punto de entrada: monta la app en el elemento root del index.html.
import React from 'react'; //libreria principal de la interfaz.
import ReactDOM from 'react-dom/client'; //api de react 18 para crear la raiz.
import './estilos/index.css'; //hoja de estilos globales del proyecto.
import App from './App'; //componente raiz con rutas y layout.

const root = ReactDOM.createRoot(document.getElementById('root')); //referencia al nodo #root.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
