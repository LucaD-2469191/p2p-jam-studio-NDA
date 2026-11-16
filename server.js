const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Houdt kamers en verbonden sockets bij: { roomId: Set<WebSocket> }
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userId = null;

  ws.on('message', (rawMessage) => {
    const data = JSON.parse(rawMessage);

    if (data.type === 'join') {
      currentRoom = data.room;
      userId = data.userId;

      if (!rooms.has(currentRoom)) {
        rooms.set(currentRoom, new Set());
      }
      const room = rooms.get(currentRoom);

      // Stuur bestaande gebruikers in de kamer door naar de nieuwe gebruiker
      const existingUsers = Array.from(room).map(client => client.userId);
      ws.send(JSON.stringify({ type: 'existing-users', users: existingUsers }));

      ws.userId = userId;
      room.add(ws);
      return;
    }

    // Stuur WebRTC signaling-berichten (offer, answer, ice-candidate) gericht door naar targetId
    if (data.targetId && currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).forEach((client) => {
        if (client.userId === data.targetId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            ...data,
            senderId: userId
          }));
        }
      });
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.delete(ws);
      // Verwittig overige deelnemers dat iemand is vertrokken
      room.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'user-left', userId }));
        }
      });
      if (room.size === 0) rooms.delete(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Signaling server draait op poort ${PORT}`));