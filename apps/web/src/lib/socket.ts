import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Names this browser tab for calls. It is new on every page load and stays the same across socket reconnects, so a call
 * keeps working through a dropped connection but is not mistaken for a tab that was reloaded.
 */
export const DEVICE_ID = (() => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 't' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
})();

/** Single shared socket; cookies authenticate the handshake. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true, autoConnect: false, transports: ['websocket', 'polling'], auth: { deviceId: DEVICE_ID } });
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
