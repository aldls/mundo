const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 3000 }, () => {
  console.log('WebSocket server running on ws://localhost:3000');
});

server.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

server.on('connection', (socket) => {
  console.log('A player connected');

  // Send a message to the player
  socket.send('Welcome to the server!');

  // Listen for messages from the client
  socket.on('message', (message) => {
    console.log('Received:', message);

    // Broadcast the message to all other connected players
    server.clients.forEach((client) => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  // Handle disconnections
  socket.on('close', () => {
    console.log('A player disconnected');
  });
});