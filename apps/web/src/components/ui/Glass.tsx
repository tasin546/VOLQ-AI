import React from 'react';
import { Button, Input } from './Primitives';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
  refract?: boolean;
  children: React.ReactNode;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  strong = false,
  refract = false,
  className = '',
  children,
  ...rest
}) => (
  <div
    className={`${strong ? 'liquid-glass-strong' : 'liquid-glass'} ${
      refract ? 'liquid-hero-refract' : ''
    } rounded-[var(--radius-lg)] ${className}`}
    {...rest}
  >
    {refract && <span aria-hidden="true" className="liquid-hero-refract-layer" />}
    {children}
  </div>
);

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'glass' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  variant = 'glass',
  size = 'md',
  ...rest
}) => {
  const mappedVariant =
    variant === 'danger' ? 'destructive' : variant === 'glass' ? 'secondary' : variant;
  return <Button variant={mappedVariant} size={size} {...rest} />;
};

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>((props, ref) => (
  <Input ref={ref} {...props} />
));

GlassInput.displayName = 'GlassInput';
