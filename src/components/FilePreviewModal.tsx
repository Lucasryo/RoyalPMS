import React from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
}

export default function FilePreviewModal({ isOpen, onClose, fileUrl, fileName }: FilePreviewModalProps) {
  if (!isOpen) return null;

  const isPdf = fileName.toLowerCase().endsWith('.pdf');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 bg-neutral-100 rounded-lg shrink-0">
                <FileText className="w-5 h-5 text-neutral-600" />
              </div>
              <h3 className="font-semibold text-neutral-900 truncate">{fileName}</h3>
            </div>
            
            <div className="flex items-center gap-2">
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-all"
                title="Abrir em nova aba"
              >
                <ExternalLink className="w-5 h-5" />
              </a>
              <button
                onClick={onClose}
                className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 bg-neutral-100 relative overflow-hidden">
            {isPdf ? (
              <iframe
                src={`${fileUrl}#toolbar=0`}
                className="w-full h-full border-none"
                title={fileName}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 bg-neutral-200 rounded-3xl flex items-center justify-center mb-6">
                  <FileText className="w-10 h-10 text-neutral-400" />
                </div>
                <h4 className="text-xl font-semibold text-neutral-900 mb-2">Pré-visualização não disponível</h4>
                <p className="text-neutral-500 mb-8 max-w-md">
                  Este tipo de arquivo não pode ser visualizado diretamente no navegador. Por favor, faça o download para visualizar.
                </p>
                <a
                  href={fileUrl}
                  download={fileName}
                  className="flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-xl font-semibold hover:opacity-90 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Baixar Arquivo
                </a>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
