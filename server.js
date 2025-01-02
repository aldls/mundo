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
  socket.send('Welcome to the Summoners Rift!');

  // Listen for messages from the client
  socket.on('message', (message) => {
    console.log('Received:', message);

    // Ensure the message is a string
    if (message instanceof Buffer || message instanceof ArrayBuffer) {
      message = message.toString(); // Convert to string if it's a binary format
    }

    // Broadcast the message to all connected clients
    server.clients.forEach((client) => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(message); // Send the string message
      }
    });
  });

  // Handle disconnections
  socket.on('close', () => {
    console.log('A player disconnected');
  });
});