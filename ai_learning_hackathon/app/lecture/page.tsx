"use client"

import React, { useState, useEffect } from 'react';
import { Mic, Send, MessageSquare } from 'lucide-react';

const Lecture = ({ backendData }) => {
  // backendData should match your Python dict: { resp: "...", images: [...] }
  const [question, setQuestion] = useState("");
  const [content, setContent] = useState({ resp: "", images: [] });

  useEffect(() => {
    if (backendData) {
      setContent(backendData);
    }
  }, [backendData]);

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-4 font-sans text-slate-800 flex flex-col items-center overflow-hidden">
      
      {/* Subtle Header */}
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-black text-slate-700 tracking-tight">
          AI Academy <span className="text-emerald-600">Interactive Terminal</span>
        </h1>
      </div>

      <div className="w-full max-w-[1800px] grid grid-cols-12 gap-4 items-end">
        
        {/* 1. TEACHER SECTION (Left) */}
        <div className="col-span-2 flex flex-col items-center justify-end pb-8">
          <div className="relative group">
            <img 
              src="/assets/teacher.png" 
              alt="Instructor" 
              className="w-full h-auto max-h-[400px] object-contain drop-shadow-2xl"
            />
            <div className="mt-2 bg-white/90 backdrop-blur-sm shadow-sm border border-slate-200 px-3 py-1 rounded-full text-center">
              <span className="text-xs font-bold text-slate-500 uppercase">Live Instructor</span>
            </div>
          </div>
        </div>

        {/* 2. ENHANCED BLACKBOARD (Center - Extra Wide) */}
        <div className="col-span-8">
          <div className="relative h-[700px] w-full bg-[#1e3932] rounded-[2.5rem] border-[14px] border-[#3e2723] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.4)] overflow-hidden ring-4 ring-black/10">
            
            {/* Texture Overlays */}
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')] pointer-events-none"></div>
            
            <div className="relative h-full p-12 flex flex-col">
              {/* Chalk Text from Backend */}
              <div 
                className="text-white/90 text-3xl leading-relaxed max-w-[70%] whitespace-pre-wrap"
                style={{ fontFamily: '"Gochi Hand", cursive', filter: 'drop-shadow(2px 2px 2px rgba(0,0,0,0.3))' }}
              >
                {content.resp || "Waiting for lesson data..."}
              </div>

              {/* Dynamic Images (Pinned to board) */}
              <div className="absolute top-10 right-10 flex flex-col gap-6">
                {content.images?.map((imgUrl, index) => (
                  <div 
                    key={index}
                    className="group relative bg-white p-2 shadow-xl transform transition-transform hover:scale-110"
                    style={{ 
                        rotate: index % 2 === 0 ? '2deg' : '-3deg',
                        maxWidth: '220px' 
                    }}
                  >
                    <img 
                      src={imgUrl} 
                      alt={`Reference ${index}`} 
                      className="w-full h-auto border border-slate-100"
                    />
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-red-500/80 rounded-full blur-[2px] border-2 border-white/20 shadow-inner"></div>
                  </div>
                ))}
              </div>

              {/* Decorative Chalk Pieces */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 opacity-70">
                <div className="w-10 h-3 bg-white rounded-sm rotate-12"></div>
                <div className="w-8 h-3 bg-blue-200 rounded-sm -rotate-6"></div>
              </div>
            </div>
          </div>
          
          {/* Base Floor Detail */}
          <div className="h-4 w-[104%] -ml-[2%] bg-[#2d1b18] rounded-full mt-1 blur-[1px]"></div>
        </div>

        {/* 3. MINIMAL DOUBT WINDOW (Right - Slim) */}
        <div className="col-span-2 h-[700px] mb-4 flex flex-col">
          <div className="flex-1 bg-white/80 backdrop-blur-md rounded-[2rem] shadow-xl border border-white p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-slate-800 rounded-lg text-white">
                <MessageSquare size={16} />
              </div>
              <h3 className="font-bold text-sm text-slate-700 uppercase tracking-tight">Doubt Box</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 custom-scrollbar">
              <p className="text-[11px] text-slate-400 italic text-center px-2">
                Ask a question about the current topic...
              </p>
              {/* Messages would map here */}
            </div>

            <div className="space-y-2">
              <textarea 
                rows="3"
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none shadow-inner"
                placeholder="Type doubt..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              
              <div className="flex gap-2">
                <button className="flex-1 py-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center shadow-md">
                  <Send size={14} />
                </button>
                <button className="flex-1 py-3 bg-slate-900 text-white rounded-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center shadow-md">
                  <Mic size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default Lecture;