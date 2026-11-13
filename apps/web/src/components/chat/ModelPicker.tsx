import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Cloud, HardDrive, RefreshCw, Search } from 'lucide-react';
import type { DiscoveredModel } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import { Badge, DialogModal, IconButton } from '../ui/Primitives';

export const ModelPicker: React.FC = () => {
  const { modelPickerOpen, setModelPickerOpen, pushToast } = useUiStore();
  const { models, selectedModel, setSelectedModel, refreshModels } = useChatStore();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modelPickerOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [modelPickerOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q) ||
        m.connectionName.toLowerCase().includes(q) ||
        (m.isLocal ? 'local' : 'hosted').includes(q)
    );
  }, [models, query]);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { connectionName: string; isLocal: boolean; items: DiscoveredModel[] }
    >();
    for (const m of filtered) {
      const existing = map.get(m.connectionId);
      if (existing) {
        existing.items.push(m);
      } else {
        map.set(m.connectionId, {
          connectionName: m.connectionName,
          isLocal: m.isLocal,
          items: [m],
        });
      }
    }
    return Array.from(map.entries());
  }, [filtered]);

  const flatItems = useMemo(() => grouped.flatMap(([, g]) => g.items), [grouped]);

  const flatItemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatItems.forEach((item, index) => {
      map.set(`${item.connectionId}:${item.id}`, index);
    });
    return map;
  }, [flatItems]);

  const handleSelect = async (model: DiscoveredModel) => {
    await setSelectedModel({ connectionId: model.connectionId, modelId: model.id });
    setModelPickerOpen(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const errors = await refreshModels();
      if (errors.length > 0) {
        pushToast(`Refreshed with warnings: ${errors[0]!.connectionName}`, 'error');
      } else {
        pushToast('Models refreshed');
      }
    } catch {
      pushToast('Failed to refresh models', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatItems[activeIndex];
      if (target) void handleSelect(target);
    }
  };

  return (
    <DialogModal
      open={modelPickerOpen}
      onOpenChange={setModelPickerOpen}
      title="Select model"
      hideHeader
      centered
      maxWidthClass="md:max-w-[540px]"
    >
      <div onKeyDown={handleKeyDown} className="flex flex-col max-h-[min(82dvh,480px)]">
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-subtle)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search models or connections..."
            aria-label="Search models"
            className="flex-1 min-w-0 bg-transparent text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none focus-visible:outline-none"
          />
          <IconButton
            size="sm"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            aria-label="Refresh models"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </IconButton>
        </div>

        <div
          className="flex-1 overflow-y-auto p-2.5 space-y-3"
          role="listbox"
          aria-label="Available models"
        >
          {flatItems.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              {models.length === 0
                ? 'No models available. Admins can add connections and manage visibility in Admin.'
                : 'No matching models found.'}
            </div>
          ) : (
            grouped.map(([connId, group]) => (
              <div key={connId} className="space-y-1">
                <div className="flex items-center justify-between px-3 py-1 text-[12px] font-medium text-[var(--text-subtle)]">
                  <span>{group.connectionName}</span>
                  <Badge>
                    {group.isLocal ? (
                      <>
                        <HardDrive className="w-3 h-3" />
                        Local
                      </>
                    ) : (
                      <>
                        <Cloud className="w-3 h-3" />
                        Hosted
                      </>
                    )}
                  </Badge>
                </div>
                {group.items.map((item) => {
                  const idx = flatItemIndexMap.get(`${item.connectionId}:${item.id}`) ?? -1;
                  const isHighlighted = idx === activeIndex;
                  const isSelected =
                    selectedModel?.connectionId === item.connectionId &&
                    selectedModel?.modelId === item.id;

                  return (
                    <button
                      key={`${item.connectionId}:${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => void handleSelect(item)}
                      className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[var(--radius-md)] text-left transition-colors ${
                        isHighlighted
                          ? 'bg-[var(--surface-active)] text-[var(--text)]'
                          : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate">
                          {item.description || (item.name !== item.id ? item.id : group.connectionName)}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-[var(--text)] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </DialogModal>
  );
};
