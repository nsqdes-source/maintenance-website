"use client";

import { useEffect, useRef, useState } from "react";

type Position = {
  x: number;
  y: number;
};

export default function DraggableWhatsApp({
  href,
  iconUrl,
  label,
}: {
  href: string;
  iconUrl: string;
  label: string;
}) {
  const buttonRef = useRef<HTMLAnchorElement | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const pointerOffsetRef = useRef({ x: 0, y: 0 });

  const [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("whatsapp-floating-position");

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Position;

      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number"
      ) {
        setPosition(parsed);
      }
    } catch {
      // Ignore invalid stored values.
    }
  }, []);

  function clampPosition(x: number, y: number) {
    const button = buttonRef.current;

    if (!button) {
      return { x, y };
    }

    const rect = button.getBoundingClientRect();

    const maxX = Math.max(
      0,
      window.innerWidth - rect.width
    );

    const maxY = Math.max(
      0,
      window.innerHeight - rect.height
    );

    return {
      x: Math.min(Math.max(0, x), maxX),
      y: Math.min(Math.max(0, y), maxY),
    };
  }

  function handlePointerDown(
    event: React.PointerEvent<HTMLAnchorElement>
  ) {
    const button = buttonRef.current;

    if (!button) return;

    const rect = button.getBoundingClientRect();

    pointerOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    draggingRef.current = true;
    movedRef.current = false;

    button.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(
    event: React.PointerEvent<HTMLAnchorElement>
  ) {
    if (!draggingRef.current) return;

    const nextX =
      event.clientX - pointerOffsetRef.current.x;

    const nextY =
      event.clientY - pointerOffsetRef.current.y;

    const current = buttonRef.current?.getBoundingClientRect();

    if (current) {
      const distance =
        Math.abs(current.left - nextX) +
        Math.abs(current.top - nextY);

      if (distance > 4) {
        movedRef.current = true;
      }
    }

    setPosition(
      clampPosition(nextX, nextY)
    );
  }

  function handlePointerUp(
    event: React.PointerEvent<HTMLAnchorElement>
  ) {
    draggingRef.current = false;

    const button = buttonRef.current;

    if (button?.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    if (position) {
      sessionStorage.setItem(
        "whatsapp-floating-position",
        JSON.stringify(position)
      );
    }
  }

  function handleClick(
    event: React.MouseEvent<HTMLAnchorElement>
  ) {
    if (movedRef.current) {
      event.preventDefault();
      movedRef.current = false;
    }
  }

  return (
    <a
      ref={buttonRef}
      className="floatingWhatsApp draggableWhatsApp"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      style={
        position
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              right: "auto",
              bottom: "auto",
            }
          : undefined
      }
    >
      <img
        src={iconUrl}
        alt=""
        width="30"
        height="30"
        draggable={false}
        style={{
          display: "block",
          objectFit: "contain",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </a>
  );
}