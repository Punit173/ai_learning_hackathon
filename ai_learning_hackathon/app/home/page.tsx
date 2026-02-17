"use client";

import React, { useState } from 'react';
import { Upload, FileText, BookOpen, CheckCircle, Loader2, File as FileIcon } from 'lucide-react';
import { parsePDF, parsePPTX } from '@/lib/parsers';

export default function HomePage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'standard'>('upload');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusMessage("Processing file...");

    try {
      let content = [];
      if (file.type === "application/pdf") {
        content = await parsePDF(file);
      } else if (
        file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || 
        file.name.endsWith(".pptx")
      ) {
        content = await parsePPTX(file);
      } else {
        throw new Error("Unsupported file type. Please upload PDF or PPTX.");
      }

      // Read file as Base64 for viewing
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        try {
            localStorage.setItem('uploadedFileBase64', base64);
        } catch (e) {
            console.error("File too large for localStorage", e);
            setStatusMessage("Warning: File too large to save for viewing, but content extracted.");
        }
      };
      reader.readAsDataURL(file);

      // Store in localStorage
      localStorage.setItem('uploadedContent', JSON.stringify({
        fileName: file.name,
        extractedAt: new Date().toISOString(),
        pages: content
      }));

      setStatusMessage("Content extracted");
    } catch (error: any) {
      console.error("Extraction failed:", error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePredefinedCardClick = (title: string, mockContent: any) => {
    localStorage.setItem('uploadedContent', JSON.stringify({
      fileName: title,
      extractedAt: new Date().toISOString(),
      pages: mockContent
    }));
    setStatusMessage(`Loaded "${title}" content`);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">
          AI Learning Hub
        </h1>
        <p className="text-gray-500">Manage your learning materials efficiently</p>
      </header>

      {/* Netflix-style Tab Bar */}
      <div className="flex justify-center mb-12">
        <div className="bg-gray-200 p-1 rounded-full inline-flex relative">
            {/* Animated Background Pill */}
             <div 
                className={`absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out`}
                style={{
                    left: activeTab === 'upload' ? '4px' : '50%',
                    width: 'calc(50% - 4px)',
                    transform: activeTab === 'standard' ? 'translateX(0)' : 'translateX(0)' 
                }}
             />
             
            <button 
                onClick={() => setActiveTab('upload')}
                className={`relative z-10 px-8 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${activeTab === 'upload' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Upload
            </button>
            <button 
                onClick={() => setActiveTab('standard')}
                className={`relative z-10 px-8 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${activeTab === 'standard' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Standard Material
            </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        
        {/* Section 1: Upload Area */}
        {activeTab === 'upload' && (
        <section className="bg-white rounded-3xl shadow-xl p-12 border border-gray-100 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-blue-50 p-6 rounded-full mb-6">
            <Upload className="w-12 h-12 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Upload Material</h2>
          <p className="text-gray-500 mb-8 max-w-sm">
            Upload your PDF or PPTX files. We'll extract the content page-wise and store it locally for quick access.
          </p>
          
          <label className="relative cursor-pointer group mb-4">
            <div className="bg-gray-900 text-white px-8 py-3 rounded-xl font-medium shadow-lg group-hover:bg-gray-800 transition-all flex items-center gap-3">
              {isProcessing ? <Loader2 className="animate-spin w-5 h-5" /> : <FileText className="w-5 h-5" />}
              <span>{isProcessing ? 'Processing...' : 'Choose File'}</span>
            </div>
            <input 
              type="file" 
              accept=".pdf,.pptx" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isProcessing} 
            />
          </label>
          <a href="/pdfviewer" className="text-blue-600 hover:underline font-medium">
            View Uploaded PDF with Annotations &rarr;
          </a>
        </section>
        )}

        {/* Section 2: Predefined Cards */}
        {activeTab === 'standard' && (
        <section className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-purple-50 p-3 rounded-2xl">
              <BookOpen className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Standard Material</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card 
              title="Class 11th Physics" 
              description="Kinematics & Laws of Motion"
              onClick={() => handlePredefinedCardClick("Class 11th Physics", [
                { page: 1, text: "Chapter 1: Physical World" },
                { page: 2, text: "Chapter 2: Units and Measurements" }
              ])}
            />
            <Card 
              title="Class 12th Chemistry" 
              description="Solutions & Electrochemistry"
              onClick={() => handlePredefinedCardClick("Class 12th Chemistry", [
                { page: 1, text: "Chapter 1: Solutions" },
                { page: 2, text: "Chapter 2: Electrochemistry" }
              ])}
            />
            <Card 
              title="JEE Advanced" 
              description="Previous Year Questions"
              onClick={() => handlePredefinedCardClick("JEE Advanced Mock", [
                { page: 1, text: "Question 1: ..." },
                { page: 2, text: "Question 2: ..." }
              ])}
            />
             <Card 
              title="Biology NEET" 
              description="Human Physiology"
              onClick={() => handlePredefinedCardClick("Biology NEET", [
                { page: 1, text: "Digestion and Absorption" },
                { page: 2, text: "Breathing and Exchange of Gases" }
              ])}
            />
          </div>
        </section>
        )}

      </div>

      {statusMessage && (
        <div className="fixed bottom-8 right-8 bg-gray-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <CheckCircle className="text-green-400 w-6 h-6" />
          <p className="font-medium">{statusMessage}</p>
          <button onClick={() => setStatusMessage(null)} className="ml-4 text-gray-400 hover:text-white">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

function Card({ title, description, onClick }: { title: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="text-left w-full p-5 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-purple-200 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <FileIcon className="w-8 h-8 text-gray-400 group-hover:text-purple-500 transition-colors" />
      </div>
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-xs text-gray-500">{description}</p>
    </button>
  );
}
