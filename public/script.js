const ws = new WebSocket(location.origin.replace(/^http/, "ws"));

let roomId = null;
let pin = null;

let localStream;
let pc;

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "openai",
      credential: "openai123"
    }
  ]
};

function createPeer() {
  pc = new RTCPeerConnection(servers);

  pc.onicecandidate = e => {
    if (e.candidate) {
      ws.send(JSON.stringify({
        type: "ice",
        candidate: e.candidate
      }));
    }
  };

  pc.ontrack = e => {
    document.getElementById("remoteVideo").srcObject = e.streams[0];
  };
}

ws.onmessage = async msg => {
  const data = JSON.parse(msg.data);

  if (data.type === "error") {
    alert(data.message);
    return;
  }

  if (data.type === "joined") {
    document.getElementById("callUI").classList.remove("hidden");
    document.getElementById("status").textContent = "Успішно увійшли в кімнату";
    return;
  }

  if (data.type === "offer") {
    document.getElementById("status").textContent = "Отримано дзвінок";

    createPeer();

    await pc.setRemoteDescription(data.offer);

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  } else if (data.type === "answer") {
    await pc.setRemoteDescription(data.answer);

  } else if (data.type === "ice") {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (e) {
      console.error("ICE error", e);
    }
  }
};

document.getElementById("joinRoom").onclick = () => {
  roomId = document.getElementById("roomId").value;
  pin = document.getElementById("pin").value;

  ws.send(JSON.stringify({
    type: "join",
    roomId,
    pin
  }));
};

document.getElementById("startCall").onclick = async () => {
  createPeer();

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  ws.send(JSON.stringify({ type: "offer", offer }));
  document.getElementById("status").textContent = "Відправлено дзвінок";
};

document.getElementById("answerCall").onclick = async () => {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  ws.send(JSON.stringify({ type: "answer", answer }));
  document.getElementById("status").textContent = "Відповідь відправлена";
};

document.getElementById("hangup").onclick = () => {
  if (pc) pc.close();
  document.getElementById("status").textContent = "Дзвінок завершено";
};