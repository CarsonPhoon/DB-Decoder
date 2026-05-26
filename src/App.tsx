import React, { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { DBReader } from './components/DBReader';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleClose = () => {
    setSelectedFile(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans relative">
      {!selectedFile ? (
        <FileUpload onFileSelect={handleFileSelect} isLoading={false} />
      ) : (
        <DBReader file={selectedFile} onClose={handleClose} />
      )}
      
      {/* Interactive Expandable Attribution Footer Badge (Only on first page) */}
      {!selectedFile && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            className="bg-white/90 hover:bg-white backdrop-blur-md border border-slate-200/80 hover:border-slate-300 shadow-sm rounded-full px-4 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors select-none cursor-pointer flex items-center justify-center overflow-hidden min-h-[32px]"
            layout
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {!isExpanded ? (
                <motion.span
                  key="abbrev"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="font-mono tracking-widest text-[11px] italic text-[#787f9d] font-bold px-1.5 py-0.5 rounded-md"
                >
                  T&C
                </motion.span>
              ) : (
                <motion.span
                  key="full"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="whitespace-nowrap inline-block text-slate-600 font-medium px-1"
                >
                  Developed by Thomas & Carson
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      )}
    </div>
  );
}
