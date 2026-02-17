"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PenTool, Eraser, ZoomIn, ZoomOut, Save } from 'lucide-react';
import { clsx } from 'clsx';
// We need to import types but use dynamic import for logic to avoid SSR issues
import type { PDFDocumentProxy } from 'pdfjs-dist';

export default function PDFViewerPage() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationLayerRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{x: number, y: number}[]>([]);
  const [annotations, setAnnotations] = useState<Record<number, {x: number, y: number}[][]>>({}); // Map page -> list of paths

  // Load PDF from localStorage
  useEffect(() => {
    const loadPdf = async () => {
      try {
        const storedPdf = localStorage.getItem('uploadedFileBase64');
        if (!storedPdf) {
          setError("No PDF file found in storage. Please upload one first.");
          setLoading(false);
          return;
        }

        // Check if it's a PDF data URL
        if (!storedPdf.startsWith('data:application/pdf')) {
             // It might be a PPTX or other file which we can't render with PDF.js easily here
             // But for this task user specifically asked for PDF viewing.
             if (storedPdf.startsWith('data:application/vnd')) {
                 setError("The uploaded file is a PPTX/Document. This viewer only supports PDF files.");
             } else {
                 setError("Invalid file format.");
             }
             setLoading(false);
             return;
        }

        const pdfjsLib = await import('pdfjs-dist');
        // Set worker
        if (typeof window !== 'undefined' && 'Worker' in window) {
             pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        const pdfData = storedPdf.split(',')[1]; // Remove data:application/pdf;base64,...
        const binaryString = window.atob(pdfData);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err: any) {
        console.error("Error loading PDF:", err);
        setError("Failed to load PDF. " + err.message);
        setLoading(false);
      }
    };

    loadPdf();
  }, []);

  // Render Page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };
        await page.render(renderContext as any).promise;

        // Resize annotation layer to match
        if (annotationLayerRef.current) {
            annotationLayerRef.current.height = viewport.height;
            annotationLayerRef.current.width = viewport.width;
            redrawAnnotations();
        }
      } catch (err) {
        console.error("Render error:", err);
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, scale, annotations]);

  // Redraw annotations when page/scale changes
  const redrawAnnotations = () => {
      const canvas = annotationLayerRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      const pageAnnotations = annotations[currentPage] || [];
      pageAnnotations.forEach(path => {
          if (path.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) {
              ctx.lineTo(path[i].x, path[i].y);
          }
          ctx.stroke();
      });
  };

  // Drawing Handlers
  const startDrawing = (e: React.MouseEvent) => {
      if (!isDrawingMode) return;
      const canvas = annotationLayerRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setIsDrawing(true);
      setCurrentPath([{x, y}]);

      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
      }
  };

  const draw = (e: React.MouseEvent) => {
      if (!isDrawing || !isDrawingMode) return;
      const canvas = annotationLayerRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setCurrentPath(prev => [...prev, {x, y}]);

      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.lineTo(x, y);
          ctx.stroke();
      }
  };

  const stopDrawing = () => {
      if (!isDrawing) return;
      setIsDrawing(false);
      
      setAnnotations(prev => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), currentPath]
      }));
  };

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'model', content: string}[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load API Key from local storage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("gemini_api_key");
    if (storedKey) setApiKey(storedKey);
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem("gemini_api_key", key);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isChatOpen) scrollToBottom();
  }, [messages, isChatOpen]);

  const captureScreen = () => {
    if (!canvasRef.current || !annotationLayerRef.current) return null;
    
    const pdfCanvas = canvasRef.current;
    const annotationCanvas = annotationLayerRef.current;
    const width = pdfCanvas.width;
    const height = pdfCanvas.height;

    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = width;
    combinedCanvas.height = height;
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) return null;

    // Draw PDF
    ctx.drawImage(pdfCanvas, 0, 0);
    // Draw Annotations
    ctx.drawImage(annotationCanvas, 0, 0);

    return combinedCanvas.toDataURL('image/png').split(',')[1]; // Return base64 data only
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending) return;
    
    if (!apiKey) {
        setMessages(prev => [...prev, { role: 'model', content: "Please enter your Gemini API Key below to start chatting." }]);
        return;
    }

    const currentImage = captureScreen();
    if (!currentImage) {
        setError("Failed to capture screen context.");
        return;
    }

    const userMsg = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInputMessage("");
    setIsSending(true);

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: userMsg,
                image: currentImage,
                history: messages.slice(-10), // Send last 10 messages for context (optional, API route handles it)
                apiKey: apiKey
            })
        });

        const data = await response.json();

        if (response.ok) {
            setMessages(prev => [...prev, { role: 'model', content: data.text }]);
        } else {
            console.error("Chat Error:", data.error);
            setMessages(prev => [...prev, { role: 'model', content: `Error: ${data.error}` }]);
        }

    } catch (err: any) {
        console.error("Network Error:", err);
        setMessages(prev => [...prev, { role: 'model', content: "Failed to send message. Please check your connection." }]);
    } finally {
        setIsSending(false);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center">Loading PDF...</div>;
  if (error) return <div className="flex h-screen items-center justify-center text-red-500">{error}</div>;

  return (
    <div className="flex bg-gray-100 overflow-hidden h-screen">
      <div className="flex flex-col flex-1 h-full relative">
      {/* Toolbar */}
      <div className="bg-white shadow-md p-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
            <button onClick={() => window.history.back()} className="text-gray-600 hover:text-black font-medium">
                &larr; Back
            </button>
            <span className="font-bold text-lg hidden sm:block">PDF Viewer</span>
        </div>

        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
           <button 
             onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
             className="p-2 hover:bg-white rounded-md transition-colors"
           >
             <ZoomOut className="w-5 h-5" />
           </button>
           <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
           <button 
             onClick={() => setScale(s => Math.min(3, s + 0.1))}
             className="p-2 hover:bg-white rounded-md transition-colors"
           >
             <ZoomIn className="w-5 h-5" />
           </button>
        </div>

        <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors font-medium border text-sm sm:text-base",
                  isDrawingMode 
                    ? "bg-blue-100 text-blue-700 border-blue-200" 
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              )}
            >
                <PenTool className="w-4 h-4" />
                <span className="hidden sm:inline">{isDrawingMode ? 'Drawing' : 'Annotate'}</span>
            </button>
            <button 
                onClick={() => setAnnotations({})} 
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Clear All Annotations"
            >
                <Eraser className="w-5 h-5" />
            </button>
            <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={clsx(
                    "ml-2 flex items-center gap-2 px-3 py-2 rounded-lg transition-colors font-medium border text-sm sm:text-base",
                    isChatOpen
                        ? "bg-purple-100 text-purple-700 border-purple-200"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                )}
            >
                ✨ AI Chat
            </button>
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 overflow-auto bg-gray-200 p-4 sm:p-8 flex justify-center relative select-none">
         <div className="relative shadow-2xl" ref={containerRef}>
             <canvas 
               ref={canvasRef} 
               className="bg-white block"
             />
             <canvas 
               ref={annotationLayerRef}
               className={clsx("absolute top-0 left-0 cursor-crosshair", !isDrawingMode && "pointer-events-none")}
               onMouseDown={startDrawing}
               onMouseMove={draw}
               onMouseUp={stopDrawing}
               onMouseLeave={stopDrawing}
             />
         </div>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t p-4 flex justify-center items-center gap-8 shrink-0">
          <button 
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="p-2 disabled:opacity-30 hover:bg-gray-100 rounded-full"
          >
              <ChevronLeft className="w-6 h-6" />
          </button>
          
          <span className="font-medium text-gray-700">
              Page {currentPage} of {numPages}
          </span>

          <button 
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="p-2 disabled:opacity-30 hover:bg-gray-100 rounded-full"
          >
              <ChevronRight className="w-6 h-6" />
          </button>
      </div>
      </div>

      {/* Chat Sidebar */}
      {isChatOpen && (
          <div className="w-80 md:w-96 bg-white shadow-xl border-l border-gray-200 flex flex-col transition-all duration-300 ease-in-out h-full shrink-0">
            <div className="p-4 border-b bg-purple-50 flex items-center justify-between">
                <div>
                   <h3 className="font-bold text-gray-900">AI Tutor</h3>
                   <p className="text-xs text-gray-500">Ask about the annotated content</p>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center text-gray-400 text-sm mt-8">
                        <p>Draw a circle around any text or image and ask me a question!</p>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={idx} className={clsx("flex flex-col max-w-[90%]", msg.role === 'user' ? "self-end items-end" : "self-start items-start")}>
                        <div className={clsx(
                            "rounded-2xl px-4 py-2 text-sm shadow-sm",
                            msg.role === 'user' 
                                ? "bg-blue-600 text-white rounded-br-none" 
                                : "bg-gray-100 text-gray-800 rounded-bl-none"
                        )}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                
                {isSending && (
                     <div className="self-start items-start flex flex-col max-w-[90%]">
                        <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-none px-4 py-2 text-sm shadow-sm flex items-center gap-2">
                             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                             <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                     </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t bg-gray-50">
                {!apiKey && (
                    <div className="mb-3">
                         <input 
                            type="password" 
                            placeholder="Enter Gemini API Key" 
                            className="w-full text-xs p-2 rounded border border-gray-300 mb-1"
                            onChange={(e) => saveApiKey(e.target.value)}
                            value={apiKey}
                         />
                         <p className="text-[10px] text-gray-500">Key is stored locally in your browser.</p>
                    </div>
                )}
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask about the selection..."
                        className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        disabled={isSending}
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={isSending || !inputMessage.trim()}
                        className="bg-purple-600 text-white p-2 rounded-xl disabled:opacity-50 hover:bg-purple-700 transition w-10 h-10 flex items-center justify-center"
                    >
                        {isSending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}