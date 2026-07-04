// Person-in-circle avatar mark.
//
// Purely presentational: a circle with a 1px border in the surface's muted
// color and the lucide UserRound figure inside, both drawn in currentColor so
// the caller's `color` sets the tone (Mist on the Midnight rail and header).
// Interactive states (hover lift, focus ring) belong to the wrapping trigger
// button — AccountMenu owns those — so this stays a plain mark.
//
// The inner icon is an implementation detail: to show a real user photo later,
// swap the <UserRound> for an <img> here and every call site stays unchanged.

import { UserRound } from "lucide-react";

export default function AvatarCircle({ size = 34, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        border: "1px solid currentColor",
        background: "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "inherit",
      }}
    >
      <UserRound size={Math.round(size * 0.55)} aria-hidden="true" />
    </span>
  );
}
