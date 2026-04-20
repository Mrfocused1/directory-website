"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  src: string | null;
  alt: string;
  fallbackText: string;
  size?: number;
};

/**
 * Circular avatar with a monogram fallback if the image fails to
 * load. Used in the advertise hero so an expired IG signed URL
 * doesn't leave a broken-image box.
 */
export default function AvatarWithFallback({
  src,
  alt,
  fallbackText,
  size = 96,
}: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    <>
      {showImage ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          priority
        />
      ) : (
        <span className="text-white/90">{fallbackText}</span>
      )}
    </>
  );
}
