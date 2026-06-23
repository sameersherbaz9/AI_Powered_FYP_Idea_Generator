import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, User, BookOpen, Bookmark, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const menuItems = [
  { name: 'Dashboard',        icon: <LayoutDashboard size={18} />, path: '/student/dashboard' },
  { name: 'Profile',          icon: <User size={18} />,            path: '/student/profile'   },
  { name: 'Semester Records', icon: <BookOpen size={18} />,        path: '/student/records'   },
  { name: 'Saved Ideas',      icon: <Bookmark size={18} />,        path: '/student/saved'     },
];

/** Shared nav content rendered by both the desktop sidebar and the mobile drawer. */
const SidebarContent = ({ onNavigate }) => {
  const { logout } = useAuth();

  return (
    <>
      <div className="p-10 pb-16">
        <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-cyan-500 bg-clip-text text-transparent font-heading">
          FYP GENERATOR
        </h1>
      </div>

      <nav className="flex-1 space-y-4">
        {menuItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-4 px-8 py-3 transition-all font-bold uppercase tracking-[0.2em] text-[10px] ${
                isActive
                  ? 'text-pink-500 border-l-4 border-pink-500 bg-white/5'
                  : 'text-gray-500 hover:text-white'
              }`
            }
          >
            {item.icon}
            <span className="font-heading">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-8 border-t border-white/5">
        <button
          onClick={logout}
          className="flex items-center gap-4 w-full text-gray-500 hover:text-red-400 transition-colors uppercase text-[10px] font-bold tracking-[0.2em] font-heading"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </>
  );
};

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — unchanged from before, hidden below md breakpoint */}
      <aside className="w-64 bg-[#1A1A2E] border-r border-white/5 h-screen sticky top-0 hidden md:flex flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile top bar with hamburger trigger — only visible below md breakpoint */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-[#1A1A2E] border-b border-white/5 px-4 py-3">
        <h1 className="text-base font-bold bg-gradient-to-r from-pink-500 to-cyan-500 bg-clip-text text-transparent font-heading">
          FYP GENERATOR
        </h1>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="text-gray-300 hover:text-white p-2"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-[#1A1A2E] border-r border-white/5 flex flex-col transition-transform duration-200 ease-out">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1"
            >
              <X size={20} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
