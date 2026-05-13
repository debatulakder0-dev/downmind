import { UserProfile, Todo } from "../types";

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || "";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

export class VoiceService {
  constructor() {}

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model_id", "scribe_v1");

      const response = await fetch(
        "https://api.elevenlabs.io/v1/speech-to-text",
        {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
          body: formData,
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.text || "";
      }
    } catch (err) {
      console.error("ElevenLabs STT failed:", err);
    }

    return new Promise((resolve, reject) => {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        reject(new Error("Speech recognition not supported"));
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.onresult = (e: any) => resolve(e.results[0][0].transcript);
      recognition.onerror = (e: any) => reject(e);
      recognition.start();
    });
  }

  async speak(text: string, voiceId: string): Promise<ArrayBuffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            speed: 0.82,
            style: 0.35,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("TTS Error:", errText);
      throw new Error(`TTS Error: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  async getAIResponse(
    userInput: string,
    profile: UserProfile,
    todos: Todo[],
    companionName: "Mala" | "Joseph"
  ): Promise<{
    text: string;
    action?: "add_todo" | "complete_todo" | "reminder" | "settings_update" | null;
    pose?: string;
    todoUpdate?: { text: string; completed: boolean };
    profileUpdate?: Partial<UserProfile>;
  }> {
    const currentTime = new Date().toLocaleTimeString();
    const todoListStr = todos
      .map((t) => `${t.text} (${t.completed ? "completed" : "pending"})`)
      .join(", ");

    const companionAssets =
      companionName === "Mala"
        ? ["idle", "wave", "thumbsup", "remind"]
        : ["idle", "fist", "point", "arms"];

    const prompt = `You are ${companionName}, a warm personal morning companion. 
User's name is ${profile.name}, they are a ${profile.occupation}, 
they wake up at ${profile.wakeTime}, their peak work time is ${profile.importantTaskTime}, 
they are ${profile.relationshipStatus}, and they prefer ${profile.reminderStyle} reminders.

Current time is ${currentTime}. Current todos: ${todoListStr || "None"}.

Keep responses short, warm, and natural. Max 2-3 sentences. 
Use the user's name occasionally. 
If they mention a task, use action: "add_todo". 
If they complete a task, use action: "complete_todo". 
Give reminders based on time using action: "reminder".

Select pose from: [${companionAssets.join(", ")}].

Return ONLY this JSON:
{
  "text": "message to speak",
  "pose": "chosen_pose",
  "action": null,
  "todoUpdate": null,
  "profileUpdate": null
}

User says: ${userInput}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.8 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini Error:", errText);
      throw new Error(`Gemini Error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;

    try {
      const cleaned = content.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    } catch (e) {
      return { text: content || "I'm sorry, I couldn't process that." };
    }
  }
}
