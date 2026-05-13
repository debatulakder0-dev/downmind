import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Settings, Play, CheckCircle2, Circle, Volume2, VolumeX } from 'lucide-react';
import { UserProfile, Todo, Pose } from './types';
import { VoiceService } from './services/voiceService';
import { getSupabase, getDeviceId } from './lib/supabase';

// Fallback image placeholders since generation failed
const ASSETS = {
  videos: [
    'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/wildflower_meadow.mp4',
    'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/soft_flower_field.mp4',
    'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/sunflower_sunset.mp4',
    'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/japanese_garden.mp4'
  ],
  mala: {
  idle: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/mala_idle.png',
  wave: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/mala_wave.png',
  thumbsup: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/mala_thumbsup.png',
  remind: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/mala_remind.png'
},
joseph: {
  idle: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/joseph_idle.png',
  fist: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/joseph_fist.png',
  point: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/joseph_point.png',
  arms: 'https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/joseph_arms.png'
}
};

const MALA_VOICE_ID = "pPdl9cQBQq4p6mRkZy2Z";
const JOSEPH_VOICE_ID = "fIGaHjfrR8KmMy0vGEVJ";

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [introState, setIntroState] = useState<'black' | 'light' | 'text' | 'card' | 'done'>('black');
  const [onboardingData, setOnboardingData] = useState<UserProfile>({
    name: '',
    gender: '',
    occupation: '',
    wakeTime: '',
    importantTaskTime: '',
    relationshipStatus: '',
    reminderStyle: '',
    companion: 'mala'
  });
  const [activeRecordingField, setActiveRecordingField] = useState<keyof UserProfile | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [currentPose, setCurrentPose] = useState<Pose>('idle');
  const [videoIndex, setVideoIndex] = useState(0);
  const [status, setStatus] = useState('Tap to start');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('dawnmind_muted');
    return saved === 'true';
  });
  const [hasInteracted, setHasInteracted] = useState(false);

  const voiceService = useRef<VoiceService | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioPlayer = useRef<HTMLAudioElement | null>(null);
  const ttsLock = useRef(false);
  
  // Video preloading refs
  const videoRefs = [
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null),
    useRef<HTMLVideoElement>(null)
  ];
  
  // Continuous conversation refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef(0);
  const silenceIntervalRef = useRef<number | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const recordingFieldRef = useRef<keyof UserProfile | null>(null);

  useEffect(() => {
    // Initialize Background Music
    const audio = new Audio('https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/Morning_Coffee_Lofi_2026-05-13T091751.mp3');
    audio.volume = isMuted ? 0 : 0.15;
    audio.loop = true;
    bgMusicRef.current = audio;

    // Attempt autoplay
    const playAttempt = () => {
      audio.play().catch(() => {
        console.log("Autoplay blocked. Waiting for interaction.");
      });
    };

    playAttempt();

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (bgMusicRef.current) {
      bgMusicRef.current.volume = isMuted ? 0 : 0.15;
      localStorage.setItem('dawnmind_muted', String(isMuted));
    }
  }, [isMuted]);

  const handleFirstInteraction = () => {
    if (!hasInteracted) {
      if (bgMusicRef.current) {
        bgMusicRef.current.play().catch(console.error);
      }
      // Start all background videos on first interaction
      videoRefs.forEach(ref => {
        if (ref.current) {
          ref.current.play().catch(err => {
            console.warn("Background video play failed on interaction:", err.message);
          });
        }
      });
      setHasInteracted(true);
    }
  };

  const playVideoSafely = async (video: HTMLVideoElement | null) => {
    if (!video) return;
    try {
      await video.play();
    } catch (err: any) {
      // Ignore "interrupted" or "paused to save power" errors which are common for background video
      if (err.name === 'AbortError' || err.message.includes('interrupted') || err.message.includes('power')) {
        console.warn("Video playback was interrupted or restricted by power saving.");
      } else {
        console.error("Critical video playback error:", err);
      }
    }
  };

  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      const deviceId = getDeviceId();
      const client = getSupabase();

      // 1. Try Supabase first
      if (client) {
        try {
          const { data, error } = await (client as any)
            .from('users')
            .select('*')
            .eq('device_id', deviceId)
            .maybeSingle();

          if (data && data.name) {
            // User exists, map to camelCase profile
            const mappedProfile: UserProfile = {
              name: data.name,
              gender: data.gender,
              occupation: data.occupation || '',
              wakeTime: data.wake_time || '',
              importantTaskTime: data.important_task_time || '',
              relationshipStatus: data.relationship_status || '',
              reminderStyle: data.reminder_style || '',
              companion: data.companion || 'mala'
            };
            setProfile(mappedProfile);
            setIntroState('done');

            // Load todos
            const { data: todoData } = await (client as any)
              .from('todos')
              .select('*')
              .eq('device_id', deviceId)
              .order('createdAt', { ascending: true });
            if (todoData) setTodos(todoData || []);
            
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('Supabase init error:', err);
        }
      }

      // 2. Try localStorage fallback
      try {
        const saved = localStorage.getItem('dawnmind_user');
        const savedTodos = localStorage.getItem('dawnmind_todos');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.name) {
            setProfile(parsed);
            setIntroState('done');
            if (savedTodos) setTodos(JSON.parse(savedTodos));
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error('LocalStorage error:', err);
      }

      // 3. No existing user, show onboarding sequence
      setIntroState('black');
      setIsLoading(false);
    };

    initialize();
  }, []);

  const loadProfile = async () => {
    const client = getSupabase() as any;
    if (!client) return;

    try {
      const deviceId = getDeviceId();
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('device_id', deviceId)
        .single();
      
      if (error) throw error;
      if (data) {
        const mappedProfile: UserProfile = {
          name: data.name,
          gender: data.gender,
          occupation: data.occupation || '',
          wakeTime: data.wake_time || '',
          importantTaskTime: data.important_task_time || '',
          relationshipStatus: data.relationship_status || '',
          reminderStyle: data.reminder_style || '',
          companion: data.companion || 'mala'
        };
        setProfile(mappedProfile);
        localStorage.setItem('dawnmind_user', JSON.stringify(mappedProfile));
        setIntroState('done');
      }
    } catch (err) {
      console.error('Error loading profile from Supabase:', err);
    }
  };

  const saveProfile = async (profileData: UserProfile) => {
    const deviceId = getDeviceId();
    localStorage.setItem('dawnmind_user', JSON.stringify(profileData));

    const client = getSupabase() as any;
    if (!client) return;

    try {
      const dbProfile = {
        device_id: deviceId,
        name: profileData.name,
        gender: profileData.gender,
        occupation: profileData.occupation,
        wake_time: profileData.wakeTime,
        important_task_time: profileData.importantTaskTime,
        relationship_status: profileData.relationshipStatus,
        reminder_style: profileData.reminderStyle,
        companion: profileData.companion,
        updated_at: new Date().toISOString()
      };

      const { error } = await client
        .from('users')
        .upsert(dbProfile);
      if (error) throw error;
    } catch (err) {
      console.error('Error saving profile to Supabase:', err);
      throw err; // Re-throw to allow caller to handle
    }
  };

  const loadTodos = async () => {
    const client = getSupabase() as any;
    if (!client) return;

    try {
      const deviceId = getDeviceId();
      const { data, error } = await client
        .from('todos')
        .select('*')
        .eq('device_id', deviceId)
        .order('createdAt', { ascending: true });
      
      if (error) throw error;
      if (data) {
        setTodos(data);
        localStorage.setItem('dawnmind_todos', JSON.stringify(data));
      }
    } catch (err) {
      console.error('Error loading todos from Supabase:', err);
    }
  };

  const saveTodo = async (todo: Todo) => {
    const deviceId = getDeviceId();
    const client = getSupabase() as any;
    if (!client) return;

    try {
      const { error } = await client
        .from('todos')
        .upsert({ 
          id: todo.id,
          text: todo.text,
          time: todo.time,
          completed: todo.completed,
          createdAt: todo.createdAt,
          device_id: deviceId 
        });
      if (error) throw error;
    } catch (err) {
      console.error('Error saving todo to Supabase:', err);
    }
  };

  const updateTodoStatus = async (id: string, completed: boolean) => {
    const client = getSupabase() as any;
    if (!client) return;

    try {
      const { error } = await client
        .from('todos')
        .update({ completed })
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Error updating todo status in Supabase:', err);
    }
  };

  useEffect(() => {
    if (introState === 'black') {
      setTimeout(() => setIntroState('light'), 500);
    } else if (introState === 'light') {
      setTimeout(() => setIntroState('text'), 1000);
    } else if (introState === 'text') {
      setTimeout(() => setIntroState('card'), 2500);
    }
  }, [introState]);

  useEffect(() => {
    voiceService.current = new VoiceService();
  }, []);

  useEffect(() => {
    console.log("Loading background videos:");
    ASSETS.videos.forEach((v, i) => console.log(`Video ${i}: ${v}`));
    
    // Add check for audio music
    const checkMusic = new Audio('https://xhbzfdjwuaejhysxtrfl.supabase.co/storage/v1/object/public/elevenhacks/Morning_Coffee_Lofi_2026-05-13T091751.mp3');
    checkMusic.addEventListener('error', (e) => {
      console.error("Background music failed to load:", e);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Play the first video immediately on mount
    if (videoRefs[0].current) {
      playVideoSafely(videoRefs[0].current);
    }
    
    return () => clearInterval(timer);
  }, []);

  // When video index changes, ensure the new video is playing
  useEffect(() => {
    const activeVideo = videoRefs[videoIndex].current;
    if (activeVideo) {
      activeVideo.currentTime = 0;
      playVideoSafely(activeVideo);
    }
  }, [videoIndex]);

  useEffect(() => {
    if (!onboardingData.gender || !onboardingData.relationshipStatus) return;
    const isMale = onboardingData.gender === 'male';
    const isInRelationship = onboardingData.relationshipStatus === 'relationship';
    const companion = (isMale && isInRelationship) ? 'joseph' : 'mala';
    
    // Only auto-flip if user hasn't made a choice yet or we are at start
    // If onboardingData.companion is '' or matches the default for gender/relationship before it was changed
    setOnboardingData(prev => ({ ...prev, companion }));
  }, [onboardingData.gender, onboardingData.relationshipStatus]);

  useEffect(() => {
    if (profile) localStorage.setItem('dawnmind_user', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('dawnmind_todos', JSON.stringify(todos));
  }, [todos]);

  const handleMicClick = async () => {
    handleFirstInteraction();
    if (isRecording || isContinuousMode || isThinking || isSpeaking) {
      stopConversation();
    } else {
      setIsContinuousMode(true);
      startRecording();
    }
  };

  const stopConversation = () => {
    setIsContinuousMode(false);
    stopRecording();
    if (audioPlayer.current) {
      audioPlayer.current.pause();
      audioPlayer.current.currentTime = 0;
    }
    setIsSpeaking(false);
    setIsThinking(false);
    setStatus('Tap to start');
    setCurrentPose('idle');
  };

  const handleOnboardingMic = (field: keyof UserProfile) => {
    handleFirstInteraction();
    if (isRecording) {
      stopRecording();
      if (activeRecordingField !== field) {
        // If switching fields, start new recording after short delay to let previous cleanup
        setTimeout(() => {
          setActiveRecordingField(field);
          startRecording();
        }, 300);
      } else {
        setActiveRecordingField(null);
      }
    } else {
      setActiveRecordingField(field);
      startRecording();
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Mic Not Supported');
      return;
    }

    setIsRecording(true);
    setStatus('Listening...');
    recordingFieldRef.current = activeRecordingField;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Silence Detection
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 512;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      silenceTimerRef.current = 0;

      const silenceThreshold = activeRecordingField ? 2000 : 1500;

      silenceIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
        if (volume < 10) {
          silenceTimerRef.current += 100;
          if (silenceTimerRef.current >= silenceThreshold) {
            stopRecording();
          }
        } else {
          silenceTimerRef.current = 0;
        }
      }, 100);

      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = processAudio;
      mediaRecorder.current.start();
      
      // Pose for listening
      if (profile?.companion === 'joseph') {
        setCurrentPose('arms');
      } else {
        setCurrentPose('idle');
      }
    } catch (err: any) {
      console.error("Microphone error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('Permission Denied — Please allow mic or open in new tab');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setStatus('Mic Not Found');
      } else {
        setStatus(`Mic Error: ${err.message || 'Unknown error'}`);
      }
      
      // Tip for iframe permission issue
      if (window.self !== window.top) {
        console.warn("Iframe microphone access may require explicit permission. If blocked, click 'Open in new tab'.");
      }
    }
  };

  const stopRecording = () => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }

    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      setIsRecording(false);
      
      // If we're not in onboarding, show thinking status
      if (introState !== 'card') {
        setStatus('Thinking...');
        setIsThinking(true);
      } else {
        setStatus('Processing...');
      }
      
      // Pose for processing
      if (profile?.companion === 'joseph') {
        setCurrentPose('arms');
      } else {
        setCurrentPose('idle');
      }
    }
  };

  const processAudio = async () => {
    if (!voiceService.current) return;
    const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
    
    try {
      let text = '';
      try {
        text = await voiceService.current.transcribeAudio(audioBlob);
      } catch (sttErr) {
        console.error("ElevenLabs STT failed, throwing to fallback:", sttErr);
        throw sttErr;
      }
      
      if (!text || text.trim().length === 0) throw new Error("Empty transcription");

      if (introState === 'card') {
        const field = recordingFieldRef.current;
        if (field) {
          setOnboardingData(prev => ({ ...prev, [field]: text }));
          recordingFieldRef.current = null;
          setActiveRecordingField(null);
        }
        setIsThinking(false);
        setStatus('Tap to speak');
      } else {
        handleMainConversation(text);
      }
    } catch (err) {
      console.error("Transcription error:", err);
      const field = recordingFieldRef.current;
      
      if (introState === 'card' && field) {
        // Web Speech API Fallback for Onboarding
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          setStatus('Listening (Fallback)...');
          recognition.onresult = (e: any) => {
            const textResult = e.results[0][0].transcript;
            console.log("Fallback transcription successful:", textResult);
            setOnboardingData(prev => ({ ...prev, [field]: textResult }));
            recordingFieldRef.current = null;
            setActiveRecordingField(null);
            setStatus('Tap to speak');
            setIsThinking(false);
          };
          recognition.onerror = (e: any) => {
            console.error("Fallback STT Error:", e);
            recordingFieldRef.current = null;
            setActiveRecordingField(null);
            setStatus('Mic Error');
            setIsThinking(false);
          };
          recognition.onend = () => {
             if (status === 'Listening (Fallback)...') {
               setIsThinking(false);
               setStatus('Tap to speak');
             }
          };
          recognition.start();
          return;
        }
      }
      
      if (introState !== 'card') {
        speakResponse("I'm sorry, I couldn't understand that. Could you say it again?");
      } else {
        setStatus('Tap to speak');
      }
      setIsThinking(false);
    }
  };

  const handleMainConversation = async (userInput: string) => {
    if (!voiceService.current || !profile) return;
    
    try {
      const companionName = profile.companion === 'mala' ? 'Mala' : 'Joseph';
      const aiResponse = await voiceService.current.getAIResponse(userInput, profile, todos, companionName);
      
      if (aiResponse.pose) {
        setCurrentPose(aiResponse.pose as Pose);
      }

      if (aiResponse.action === 'add_todo' && aiResponse.todoUpdate) {
        const newTodo: Todo = {
          id: Math.random().toString(36).substr(2, 9),
          text: aiResponse.todoUpdate!.text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          completed: false,
          createdAt: Date.now()
        };
        setTodos(prev => [...prev, newTodo].slice(-10));
        saveTodo(newTodo);
        setCurrentPose(profile.companion === 'mala' ? 'thumbsup' : 'fist');
      } else if (aiResponse.action === 'complete_todo' && aiResponse.todoUpdate) {
        setTodos(prev => {
          const updated = prev.map(t => 
            t.text.toLowerCase().includes(aiResponse.todoUpdate!.text.toLowerCase()) 
              ? { ...t, completed: true } 
              : t
          );
          // Sync with supabase
          const completedTodo = updated.find(t => t.text.toLowerCase().includes(aiResponse.todoUpdate!.text.toLowerCase()));
          if (completedTodo) updateTodoStatus(completedTodo.id, true);
          return updated;
        });
        setCurrentPose(profile.companion === 'mala' ? 'thumbsup' : 'fist');
      } else if (aiResponse.action === 'settings_update' && aiResponse.profileUpdate) {
        const newProfile = { ...profile!, ...aiResponse.profileUpdate };
        setProfile(newProfile);
        saveProfile(newProfile);
      } else if (aiResponse.action === 'reminder') {
        setCurrentPose(profile.companion === 'mala' ? 'remind' : 'point');
      }

      speakResponse(aiResponse.text);
    } catch (err) {
      console.error(err);
      speakResponse("I'm having trouble thinking right now. Could you try again?");
    }
  };

  const speakResponse = async (text: string) => {
    if (!voiceService.current || ttsLock.current) {
      console.warn("TTS already in progress or service missing, skipping.");
      return;
    }
    
    ttsLock.current = true;
    const companion = profile?.companion || 'mala';
    const voiceId = companion === 'mala' ? MALA_VOICE_ID : JOSEPH_VOICE_ID;
    
    try {
      setStatus('Thinking...');
      const audioBuffer = await voiceService.current.speak(text, voiceId);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(audioBlob);
      
      if (audioPlayer.current) {
        audioPlayer.current.src = url;
        audioPlayer.current.play().catch(e => {
          console.error("Audio playback failed:", e);
          setIsSpeaking(false);
          setIsThinking(false);
          ttsLock.current = false;
        });
        setIsThinking(false);
        setIsSpeaking(true);
        setStatus('Speaking...');
        
        // Handle pose during speaking
        if (currentPose === 'idle') {
           if (companion === 'mala') setCurrentPose('wave');
           else setCurrentPose('fist');
        }

        audioPlayer.current.onended = () => {
          setCurrentPose('idle');
          setIsSpeaking(false);
          ttsLock.current = false;
          
          if (isContinuousMode) {
            setStatus('Waiting...');
            setTimeout(() => {
              if (isContinuousMode) startRecording();
            }, 800);
          } else {
            setStatus('Tap to start');
          }
        };

        audioPlayer.current.onerror = (e) => {
          console.error("Audio player error:", e);
          ttsLock.current = false;
          setIsSpeaking(false);
          setIsThinking(false);
        };
      }
    } catch (err) {
      console.error("TTS speak failed:", err);
      // Extra detailed logging for ElevenLabs conflict
      if (err instanceof Error && err.message.includes("409")) {
        console.warn("ElevenLabs conflict detected (already_running). Concurrency lock should prevent this, but logging for investigation.");
      }
      setStatus(isContinuousMode ? 'Waiting...' : 'Tap to start');
      setIsThinking(false);
      setIsSpeaking(false);
      ttsLock.current = false;
    }
  };

  const toggleTodo = (id: string) => {
    setTodos(prev => {
      const updated = prev.map(t => {
        if (t.id === id) {
          const newStatus = !t.completed;
          updateTodoStatus(id, newStatus);
          return { ...t, completed: newStatus };
        }
        return t;
      });
      localStorage.setItem('dawnmind_todos', JSON.stringify(updated));
      return updated;
    });
  };

  const handleVideoEnd = (index: number) => {
    if (index === videoIndex) {
      setVideoIndex((prev) => (prev + 1) % ASSETS.videos.length);
    }
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  };

  const handleStartMornings = async () => {
    console.log("handleStartMornings triggered");
    setIsThinking(true);
    try {
      const deviceId = getDeviceId();
      const profileData = {
        device_id: deviceId,
        name: onboardingData.name,
        gender: onboardingData.gender,
        occupation: onboardingData.occupation,
        wake_time: onboardingData.wakeTime,
        important_task_time: onboardingData.importantTaskTime,
        relationship_status: onboardingData.relationshipStatus,
        reminder_style: onboardingData.reminderStyle,
        companion: onboardingData.companion,
        updated_at: new Date().toISOString()
      };
      
      // Save to localStorage immediately
      localStorage.setItem('dawnmind_user', JSON.stringify(onboardingData));

      // Save to Supabase
      const client = getSupabase();
      if (client) {
        console.log("Attempting Supabase upsert...");
        const { error } = await (client as any)
          .from('users')
          .upsert(profileData);
        
        if (error) {
          console.error('Supabase save error:', error);
        } else {
          console.log("Supabase save successful");
        }
      }
      
      setProfile(onboardingData);
      setIntroState('done');
      console.log("Transitioning to dashboard");
    } catch(err) {
      console.error('Submit error:', err);
      // Fallback for UI transition even if everything fails
      setProfile(onboardingData);
      setIntroState('done');
    } finally {
      setIsThinking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-white text-xl font-light tracking-widest"
        >
          DawnMind
        </motion.p>
      </div>
    );
  }

  return (
    <div 
      onClick={handleFirstInteraction}
      className="relative h-screen w-full overflow-hidden bg-black text-white font-sans"
    >
      {/* Background Videos (Preloaded Pool) */}
      <div className="absolute inset-0 z-0">
        {ASSETS.videos.map((src, i) => (
          <video
            key={src}
            ref={videoRefs[i]}
            autoPlay={i === 0}
            muted
            playsInline
            preload="auto"
            loop
            crossOrigin="anonymous"
            onEnded={() => handleVideoEnd(i)}
            onError={(e) => {
              const videoElement = e.currentTarget;
              console.error(`Video ${i} Error:`, {
                code: videoElement.error?.code,
                message: videoElement.error?.message,
                src: videoElement.currentSrc || src
              });
            }}
            onLoadStart={() => console.log(`Video ${i} started loading: ${src}`)}
            onCanPlayThrough={() => console.log(`Video ${i} can play through`)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[800ms] ease-in-out ${
              videoIndex === i ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
          >
            <source src={src} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        ))}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <audio ref={audioPlayer} hidden />

      {/* Intro Overlay */}
      <AnimatePresence>
        {introState !== 'done' && introState !== 'card' && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
          >
            {introState !== 'black' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1.5 }}
                transition={{ duration: 2 }}
                className="absolute w-[300px] h-[300px] rounded-full bg-amber-500/20 blur-[100px]"
              />
            )}
            
            {introState === 'text' && (
              <div className="text-center relative z-10">
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-6xl font-bold tracking-tight mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                >
                  DawnMind
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-white/60 text-xl font-light"
                >
                  Your personal morning companion
                </motion.p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onboarding Card */}
      <AnimatePresence>
        {introState === 'card' && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto no-scrollbar"
          >
            <div className="w-full max-w-[480px] my-auto bg-white/12 backdrop-blur-[20px] border border-white/20 rounded-[24px] p-5 sm:p-8 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 text-center">Customize Your Experience</h2>
              
              <div className="space-y-6">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 block px-1">What's your name?</label>
                  <div className="flex items-center space-x-3 bg-white/10 rounded-2xl p-4 border border-white/5">
                    <input
                      autoFocus
                      type="text"
                      value={onboardingData.name}
                      onChange={(e) => setOnboardingData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Type or speak your name..."
                      className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30"
                    />
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      animate={activeRecordingField === 'name' ? { scale: [1, 1.1, 1], transition: { repeat: Infinity } } : {}}
                      onClick={() => handleOnboardingMic('name')}
                      className={`relative p-2 rounded-xl transition-colors ${activeRecordingField === 'name' ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}
                    >
                      <Mic className="w-5 h-5" />
                      {activeRecordingField === 'name' && (
                        <motion.div
                          initial={{ scale: 1, opacity: 0.5 }}
                          animate={{ scale: 2, opacity: 0 }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="absolute inset-0 rounded-xl bg-red-500"
                        />
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 block px-1">Gender</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Male', 'Female'].map(g => (
                      <button
                        key={g}
                        onClick={() => setOnboardingData(p => ({ ...p, gender: g.toLowerCase() }))}
                        className={`py-3 rounded-2xl transition-all duration-300 border ${
                          onboardingData.gender === g.toLowerCase() 
                            ? 'bg-white text-black border-white' 
                            : 'bg-transparent text-white border-white/20 hover:border-white/40'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Occupation */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 block px-1">Occupation</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Student', 'Job', 'Business'].map(o => (
                      <button
                        key={o}
                        onClick={() => setOnboardingData(p => ({ ...p, occupation: o.toLowerCase() }))}
                        className={`py-3 rounded-xl text-[12px] sm:text-sm transition-all duration-300 border ${
                          onboardingData.occupation === o.toLowerCase() 
                            ? 'bg-white text-black border-white' 
                            : 'bg-transparent text-white border-white/20 hover:border-white/40'
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wake Up Time */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 block px-1">What time do you wake up?</label>
                  <div className="flex items-center space-x-3 bg-white/10 rounded-2xl p-4 border border-white/5">
                    <input
                      type="text"
                      value={onboardingData.wakeTime}
                      onChange={(e) => setOnboardingData(prev => ({ ...prev, wakeTime: e.target.value }))}
                      placeholder="e.g. 7:00 AM"
                      className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30"
                    />
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      animate={activeRecordingField === 'wakeTime' ? { scale: [1, 1.1, 1], transition: { repeat: Infinity } } : {}}
                      onClick={() => handleOnboardingMic('wakeTime')}
                      className={`relative p-2 rounded-xl transition-colors ${activeRecordingField === 'wakeTime' ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}
                    >
                      <Mic className="w-5 h-5" />
                      {activeRecordingField === 'wakeTime' && (
                        <motion.div
                          initial={{ scale: 1, opacity: 0.5 }}
                          animate={{ scale: 2, opacity: 0 }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="absolute inset-0 rounded-xl bg-red-500"
                        />
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Peak Work Time */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 block px-1">When do you do your best work?</label>
                  <div className="flex items-center space-x-3 bg-white/10 rounded-2xl p-4 border border-white/5">
                    <input
                      type="text"
                      value={onboardingData.importantTaskTime}
                      onChange={(e) => setOnboardingData(prev => ({ ...prev, importantTaskTime: e.target.value }))}
                      placeholder="e.g. 10:00 AM"
                      className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30"
                    />
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      animate={activeRecordingField === 'importantTaskTime' ? { scale: [1, 1.1, 1], transition: { repeat: Infinity } } : {}}
                      onClick={() => handleOnboardingMic('importantTaskTime')}
                      className={`relative p-2 rounded-xl transition-colors ${activeRecordingField === 'importantTaskTime' ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}
                    >
                      <Mic className="w-5 h-5" />
                      {activeRecordingField === 'importantTaskTime' && (
                        <motion.div
                          initial={{ scale: 1, opacity: 0.5 }}
                          animate={{ scale: 2, opacity: 0 }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="absolute inset-0 rounded-xl bg-red-500"
                        />
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Relationship Status */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 block px-1">Relationship Status</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['Single', 'In a Relationship'].map(r => (
                      <button
                        key={r}
                        onClick={() => setOnboardingData(p => ({ ...p, relationshipStatus: r.includes('Relation') ? 'relationship' : 'single' }))}
                        className={`py-3 rounded-2xl text-sm transition-all duration-300 border ${
                          (r.includes('Relation') ? onboardingData.relationshipStatus === 'relationship' : onboardingData.relationshipStatus === 'single')
                            ? 'bg-white text-black border-white' 
                            : 'bg-transparent text-white border-white/20 hover:border-white/40'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reminder Style */}
                <div className="space-y-2">
                  <label className="text-sm text-white/70 block px-1">Reminder Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Gentle', 'Strict'].map(s => (
                      <button
                        key={s}
                        onClick={() => setOnboardingData(p => ({ ...p, reminderStyle: s.toLowerCase() }))}
                        className={`py-3 rounded-2xl text-xs sm:text-sm transition-all duration-300 border ${
                          onboardingData.reminderStyle === s.toLowerCase() 
                            ? 'bg-white text-black border-white' 
                            : 'bg-transparent text-white border-white/20 hover:border-white/40'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Companion Selection */}
                <div className="space-y-4 pt-4">
                  <label className="text-sm text-white/70 block px-1 text-center">Your Companion</label>
                  <div className="grid grid-cols-2 gap-6">
                    <div 
                      onClick={() => setOnboardingData(p => ({ ...p, companion: 'mala' }))}
                      className="flex flex-col items-center space-y-2 cursor-pointer group"
                    >
                      <div className={`w-28 h-28 rounded-2xl overflow-hidden border-2 transition-all duration-500 ${onboardingData.companion === 'mala' ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.6)] scale-105' : 'border-white/10 grayscale opacity-40 group-hover:opacity-60 group-hover:grayscale-0'}`}>
                        <img src={ASSETS.mala.idle} className="w-full h-full object-cover" alt="Mala" />
                      </div>
                      <span className={`text-[10px] text-center font-medium ${onboardingData.companion === 'mala' ? 'text-white' : 'text-white/40'}`}>Mala — Caring & Warm</span>
                    </div>
                    <div 
                      onClick={() => setOnboardingData(p => ({ ...p, companion: 'joseph' }))}
                      className="flex flex-col items-center space-y-2 cursor-pointer group"
                    >
                      <div className={`w-28 h-28 rounded-2xl overflow-hidden border-2 transition-all duration-500 ${onboardingData.companion === 'joseph' ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.6)] scale-105' : 'border-white/10 grayscale opacity-40 group-hover:opacity-60 group-hover:grayscale-0'}`}>
                        <img src={ASSETS.joseph.idle} className="w-full h-full object-cover" alt="Joseph" />
                      </div>
                      <span className={`text-[10px] text-center font-medium ${onboardingData.companion === 'joseph' ? 'text-white' : 'text-white/40'}`}>Joseph — Energetic & Bold</span>
                    </div>
                  </div>
                </div>

                {/* Start Button */}
                <button
                  disabled={!onboardingData.name || isThinking}
                  onClick={handleStartMornings}
                  className={`w-full py-4 rounded-2xl font-bold text-lg mt-8 transition-all duration-300 ${
                    onboardingData.name 
                      ? 'bg-gradient-to-r from-white to-white/90 text-black shadow-xl active:scale-95' 
                      : 'bg-white/10 text-white/30 cursor-not-allowed opacity-50'
                  }`}
                >
                  {isThinking ? 'Setting up...' : 'Start my mornings →'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      {introState === 'done' && profile && (
        <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-lg font-medium drop-shadow-lg">Good {getGreeting()}, {profile.name}</p>
            <p className="text-sm opacity-80">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </motion.div>
          <button onClick={() => setIntroState('card')} className="p-2 rounded-full bg-white/10 backdrop-blur-md pointer-events-auto">
            <Settings className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Character */}
      <AnimatePresence mode="wait">
        {introState === 'done' && (
          <motion.div
            key={`${profile?.companion || 'mala'}_${currentPose}`}
            initial={{ opacity: 0, scale: 0.8, y: 150 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              transition: { type: 'spring', damping: 15, stiffness: 60 }
            }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            className="absolute left-[50%] -translate-x-1/2 z-10 pointer-events-none flex justify-center items-end"
            style={{ bottom: '-60px' }}
          >
            <motion.img
              animate={{ 
                y: [0, -10, 0],
                scale: [1, 1.01, 1],
              }}
              transition={{ 
                duration: 4, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
              src={(profile?.companion === 'joseph' ? ASSETS.joseph : ASSETS.mala)[currentPose as keyof typeof ASSETS.mala] || ASSETS.mala.idle}
              alt="Companion"
              className="w-auto object-contain drop-shadow-2xl"
              style={{ height: '95vh', maxWidth: '85vw' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating UI Layer */}
      <div className={`fixed inset-0 z-40 pointer-events-none flex flex-col justify-end items-center pb-[30px] transition-opacity duration-500 ${introState === 'done' ? 'opacity-100' : 'opacity-0'}`}>
        {/* Main Dashboard Todos */}
        {profile && (
          <div className="w-full max-w-md overflow-x-auto mb-8 px-6 flex justify-center space-x-6 no-scrollbar pointer-events-none">
            {todos.map(todo => (
              <motion.div 
                key={todo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex-shrink-0 flex items-center space-x-2 drop-shadow-lg ${todo.completed ? 'opacity-40' : ''}`}
              >
                {todo.completed ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Circle className="w-4 h-4 text-white/60" />}
                <span className={`text-sm font-medium whitespace-nowrap ${todo.completed ? 'line-through' : ''}`}>{todo.text}</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Mic Button Area */}
        <div className="relative flex flex-col items-center pointer-events-auto">
          <motion.button
            whileTap={{ scale: 0.9 }}
            animate={(isRecording) ? {
              scale: [1, 1.1, 1],
              boxShadow: [
                "0 0 20px rgba(239,68,68,0.2)",
                "0 0 40px rgba(239,68,68,0.6)",
                "0 0 20px rgba(239,68,68,0.2)"
              ]
            } : (isSpeaking) ? {
               boxShadow: [
                "0 0 20px rgba(251,191,36,0.3)",
                "0 0 50px rgba(251,191,36,0.5)",
                "0 0 20px rgba(251,191,36,0.3)"
              ]
            } : (!isThinking) ? {
              scale: [1, 1.05, 1],
              boxShadow: [
                "0 0 20px rgba(255,255,255,0.2)",
                "0 0 40px rgba(255,255,255,0.4)",
                "0 0 20px rgba(255,255,255,0.2)"
              ]
            } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            onClick={handleMicClick}
            className={`relative z-10 w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
              isRecording ? 'bg-red-500' : 
              isThinking ? 'bg-white/40' :
              isSpeaking ? 'bg-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.6)]' :
              'bg-white/90 shadow-[0_0_30px_rgba(255,255,255,0.4)]'
            }`}
          >
            {isThinking ? (
              <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <Mic className={`w-10 h-10 ${isRecording || isSpeaking ? 'text-white' : 'text-black'}`} />
            )}
            
            <AnimatePresence>
              {isRecording && (
                <motion.div
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-red-500 border-2 border-red-400"
                />
              )}
            </AnimatePresence>
          </motion.button>
          
          <motion.p 
            key={status}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-sm font-medium tracking-wide uppercase opacity-70"
          >
            {status}
          </motion.p>
        </div>
      </div>

      {/* Mute Toggle */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={(e) => {
          e.stopPropagation();
          setIsMuted(!isMuted);
        }}
        className="fixed bottom-6 left-6 z-50 p-3 rounded-full bg-black/20 backdrop-blur-md border border-white/10 hover:bg-black/40 transition-colors pointer-events-auto"
      >
        {isMuted ? <VolumeX className="w-5 h-5 text-white/60" /> : <Volume2 className="w-5 h-5 text-white/90" />}
      </motion.button>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
