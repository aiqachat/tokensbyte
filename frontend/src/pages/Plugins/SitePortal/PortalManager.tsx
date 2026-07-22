/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect } from 'react';
import { Typography, Input, Switch, Button, Divider, Spin, App, Space, Tag, Alert, Modal, Select } from 'antd';
import { SaveOutlined, EyeOutlined, ThunderboltOutlined, PlusOutlined, DeleteOutlined, LinkOutlined, CopyOutlined } from '@ant-design/icons';
import { LayoutDashboard, Tag as TagIcon, Code, FlaskConical, ShieldCheck, Globe, Landmark, PanelBottom, Mail, Phone, MapPin, MessageSquare, Users, Send, Link as LinkIcon, FileCode } from 'lucide-react';
import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';
import TipTapEditor from '../../../components/TipTapEditor';

const PRESET_ICONS: Record<string, string> = {
  mail: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM12.0606 11.6829L5.64722 6.2377L4.35278 7.7623L12.0731 14.3171L19.6544 7.75616L18.3456 6.24384L12.0606 11.6829Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M21 16.42V19.9561C21 20.4811 20.5941 20.9167 20.0705 20.9537C19.6331 20.9846 19.2763 21 19 21C10.1634 21 3 13.8366 3 5C3 4.72371 3.01545 4.36687 3.04635 3.9295C3.08337 3.40588 3.51894 3 4.04386 3H7.5801C7.83678 3 8.05176 3.19442 8.07753 3.4498C8.10067 3.67907 8.12218 3.86314 8.14207 4.00202C8.34435 5.41472 8.75753 6.75936 9.3487 8.00303C9.44359 8.20265 9.38171 8.44159 9.20185 8.57006L7.04355 10.1118C8.35752 13.1811 10.8189 15.6425 13.8882 16.9565L15.4271 14.8019C15.5572 14.6199 15.799 14.5573 16.001 14.6532C17.2446 15.2439 18.5891 15.6566 20.0016 15.8584C20.1396 15.8782 20.3225 15.8995 20.5502 15.9225C20.8056 15.9483 21 16.1633 21 16.42Z"/></svg>',
  address: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.364 17.364L12 23.7279L5.63604 17.364C2.12132 13.8492 2.12132 8.15076 5.63604 4.63604C9.15076 1.12132 14.8492 1.12132 18.364 4.63604C21.8787 8.15076 21.8787 13.8492 18.364 17.364ZM12 15C14.2091 15 16 13.2091 16 11C16 8.79086 14.2091 7 12 7C9.79086 7 8 8.79086 8 11C8 13.2091 9.79086 15 12 15ZM12 13C10.8954 13 10 12.1046 10 11C10 9.89543 10.8954 9 12 9C13.1046 9 14 9.89543 14 11C14 12.1046 13.1046 13 12 13Z"/></svg>',
  wechat: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.5753 13.7114C19.0742 13.7114 19.4733 13.2873 19.4733 12.8134C19.4733 12.3145 19.0742 11.9155 18.5753 11.9155C18.0765 11.9155 17.6774 12.3145 17.6774 12.8134C17.6774 13.3123 18.0765 13.7114 18.5753 13.7114ZM14.1497 13.7114C14.6485 13.7114 15.0476 13.2873 15.0476 12.8134C15.0476 12.3145 14.6485 11.9155 14.1497 11.9155C13.6508 11.9155 13.2517 12.3145 13.2517 12.8134C13.2517 13.3123 13.6508 13.7114 14.1497 13.7114ZM20.717 18.7516C20.5942 18.8253 20.5205 18.9482 20.5451 19.1202C20.5451 19.1693 20.5451 19.2185 20.5696 19.2676C20.6679 19.6854 20.8643 20.349 20.8643 20.3736C20.8643 20.4473 20.8889 20.4964 20.8889 20.5456C20.8889 20.6685 20.7907 20.7668 20.6679 20.7668C20.6187 20.7668 20.5942 20.7422 20.5451 20.7176L19.0961 19.882C18.9978 19.8329 18.875 19.7837 18.7522 19.7837C18.6786 19.7837 18.6049 19.7837 18.5558 19.8083C17.8681 20.0049 17.1559 20.1032 16.3946 20.1032C12.7352 20.1032 9.78815 17.6456 9.78815 14.5983C9.78815 11.5509 12.7352 9.09329 16.3946 9.09329C20.0539 9.09329 23.001 11.5509 23.001 14.5983C23.001 16.2448 22.1168 17.7439 20.717 18.7516ZM16.6737 8.09757C16.581 8.09473 16.488 8.09329 16.3946 8.09329C12.2199 8.09329 8.78815 10.9536 8.78815 14.5983C8.78815 15.1519 8.86733 15.6874 9.01626 16.1975H8.92711C8.04096 16.1975 7.15481 16.0503 6.3425 15.8296C6.26866 15.805 6.19481 15.805 6.12097 15.805C5.97327 15.805 5.82558 15.8541 5.7025 15.9277L3.95482 16.9334C3.90559 16.958 3.85635 16.9825 3.80712 16.9825C3.65943 16.9825 3.53636 16.8599 3.53636 16.7127C3.53636 16.6391 3.56097 16.59 3.58559 16.5164C3.6102 16.4919 3.83174 15.6824 3.95482 15.1918C3.95482 15.1427 3.97943 15.0691 3.97943 15.0201C3.97943 14.8238 3.88097 14.6766 3.75789 14.5785C2.05944 13.3765 1.00098 11.5858 1.00098 9.59876C1.00098 5.94369 4.5702 3 8.95173 3C12.7157 3 15.8802 5.16856 16.6737 8.09757ZM11.5199 8.51604C12.0927 8.51604 12.5462 8.03871 12.5462 7.4898C12.5462 6.91701 12.0927 6.46356 11.5199 6.46356C10.9471 6.46356 10.4937 6.91701 10.4937 7.4898C10.4937 8.06258 10.9471 8.51604 11.5199 8.51604ZM6.26045 8.51604C6.83324 8.51604 7.28669 8.03871 7.28669 7.4898C7.28669 6.91701 6.83324 6.46356 6.26045 6.46356C5.68767 6.46356 5.23421 6.91701 5.23421 7.4898C5.23421 8.06258 5.68767 8.51604 6.26045 8.51604Z"/></svg>',
  qq: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M19.9139 14.529C19.7336 13.955 19.4877 13.2856 19.2385 12.643L18.3288 10.3969C18.3295 10.371 18.3408 9.92858 18.3408 9.70053C18.3408 5.8599 16.5082 2.00037 12.0009 2C7.49403 2.00037 5.66113 5.8599 5.66113 9.70053C5.66113 9.92858 5.67237 10.371 5.67312 10.3969L4.76379 12.643C4.51453 13.2856 4.26827 13.955 4.08798 14.529C3.2285 17.2657 3.507 18.3982 3.71915 18.4238C4.17419 18.4779 5.49021 16.3635 5.49021 16.3635C5.49021 17.5879 6.12741 19.1858 7.5064 20.3398C6.99064 20.4971 6.35868 20.7388 5.95237 21.0355C5.58729 21.3025 5.63302 21.5743 5.69861 21.6841C5.9876 22.1661 10.6542 21.9918 12.0017 21.8417C13.3488 21.9918 18.0158 22.1661 18.3044 21.6841C18.3704 21.5743 18.4157 21.3025 18.0507 21.0355C17.6443 20.7388 17.012 20.4971 16.4959 20.3395C17.8745 19.1858 18.5117 17.5879 18.5117 16.3635C18.5117 16.3635 19.8281 18.4779 20.2831 18.4238C20.4949 18.3982 20.7734 17.2657 19.9139 14.529Z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM12.3584 9.38246C11.3857 9.78702 9.4418 10.6244 6.5266 11.8945C6.05321 12.0827 5.80524 12.2669 5.78266 12.4469C5.74451 12.7513 6.12561 12.8711 6.64458 13.0343C6.71517 13.0565 6.78832 13.0795 6.8633 13.1039C7.37388 13.2698 8.06071 13.464 8.41776 13.4717C8.74164 13.4787 9.10313 13.3452 9.50222 13.0711C12.226 11.2325 13.632 10.3032 13.7203 10.2832C13.7826 10.269 13.8689 10.2513 13.9273 10.3032C13.9858 10.3552 13.98 10.4536 13.9739 10.48C13.9361 10.641 12.4401 12.0318 11.666 12.7515C11.4351 12.9661 11.2101 13.1853 10.9833 13.4039C10.509 13.8611 10.1533 14.204 11.003 14.764C11.8644 15.3317 12.7323 15.8982 13.5724 16.4971C13.9867 16.7925 14.359 17.0579 14.8188 17.0156C15.0861 16.991 15.3621 16.7397 15.5022 15.9903C15.8335 14.2193 16.4847 10.3821 16.6352 8.80083C16.6484 8.6623 16.6318 8.485 16.6185 8.40717C16.6052 8.32934 16.5773 8.21844 16.4762 8.13635C16.3563 8.03913 16.1714 8.01863 16.0887 8.02009C15.7125 8.02672 15.1355 8.22737 12.3584 9.38246Z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.001 2C17.5238 2 22.001 6.47715 22.001 12C22.001 17.5228 17.5238 22 12.001 22C10.1671 22 8.44851 21.5064 6.97086 20.6447L2.00516 22L3.35712 17.0315C2.49494 15.5536 2.00098 13.8345 2.00098 12C2.00098 6.47715 6.47813 2 12.001 2ZM8.59339 7.30019L8.39232 7.30833C8.26293 7.31742 8.13607 7.34902 8.02057 7.40811C7.93392 7.45244 7.85348 7.51651 7.72709 7.63586C7.60774 7.74855 7.53857 7.84697 7.46569 7.94186C7.09599 8.4232 6.89729 9.01405 6.90098 9.62098C6.90299 10.1116 7.03043 10.5884 7.23169 11.0336C7.63982 11.9364 8.31288 12.8908 9.20194 13.7759C9.4155 13.9885 9.62473 14.2034 9.85034 14.402C10.9538 15.3736 12.2688 16.0742 13.6907 16.4482C13.6907 16.4482 14.2507 16.5342 14.2589 16.5347C14.4444 16.5447 14.6296 16.5313 14.8153 16.5218C15.1066 16.5068 15.391 16.428 15.6484 16.2909C15.8139 16.2028 15.8922 16.159 16.0311 16.0714C16.0311 16.0714 16.0737 16.0426 16.1559 15.9814C16.2909 15.8808 16.3743 15.81 16.4866 15.6934C16.5694 15.6074 16.6406 15.5058 16.6956 15.3913C16.7738 15.2281 16.8525 14.9166 16.8838 14.6579C16.9077 14.4603 16.9005 14.3523 16.8979 14.2854C16.8936 14.1778 16.8047 14.0671 16.7073 14.0201L16.1258 13.7587C16.1258 13.7587 15.2563 13.3803 14.7245 13.1377C14.6691 13.1124 14.6085 13.1007 14.5476 13.097C14.4142 13.0888 14.2647 13.1236 14.1696 13.2238C14.1646 13.2218 14.0984 13.279 13.3749 14.1555C13.335 14.2032 13.2415 14.3069 13.0798 14.2972C13.0554 14.2955 13.0311 14.292 13.0074 14.2858C12.9419 14.2685 12.8781 14.2457 12.8157 14.2193C12.692 14.1668 12.6486 14.1469 12.5641 14.1105C11.9868 13.8583 11.457 13.5209 10.9887 13.108C10.8631 12.9974 10.7463 12.8783 10.6259 12.7616C10.2057 12.3543 9.86169 11.9211 9.60577 11.4938C9.5918 11.4705 9.57027 11.4368 9.54708 11.3991C9.50521 11.331 9.45903 11.25 9.44455 11.1944C9.40738 11.0473 9.50599 10.9291 9.50599 10.9291C9.50599 10.9291 9.74939 10.663 9.86248 10.5183C9.97128 10.379 10.0652 10.2428 10.125 10.1457C10.2428 9.95633 10.2801 9.76062 10.2182 9.60963C9.93764 8.92565 9.64818 8.24536 9.34986 7.56894C9.29098 7.43545 9.11585 7.33846 8.95659 7.32007C8.90265 7.31384 8.84875 7.30758 8.79459 7.30402C8.66053 7.29748 8.5262 7.29892 8.39232 7.30833L8.59339 7.30019Z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M19.3034 5.33716C17.9344 4.71103 16.4805 4.2547 14.9629 4C14.7719 4.32899 14.5596 4.77471 14.411 5.12492C12.7969 4.89144 11.1944 4.89144 9.60255 5.12492C9.45397 4.77471 9.2311 4.32899 9.05068 4C7.52251 4.2547 6.06861 4.71103 4.70915 5.33716C1.96053 9.39111 1.21766 13.3495 1.5891 17.2549C3.41443 18.5815 5.17612 19.388 6.90701 19.9187C7.33151 19.3456 7.71356 18.73 8.04255 18.0827C7.41641 17.8492 6.82211 17.5627 6.24904 17.2231C6.39762 17.117 6.5462 17.0003 6.68416 16.8835C10.1438 18.4648 13.8911 18.4648 17.3082 16.8835C17.4568 17.0003 17.5948 17.117 17.7434 17.2231C17.1703 17.5627 16.576 17.8492 15.9499 18.0827C16.2789 18.73 16.6609 19.3456 17.0854 19.9187C18.8152 19.388 20.5875 18.5815 22.4033 17.2549C22.8596 12.7341 21.6806 8.80747 19.3034 5.33716ZM8.5201 14.8459C7.48007 14.8459 6.63107 13.9014 6.63107 12.7447C6.63107 11.5879 7.45884 10.6434 8.5201 10.6434C9.57071 10.6434 10.4303 11.5879 10.4091 12.7447C10.4091 13.9014 9.57071 14.8459 8.5201 14.8459ZM15.4936 14.8459C14.4535 14.8459 13.6034 13.9014 13.6034 12.7447C13.6034 11.5879 14.4323 10.6434 15.4936 10.6434C16.5442 10.6434 17.4038 11.5879 17.3825 12.7447C17.3825 13.9014 16.5548 14.8459 15.4936 14.8459Z"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M17.6874 3.0625L12.6907 8.77425L8.37045 3.0625H2.11328L9.58961 12.8387L2.50378 20.9375H5.53795L11.0068 14.6886L15.7863 20.9375H21.8885L14.095 10.6342L20.7198 3.0625H17.6874ZM16.6232 19.1225L5.65436 4.78217H7.45745L18.3034 19.1225H16.6232Z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.3362 18.339H15.6707V14.1622C15.6707 13.1662 15.6505 11.8845 14.2817 11.8845C12.892 11.8845 12.6797 12.9683 12.6797 14.0887V18.339H10.0142V9.75H12.5747V10.9207H12.6092C12.967 10.2457 13.837 9.53325 15.1367 9.53325C17.8375 9.53325 18.337 11.3108 18.337 13.6245V18.339H18.3362ZM7.00373 8.57475C6.14573 8.57475 5.45648 7.88025 5.45648 7.026C5.45648 6.1725 6.14648 5.47875 7.00373 5.47875C7.85873 5.47875 8.55173 6.1725 8.55173 7.026C8.55173 7.88025 7.85798 8.57475 7.00373 8.57475ZM8.34023 18.339H5.66723V9.75H8.34023V18.339ZM19.6697 3H4.32923C3.59498 3 3.00098 3.5805 3.00098 4.29675V19.7033C3.00098 20.4202 3.59498 21 4.32923 21H19.6675C20.401 21 21.001 20.4202 21.001 19.7033V4.29675C21.001 3.5805 20.401 3 19.6675 3H19.6697Z"/></svg>',
  skype: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M13.3109 20.3997C12.8839 20.4657 12.4464 20.5 12.001 20.5C7.30656 20.5 3.50098 16.6944 3.50098 12C3.50098 11.5545 3.53524 11.1171 3.60129 10.6901C3.21792 9.96108 3.00098 9.13087 3.00098 8.25C3.00098 5.35051 5.35148 3 8.25098 3C9.13185 3 9.96205 3.21694 10.6911 3.60031C11.118 3.53427 11.5555 3.5 12.001 3.5C16.6954 3.5 20.501 7.30558 20.501 12C20.501 12.4455 20.4667 12.8829 20.4007 13.3099C20.784 14.0389 21.001 14.8691 21.001 15.75C21.001 18.6495 18.6505 21 15.751 21C14.8701 21 14.0399 20.7831 13.3109 20.3997ZM12.0532 17.1555L12.0126 17.1562C14.8854 17.1562 16.3158 15.7703 16.3158 13.9132C16.3158 12.7148 15.7645 11.442 13.5904 10.9552L11.6073 10.515C10.8522 10.3433 9.98514 10.1145 9.98514 9.39975C9.98514 8.685 10.6041 8.187 11.7088 8.187C13.9394 8.187 13.7355 9.71475 14.8403 9.71475C15.4156 9.71475 15.933 9.37275 15.933 8.78475C15.933 7.41525 13.7355 6.3855 11.8773 6.3855C9.85579 6.3855 7.70421 7.2435 7.70421 9.52875C7.70421 10.6275 8.09753 11.799 10.2634 12.342L12.9527 13.0133C13.7686 13.215 13.9709 13.6718 13.9709 14.085C13.9709 14.772 13.2873 15.4432 12.0532 15.4432C9.6362 15.4432 9.97461 13.5855 8.67885 13.5855C8.09828 13.5855 7.67639 13.9837 7.67639 14.5575C7.67639 15.6712 9.0278 17.1555 12.0532 17.1555Z"/></svg>',
  messenger: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.001 2C17.6345 2 22.001 6.1265 22.001 11.7C22.001 17.2735 17.6345 21.4 12.001 21.4C11.0233 21.4023 10.0497 21.273 9.10648 21.0155C8.92907 20.9668 8.7403 20.9808 8.57198 21.055L6.58748 21.931C6.34398 22.0386 6.06291 22.018 5.83768 21.8761C5.61244 21.7342 5.47254 21.4896 5.46448 21.2235L5.40998 19.4445C5.40257 19.2257 5.30547 19.0196 5.14148 18.8745C3.19598 17.1345 2.00098 14.6155 2.00098 11.7C2.00098 6.1265 6.36748 2 12.001 2ZM5.99598 14.5365C5.71398 14.984 6.26398 15.488 6.68498 15.1685L9.84048 12.7735C10.0543 12.6122 10.3491 12.6122 10.563 12.7735L12.8995 14.5235C13.2346 14.7749 13.6596 14.8747 14.0716 14.7987C14.4836 14.7227 14.8451 14.4779 15.0685 14.1235L18.006 9.4635C18.288 9.016 17.738 8.512 17.317 8.8315L14.1615 11.2265C13.9476 11.3878 13.6528 11.3878 13.439 11.2265L11.1025 9.4765C10.7673 9.22511 10.3423 9.12532 9.93034 9.2013C9.51834 9.27728 9.51834 9.27728 9.51834 9.27728ZM8.93348 9.8765L5.99598 14.5365Z"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.001 2C6.47598 2 2.00098 6.475 2.00098 12C2.00098 16.425 4.86348 20.1625 8.83848 21.4875C9.33848 21.575 9.52598 21.275 9.52598 21.0125C9.52598 20.775 9.51348 19.9875 9.51348 19.15C7.00098 19.6125 6.35098 18.5375 6.15098 17.975C6.03848 17.6875 5.55098 16.8 5.12598 16.5625C4.77598 16.375 4.27598 15.9125 5.11348 15.9C5.90098 15.8875 6.46348 16.625 6.65098 16.925C7.55098 18.4375 8.98848 18.0125 9.56348 17.75C9.65098 17.1 9.91348 16.6625 10.201 16.4125C7.97598 16.1625 5.65098 15.3 5.65098 11.475C5.65098 10.3875 6.03848 9.4875 6.67598 8.7875C6.57598 8.5375 6.22598 7.5125 6.77598 6.1375C6.77598 6.1375 7.61348 5.875 9.52598 7.1625C10.326 6.9375 11.176 6.825 12.026 6.825C12.876 6.825 13.726 6.9375 14.526 7.1625C16.4385 5.8625 17.276 6.1375 17.276 6.1375C17.826 7.5125 17.476 8.5375 17.376 8.7875C18.0135 9.4875 18.401 10.375 18.401 11.475C18.401 15.3125 16.0635 16.1625 13.8385 16.4125C14.201 16.725 14.5135 17.325 14.5135 18.2625C14.5135 19.6 14.501 20.675 14.501 21.0125C14.501 21.275 14.6885 21.5875 15.1885 21.4875C19.259 20.1133 21.9999 16.2963 22.001 12C22.001 6.475 17.526 2 12.001 2Z"/></svg>',
  slack: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M6.52739 14.5136C6.52739 15.5966 5.64264 16.4814 4.55959 16.4814C3.47654 16.4814 2.5918 15.5966 2.5918 14.5136C2.5918 13.4305 3.47654 12.5458 4.55959 12.5458H6.52739V14.5136ZM7.51892 14.5136C7.51892 13.4305 8.40366 12.5458 9.48671 12.5458C10.5698 12.5458 11.4545 13.4305 11.4545 14.5136V19.4407C11.4545 20.5238 10.5698 21.4085 9.48671 21.4085C8.40366 21.4085 7.51892 20.5238 7.51892 19.4407V14.5136ZM9.48671 6.52715C8.40366 6.52715 7.51892 5.6424 7.51892 4.55935C7.51892 3.4763 8.40366 2.59155 9.48671 2.59155C10.5698 2.59155 11.4545 3.4763 11.4545 4.55935V6.52715H9.48671ZM9.48671 7.51867C10.5698 7.51867 11.4545 8.40342 11.4545 9.48647C11.4545 10.5695 10.5698 11.4543 9.48671 11.4543H4.55959C3.47654 11.4543 2.5918 10.5695 2.5918 9.48647C2.5918 8.40342 3.47654 7.51867 4.55959 7.51867H9.48671ZM17.4732 9.48647C17.4732 8.40342 18.3579 7.51867 19.4409 7.51867C20.524 7.51867 21.4087 8.40342 21.4087 9.48647C21.4087 10.5695 20.524 11.4543 19.4409 11.4543H17.4732V9.48647ZM16.4816 9.48647C16.4816 10.5695 15.5969 11.4543 14.5138 11.4543C13.4308 11.4543 12.546 10.5695 12.546 9.48647V4.55935C12.546 3.4763 13.4308 2.59155 14.5138 2.59155C15.5969 2.59155 16.4816 3.4763 16.4816 4.55935V9.48647ZM14.5138 17.4729C15.5969 17.4729 16.4816 18.3577 16.4816 19.4407C16.4816 20.5238 15.5969 21.4085 14.5138 21.4085C13.4308 21.4085 12.546 20.5238 12.546 19.4407V17.4729H14.5138ZM14.5138 16.4814C13.4308 16.4814 12.546 15.5966 12.546 14.5136C12.546 13.4305 13.4308 12.5458 14.5138 12.5458H19.4409C20.524 12.5458 21.4087 13.4305 21.4087 14.5136C21.4087 15.5966 20.524 16.4814 19.4409 16.4814H14.5138Z"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.6635 10.8404C18.6635 11.1279 18.4293 11.3654 18.1385 11.3654H16.676V12.3029H18.1385C18.4293 12.3029 18.6635 12.5387 18.6635 12.8279C18.6635 13.1145 18.4293 13.352 18.1385 13.352H16.1501C15.8626 13.352 15.6276 13.1145 15.6276 12.8279V8.85202C15.6276 8.56452 15.8626 8.32702 16.1526 8.32702H18.141C18.4293 8.32702 18.6635 8.56452 18.6635 8.85202C18.6635 9.14286 18.4293 9.37702 18.1385 9.37702H16.676V10.3145H18.1385C18.4293 10.3145 18.6635 10.552 18.6635 10.8404ZM14.566 13.3245C14.5126 13.342 14.4551 13.3504 14.4001 13.3504C14.2243 13.3504 14.0743 13.2754 13.9751 13.142L11.9393 10.3779V12.8279C11.9393 13.1145 11.7068 13.352 11.4135 13.352C11.1251 13.352 10.8918 13.1145 10.8918 12.8279V8.85202C10.8918 8.62702 11.036 8.42702 11.2501 8.35619C11.3001 8.33702 11.3635 8.32869 11.4118 8.32869C11.5743 8.32869 11.7243 8.41536 11.8243 8.54036L13.876 11.3154V8.85202C13.876 8.56452 14.111 8.32702 14.401 8.32702C14.6885 8.32702 14.926 8.56452 14.926 8.85202V12.8279C14.926 13.0529 14.781 13.2529 14.566 13.3245ZM9.61598 13.352C9.32848 13.352 9.09348 13.1145 9.09348 12.8279V8.85202C9.09348 8.56452 9.32848 8.32702 9.61848 8.32702C9.90681 8.32702 10.1418 8.56452 10.1418 8.85202V12.8279C10.1418 13.1145 9.90681 13.352 9.61598 13.352ZM8.08681 13.352H6.09848C5.81098 13.352 5.57348 13.1145 5.57348 12.8279V8.85202C5.57348 8.56452 5.81098 8.32702 6.09848 8.32702C6.38848 8.32702 6.62348 8.56452 6.62348 8.85202V12.3029H8.08681C8.37681 12.3029 8.61098 12.5387 8.61098 12.8279C8.61098 13.1145 8.37598 13.352 8.08681 13.352ZM12.001 2.57202C6.48848 2.57202 2.00098 6.21452 2.00098 10.6904C2.00098 14.6995 5.55931 18.0587 10.3635 18.697C10.6893 18.7654 11.1326 18.912 11.2451 19.1887C11.3451 19.4395 11.311 19.827 11.2768 20.0887L11.1401 20.9387C11.1026 21.1895 10.9401 21.927 12.0143 21.4762C13.0901 21.027 17.7776 18.0779 19.8776 15.6637C21.3143 14.0895 22.001 12.477 22.001 10.6904C22.001 6.21452 17.5135 2.57202 12.001 2.57202Z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M14 13.5H16.5L17.5 9.5H14V7.5C14 6.47 14.5 5.5 16 5.5H17.5V2.14C17.5 2.14 16.14 2 14.82 2C12.06 2 10.25 3.66 10.25 6.7V9.5H7V13.5H10.25V22H14V13.5Z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C14.717 2 15.056 2.01 16.122 2.06C17.114 2.11 17.652 2.27 18.011 2.41C18.487 2.6 18.827 2.82 19.186 3.18C19.545 3.54 19.764 3.88 19.954 4.35C20.093 4.71 20.259 5.25 20.305 6.24C20.354 7.31 20.364 7.64 20.364 10.36V13.64C20.364 16.36 20.354 16.69 20.305 17.76C20.259 18.75 20.093 19.29 19.954 19.65C19.764 20.12 19.545 20.46 19.186 20.82C18.827 21.18 18.487 21.4 18.011 21.59C17.652 21.73 17.114 21.89 16.122 21.94C15.056 21.99 14.717 22 12 22C9.283 22 8.944 21.99 7.878 21.94C6.886 21.89 6.348 21.73 5.989 21.59C5.513 21.4 5.173 21.18 4.814 20.82C4.455 20.46 4.236 20.12 4.046 19.65C3.907 19.29 3.741 18.75 3.695 17.76C3.646 16.69 3.636 16.36 3.636 13.64V10.36C3.636 7.64 3.646 7.31 3.695 6.24C3.741 5.25 3.907 4.71 4.046 4.35C4.236 3.88 4.455 3.54 4.814 3.18C5.173 2.82 5.513 2.6 5.989 2.41C6.348 2.27 6.886 2.11 7.878 2.06C8.944 2.01 9.283 2 12 2ZM12 6.864C8.28 6.864 5.273 9.87 5.273 13.59C5.273 17.31 8.28 20.316 12 20.316C15.72 20.316 18.727 17.31 18.727 13.59C18.727 9.87 15.72 6.864 12 6.864ZM12 8.455C14.836 8.455 17.136 10.755 17.136 13.59C17.136 16.425 14.836 18.725 12 18.725C9.164 18.725 6.864 16.425 6.864 13.59C6.864 10.755 9.164 8.455 12 8.455ZM17.13 5.485C16.57 5.485 16.11 5.945 16.11 6.505C16.11 7.065 16.57 7.525 17.13 7.525C17.69 7.525 18.15 7.065 18.15 6.505C18.15 5.945 17.69 5.485 17.13 5.485Z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M21.543 6.498C22 8.28 22 12 22 12C22 12 22 15.72 21.543 17.502C21.289 18.502 20.502 19.289 19.502 19.543C17.72 20 12 20 12 20C12 20 6.28 20 4.498 19.543C3.498 19.289 2.711 18.502 2.457 17.502C2 15.72 2 12 2 12C2 12 2 8.28 2.457 6.498C2.711 5.498 3.498 4.711 4.498 4.457C6.28 4 12 4 12 4C12 4 17.72 4 19.502 4.457C20.502 4.711 21.289 5.498 21.543 6.498ZM9.8 15.5L15.2 12L9.8 8.5V15.5Z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16.89 2C16.89 4.39 18.25 6.46 20.22 7.5V10.74C19.14 10.74 18.1 10.42 17.22 9.85V16.29C17.22 19.44 14.66 22 11.51 22C8.36 22 5.8 19.44 5.8 16.29C5.8 13.14 8.36 10.58 11.51 10.58C12.11 10.58 12.69 10.67 13.24 10.84V14.15C12.7 13.98 12.12 13.88 11.51 13.88C10.18 13.88 9.1 14.96 9.1 16.29C9.1 17.62 10.18 18.7 11.51 18.7C12.84 18.7 13.92 17.62 13.92 16.29V2H16.89Z"/></svg>',
  reddit: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M22 11.5C22 10.12 20.88 9 19.5 9C19.06 9 18.66 9.11 18.3 9.3C16.71 8.16 14.54 7.42 12.15 7.34L13.11 2.82L16.22 3.48C16.27 4.32 16.97 5 17.83 5C18.75 5 19.5 4.25 19.5 3.33C19.5 2.41 18.75 1.66 17.83 1.66C17.07 1.66 16.42 2.17 16.23 2.87L12.73 2.13C12.57 2.1 12.41 2.19 12.37 2.35L11.27 7.33C8.84 7.38 6.64 8.13 5.03 9.29C4.67 9.11 4.25 9 3.81 9C2.43 9 1.31 10.12 1.31 11.5C1.31 12.44 1.83 13.26 2.6 13.68C2.53 14.12 2.5 14.56 2.5 15C2.5 18.58 6.75 21.5 12 21.5C17.25 21.5 21.5 18.58 21.5 15C21.5 14.56 21.47 14.12 21.4 13.68C22.17 13.26 22.69 12.44 22.69 11.5H22ZM7.83 12.67C8.5 12.67 9.04 13.21 9.04 13.88C9.04 14.55 8.5 15.09 7.83 15.09C7.16 15.09 6.62 14.55 6.62 13.88C6.62 13.21 7.16 12.67 7.83 12.67ZM15.83 16.92C14.73 17.92 12.92 18.06 12.02 18.06C11.12 18.06 9.31 17.92 8.21 16.92C8.03 16.74 8.03 16.46 8.21 16.28C8.39 16.1 8.67 16.1 8.85 16.28C9.66 17.02 10.98 17.15 12.02 17.15C13.06 17.15 14.38 17.02 15.19 16.28C15.37 16.1 15.65 16.1 15.83 16.28C16.01 16.46 16.01 16.74 15.83 16.92ZM16.21 15.09C15.54 15.09 15 14.55 15 13.88C15 13.21 15.54 12.67 16.21 12.67C16.88 12.67 17.42 13.21 17.42 13.88C17.42 14.55 16.88 15.09 16.21 15.09Z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M18.3638 15.5355L16.9496 14.1213L18.3638 12.7071C20.3164 10.7545 20.3164 7.58866 18.3638 5.63604C16.4112 3.68341 13.2453 3.68341 11.2927 5.63604L9.87849 7.05025L8.46428 5.63604L9.87849 4.22182C12.6122 1.48815 17.0443 1.48815 19.778 4.22182C22.5117 6.95549 22.5117 11.3876 19.778 14.1213L18.3638 15.5355ZM15.5353 18.364L14.1211 19.7782C11.3875 22.5118 6.95531 22.5118 4.22164 19.7782C1.48797 17.0445 1.48797 12.6123 4.22164 9.87868L5.63585 8.46446L7.05007 9.87868L5.63585 11.2929C3.68323 13.2455 3.68323 16.4113 5.63585 18.364C7.58847 20.3166 10.7543 20.3166 12.7069 18.364L14.1211 16.9497L15.5353 18.364ZM14.8282 7.75736L16.2425 9.17157L9.17139 16.2426L7.75717 14.8284L14.8282 7.75736Z"/></svg>',
};

