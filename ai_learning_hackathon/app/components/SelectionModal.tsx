'use client';

import React from 'react';
import { PenTool, Mic2, BookOpenText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/utils/supabase/client';

interface SelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
}

export default function SelectionModal({ isOpen, onClose, fileName }: SelectionModalProps) {
  const router = useRouter();
  const supabase = createClient();

  if (!isOpen) return null;

  const handleSelection = async (action: () => void, activityType: string) => {
      try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
              await supabase.from('activity_logs').insert({
                  user_id: user.id,
                  activity_type: activityType,
                  file_name: fileName || 'Unknown File'
              });
          }
      } catch (err) {
          console.error("Failed to log activity:", err);
      }
      action();
  };

  const options = [
    {
      title: 'Annotate PDF',
      description: 'Read, highlight, and draw on your document.',
      icon: PenTool,
      color: 'bg-blue-600',
      action: () => router.push('/pdfviewer'), 
      tracking: 'annotation'
    },
    {
      title: 'AI Lecture',
      description: 'Watch an AI-generated video lecture.',
      icon: BookOpenText,
      color: 'bg-indigo-600',
      action: () => router.push('/lecture'), 
      tracking: 'lecture'
    },
    {
      title: 'Podcast',
      description: 'Listen to an audio conversation about the topic.',
      icon: Mic2,
      color: 'bg-rose-600',
      action: () => router.push('/podcast'), 
      tracking: 'podcast'
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-zinc-900 border border-white/10 shadow-2xl"
          >
            <div className="p-8 text-center bg-zinc-900/50">
              <h2 className="text-3xl font-bold text-white mb-2">Choose Your Learning Mode</h2>
              <p className="text-zinc-400">How would you like to engage with <span className="text-white font-medium">"{fileName}"</span>?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 bg-zinc-950/50">
              {options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelection(option.action, option.tracking)}
                  className="group relative flex flex-col items-center p-6 rounded-2xl bg-zinc-900 border border-white/5 hover:border-white/20 transition-all hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className={`mb-6 h-20 w-20 rounded-full ${option.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    <option.icon className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{option.title}</h3>
                  <p className="text-sm text-zinc-400 text-center leading-relaxed">
                    {option.description}
                  </p>
                  
                  <div className="mt-6 px-4 py-2 rounded-full bg-white/5 text-xs font-bold text-white uppercase tracking-wider group-hover:bg-white group-hover:text-black transition-colors">
                    Start
                  </div>
                </button>
              ))}
            </div>

            <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
