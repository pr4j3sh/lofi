import type { CSSProperties } from 'react';

interface ControlSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

export default function ControlSlider({ label, value, min, max, step, display, onChange }: ControlSliderProps) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <div className="control">
      <div className="control-header">
        <span>{label}</span>
        <span className="control-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--progress': `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </div>
  );
}
