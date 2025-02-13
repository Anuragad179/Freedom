const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

let users = []; // Store available users for random matching

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Add user to queue
  users.push(socket);
  console.log("Users in queue:", users.map(user => user.id));

  // Try to match users
  if (users.length >= 2) {
    const user1 = users.shift();
    const user2 = users.shift();

    console.log(`Pairing users: ${user1.id} & ${user2.id}`);

    user1.emit("match", user2.id);
    user2.emit("match", user1.id);
  }

  // Relay signaling messages
  socket.on("signal", ({ to, data }) => {
    console.log(`Relaying signal from ${socket.id} to ${to}`);
    io.to(to).emit("signal", { from: socket.id, data });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    users = users.filter((user) => user.id !== socket.id);
    socket.broadcast.emit("partner-disconnected", { from: socket.id });
  });
});

server.listen(3000, () => console.log("Server running on port 3000"));
