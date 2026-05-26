import React, { useCallback, useState } from 'react';
import { UploadCloud, Database } from 'lucide-react';
import { motion } from 'motion/react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelect, isLoading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFileSelect(files[0] as File);
      }
    },
    [onFileSelect]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0] as File);
      }
    },
    [onFileSelect]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full p-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center p-4 bg-blue-50 text-blue-600 rounded-full mb-6 relative">
          <Database size={48} strokeWidth={1.5} />
          {isLoading && (
            <motion.div 
              className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            />
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2">
           DB Decoder 
        </h1>
        <p className="text-slate-500 max-w-md mx-auto">
          Explore and query your pos.db files entirely in your browser. 
          No uploading to servers required.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full max-w-xl transition-all duration-200 relative group cursor-pointer
          border-2 border-dashed rounded-2xl p-12 text-center
          ${isDragging 
            ? 'border-blue-500 bg-blue-50/50' 
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }
          ${isLoading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input 
          type="file" 
          accept=".sqlite,.sqlite3,.db,.db3" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileChange}
        />
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <UploadCloud size={40} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
          <div>
            <p className="text-lg font-medium text-slate-700">
              Drag & drop your database file here
            </p>
            <p className="text-sm mt-1">
              or click to browse from your computer
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Supports .db, .sqlite, .sqlite3 formats
          </p>
        </div>
      </motion.div>
    </div>
  );
}
