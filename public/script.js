// Підключення до WebSocket на Render
const ws = new WebSocket(`wss://${window.location.host}`);

let localStream;
let remoteStream;
let peerConnection;
let isCaller = false;

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

const joinButton = document.getElementById("joinRoom");
const startCallBtn = document.getElementById("startCall");
const answerCallBtn = document.getElementById("answerCall");
const hangupBtn = document.getElementById("hangup");
const callUI = document.getElementById("callUI");
const statusSpan = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// Логи для діагностики
ws.onopen = () => console.log("WS CONNECTED");
ws.onerror = (e) => console.log("WS ERROR", e);
ws.onclose = () => console.log("WS CLOSED");

// Натискання "Увійти в кімнату"
joinButton.onclick = () => {
  const roomId = document.getElementById("roomId").value.trim();
  const pin = document.getElementById("pin").value.trim();

  if (!roomId || !pin) {
    alert("Введи ID кімнати та PIN");
    return;
  }

  if (ws.readyState !== WebSocket.OPEN) {
    alert("WebSocket не підключений");
    return;
  }

  ws.send(JSON.stringify({
    type: "join",
    roomId,
    pin
  }));

  console.log("JOIN SENT", roomId, pin);
};

// Обробка повідомлень від сервера
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  console.log("WS MESSAGE", data);

  if (data.type === "error") {
    alert(data.message);
    return;
  }

  if (data.type === "joined") {
    statusSpan.textContent = "Підключено до кімнати. Можна починати дзвінок.";
    callUI.classList.remove("hidden");
    return;
  }

  if (data.type === "offer") {
    isCaller = false;
    await handleOffer(data.offer);
    return;
  }

  if (data.type === "answer") {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      statusSpan.textContent = "Зʼєднано. Йде дзвінок.";
    }
    return;
  }

  if (data.type === "ice") {
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(data.candidate);
      } catch (e) {
        console.error("Error adding ICE candidate", e);
      }
    }
  }
};

// Старт дзвінка (ініціатор)
startCallBtn.onclick = async () => {
  isCaller = true;
  await setupConnection(true);
};

// Відповісти на дзвінок
answerCallBtn.onclick = () => {
  alert("Очікуємо вхідний дзвінок…");
};

// Завершити дзвінок
hangupBtn.onclick = () => {
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  if (remoteStream) remoteStream.getTracks().forEach(t => t.stop());

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  statusSpan.textContent = "Дзвінок завершено.";
};

// Налаштування PeerConnection
async function setupConnection(isInitiator) {
  statusSpan.textContent = "Налаштування зʼєднання…";

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: "ice",
        candidate: event.candidate
      }));
    }
  };

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({
      type: "offer",
      offer
    }));

    statusSpan.textContent = "Очікуємо відповідь…";
  }
}

// Обробка offer
async function handleOffer(offer) {
  statusSpan.textContent = "Отримано дзвінок. Налаштування…";

  peerConnection = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: "ice",
        candidate: event.candidate
      }));
    }
  };

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: "answer",
    answer
  }));

  statusSpan.textContent = "Зʼєднано. Йде дзвінок.";
}
