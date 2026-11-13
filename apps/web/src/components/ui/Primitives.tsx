import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';

export const TooltipProvider = Tooltip.Provider;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', children, ...rest }, ref) => {
    const variantClass =
      variant === 'primary'
        ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold hover:opacity-90'
        : variant === 'destructive'
          ? 'bg-[var(--status-error-soft)] text-[var(--status-error)] border border-[var(--status-error)]/30 hover:opacity-95'
          : variant === 'ghost'
            ? 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
            : 'liquid-glass liquid-interactive text-[var(--text)]';

    const sizeClass =
      size === 'sm'
        ? 'h-8 px-3 text-xs rounded-full'
        : size === 'icon'
          ? 'w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center'
          : 'h-10 px-4 text-sm rounded-full';

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 transition-[transform,opacity,background-color] duration-150 active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none ${variantClass} ${sizeClass} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', active = false, className = '', children, ...rest }, ref) => {
    const dim =
      size === 'sm'
        ? 'w-8 h-8 rounded-full'
        : size === 'lg'
          ? 'w-11 h-11 rounded-full'
          : 'w-9 h-9 rounded-full';
    return (
      <button
        ref={ref}
        type="button"
        className={`inline-flex items-center justify-center shrink-0 transition-[background-color,color,transform] duration-150 active:scale-[0.96] disabled:opacity-35 disabled:pointer-events-none ${dim} ${
          active
            ? 'bg-[var(--surface-active)] text-[var(--text)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
        } ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = 'IconButton';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className = '', ...rest }, ref) => {
    return (
      <div className="relative flex items-center">
        {icon && (
          <span
            aria-hidden="true"
            className="absolute left-3.5 text-[var(--text-subtle)] pointer-events-none flex items-center"
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          className={`w-full h-10 ${icon ? 'pl-10 pr-3.5' : 'px-3.5'} rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] outline-none transition-colors duration-150 ${className}`}
          {...rest}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...rest }, ref) => (
  <textarea
    ref={ref}
    className={`w-full p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] outline-none transition-colors duration-150 ${className}`}
    {...rest}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = '', children, ...rest }, ref) => (
  <select
    ref={ref}
    className={`w-full h-10 px-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base md:text-sm text-[var(--text)] focus:border-[var(--border-strong)] outline-none transition-colors duration-150 ${className}`}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  id,
  checked,
  onCheckedChange,
  'aria-label': ariaLabel,
  disabled,
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150 disabled:opacity-40 ${
      checked
        ? 'bg-[var(--accent)] border-[var(--accent)]'
        : 'bg-[var(--surface-raised)] border-[var(--border)]'
    }`}
  >
    <span
      className={`pointer-events-none block h-4 w-4 rounded-full transition-transform duration-150 ${
        checked
          ? 'translate-x-5.5 bg-[var(--accent-ink)]'
          : 'translate-x-1 bg-[var(--text-muted)]'
      }`}
    />
  </button>
);

