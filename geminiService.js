import dotenv from 'dotenv';
dotenv.config();

const MODEL_NAME = 'gemini-2.5-flash';

// Cache setup to store identical recent requests
const responseCache = new Map();
const CACHE_LIMIT = 100;

// Global cooldown setup to prevent RPM limits
let lastRequestTime = 0;
const COOLDOWN_MS = 1000; // 1 second between requests minimum

// Compressed system instruction to save input tokens
const SYSTEM_INSTRUCTION = `You are StyleBot, an AI Personal Stylist.
Your goal is to provide complete, detailed, and fashionable outfit recommendations.
Workflow:
1. Ask the user for their Gender.
2. Ask for their Age.
3. Ask for the Occasion or Event.
4. Once you have all 3 details, you MUST immediately provide a detailed outfit recommendation.

Outfit Recommendation Rules:
- Directly provide the outfit recommendation without conversational fluff.
- Write a complete answer consisting of at least 3 to 4 full, descriptive sentences.
- NEVER cut your sentences off abruptly. Ensure your response is completely finished.
- Always include a Google Shopping link format at the very end: [Find Similar Products](https://www.google.com/search?tbm=shop&q=...).
- ONLY discuss fashion.`;

function hashMessages(messages) {
    return JSON.stringify(messages);
}

// Combines consecutive messages from the same role to reduce request segments
// and limits history to the last 4 interactions to save tokens.
function compressMessages(messages) {
    const compressed = [];
    for (const msg of messages) {
        if (compressed.length > 0 && compressed[compressed.length - 1].role === msg.role) {
            compressed[compressed.length - 1].content += "\n" + msg.content;
            if (msg.image && !compressed[compressed.length - 1].image) {
                compressed[compressed.length - 1].image = msg.image; 
            }
        } else {
            compressed.push({ ...msg });
        }
    }
    // Keep enough history for the entire onboarding flow
    return compressed.slice(-12);
}

export async function generateChatResponse(messages) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("API Key is missing");

    // 1. Compress & Combine Messages
    const recentMessages = compressMessages(messages);
    
    // 2. Check Cache
    const cacheKey = hashMessages(recentMessages);
    if (responseCache.has(cacheKey)) {
        console.log("Serving from cache...");
        return { reply: responseCache.get(cacheKey) };
    }

    // 3. Enforce Cooldown Timer
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < COOLDOWN_MS) {
        throw { status: 429, message: "Whoa there, style icon! Please wait a moment before sending another message." };
    }
    lastRequestTime = Date.now();

    // Map to Gemini expected format
    const geminiMessages = recentMessages.map(msg => {
        const parts = [];
        if (msg.content) parts.push({ text: msg.content });
        if (msg.image) {
            const base64Data = msg.image.includes(',') ? msg.image.split(',')[1] : msg.image;
            const mimeTypeMatch = msg.image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
            const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
            parts.push({ inlineData: { mimeType, data: base64Data } });
        }
        return {
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts
        };
    });

    const payload = {
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: geminiMessages,
        generationConfig: {
            maxOutputTokens: 800 // Increased to ensure 3-4 full sentences are generated without being cut off
        }
    };

    // 4. Retry Logic with Exponential Backoff
    let retries = 2;
    let delay = 1000;

    while (retries >= 0) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 429) {
                if (retries > 0) {
                    console.warn(`Rate limited (429). Retrying in ${delay}ms...`);
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2;
                    retries--;
                    continue;
                } else {
                    throw { status: 429, message: "Gemini API rate limit exceeded. Please try again in a few seconds." };
                }
            }
            throw { status: response.status, message: data.error?.message || "Failed to fetch from Gemini API" };
        }

        const replyText = data.candidates[0].content.parts[0].text;
        
        // Update Cache
        if (responseCache.size >= CACHE_LIMIT) {
            const firstKey = responseCache.keys().next().value;
            responseCache.delete(firstKey);
        }
        responseCache.set(cacheKey, replyText);

        return { reply: replyText };
    }
}
