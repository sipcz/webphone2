const ws = new WebSocket(`wss://${window.location.host}`);

let pc = null;
let localStream = null;
let remoteStream = null;
let roomId = null;
let pin = null;

let currentFacing = "user"; // front camera
let isMuted = false;
let isCameraOff = false;

const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// UI elements
const statusDiv = document.getElementById("status");
const ringtone = document.getElementById("ringtone");
const incomingUI = document.getElementById("incomingCallUI");

const chatWindow = document.getElementById("chatWindow");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

const usersList = document.getElementById("usersList");
const themeBtn = document.getElementById("themeBtn");

// ===== ТЕМА (світла/темна) =====
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

// ===== ІСТОРІЯ ЧАТУ =====
window.addEventListener("load", () => {
  const history = JSON.parse(localStorage.getItem("chatHistory") || "[]");
  history.forEach(msg => addChatMessage(msg.from, msg.text, false));
});

// ===== JOIN ROOM =====
document.getElementById("joinBtn").onclick = () => {
  roomId = document.getElementById("roomId").value.trim();
  pin = document.getElementById("pin").value.trim();

  if (!roomId || !pin) return alert("Введіть Room ID і PIN");

  ws.send(JSON.stringify({ type: "join", roomId, pin }));
};

// ===== WEBSOCKET EVENTS =====
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

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
    window.incomingOffer = data.offer;
    ringtone.play();
    incomingUI.style.display = "block";
    return;
  }

  if (data.type === "answer") {
    if (pc) await pc.setRemoteDescription(data.answer);
    return;
  }

  if (data.type === "ice") {
    if (pc) await pc.addIceCandidate(data.candidate);
  }
};

// ===== ЧАТ =====
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

// ===== СПИСОК УЧАСНИКІВ =====
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

// ===== ЛОКАЛЬНІ МЕДІА =====
async function startLocalMedia() {
  const quality = document.getElementById("quality").value;

  let constraints = {
    audio: true,
    video: {
      facingMode: currentFacing
    }
  };

  if (quality === "low") {
    constraints.video.width = 320;
    constraints.video.height = 240;
  }
  if (quality === "med") {
    constraints.video.width = 640;
    constraints.video.height = 480;
  }
  if (quality === "high") {
    constraints.video.width = 1280;
    constraints.video.height = 720;
  }

  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  document.getElementById("localVideo").srcObject = localStream;
}

// ===== PEER CONNECTION =====
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

// ===== CALL =====
document.getElementById("callBtn").onclick = async () => {
  await startLocalMedia();
  await createConnection();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: "offer", roomId, offer }));
  statusDiv.textContent = "Виклик…";
};

// ===== ANSWER =====
document.getElementById("answerBtn").onclick = async () => {
  if (!window.incomingOffer) return;

  ringtone.pause();
  incomingUI.style.display = "none";

  await startLocalMedia();
  await createConnection();

  await pc.setRemoteDescription(window.incomingOffer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(JSON.stringify({ type: "answer", roomId, answer }));
  statusDiv.textContent = "Зʼєднано";
};

// ===== INCOMING UI BUTTONS =====
document.getElementById("acceptCall").onclick = () => {
  document.getElementById("answerBtn").click();
};

document.getElementById("declineCall").onclick = () => {
  ringtone.pause();
  incomingUI.style.display = "none";
};

// ===== HANGUP =====
document.getElementById("hangupBtn").onclick = () => {
  if (pc) pc.close();
  pc = null;
  statusDiv.textContent = "Завершено";
};

// ===== MUTE =====
document.getElementById("muteBtn").onclick = () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  document.getElementById("muteBtn").textContent = isMuted ? "Unmute" : "Mute";
};

// ===== CAMERA ON/OFF =====
document.getElementById("cameraBtn").onclick = () => {
  if (!localStream) return;
  isCameraOff = !isCameraOff;
  localStream.getVideoTracks()[0].enabled = !isCameraOff;
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
