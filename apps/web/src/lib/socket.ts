import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Single shared socket; cookies authenticate the handshake. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true, autoConnect: false, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