const PRESET_ICON_NAMES: Record<string, string> = {
  mail: '邮箱',
  phone: '电话',
  address: '地址',
  wechat: '微信',
  qq: 'QQ 社交',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  discord: 'Discord',
  twitter: 'Twitter / X',
  linkedin: 'LinkedIn',
  skype: 'Skype',
  messenger: 'Messenger',
  github: 'GitHub',
  slack: 'Slack',
  line: 'Line',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  link: '网址链接'
};

const { Text, Title } = Typography;
const { TextArea } = Input;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 8 }}>
          <Title level={5} style={{ color: '#ff4d4f', marginTop: 0 }}>配置面板加载失败</Title>
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            渲染该配置栏目时发生运行时错误。这通常是由于旧配置数据结构不兼容导致的，您可以点击下方按钮重试，或联系管理员排查。
          </Text>
          <pre style={{
            background: '#fafafa',
            padding: 12,
            borderRadius: 5,
            border: '1px solid rgba(0,0,0,0.06)',
            color: '#ff4d4f',
            fontFamily: 'monospace',
            fontSize: 12,
            overflowX: 'auto',
            maxHeight: 250
          }}>
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
          <Button size="small" type="primary" danger onClick={() => this.setState({ hasError: false, error: null })}>
            重试
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

if (typeof document !== 'undefined') {
  const styleId = 'ri-icon-preview-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerText = `.ri-icon-preview svg { width: 14px; height: 14px; display: block; fill: currentColor; }`;
    document.head.appendChild(style);
  }
}

