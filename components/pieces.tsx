import * as React from 'react';

export type PieceIconProps = React.SVGProps<SVGSVGElement> & { title?: string };

export const PawnIcon: React.FC<PieceIconProps> = (props) => {
  return (
    <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false" {...props}>
      <path d="M95.5,500l111.79-223.57c-31.3-15.67-52.79-48.04-52.79-85.43,0-52.74,42.76-95.5,95.5-95.5s95.5,42.76,95.5,95.5c0,37.39-21.49,69.76-52.79,85.43l111.79,223.57H95.5Z" fill="currentColor" />
    </svg>
  );
};

export const RookIcon: React.FC<PieceIconProps> = (props) => {
  return (
    <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false" {...props}>
      <polygon points="350.72 71.17 350.72 500 148.87 500 148.87 71.17 208.87 71.17 208.87 166.67 219.73 166.67 219.73 71.17 279.73 71.17 279.73 166.67 290.72 166.67 290.72 71.17 350.72 71.17" fill="currentColor" />
    </svg>
  );
};

export const KnightIcon: React.FC<PieceIconProps> = (props) => {
  return (
    <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false" {...props}>
      <path d="M95.5,500l101.46-202.91-77.39,46.16-65.33-77.85L182.33,117.07h.01c2.87-3.33,6.04-6.46,9.52-9.38l-21-25.03c2.28-.19,4.6-.29,6.93-.29,14.07,0,27.33,3.49,38.96,9.66,42.8-19.34,94.88-8.84,126.56,28.9,38.16,45.48,32.23,113.29-13.25,151.45-6.37,5.34-13.17,9.82-20.28,13.45l-21.9-42.98h-.01l-9.2,5.49,125.83,251.66H95.5Z" fill="currentColor" />
    </svg>
  );
};

export const BishopIcon: React.FC<PieceIconProps> = (props) => {
  return (
    <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false" {...props}>
      <path d="M95.5,500l127.35-254.71c-32.6-11.25-56.02-42.2-56.02-78.62,0-15.15,4.05-29.36,11.13-41.59L250,.34l72.04,124.74c7.08,12.23,11.13,26.44,11.13,41.59,0,36.42-23.42,67.37-56.02,78.62l127.35,254.71H95.5Z" fill="currentColor" />
    </svg>
  );
};

export const QueenIcon: React.FC<PieceIconProps> = (props) => {
  return (
    <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false" {...props}>
      <polygon points="165.4 159.2 131.2 .1 215.4 69.7 250 .7 284.4 69.5 368.5 .1 353.9 68.5 353.6 69.8 334.4 159.2 165.4 159.2" fill="currentColor" />
  <polygon points="404.5 500 95.5 500 165.1 174.2 334.4 174.2 404.5 500" fill="currentColor" />
    </svg>
  );
};

export const KingIcon: React.FC<PieceIconProps> = (props) => {
  return (
    <svg viewBox="0 0 500 500" aria-hidden="true" focusable="false" {...props}>
      <polygon points="220.6 166.67 220.6 113.5 163.95 113.5 163.95 53.5 220.6 53.5 220.6 -.43 280.6 -.43 280.6 53.5 336.05 53.5 336.05 113.5 280.6 113.5 280.6 166.67 332.8 166.67 404.5 500 95.5 500 166.67 166.67 220.6 166.67" fill="currentColor" />
    </svg>
  );
};

