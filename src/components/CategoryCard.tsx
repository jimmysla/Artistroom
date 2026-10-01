interface Props {
  label: string;
  description: string;
  icon: string;
  selected: boolean;
  wide?: boolean;
  onSelect: () => void;
}

export default function CategoryCard({ label, description, icon, selected, wide, onSelect }: Props) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`category-card ${selected ? "is-selected" : ""} ${wide ? "is-wide" : ""}`}
      onClick={onSelect}
    >
      <span className="category-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="category-label">{label}</span>
      <span className="category-desc">{description}</span>
      <span className="category-check" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
