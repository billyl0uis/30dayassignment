import { useScene } from '../scene/store';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
}

/** A range input that records one undo step per drag, not one per pixel. */
export function Slider({ label, value, min, max, step, onChange }: Props) {
  const checkpoint = useScene((s) => s.checkpoint);
  const decimals = step >= 1 ? 0 : 2;
  return (
    <label className="slider">
      <span className="slider-row">
        <span>{label}</span>
        <output>{value.toFixed(decimals)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={checkpoint}
        onKeyDown={checkpoint}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
