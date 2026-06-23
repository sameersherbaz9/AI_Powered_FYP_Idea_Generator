import React, { useState, useRef, useEffect } from 'react';

const Autocomplete = ({ value, onChange, options, placeholder, className }) => {
  const [showOptions, setShowOptions] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(
    option => option.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowOptions(true);
        }}
        onFocus={() => setShowOptions(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {showOptions && filteredOptions.length > 0 && (
        <ul className="absolute z-50 w-full mt-2 bg-[#1A1A2E] border border-gray-700/50 rounded-xl shadow-2xl max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent py-1">
          {filteredOptions.map((option, index) => (
            <li
              key={index}
              className="px-4 py-3 text-gray-300 hover:bg-[#242444] hover:text-white cursor-pointer transition-colors text-sm"
              onMouseDown={() => {
                onChange(option);
                setShowOptions(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Autocomplete;
