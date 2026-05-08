import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateChatResponse } from './geminiService.js';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Increase payload limit for base64 images
app.use(express.json({ limit: '10mb' }));
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Invalid messages format" });
        }
        
        const response = await generateChatResponse(messages);
        res.json(response);
    } catch (error) {
        console.error("Server/API Error:", error);
        const status = error.status || 500;
        res.status(status).json({ error: error.message || "Internal server error" });
    }
});

app.post('/api/admin/update-key', async (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey) return res.status(400).json({ error: "API Key required" });
        
        // Update in memory
        process.env.GEMINI_API_KEY = apiKey;
        
        // Persist to .env file
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            if (envContent.includes('GEMINI_API_KEY=')) {
                envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${apiKey}`);
            } else if (envContent.includes('DEEPSEEK_API_KEY=')) {
                envContent = envContent.replace(/DEEPSEEK_API_KEY=.*/g, `GEMINI_API_KEY=${apiKey}`);
            } else {
                envContent += `\nGEMINI_API_KEY=${apiKey}\n`;
            }
            fs.writeFileSync(envPath, envContent);
        }
        
        res.json({ success: true, message: "API Key updated successfully" });
    } catch (error) {
        console.error("Error updating API key:", error);
        res.status(500).json({ error: "Failed to update API key" });
    }
});

app.listen(PORT, () => {
    console.log(`StyleBot server running on http://localhost:${PORT}`);
});

export default app;
