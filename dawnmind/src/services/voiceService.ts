import { UserProfile, Todo } from "../types";

export class VoiceService {
  constructor() {
    // Keys are now handled server-side for security
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.wav");

    const response = await fetch("/api/stt", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || "";
  }

  async speak(text: string, voiceId: string): Promise<ArrayBuffer> {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("TTS Error details:", errText);
      throw new Error(`TTS Error: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  async getAIResponse(
    userInput: string,
    profile: UserProfile,
    todos: Todo[],
    companionName: 'Mala' | 'Joseph'
  ): Promise<{ text: string; action?: 'add_todo' | 'complete_todo' | 'reminder' | 'settings_update'; pose?: string; todoUpdate?: { text: string; completed: boolean }; profileUpdate?: Partial<UserProfile> }> {
    const currentTime = new Date().toLocaleTimeString();
    const todoListStr = todos.map(t => `${t.text} (${t.completed ? 'completed' : 'pending'})`).join(", ");
    
    const companionAssets = companionName === 'Mala' ? ['idle', 'wave', 'thumbsup', 'remind', 'confused', 'celebrate'] : ['idle', 'fist', 'point', 'arms', 'confused', 'celebrate'];

    const systemPrompt = `You are ${companionName}, a warm personal morning companion. 
    User's name is ${profile.name}, they are a ${profile.occupation}, 
    they wake up at ${profile.wakeTime}, their peak work time is ${profile.importantTaskTime}, 
    they are ${profile.relationshipStatus}, and they prefer ${profile.reminderStyle} reminders.

    Current time is ${currentTime}. Current todos: ${todoListStr || 'None'}.

    Keep responses short, warm, and natural — like talking to a close friend. Max 2-3 sentences per response. 
    Use the user's name occasionally. 
    If they mention a task, add it to their todo list using action: "add_todo". 
    If they complete a task, mark it done using action: "complete_todo". 
    If they want to change their profile settings (name, wake time, etc.), use action: "settings_update" and provide the "profileUpdate" object.
    Give reminders based on time and their schedule using action: "reminder".
    Never be robotic.

    Select an appropriate pose from this list for your character: [${companionAssets.join(', ')}].
    - Use 'wave' or 'idle' for greetings.
    - Use 'thumbsup' (Mala) or 'fist' (Joseph) or 'celebrate' when something good happens.
    - Use 'remind' (Mala) or 'point' (Joseph) when reminding them of something.
    - Use 'confused' if you don't understand or they say something unexpected.
    - Use 'arms' (Joseph) for listening or being serious.
    
    Return your response as JSON in this format:
    {
      "text": "The message to speak",
      "pose": "the_chosen_pose",
      "action": "add_todo" | "complete_todo" | "reminder" | "settings_update" | null,
      "todoUpdate": { "text": "todo text", "completed": boolean } | null,
      "profileUpdate": { "name": "new name", ... } | null
    }
    ONLY return the JSON object, no other text.`;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput }
        ]
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      return JSON.parse(content || "{}");
    } catch (e) {
      return { text: content || "I'm sorry, I couldn't process that." };
    }
  }
}
