import { cn } from './utils';

interface TagProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'default' | 'mint' | 'blue' | 'yellow' | 'outline';
  className?: string;
}

export function Tag({ children, icon, variant = 'default', className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold tracking-wide',
        {
          'bg-slate-600 text-slate-200': variant === 'default',
          'bg-emerald-500/20 text-emerald-300': variant === 'mint',
          'bg-blue-500/20 text-blue-300': variant === 'blue',
          'bg-amber-500/20 text-amber-300': variant === 'yellow',
          'border border-slate-500 text-slate-200': variant === 'outline',
        },
        className
      )}
    >
      {icon && <span className="[&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>}
      {children}
    </span>
  );
}
