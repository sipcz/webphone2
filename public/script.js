const ws = new WebSocket(`wss://${window.location.host}`);

let pc = null;
let localStream = null;
let remoteStream = null;
let roomId = null;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

document.getElementById("join").onclick = () => {
  roomId = document.getElementById("room").value.trim();
  if (!roomId) return alert("Введіть ID кімнати");

  ws.send(JSON.stringify({ type: "join", roomId }));
};

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "offer") {
    window.incomingOffer = data.offer;
    alert("Вхідний дзвінок. Натисніть 'Відповісти'");
  }

  if (data.type === "answer") {
    await pc.setRemoteDescription(data.answer);
  }

  if (data.type === "ice") {
    if (pc) await pc.addIceCandidate(data.candidate);
  }
};

document.getElementById("callBtn").onclick = async () => {
  await startLocalMedia();   // ← мобільний браузер дозволяє тільки після кліку
  await createConnection();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: "offer", roomId, offer }));
};

document.getElementById("answerBtn").onclick = async () => {
  if (!window.incomingOffer) return;

  await startLocalMedia();
  await createConnection();

  await pc.setRemoteDescription(window.incomingOffer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(JSON.stringify({ type: "answer", roomId, answer }));
};

document.getElementById("hangupBtn").onclick = () => {
  if (pc) pc.close();
  pc = null;
};

async function startLocalMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 240 },
    audio: true
  });

  document.getElementById("localVideo").srcObject = localStream;
}

async function createConnection() {
  pc = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  document.getElementById("remoteVideo").srcObject = remoteStream;

  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.ontrack = (e) => {
    e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(JSON.stringify({ type: "ice", roomId, candidate: e.candidate }));
    }
  };
}
