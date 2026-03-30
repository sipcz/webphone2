const ws = new WebSocket(`wss://${window.location.host}`);

let localStream;
let remoteStream;
let peerConnection;

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

document.getElementById("joinBtn").onclick = () => {
  const roomId = document.getElementById("room").value.trim();
  const pin = document.getElementById("pin").value.trim();

  if (!roomId || !pin) {
    alert("Введи ID кімнати та PIN");
    return;
  }

  ws.send(JSON.stringify({
    type: "join",
    roomId,
    pin
  }));
};

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "error") {
    alert(data.message);
    return;
  }

  if (data.type === "joined") {
    startCall();
    return;
  }

  if (data.type === "offer") {
    await handleOffer(data.offer);
    return;
  }

  if (data.type === "answer") {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    return;
  }

  if (data.type === "ice") {
    if (peerConnection) {
      await peerConnection.addIceCandidate(data.candidate);
    }
  }
};

async function startCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;

  peerConnection = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  document.getElementById("remoteVideo").srcObject = remoteStream;

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: "ice",
        candidate: event.candidate
      }));
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  ws.send(JSON.stringify({
    type: "offer",
    offer
  }));
}

async function handleOffer(offer) {
  peerConnection = new RTCPeerConnection(servers);

  remoteStream = new MediaStream();
  document.getElementById("remoteVideo").srcObject = remoteStream;

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
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
  document.getElementById("localVideo").srcObject = localStream;

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: "answer",
    answer
  }));
}
