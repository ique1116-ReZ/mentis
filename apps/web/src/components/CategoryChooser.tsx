import type { RehabConsultCategory } from "../types";

export function CategoryChooser({
  categories,
  onSelect,
}: {
  categories: RehabConsultCategory[];
  onSelect: (category: RehabConsultCategory) => void;
}) {
  return (
    <div className="category-entry">
      <div className="category-grid">
        {categories.map((category) => (
          <button
            className={category.enabled ? "category-card" : "category-card disabled"}
            disabled={!category.enabled}
            key={category.id}
            onClick={() => onSelect(category)}
            type="button"
          >
            <span className="category-mark">{category.mark}</span>
            <strong>{category.label}</strong>
            <small>{category.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
