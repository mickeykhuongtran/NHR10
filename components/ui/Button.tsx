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
  const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 disabled:opacity-45 disabled:cursor-not-allowed border';
  
  const variants = {
    primary: 'bg-[#007AFF] text-white border-[#007AFF] hover:bg-[#006CE0] shadow-sm shadow-blue-500/10',
    secondary: 'bg-white text-[#1D1D1F] border-[#D2D2D7] hover:bg-[#F5F5F7]',
    danger: 'bg-[#FF3B30] text-white border-[#FF3B30] hover:bg-[#E5342A] shadow-sm shadow-red-500/10',
    success: 'bg-[#34C759] text-white border-[#34C759] hover:bg-[#2FB350] shadow-sm shadow-green-500/10',
    outline: 'border-[#D2D2D7] text-[#424245] hover:border-[#007AFF]/40 hover:text-[#007AFF] bg-white/70 hover:bg-white',
    ghost: 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] border-transparent'
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
