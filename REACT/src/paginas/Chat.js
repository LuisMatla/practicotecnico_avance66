
import React from 'react';
import ChatUsuario from '../componentes/ChatUsuario';
import './Chat.css';

const Chat = () => {
  return (
    <div className="chat-page">
      <div className="chat-page-container">
        <ChatUsuario />
      </div>
    </div>
  );
};

export default Chat;
