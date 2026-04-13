

import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const port = 3000;

const app = express();
const server = createServer(app);

// Store rooms and their data in memory
const rooms = new Map(); // roomId -> { name, password, messages, users }
const userSessions = new Map(); // socketId -> { name, roomId }

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

// Get all available rooms (for lobby)
app.get("/rooms", (req, res) => {
  const roomList = Array.from(rooms.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    userCount: data.users.size,
  }));
  res.json(roomList);
});

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  // Restore session if user has a stored identity
  socket.on("restore-session", ({ userId, userName, roomId }) => {
    if (userId && userName && roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      socket.join(roomId);
      userSessions.set(socket.id, { name: userName, roomId, userId });
      
      // Add user back to room
      room.users.set(socket.id, { name: userName, userId, socketId: socket.id });
      
      // Notify others
      socket.to(roomId).emit("user-joined", { 
        name: userName, 
        userId,
        message: `${userName} rejoined the chat` 
      });
      
      // Send room history
      socket.emit("room-joined", {
        roomId,
        roomName: room.name,
        messages: room.messages,
        users: Array.from(room.users.values()).map(u => ({ name: u.name, userId: u.userId })),
        userId,
        userName
      });
    }
  });

  // Create new room
  socket.on("create-room", ({ roomName, password, userName }) => {
    const roomId = uuidv4().slice(0, 8); // Short room ID
    
    rooms.set(roomId, {
      name: roomName,
      password: password || null,
      messages: [],
      users: new Map(),
      createdAt: Date.now()
    });

    // Auto-join creator
    socket.join(roomId);
    const userId = uuidv4();
    userSessions.set(socket.id, { name: userName, roomId, userId });
    
    const room = rooms.get(roomId);
    room.users.set(socket.id, { name: userName, userId, socketId: socket.id });

    // Notify all clients about new room
    io.emit("room-created", { 
      id: roomId, 
      name: roomName, 
      userCount: 1 
    });

    socket.emit("room-joined", {
      roomId,
      roomName,
      messages: [],
      users: [{ name: userName, userId }],
      userId,
      userName
    });

    console.log(`Room created: ${roomName} (${roomId}) by ${userName}`);
  });

  // Join existing room
  socket.on("join-room", ({ roomId, password, userName }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    if (room.password && room.password !== password) {
      socket.emit("error", { message: "Incorrect password" });
      return;
    }

    socket.join(roomId);
    const userId = uuidv4();
    userSessions.set(socket.id, { name: userName, roomId, userId });
    room.users.set(socket.id, { name: userName, userId, socketId: socket.id });

    // Notify others in room
    socket.to(roomId).emit("user-joined", { 
      name: userName, 
      userId,
      message: `${userName} joined the chat` 
    });

    // Send room data to new user
    socket.emit("room-joined", {
      roomId,
      roomName: room.name,
      messages: room.messages,
      users: Array.from(room.users.values()).map(u => ({ name: u.name, userId: u.userId })),
      userId,
      userName
    });

    console.log(`${userName} joined room ${room.name}`);
  });

  // Send message
  socket.on("send-message", ({ message, roomId }) => {
    const userSession = userSessions.get(socket.id);
    if (!userSession || userSession.roomId !== roomId) return;

    const room = rooms.get(roomId);
    const messageData = {
      id: uuidv4(),
      text: message,
      sender: userSession.name,
      senderId: userSession.userId,
      timestamp: Date.now()
    };

    // Store message
    room.messages.push(messageData);
    // Keep only last 100 messages
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }

    // Broadcast to room
    io.to(roomId).emit("new-message", messageData);
  });

  // Typing indicator
  socket.on("typing", ({ roomId, isTyping }) => {
    const userSession = userSessions.get(socket.id);
    if (!userSession) return;
    
    socket.to(roomId).emit("user-typing", {
      name: userSession.name,
      isTyping
    });
  });



  

  // Handle disconnect
  socket.on("disconnect", () => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      const { name, roomId, userId } = userSession;
      const room = rooms.get(roomId);
      
      if (room) {
        room.users.delete(socket.id);
        
        // Notify others
        socket.to(roomId).emit("user-left", {
          name,
          userId,
          message: `${name} left the chat`,
          users: Array.from(room.users.values()).map(u => ({ name: u.name, userId: u.userId }))
        });

        // Clean up empty rooms after 1 hour
        if (room.users.size === 0) {
          setTimeout(() => {
            if (room.users.size === 0) {
              rooms.delete(roomId);
              console.log(`Room ${roomId} deleted (empty)`);
            }
          }, 3600000);
        }
      }
      
      userSessions.delete(socket.id);
    }
    console.log("User Disconnected", socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});