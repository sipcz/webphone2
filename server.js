import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});

const wss = new WebSocketServer({ server });

const rooms = new Map();

// Keepalive for Render
function heartbeat() { this.isAlive = true; }

wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", heartbeat);

  ws.on("message", raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // JOIN ROOM
    if (data.type === "join") {
      const { roomId, pin } = data;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, { pin, clients: [] });
      }

      const room = rooms.get(roomId);

      if (room.pin !== pin) {
        ws.send(JSON.stringify({ type: "error", message: "Невірний PIN" }));
        return;
      }

      room.clients.push(ws);
      ws.roomId = roomId;

      ws.send(JSON.stringify({ type: "joined" }));
      return;
    }

    // SIGNALING
    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (!room) return;

      room.clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on("close", () => {
    if (ws.roomId && rooms.has(ws.roomId)) {
      const room = rooms.get(ws.roomId);
      room.clients = room.clients.filter(c => c !== ws);
      if (room.clients.length === 0) rooms.delete(ws.roomId);
    }
  });
});

// Ping every 30 sec
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
