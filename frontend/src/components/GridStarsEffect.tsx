import React, { useState, useEffect, useRef } from 'react';

interface TwinkleCell {
  index: number;
  type: 'indigo' | 'sky' | 'purple';
  expiresAt: number;
}

interface TrailItem {
  index: number;
  expiresAt: number;
}

export const GridStarsEffect: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ cols: 0, rows: 0 });
  const [twinkleCells, setTwinkleCells] = useState<TwinkleCell[]>([]);
  const [hoverTrail, setHoverTrail] = useState<TrailItem[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const lastCellRef = useRef<{ col: number; row: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const cols = Math.ceil(w / 32) + 2; // Add safety columns to prevent gaps
      const rows = Math.ceil(h / 32) + 2;
      setDimensions({ cols, rows });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Update twinkling cells and trail queue incrementally
  useEffect(() => {
    const totalCells = dimensions.cols * dimensions.rows;
    if (totalCells === 0) return;

    const targetCount = Math.min(Math.floor(totalCells * 0.04), 40); // ~4% of cells twinkle, max 40
    const types: ('indigo' | 'sky' | 'purple')[] = ['indigo', 'sky', 'purple'];

    const interval = setInterval(() => {
      const now = Date.now();

      // 1. Clean up and generate new twinkling cells
      setTwinkleCells((prev) => {
        const active = prev.filter((c) => c.expiresAt > now && c.index < totalCells);
        const newCells = [...active];
        if (active.length < targetCount) {
          const toAdd = Math.min(targetCount - active.length, Math.floor(Math.random() * 2) + 1);
          for (let i = 0; i < toAdd; i++) {
            const randIndex = Math.floor(Math.random() * totalCells);
            if (!newCells.some((c) => c.index === randIndex)) {
              newCells.push({
                index: randIndex,
                type: types[randIndex % types.length],
                expiresAt: now + (Math.random() * 4000 + 3000),
              });
            }
          }
        }
        return newCells;
      });

      // 2. Clean up hover trail items
      setHoverTrail((prev) => prev.filter((item) => item.expiresAt > now));

    }, 300);

    return () => clearInterval(interval);
  }, [dimensions]);

  const { cols, rows } = dimensions;
  const totalCells = cols * rows;

  const getCellIndex = (x: number, y: number) => {
    const container = containerRef.current;
    if (!container || cols === 0 || rows === 0) return null;

    const w = container.clientWidth;
    const h = container.clientHeight;
    
    // Centering offsets matching grid margins
    const offsetX = (cols * 32 - w) / 2;
    const offsetY = (rows * 32 - h) / 2;

    const gridX = x + offsetX;
    const gridY = y + offsetY;

    const col = Math.floor(gridX / 32);
    const row = Math.floor(gridY / 32);

    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      return { index: row * cols + col, col, row };
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || cols === 0 || rows === 0) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cell = getCellIndex(x, y);
    if (!cell) {
      setHoveredIndex(null);
      lastCellRef.current = null;
      return;
    }

    setHoveredIndex(cell.index);

    const now = Date.now();
    const newTrailItems: TrailItem[] = [];

    // Path interpolation to keep mouse trails gap-free during rapid movement
    if (lastCellRef.current) {
      const last = lastCellRef.current;
      const dCol = cell.col - last.col;
      const dRow = cell.row - last.row;
      const steps = Math.max(Math.abs(dCol), Math.abs(dRow));

      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const c = Math.round(last.col + dCol * t);
        const r = Math.round(last.row + dRow * t);
        
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          newTrailItems.push({
            index: r * cols + c,
            expiresAt: now + 500, // Keep fully bright for 500ms
          });
        }
      }
    } else {
      newTrailItems.push({
        index: cell.index,
        expiresAt: now + 500,
      });
    }

    lastCellRef.current = { col: cell.col, row: cell.row };

    // Merge new trail cells into state queue
    setHoverTrail((prev) => {
      const active = prev.filter((item) => item.expiresAt > now);
      const combined = [...active];
      newTrailItems.forEach((newItem) => {
        const existing = combined.find((item) => item.index === newItem.index);
        if (existing) {
          existing.expiresAt = newItem.expiresAt; // refresh lifetime
        } else {
          combined.push(newItem);
        }
      });
      return combined;
    });
  };

  const handleMouseLeaveGrid = () => {
    setHoveredIndex(null);
    lastCellRef.current = null;
  };

  // Pre-calculate hovered cell row/column
  const hoverCol = hoveredIndex !== null ? hoveredIndex % cols : -1;
  const hoverRow = hoveredIndex !== null ? Math.floor(hoveredIndex / cols) : -1;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden z-0"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeaveGrid}
    >
      {cols > 0 && rows > 0 && (
        <div
          className="grid-container"
          style={{
            gridTemplateColumns: `repeat(${cols}, 32px)`,
            gridTemplateRows: `repeat(${rows}, 32px)`,
          }}
        >
          {Array.from({ length: totalCells }).map((_, idx) => {
            const twinkle = twinkleCells.find(t => t.index === idx);
            const c = idx % cols;
            const r = Math.floor(idx / cols);

            // Calculate distance parameters for circular spotlight
            let inlineStyle: React.CSSProperties = {};
            let isHoverActive = false;
            
            if (hoveredIndex !== null) {
              const dx = c - hoverCol;
              const dy = r - hoverRow;
              const dist = Math.sqrt(dx * dx + dy * dy);

              // Focused small spotlight: within 1.2 cell radius (only immediate containing cell + edge neighbors)
              if (dist <= 1.2) {
                isHoverActive = true;
                const factor = 1 - dist / 1.5; // 1.0 down to ~0.2
                inlineStyle = {
                  backgroundColor: `rgba(99, 102, 241, ${(factor * factor * 0.32).toFixed(3)})`, // Brighter fill
                  boxShadow: `inset 0 0 16px rgba(56, 189, 248, ${(factor * 0.58).toFixed(3)}), inset 0 0 8px rgba(99, 102, 241, ${(factor * 0.58).toFixed(3)})`, // Dual-tone glow
                };
              }
            }

            // Check if cell is part of the interpolated hover trail
            const trailItem = hoverTrail.find((item) => item.index === idx);
            if (trailItem && !isHoverActive) {
              isHoverActive = true;
              inlineStyle = {
                backgroundColor: 'rgba(99, 102, 241, 0.25)', // Bright trail fill
                boxShadow: 'inset 0 0 12px rgba(56, 189, 248, 0.45), inset 0 0 6px rgba(99, 102, 241, 0.45)', // Bright trail inner glow
              };
            }

            // Assign unique colors to twinkling cells when not hovered
            if (twinkle && !isHoverActive) {
              if (twinkle.type === 'indigo') {
                inlineStyle = {
                  backgroundColor: 'rgba(99, 102, 241, 0.07)',
                  boxShadow: 'inset 0 0 6px rgba(99, 102, 241, 0.12)',
                };
              } else if (twinkle.type === 'sky') {
                inlineStyle = {
                  backgroundColor: 'rgba(56, 189, 248, 0.08)',
                  boxShadow: 'inset 0 0 6px rgba(56, 189, 248, 0.15)',
                };
              } else {
                inlineStyle = {
                  backgroundColor: 'rgba(168, 85, 247, 0.06)',
                  boxShadow: 'inset 0 0 6px rgba(168, 85, 247, 0.10)',
                };
              }
            }

            const twinkleClass = twinkle ? 'is-twinkling' : '';
            const spotlightClass = isHoverActive ? 'is-spotlight' : '';

            return (
              <div
                key={idx}
                className={`grid-cell ${twinkleClass} ${spotlightClass}`}
                style={inlineStyle}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
