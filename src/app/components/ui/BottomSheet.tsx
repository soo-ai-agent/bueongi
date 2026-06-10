import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from './utils';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  hideClose?: boolean;
}

export function BottomSheet({ isOpen, onClose, children, title, hideClose }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[32px] bg-slate-700 border-t border-slate-600 p-6 pb-8 max-h-[90vh] overflow-y-auto shadow-[0_-8px_30px_rgba(0,0,0,0.3)]"
          >
            <div className="flex w-full justify-center mb-6">
              <div className="h-1.5 w-12 rounded-full bg-slate-500" />
            </div>
            {(title || !hideClose) && (
              <div className={cn("flex items-center mb-6", title ? "justify-between" : "justify-end")}>
                {title && <h2 className="text-xl font-bold text-slate-100">{title}</h2>}
                {!hideClose && (
                  <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-600 text-slate-300 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
