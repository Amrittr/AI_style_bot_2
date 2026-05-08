const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const quickChips = document.getElementById('quick-chips');
const typingIndicator = document.getElementById('typing-indicator');
const micBtn = document.getElementById('mic-btn');

let conversationHistory = [];

// Save History Function
function saveHistory() {
    if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
    }
    const historyKey = window.currentUserId ? `stylebot_history_${window.currentUserId}` : 'stylebot_history';
    localStorage.setItem(historyKey, JSON.stringify(conversationHistory));
}


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

function generateDynamicChips(text) {
    if (!quickChips) return;
    
    text = text.toLowerCase();
    let options = [];
    
    if (text.includes('gender') || text.includes('male or female') || text.includes('male, female')) {
        options = ['Male', 'Female', 'Non-binary'];
    } else if (text.includes('age') || text.includes('how old') || text.includes('years old')) {
        options = ['16 - 19', '20 - 24', '25 - 34', '35+'];
    } else if (text.includes('occasion') || text.includes('dressing for') || text.includes('event')) {
        options = ['Casual outing', 'Office wear', 'Party / Club', 'Wedding', 'Date night'];
    } else if (text.includes('budget') || text.includes('price')) {
        options = ['Under ₹2,000', '₹2,000 - ₹5,000', '₹5,000+'];
    }
    
    if (options.length > 0) {
        quickChips.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'chip';
            btn.textContent = opt;
            quickChips.appendChild(btn);
        });
        quickChips.style.display = 'flex';
    }
}

async function sendMessage(text) {
    if (!text.trim()) return;

    // Add user message to UI
    appendMessage(text, 'user');
    
    // Create message object for history
    const userMessage = { role: 'user', content: text };
    
    // Clear input
    userInput.value = '';
    
    // Hide chips when user sends a message
    if (quickChips) {
        quickChips.style.display = 'none';
    }

    // Add to history
    conversationHistory.push(userMessage);
    saveHistory();

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
            saveHistory();
            appendMessage(data.reply, 'bot');
            generateDynamicChips(data.reply);
        } else {
            console.error("Error from server:", data);
            const errorMsg = data.error || "Oops! I had a little wardrobe malfunction communicating with my server. 🥺";
            appendMessage(errorMsg, 'bot');
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
if (quickChips) {
    quickChips.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip')) {
            sendMessage(e.target.textContent);
        }
    });
}

// New Chat functionality
const newChatBtn = document.getElementById('new-chat-btn');
if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
        const historyKey = window.currentUserId ? `stylebot_history_${window.currentUserId}` : 'stylebot_history';
        localStorage.removeItem(historyKey);
        window.location.reload();
    });
}

// Load History
window.addEventListener('userLoaded', () => {
    const historyKey = window.currentUserId ? `stylebot_history_${window.currentUserId}` : 'stylebot_history';
    const savedHistory = localStorage.getItem(historyKey);
    if (savedHistory) {
        try {
            const parsed = JSON.parse(savedHistory);
            if (Array.isArray(parsed) && parsed.length > 0) {
                conversationHistory = parsed;
                if (quickChips) quickChips.style.display = 'none';
                
                parsed.forEach(msg => {
                    if (msg.role === 'user') {
                        appendMessage(msg.content, 'user', msg.image);
                    } else if (msg.role === 'assistant') {
                        appendMessage(msg.content, 'bot');
                    }
                });
                const lastMsg = parsed[parsed.length - 1];
                if (lastMsg.role === 'assistant') {
                    generateDynamicChips(lastMsg.content);
                }
            }
        } catch (e) {
            console.error("Error loading history", e);
        }
    }
});

// Speech to Text
if (micBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        let isRecording = false;

        micBtn.addEventListener('click', () => {
            if (!isRecording) {
                recognition.start();
                micBtn.style.backgroundColor = 'var(--deep-rose)';
                micBtn.style.color = 'white';
                isRecording = true;
            } else {
                recognition.stop();
                micBtn.style.backgroundColor = 'var(--bg-panel)';
                micBtn.style.color = 'var(--text-light)';
                isRecording = false;
            }
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value += (userInput.value ? ' ' : '') + transcript;
        };

        recognition.onspeechend = () => {
            recognition.stop();
            micBtn.style.backgroundColor = 'var(--bg-panel)';
            micBtn.style.color = 'var(--text-light)';
            isRecording = false;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            micBtn.style.backgroundColor = 'var(--bg-panel)';
            micBtn.style.color = 'var(--text-light)';
            isRecording = false;
        };
    } else {
        micBtn.style.display = 'none';
    }
}
