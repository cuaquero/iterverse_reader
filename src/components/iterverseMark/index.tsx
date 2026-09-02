import React from "react";

interface IterverseMarkProps {
  // Only the bar recolors between light/dark surfaces (white on dark,
  // charcoal on light) - the ring stays brand red always, per
  // design-system/assets/iterverse/brand.md's mark-on-dark rule.
  barColor?: string;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const IterverseMark = (props: IterverseMarkProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 92 92"
      className={props.className}
      onClick={props.onClick}
      style={props.style}
      role="img"
      aria-label="Iterverse mark"
    >
      <polygon
        points="30,18 62,18 78,46 62,74 30,74 14,46"
        fill="none"
        stroke="var(--btech-red)"
        strokeWidth="11"
        strokeLinejoin="miter"
      />
      <rect x="41.5" y="31" width="9" height="30" fill={props.barColor || "var(--btech-gray)"} />
    </svg>
  );
};

export default IterverseMark;