interface BadgeProps {
  children: React.ReactNode;
  tone?: 'default' | 'error' | 'warning';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, tone = 'default', className = '' }) => {
  const toneClass =
    tone === 'error'
      ? 'bg-[var(--status-error-soft)] text-[var(--status-error)] border-[var(--status-error)]/30'
      : tone === 'warning'
        ? 'bg-[var(--status-warning-soft)] text-[var(--status-warning)] border-[var(--status-warning)]/30'
        : 'bg-[var(--surface-hover)] text-[var(--text-muted)] border-[var(--border)]';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${toneClass} ${className}`}
    >
      {children}
    </span>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    aria-hidden="true"
    className={`rounded-[var(--radius-sm)] bg-[var(--surface-hover)] animate-pulse ${className}`}
  />
);

export const EmptyStateBox: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className = '' }) => (
  <div
    className={`flex flex-col items-center justify-center text-center px-6 py-10 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] ${className}`}
  >
    {icon && (
      <div className="w-10 h-10 rounded-full bg-[var(--surface-hover)] flex items-center justify-center text-[var(--text-muted)] mb-3">
        {icon}
      </div>
    )}
    <div className="text-sm font-medium text-[var(--text)]">{title}</div>
    {description && <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

interface AppTooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
  children: React.ReactNode;
}

export const AppTooltip: React.FC<AppTooltipProps> = ({
  content,
  shortcut,
  side = 'right',
  delayDuration = 300,
  children,
}) => (
  <Tooltip.Root delayDuration={delayDuration}>
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        side={side}
        sideOffset={8}
        className="z-50 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-medium text-[var(--text)] shadow-[var(--shadow-sm)] select-none"
      >
        <span>{content}</span>
        {shortcut && (
          <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--text-muted)]">
            {shortcut}
          </kbd>
        )}
        <Tooltip.Arrow className="fill-[var(--border)]" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export const AppPopover = Popover;

export const PopoverContent: React.FC<
  React.ComponentPropsWithoutRef<typeof Popover.Content>
> = ({ className = '', sideOffset = 8, children, ...rest }) => (
  <Popover.Portal>
    <Popover.Content
      sideOffset={sideOffset}
      className={`z-50 rounded-[var(--radius-lg)] liquid-glass-strong p-2 shadow-[var(--shadow)] outline-none ${className}`}
      {...rest}
    >
      {children}
    </Popover.Content>
  </Popover.Portal>
);

export const AppDropdown = DropdownMenu;

export const DropdownContent: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>
> = ({ className = '', sideOffset = 6, children, ...rest }) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      sideOffset={sideOffset}
      className={`z-50 min-w-[180px] rounded-[var(--radius-md)] liquid-glass-strong p-1.5 shadow-[var(--shadow)] outline-none space-y-0.5 ${className}`}
      {...rest}
    >
      {children}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
);

export const DropdownItem: React.FC<
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { destructive?: boolean }
> = ({ className = '', destructive = false, children, ...rest }) => (
  <DropdownMenu.Item
    className={`flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-[var(--radius-sm)] cursor-pointer select-none outline-none transition-colors ${
      destructive
        ? 'text-[var(--status-error)] focus:bg-[var(--status-error-soft)]'
        : 'text-[var(--text)] focus:bg-[var(--surface-hover)]'
    } ${className}`}
    {...rest}
  >
    {children}
  </DropdownMenu.Item>
);

export const AppDialog = Dialog;

export const DialogModal: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  maxWidthClass?: string;
  hideHeader?: boolean;
  centered?: boolean;
  layer?: 'dialog' | 'confirm';
  children: React.ReactNode;
}> = ({
  open,
  onOpenChange,
  title,
  description,
  maxWidthClass = 'md:max-w-[540px]',
  hideHeader = false,
  centered = true,
  layer = 'dialog',
  children,
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay
        className={`fixed inset-0 ${
          layer === 'confirm' ? 'volq-confirm-overlay z-[70]' : 'volq-dialog-overlay z-[60]'
        } bg-[var(--scrim-bg)] backdrop-blur-[4px]`}
      />
      <Dialog.Content
        aria-describedby={undefined}
        className={`fixed inset-x-0 bottom-0 md:inset-auto md:left-1/2 ${
          centered ? 'md:top-1/2 md:-translate-y-1/2' : 'md:top-20'
        } md:-translate-x-1/2 ${
          layer === 'confirm' ? 'volq-confirm-content z-[71]' : 'volq-dialog-content z-[61]'
        } w-full ${maxWidthClass} max-h-[min(88dvh,640px)] flex flex-col rounded-t-[var(--radius-xl)] md:rounded-[var(--radius-xl)] bg-[var(--surface-raised)] [data-theme='amoled']:bg-[#0B0B0B] border border-[var(--border-strong)] shadow-[var(--shadow)] overflow-hidden outline-none pb-[env(safe-area-inset-bottom)] md:pb-0`}
      >
        {hideHeader ? (
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
        ) : (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold text-[var(--text)] truncate">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-xs text-[var(--text-muted)] mt-0.5">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton size="sm" aria-label={`Close ${title}`}>
                <X className="w-4 h-4" />
              </IconButton>
            </Dialog.Close>
          </div>
        )}
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export const BottomSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onOpenChange, title, children }) => (
  <DialogModal open={open} onOpenChange={onOpenChange} title={title} maxWidthClass="md:max-w-lg">
    <div className="p-5 overflow-y-auto">{children}</div>
  </DialogModal>
);

export const ConfirmDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = true,
  loading = false,
  onConfirm,
}) => (
  <DialogModal
    open={open}
    onOpenChange={onOpenChange}
    title={title}
    centered
    layer="confirm"
    maxWidthClass="md:max-w-md"
  >
    <div className="p-5 space-y-5">
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">{description}</p>
      <div className="flex items-center justify-end gap-2.5">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          disabled={loading}
          onClick={() => void onConfirm()}
        >
          {loading ? 'Working...' : confirmLabel}
        </Button>
      </div>
    </div>
  </DialogModal>
);

export const AppScrollArea: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className = '', children }) => (
  <ScrollArea.Root className={`relative overflow-hidden ${className}`}>
    <ScrollArea.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar
      orientation="vertical"
      className="flex select-none touch-none p-0.5 transition-colors w-2"
    >
      <ScrollArea.Thumb className="flex-1 rounded-full bg-[var(--border)]" />
    </ScrollArea.Scrollbar>
  </ScrollArea.Root>
);
