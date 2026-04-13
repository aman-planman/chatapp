
import React, { useEffect, useMemo, useState, useRef } from "react";
import { io } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import {
  Box,
  Button,
  Container,
  Stack,
  TextField,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Fade
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import GroupIcon from "@mui/icons-material/Group";

const App = () => {
  const socket = useMemo(
    () =>
      io("http://localhost:3000", {
        withCredentials: true,
      }),
    []
  );

  // User & Room State
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  
  // Chat State
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  
  // UI State
  const [view, setView] = useState("landing"); // landing, create, join, chat
  const [error, setError] = useState("");
  const [availableRooms, setAvailableRooms] = useState([]);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize persistent userId on app load
  useEffect(() => {
    let persistedUserId = localStorage.getItem("userId");
    if (!persistedUserId) {
      // Generate new userId if doesn't exist
      persistedUserId = uuidv4();
      localStorage.setItem("userId", persistedUserId);
    }
    setUserId(persistedUserId);
  }, []);

  // Check for saved session on mount
  // useEffect(() => {
  //   const savedSession = localStorage.getItem("chatSession");
  //   if (savedSession) {
  //     const session = JSON.parse(savedSession);
  //     setUserName(session.userName);
  //     setUserId(session.userId);
  //     setCurrentRoom(session.roomId);
      
  //     // Restore session with server
  //     socket.emit("restore-session", session);
  //   }
    
  //   // Fetch available rooms
  //   fetch("http://localhost:3000/rooms")
  //     .then(res => res.json())
  //     .then(rooms => setAvailableRooms(rooms))
  //     .catch(console.error);
  // }, []);


// Check for saved session on mount
useEffect(() => {
  const savedSession = localStorage.getItem("chatSession");
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      // Validate session has all required fields
      if (session.userId && session.userName && session.roomId) {
        setUserName(session.userName);
        setUserId(session.userId);
        setCurrentRoom(session.roomId);
        setJoinRoomId(session.roomId); // Pre-fill for join form fallback
        
        // Wait for socket connection before restoring
        if (socket.connected) {
          socket.emit("restore-session", session);
        } else {
          // Queue restoration for when connected
          const onConnect = () => {
            socket.emit("restore-session", session);
            socket.off("connect", onConnect);
          };
          socket.on("connect", onConnect);
        }
      }
    } catch (e) {
      console.error("Invalid session data", e);
      localStorage.removeItem("chatSession");
    }
  }
  
  // Fetch available rooms
  fetch("http://localhost:3000/rooms")
    .then(res => res.json())
    .then(rooms => setAvailableRooms(rooms))
    .catch(console.error);
}, [socket]);




  // Socket event handlers
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected", socket.id);
    });

    socket.on("room-created", (room) => {
      setAvailableRooms(prev => [...prev, room]);
    });

    socket.on("room-joined", ({ roomId, roomName, messages, users, userId: uid, userName: uname }) => {
      setCurrentRoom(roomId);
      setUserId(uid);
      setUserName(uname);
      setMessages(messages);
      setUsers(users);
      setView("chat");
      setError("");
      
      // Save session
      localStorage.setItem("chatSession", JSON.stringify({
        userId: uid,
        userName: uname,
        roomId
      }));
    });

    socket.on("new-message", (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on("user-joined", ({ name, message }) => {
      // Add system message
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: message,
        isSystem: true,
        timestamp: Date.now()
      }]);
    });

    socket.on("user-left", ({ message, users: updatedUsers }) => {
      setMessages(prev => [...prev, {
        id: Date.now(),
        text: message,
        isSystem: true,
        timestamp: Date.now()
      }]);
      setUsers(updatedUsers);
    });

    socket.on("user-typing", ({ name, isTyping }) => {
      if (isTyping) {
        setTypingUsers(prev => [...new Set([...prev, name])]);
      } else {
        setTypingUsers(prev => prev.filter(u => u !== name));
      }
    });

    socket.on("error", ({ message }) => {
      setError(message);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handlers
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError("Please enter your name");
      return;
    }
    socket.emit("create-room", {
      roomName,
      password: roomPassword,
      userName,
      userId
    });
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError("Please enter your name");
      return;
    }
    socket.emit("join-room", {
      roomId: joinRoomId,
      password: joinPassword,
      userName,
      userId
    });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    
    socket.emit("send-message", {
      message: messageInput,
      roomId: currentRoom
    });
    setMessageInput("");
    handleTypingStop();
  };

  const handleTyping = () => {
    socket.emit("typing", { roomId: currentRoom, isTyping: true });
    
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(handleTypingStop, 1000);
  };

  const handleTypingStop = () => {
    socket.emit("typing", { roomId: currentRoom, isTyping: false });
  };

  // const handleLeaveRoom = () => {
  //   localStorage.removeItem("chatSession");
  //   setCurrentRoom(null);
  //   setMessages([]);
  //   setUsers([]);
  //   setView("landing");
  //   socket.disconnect();
  //   window.location.reload();
  // };

  const handleLeaveRoom = () => {
  localStorage.removeItem("chatSession");
  setCurrentRoom(null);
  setMessages([]);
  setUsers([]);
  setView("landing");
  setUserId("");
  setUserName("");
  // Don't disconnect socket - just leave room
  socket.emit("leave-room", { roomId: currentRoom }); // Add this handler on server
};

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Render Views
  const renderLanding = () => (
    <Box sx={{ textAlign: "center", mt: 8 }}>
      <Typography variant="h3" gutterBottom>💬 Chat App</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Join or create a room to start chatting
      </Typography>
      
      <Stack spacing={2} direction="row" justifyContent="center">
        <Button 
          variant="contained" 
          size="large"
          onClick={() => setView("create")}
        >
          Create Room
        </Button>
        <Button 
          variant="outlined" 
          size="large"
          onClick={() => setView("join")}
        >
          Join Room
        </Button>
      </Stack>

      {availableRooms.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>Available Rooms</Typography>
          <List>
            {availableRooms.map(room => (
              <ListItem 
                key={room.id}
                component={Paper}
                sx={{ mb: 1, cursor: "pointer" }}
                onClick={() => {
                  setJoinRoomId(room.id);
                  setView("join");
                }}
              >
                <ListItemText 
                  primary={room.name} 
                  secondary={`${room.userCount} users • Room ID: ${room.id}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );

  const renderCreateRoom = () => (
    <Box component="form" onSubmit={handleCreateRoom} sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>Create New Room</Typography>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Stack spacing={2}>
        <TextField
          label="Your Name"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Room Name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Password (optional)"
          type="password"
          value={roomPassword}
          onChange={(e) => setRoomPassword(e.target.value)}
          fullWidth
          helperText="Leave empty for public room"
        />
        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" fullWidth>
            Create & Join
          </Button>
          <Button variant="outlined" onClick={() => setView("landing")}>
            Back
          </Button>
        </Stack>
      </Stack>
    </Box>
  );

  const renderJoinRoom = () => (
    <Box component="form" onSubmit={handleJoinRoom} sx={{ mt: 4 }}>
      <Typography variant="h5" gutterBottom>Join Room</Typography>
      
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Stack spacing={2}>
        <TextField
          label="Your Name"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Room ID"
          value={joinRoomId}
          onChange={(e) => setJoinRoomId(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Password (if required)"
          type="password"
          value={joinPassword}
          onChange={(e) => setJoinPassword(e.target.value)}
          fullWidth
        />
        <Stack direction="row" spacing={2}>
          <Button type="submit" variant="contained" fullWidth>
            Join Room
          </Button>
          <Button variant="outlined" onClick={() => setView("landing")}>
            Back
          </Button>
        </Stack>
      </Stack>
    </Box>
  );

  const renderChat = () => (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Paper sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h6">{roomName}</Typography>
          <Typography variant="caption" color="text.secondary">
            Room: {currentRoom} • {users.length} users online
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip 
            icon={<GroupIcon />} 
            label={users.length} 
            size="small" 
            color="primary" 
          />
          <Button variant="outlined" size="small" onClick={handleLeaveRoom}>
            Leave
          </Button>
        </Stack>
      </Paper>

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2, bgcolor: "#f5f5f5" }}>
        <Stack spacing={1}>
          {messages.map((msg) => (
            <Box key={msg.id}>
              {msg.isSystem ? (
                <Typography 
                  variant="caption" 
                  color="text.secondary" 
                  sx={{ textAlign: "center", display: "block", my: 1 }}
                >
                  {msg.text}
                </Typography>
              ) : (
                <Box sx={{
                  display: "flex",
                  justifyContent: msg.senderId === userId ? "flex-end" : "flex-start"
                }}>
                  <Paper sx={{
                    p: 1.5,
                    maxWidth: "70%",
                    bgcolor: msg.senderId === userId ? "primary.main" : "white",
                    color: msg.senderId === userId ? "white" : "text.primary"
                  }}>
                    <Typography variant="caption" sx={{ opacity: 0.7, display: "block" }}>
                      {msg.sender}
                    </Typography>
                    <Typography variant="body1">{msg.text}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.6, display: "block", textAlign: "right" }}>
                      {formatTime(msg.timestamp)}
                    </Typography>
                  </Paper>
                </Box>
              )}
            </Box>
          ))}
          <div ref={messagesEndRef} />
        </Stack>
      </Box>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <Typography variant="caption" sx={{ px: 2, py: 0.5, color: "text.secondary" }}>
          {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
        </Typography>
      )}

      {/* Input */}
      <Paper component="form" onSubmit={handleSendMessage} sx={{ p: 2, display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          placeholder="Type a message..."
          value={messageInput}
          onChange={(e) => {
            setMessageInput(e.target.value);
            handleTyping();
          }}
          onBlur={handleTypingStop}
          variant="outlined"
          size="small"
        />
        <Button 
          type="submit" 
          variant="contained" 
          disabled={!messageInput.trim()}
          endIcon={<SendIcon />}
        >
          Send
        </Button>
      </Paper>
    </Box>
  );

  return (
    <Container maxWidth="sm" sx={{ height: "100vh" }}>
      {`User:${userId}`}
      {view === "landing" && renderLanding()}
      {view === "create" && renderCreateRoom()}
      {view === "join" && renderJoinRoom()}
      {view === "chat" && renderChat()}
    </Container>
  );
};

export default App;