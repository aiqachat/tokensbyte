/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import DOMPurify from 'dompurify';

/**
 * HTML 净化 - 对所有 dangerouslySetInnerHTML 内容进行 XSS 防护
 * 使用 DOMPurify 白名单机制，仅允许安全的 HTML 标签和属性
 */
export const sanitizeHtml = (html: string): string => {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
            'span', 'div', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
            'hr', 'sub', 'sup', 'u', 's', 'del', 'figure', 'figcaption',
        ],
        ALLOWED_ATTR: [
            'href', 'target', 'rel', 'src', 'alt', 'class', 'style',
            'width', 'height', 'colspan', 'rowspan', 'id',
        ],
    });
};
