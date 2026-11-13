import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import { SidebarChatList } from './SidebarChatList';
import { SidebarChatSectionHeader } from './SidebarChatSectionHeader';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNav } from './SidebarNav';
import { SidebarRail } from './SidebarRail';

interface SidebarProps {
  mobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobile = false, onCloseMobile }) => {
  const navigate = useNavigate();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const setShortcutsModalOpen = useUiStore((s) => s.setShortcutsModalOpen);

  const selectChat = useChatStore((s) => s.selectChat);
  const startNewChat = useChatStore((s) => s.startNewChat);

  const collapsed = !mobile && sidebarCollapsed;
  const [showExpandedLabels, setShowExpandedLabels] = useState(!collapsed);

  useEffect(() => {
    if (collapsed) {
      setShowExpandedLabels(false);
    } else {
      const id = setTimeout(() => setShowExpandedLabels(true), 60);
      return () => clearTimeout(id);
    }
  }, [collapsed]);

  // Auto-collapse between 768px and 1024px on resize
  useEffect(() => {
    if (mobile) return;
    const onResize = () => {
      const w = window.innerWidth;
      if (w >= 768 && w < 1024) {
        useUiStore.setState({ sidebarCollapsed: true });
      } else if (w >= 1024) {
        useUiStore.setState({
          sidebarCollapsed: localStorage.getItem('volq_sidebar_collapsed') === 'true',
        });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mobile]);

  // Global keyboard shortcuts (Ctrl/Cmd+Shift+O, Ctrl/Cmd+B, ?)
  useEffect(() => {
    if (mobile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        startNewChat();
        navigate('/');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarCollapsed();
        return;
      }
      if (!isEditable && e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobile, startNewChat, navigate, toggleSidebarCollapsed, setShortcutsModalOpen]);

  const handleNewChat = () => {
    startNewChat();
    navigate('/');
    onCloseMobile?.();
  };

  const handleSelectChat = async (chatId: string) => {
    await selectChat(chatId);
    navigate('/');
    onCloseMobile?.();
  };

  return (
    <motion.aside
      aria-label="Primary sidebar"
      initial={false}
      animate={{ width: mobile ? '100%' : collapsed ? 72 : 280 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="h-full shrink-0 flex flex-col bg-[var(--surface-sidebar)] border-r border-[var(--border-subtle)] overflow-hidden select-none"
    >
      {collapsed ? (
        <SidebarRail onNewChat={handleNewChat} onGoHome={handleNewChat} />
      ) : (
        <div
          className={`flex flex-col h-full transition-opacity duration-150 ${
            showExpandedLabels || mobile ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <SidebarHeader
            mobile={mobile}
            onCloseMobile={onCloseMobile}
            onGoHome={handleNewChat}
          />
          <SidebarNav
            mobile={mobile}
            onNewChat={handleNewChat}
            onNavigate={onCloseMobile}
          />
          <SidebarChatSectionHeader />
          <SidebarChatList onSelectChat={(id) => void handleSelectChat(id)} />
          <SidebarFooter onNavigate={onCloseMobile} />
        </div>
      )}
    </motion.aside>
  );
};
