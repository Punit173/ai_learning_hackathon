"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, Send, Youtube, ExternalLink,
  Loader2, Mic, MicOff, Radio, Volume2
} from "lucide-react";
import { getVideoRecommendations } from "@/services/yt_distribute_api";
import { Doubt_clear } from "@/services/lecture_doubt_api"; // ← real API

// ─── SpeechRecognition types (no extra packages needed) ───────────────────────
declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}
interface ISpeechRecognitionEvent {
  results: { length: number; [i: number]: { isFinal: boolean; [i: number]: { transcript: string } } };
}
interface ISpeechRecognitionErrorEvent { error: string; }
interface ISpeechRecognition {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void; abort(): void;
  onstart:  (() => void) | null;
  onend:    (() => void) | null;
  onerror:  ((e: ISpeechRecognitionErrorEvent) => void) | null;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface VideoResult {
  topic: string; title: string; url: string; channel: string; thumbnail: string;
}
interface TextMessage   { kind: "text";        role: "ai" | "user"; text: string; }
interface VideoMessage  { kind: "videos";       role: "ai"; videos: VideoResult[]; topics: string[]; }
interface VoiceMessage  { kind: "voice_heard";  role: "user"; text: string; }
interface ButtonMessage { kind: "video_button"; role: "ai"; }
interface LoadingMessage{ kind: "loading";      role: "ai"; }

type Message = TextMessage | VideoMessage | VoiceMessage | ButtonMessage | LoadingMessage;

interface ChatPanelProps {
  pageLabel: string;
  currentPageText: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TRIGGER_KEYWORDS = ["uncle x", "hey X", "question", "explain"];

// ─── TTS ─────────────────────────────────────────────────────────────────────
function speak(text: string, onEnd?: () => void) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05; u.pitch = 0.95;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

// ─── Component ────────────────────────────────────────────────────────────────
const ChatPanel: React.FC<ChatPanelProps> = ({ pageLabel, currentPageText }) => {
  const [messages,      setMessages]      = useState<Message[]>([
    { kind: "text", role: "ai", text: "SYSTEM READY. AWAITING QUERY." },
    { kind: "video_button", role: "ai" },
  ]);
  const [question,       setQuestion]      = useState("");
  const [loadingVideos,  setLoadingVideos] = useState(false);
  const [voiceEnabled,   setVoiceEnabled]  = useState(false);
  const [listening,      setListening]     = useState(false);
  const [waveActive,     setWaveActive]    = useState(false);
  const [voiceStatus,    setVoiceStatus]   = useState("");
  const [awaitingAnswer, setAwaitingAnswer]= useState(false);

  // Stable refs for use inside recognition callbacks
  const voiceEnabledRef    = useRef(false);
  const awaitingAnswerRef  = useRef(false);
  const pageLabelRef       = useRef(pageLabel);
  const currentPageRef     = useRef(currentPageText);
  const recognitionRef     = useRef<ISpeechRecognition | null>(null);
  const restartTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef         = useRef<HTMLDivElement>(null);

  useEffect(() => { voiceEnabledRef.current   = voiceEnabled;    }, [voiceEnabled]);
  useEffect(() => { awaitingAnswerRef.current  = awaitingAnswer; }, [awaitingAnswer]);
  useEffect(() => { pageLabelRef.current       = pageLabel;      }, [pageLabel]);
  useEffect(() => { currentPageRef.current     = currentPageText;}, [currentPageText]);

  // ── Reset on page change ──────────────────────────────────────────────────
// Load from localStorage on page change, or reset to default
  useEffect(() => {
    const saved = localStorage.getItem(`chat_${pageLabel}`);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        setMessages([
          { kind: "text", role: "ai", text: `LOADED: ${pageLabel}. AWAITING QUERY.` },
          { kind: "video_button", role: "ai" },
        ]);
      }
    } else {
      setMessages([
        { kind: "text", role: "ai", text: `LOADED: ${pageLabel}. AWAITING QUERY.` },
        { kind: "video_button", role: "ai" },
      ]);
    }
    setAwaitingAnswer(false);
    awaitingAnswerRef.current = false;
  }, [pageLabel]);
  

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try { recognitionRef.current?.abort(); } catch {}
    };
  }, []);


// Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length <= 2) return; // don't save the default init state
    localStorage.setItem(`chat_${pageLabel}`, JSON.stringify(messages));
  }, [messages, pageLabel]);

  // ── Call real Doubt_clear API ─────────────────────────────────────────────
  const askDoubt = useCallback(async (query: string, context: string): Promise<string> => {
    try {
      const res = await Doubt_clear(query, context);
      return res.resp;
    } catch (err) {
      return "ERROR: Could not reach the server. Please try again.";
    }
  }, []);

  // ── Push AI bubble ────────────────────────────────────────────────────────
  const pushAI = useCallback((text: string, doSpeak = true, onEnd?: () => void) => {
    setMessages(prev => [...prev, { kind: "text", role: "ai", text }]);
    if (doSpeak) speak(text, onEnd);
  }, []);

  // Remove the loading bubble and push real reply
  const resolveLoading = useCallback((text: string, doSpeak = true, onEnd?: () => void) => {
    setMessages(prev => {
      const without = [...prev].reverse();
      const idx = without.findIndex(m => m.kind === "loading");
      if (idx !== -1) without.splice(idx, 1);
      return [
        ...without.reverse(),
        { kind: "text", role: "ai", text }
      ];
    });
    if (doSpeak) speak(text, onEnd);
  }, []);

  // ── Handle voice transcript ───────────────────────────────────────────────
  const handleTranscript = useCallback(async (transcript: string) => {
    const lower = transcript.toLowerCase().trim();
    console.log("[Voice] heard:", lower);

    if (awaitingAnswerRef.current) {
      // User answered the AI question — send to real API
      setMessages(prev => [...prev,
        { kind: "voice_heard", role: "user", text: transcript },
        { kind: "loading",     role: "ai" }
      ]);
      setAwaitingAnswer(false);
      awaitingAnswerRef.current = false;
      setVoiceStatus("Processing...");

      const reply = await askDoubt(transcript, currentPageRef.current);
      resolveLoading(reply, true, () => setVoiceStatus("Listening for keyword..."));
      setVoiceStatus("Speaking...");
      return;
    }

    const triggered = TRIGGER_KEYWORDS.some(kw => lower.includes(kw));
    if (!triggered) return;

    setMessages(prev => [...prev, { kind: "voice_heard", role: "user", text: transcript }]);
    setAwaitingAnswer(true);
    awaitingAnswerRef.current = true;
    setVoiceStatus("Listening for your answer...");

    setTimeout(() => pushAI("Go ahead — what's your question about this section?", true), 300);
  }, [askDoubt, pushAI, resolveLoading]);

  // ── Build recognition instance ────────────────────────────────────────────
  const startRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || !voiceEnabledRef.current) return;
    try { rec.start(); } catch {}
  }, []);

  const buildRecognition = useCallback((): ISpeechRecognition | null => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous     = false;
    r.interimResults = false;
    r.lang           = "en-US";
    r.onstart  = () => { setListening(true);  setWaveActive(true);  };
    r.onresult = (e: ISpeechRecognitionEvent) => {
      const result = e.results[e.results.length - 1];
      if (result.isFinal) handleTranscript(result[0].transcript);
    };
    r.onerror = (e: ISpeechRecognitionErrorEvent) => {
      if (["no-speech","aborted","network"].includes(e.error)) return;
      setVoiceStatus(`Mic error: ${e.error}`);
    };
    r.onend = () => {
      setListening(false); setWaveActive(false);
      if (voiceEnabledRef.current) {
        restartTimerRef.current = setTimeout(startRecognition, 300);
      }
    };
    return r;
  }, [handleTranscript, startRecognition]);

  // ── Toggle voice ──────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    if (!voiceEnabled) {
      const r = buildRecognition();
      if (!r) { setVoiceStatus("Browser doesn't support voice recognition."); return; }
      recognitionRef.current  = r;
      voiceEnabledRef.current = true;
      setVoiceEnabled(true);
      setVoiceStatus("Initializing...");
      speak(
        `Voice commands active. Say ${TRIGGER_KEYWORDS[0]} to ask a question.`,
        () => { setVoiceStatus("Listening for keyword..."); startRecognition(); }
      );
      setMessages(prev => [...prev, {
        kind: "text", role: "ai",
        text: `VOICE MODULE ONLINE. Trigger: "${TRIGGER_KEYWORDS.join(" / ")}"`
      }]);
    } else {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      voiceEnabledRef.current  = false;
      awaitingAnswerRef.current = false;
      setVoiceEnabled(false); setListening(false); setWaveActive(false);
      setAwaitingAnswer(false); setVoiceStatus("");
      window.speechSynthesis.cancel();
      try { recognitionRef.current?.abort(); } catch {}
      recognitionRef.current = null;
      setMessages(prev => [...prev, { kind: "text", role: "ai", text: "VOICE COMMAND MODULE OFFLINE." }]);
    }
  }, [voiceEnabled, buildRecognition, startRecognition]);

  // ── Send typed message → real API ─────────────────────────────────────────
  const handleSend = async () => {
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion("");
    setMessages(prev => [...prev,
      { kind: "text",    role: "user", text: q },
      { kind: "loading", role: "ai" }
    ]);
    const reply = await askDoubt(q, currentPageText);
    resolveLoading(reply, false); // don't auto-speak typed replies
  };

  // ── Video recommendations ─────────────────────────────────────────────────
  const handleVideoRecs = async () => {
    if (loadingVideos) return;
    setLoadingVideos(true);
    // Replace button with scanning text
    setMessages(prev =>
      prev.map(m =>
        m.kind === "video_button"
          ? { kind: "text", role: "ai", text: `SCANNING ${pageLabel} FOR VISUAL RESOURCES...` } as TextMessage
          : m
      )
    );
    try {
      const result = await getVideoRecommendations(currentPageText);
      console.log("[Videos] API response:", result); // debug
      if (!result.videos || result.videos.length === 0) {
        setMessages(prev => [...prev, { kind: "text", role: "ai", text: "No videos found for this section." }]);
        return;
      }
      setMessages(prev => [...prev, {
        kind: "videos",
        role: "ai",
        videos: result.videos,
        topics: result.topics ?? [],
      }]);
    } catch (e) {
      console.error("[Videos] fetch error:", e);
      setMessages(prev => [...prev, { kind: "text", role: "ai", text: "ERROR: Could not fetch video data." }]);
    } finally {
      setLoadingVideos(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-[700px] flex flex-col bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">

      {/* Header */}
      <div className="bg-pink-500 border-b-4 border-black p-3 flex items-center justify-between">
        <span className="font-black uppercase text-white">Direct Line</span>
        <MessageSquare className="text-white" size={20} />
      </div>

      {/* Voice bar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b-4 border-black transition-colors duration-300 ${voiceEnabled ? "bg-green-400" : "bg-gray-100"}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleVoice}
            className={`flex items-center gap-1.5 px-3 py-1.5 border-2 border-black text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all ${
              voiceEnabled ? "bg-black text-green-400" : "bg-white text-black"
            }`}
          >
            {voiceEnabled ? <Mic size={11} /> : <MicOff size={11} />}
            {voiceEnabled ? "Voice On" : "Voice Off"}
          </button>

          {voiceEnabled && (
            <div className="flex items-end gap-[2px] h-5">
              {[3,6,9,5,8,4,7,3,6,9].map((h, i) => (
                <div key={i} className="w-[2px] bg-black rounded-full"
                  style={{ height: waveActive ? `${h}px` : "3px", transition: `height ${0.1 + i * 0.02}s ease` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className={`flex items-center gap-1 px-2 py-0.5 border border-black text-[9px] font-black uppercase ${
          listening ? "bg-green-300" : voiceEnabled ? "bg-yellow-300" : "bg-gray-200"
        }`}>
          <Radio size={8} className={listening ? "animate-pulse" : ""} />
          {listening ? "Live" : voiceEnabled ? "Standby" : "Offline"}
        </div>
      </div>

      {/* Keyword hint */}
      {voiceEnabled && (
        <div className="px-3 py-1.5 bg-yellow-50 border-b-2 border-black flex items-center gap-2">
          <Volume2 size={9} className="text-gray-500 flex-shrink-0" />
          <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">
            Say: &ldquo;{TRIGGER_KEYWORDS.slice(0,3).join(" / ")}&rdquo;
          </span>
          {awaitingAnswer
            ? <span className="ml-auto text-[8px] font-black uppercase text-red-500 animate-pulse">● Awaiting answer</span>
            : <span className="ml-auto text-[8px] font-black uppercase text-gray-400">{voiceStatus}</span>
          }
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 custom-scrollbar">
        {messages.map((msg, i) => {

          // Loading spinner bubble
          if (msg.kind === "loading") {
            return (
              <div key={i} className="flex justify-start">
                <div className="p-3 border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  <span className="text-[10px] font-black uppercase text-gray-500">Processing...</span>
                </div>
              </div>
            );
          }

          // Video button bubble
          if (msg.kind === "video_button") {
            return (
              <div key={i} className="flex justify-start">
                <button
                  onClick={handleVideoRecs}
                  disabled={loadingVideos || !currentPageText}
                  className="flex items-center gap-2 px-3 py-2 border-2 border-black bg-red-500 text-white text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {loadingVideos ? <Loader2 size={11} className="animate-spin" /> : <Youtube size={11} />}
                  {loadingVideos ? "Scanning..." : "Show Relevant Videos"}
                </button>
              </div>
            );
          }

          // Voice heard bubble
          if (msg.kind === "voice_heard") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[90%] flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 text-[8px] font-black uppercase text-gray-400">
                    <Mic size={8} /> Voice
                  </div>
                  <div className="p-3 border-2 border-black text-xs font-bold bg-green-200 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          }

          // Video results
          if (msg.kind === "videos") {
            return (
              <div key={i} className="flex justify-start w-full">
                <div className="w-full space-y-2">
                  {msg.topics.length > 0 && (
                    <div className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                      Topics: {msg.topics.join(" · ")}
                    </div>
                  )}
                  {msg.videos.map((v, vi) => (
                    <a key={vi} href={v.url} target="_blank" rel="noopener noreferrer"
                      className="flex gap-2 bg-white border-2 border-black p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all group"
                    >
                      {/* Thumbnail */}
                      <div className="relative flex-shrink-0 w-20 h-14 bg-black overflow-hidden border border-black">
                        <img
                          src={v.thumbnail}
                          alt={v.title}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                          onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/default/hqdefault.jpg`; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                          <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                            <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[7px] border-transparent border-l-white ml-[1px]" />
                          </div>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <p className="text-[9px] font-black uppercase leading-tight line-clamp-2 text-black">{v.title}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Youtube size={9} className="text-red-600 flex-shrink-0" />
                          <span className="text-[8px] font-bold text-gray-500 truncate">{v.channel}</span>
                          <ExternalLink size={8} className="text-gray-300 ml-auto flex-shrink-0" />
                        </div>
                        <span className="text-[7px] font-black uppercase bg-yellow-300 border border-black px-1 self-start mt-1">{v.topic}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            );
          }

          // Plain text
          return (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] p-3 border-2 border-black text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                msg.role === "user" ? "bg-blue-300 text-black" : "bg-white text-black"
              }`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Text input */}
      <div className="p-3 border-t-4 border-black bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            className="w-full bg-white border-2 border-black p-2 text-xs font-bold placeholder-gray-400 focus:outline-none focus:bg-yellow-50"
            placeholder="INPUT QUERY..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
          />
          <button onClick={handleSend} className="bg-black text-white p-2 border-2 border-black hover:bg-gray-800">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;