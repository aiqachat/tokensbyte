/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import './AgentOrb.css';

interface AgentOrbProps {
  isActive: boolean;
  onClick: () => void;
}

const AgentOrb: React.FC<AgentOrbProps> = ({ isActive, onClick }) => {
  return (
    <div 
      className={`agent-orb-wrapper ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="fluid-ring"></div>
      <div className="orb-center-icon">✧</div>
    </div>
  );
};

export default AgentOrb;
