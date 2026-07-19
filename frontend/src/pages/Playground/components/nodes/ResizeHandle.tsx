import React from 'react';

/** 缩放手柄方向 */
export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** 手柄光标映射 */
const RESIZE_CURSORS: Record<ResizeDirection, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
};

/** 单个缩放手柄 */
export const ResizeHandle: React.FC<{
  direction: ResizeDirection;
  onMouseDown: (e: React.MouseEvent, dir: ResizeDirection) => void;
}> = ({ direction, onMouseDown }) => {
  const isCorner = ['nw', 'ne', 'se', 'sw'].includes(direction);
  const size = isCorner ? 10 : 8;

  const posStyle: React.CSSProperties = {};
  if (direction.includes('n')) { posStyle.top = -size / 2; }
  if (direction.includes('s')) { posStyle.bottom = -size / 2; }
  if (direction.includes('w')) { posStyle.left = -size / 2; }
  if (direction.includes('e')) { posStyle.right = -size / 2; }
  if (direction === 'n' || direction === 's') { posStyle.left = '50%'; posStyle.marginLeft = -size / 2; }
  if (direction === 'w' || direction === 'e') { posStyle.top = '50%'; posStyle.marginTop = -size / 2; }

  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, direction); }}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid #fff',
        cursor: RESIZE_CURSORS[direction],
        zIndex: 10,
        boxShadow: '0 0 4px rgba(0,0,0,0.3)',
        ...posStyle,
      }}
    />
  );
};
