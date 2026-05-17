import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#52c7da]/30 disabled:opacity-45 disabled:cursor-not-allowed border backdrop-blur-md';
  
  const variants = {
    primary: 'bg-[#52c7da]/95 text-white border-[#52c7da]/90 hover:bg-[#42b9cc] shadow-[0_10px_28px_rgba(82,199,218,0.22)]',
    secondary: 'bg-white/58 text-[#1D1D1F] border-[#52c7da]/20 hover:bg-white/78 shadow-sm shadow-[#124E5A]/5',
    danger: 'bg-[#FF3B30]/95 text-white border-[#FF3B30]/90 hover:bg-[#E5342A] shadow-[0_10px_28px_rgba(255,59,48,0.16)]',
    success: 'bg-[#34C759]/95 text-white border-[#34C759]/90 hover:bg-[#2FB350] shadow-[0_10px_28px_rgba(52,199,89,0.16)]',
    outline: 'border-[#52c7da]/24 text-[#424245] hover:border-[#52c7da]/45 hover:text-[#166B78] bg-white/48 hover:bg-white/74 shadow-sm shadow-[#124E5A]/5',
    ghost: 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-white/48 border-transparent'
  };

  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-4 py-1.5 text-xs',
    lg: 'px-6 py-2 text-sm font-semibold'
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
