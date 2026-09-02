import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ActingAsSwitcher } from "@features/financial";
import { SIDE_NAV, TOP_TABS, isActivePath } from "../navigation/navItems";
import { NavGroup } from "./NavGroup";
import { useCurrentUser } from "./useCurrentUser";

/** initials/display-name fallback while the signed-in user is still resolving, or unresolved outside the Power Platform host. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MainLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const activeTab = TOP_TABS.find((tab) => isActivePath(pathname, tab.to));
  const sideItems = activeTab ? SIDE_NAV[activeTab.key] ?? [] : [];
  const activeSideItem = sideItems.find((item) => item.to && isActivePath(pathname, item.to, item.exact));
  const title = activeSideItem?.label ?? activeTab?.label ?? "Home";
  const { user, loading } = useCurrentUser();
  const userName = loading ? undefined : user?.fullName;
  // Acting-as (Finance/BI/Dept Owner/Function Mgr) only matters for the review workflows it drives.
  const showActingAs = pathname.startsWith("/modeler-target-setting/financial-modeler") || pathname.startsWith("/governance");

  return (
    <div className="app-shell">
      <div className="topswitch">
        <Link to="/home" className="brand" style={{ textDecoration: "none" }}>
          <div className="logo">AP</div>
          <div className="text">
            <strong>Andalusia Pulse</strong>
            <span>Planning &amp; Monitoring</span>
          </div>
        </Link>
        <nav className="topswitch-tabs">
          {TOP_TABS.map((tab) => {
            const active = tab.key === activeTab?.key;
            return (
              <Link key={tab.key} to={tab.to} className={active ? "on" : undefined} aria-current={active ? "page" : undefined}>
                {tab.icon && <span className="tab-icon" dangerouslySetInnerHTML={{ __html: tab.icon }} />}
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="topswitch-spacer" />
        {userName && (
          <div className="topswitch-user" title={userName}>
            <div className="avatar">{initialsOf(userName)}</div>
            <span className="name">{userName}</span>
          </div>
        )}
      </div>

      <div className="app" style={{ height: "calc(100vh - 70px)" }}>
        {sideItems.length > 0 && (
          <aside className="side">
            <nav>
              {sideItems.map((item) => {
                if (item.children && item.children.length > 0) {
                  return <NavGroup key={item.label} item={item} pathname={pathname} />;
                }
                const active = item.to && isActivePath(pathname, item.to, item.exact);
                return (
                  <Link key={item.to || item.label} to={item.to || '#'} className={`nav-item${active ? " active" : ""}`}>
                    {item.icon && <span className="icon" dangerouslySetInnerHTML={{ __html: item.icon }} />}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}

        <div className="main">
          <header className="topbar">
            <h1>{title}</h1>
            <div className="spacer" />
            {showActingAs && <ActingAsSwitcher />}
          </header>
          <div className="content">{children}</div>
        </div>
      </div>
    </div>
  );
}
