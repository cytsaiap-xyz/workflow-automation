import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  List,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';

interface SidebarProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/executions', label: 'Executions', icon: List },
  { path: '/monitoring', label: 'Monitoring', icon: Activity },
  { path: '/help', label: 'User Manual', icon: BookOpen },
];

export default function Sidebar({ children }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();

  // Handle responsive breakpoint
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location]);

  const sidebarWidth = isCollapsed ? '64px' : '220px';

  return (
    <div className="app-layout">
      {/* Mobile Overlay */}
      {isMobile && isMobileOpen && (
        <div 
          className="sidebar-overlay"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Header */}
      {isMobile && (
        <header className="mobile-header">
          <button 
            className="btn btn-ghost btn-icon"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu size={24} />
          </button>
          <h1 className="mobile-title">
            <LayoutDashboard size={20} />
            Workflow Automation
          </h1>
        </header>
      )}

      {/* Sidebar */}
      <aside 
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobile ? 'mobile' : ''} ${isMobileOpen ? 'open' : ''}`}
        style={!isMobile ? { width: sidebarWidth } : undefined}
      >
        {/* Sidebar Header */}
        <div className="sidebar-header">
          {!isCollapsed && (
            <div className="sidebar-logo">
              <LayoutDashboard size={24} />
              <span>Workflow</span>
            </div>
          )}
          {isMobile ? (
            <button 
              className="btn btn-ghost btn-icon"
              onClick={() => setIsMobileOpen(false)}
            >
              <X size={20} />
            </button>
          ) : (
            <button 
              className="btn btn-ghost btn-icon sidebar-toggle"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => 
                `sidebar-link ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`
              }
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon size={20} />
              {!isCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main 
        className="main-wrapper"
        style={!isMobile ? { marginLeft: sidebarWidth } : undefined}
      >
        {children}
      </main>
    </div>
  );
}
