import type { Preset } from '../../types';

interface PresetPickerProps {
  presets: Preset[];
  selected: string;
  onSelect: (id: string) => void;
}

export default function PresetPicker({ presets, selected, onSelect }: PresetPickerProps) {
  return (
    <div className="presets">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={`preset ${preset.id === selected ? 'selected' : ''}`}
          onClick={() => onSelect(preset.id)}
        >
          {preset.name}
        </button>
      ))}
    </div>
  );
}
