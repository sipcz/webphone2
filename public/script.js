console.log("SCRIPT LOADED");

// WebSocket
const ws = new WebSocket(
  location.protocol === "https:"
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`
);

ws.onopen = () => console.log("WS: connected");
ws.onerror = (e) => console.log("WS ERROR:", e);
ws.onclose = () => console.log("WS: closed");

let pc = null;
let localStream = null;
let remoteStream = null;
let roomId = null;
let pin = null;

let currentFacing = "user";
let isMuted = false;
let isCameraOff = false;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// ===== JOIN ROOM =====
document.getElementById("joinBtn").onclick = () => {
  roomId = document.getElementById("roomId").value.trim();
  pin = document.getElementById("pin").value.trim();

  console.log("JOIN ROOM:", roomId, pin);

  ws.send(JSON.stringify({ type: "join", roomId, pin }));
};

// ===== WEBSOCKET EVENTS =====
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  console.log("WS MESSAGE:", data);

  if (data.type === "error") {
    console.log("SERVER ERROR:", data.message);
    alert(data.message);
    return;
  }

  if (data.type === "joined") {
    console.log("JOINED ROOM OK");
    return;
  }

  if (data.type === "offer") {
    console.log("RECEIVED OFFER");
    window.incomingOffer = data.offer;
    document.getElementById("incomingCallUI").style.display = "block";
    return;
  }

  if (data.type === "answer") {
    console.log("RECEIVED ANSWER");
    if (pc) {
      try {
        await pc.setRemoteDescription(data.answer);
        console.log("ANSWER SET OK");
      } catch (e) {
        console.log("ANSWER SET ERROR:", e);
      }
    }
    return;
  }

  if (data.type === "ice") {
    console.log("RECEIVED ICE");
    if (pc) {
      try {
        await pc.addIceCandidate(data.candidate);
        console.log("ICE ADDED");
      } catch (e) {
        console.log("ICE ERROR:", e);
      }
    }
    return;
  }
};

// ===== START LOCAL MEDIA =====
async function startLocalMedia() {
  console.log("STARTING CAMERA…");

  const quality = document.getElementById("quality").value;

  let constraints = {
    audio: true,
    video: { facingMode: currentFacing }
  };

  if (quality === "low") constraints.video.width = 320;
  if (quality === "med") constraints.video.width = 640;
  if (quality === "high") constraints.video.width = 1280;

  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById("localVideo").srcObject = localStream;
    console.log("CAMERA OK");
  } catch (e) {
    console.log("CAMERA ERROR:", e);
  }
}

// ===== CREATE PEER CONNECTION =====
async function createConnection() {
  console.log("CREATING PC…");

  pc = new RTCPeerConnection(servers);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log("SEND ICE");
      ws.send(JSON.stringify({ type: "ice", roomId, candidate: e.candidate }));
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("PC STATE:", pc.connectionState);
  };

  remoteStream = new MediaStream();
  document.getElementById("remoteVideo").srcObject = remoteStream;

  pc.ontrack = (e) => {
    console.log("REMOTE TRACK RECEIVED");
    e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
  };

  localStream.getTracks().forEach(t => {
    console.log("ADD LOCAL TRACK:", t.kind);
    pc.addTrack(t, localStream);
  });
}

// ===== CALL =====
document.getElementById("callBtn").onclick = async () => {
  console.log("CALL START");

  await startLocalMedia();
  await createConnection();

  console.log("CREATING OFFER…");
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  console.log("SEND OFFER");
  ws.send(JSON.stringify({ type: "offer", roomId, offer }));
};

// ===== ANSWER =====
document.getElementById("answerBtn").onclick = async () => {
  console.log("ANSWER START");

  await startLocalMedia();
  await createConnection();

  console.log("SET REMOTE OFFER");
  await pc.setRemoteDescription(window.incomingOffer);

  console.log("CREATING ANSWER…");
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  console.log("SEND ANSWER");
  ws.send(JSON.stringify({ type: "answer", roomId, answer }));
};

// ===== HANGUP =====
document.getElementById("hangupBtn").onclick = () => {
  console.log("HANGUP");
  if (pc) pc.close();
  pc = null;
};
