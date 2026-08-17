import React from "react";

interface BtechMarkProps {
  color?: string;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const BtechMark = (props: BtechMarkProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="55 5 85 80"
      className={props.className}
      onClick={props.onClick}
      style={{ color: props.color || "currentColor", ...props.style }}
      fill="currentColor"
    >
      <path d="M87.8,48.5h0s0,0,0,.1c0,5.8,4.7,10.6,10.6,10.6s10.6-4.7,10.6-10.6-4.7-10.6-10.6-10.6h-5.9v-11.7h5.9c7.9,0,14.8,4.1,18.7,10.3l14.5-8.4c-.9-1.4-2.1-2.5-3.3-3.2l-24.6-14.2c-3-1.7-7.8-1.7-10.8,0l-3.1,1.8-2-4.9v40.9Z" />
      <path d="M132.6,29.9l-14.5,8.4c1.6,3.1,2.6,6.6,2.6,10.4,0,12.3-10,22.3-22.3,22.3s-14.9-4.2-18.9-10.4l-14.4,8.3c.9,1.4,2.1,2.5,3.3,3.2l24.6,14.2c3,1.7,7.8,1.7,10.8,0l24.6-14.2c3-1.7,5.4-5.9,5.4-9.4v-28.4c0-1.4-.4-3-1.2-4.5Z" />
      <path d="M76.1,48.7V16.6l-2.2,5.2-5.5,3.2c-3,1.7-5.4,5.9-5.4,9.4v28.4c0,1.4.4,3,1.2,4.5l14.4-8.3c-1.6-3.1-2.5-6.5-2.5-10.2Z" />
    </svg>
  );
};

export default BtechMark;
