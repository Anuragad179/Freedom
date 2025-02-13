const socket = io("http://localhost:3000");
let peerConnection;
let dataChannel;
let remoteSocketId;

const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const leaveButton = document.getElementById("leave-button");
const newChatButton = document.getElementById("new-chat-button");
const statusDiv = document.getElementById("status");

// STUN server config
const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Update UI for status changes
function updateStatus(text) {
    statusDiv.textContent = text;
}

// When matched with a partner
socket.on("match", (partnerId) => {
    remoteSocketId = partnerId;
    createPeerConnection();
    dataChannel = peerConnection.createDataChannel("chat");
    setupDataChannel();
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => socket.emit("signal", { to: remoteSocketId, data: peerConnection.localDescription }));

    updateStatus("✅ Connected to a partner!");
    messageInput.disabled = false;
    sendButton.disabled = false;
});

// Handle incoming WebRTC signaling
socket.on("signal", async ({ from, data }) => {
    remoteSocketId = from;
    if (!peerConnection) createPeerConnection();

    if (data.type === "offer") {
        console.log("🔄 Received OFFER from", from, "Signaling State:", peerConnection.signalingState);

        if (peerConnection.signalingState !== "stable") {
            console.warn("⏳ Offer rejected due to unstable signaling state. Retrying in 1 second...");
            setTimeout(() => socket.emit("signal", { to: from, data }), 1000);
            return;
        }

        console.log("✅ Setting remote offer...");
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        dataChannel = peerConnection.createDataChannel("chat");
        setupDataChannel();

        console.log("📡 Creating answer...");
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("signal", { to: from, data: peerConnection.localDescription });

        console.log("📨 Sent ANSWER to", from);
    } else if (data.type === "answer") {
        console.log("🔄 Received ANSWER from", from, "Signaling State:", peerConnection.signalingState);

        // ✅ Fix: Only set the answer if the state is correct
        if (peerConnection.signalingState === "have-local-offer") {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        } else {
            console.warn("⚠️ Skipping answer because signaling state is incorrect.");
        }
    } else if (data.candidate) {
        console.log("📡 Received ICE Candidate from", from, "Candidate:", data.candidate);
        if (data.candidate && data.candidate.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
});

socket.on("partner-disconnected", () => {
    displayMessage("System", "Your chat partner has disconnected.");
    updateStatus("🔄 Looking for a new match...");
    resetUI();
});

// Create WebRTC peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("signal", { to: remoteSocketId, data: event.candidate });
        }
    };

    if (!dataChannel) {
        console.log("📡 Creating DataChannel...");
        dataChannel = peerConnection.createDataChannel("chat");
        setupDataChannel();
    }

    peerConnection.ondatachannel = (event) => {
        console.log("🎉 DataChannel event received!");; // Debugging log
        dataChannel = event.channel;
        setupDataChannel();
    };
}

// Set up DataChannel
function setupDataChannel() {
    if (!dataChannel) {
        console.error("❌ DataChannel is NULL! WebRTC connection might not be stable.");
        return;
    }

    dataChannel.onopen = () => {
        console.log("✅ DataChannel is OPEN");
        displayMessage("System", "Connected to peer.");
        messageInput.disabled = false;
        sendButton.disabled = false;
    };

    dataChannel.onmessage = (event) => {
        console.log("📩 Received message:", event.data);
        displayMessage("Partner", event.data);
    };

    dataChannel.onerror = (error) => {
        console.error("⚠️ DataChannel Error:", error);
    };

    dataChannel.onclose = () => {
        console.warn("❌ DataChannel is CLOSED");
        if (statusDiv.textContent !== "🔄 Looking for a match...") {
            displayMessage("System", "Chat disconnected.");
            updateStatus("🔄 Looking for a match...");
            resetUI();
        }
    };
}

// Send message
sendButton.onclick = () => {
    const message = messageInput.value;
    if (message && dataChannel.readyState === "open") {
        dataChannel.send(message);
        displayMessage("You", message);
        messageInput.value = "";
    }
};

// Leave chat
leaveButton.onclick = () => {
    if (peerConnection) peerConnection.close();
    if (dataChannel) dataChannel.close();
    socket.emit("leave");
    updateStatus("🔄 Looking for a match...");
};

// Find new chat
newChatButton.onclick = () => {
    if (peerConnection) peerConnection.close();
    if (dataChannel) dataChannel.close();

    peerConnection = null;
    dataChannel = null;

    socket.emit("find-new");
    updateStatus("🔄 Looking for a new match...");
    resetUI();
};

messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        if (event.shiftKey) {
            // ✅ Shift+Enter inserts a new line
            event.preventDefault();
            messageInput.value += "\n";
        } else {
            // ✅ Enter sends the message
            event.preventDefault();
            sendMessage();
        }
    }
});

sendButton.onclick = sendMessage();

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return; // Prevent sending empty messages

    if (dataChannel && dataChannel.readyState === "open") {
        console.log("📨 Sending message:", message); // Debugging log
        dataChannel.send(message);
        displayMessage("You", message);
        messageInput.value = "";
    } else {
        console.warn("⚠️ Cannot send message: DataChannel is not open. Retrying...");
        setTimeout(sendMessage, 500);
    }
}

messageInput.addEventListener("input", () => {
    if (dataChannel && dataChannel.readyState === "open") {
        dataChannel.send("TYPING...");
    }
});

dataChannel.onmessage = (event) => {
    if (event.data === "TYPING...") {
        statusDiv.textContent = "✍️ Your partner is typing...";
        setTimeout(() => {
            updateStatus("✅ Connected to a partner!");
        }, 2000);
    } else {
        displayMessage("Partner", event.data);
    }
};

dataChannel.onclose = () => {
    console.warn("❌ DataChannel is CLOSED");

    // ✅ Check if the UI is already reset before displaying the message again
    if (statusDiv.textContent !== "🔄 Looking for a match...") {
        displayMessage("System", "Chat disconnected.");
        updateStatus("🔄 Looking for a match...");
        resetUI();
    }
};

// Display messages
function displayMessage(sender, message) {
    const msgDiv = document.createElement("div");
    msgDiv.textContent = `${sender}: ${message}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

let waitTime = 0;
setInterval(() => {
    if (!remoteSocketId) {
        waitTime += 1;
        updateStatus(`🔄 Searching for a match... (${waitTime}s)`);
    }
}, 1000);

const notificationSound = new Audio("notification.mp3");

dataChannel.onmessage = (event) => {
    displayMessage("Partner", event.data);
    notificationSound.play();
};

function resetUI() {
    messageInput.disabled = true;
    sendButton.disabled = true;
    leaveButton.disabled = true;
}
