console.log("SCRIPT LOADED");

// WebSocket — Render version (ONLY WSS)
const ws = new WebSocket(`wss://${window.location.host}`);

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

// UI
const statusDiv = document.getElementById("status");
const ringtone = document.getElementById("ringtone");
const incomingUI = document.getElementById("incomingCallUI");

const chatWindow = document.getElementById("chatWindow");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

const usersList = document.getElementById("usersList");
const themeBtn = document.getElementById("themeBtn");

// ===== THEME =====
if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  themeBtn.textContent = "Світла тема";
}

themeBtn.onclick = () => {
  document.body.classList.toggle("dark");

  if (document.body.classList.contains("dark")) {
    localStorage.setItem("theme", "dark");
    themeBtn.textContent = "Світла тема";
  } else {
    localStorage.setItem("theme", "light");
    themeBtn.textContent = "Темна тема";
  }
};

// ===== CHAT HISTORY =====
window.addEventListener("load", () => {
  const history = JSON.parse(localStorage.getItem("chatHistory") || "[]");
  history.forEach(msg => addChatMessage(msg.from, msg.text, false));
});

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
    alert(data.message);
    return;
  }

  if (data.type === "joined") {
    statusDiv.textContent = "У кімнаті. Можна дзвонити.";
    return;
  }

  if (data.type === "chat") {
    addChatMessage("Співрозмовник", data.text, true);
    return;
  }

  if (data.type === "users") {
    renderUsers(data.users);
    return;
  }

  if (data.type === "offer") {
    console.log("RECEIVED OFFER");
    window.incomingOffer = data.offer;
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
    incomingUI.style.display = "block";
    statusDiv.textContent = "Вхідний дзвінок…";
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
  }
};

// ===== CHAT =====
sendChatBtn.onclick = () => {
  const text = chatInput.value.trim();
  if (!text || !roomId) return;

  ws.send(JSON.stringify({
    type: "chat",
    roomId,
    text
  }));

  addChatMessage("Я", text, true);
  chatInput.value = "";
};

function addChatMessage(from, text, save) {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${from}:</strong> ${text}`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  if (save) {
    const history = JSON.parse(localStorage.getItem("chatHistory") || "[]");
    history.push({ from, text });
    localStorage.setItem("chatHistory", JSON.stringify(history));
  }
}

// ===== USERS LIST =====
function renderUsers(count) {
  usersList.innerHTML = "";

  for (let i = 1; i <= count; i++) {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.marginBottom = "6px";

    const avatar = document.createElement("div");
    avatar.style.width = "32px";
    avatar.style.height = "32px";
    avatar.style.borderRadius = "50%";
    avatar.style.background = randomColor(i);
    avatar.style.color = "#fff";
    avatar.style.display = "flex";
    avatar.style.alignItems = "center";
    avatar.style.justifyContent = "center";
    avatar.style.marginRight = "10px";
    avatar.textContent = "U";

    const name = document.createElement("span");
    name.textContent = `Користувач ${i}`;

    div.appendChild(avatar);
    div.appendChild(name);
    usersList.appendChild(div);
  }
}

function randomColor(seed) {
  const colors = ["#2a8bf2", "#ff6b6b", "#3bd27f", "#f2b63d", "#9b59b6"];
  return colors[seed % colors.length];
}

// ===== LOCAL MEDIA =====
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

// ===== PEER CONNECTION =====
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

// ===== INCOMING UI =====
document.getElementById("acceptCall").onclick = () => {
  document.getElementById("answerBtn").click();
};

document.getElementById("declineCall").onclick = () => {
  ringtone.pause();
  incomingUI.style.display = "none";
  window.incomingOffer = null;
  statusDiv.textContent = "Відхилено";
};

// ===== HANGUP =====
document.getElementById("hangupBtn").onclick = () => {
  console.log("HANGUP");
  if (pc) pc.close();
  pc = null;
};

// ===== MUTE =====
document.getElementById("muteBtn").onclick = () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  document.getElementById("muteBtn").textContent = isMuted ? "Unmute" : "Mute";
};

// ===== CAMERA ON/OFF =====
document.getElementById("cameraBtn").onclick = () => {
  if (!localStream) return;
  isCameraOff = !isCameraOff;
  localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
  document.getElementById("cameraBtn").textContent = isCameraOff ? "Camera On" : "Camera Off";
};

// ===== SWITCH CAMERA =====
document.getElementById("switchBtn").onclick = async () => {
  currentFacing = currentFacing === "user" ? "environment" : "user";

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }

  await startLocalMedia();

  if (pc) {
    const senders = pc.getSenders();
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = senders.find(s => s.track && s.track.kind === "video");
    if (sender) sender.replaceTrack(videoTrack);
  }
};
