import express from "express";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(process.env.PORT || 3000);

const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on("connection", ws => {
  ws.on("message", raw => {
    const data = JSON.parse(raw);

    if (data.type === "join") {
      if (!rooms.has(data.roomId)) rooms.set(data.roomId, []);
      rooms.get(data.roomId).push(ws);
      ws.roomId = data.roomId;
      return;
    }

    if (ws.roomId) {
      rooms.get(ws.roomId).forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on("close", () => {
    if (ws.roomId && rooms.has(ws.roomId)) {
      rooms.set(
        ws.roomId,
        rooms.get(ws.roomId).filter(c => c !== ws)
      );
    }
  });
});
