import { useState } from "react";
import type { OwnProfile } from "../types/osu";
import { cn } from "../lib/cn";

function AvatarSource({
  sources,
  username,
  className,
}: {
  sources: string[];
  username: string;
  className?: string;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex];

  if (!source) {
    return (
      <span
        aria-label={`${username} 的头像占位`}
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden border border-white/10 bg-[var(--theme-primary-muted)] font-semibold text-[var(--theme-primary)]",
          className,
        )}
        role="img"
      >
        {username.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      alt={`${username} 的头像`}
      className={cn("shrink-0 object-cover", className)}
      onError={() => setSourceIndex((index) => index + 1)}
      src={source}
    />
  );
}

export function Avatar({
  profile,
  className,
}: {
  profile: Pick<
    OwnProfile,
    "id" | "username" | "avatar_url" | "avatar_data_url"
  >;
  className?: string;
}) {
  const sources = [profile.avatar_data_url, profile.avatar_url].filter(
    (source, index, values): source is string =>
      Boolean(source) && values.indexOf(source) === index,
  );
  const sourceIdentity = `${profile.id}:${profile.avatar_url}:${profile.avatar_data_url?.length ?? 0}`;

  return (
    <AvatarSource
      className={className}
      key={sourceIdentity}
      sources={sources}
      username={profile.username}
    />
  );
}
