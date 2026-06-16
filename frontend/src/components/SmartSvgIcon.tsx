import React, { useState, useEffect } from 'react';
import { useThemeStore } from '../store/theme';

// Cache for SVG analysis results: key is SVG URL, value is boolean (true if dark monochrome)
const darkSvgCache: Record<string, boolean> = {};

interface SmartSvgIconProps {
  src: string;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

const SmartSvgIcon: React.FC<SmartSvgIconProps> = ({ src, alt = "", style = {}, className, onError }) => {
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';
  const [isInvertNeeded, setIsInvertNeeded] = useState<boolean>(() => {
    return darkSvgCache[src] || false;
  });

  useEffect(() => {
    if (!src) return;

    if (darkSvgCache[src] !== undefined) {
      setIsInvertNeeded(darkSvgCache[src]);
      return;
    }

    const img = new Image();
    img.src = src;
    
    // Attempt canvas color analysis
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        
        let total = 0;
        let darkGrayscale = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          if (a > 30) { // Only analyze visible pixels
            total++;
            // Grayscale check (low saturation)
            const isGrayscale = Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && Math.abs(r - b) < 25;
            // Dark color check
            const isDarkColor = r < 110 && g < 110 && b < 110;
            if (isGrayscale && isDarkColor) {
              darkGrayscale++;
            }
          }
        }
        
        // If more than 75% of visible pixels are dark grayscale, it's a dark monochrome icon!
        const needed = total > 0 && (darkGrayscale / total) > 0.75;
        darkSvgCache[src] = needed;
        setIsInvertNeeded(needed);
      } catch (e) {
        // Fallback heuristics: name-based checking if canvas fails (e.g. CORS or security block)
        const lowerSrc = src.toLowerCase();
        const knownDark = lowerSrc.includes('baichuan') || 
                          lowerSrc.includes('minimax') || 
                          lowerSrc.includes('spark') || 
                          lowerSrc.includes('sensetime') || 
                          lowerSrc.includes('tencent') || 
                          lowerSrc.includes('custom/');
        darkSvgCache[src] = knownDark;
        setIsInvertNeeded(knownDark);
      }
    };
    img.onerror = () => {
      setIsInvertNeeded(false);
    };
  }, [src]);

  const finalStyle: React.CSSProperties = {
    ...style,
    filter: (isDark && isInvertNeeded) ? 'brightness(0) invert(1)' : style.filter,
    transition: 'filter 0.3s ease',
  };

  return (
    <img
      src={src}
      alt={alt}
      style={finalStyle}
      className={className}
      onError={onError}
    />
  );
};

export default SmartSvgIcon;
