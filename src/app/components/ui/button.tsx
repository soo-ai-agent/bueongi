import { type ReactNode, forwardRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-2xl font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
          {
            'bg-blue-500 text-white hover:bg-blue-400 shadow-sm': variant === 'primary',
            'bg-slate-600 text-slate-100 hover:bg-slate-500': variant === 'secondary',
            'bg-red-500/90 text-white hover:bg-red-500 shadow-sm': variant === 'danger',
            'hover:bg-slate-600 text-slate-200 hover:text-white': variant === 'ghost',
            'border border-slate-500 bg-transparent text-slate-200 hover:bg-slate-600': variant === 'outline',
            'h-9 px-4 text-sm': size === 'sm',
            'h-12 px-6 text-base': size === 'md',
            'h-14 px-8 text-lg font-semibold rounded-2xl': size === 'lg',
            'h-12 w-12 rounded-2xl': size === 'icon',
            'w-full': fullWidth,
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
