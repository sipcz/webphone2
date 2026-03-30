import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuid } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);

const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on("connection", ws => {
  ws.id = uuid();
  ws.room = null;

  ws.on("message", msg => {
    const data = JSON.parse(msg);

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
      ws.room = roomId;

      ws.send(JSON.stringify({ type: "joined" }));
      return;
    }

    if (ws.room) {
      const room = rooms.get(ws.room);
      room.clients.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on("close", () => {
    if (ws.room) {
      const room = rooms.get(ws.room);
      room.clients = room.clients.filter(c => c !== ws);
    }
  });
});