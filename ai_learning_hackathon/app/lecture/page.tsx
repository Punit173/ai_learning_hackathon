"use client";

import React, { useState, useEffect, useRef } from "react";
import { Volume2, MicOff, Loader2, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { summarizeText } from "@/services/lecture_api";
import Link from "next/link";
import ChatPanel from "@/components/Chatpanel"; // ← Split file

// ─── Types ────────────────────────────────────────────────────────────────────
interface Page {
  page: number;
  text: string;
}

interface CachedChunk { 
  resp: string;
  images: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGES_PER_CHUNK = 3;
const STORAGE_KEY = "uploadedContent";
const CACHE_KEY = "lecture_cache";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getPagesFromStorage(): Page[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.pages) ? parsed.pages : [];
  } catch {
    return [];
  }
}

function getCacheFromStorage(): Record<number, CachedChunk> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCacheToStorage(cache: Record<number, CachedChunk>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// ─── ImageCarousel ────────────────────────────────────────────────────────────
const ImageCarousel: React.FC<{ images: string[] }> = ({ images }) => {
  const [idx, setIdx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");

  // Auto-advance every 4 s
  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => slide("right"), 4000);
    return () => clearInterval(t);
  }, [images.length, idx]);

  const slide = (dir: "left" | "right") => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setIdx((prev) =>
        dir === "right"
          ? (prev + 1) % images.length
          : (prev - 1 + images.length) % images.length
      );
      setAnimating(false);
    }, 280);
  };

  return (
    <div className="bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b-4 border-black pb-2 mb-4">
        <h3 className="font-black uppercase">Visual Data</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase text-gray-400">
            {idx + 1} / {images.length}
          </span>
          <div className="bg-black text-white text-xs px-2 font-bold">{images.length}</div>
        </div>
      </div>

      {/* Carousel stage */}
      <div className="relative overflow-hidden">
        {/* Pin decoration */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
          <div className="w-4 h-4 bg-red-600 rounded-full border-2 border-black shadow-sm"></div>
          <div className="w-0.5 h-3 bg-black"></div>
        </div>

        {/* Image */}
        <div
          className="relative group mt-4"
          style={{
            opacity: animating ? 0 : 1,
            transform: animating
              ? `translateX(${direction === "right" ? "-12px" : "12px"})`
              : "translateX(0)",
            transition: "opacity 0.28s ease, transform 0.28s ease",
          }}
        >
          <div className="bg-white p-2 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transform rotate-1 group-hover:rotate-0 transition-transform">
            <img
              src={images[idx]}
              alt={`Fig ${idx + 1}`}
              className="w-full h-auto grayscale group-hover:grayscale-0 transition-all"
            />
          </div>
          <div className="absolute bottom-[-10px] right-[-5px] bg-yellow-400 border-2 border-black px-2 text-[10px] font-bold uppercase transform -rotate-3 z-10">
            Fig. 0{idx + 1}
          </div>
        </div>

        {/* Prev / Next arrows */}
        {images.length > 1 && (
          <div className="flex justify-between mt-6 gap-2">
            <button
              onClick={() => slide("left")}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 border-2 border-black bg-white text-black text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <button
              onClick={() => slide("right")}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 border-2 border-black bg-white text-black text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => { setDirection(i > idx ? "right" : "left"); setIdx(i); }}
                className={`w-2 h-2 rounded-full border-2 border-black transition-all ${
                  i === idx ? "bg-black scale-125" : "bg-gray-300"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────
const Lecture: React.FC = () => {
  const [allPages, setAllPages] = useState<Page[]>([]);

  useEffect(() => {
    setAllPages(getPagesFromStorage());
    setCache(getCacheFromStorage());
  }, []);

  const totalChunks = Math.max(1, Math.ceil(allPages.length / PAGES_PER_CHUNK));

  const [chunkIndex, setChunkIndex] = useState(0);
  const [cache, setCache] = useState<Record<number, CachedChunk>>({});
  const [content, setContent] = useState<CachedChunk>({ resp: "", images: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [wordIndex, setWordIndex] = useState<number>(-1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Current page metadata ─────────────────────────────────────────────────
  const currentPages = allPages.slice(
    chunkIndex * PAGES_PER_CHUNK,
    chunkIndex * PAGES_PER_CHUNK + PAGES_PER_CHUNK
  );
  const pageLabel = currentPages.length
    ? `Pages ${currentPages[0].page}–${currentPages[currentPages.length - 1].page}`
    : `Chunk ${chunkIndex + 1}`;
  const currentPageText = currentPages.map((p) => p.text).join("\n\n");

  // ── Reset speech on chunk change ─────────────────────────────────────────
  useEffect(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setWordIndex(-1);
    videoRef.current?.pause();
  }, [chunkIndex]);

  // ── Load chunk (cached or fresh) ─────────────────────────────────────────
  useEffect(() => {
    const loadChunk = async () => {
      if (cache[chunkIndex]) {
        setContent(cache[chunkIndex]);
        return;
      }

      if (allPages.length === 0) {
        setContent({
          resp: "NO DATA FOUND.\n\nUPLOAD PDF TO INITIALIZE LECTURE PROTOCOL.",
          images: [],
        });
        return;
      }

      const slice = allPages.slice(
        chunkIndex * PAGES_PER_CHUNK,
        chunkIndex * PAGES_PER_CHUNK + PAGES_PER_CHUNK
      );
      const combinedText = slice
        .map((p) => `[Page ${p.page}]\n${p.text}`)
        .join("\n\n---\n\n");

      setLoading(true);
      setError(null);

      try {
        const result = await summarizeText(combinedText);
        const newCache = { ...cache, [chunkIndex]: result };
        setCache(newCache);
        saveCacheToStorage(newCache);
        setContent(result);
      } catch (err: any) {
        setError(err.message ?? "Unknown error");
        setContent({ resp: "", images: [] });
      } finally {
        setLoading(false);
      }
    };

    loadChunk();
  }, [chunkIndex, allPages, cache]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goNext = () => setChunkIndex((i) => Math.min(i + 1, totalChunks - 1));
  const goPrev = () => setChunkIndex((i) => Math.max(i - 1, 0));

  // ── TTS ───────────────────────────────────────────────────────────────────
  const handleSpeak = () => {
    if (!content.resp) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content.resp);
    utteranceRef.current = utterance;

    utterance.onboundary = (e) => {
      const spoken = content.resp.slice(0, e.charIndex + e.charLength);
      const wordCount = spoken.trim().split(/\s+/).length - 1;
      setWordIndex(wordCount);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setWordIndex(-1);
      videoRef.current?.pause();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setWordIndex(-1);
      videoRef.current?.pause();
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
    videoRef.current?.play();
  };

  const handleStopSpeak = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setWordIndex(-1);
    videoRef.current?.pause();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#fffdf5] text-black font-mono p-4 sm:p-8 flex flex-col items-center overflow-x-hidden">
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Gochi+Hand&display=swap");
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>

      {/* ── Header ── */}
      <div className="w-full max-w-[1600px] mb-8 flex justify-between items-center bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <Link
          href="/home"
          className="flex items-center gap-2 font-bold hover:underline decoration-2"
        >
          <ArrowLeft className="w-5 h-5" />
          RETURN
        </Link>
        <div className="text-center">
          <h1 className="text-3xl font-black uppercase tracking-tighter">
            Neural Classroom
          </h1>
          <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase mt-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            System Online
          </div>
        </div>
        <div className="w-24"></div>
      </div>

      <div className="w-full max-w-[1800px] grid grid-cols-12 gap-8 items-start">

        {/* ── Left Column: Video Tutor + Images ── */}
        <div className="col-span-3 flex flex-col gap-6">
          {/* Instructor Card */}
          <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center relative">
            <div className="w-full aspect-video border-4 border-black mb-4 bg-black overflow-hidden relative shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <video
                ref={videoRef}
                src="/assets/teacher_video.mp4"
                loop
                muted
                playsInline
                className="w-96 h-full mt-2 opacity-80"
              />
              <div className="absolute inset-0 bg-green-500/10 pointer-events-none"></div>
              <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 animate-pulse">
                LIVE
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black uppercase text-xl">UNIT-734</h3>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-black rounded-full"></div>
                <div className="w-2 h-2 bg-black rounded-full"></div>
                <div className="w-2 h-2 bg-black rounded-full"></div>
              </div>
            </div>
            <p className="text-xs font-bold uppercase text-gray-500 border-t-2 border-black pt-2 text-left">
              Active Instructor
            </p>

            <button
              onClick={isSpeaking ? handleStopSpeak : handleSpeak}
              disabled={loading || !content.resp}
              className={`w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 border-4 border-black font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all ${
                isSpeaking ? "bg-red-500 text-white" : "bg-green-400 text-black"
              }`}
            >
              {isSpeaking ? <MicOff size={20} /> : <Volume2 size={20} />}
              {isSpeaking ? "Term. Audio" : "Init. Audio"}
            </button>
          </div>

          {/* Visual Data — Carousel */}
          {content.images && content.images.length > 0 && (
            <ImageCarousel images={content.images} />
          )}
        </div>

        {/* ── Center: Greenboard ── */}
        <div className="col-span-6 flex flex-col gap-6">
          <div className="relative min-h-[750px] w-full bg-[#1e3932] rounded-[2rem] border-[12px] border-[#3e2723] shadow-[12px_12px_0px_0px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
            {/* Chalkboard Texture */}
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')] pointer-events-none"></div>

            {/* Board Header */}
            <div className="relative z-10 flex justify-between items-center px-8 py-6">
              <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                <span className="text-white/80 font-mono text-xs font-bold uppercase tracking-widest">
                  {pageLabel}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
              </div>
            </div>

            <div className="relative flex-1 p-8 sm:px-12 flex flex-col font-mono z-10">
              {/* Loading */}
              {loading && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <Loader2 size={40} className="text-white animate-spin" />
                  <p className="text-white font-bold uppercase tracking-widest animate-pulse">
                    Decorrelating Data...
                  </p>
                </div>
              )}

              {/* Error */}
              {!loading && error && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="bg-red-500 text-white p-4 border-4 border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <p className="font-bold uppercase">System Error: {error}</p>
                  </div>
                  <button
                    onClick={() => {
                      const tmp = chunkIndex;
                      setChunkIndex(-1);
                      setTimeout(() => setChunkIndex(tmp), 50);
                    }}
                    className="mt-2 px-4 py-2 bg-white text-black font-bold uppercase hover:bg-gray-200"
                  >
                    Retry Protocol
                  </button>
                </div>
              )}

              {/* Content */}
              {!loading && !error && (
                <div
                  key={chunkIndex}
                  className="text-xl md:text-2xl leading-relaxed whitespace-pre-wrap overflow-y-auto pr-4 custom-scrollbar text-white/90"
                  style={{
                    fontFamily: '"Gochi Hand", cursive',
                    maxHeight: "550px",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
                  }}
                >
                  {content.resp ? (
                    content.resp.split(/(\s+)/).map((token, i) => {
                      const isWord = token.trim().length > 0;
                      const wordPos = content.resp
                        .split(/(\s+)/)
                        .slice(0, i)
                        .filter((t) => t.trim()).length;
                      return (
                        <span
                          key={i}
                          style={
                            isWord && wordPos === wordIndex
                              ? {
                                  backgroundColor: "rgba(255,221,0,0.4)",
                                  borderRadius: "4px",
                                  padding: "0 2px",
                                  boxShadow: "0 0 10px rgba(255,221,0,0.2)",
                                }
                              : {}
                          }
                        >
                          {token}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-white/40 italic">
                      ... NO DATA STREAM ...
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Chalk Tray / Nav */}
            <div className="mt-auto bg-[#2d1b18] p-4 flex justify-between items-center relative shadow-inner border-t-[8px] border-[#3e2723]">
              <div className="absolute -top-3 left-12 flex gap-2">
                <div className="w-12 h-2 bg-white rounded-sm shadow-sm transform -rotate-2"></div>
                <div className="w-8 h-2 bg-blue-200 rounded-sm shadow-sm transform rotate-6"></div>
              </div>

              <div className="w-full flex justify-between items-center z-10 px-4">
                <button
                  onClick={goPrev}
                  disabled={chunkIndex === 0 || loading}
                  className="bg-[#1e3932] text-white border-2 border-[#5d4037] px-6 py-2 rounded-lg font-black uppercase text-sm hover:bg-[#2e5248] disabled:opacity-30 disabled:cursor-not-allowed shadow-md transition-all active:translate-y-1"
                >
                  Prev Slide
                </button>
                <span className="text-[#8d6e63] text-xs font-bold uppercase tracking-widest inset-x-0 mx-auto absolute text-center pointer-events-none">
                  Interactive Board v2.0
                </span>
                <button
                  onClick={goNext}
                  disabled={chunkIndex === totalChunks - 1 || loading}
                  className="bg-[#1e3932] text-white border-2 border-[#5d4037] px-6 py-2 rounded-lg font-black uppercase text-sm hover:bg-[#2e5248] disabled:opacity-30 disabled:cursor-not-allowed shadow-md transition-all active:translate-y-1"
                >
                  Next Slide
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Chat Panel (split component) ── */}
        <div className="col-span-3 flex flex-col gap-6">
          <ChatPanel pageLabel={pageLabel} currentPageText={currentPageText} />
        </div>
      </div>
    </div>
  );
};

export default Lecture;