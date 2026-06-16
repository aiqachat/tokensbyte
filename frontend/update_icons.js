const fs = require('fs');
const path = require('path');

const files = [
  'src/pages/Playground/components/GenerationLogWidget.tsx',
  'src/pages/Playground/components/ResourceManagerWidget.tsx'
];

const replacements = [
  { search: /<CloseOutlined/g, replace: '<X' },
  { search: /<\/CloseOutlined>/g, replace: '</X>' },
  { search: /<PictureOutlined/g, replace: '<ImageIcon' },
  { search: /<VideoCameraOutlined/g, replace: '<Video' },
  { search: /<CopyOutlined/g, replace: '<Copy' },
  { search: /<CheckCircleOutlined/g, replace: '<CheckCircle2' },
  { search: /<CloseCircleOutlined/g, replace: '<XCircle' },
  { search: /<FileTextOutlined/g, replace: '<FileText' },
  { search: /<ClockCircleOutlined/g, replace: '<Clock' },
  { search: /<ScissorOutlined/g, replace: '<Scissors' },
  { search: /<EditOutlined/g, replace: '<Edit2' },
  { search: /<ReloadOutlined/g, replace: '<RefreshCw' },
  { search: /<DownloadOutlined/g, replace: '<Download' },
  { search: /<DeleteOutlined/g, replace: '<Trash2' },
  { search: /<ArrowLeftOutlined/g, replace: '<ArrowLeft' },
  { search: /<FolderOpenOutlined/g, replace: '<FolderOpen' },
  
  // Semantic Colors
  { search: /color: '#52c41a'/g, replace: "color: '#10b981'" }, // CheckCircle2 success
  { search: /color: '#ff4d4f'/g, replace: "color: '#ef4444'" }, // XCircle error
  { search: /color: '#faad14'/g, replace: "color: '#f59e0b'" }, // Clock warning
  { search: /color: '#fff'/g, replace: "color: _isLight ? '#09090b' : '#fafafa'" }, // LoadingOutlined fallback
];

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
  
  // Apply replacements
  for (const { search, replace } of replacements) {
    content = content.replace(search, replace);
  }
  
  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Icons updated successfully!');
