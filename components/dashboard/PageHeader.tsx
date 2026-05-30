import React from 'react';

interface PageHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  actions,
  className = '',
  icon: Icon,
  meta,
  subtitle,
  title,
}) => (
  <header className={`soft-glass flex min-w-0 flex-col gap-3 rounded-lg px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between ${className}`}>
    <div className="flex min-w-0 items-start gap-3 text-left">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#52c7da]/22 bg-white/58 text-[#166B78] shadow-sm">
        <Icon size={19} strokeWidth={2.1} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="text-[15px] font-semibold uppercase leading-5 tracking-wide text-[#1D1D1F] sm:text-base">
            {title}
          </h1>
          {meta && (
            <div className="flex min-w-0 items-center">
              {meta}
            </div>
          )}
        </div>
        {subtitle && (
          <p className="mt-0.5 max-w-2xl text-[11px] font-medium leading-4 text-[#6E6E73] sm:text-xs">
            {subtitle}
          </p>
        )}
      </div>
    </div>

    {actions && (
      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
        {actions}
      </div>
    )}
  </header>
);
