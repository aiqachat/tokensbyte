const fs = require('fs');
const path = require('path');

const files = [
  'src/pages/Playground/components/GenerationLogWidget.tsx',
  'src/pages/Playground/components/ResourceManagerWidget.tsx'
];

const iconMap = {
  'CloseOutlined': 'X',
  'PictureOutlined': 'ImageIcon',
  'VideoCameraOutlined': 'Video',
  'CopyOutlined': 'Copy',
  'CheckCircleOutlined': 'CheckCircle2',
  'CloseCircleOutlined': 'XCircle',
  'FileTextOutlined': 'FileText',
  'ClockCircleOutlined': 'Clock',
  'ScissorOutlined': 'Scissors',
  'EditOutlined': 'Edit2',
  'ReloadOutlined': 'RefreshCw',
  'DownloadOutlined': 'Download',
  'DeleteOutlined': 'Trash2',
  'ArrowLeftOutlined': 'ArrowLeft',
  'FolderOpenOutlined': 'FolderOpen'
};

for (const file of files) {
  const p = path.join(__dirname, file);
  let content = fs.readFileSync(p, 'utf-8');
  
  // Replace antd imports
  if (file.includes('GenerationLogWidget')) {
    content = content.replace(
      /import \{\n\s+CloseOutlined[\s\S]*?\} from '@ant-design\/icons';/,
      "import { LoadingOutlined } from '@ant-design/icons';"
    );
    content = content.replace(
      /import \{ MessageCircle \} from 'lucide-react';/,
      "import { MessageCircle, X, Image as ImageIcon, Copy, Video, CheckCircle2, XCircle, FileText, Clock, Scissors, Edit2, RefreshCw, Download, Trash2, ArrowLeft } from 'lucide-react';"
    );
  } else if (file.includes('ResourceManagerWidget')) {
    content = content.replace(
      /import \{ FolderOpenOutlined, CloseOutlined \} from '@ant-design\/icons';/,
      ""
    );
    content = content.replace(
      /import \{ useThemeStore \} from '\.\.\/\.\.\/\.\.\/store\/theme';/,
      "import { useThemeStore } from '../../../store/theme';\nimport { FolderOpen, X } from 'lucide-react';"
    );
  }
  
  // Apply semantic colors FIRST
  content = content.replace(/color: '#52c41a'/g, "color: '#10b981'");
  content = content.replace(/color: '#ff4d4f'/g, "color: '#ef4444'");
  content = content.replace(/color: '#faad14'/g, "color: '#f59e0b'");
  content = content.replace(/color: '#fff'/g, "color: _isLight ? '#09090b' : '#fafafa'"); // Be careful here, some #fff might be intended.

  // Apply component replacements and fix sizes
  for (const [antd, lucide] of Object.entries(iconMap)) {
    // We want to replace <AntdIcon ... style={{ ... fontSize: XX ... }} />
    // First, change the tag name
    content = content.replace(new RegExp(`<${antd}([^>]*)>`, 'g'), `<${lucide}$1>`);
    content = content.replace(new RegExp(`</${antd}>`, 'g'), `</${lucide}>`);
    
    // Now find the Lucide tag we just created and if it has fontSize: XX inside its style, extract it
    const tagRegex = new RegExp(`<${lucide}([^>]*)style=\\{\\{([^}]*)fontSize:\\s*(\\d+)([^}]*)\\}\\}([^>]*)>`, 'g');
    content = content.replace(tagRegex, `<${lucide}$1size={$3} style={{$2$4}}$5>`);
  }
  
  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Icons updated successfully!');
