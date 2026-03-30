// ================== БАЗА ==================

// WebSocket на Render
const ws = new WebSocket(`wss://${window.location.host}`);

let localStream;
let remoteStream;
let peerConnection;
let SHARED_KEY = null; // ключ з PIN

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

// Логи
ws.onopen = () => console.log("WS CONNECTED");
ws.onerror = (e) => console.log("WS ERROR", e);
ws.onclose = () => console.log("WS CLOSED");

// ================== E2EE (Insertable Streams, PIN → ключ) ==================

// Дуже простий “шифр” XOR (демо). Можна замінити на AES-GCM.
function xorTransform(data, key) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length];
  }
  return out;
}

// Шифрування вихідного відео (sender)
async function enableSenderE2EE(pc) {
  if (!SHARED_KEY) {
    console.warn("No SHARED_KEY for sender E2EE");
    return;
  }
  if (!("getSenders" in pc)) return;
  const senders = pc.getSenders().filter(s => s.track && s.track.kind === "video");
  if (!senders.length) return;

  for (const sender of senders) {
    if (!sender.createEncodedStreams) {
      console.warn("Sender insertable streams not supported");
      continue;
    }

    const { readable, writable } = sender.createEncodedStreams();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        chunk.data = xorTransform(chunk.data, SHARED_KEY);
        controller.enqueue(chunk);
      }
    });

    readable
      .pipeThrough(transformStream)
      .pipeTo(writable)
      .catch(e => console.warn("Sender E2EE error:", e));
  }
}

// Розшифрування вхідного відео (receiver)
async function enableReceiverE2EE(pc) {
  if (!SHARED_KEY) {
    console.warn("No SHARED_KEY for receiver E2EE");
    return;
  }
  if (!("getReceivers" in pc)) return;
  const receivers = pc.getReceivers().filter(r => r.track && r.track.kind === "video");
  if (!receivers.length) return;

  for (const receiver of receivers) {
    if (!receiver.createEncodedStreams) {
      console.warn("Receiver insertable streams not supported");
      continue;
    }

    const { readable, writable } = receiver.createEncodedStreams();

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        chunk.data = xorTransform(chunk.data, SHARED_KEY);
        controller.enqueue(chunk);
      }
    });

    readable
      .pipeThrough(transformStream)
      .pipeTo(writable)
      .catch(e => console.warn("Receiver E2EE error:", e));
  }
}

// ================== JOIN / SIGNALING ==================

// Вхід у кімнату
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

  // PIN → ключ (32 байти)
  SHARED_KEY = new TextEncoder().encode(pin.toString().padEnd(32, "0"));
  console.log("SHARED_KEY derived from PIN");

  ws.send(JSON.stringify({
    type: "join",
    roomId,
    pin
  }));

  console.log("JOIN SENT", roomId, pin);
};

// Обробка сигналінгу
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
    if (peerConnection && peerConnection.signalingState !== "stable") {
      console.warn("Ignoring offer in state:", peerConnection.signalingState);
      return;
    }
    await handleOffer(data.offer);
    return;
  }

  if (data.type === "answer") {
    if (!peerConnection) return;
    if (peerConnection.signalingState !== "have-local-offer") {
      console.warn("Ignoring duplicate answer in state:", peerConnection.signalingState);
      return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    statusSpan.textContent = "Зʼєднано. Йде дзвінок.";
    return;
  }

  if (data.type === "ice") {
    if (!peerConnection || peerConnection.signalingState === "closed") return;
    try {
      await peerConnection.addIceCandidate(data.candidate);
    } catch (e) {
      console.warn("ICE ignored:", e);
    }
  }
};

// ================== КНОПКИ ДЗВІНКА ==================

// Старт дзвінка (ініціатор)
startCallBtn.onclick = async () => {
  await setupConnection(true);
};

// Відповісти
answerCallBtn.onclick = () => {
  alert("Очікуємо вхідний дзвінок…");
};

// Завершити
hangupBtn.onclick = () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (remoteStream) {
    remoteStream.getTracks().forEach(t => t.stop());
    remoteStream = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  statusSpan.textContent = "Дзвінок завершено.";
};

// ================== WebRTC ЛОГІКА ==================

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

  // Увімкнути E2EE
  enableSenderE2EE(peerConnection);
  enableReceiverE2EE(peerConnection);

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

// Обробка offer (для того, хто відповідає)
async function handleOffer(offer) {
  statusSpan.textContent = "Отримано дзвінок. Налаштування…";

  if (!peerConnection || peerConnection.signalingState === "closed") {
    peerConnection = new RTCPeerConnection(servers);
  }

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

  // Увімкнути E2EE
  enableSenderE2EE(peerConnection);
  enableReceiverE2EE(peerConnection);

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: "answer",
    answer
  }));

  statusSpan.textContent = "Зʼєднано. Йде дзвінок.";
}
