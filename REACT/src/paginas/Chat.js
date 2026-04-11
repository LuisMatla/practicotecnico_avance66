// ruta del chat de usuario con layout a pantalla completa.
import React from 'react'; //react base.
import ChatUsuario from '../componentes/ChatUsuario'; //componente principal del chat.
import './Chat.css'; //estilos del layout.

const Chat = () => {
  return (
    <div className="chat-page"> {/*envoltorio pagina*/}
      <div className="chat-page-container"> {/*contenedor a viewport*/}
        <ChatUsuario /> {/*chat en modo usuario*/}
      </div>
    </div>
  );
};

export default Chat;
