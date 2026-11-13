import React, { useEffect, useState } from 'react';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

interface UserAvatarProps {
  user?: {
    id: string;
    displayName: string;
    hasAvatar?: boolean;
    avatarVersion?: string | null;
  } | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-xs',
  lg: 'w-16 h-16 text-lg',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 'sm',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const src =
    user?.hasAvatar && !imgError
      ? `/api/users/${user.id}/avatar${
          user.avatarVersion ? `?v=${encodeURIComponent(user.avatarVersion)}` : ''
        }`
      : null;

  useEffect(() => {
    setImgError(false);
  }, [user?.id, user?.avatarVersion, user?.hasAvatar]);

  return (
    <div
      className={`${SIZE_MAP[size]} rounded-full bg-[var(--surface-active)] border border-[var(--border)] flex items-center justify-center font-semibold text-[var(--text)] overflow-hidden shrink-0 select-none ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={user?.displayName ?? 'User avatar'}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{getInitials(user?.displayName ?? 'V')}</span>
      )}
    </div>
  );
};
