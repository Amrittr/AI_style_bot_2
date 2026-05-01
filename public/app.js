const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const quickChips = document.getElementById('quick-chips');
const typingIndicator = document.getElementById('typing-indicator');
const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image');

// Camera Elements
const cameraBtn = document.getElementById('camera-btn');
const cameraModal = document.getElementById('camera-modal');
const cameraFeed = document.getElementById('camera-feed');
const snapBtn = document.getElementById('snap-btn');
const closeCameraBtn = document.getElementById('close-camera-btn');
const cameraCanvas = document.getElementById('camera-canvas');

let conversationHistory = [];
let currentImageBase64 = null;
let stream = null;

// Convert file to base64
function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

imageUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            currentImageBase64 = await getBase64(file);
            imagePreview.src = currentImageBase64;
            imagePreviewContainer.style.display = 'block';
        } catch (error) {
            console.error("Error reading file:", error);
        }
    }
});

removeImageBtn.addEventListener('click', () => {
    currentImageBase64 = null;
    imageUpload.value = '';
    imagePreviewContainer.style.display = 'none';
});

// Camera Functionality
cameraBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        cameraFeed.srcObject = stream;
        cameraModal.classList.remove('hidden');
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Could not access camera. Please ensure permissions are granted in your browser settings.");
    }
});

function closeCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    cameraModal.classList.add('hidden');
}

closeCameraBtn.addEventListener('click', closeCamera);

snapBtn.addEventListener('click', () => {
    if (!stream) return;
    const context = cameraCanvas.getContext('2d');
    cameraCanvas.width = cameraFeed.videoWidth;
    cameraCanvas.height = cameraFeed.videoHeight;
    context.drawImage(cameraFeed, 0, 0, cameraCanvas.width, cameraCanvas.height);
    
    // Get high-quality JPEG base64
    currentImageBase64 = cameraCanvas.toDataURL('image/jpeg', 0.9);
    imagePreview.src = currentImageBase64;
    imagePreviewContainer.style.display = 'block';
    
    closeCamera();
});

// Format message for display and replace markdown links with actual anchors
function formatMessage(text) {
    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: var(--blush-pink); text-decoration: underline;">$1</a>')
        .replace(/\n/g, '<br>');
    return formattedText;
}

// Text-to-speech functionality
function speakText(text) {
    if ('speechSynthesis' in window) {
        // Stop any ongoing speech
        window.speechSynthesis.cancel();
        
        // Strip markdown and HTML for cleaner speech
        let cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[.*?\]\(.*?\)/g, 'a link').replace(/<br>/g, ' ');
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.1; // slightly faster
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    } else {
        alert("Sorry, your browser does not support text-to-speech.");
    }
}

function appendMessage(text, sender, imageUrl = null) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);

    let contentHTML = '';
    if (imageUrl) {
        contentHTML += `<img src="${imageUrl}" style="max-width: 200px; border-radius: 8px; margin-bottom: 8px; display: block;">`;
    }
    if (text) {
        contentHTML += `<span>${formatMessage(text)}</span>`;
    }

    if (sender === 'bot') {
        const messageId = 'msg-' + Date.now();
        msgDiv.innerHTML = `
            <div class="avatar"></div>
            <div class="bubble">
                ${contentHTML}
                <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
                    <button class="listen-btn" data-text="${encodeURIComponent(text)}" style="background: none; border: none; color: var(--blush-pink); cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 4px;">
                        🔊 Listen
                    </button>
                </div>
            </div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="bubble">${contentHTML}</div>
        `;
    }

    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    if (sender === 'bot') {
        const listenBtn = msgDiv.querySelector('.listen-btn');
        if (listenBtn) {
            listenBtn.addEventListener('click', () => {
                const textToSpeak = decodeURIComponent(listenBtn.getAttribute('data-text'));
                speakText(textToSpeak);
            });
        }
    }
}

function setTyping(isTyping) {
    if (isTyping) {
        typingIndicator.classList.remove('hidden');
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
        typingIndicator.classList.add('hidden');
    }
}

async function sendMessage(text) {
    if (!text.trim() && !currentImageBase64) return;

    // Add user message to UI
    appendMessage(text, 'user', currentImageBase64);
    
    // Create message object for history
    const userMessage = { role: 'user', content: text };
    if (currentImageBase64) {
        userMessage.image = currentImageBase64;
    }
    
    // Clear input
    userInput.value = '';
    currentImageBase64 = null;
    imageUpload.value = '';
    imagePreviewContainer.style.display = 'none';
    
    // Hide chips after first interaction
    if (quickChips && !quickChips.classList.contains('hidden')) {
        quickChips.style.display = 'none';
    }

    // Add to history
    conversationHistory.push(userMessage);

    setTyping(true);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ messages: conversationHistory })
        });

        const data = await response.json();

        setTyping(false);

        if (response.ok && data.reply) {
            conversationHistory.push({ role: 'assistant', content: data.reply });
            appendMessage(data.reply, 'bot');
        } else {
            console.error("Error from server:", data);
            appendMessage("Oops! I had a little wardrobe malfunction communicating with my server. 🥺", 'bot');
            conversationHistory.pop(); // remove last user message
        }
    } catch (error) {
        setTyping(false);
        console.error("Network Error:", error);
        appendMessage("Oops! I couldn't reach the server. Make sure it's running locally on port 3000! 🔌", 'bot');
        conversationHistory.pop(); // remove last user message
    }
}

// Event Listeners
sendBtn.addEventListener('click', () => {
    sendMessage(userInput.value);
});

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage(userInput.value);
    }
});

// Quick Chips interactions
document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        sendMessage(chip.textContent);
    });
});
