import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUp,
  BookText,
  Camera,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Plus,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import type { ChatImageAttachment } from '../../lib/types';
import { getComposerDisclaimer } from '../../lib/welcomeCopy';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import {
  AppPopover,
  AppTooltip,
  Button,
  DialogModal,
  IconButton,
  Input,
  PopoverContent,
  Textarea,
} from '../ui/Primitives';
import { CameraCaptureModal } from './CameraCaptureModal';

interface ComposerProps {
  externalDraft?: string;
  onExternalDraftConsumed?: () => void;
  limitNotice?: {
    blocked: boolean;
    warning?: boolean;
    message: string;
  } | null;
}

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: {
    isFinal: boolean;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognition;

export const Composer: React.FC<ComposerProps> = ({
  externalDraft,
  onExternalDraftConsumed,
  limitNotice = null,
}) => {
  const pushToast = useUiStore((s) => s.pushToast);
  const branding = useUiStore((s) => s.branding);
  const resolvedTheme = useUiStore((s) => s.resolvedTheme);
  const reduceTransparency = useUiStore((s) => s.reduceTransparency);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const sendOnEnter = useAuthStore((s) => s.user?.preferences.sendOnEnter ?? true);
  const {
    activeChat,
    messages,
    prompts,
    selectedModel,
    isStreaming,
    streamingChatId,
    focusComposerTrigger,
    getDraftForChat,
    setDraftForChat,
    setEditingMessageId,
    sendMessage,
    stopStreaming,
    updateActiveChatSettings,
  } = useChatStore();

  const isCurrentChatStreaming =
    isStreaming && Boolean(activeChat && streamingChatId === activeChat.id);

  const activeChatKey = activeChat?.id ?? null;

  const [text, setText] = useState(() => getDraftForChat(activeChatKey));
  const [images, setImages] = useState<ChatImageAttachment[]>([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [pageDragging, setPageDragging] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(activeChat?.systemPrompt ?? '');
  const [temperature, setTemperature] = useState<string>(
    activeChat?.temperature != null ? String(activeChat.temperature) : ''
  );
  const [maxTokens, setMaxTokens] = useState<string>(
    activeChat?.maxTokens != null ? String(activeChat.maxTokens) : ''
  );
  const [slashIndex, setSlashIndex] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const capsuleRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handleResize = () => {
      const diff = window.innerHeight - vv.height;
      setIsKeyboardOpen(diff > 140);
    };

    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setText(getDraftForChat(activeChatKey));
    setImages([]);
  }, [activeChatKey, getDraftForChat]);

  useEffect(() => {
    setSystemPrompt(activeChat?.systemPrompt ?? '');
    setTemperature(activeChat?.temperature != null ? String(activeChat.temperature) : '');
    setMaxTokens(activeChat?.maxTokens != null ? String(activeChat.maxTokens) : '');
  }, [activeChat?.id, activeChat?.systemPrompt, activeChat?.temperature, activeChat?.maxTokens]);

  useEffect(() => {
    if (focusComposerTrigger > 0) {
      setTimeout(() => {
        textareaRef.current?.focus();
        mobileTextareaRef.current?.focus();
      }, 20);
    }
  }, [focusComposerTrigger]);

  useEffect(() => {
    if (externalDraft) {
      setText(externalDraft);
      setDraftForChat(activeChatKey, externalDraft);
      onExternalDraftConsumed?.();
      setTimeout(() => {
        textareaRef.current?.focus();
        mobileTextareaRef.current?.focus();
      }, 10);
    }
  }, [externalDraft, onExternalDraftConsumed, activeChatKey, setDraftForChat]);

  const resizeTextarea = (el: HTMLTextAreaElement | null, maxLines: number) => {
    if (!el) return;
    el.style.height = 'auto';
    const maxPx = maxLines * 22;
    const newHeight = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  };

  useEffect(() => {
    resizeTextarea(textareaRef.current, 8);
    resizeTextarea(mobileTextareaRef.current, 5);
  }, [text]);

  const updateText = (next: string) => {
    setText(next);
    setDraftForChat(activeChatKey, next);
  };

  const showSlashPicker = useMemo(() => {
    if (text.startsWith('/')) {
      const query = text.slice(1);
      return !query.includes(' ');
    }
    return false;
  }, [text]);

  const slashQuery = showSlashPicker ? text.slice(1).toLowerCase() : '';

  const matchingPrompts = useMemo(() => {
    if (!showSlashPicker) return [];
    if (!slashQuery) return prompts.slice(0, 8);
    return prompts
      .filter(
        (p) =>
          p.command.toLowerCase().includes(slashQuery) ||
          p.title.toLowerCase().includes(slashQuery) ||
          p.content.toLowerCase().includes(slashQuery)
      )
      .slice(0, 8);
  }, [showSlashPicker, slashQuery, prompts]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const insertPrompt = (promptContent: string) => {
    updateText(promptContent);
    setTimeout(() => {
      const el = textareaRef.current || mobileTextareaRef.current;
      el?.focus();
      el?.setSelectionRange(promptContent.length, promptContent.length);
    }, 10);
  };

  const processFile = useCallback(
    async (file: File): Promise<ChatImageAttachment | null> => {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        pushToast(`Skipped ${file.name}: only PNG, JPEG, WebP, GIF allowed`, 'error');
        return null;
      }
      if (file.size > 5 * 1024 * 1024) {
        pushToast(`Skipped ${file.name}: exceeds 5 MB limit`, 'error');
        return null;
      }

      return new Promise<ChatImageAttachment | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== 'string') {
            resolve(null);
            return;
          }
          const comma = result.indexOf(',');
          const base64 = comma >= 0 ? result.slice(comma + 1) : result;
          resolve({
            mimeType: file.type as ChatImageAttachment['mimeType'],
            dataBase64: base64,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    },
    [pushToast]
  );

  const handleFilesSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const remainingSlots = 4 - images.length;
      if (remainingSlots <= 0) {
        pushToast('Maximum 4 images per message', 'error');
        return;
      }

      const files = Array.from(fileList).slice(0, remainingSlots);
      setProcessingImages(true);
      try {
        const processed = await Promise.all(files.map(processFile));
        const valid = processed.filter((item): item is ChatImageAttachment => item !== null);
        if (valid.length > 0) {
          setImages((prev) => [...prev, ...valid].slice(0, 4));
        }
      } finally {
        setProcessingImages(false);
      }
    },
    [images.length, processFile, pushToast]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        for (const f of imageFiles) dt.items.add(f);
        void handleFilesSelected(dt.files);
      }
    },
    [handleFilesSelected]
  );

  // Drag-and-drop
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragDepthRef.current += 1;
      setPageDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setPageDragging(false);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setPageDragging(false);
      void handleFilesSelected(e.dataTransfer.files);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleFilesSelected]);

  // STT Voice Recording
  const toggleVoiceRecording = () => {
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      pushToast('Speech recognition is not supported in this browser', 'error');
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        pushToast('Listening... Speak into your microphone');
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res?.isFinal && res[0]?.transcript) {
            transcript += res[0].transcript;
          }
        }
        if (transcript.trim()) {
          setText((prev) => {
            const separator = prev && !prev.endsWith(' ') ? ' ' : '';
            const newText = prev + separator + transcript;
            setDraftForChat(activeChatKey, newText);
            return newText;
          });
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        if (event.error !== 'no-speech') {
          pushToast(`Voice input error: ${event.error}`, 'error');
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      pushToast('Unable to start speech recognition', 'error');
      setIsRecording(false);
    }
  };

  const parseOverrides = () => {
    const parsedTemp = temperature === '' ? null : Number(temperature);
    const parsedTokens = maxTokens === '' ? null : Number(maxTokens);
    return {
      systemPrompt: systemPrompt.trim() ? systemPrompt : undefined,
      temperature: Number.isFinite(parsedTemp) ? parsedTemp : null,
      maxTokens: Number.isFinite(parsedTokens) ? parsedTokens : null,
    };
  };

  const handleSaveParams = async () => {
    if (!activeChat) {
      setParamsOpen(false);
      return;
    }
    const overrides = parseOverrides();
    try {
      await updateActiveChatSettings({
        systemPrompt: overrides.systemPrompt ?? '',
        temperature: overrides.temperature,
        maxTokens: overrides.maxTokens,
      });
      setParamsOpen(false);
      pushToast('Conversation parameters updated');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update parameters', 'error');
    }
  };

  const handleSend = async () => {
    if (isCurrentChatStreaming) {
      void stopStreaming();
      return;
    }

    if (limitNotice?.blocked) {
      pushToast(limitNotice.message, 'error');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    if (!selectedModel) {
      pushToast('Select a model first', 'error');
      return;
    }

    const outgoingImages = images;
    const outgoingText = trimmed;
    const sentKey = activeChatKey;
    setText('');
    setDraftForChat(sentKey, '');
    setImages([]);

    try {
      await sendMessage(outgoingText, outgoingImages, parseOverrides());
    } catch (err) {
      if (sentKey === activeChatKey) {
        setText(outgoingText);
        setDraftForChat(sentKey, outgoingText);
      }
      pushToast(err instanceof Error ? err.message : 'Failed to send message', 'error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && isCurrentChatStreaming) {
      e.preventDefault();
      void stopStreaming();
      return;
    }

    if (showSlashPicker && matchingPrompts.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => (prev + 1) % matchingPrompts.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => (prev - 1 + matchingPrompts.length) % matchingPrompts.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = matchingPrompts[slashIndex];
        if (picked) insertPrompt(picked.content);
        return;
      }
      if (e.key === 'Escape') {
        updateText('');
        return;
      }
    }

    if (e.key === 'ArrowUp' && text === '' && !showSlashPicker && !isCurrentChatStreaming) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        e.preventDefault();
        setEditingMessageId(lastUser.id);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && sendOnEnter) {
      e.preventDefault();
      void handleSend();
    }
  };

  const canSend =
    !limitNotice?.blocked &&
    !processingImages &&
    (text.trim().length > 0 || images.length > 0);

  const showRefractLayer =
    resolvedTheme === 'obsidian' &&
    !reduceTransparency &&
    typeof window !== 'undefined' &&
    'chrome' in window;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType === 'touch' || !capsuleRef.current) return;
    const rect = capsuleRef.current.getBoundingClientRect();
    capsuleRef.current.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    capsuleRef.current.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <>
      <AnimatePresence>
        {pageDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="fixed inset-0 z-[55] bg-[var(--scrim-bg)] backdrop-blur-md flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="liquid-glass-strong rounded-[var(--radius-xl)] px-8 py-6 text-center space-y-2 border-[var(--border-strong)]">
              <ImagePlus className="w-7 h-7 mx-auto text-[var(--text)]" />
              <div className="text-base font-medium text-[var(--text)]">Drop image to attach</div>
              <div className="text-xs text-[var(--text-muted)]">PNG, JPEG, WebP or GIF up to 5 MB</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative w-full bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/85 to-transparent pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="relative w-full max-w-[760px] mx-auto px-3 sm:px-4">
          {/* Slash Prompt Library Popover */}
          <AnimatePresence>
            {showSlashPicker && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                role="listbox"
                aria-label="Prompt library"
                className="absolute left-3 right-3 sm:left-4 sm:right-4 bottom-full mb-2.5 rounded-[var(--radius-lg)] liquid-glass-strong p-2 shadow-[var(--shadow)] max-h-56 overflow-y-auto z-30"
              >
                <div className="px-2.5 py-1 text-[12px] font-medium text-[var(--text-subtle)]">
                  Saved Prompts
                </div>
                {matchingPrompts.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-[var(--text-muted)]">
                    No matching prompts
                  </div>
                ) : (
                  matchingPrompts.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={idx === slashIndex}
                      onMouseEnter={() => setSlashIndex(idx)}
                      onClick={() => insertPrompt(p.content)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-left text-sm ${
                        idx === slashIndex
                          ? 'bg-[var(--surface-active)] text-[var(--text)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <span className="font-medium truncate">{p.title}</span>
                      <span className="font-mono text-xs text-[var(--text)] shrink-0">
                        /{p.command}
                      </span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {limitNotice && (
            <div
              role="status"
              className={`mb-2.5 px-4 py-2.5 rounded-[var(--radius-md)] border text-xs flex items-center gap-2 ${
                limitNotice.blocked
                  ? 'border-[var(--status-error)]/40 bg-[var(--status-error-soft)] text-[var(--status-error)]'
                  : 'border-[var(--status-warning)]/40 bg-[var(--status-warning-soft)] text-[var(--status-warning)]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{limitNotice.message}</span>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Attachment Preview Chips */}
          {(images.length > 0 || processingImages) && (
            <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={`data:${img.mimeType};base64,${img.dataBase64}`}
                    alt={`Attachment ${i + 1}`}
                    className="w-12 h-12 rounded-[12px] object-cover border border-[var(--border)]"
                  />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove attachment ${i + 1}`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--surface-raised)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--text)] opacity-90 group-hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {processingImages && (
                <div className="w-12 h-12 rounded-[12px] border border-[var(--border)] bg-[var(--surface-hover)] flex items-center justify-center text-[var(--text-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* MOBILE COMPOSER REDESIGN (< 640px)                      */}
          {/* 1-Row Compact: [+] [Input (16px)] [Voice / Send / Stop] */}
          {/* ======================================================== */}
          <div className="block sm:hidden">
            <div className="volq-composer-glass px-2.5 py-1.5 flex items-end gap-2">
              {/* [+] Action Drawer Trigger */}
              <button
                type="button"
                onClick={() => setMobileSheetOpen(true)}
                aria-label="Open chat tools and attachments"
                className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center shrink-0 text-[var(--text-muted)] hover:text-[var(--text)] active:scale-95 transition-all mb-0.5"
              >
                <Plus className="w-5 h-5" />
              </button>

              {/* Textarea */}
              <div className="flex-1 min-w-0 py-1">
                <textarea
                  ref={mobileTextareaRef}
                  rows={1}
                  value={text}
                  onChange={(e) => updateText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={`Message ${branding.siteName || 'VOLQ AI'}...`}
                  aria-label="Message prompt"
                  className="w-full bg-transparent text-[16px] text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none resize-none leading-[22px] max-h-[120px] overflow-y-auto px-1"
                />
              </div>

              {/* Send / Stop / Voice Button */}
              <div className="shrink-0 mb-0.5">
                {isCurrentChatStreaming ? (
                  <button
                    type="button"
                    onClick={() => void stopStreaming()}
                    aria-label="Stop generation"
                    className="w-9 h-9 rounded-full bg-[var(--status-error-soft)] text-[var(--status-error)] border border-[var(--status-error)]/40 flex items-center justify-center active:scale-95 transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-current rounded-[2px]" />
                  </button>
                ) : canSend ? (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    aria-label="Send message"
                    className="w-9 h-9 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow-md active:scale-95 transition-all"
                  >
                    <ArrowUp className="w-4 h-4" strokeWidth={2.4} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    aria-label={isRecording ? 'Stop recording voice' : 'Voice input'}
                    className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-all ${
                      isRecording
                        ? 'bg-[var(--status-error-soft)] text-[var(--status-error)] border border-[var(--status-error)] animate-pulse'
                        : 'liquid-glass text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* DESKTOP COMPOSER (>= 640px)                             */}
          {/* Spacious floating capsule with rich toolbar              */}
          {/* ======================================================== */}
          <div
            ref={capsuleRef}
            onPointerMove={handlePointerMove}
            className="hidden sm:block volq-composer-glass px-4 pt-3.5 pb-3"
          >
            {showRefractLayer && <span aria-hidden="true" className="liquid-hero-refract-layer" />}
            <span aria-hidden="true" className="volq-composer-sheen" />

            <div className="relative z-10 space-y-2.5">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => updateText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={`Message ${branding.siteName || 'VOLQ AI'}...`}
                aria-label="Message prompt"
                className="w-full bg-transparent text-[15px] text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none resize-none leading-[22px] max-h-[176px] overflow-y-auto px-0.5"
              />

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <AppTooltip content="Attach image" side="top">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Attach image"
                      className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <ImagePlus className="w-4 h-4" />
                    </button>
                  </AppTooltip>

                  <AppTooltip content="Camera capture" side="top">
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      aria-label="Capture photo with camera"
                      className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </AppTooltip>

                  <AppTooltip content="Voice speech-to-text" side="top">
                    <button
                      type="button"
                      onClick={toggleVoiceRecording}
                      aria-label={isRecording ? 'Stop recording voice' : 'Record voice'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                        isRecording
                          ? 'bg-[var(--status-error-soft)] text-[var(--status-error)] border border-[var(--status-error)] animate-pulse'
                          : 'liquid-glass text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </AppTooltip>

                  <AppTooltip content="Saved prompts (/)" side="top">
                    <button
                      type="button"
                      onClick={() => {
                        updateText(text.startsWith('/') ? text : `/${text}`);
                        textareaRef.current?.focus();
                      }}
                      aria-label="Insert saved prompt"
                      className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <BookText className="w-4 h-4" />
                    </button>
                  </AppTooltip>

                  <AppPopover.Root open={paramsOpen} onOpenChange={setParamsOpen}>
                    <AppTooltip content="Model parameters" side="top">
                      <AppPopover.Trigger asChild>
                        <button
                          type="button"
                          aria-label="Model parameters"
                          aria-expanded={paramsOpen}
                          className={`w-9 h-9 rounded-full liquid-glass flex items-center justify-center transition-colors ${
                            paramsOpen || Boolean(activeChat?.systemPrompt)
                              ? 'bg-[var(--surface-active)] text-[var(--text)] border-[var(--border-strong)]'
                              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <SlidersHorizontal className="w-4 h-4" />
                        </button>
                      </AppPopover.Trigger>
                    </AppTooltip>
                    <PopoverContent
                      side="top"
                      align="start"
                      className="w-80 max-w-[calc(100vw-2rem)] p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text)]">
                          Model parameters
                        </span>
                        <IconButton
                          size="sm"
                          aria-label="Close parameters"
                          onClick={() => setParamsOpen(false)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </IconButton>
                      </div>

                      <div>
                        <label className="block text-xs text-[var(--text-muted)] mb-1">
                          System prompt override
                        </label>
                        <Textarea
                          rows={3}
                          value={systemPrompt}
                          onChange={(e) => setSystemPrompt(e.target.value)}
                          placeholder="Optional instructions for this conversation..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-1">
                            Temperature (0–2)
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            value={temperature}
                            onChange={(e) => setTemperature(e.target.value)}
                            placeholder="Default"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--text-muted)] mb-1">
                            Max tokens
                          </label>
                          <Input
                            type="number"
                            min={1}
                            max={128000}
                            step={64}
                            value={maxTokens}
                            onChange={(e) => setMaxTokens(e.target.value)}
                            placeholder="Default"
                          />
                        </div>
                      </div>

                      <Button
                        variant="primary"
                        className="w-full"
                        onClick={() => void handleSaveParams()}
                      >
                        Apply parameters
                      </Button>
                    </PopoverContent>
                  </AppPopover.Root>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-[var(--text-subtle)]">
                    {sendOnEnter ? 'Enter to send · Shift+Enter for new line' : 'Click send'}
                  </span>

                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!isCurrentChatStreaming && !canSend}
                    aria-label={isCurrentChatStreaming ? 'Stop generation' : 'Send message'}
                    className={`w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 transition-[transform,opacity,background-color,box-shadow] duration-150 ${
                      isCurrentChatStreaming
                        ? 'bg-[var(--status-error-soft)] text-[var(--status-error)] border border-[var(--status-error)]/40 hover:scale-105 active:scale-95'
                        : canSend
                          ? 'bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_6px_22px_var(--accent-glow)] hover:scale-105 active:scale-95'
                          : 'bg-[var(--surface-hover)] text-[var(--text-subtle)] border border-[var(--border)] opacity-55 cursor-not-allowed'
                    }`}
                  >
                    {isCurrentChatStreaming ? (
                      <Square className="w-3.5 h-3.5 fill-current rounded-[2px]" />
                    ) : (
                      <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.2} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {!isKeyboardOpen && (
            <p
              data-testid="composer-disclaimer"
              className="mt-2 text-center text-[12px] [@media(max-width:380px)]:text-[11px] text-[var(--text-subtle)] select-text line-clamp-2 sm:line-clamp-1 max-w-[760px] mx-auto px-2"
            >
              {getComposerDisclaimer(branding.siteName)}
            </p>
          )}
        </div>
      </div>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(attachment) => {
          setImages((prev) => [...prev, attachment].slice(0, 4));
        }}
      />

      {/* Mobile Action Drawer / Sheet Modal */}
      <DialogModal
        open={mobileSheetOpen}
        onOpenChange={setMobileSheetOpen}
        title="Chat Tools & Attachments"
        description="Quick tools and options for your active message"
        maxWidthClass="max-w-sm"
      >
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              setMobileSheetOpen(false);
              setCameraOpen(true);
            }}
            className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] flex flex-col items-center justify-center gap-2 text-xs font-medium text-[var(--text)] transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <span>Take Photo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileSheetOpen(false);
              fileInputRef.current?.click();
            }}
            className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] flex flex-col items-center justify-center gap-2 text-xs font-medium text-[var(--text)] transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--surface)] text-[var(--text)] flex items-center justify-center">
              <ImagePlus className="w-5 h-5" />
            </div>
            <span>Attach Image</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileSheetOpen(false);
              updateText(text.startsWith('/') ? text : `/${text}`);
              mobileTextareaRef.current?.focus();
            }}
            className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] flex flex-col items-center justify-center gap-2 text-xs font-medium text-[var(--text)] transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--surface)] text-[var(--text)] flex items-center justify-center">
              <BookText className="w-5 h-5" />
            </div>
            <span>Prompt Library</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMobileSheetOpen(false);
              toggleVoiceRecording();
            }}
            className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-hover)] flex flex-col items-center justify-center gap-2 text-xs font-medium text-[var(--text)] transition-colors"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isRecording ? 'bg-[var(--status-error-soft)] text-[var(--status-error)] animate-pulse' : 'bg-[var(--surface)] text-[var(--text)]'
            }`}>
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </div>
            <span>{isRecording ? 'Stop Voice' : 'Voice Input'}</span>
          </button>
        </div>
      </DialogModal>
    </>
  );
};
