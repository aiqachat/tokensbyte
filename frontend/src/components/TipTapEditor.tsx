import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import TiptapImage from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { Tooltip, message, Popover } from 'antd';
import request from '../utils/request';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  Link as LinkIcon,
  Unlink,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Eraser,
  Code2,
  Image as ImageIcon,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Maximize2,
  Minimize2,
  ChevronDown,
  CornerDownLeft,
  ExternalLink,
  Trash2
} from 'lucide-react';

// Custom React component for the image node view (enables drag-to-resize and alignment alignment)
const ImageNodeView: React.FC<any> = ({ node, updateAttributes, selected }) => {
  const [resizing, setResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    startX.current = e.clientX;
    if (containerRef.current) {
      const img = containerRef.current.querySelector('img');
      if (img) {
        startWidth.current = img.clientWidth;
      }
    }
    setResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing) return;
      const deltaX = e.clientX - startX.current;
      const newWidth = Math.max(30, startWidth.current + deltaX);
      updateAttributes({ width: `${newWidth}px` });
    };

    const handleMouseUp = () => {
      if (resizing) {
        setResizing(false);
      }
    };

    if (resizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const width = node.attrs.width || '100%';
  const textAlign = node.attrs.textAlign || 'left';

  // Align margins for block-level wrapping element
  let wrapperMargin = '1rem auto 1rem 0'; // default left
  if (textAlign === 'center') {
    wrapperMargin = '1rem auto';
  } else if (textAlign === 'right') {
    wrapperMargin = '1rem 0 1rem auto';
  } else if (textAlign === 'justify') {
    wrapperMargin = '1rem 0';
  }

  return (
    <NodeViewWrapper 
      className="tiptap-image-wrapper" 
      style={{ 
        display: 'block', 
        position: 'relative', 
        maxWidth: '100%', 
        margin: wrapperMargin,
        textAlign: textAlign
      }}
    >
      <div 
        ref={containerRef}
        style={{ 
          position: 'relative', 
          display: 'inline-block', 
          outline: selected ? '2px solid var(--accent)' : 'none',
          outlineOffset: '2px',
          borderRadius: '6px',
          transition: 'outline-color 0.2s',
          maxWidth: '100%'
        }}
      >
        <img 
          src={node.attrs.src} 
          alt={node.attrs.alt} 
          title={node.attrs.title}
          style={{ 
            display: 'block', 
            maxWidth: '100%', 
            width: width, 
            height: 'auto',
            pointerEvents: 'none',
            userSelect: 'none'
          }} 
        />
        
        {/* Resize Handle - visible when selected or resizing */}
        {(selected || resizing) && (
          <div
            onMouseDown={handleMouseDown}
            style={{
              position: 'absolute',
              bottom: '-4px',
              right: '-4px',
              width: '12px',
              height: '12px',
              backgroundColor: 'var(--accent)',
              border: '2px solid #fff',
              borderRadius: '50%',
              cursor: 'nwse-resize',
              zIndex: 100,
              boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
              transform: 'scale(1)',
              transition: 'transform 0.1s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; }}
            onMouseLeave={(e) => { if (!resizing) e.currentTarget.style.transform = 'scale(1)'; }}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
};

// Extend Default Image extension to support custom width attributes and React Node View
const CustomImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('width') || element.style.width || '100%',
        renderHTML: attributes => {
          return {
            width: attributes.width,
            style: `max-width: 100%; width: ${attributes.width}; height: auto; border-radius: 6px;`,
          };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

const textColors = [
  { label: 'Default', value: '#fafafa' },
  { label: 'Gray', value: '#a1a1aa' },
  { label: 'Brown', value: '#b45309' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green', value: '#10b981' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Red', value: '#ef4444' }
];

const highlightColors = [
  { label: 'White', value: '#ffffff' },
  { label: 'Gray', value: '#f4f4f5' },
  { label: 'Beige', value: '#fafaf9' },
  { label: 'Cream', value: '#fff7ed' },
  { label: 'Yellow', value: '#fef9c3' },
  { label: 'Green', value: '#dcfce7' },
  { label: 'Blue', value: '#e0f2fe' },
  { label: 'Purple', value: '#f3e8ff' },
  { label: 'Pink', value: '#fce7f3' },
  { label: 'Red', value: '#fee2e2' }
];

const ColorPickerPopover: React.FC<{
  editor: any;
  isSourceMode: boolean;
}> = ({ editor, isSourceMode }) => {
  const currentTextColor = editor.getAttributes('textStyle').color || '';
  const currentHighlightColor = editor.getAttributes('highlight').color || '';

  const isTextSelected = (colorValue: string) => {
    if (colorValue === '#fafafa') {
      return !currentTextColor || currentTextColor.toLowerCase() === colorValue.toLowerCase();
    }
    return currentTextColor.toLowerCase() === colorValue.toLowerCase();
  };

  const isHighlightSelected = (colorValue: string) => {
    return currentHighlightColor.toLowerCase() === colorValue.toLowerCase();
  };

  return (
    <div style={{ padding: '6px 4px', width: 196 }} onClick={e => e.stopPropagation()}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', marginBottom: 10 }}>Text Color</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px 6px' }}>
          {textColors.map(color => {
            const isSelected = isTextSelected(color.value);
            return (
              <Tooltip
                key={color.value}
                title={`${color.label} text`}
                placement="top"
                mouseEnterDelay={0.1}
                arrow={false}
                overlayInnerStyle={{
                  backgroundColor: '#ffffff',
                  color: '#1f1f1f',
                  fontSize: '11px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  padding: '4px 8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (color.value === '#fafafa') {
                      editor.chain().focus().unsetColor().run();
                    } else {
                      editor.chain().focus().setColor(color.value).run();
                    }
                  }}
                  disabled={isSourceMode}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: `1.5px solid ${color.value === '#fafafa' ? '#444446' : color.value}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ 
                      color: color.value === '#fafafa' ? '#f4f4f5' : color.value, 
                      fontSize: 11, 
                      fontWeight: 600, 
                      lineHeight: 1 
                    }}>
                      A
                    </span>
                  </div>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', marginBottom: 10 }}>Highlight Color</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px 6px' }}>
          {highlightColors.map((color, index) => {
            const isSelected = isHighlightSelected(color.value);
            return (
              <Tooltip
                key={color.value}
                title={`${color.label} background`}
                placement="top"
                mouseEnterDelay={0.1}
                arrow={false}
                overlayInnerStyle={{
                  backgroundColor: '#ffffff',
                  color: '#1f1f1f',
                  fontSize: '11px',
                  fontWeight: 500,
                  borderRadius: '6px',
                  padding: '4px 8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (index === 0) {
                      editor.chain().focus().unsetHighlight().run();
                    } else {
                      editor.chain().focus().setHighlight({ color: color.value }).run();
                    }
                  }}
                  disabled={isSourceMode}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: color.value,
                      border: color.value.toLowerCase() === '#ffffff' ? '1.5px solid #444446' : '1px solid rgba(255, 255, 255, 0.25)',
                    }}
                  />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface LinkEditorPopoverContentProps {
  editor: any;
  onClose: () => void;
}

const LinkEditorPopoverContent: React.FC<LinkEditorPopoverContentProps> = ({ editor, onClose }) => {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const previousUrl = editor.getAttributes('link').href || '';
    setUrl(previousUrl);
  }, [editor]);

  const handleApply = () => {
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      let finalUrl = url;
      if (!/^https?:\/\//i.test(url) && !/^\//.test(url)) {
        finalUrl = `https://${url}`;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run();
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  };

  const handleOpenLink = () => {
    if (url) {
      const targetUrl = /^https?:\/\//i.test(url) || /^\//.test(url) ? url : `https://${url}`;
      window.open(targetUrl, '_blank');
    }
  };

  const handleRemoveLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setUrl('');
    onClose();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 28 }} onClick={e => e.stopPropagation()}>
      <input
        type="text"
        placeholder="Paste a link..."
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#e4e4e7',
          fontSize: 13,
          width: 180,
          padding: '0 4px 0 8px',
        }}
      />
      <button
        type="button"
        onClick={handleApply}
        style={{
          background: 'transparent',
          border: 'none',
          color: url ? '#a1a1aa' : '#52525b',
          cursor: url ? 'pointer' : 'not-allowed',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          outline: 'none',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => { if (url) e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={e => { if (url) e.currentTarget.style.color = '#a1a1aa'; }}
        title="Apply"
      >
        <CornerDownLeft size={15} />
      </button>
      <div style={{ width: 1, height: 16, background: '#27272a', margin: '0 8px' }} />
      <button
        type="button"
        onClick={handleOpenLink}
        disabled={!url}
        style={{
          background: 'transparent',
          border: 'none',
          color: url ? '#a1a1aa' : '#52525b',
          cursor: url ? 'pointer' : 'not-allowed',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          outline: 'none',
          transition: 'color 0.2s',
          marginRight: 2,
        }}
        onMouseEnter={e => { if (url) e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={e => { if (url) e.currentTarget.style.color = '#a1a1aa'; }}
        title="Open link"
      >
        <ExternalLink size={15} />
      </button>
      <button
        type="button"
        onClick={handleRemoveLink}
        disabled={!editor.isActive('link')}
        style={{
          background: 'transparent',
          border: 'none',
          color: editor.isActive('link') ? '#a1a1aa' : '#52525b',
          cursor: editor.isActive('link') ? 'pointer' : 'not-allowed',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          outline: 'none',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => { if (editor.isActive('link')) e.currentTarget.style.color = '#ef4444'; }}
        onMouseLeave={e => { if (editor.isActive('link')) e.currentTarget.style.color = '#a1a1aa'; }}
        title="Remove link"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

interface TipTapEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TipTapEditor: React.FC<TipTapEditorProps> = ({ value, onChange, placeholder }) => {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceCode, setSourceCode] = useState(value || '');
  const [uploading, setUploading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'tiptap-link',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph', 'image'],
      }),
      CustomImage,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'tiptap-task-item',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      CharacterCount,
      Placeholder.configure({
        placeholder: placeholder || '写点什么吧...',
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      setSourceCode(html);
    },
  });

  // Keep editor content in sync with value prop when it changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
      setSourceCode(value || '');
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      message.error('只支持上传图片格式的文件！');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      message.error('图片大小不能超过 10MB！');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', '关于我们');

      const res = await (request.post('/assets/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-plugin-ns': 'asset_manager',
        },
      }) as Promise<any>);

      if (res?.asset?.file_url) {
        editor.chain().focus().setImage({ src: res.asset.file_url }).run();
        message.success('图片上传并插入成功！');
      } else {
        message.error('上传成功 but 未返回有效的文件链接');
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || '图片上传失败';
      message.error(errMsg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleSourceMode = () => {
    if (isSourceMode) {
      editor.commands.setContent(sourceCode || '');
      setIsSourceMode(false);
    } else {
      const currentHtml = editor.getHTML();
      setSourceCode(currentHtml);
      setIsSourceMode(true);
    }
  };

  return (
    <div className={`tiptap-editor-container ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {/* Custom Shadcn Styled Toolbar */}
      <div className="tiptap-toolbar">
        {/* History Group */}
        <Tooltip title="撤销 (Undo)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={isSourceMode || !editor.can().undo()}
          >
            <Undo size={15} />
          </button>
        </Tooltip>
        <Tooltip title="重做 (Redo)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={isSourceMode || !editor.can().redo()}
          >
            <Redo size={15} />
          </button>
        </Tooltip>

        <div className="tiptap-toolbar-divider" />

        {/* Text Formats Group */}
        <Tooltip title="粗体 (Bold)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('bold') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={isSourceMode}
          >
            <Bold size={15} />
          </button>
        </Tooltip>
        <Tooltip title="斜体 (Italic)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('italic') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={isSourceMode}
          >
            <Italic size={15} />
          </button>
        </Tooltip>
        <Tooltip title="下划线 (Underline)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('underline') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            disabled={isSourceMode}
          >
            <UnderlineIcon size={15} />
          </button>
        </Tooltip>
        <Tooltip title="删除线 (Strikethrough)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('strike') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={isSourceMode}
          >
            <Strikethrough size={15} />
          </button>
        </Tooltip>
        <Tooltip title="行内代码 (Code)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('code') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleCode().run()}
            disabled={isSourceMode}
          >
            <Code size={15} />
          </button>
        </Tooltip>

        <div className="tiptap-toolbar-divider" />

        {/* Subscript / Superscript */}
        <Tooltip title="下标 (Subscript)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('subscript') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            disabled={isSourceMode}
          >
            <SubscriptIcon size={15} />
          </button>
        </Tooltip>
        <Tooltip title="上标 (Superscript)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('superscript') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            disabled={isSourceMode}
          >
            <SuperscriptIcon size={15} />
          </button>
        </Tooltip>

        <div className="tiptap-toolbar-divider" />

        {/* Color Picker Dropdown (Text & Highlight) */}
        <Popover
          trigger={isSourceMode ? [] : "click"}
          placement="bottom"
          overlayInnerStyle={{
            backgroundColor: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '12px',
            padding: '12px',
            color: '#fff',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5)'
          }}
          arrow={false}
          content={
            <ColorPickerPopover editor={editor} isSourceMode={isSourceMode} />
          }
        >
          <button
            type="button"
            className="tiptap-toolbar-btn"
            style={{
              width: 'auto',
              padding: '0 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              cursor: isSourceMode ? 'not-allowed' : 'pointer',
              opacity: isSourceMode ? 0.4 : 1
            }}
            disabled={isSourceMode}
          >
            <span style={{
              fontSize: '13px',
              fontWeight: 'bold',
              borderBottom: `3px solid ${editor.getAttributes('textStyle').color || '#fafafa'}`
            }}>
              A
            </span>
            <ChevronDown size={11} style={{ opacity: 0.7 }} />
          </button>
        </Popover>

        <div className="tiptap-toolbar-divider" />

        {/* Headings Group */}
        <Tooltip title="标题 1 (H1)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            disabled={isSourceMode}
          >
            <Heading1 size={15} />
          </button>
        </Tooltip>
        <Tooltip title="标题 2 (H2)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            disabled={isSourceMode}
          >
            <Heading2 size={15} />
          </button>
        </Tooltip>
        <Tooltip title="标题 3 (H3)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            disabled={isSourceMode}
          >
            <Heading3 size={15} />
          </button>
        </Tooltip>

        <div className="tiptap-toolbar-divider" />

        {/* Alignments Group */}
        <Tooltip title="左对齐 (Left)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            disabled={isSourceMode}
          >
            <AlignLeft size={15} />
          </button>
        </Tooltip>
        <Tooltip title="居中对齐 (Center)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            disabled={isSourceMode}
          >
            <AlignCenter size={15} />
          </button>
        </Tooltip>
        <Tooltip title="右对齐 (Right)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            disabled={isSourceMode}
          >
            <AlignRight size={15} />
          </button>
        </Tooltip>
        <Tooltip title="两端对齐 (Justify)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive({ textAlign: 'justify' }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            disabled={isSourceMode}
          >
            <AlignJustify size={15} />
          </button>
        </Tooltip>

        <div className="tiptap-toolbar-divider" />

        {/* Lists Group */}
        <Tooltip title="无序列表 (Bullet List)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('bulletList') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            disabled={isSourceMode}
          >
            <List size={15} />
          </button>
        </Tooltip>
        <Tooltip title="有序列表 (Ordered List)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('orderedList') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            disabled={isSourceMode}
          >
            <ListOrdered size={15} />
          </button>
        </Tooltip>
        <Tooltip title="任务列表 (Task List)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('taskList') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            disabled={isSourceMode}
          >
            <ListTodo size={15} />
          </button>
        </Tooltip>

        <div className="tiptap-toolbar-divider" />

        {/* Insert / Blocks Group */}
        <Popover
          trigger={isSourceMode ? [] : "click"}
          placement="bottom"
          overlayInnerStyle={{
            backgroundColor: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '9999px',
            padding: '6px 12px',
            color: '#fff',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
          }}
          arrow={false}
          open={isSourceMode ? false : linkPopoverOpen}
          onOpenChange={isSourceMode ? undefined : setLinkPopoverOpen}
          content={
            <LinkEditorPopoverContent
              editor={editor}
              onClose={() => setLinkPopoverOpen(false)}
            />
          }
        >
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('link') ? 'is-active' : ''}`}
            disabled={isSourceMode}
          >
            <LinkIcon size={15} />
          </button>
        </Popover>
        <Tooltip title="上传图片 (Upload Image)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSourceMode || uploading}
          >
            <ImageIcon size={15} style={uploading ? { opacity: 0.5 } : {}} />
          </button>
        </Tooltip>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          style={{ display: 'none' }}
        />
        <Tooltip title="引用 (Blockquote)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('blockquote') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            disabled={isSourceMode}
          >
            <Quote size={15} />
          </button>
        </Tooltip>
        <Tooltip title="分割线 (Horizontal Line)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            disabled={isSourceMode}
          >
            <Minus size={15} />
          </button>
        </Tooltip>

        <div className="tiptap-toolbar-divider" />

        {/* Table Management Group */}
        <Tooltip title={!isSourceMode && editor.isActive('table') ? "表格已插入" : "插入表格 (3x3)"} mouseEnterDelay={0.5}>
          <button
            type="button"
            className={`tiptap-toolbar-btn ${!isSourceMode && editor.isActive('table') ? 'is-active' : ''}`}
            onClick={() => {
              if (!editor.isActive('table')) {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              }
            }}
            disabled={isSourceMode}
          >
            <TableIcon size={15} />
          </button>
        </Tooltip>
        {!isSourceMode && editor.isActive('table') && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: 'var(--border)', padding: '2px 4px', borderRadius: '4px', margin: '0 2px' }}>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 4px', fontSize: '10px', height: '20px' }}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              +行
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 4px', fontSize: '10px', height: '20px' }}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              +列
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 4px', fontSize: '10px', height: '20px' }}
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              -行
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 4px', fontSize: '10px', height: '20px' }}
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              -列
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 4px', fontSize: '10px', height: '20px' }}
              onClick={() => editor.chain().focus().mergeOrSplit().run()}
            >
              合并/拆分
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 4px', fontSize: '10px', height: '20px', color: '#ff4d4f' }}
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              删表
            </button>
          </div>
        )}

        <div className="tiptap-toolbar-divider" />

        {/* Formatting actions */}
        <Tooltip title="清除格式 (Clear Formatting)" mouseEnterDelay={0.5}>
          <button
            type="button"
            className="tiptap-toolbar-btn"
            onClick={() => {
              editor.chain().focus().unsetAllMarks().clearNodes().run();
            }}
            disabled={isSourceMode}
          >
            <Eraser size={15} />
          </button>
        </Tooltip>

        {/* Context-aware Image Resizing Controls */}
        {!isSourceMode && editor.isActive('image') && (
          <>
            <div className="tiptap-toolbar-divider" />
            <span style={{ fontSize: '11px', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', marginRight: '4px' }}>
              图片比例:
            </span>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 6px', fontSize: '11px' }}
              onClick={() => editor.chain().focus().updateAttributes('image', { width: '25%' }).run()}
            >
              25%
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 6px', fontSize: '11px' }}
              onClick={() => editor.chain().focus().updateAttributes('image', { width: '50%' }).run()}
            >
              50%
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 6px', fontSize: '11px' }}
              onClick={() => editor.chain().focus().updateAttributes('image', { width: '75%' }).run()}
            >
              75%
            </button>
            <button
              type="button"
              className="tiptap-toolbar-btn"
              style={{ width: 'auto', padding: '0 6px', fontSize: '11px' }}
              onClick={() => editor.chain().focus().updateAttributes('image', { width: '100%' }).run()}
            >
              100%
            </button>
          </>
        )}

        {/* Right Controls: Fullscreen & Source Mode */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {/* Fullscreen Button */}
          <Tooltip title={isFullscreen ? "退出全屏" : "全屏模式"} mouseEnterDelay={0.5}>
            <button
              type="button"
              className={`tiptap-toolbar-btn ${isFullscreen ? 'is-active' : ''}`}
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </Tooltip>

          {/* Source Mode Toggle */}
          <Tooltip title={isSourceMode ? "切换为富文本视图" : "切换为 HTML 源码视图"} mouseEnterDelay={0.5}>
            <button
              type="button"
              className={`tiptap-toolbar-btn ${isSourceMode ? 'is-active' : ''}`}
              onClick={toggleSourceMode}
            >
              <Code2 size={15} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="tiptap-content">
        {isSourceMode ? (
          <textarea
            value={sourceCode}
            onChange={(e) => {
              const val = e.target.value;
              setSourceCode(val);
              onChange(val);
            }}
            placeholder="输入 HTML 源码..."
            style={{
              width: '100%',
              minHeight: isFullscreen ? 'calc(100vh - 100px)' : '200px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '13px',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text-h)',
              resize: 'none',
              lineHeight: '1.5',
            }}
          />
        ) : (
          <EditorContent editor={editor} placeholder={placeholder} />
        )}
      </div>

      {/* Status Bar / Character Count */}
      <div 
        style={{ 
          padding: '6px 12px', 
          borderTop: '1px solid var(--border)', 
          fontSize: '12px', 
          color: 'var(--text)', 
          opacity: 0.8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg)'
        }}
      >
        <span>
          {isSourceMode ? '源码模式 (HTML)' : '富文本编辑模式'}
        </span>
        <span>
          字数: {editor.storage.characterCount.characters()} | 单词数: {editor.storage.characterCount.words()}
        </span>
      </div>
    </div>
  );
};

export default TipTapEditor;