const IconPreview: React.FC<{ svg: string }> = ({ svg }) => {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        lineHeight: 1,
        color: 'inherit'
      }}
      className="ri-icon-preview"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

const DEMO_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI 模型聚合 API 平台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        .gradient-text { background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    </style>
</head>
<body class="bg-gray-50 text-gray-900">
    <nav class="bg-white shadow-sm sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16 items-center">
                <div class="flex-shrink-0 flex items-center gap-2">
                    <svg class="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    <span class="font-bold text-xl">API Hub</span>
                </div>
                <div class="hidden md:flex space-x-8">
                    <a href="#features" class="text-gray-600 hover:text-blue-600">产品优势</a>
                    <a href="#pricing" class="text-gray-600 hover:text-blue-600">计费方式</a>
                    <a href="#docs" class="text-gray-600 hover:text-blue-600">开发文档</a>
                </div>
                <div>
                    <a href="/login" class="text-gray-600 hover:text-blue-600 mr-4">登录</a>
                    <a href="/register" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">免费注册</a>
                </div>
            </div>
        </div>
    </nav>

    <main>
        <!-- Hero Section -->
        <div class="relative bg-white overflow-hidden">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
                <h1 class="text-5xl font-extrabold tracking-tight mb-6">
                    一个接口，连接 <span class="bg-gradient-to-r from-blue-600 to-purple-600 gradient-text">全球顶尖 AI 模型</span>
                </h1>
                <p class="mt-4 max-w-2xl text-xl text-gray-500 mx-auto">
                    完全兼容 OpenAI 格式。只需修改一行代码，即可无缝接入 GPT-4、Claude 3.5、Gemini 1.5 等上百种大语言模型。
                </p>
                <div class="mt-10 flex justify-center gap-4">
                    <a href="/register" class="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-lg shadow-blue-200">开始使用</a>
                    <a href="#docs" class="px-8 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition">查看文档</a>
                </div>
            </div>
        </div>

        <!-- Features -->
        <div id="features" class="py-20 bg-gray-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-3xl font-bold text-gray-900">为什么选择我们？</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div class="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                        <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-6">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        </div>
                        <h3 class="text-xl font-bold mb-3">极速响应</h3>
                        <p class="text-gray-600">全球分布式节点，智能路由加速，提供毫秒级首字响应体验。</p>
                    </div>
                    <div class="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                        <div class="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-6">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                        </div>
                        <h3 class="text-xl font-bold mb-3">安全可靠</h3>
                        <p class="text-gray-600">高可用架构设计，自动容灾重试。数据端到端加密，绝不保留隐私信息。</p>
                    </div>
                    <div class="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                        <div class="w-12 h-12 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-6">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                        <h3 class="text-xl font-bold mb-3">按量计费</h3>
                        <p class="text-gray-600">透明定价，无隐形消费。支持多种支付方式，低门槛轻松开始。</p>
                    </div>
                </div>
            </div>
        </div>
    </main>

    <footer class="bg-white border-t border-gray-200 py-12">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500">
            <p>&copy; 2026 API Hub. All rights reserved.</p>
        </div>
    </footer>
</body>
</html>`;

type MenuKey = 'custom_homepage' | 'nav' | 'home' | 'col_models' | 'col_contact' | 'col_about' | 'static_gen' | 'other' | 'footer';

const PortalManager: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuKey>('nav');
  const [saveCooldowns, setSaveCooldowns] = useState<Record<string, number>>({});
  // Config states
  const [navConfig, setNavConfig] = useState<any>({});
  const [homeConfig, setHomeConfig] = useState<any>({});
  const [columnsConfig, setColumnsConfig] = useState<any>({});
  const [footerConfig, setFooterConfig] = useState<any>({});
  const [customScripts, setCustomScripts] = useState<any>({});
  const [seoConfig, setSeoConfig] = useState<any>({});
  const [staticGenConfig, setStaticGenConfig] = useState<any>({ manual_mode: false });
  const [generateLog, setGenerateLog] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<{ label: string; path: string }[]>([]);
  const [customHomepage, setCustomHomepage] = useState<any>({ enabled: false, html: '' });

  useEffect(() => { fetchConfig(); }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSaveCooldowns(prev => {
        const next = { ...prev };
        let changed = false;
        for (const key in next) {
          if (next[key] > 0) {
            next[key] -= 1;
            changed = true;
          } else {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins/site-portal/portal-config') as Promise<any>);
      if (res.nav_config) setNavConfig(res.nav_config);
      if (res.home_config) setHomeConfig(res.home_config);
      if (res.columns_config) setColumnsConfig(res.columns_config);
      if (res.footer_config) setFooterConfig(res.footer_config);
      if (res.custom_scripts) setCustomScripts(res.custom_scripts);
      if (res.seo_config) setSeoConfig(res.seo_config);
      if (res.static_gen_config) setStaticGenConfig(res.static_gen_config);
      if (res.generate_log) setGenerateLog(res.generate_log);
      if (res.custom_homepage) {
        setCustomHomepage(res.custom_homepage);
        if (res.custom_homepage.enabled) {
          setActiveMenu('custom_homepage');
        }
      }
    } catch (e) {
      message.error('加载门户配置失败');
    } finally {
      setLoading(false);
    }
  };
  const handleSave = async (section: string, data: any) => {
    if (saveCooldowns[section]) return;
    try {
      setSaving(true);
      await request.post('/plugins/site-portal/portal-config', { section, data });
      setSaveCooldowns(prev => ({ ...prev, [section]: 3 }));
      message.success('配置已保存');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllNav = async () => {
    if (saveCooldowns['nav']) return;
    try {
      setSaving(true);
      await request.post('/plugins/site-portal/portal-config', { section: 'nav', data: navConfig });
      await request.post('/plugins/site-portal/portal-config', { section: 'seo', data: seoConfig });
      setSaveCooldowns(prev => ({ ...prev, 'nav': 3 }));
      message.success('导航配置已保存');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (scope: string, columns?: string[]) => {
    try {
      setGenerating(true);
      setGeneratedLinks([]);
      const res = await (request.post('/plugins/site-portal/generate', { scope, columns }) as Promise<any>);
      message.success(res.message || '生成完成');
      // 构建快捷链接
      if (res.generated_paths && Array.isArray(res.generated_paths)) {
        setGeneratedLinks(res.generated_paths);
      }
      fetchConfig();
    } catch (e) {
      message.error('生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = (page = 'home') => {
    // 直接打开动态渲染路由，无需 blob
    const pathMap: Record<string, string> = {
      home: '/home',
      models: '/home/models',
      contact: '/home/contact',
      about: '/home/about',
    };
    const url = pathMap[page] || '/home';
    window.open(url, '_blank');
  };

  const cardStyle = {
    background: _isLight ? '#fff' : '#141414',
    borderRadius: 8,
    border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
    padding: '20px',
    marginBottom: 16,
  };

  const labelStyle = { color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block' as const, marginBottom: 6 };

  // ─── Left Menu ───
  const allMenuItems: { key: string; icon?: React.ReactNode; label: string; isTitle?: boolean; isSub?: boolean }[] = [
    { key: 'custom_homepage', icon: <FileCode size={16} strokeWidth={1.5} />, label: '自定义主页' },
    { key: 'nav', icon: <LayoutDashboard size={16} strokeWidth={1.5} />, label: '导航管理' },
    { key: 'footer', icon: <PanelBottom size={16} strokeWidth={1.5} />, label: '底部管理' },
    { key: 'home', icon: <Globe size={16} strokeWidth={1.5} />, label: '首页管理' },
    { key: 'col_title', icon: <TagIcon size={16} strokeWidth={1.5} />, label: '栏目管理', isTitle: true },
    { key: 'col_models', label: '模型数据', isSub: true },
    { key: 'col_contact', label: '联系我们', isSub: true },
    { key: 'col_about', label: '关于我们', isSub: true },
    { key: 'static_gen', icon: <Code size={16} strokeWidth={1.5} />, label: '静态生成' },
    { key: 'other', icon: <ShieldCheck size={16} strokeWidth={1.5} />, label: '其他配置' },
  ];

  // 当自定义主页启用时，隐藏不需要的菜单项
  const hiddenWhenCustom = new Set(['nav', 'footer', 'home', 'col_title', 'col_models', 'col_contact', 'col_about', 'static_gen', 'other']);
  const menuItems = customHomepage.enabled
    ? allMenuItems.filter(item => !hiddenWhenCustom.has(item.key))
    : allMenuItems;

  // ─── Right Panel Content ───

  const renderNav = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>导航管理</Title>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['nav'] || 0) > 0} onClick={handleSaveAllNav}>
          {(saveCooldowns['nav'] || 0) > 0 ? `已保存 (${saveCooldowns['nav']}s)` : '保存导航配置'}
        </Button>
      </div>
      <div style={cardStyle}>
        <Text style={labelStyle}>Logo 图片 URL（留空则只显示文字）</Text>
        <Input value={navConfig.logo_url || ''} onChange={e => setNavConfig({ ...navConfig, logo_url: e.target.value })} placeholder="https://cdn.example.com/logo.png" style={{ marginBottom: 12 }} />
        <Text style={labelStyle}>Logo 点击跳转链接</Text>
        <Input value={navConfig.logo_link || ''} onChange={e => setNavConfig({ ...navConfig, logo_link: e.target.value })} placeholder="例如：/home 或 https://..." style={{ marginBottom: 12 }} />
        <Text style={labelStyle}>Logo 文字</Text>
        <Input value={navConfig.logo_text || ''} onChange={e => setNavConfig({ ...navConfig, logo_text: e.target.value })} placeholder="TokensByte" style={{ marginBottom: 12 }} />
        <Divider style={{ borderColor: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '14px 0' }} />
        <Text style={labelStyle}>登录按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <Input value={navConfig.cta_text || '登录'} onChange={e => setNavConfig({ ...navConfig, cta_text: e.target.value })} />
          <Input value={navConfig.cta_link || '/login'} onChange={e => setNavConfig({ ...navConfig, cta_link: e.target.value })} />
        </div>
        <Text style={labelStyle}>注册按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Input value={navConfig.register_text || '注册'} onChange={e => setNavConfig({ ...navConfig, register_text: e.target.value })} />
          <Input value={navConfig.register_link || '/register'} onChange={e => setNavConfig({ ...navConfig, register_link: e.target.value })} />
        </div>
      </div>

      {/* 顶部导航菜单 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>顶部导航菜单</Text>
          <Button size="small" icon={<PlusOutlined />} onClick={() => {
            const items = [...(navConfig.items || []), { label: '新栏目|New', path: '/home/new', enabled: true, key: `item_${Date.now()}` }];
            setNavConfig({ ...navConfig, items });
          }}>添加栏目</Button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>💡 提示：支持中英双语无缝切换，名称填写格式为 <Text code>中文|English</Text>（如 <Text code>帮助中心|Help Center</Text>）。</Text>
        </div>
        {(navConfig.items || []).map((item: any, idx: number) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1.5fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Switch
              size="small"
              checked={item.enabled !== false}
              onChange={v => {
                const items = [...navConfig.items];
                items[idx] = { ...item, enabled: v };
                setNavConfig({ ...navConfig, items });
              }}
            />
            <Input
              value={item.label}
              onChange={e => {
                const items = [...navConfig.items];
                items[idx] = { ...item, label: e.target.value };
                setNavConfig({ ...navConfig, items });
              }}
              placeholder="栏目名称 (如: 首页)"
            />
            <Input
              value={item.path}
              onChange={e => {
                const items = [...navConfig.items];
                items[idx] = { ...item, path: e.target.value };
                setNavConfig({ ...navConfig, items });
              }}
              placeholder="链接路径 (如: /home)"
            />
            <Input
              value={item.icon || ''}
              onChange={e => {
                const items = [...navConfig.items];
                items[idx] = { ...item, icon: e.target.value };
                setNavConfig({ ...navConfig, items });
              }}
              placeholder="图标 SVG (如: <svg>...</svg>)"
            />
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                const items = navConfig.items.filter((_: any, i: number) => i !== idx);
                setNavConfig({ ...navConfig, items });
              }}
            />
          </div>
        ))}
        {(!navConfig.items || navConfig.items.length === 0) && (
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 13 }}>暂无导航菜单，点击添加</Text>
        )}
      </div>
      {/* SEO */}
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>SEO 元信息</Text>
        <Text style={labelStyle}>页面标题 (meta title)</Text>
        <Input value={seoConfig.meta_title || ''} onChange={e => setSeoConfig({ ...seoConfig, meta_title: e.target.value })} placeholder="站点标题" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>页面描述 (meta description)</Text>
        <Input value={seoConfig.meta_description || ''} onChange={e => setSeoConfig({ ...seoConfig, meta_description: e.target.value })} placeholder="站点描述" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>关键词 (meta keywords)</Text>
        <Input value={seoConfig.meta_keywords || ''} onChange={e => setSeoConfig({ ...seoConfig, meta_keywords: e.target.value })} placeholder="AI, API, 模型" />
      </div>
    </div>
  );

  const renderFooter = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>底部管理</Title>
        <Space>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['footer'] || 0) > 0} onClick={() => handleSave('footer', footerConfig)}>
            {(saveCooldowns['footer'] || 0) > 0 ? `已保存 (${saveCooldowns['footer']}s)` : '保存'}
          </Button>
        </Space>
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>Footer 配置</Text>
        <Text style={labelStyle}>版权信息</Text>
        <Input value={footerConfig.copyright || ''} onChange={e => setFooterConfig({ ...footerConfig, copyright: e.target.value })} placeholder="公司名称" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>备案号</Text>
        <Input value={footerConfig.icp_number || ''} onChange={e => setFooterConfig({ ...footerConfig, icp_number: e.target.value })} placeholder="京ICP备xxxxxxxx号" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>文字描述</Text>
        <Input.TextArea value={footerConfig.description || ''} onChange={e => setFooterConfig({ ...footerConfig, description: e.target.value })} placeholder="例如：OpenAI 兼容格式，极速接入主流模型。按量付费，零门槛开始。" rows={3} />
      </div>
    </div>
  );

  const renderHome = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>首页管理</Title>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['home'] || 0) > 0} onClick={() => handleSave('home', homeConfig)}>
          {(saveCooldowns['home'] || 0) > 0 ? `已保存 (${saveCooldowns['home']}s)` : '保存'}
        </Button>
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>Hero 区域</Text>
        <Text style={labelStyle}>主标题</Text>
        <Input value={homeConfig.hero_title || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_title: e.target.value })} style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>副标题</Text>
        <Input value={homeConfig.hero_subtitle || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_subtitle: e.target.value })} style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>背景图 URL</Text>
        <Input value={homeConfig.hero_bg_image || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_bg_image: e.target.value })} placeholder="https://..." style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>CTA 按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Input value={homeConfig.hero_cta_text || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_cta_text: e.target.value })} placeholder="立即体验" />
          <Input value={homeConfig.hero_cta_link || ''} onChange={e => setHomeConfig({ ...homeConfig, hero_cta_link: e.target.value })} placeholder="/register" />
        </div>
        <Text style={labelStyle}>API Base URL (展示地址)</Text>
        <Input value={homeConfig.api_base_url || ''} onChange={e => setHomeConfig({ ...homeConfig, api_base_url: e.target.value })} placeholder="例如：https://api.tokensbyte.com/v1 (留空默认使用当前域名/v1)" style={{ marginBottom: 8 }} />
      </div>
      {/* Features */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>特性卡片</Text>
          <Space>
            <Button size="small" type="dashed" onClick={() => {
              const presetFeatures = [
                {
                  icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>',
                  title: '一键极速接入',
                  description: 'OpenAI 兼容 API 格式，只需修改 Base URL 和 Key，即可无缝替换至数百个主流模型，零代码成本迁移。'
                },
                {
                  icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
                  title: '全球模型全面覆盖',
                  description: '聚合 OpenAI、Anthropic、Google Gemini、DeepSeek、字节跳动火山引擎等数十家顶级服务商的模型矩阵。'
                },
                {
                  icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4z"/></svg>',
                  title: '智能分流与高可用',
                  description: '全球边缘节点路由，支持在主渠道高负载或故障时自动无感容灾重试，首字耗时降至毫秒级。'
                },
                {
                  icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
                  title: '极致安全数据脱敏',
                  description: '支持 IP 白名单防刷保护，端到端高强度加密传输，异步任务与计费明细日志支持 Base64 数据隐私脱敏。'
                }
              ];
              setHomeConfig({ ...homeConfig, features: presetFeatures });
            }}>加载推荐预设</Button>
            <Button size="small" icon={<PlusOutlined />} onClick={() => {
              const features = [...(homeConfig.features || []), { icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4z"/></svg>', title: '新特性', description: '描述' }];
              setHomeConfig({ ...homeConfig, features });
            }}>添加</Button>
          </Space>
        </div>
        {(homeConfig.features || []).map((feat: any, idx: number) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Input value={feat.icon} onChange={e => {
              const features = [...homeConfig.features];
              features[idx] = { ...feat, icon: e.target.value };
              setHomeConfig({ ...homeConfig, features });
            }} placeholder="图标" />
            <Input value={feat.title} onChange={e => {
              const features = [...homeConfig.features];
              features[idx] = { ...feat, title: e.target.value };
              setHomeConfig({ ...homeConfig, features });
            }} placeholder="标题" />
            <Input value={feat.description} onChange={e => {
              const features = [...homeConfig.features];
              features[idx] = { ...feat, description: e.target.value };
              setHomeConfig({ ...homeConfig, features });
            }} placeholder="描述" />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
              const features = homeConfig.features.filter((_: any, i: number) => i !== idx);
              setHomeConfig({ ...homeConfig, features });
            }} />
          </div>
        ))}
        {(!homeConfig.features || homeConfig.features.length === 0) && (
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 13 }}>暂无特性卡片，点击添加</Text>
        )}
      </div>

      {/* CTA Banner 区域 */}
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>CTA Banner 区域</Text>
        <Text style={labelStyle}>标题</Text>
        <Input value={homeConfig.cta_title || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_title: e.target.value })} placeholder="例如：准备好开始构建了吗？" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>描述文本</Text>
        <TextArea rows={3} value={homeConfig.cta_description || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_description: e.target.value })} placeholder="例如：只需 3 分钟即可获取 API 密钥..." style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>主按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Input value={homeConfig.cta_primary_btn_text || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_primary_btn_text: e.target.value })} placeholder="开始对话" />
          <Input value={homeConfig.cta_primary_btn_link || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_primary_btn_link: e.target.value })} placeholder="/login" />
        </div>
        <Text style={labelStyle}>次按钮文字 / 链接</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Input value={homeConfig.cta_secondary_btn_text || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_secondary_btn_text: e.target.value })} placeholder="阅读文档" />
          <Input value={homeConfig.cta_secondary_btn_link || ''} onChange={e => setHomeConfig({ ...homeConfig, cta_secondary_btn_link: e.target.value })} placeholder="/docs" />
        </div>
      </div>
    </div>
  );

  const updateCol = (key: string, field: string, value: any) => {
    const cols = columnsConfig || {};
    const updated = { ...cols, [key]: { ...cols[key], [field]: value } };
    setColumnsConfig(updated);
  };
  const updateColContent = (key: string, field: string, value: any) => {
    const cols = columnsConfig || {};
    const content = { ...(cols[key]?.content || {}), [field]: value };
    updateCol(key, 'content', content);
  };

  const renderColSeo = (colKey: string) => {
    const cols = columnsConfig || {};
    return (
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: _isLight ? '1px dashed rgba(0,0,0,0.06)' : '1px dashed rgba(255,255,255,0.06)' }}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, display: 'block', marginBottom: 12 }}>页面名称设置</Text>
        <Text style={labelStyle}>页面标题 (meta title)</Text>
        <Input value={cols[colKey]?.seo_title || ''} onChange={e => updateCol(colKey, 'seo_title', e.target.value)} placeholder="留空则使用导航配置的标题" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>页面描述 (meta description)</Text>
        <Input value={cols[colKey]?.seo_description || ''} onChange={e => updateCol(colKey, 'seo_description', e.target.value)} placeholder="留空则使用导航配置的描述" style={{ marginBottom: 8 }} />
        <Text style={labelStyle}>关键词 (meta keywords)</Text>
        <Input value={cols[colKey]?.seo_keywords || ''} onChange={e => updateCol(colKey, 'seo_keywords', e.target.value)} placeholder="留空则使用导航配置的关键词" />
      </div>
    );
  };

  const renderColModels = () => {
    const cols = columnsConfig || {};
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>模型数据</Title>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['columns'] || 0) > 0} onClick={() => handleSave('columns', columnsConfig)}>
            {(saveCooldowns['columns'] || 0) > 0 ? `已保存 (${saveCooldowns['columns']}s)` : '保存'}
          </Button>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Code size={20} strokeWidth={1.5} />
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>模型数据</Text>
              <Tag color={cols.models?.enabled !== false ? 'success' : 'default'} style={{ margin: 0 }}>{cols.models?.enabled !== false ? '已启用' : '已关闭'}</Tag>
            </div>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview('models')}>预览</Button>
              <Switch size="small" checked={cols.models?.enabled !== false} onChange={v => updateCol('models', 'enabled', v)} />
            </Space>
          </div>
          <Text style={labelStyle}>中文标题</Text>
          <Input value={cols.models?.title || '模型数据'} onChange={e => updateCol('models', 'title', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>英文路径（URL slug，如 models）</Text>
          <Input value={cols.models?.path || 'models'} onChange={e => updateCol('models', 'path', e.target.value)} addonBefore="/home/" placeholder="models" style={{ marginBottom: 8 }} />
          <Text style={{ ...labelStyle, marginTop: 4, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            数据自动从系统模型表拉取已启用的模型进行展示
          </Text>
          {renderColSeo('models')}
        </div>
      </div>
    );
  };

  const renderColContact = () => {
    const cols = columnsConfig || {};

    // 如果没有 items 但是有旧的 email/phone/address，自动升迁为 items
    if (cols.contact?.content && !cols.contact.content.items && (cols.contact.content.email || cols.contact.content.phone || cols.contact.content.address)) {
      const items: any[] = [];
      if (cols.contact.content.email) {
        items.push({
          icon: PRESET_ICONS.mail,
          title: '邮箱',
          value: cols.contact.content.email
        });
      }
      if (cols.contact.content.phone) {
        items.push({
          icon: PRESET_ICONS.phone,
          title: '电话',
          value: cols.contact.content.phone
        });
      }
      if (cols.contact.content.address) {
        items.push({
          icon: PRESET_ICONS.address,
          title: '地址',
          value: cols.contact.content.address
        });
      }
      setTimeout(() => {
        const content = {
          ...cols.contact.content,
          items,
          email: '',
          phone: '',
          address: ''
        };
        updateCol('contact', 'content', content);
      }, 0);
    }

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>联系我们</Title>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['columns'] || 0) > 0} onClick={() => handleSave('columns', columnsConfig)}>
            {(saveCooldowns['columns'] || 0) > 0 ? `已保存 (${saveCooldowns['columns']}s)` : '保存'}
          </Button>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Landmark size={20} strokeWidth={1.5} />
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>联系我们</Text>
              <Tag color={cols.contact?.enabled !== false ? 'success' : 'default'} style={{ margin: 0 }}>{cols.contact?.enabled !== false ? '已启用' : '已关闭'}</Tag>
            </div>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview('contact')}>预览</Button>
              <Switch size="small" checked={cols.contact?.enabled !== false} onChange={v => updateCol('contact', 'enabled', v)} />
            </Space>
          </div>
          <Text style={labelStyle}>中文标题</Text>
          <Input value={cols.contact?.title || '联系我们'} onChange={e => updateCol('contact', 'title', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>英文路径（URL slug，如 contact）</Text>
          <Input value={cols.contact?.path || 'contact'} onChange={e => updateCol('contact', 'path', e.target.value)} addonBefore="/home/" placeholder="contact" style={{ marginBottom: 8 }} />
          {renderColSeo('contact')}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 12 }}>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13 }}>联系方式项</Text>
            <Space>
              <Button size="small" type="dashed" onClick={() => {
                const defaultItems = [
                  {
                    icon: PRESET_ICONS.mail,
                    title: '邮箱',
                    value: 'bubyday@qq.com'
                  },
                  {
                    icon: PRESET_ICONS.phone,
                    title: '电话',
                    value: '1388888888'
                  },
                  {
                    icon: PRESET_ICONS.address,
                    title: '地址',
                    value: '深圳市南山区'
                  }
                ];
                updateColContent('contact', 'items', defaultItems);
              }}>加载默认预设</Button>
              <Button size="small" icon={<PlusOutlined />} onClick={() => {
                const items = [...(cols.contact?.content?.items || []), { icon: PRESET_ICONS.mail, title: '自定义', value: '' }];
                updateColContent('contact', 'items', items);
              }}>添加渠道</Button>
            </Space>
          </div>
          {(Array.isArray(cols.contact?.content?.items) ? cols.contact.content.items : []).map((item: any, idx: number) => {
            if (!item) return null;
            const matchedKey = Object.keys(PRESET_ICONS).find(k => PRESET_ICONS[k] === item.icon) || 'custom';
            return (
              <div key={idx} style={{ marginBottom: 12, padding: 12, border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 100px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <Select
                    value={matchedKey}
                    onChange={val => {
                      const items = [...(cols.contact?.content?.items || [])];
                      const newTitle = PRESET_ICON_NAMES[val] || '自定义';
                      const isTitleEmptyOrPreset = !item.title || 
                        item.title === '自定义' || 
                        Object.values(PRESET_ICON_NAMES).includes(item.title);
                      
                      const titleToUse = isTitleEmptyOrPreset ? newTitle : item.title;
                      
                      if (val === 'custom') {
                        items[idx] = { ...item, icon: '', title: titleToUse };
                      } else {
                        items[idx] = { ...item, icon: PRESET_ICONS[val], title: titleToUse };
                      }
                      updateColContent('contact', 'items', items);
                    }}
                    options={[
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.mail} /><span style={{ fontSize: 13 }}>邮箱</span></Space>, value: 'mail' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.phone} /><span style={{ fontSize: 13 }}>电话</span></Space>, value: 'phone' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.address} /><span style={{ fontSize: 13 }}>地址</span></Space>, value: 'address' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.wechat} /><span style={{ fontSize: 13 }}>微信</span></Space>, value: 'wechat' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.qq} /><span style={{ fontSize: 13 }}>QQ 社交</span></Space>, value: 'qq' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.telegram} /><span style={{ fontSize: 13 }}>Telegram</span></Space>, value: 'telegram' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.whatsapp} /><span style={{ fontSize: 13 }}>WhatsApp</span></Space>, value: 'whatsapp' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.discord} /><span style={{ fontSize: 13 }}>Discord</span></Space>, value: 'discord' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.twitter} /><span style={{ fontSize: 13 }}>Twitter / X</span></Space>, value: 'twitter' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.linkedin} /><span style={{ fontSize: 13 }}>LinkedIn</span></Space>, value: 'linkedin' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.skype} /><span style={{ fontSize: 13 }}>Skype</span></Space>, value: 'skype' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.messenger} /><span style={{ fontSize: 13 }}>Messenger</span></Space>, value: 'messenger' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.github} /><span style={{ fontSize: 13 }}>GitHub</span></Space>, value: 'github' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.slack} /><span style={{ fontSize: 13 }}>Slack</span></Space>, value: 'slack' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.line} /><span style={{ fontSize: 13 }}>Line</span></Space>, value: 'line' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.facebook} /><span style={{ fontSize: 13 }}>Facebook</span></Space>, value: 'facebook' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.instagram} /><span style={{ fontSize: 13 }}>Instagram</span></Space>, value: 'instagram' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.youtube} /><span style={{ fontSize: 13 }}>YouTube</span></Space>, value: 'youtube' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.tiktok} /><span style={{ fontSize: 13 }}>TikTok</span></Space>, value: 'tiktok' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.reddit} /><span style={{ fontSize: 13 }}>Reddit</span></Space>, value: 'reddit' },
                      { label: <Space size={6}><IconPreview svg={PRESET_ICONS.link} /><span style={{ fontSize: 13 }}>网址链接</span></Space>, value: 'link' },
                      { label: <Space size={6}><Code size={14} strokeWidth={1.5} /><span style={{ fontSize: 13 }}>自定义 SVG</span></Space>, value: 'custom' },
                    ]}
                  />
                  <Input value={item.title || ''} onChange={e => {
                    const items = [...(cols.contact?.content?.items || [])];
                    items[idx] = { ...item, title: e.target.value };
                    updateColContent('contact', 'items', items);
                  }} placeholder="渠道名称" />
                  <Input value={item.value || ''} onChange={e => {
                    const items = [...(cols.contact?.content?.items || [])];
                    items[idx] = { ...item, value: e.target.value };
                    updateColContent('contact', 'items', items);
                  }} placeholder="具体内容" />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
                    const items = (cols.contact?.content?.items || []).filter((_: any, i: number) => i !== idx);
                    updateColContent('contact', 'items', items);
                  }} />
                </div>
                {matchedKey === 'custom' && (
                  <div style={{ marginTop: 8 }}>
                    <Input.TextArea
                      rows={2}
                      value={item.icon || ''}
                      onChange={e => {
                        const items = [...(cols.contact?.content?.items || [])];
                        items[idx] = { ...item, icon: e.target.value };
                        updateColContent('contact', 'items', items);
                      }}
                      placeholder="请输入自定义 Lucide 线框或其它标准的 SVG 代码..."
                      style={{ fontSize: 12 }}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {(!cols.contact?.content?.items || cols.contact.content.items.length === 0) && (
            <div style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 13, marginBottom: 12 }}>
              暂无自定义联系渠道，点击上方“加载默认预设”或“添加渠道”开始配置。
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: _isLight ? '1px dashed rgba(0,0,0,0.06)' : '1px dashed rgba(255,255,255,0.06)' }}>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, display: 'block', marginBottom: 12 }}>内容编辑</Text>
            <div style={{ marginBottom: 12 }}>
              <TipTapEditor
                value={cols.contact?.content?.custom_content || ''}
                onChange={val => updateColContent('contact', 'custom_content', val)}
                placeholder="输入联系我们的富文本内容..."
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderColAbout = () => {
    const cols = columnsConfig || {};
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>关于我们</Title>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['columns'] || 0) > 0} onClick={() => handleSave('columns', columnsConfig)}>
            {(saveCooldowns['columns'] || 0) > 0 ? `已保存 (${saveCooldowns['columns']}s)` : '保存'}
          </Button>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlaskConical size={20} strokeWidth={1.5} />
              <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>关于我们</Text>
              <Tag color={cols.about?.enabled !== false ? 'success' : 'default'} style={{ margin: 0 }}>{cols.about?.enabled !== false ? '已启用' : '已关闭'}</Tag>
            </div>
            <Space>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview('about')}>预览</Button>
              <Switch size="small" checked={cols.about?.enabled !== false} onChange={v => updateCol('about', 'enabled', v)} />
            </Space>
          </div>
          <Text style={labelStyle}>中文标题</Text>
          <Input value={cols.about?.title || '关于我们'} onChange={e => updateCol('about', 'title', e.target.value)} style={{ marginBottom: 8 }} />
          <Text style={labelStyle}>英文路径（URL slug，如 about）</Text>
          <Input value={cols.about?.path || 'about'} onChange={e => updateCol('about', 'path', e.target.value)} addonBefore="/home/" placeholder="about" style={{ marginBottom: 8 }} />
          {renderColSeo('about')}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: _isLight ? '1px dashed rgba(0,0,0,0.06)' : '1px dashed rgba(255,255,255,0.06)' }}>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, display: 'block', marginBottom: 12 }}>内容编辑</Text>
            <div style={{ marginBottom: 12 }}>
              <TipTapEditor
                value={cols.about?.content || ''}
                onChange={val => updateCol('about', 'content', val)}
                placeholder="输入关于我们的富文本内容..."
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleCopyLink = (path: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      message.success('链接已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  const renderStaticGen = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>静态 HTML 生成</Title>
      </div>
      <Alert type="info" showIcon message="生成后的静态 HTML 文件将部署到 /portal 路径，便于搜索引擎抓取和 SEO/GEO 优化" style={{ marginBottom: 16 }} />

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 4 }}>手动静态 HTML 生成模式</Text>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }}>
              默认关闭。在关闭状态下，每次修改配置并保存后，后台均会自动实时生成前台 HTML 页面，无需手动生成。
            </Text>
          </div>
          <Switch 
            checked={staticGenConfig.manual_mode === true} 
            onChange={async (checked) => {
              const newConfig = { manual_mode: checked };
              setStaticGenConfig(newConfig);
              try {
                await request.post('/plugins/site-portal/portal-config', { section: 'static_gen', data: newConfig });
                message.success(checked ? '已开启手动静态 HTML 生成模式' : '已关闭手动模式，转为实时自动更新数据');
                fetchConfig();
              } catch (e) {
                message.error('保存设置失败');
              }
            }}
          />
        </div>
      </div>

      {!staticGenConfig.manual_mode ? (
        <Alert 
          type="success" 
          showIcon 
          message="当前已启用「实时更新模式」（手动静态生成模式已关闭），您在后台保存任何修改，系统都会在后台自动实时生成前台静态页面，无需在此手动点击。" 
          style={{ marginBottom: 16 }} 
        />
      ) : (
        <Alert 
          type="warning" 
          showIcon 
          message="当前已启用「手动静态 HTML 生成模式」，您在后台修改配置后，前台页面不会自动更新，需要在此页面手动点击下方的生成按钮来更新静态页面。" 
          style={{ marginBottom: 16 }} 
        />
      )}

      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 16 }}>快捷操作</Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Button disabled={staticGenConfig.manual_mode !== true} icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('home')}>首页更新生成</Button>
          <Button disabled={staticGenConfig.manual_mode !== true} icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('columns', ['models'])}>模型数据更新</Button>
          <Button disabled={staticGenConfig.manual_mode !== true} icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('columns', ['contact'])}>联系我们更新</Button>
          <Button disabled={staticGenConfig.manual_mode !== true} icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('columns', ['about'])}>关于我们更新</Button>
          <Button disabled={staticGenConfig.manual_mode !== true} type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={() => handleGenerate('all')}>门户全部生成</Button>
        </div>
      </div>

      {/* 生成后的快捷链接 */}
      {generatedLinks.length > 0 && (
        <div style={{
          ...cardStyle,
          background: _isLight ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #052e16, #064e3b)',
          border: _isLight ? '1px solid #86efac' : '1px solid #065f46',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <LinkOutlined style={{ color: '#22c55e', fontSize: 16 }} />
            <Text strong style={{ color: _isLight ? '#166534' : '#86efac', fontSize: 14 }}>生成完成 - 快捷访问链接</Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {generatedLinks.map((link, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 6,
                background: _isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="green" style={{ margin: 0 }}>{link.label}</Tag>
                  <a
                    href={link.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#1677ff', fontSize: 13, textDecoration: 'none' }}
                  >
                    {window.location.origin}{link.path}
                  </a>
                </div>
                <Space size={4}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyLink(link.path)}
                    style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}
                  />
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => window.open(link.path, '_blank')}
                  >
                    查看
                  </Button>
                </Space>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 生成日志 */}
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 12 }}>最近生成记录</Text>
        {generateLog.length > 0 ? generateLog.slice(0, 10).map((log: any, idx: number) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: _isLight ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)' }}>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, minWidth: 140 }}>{log.time}</Text>
            <Tag style={{ margin: 0 }}>{log.scope === 'all' ? '全站' : log.scope}</Tag>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>{(log.pages || []).join('、')}</Text>
          </div>
        )) : (
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)', fontSize: 13 }}>暂无生成记录</Text>
        )}
      </div>
    </div>
  );

  const renderOther = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>其他配置</Title>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['scripts'] || 0) > 0} onClick={() => handleSave('scripts', customScripts)}>
          {(saveCooldowns['scripts'] || 0) > 0 ? `已保存 (${saveCooldowns['scripts']}s)` : '保存'}
        </Button>
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 4 }}>客服代码</Text>
        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 8 }}>
          输入的 JS 代码将自动加载到所有门户页面（注入到 &lt;/body&gt; 前）
        </Text>
        <TextArea rows={6} value={customScripts.customer_service || ''} onChange={e => setCustomScripts({ ...customScripts, customer_service: e.target.value })}
          placeholder={'<script>\n// 客服系统 JS 代码\n</script>'} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </div>
      <div style={cardStyle}>
        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block', marginBottom: 4 }}>统计代码</Text>
        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, display: 'block', marginBottom: 8 }}>
          输入的 JS 代码将自动加载到所有门户页面（注入到 &lt;head&gt; 中）
        </Text>
        <TextArea rows={6} value={customScripts.analytics || ''} onChange={e => setCustomScripts({ ...customScripts, analytics: e.target.value })}
          placeholder={'<!-- Google Analytics -->\n<script async src="https://..."></script>'} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </div>
    </div>
  );

  const renderCustomHomepage = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>自定义主页</Title>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={(saveCooldowns['custom_homepage'] || 0) > 0} onClick={() => handleSave('custom_homepage', customHomepage)}>
          {(saveCooldowns['custom_homepage'] || 0) > 0 ? `已保存 (${saveCooldowns['custom_homepage']}s)` : '保存'}
        </Button>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14, display: 'block' }}>启用自定义主页</Text>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }}>
              开启后门户首页将直接渲染您粘贴的 HTML 代码，原有的导航/首页/栏目/底部等配置将不再生效
            </Text>
          </div>
          <Switch
            checked={customHomepage.enabled}
            loading={saving}
            onChange={async v => {
              const newHtml = (v && !customHomepage.html) ? DEMO_HTML : customHomepage.html;
              const newCustomHomepage = { ...customHomepage, enabled: v, html: newHtml };
              setCustomHomepage(newCustomHomepage);
              if (v) {
                setActiveMenu('custom_homepage');
              }
              try {
                setSaving(true);
                await request.post('/plugins/site-portal/portal-config', { section: 'custom_homepage', data: newCustomHomepage });
                message.success(v ? '已开启自定义主页' : '已关闭自定义主页');
              } catch (e) {
                message.error('设置失败');
              } finally {
                setSaving(false);
              }
            }}
          />
        </div>
      </div>

      {customHomepage.enabled && (
        <>
          <Alert
            message="自定义主页已启用"
            description="门户首页将直接显示您粘贴的 HTML 代码。导航管理、首页管理、栏目管理、底部管理等配置将不再生效，但数据会保留，关闭开关即可恢复。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 14 }}>HTML 代码</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12, marginLeft: 8 }}>
                  粘贴完整的 HTML 页面代码（包含 &lt;html&gt;&lt;head&gt;&lt;body&gt; 等标签）
                </Text>
              </div>
              <Button size="small" onClick={() => {
                setCustomHomepage({ ...customHomepage, html: DEMO_HTML });
              }}>恢复默认演示模板</Button>
            </div>
            <TextArea
              rows={20}
              value={customHomepage.html || ''}
              onChange={e => setCustomHomepage({ ...customHomepage, html: e.target.value })}
              placeholder={'<!DOCTYPE html>\n<html lang="zh">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>我的自定义主页</title>\n  <style>\n    /* 您的样式 */\n  </style>\n</head>\n<body>\n  <!-- 您的内容 -->\n</body>\n</html>'}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 12,
                lineHeight: '1.6',
                resize: 'vertical',
                minHeight: 400,
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                💡 提示：您可以使用 AI 生成完整的单页 HTML 代码，然后粘贴到这里。保存后即可通过门户首页查看效果。
              </Text>
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;

  const panels: Record<MenuKey, () => React.ReactNode> = {
    custom_homepage: renderCustomHomepage,
    nav: renderNav,
    footer: renderFooter,
    home: renderHome,
    col_models: renderColModels,
    col_contact: renderColContact,
    col_about: renderColAbout,
    static_gen: renderStaticGen,
    other: renderOther,
  };

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
      {/* Left Sidebar */}
      <div style={{
        width: 180, flexShrink: 0,
        background: _isLight ? '#fff' : '#141414',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: '8px 0', alignSelf: 'flex-start', position: 'sticky', top: 80,
      }}>
        {menuItems.map(item => {
          if (item.isTitle) {
            return (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px 4px 16px', fontSize: 12, fontWeight: 600,
                color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)',
              }}>
                {item.icon}
                {item.label}
              </div>
            );
          }
          return (
            <div
              key={item.key}
              onClick={() => setActiveMenu(item.key as MenuKey)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: `10px 16px 10px ${item.isSub ? '32px' : '16px'}`, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                color: activeMenu === item.key ? '#1677ff' : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'),
                background: activeMenu === item.key ? (_isLight ? 'rgba(22,119,255,0.06)' : 'rgba(22,119,255,0.08)') : 'transparent',
                borderRight: activeMenu === item.key ? '2px solid #1677ff' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {item.icon}
              {item.label}
            </div>
          );
        })}
      </div>

      {/* Right Panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <ErrorBoundary key={activeMenu}>
          {panels[activeMenu]?.()}
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default PortalManager;
