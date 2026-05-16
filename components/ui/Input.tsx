import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-[10px] font-semibold text-[#6E6E73] mb-1">{label}</label>}
      <input
        className={`w-full bg-white border ${error ? 'border-[#FF3B30] text-[#FF3B30]' : 'border-[#D2D2D7] focus:border-[#007AFF] text-[#1D1D1F]'} rounded-lg px-3 py-1.5 text-xs font-mono placeholder-[#A1A1A6] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/10 transition-colors duration-200 ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-[10px] text-[#FF3B30]">{error}</p>}
    </div>
  );
};
