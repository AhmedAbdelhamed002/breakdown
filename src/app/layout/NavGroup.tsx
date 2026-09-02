import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { NavItem, isActivePath } from '../navigation/navItems';

interface NavGroupProps {
  item: NavItem;
  pathname: string;
}

export const NavGroup: React.FC<NavGroupProps> = ({ item, pathname }) => {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = () => setCollapsed(!collapsed);

  return (
    <div className={`nav-group ${collapsed ? 'collapsed' : ''}`}>
      <button className="nav-group-head" onClick={toggle}>
        <div className="dot"></div>
        {item.label}
        <svg
          className="chev"
          viewBox="0 0 24 24"
          style={{ marginLeft: 'auto' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div className="nav-group-body">
        {item.children?.map(child => {
          const active = child.to && isActivePath(pathname, child.to, child.exact);
          return (
            <Link
              key={child.to}
              to={child.to || '#'}
              className={`nav-item ${active ? 'active' : ''}`}
            >
              {child.icon && <span className="icon" dangerouslySetInnerHTML={{ __html: child.icon }} />}
              {child.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};
