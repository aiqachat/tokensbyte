declare module 'react-quill-new' {
  import { ComponentType } from 'react';
  const ReactQuill: ComponentType<any>;
  export default ReactQuill;
}

declare module 'pinyin-pro' {
  export function pinyin(text: string, options?: any): string[];
}
