import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Increase payload limit for base64 images
app.use(express.json({ limit: '10mb' }));
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = "AIzaSyBpxmLFYBBLv-fFK9aEm9Rjb3LNd1nW0Ms";

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        
        // Map messages to Gemini format
        const geminiMessages = messages.map(msg => {
            const parts = [];
            if (msg.content) parts.push({ text: msg.content });
            if (msg.image) {
                // Remove data:image/...;base64, prefix if present
                const base64Data = msg.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
                parts.push({
                    inlineData: {
                        mimeType: msg.image.match(/data:(image\/[a-zA-Z]+);base64/)?.[1] || "image/jpeg",
                        data: base64Data
                    }
                });
            }
            return {
                role: msg.role === 'assistant' ? 'model' : msg.role,
                parts: parts
            };
        });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: `You are StyleBot — a fun, trendy, and friendly AI Personal Shopper designed for everyone. Your only job is to help users discover outfits and clothing styles they will love.

PERSONALITY:
- Tone: upbeat, encouraging, fashion-forward
- Use light emojis (do not overdo it)

ONBOARDING & PERSONALIZATION:
- Always consider the user's age, gender, and occasion to provide the most appropriate and tailored outfit recommendations.
- Remember their details throughout the conversation.

OUTPUT FORMAT (VERY IMPORTANT):
- Keep your responses VERY CONCISE and short. People don't like to read long texts.
- Suggest complete outfits (top, bottom, footwear, accessories).
- Include an estimated budget range in INR.
- Whenever you suggest an outfit or item, you MUST provide a search link to find similar products. Use Google Shopping for the best results. Format strictly like this: [Find Similar Products](https://www.google.com/search?tbm=shop&q=black+leather+jacket).
- Use clean formatting with line breaks.

HARD RULES:
1. ONLY discuss: fashion, outfits, clothing, and styling tips. Redirect gently if off-topic.
2. NEVER provide medical, legal, financial, or harmful advice.
3. Keep it brief and to the point.
4. Always include product search links when suggesting items.` }]
                },
                contents: geminiMessages
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return res.status(response.status).json({ error: data.error?.message || "Failed to fetch from Gemini API" });
        }

        const replyText = data.candidates[0].content.parts[0].text;
        res.json({ reply: replyText });
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.listen(PORT, () => {
    console.log(`StyleBot server running on http://localhost:${PORT}`);
});

export default app;
