const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', (playerName) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            players: [{
                id: socket.id,
                name: playerName,
                pIndex: 1, // Host is always Player 1
                isHost: true
            }],
            state: 'lobby'
        };
        socket.join(roomId);
        socket.emit('room_created', { roomId, players: rooms[roomId].players });
    });

    socket.on('join_room', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (room && room.state === 'lobby' && room.players.length < 4) {
            const pIndex = room.players.length + 1;
            const newPlayer = {
                id: socket.id,
                name: playerName,
                pIndex: pIndex,
                isHost: false
            };
            room.players.push(newPlayer);
            socket.join(roomId);
            
            // Notify everyone in room
            io.to(roomId).emit('player_joined', room.players);
            // Send room info to joiner
            socket.emit('joined_room', { roomId, players: room.players, myIndex: pIndex });
        } else {
            socket.emit('error_msg', '房间不存在或已满/已开始');
        }
    });

    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players[0].id === socket.id) {
            room.state = 'playing';
            io.to(roomId).emit('game_started', room.players);
        }
    });

    // Relay Game Events
    socket.on('game_event', ({ roomId, type, data }) => {
        // Broadcast to everyone else in the room
        socket.to(roomId).emit('game_event', { type, data });
    });

    // Specific: Decision Sync (Client -> Host)
    socket.on('player_decision', ({ roomId, pIndex, choice }) => {
        // Send to Host only (assuming Host is managing state)
        // Find Host
        const room = rooms[roomId];
        if(room) {
            const host = room.players.find(p => p.isHost);
            if(host) {
                io.to(host.id).emit('remote_decision', { pIndex, choice });
            }
        }
    });

    socket.on('disconnect', () => {
        // Handle disconnect... for simplicity, just remove from room logic if needed
        // For this simple version, we might not handle robust reconnection
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on *:${PORT}`);
});
